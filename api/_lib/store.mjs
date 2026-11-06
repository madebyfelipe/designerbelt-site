// No production storage existed before this v2 schema. Existing desktop credentials are unrelated and untouched.
export const redisFromEnv = (env, fetchImpl = fetch) => {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return redisStore(async (...args) => {
    const response = await fetchImpl(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(args.map(String)) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.error) throw new Error(`redis ${args[0]} failed`);
    return body.result;
  });
};

export const STATE_SCRIPT = String.raw`
-- One hash, one final HSET per mutation: runtime errors before the write cannot leave half an issuance.
local op, ref = ARGV[1], ARGV[2]
local field = 'txn:' .. ref
if op ~= 'create' and op ~= 'revoke' and op ~= 'lookup' then
  local txn = redis.call('HGET', KEYS[1], 'key:' .. ref)
  if not txn then
    if op == 'license' then return 'null' end
    if op == 'deactivate' then return 'false' end
    return cjson.encode({error='unknown_key'})
  end
  field = 'txn:' .. txn
end
local raw = redis.call('HGET', KEYS[1], field)
local r = raw and cjson.decode(raw) or nil
if op == 'lookup' or op == 'license' then return raw or 'null' end
if op == 'create' then
  if r and r.key then return cjson.encode({key=r.key, created=false}) end
  if redis.call('HEXISTS', KEYS[1], 'key:' .. ARGV[3]) == 1 then return cjson.encode({error='key_collision'}) end
  r = r or {txn=ref, revoked=false}
  r.key, r.createdAt, r.claimHash = ARGV[3], tonumber(ARGV[4]), ARGV[5]
  r.devices = {}
  local encoded = cjson.encode(r)
  redis.call('HSET', KEYS[1], field, encoded, 'key:' .. r.key, ref)
  return cjson.encode({key=r.key, created=true})
elseif op == 'revoke' then
  r = r or {txn=ref}
  r.revoked, r.reason, r.revokedAt, r.devices = true, ARGV[3], tonumber(ARGV[4]), {}
elseif op == 'activate' then
  if not r then return cjson.encode({error='unknown_key'}) end
  if r.revoked then return cjson.encode({error='revoked'}) end
  local machine, label, id, now, limit = ARGV[3], ARGV[4], ARGV[5], tonumber(ARGV[6]), tonumber(ARGV[7])
  r.devices = r.devices or {}
  if r.devices[machine] then return cjson.encode({ok=true, activation=r.devices[machine], renewed=true}) end
  local count, devices = 0, {}
  for m,d in pairs(r.devices) do count=count+1; table.insert(devices, {machine=m,id=d.id,label=d.label,at=d.at}) end
  if count >= limit then return cjson.encode({ok=false, devices=devices}) end
  r.devices[machine] = {id=id,label=label,at=now}
  local encoded = cjson.encode(r)
  redis.call('HSET', KEYS[1], field, encoded)
  return cjson.encode({ok=true, activation=r.devices[machine], renewed=false})
elseif op == 'deactivate' then
  if not r then return 'false' end
  local found = false
  for m,d in pairs(r.devices or {}) do if d.id == ARGV[3] then r.devices[m]=nil; found=true; break end end
  if not found then return 'false' end
else return redis.error_reply('unknown license operation') end
local encoded = cjson.encode(r)
redis.call('HSET', KEYS[1], field, encoded)
return 'true'
`;

// shortcut: one hash fits initial license volume; partition before large customer counts need independent scaling.
const STATE = '{belt-licenses}:v2';
export function redisStore(cmd) {
  const run = async (op, ...args) => JSON.parse(await cmd('EVAL', STATE_SCRIPT, 1, STATE, op, ...args));
  return {
    createForTxn: (txn, key, now, claimHash) => run('create', txn, key, now, claimHash),
    lookup: (txn) => run('lookup', txn),
    license: (key) => run('license', key),
    revokeTxn: (txn, reason, now) => run('revoke', txn, reason, now),
    activate: (key, machine, label, id, now, limit) => run('activate', key, machine, label, id, now, limit),
    deactivate: (key, id) => run('deactivate', key, id),
    async devices(key) { const r = await run('license', key); return Object.entries(r?.devices ?? {}).map(([machine, d]) => ({ machine, ...d })); },
    async hit(bucket, max, windowSec) {
      const n = await cmd('EVAL', "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n", 1, `rl:${bucket}`, windowSec);
      return n <= max;
    },
  };
}

// Local reference model; tests/check-lua.py also executes STATE_SCRIPT itself, including lost replies.
export function memoryCommands() {
  const txns = new Map(), keys = new Map(), counters = new Map();
  return async (command, script, count, state, op, ref, ...a) => {
    if (command !== 'EVAL') throw new Error('Expected atomic EVAL');
    if (script !== STATE_SCRIPT) { const n = (counters.get(state) ?? 0) + 1; counters.set(state, n); return n; }
    const txn = ['create', 'revoke', 'lookup'].includes(op) ? ref : keys.get(ref);
    let r = txns.get(txn);
    const result = (v) => JSON.stringify(v);
    if (op === 'lookup' || op === 'license') return result(r ?? null);
    if (op === 'create') {
      if (r?.key) return result({ key: r.key, created: false });
      if (keys.has(a[0])) return result({ error: 'key_collision' });
      r = { ...r, txn, revoked: r?.revoked ?? false, key: a[0], createdAt: Number(a[1]), claimHash: a[2], devices: {} };
      keys.set(r.key, txn); txns.set(txn, r); return result({ key: r.key, created: true });
    }
    if (op === 'revoke') { txns.set(txn, { ...r, txn, revoked: true, reason: a[0], revokedAt: Number(a[1]), devices: {} }); return 'true'; }
    if (!r) return op === 'deactivate' ? 'false' : result({ error: 'unknown_key' });
    if (op === 'activate') {
      if (r.revoked) return result({ error: 'revoked' });
      const [machine, label, id, now, limit] = a;
      if (r.devices[machine]) return result({ ok: true, activation: r.devices[machine], renewed: true });
      const devices = Object.entries(r.devices).map(([machine, d]) => ({ machine, ...d }));
      if (devices.length >= limit) return result({ ok: false, devices });
      const activation = { id, label, at: Number(now) }; r.devices[machine] = activation;
      return result({ ok: true, activation, renewed: false });
    }
    if (op === 'deactivate') { const entry = Object.entries(r.devices).find(([, d]) => d.id === a[0]); if (!entry) return 'false'; delete r.devices[entry[0]]; return 'true'; }
    throw new Error('Unknown operation');
  };
}
export const memoryStore = () => redisStore(memoryCommands());
