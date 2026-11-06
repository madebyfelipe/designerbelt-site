// License storage. Two implementations behind one interface:
//  - redisStore: any Redis reachable over the Upstash REST protocol (the Vercel Marketplace Redis integrations use it);
//  - memoryStore: tests and local runs.
// The 3-device limit is enforced without Lua or transactions: HSETNX the device, HLEN, and roll the insert back when the
// count went over. Concurrent 4th activations can both be refused, but nobody ever receives a receipt past the limit.

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

const parse = (value) => (value ? JSON.parse(value) : null);

export function redisStore(cmd) {
  return {
    async createForTxn(txn, key, now) {
      // the txn marker decides who wins when Paddle delivers the same event twice
      const won = await cmd('SET', `txn:${txn}`, key, 'NX');
      if (won !== 'OK') return { key: await cmd('GET', `txn:${txn}`), created: false };
      await cmd('SET', `lic:${key}`, JSON.stringify({ key, txn, createdAt: now, revoked: false }));
      return { key, created: true };
    },
    async keyForTxn(txn) { return cmd('GET', `txn:${txn}`); },
    async license(key) { return parse(await cmd('GET', `lic:${key}`)); },
    async revokeTxn(txn, reason, now) {
      const key = await cmd('GET', `txn:${txn}`);
      const lic = key && parse(await cmd('GET', `lic:${key}`));
      if (!lic) return false;
      await cmd('SET', `lic:${key}`, JSON.stringify({ ...lic, revoked: true, revokedAt: now, reason }));
      return true;
    },
    async activate(key, machine, label, id, now, limit) {
      const field = JSON.stringify({ id, label, at: now });
      const inserted = await cmd('HSETNX', `acts:${key}`, machine, field);
      if (inserted === 0) return { ok: true, activation: parse(await cmd('HGET', `acts:${key}`, machine)), renewed: true };
      if ((await cmd('HLEN', `acts:${key}`)) > limit) {
        await cmd('HDEL', `acts:${key}`, machine);
        return { ok: false, devices: await this.devices(key) };
      }
      return { ok: true, activation: { id, label, at: now }, renewed: false };
    },
    async devices(key) {
      const flat = (await cmd('HGETALL', `acts:${key}`)) ?? [];
      const out = [];
      for (let i = 0; i < flat.length; i += 2) out.push({ machine: flat[i], ...parse(flat[i + 1]) });
      return out;
    },
    async deactivate(key, activationId) {
      const hit = (await this.devices(key)).find((d) => d.id === activationId);
      if (!hit) return false;
      await cmd('HDEL', `acts:${key}`, hit.machine);
      return true;
    },
    async hit(bucket, max, windowSec) {
      const n = await cmd('INCR', `rl:${bucket}`);
      if (n === 1) await cmd('EXPIRE', `rl:${bucket}`, windowSec);
      return n <= max;
    },
  };
}

// A tiny Redis emulator with exactly the commands the store uses; also what the tests run against.
export function memoryCommands() {
  const kv = new Map();
  const hashes = new Map();
  const counters = new Map();
  return async (op, ...a) => {
    switch (op) {
      case 'GET': return kv.get(a[0]) ?? null;
      case 'SET': if (a[2] === 'NX' && kv.has(a[0])) return null; kv.set(a[0], a[1]); return 'OK';
      case 'HSETNX': { const h = hashes.get(a[0]) ?? new Map(); hashes.set(a[0], h); if (h.has(a[1])) return 0; h.set(a[1], a[2]); return 1; }
      case 'HGET': return hashes.get(a[0])?.get(a[1]) ?? null;
      case 'HLEN': return hashes.get(a[0])?.size ?? 0;
      case 'HDEL': return hashes.get(a[0])?.delete(a[1]) ? 1 : 0;
      case 'HGETALL': return [...(hashes.get(a[0]) ?? new Map())].flat();
      case 'INCR': { const n = (counters.get(a[0]) ?? 0) + 1; counters.set(a[0], n); return n; }
      case 'EXPIRE': return 1;
      default: throw new Error(`unsupported ${op}`);
    }
  };
}
export const memoryStore = () => redisStore(memoryCommands());
