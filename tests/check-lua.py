"""Run the production Lua with a deterministic Redis hash double (requires test-only lupa).
No external Redis/account is contacted. This checks Lua execution, not Upstash compatibility.
"""
import json, re
from pathlib import Path
from lupa import LuaRuntime
script = re.search(r'STATE_SCRIPT = String.raw`(.*?)`;', Path('api/_lib/store.mjs').read_text(), re.S)[1]
lua = LuaRuntime(unpack_returned_tuples=True)
state = {}
fail_write = False

def call(op, key, *args):
    global fail_write
    if op == 'HGET': return state.get(args[0])
    if op == 'HEXISTS': return int(args[0] in state)
    assert op == 'HSET', op
    if fail_write:
        fail_write = False
        raise RuntimeError('simulated rejected write')
    # A Redis HSET with multiple fields commits as one command.
    state.update(dict(zip(args[0::2], args[1::2])))
    return 1

lua.globals().redis = lua.table_from({'call': call, 'error_reply': lambda e: (_ for _ in ()).throw(RuntimeError(e))})
lua.globals().cjson = lua.table_from({'decode': lambda s: lua.table_from(json.loads(s), recursive=True), 'encode': None})
def plain(v):
    if hasattr(v, 'items'):
        d = {k: plain(x) for k, x in v.items()}
        if d and all(isinstance(k, int) for k in d): return [d[i] for i in range(1, len(d)+1)]
        return d
    return v
lua.globals().cjson.encode = lambda v: json.dumps(plain(v))
def run(op, *args):
    lua.globals().KEYS = lua.table_from(['{belt-licenses}:v2'])
    lua.globals().ARGV = lua.table_from([op, *map(str, args)])
    return json.loads(lua.execute(script))

# Failure before the single write leaves neither mapping nor license; retry repairs without a new alias.
fail_write = True
try: run('create','txn1','key1',100,'claim')
except RuntimeError: pass
else: raise AssertionError('write failure not injected')
assert state == {}
assert run('create','txn1','key1',100,'claim')['created']
# Lost HTTP reply: execute again with a different candidate key. Only the first survives.
for i in range(20): assert run('create','txn1','other'+str(i),100,'claim') == {'key':'key1','created':False}
assert len([k for k in state if k.startswith('key:')]) == 1
# Serial orders of concurrent operations: Redis EVAL linearizes each complete script.
for i in range(12): assert run('activate','key1','m'+str(i),'PC','id'+str(i),100,3).get('ok',False) == (i < 3)
assert run('activate','key1','m0','PC','ignored',100,3)['activation']['id'] == 'id0'
assert run('deactivate','key1','id1')
assert run('activate','key1','m4','PC','id4',100,3)['ok']
assert run('revoke','txn1','refund',101)
for i in range(12): assert run('activate','key1','m'+str(i),'PC','id',102,3)['error'] == 'revoked'
assert not run('create','txn1','replay',103,'newclaim')['created']
assert run('license','key1')['revoked']
# Both possible orderings of refund/completed, including retries, yield a permanently revoked record.
assert run('revoke','txn2','refund',99)
assert run('create','txn2','key2',100,'claim')['created']
assert run('activate','key2','m','PC','id',100,3)['error'] == 'revoked'
assert run('lookup','txn2')['revoked']
assert run('license','unknown') is None
print('OK: production Lua: atomic write failure, lost reply, idempotency, 3-device limit, refund ordering and replay')
