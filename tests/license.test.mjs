import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync, verify } from 'node:crypto';
import { activate, checkoutConfig, deactivate, generateKey, keyId, licenseForTxn, normalizeKey, paddleWebhook, verifyPaddleSignature } from '../api/_lib/core.mjs';
import { memoryStore, redisFromEnv } from '../api/_lib/store.mjs';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const SECRET = 'pdl_ntfset_test_secret';
const PRICE = 'pri_01m6s00sy0fb1s86f2nfkhgphp';
const TXN = 'txn_01k9ppwf885xk7azx0xgnp6kp1';
const T0 = Date.UTC(2026, 10, 7, 12, 0, 0);
const machine = (n) => n.toString(16).padStart(32, 'a'); // 32 hex chars, distinct per n

function setup(overrides = {}) {
  const clock = { t: T0 };
  const ctx = {
    env: { LICENSE_SIGNING_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }), PADDLE_WEBHOOK_SECRET: SECRET, PADDLE_CLIENT_TOKEN: 'test_abc', CHECKOUT_ENABLED: '1', PADDLE_ENV: 'sandbox', ...overrides },
    store: memoryStore(), now: () => clock.t,
  };
  return { ctx, clock };
}
const post = (body, headers = {}) => new Request('https://x.test/api', { method: 'POST', headers: { 'x-forwarded-for': '1.2.3.4', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const sign = (raw, ts, secret = SECRET) => `ts=${ts};h1=${createHmac('sha256', secret).update(`${ts}:${raw}`).digest('hex')}`;
const hook = (ctx, event, { ts = Math.floor(ctx.now() / 1000), secret = SECRET } = {}) => { const raw = JSON.stringify(event); return paddleWebhook(post(raw, { 'paddle-signature': sign(raw, ts, secret) }), ctx); };
const completed = (id = TXN, price = PRICE) => ({ event_type: 'transaction.completed', data: { id, status: 'completed', items: [{ price: { id: price } }] } });
const refund = (over = {}) => ({ event_type: 'adjustment.updated', data: { id: 'adj_1', transaction_id: TXN, action: 'refund', status: 'approved', type: 'full', ...over } });
const lookup = (ctx, txn = TXN) => licenseForTxn(new Request(`https://x.test/api/license?txn=${txn}`, { headers: { 'x-forwarded-for': '9.9.9.9' } }), ctx);
async function bought(ctx) { await hook(ctx, completed()); return (await (await lookup(ctx)).json()).key; }
const act = (ctx, key, n, extra = {}) => activate(post({ key, machine: machine(n), label: `PC ${n}`, ...extra }), ctx);

test('keys: format, alphabet, normalisation of what people type', () => {
  const key = generateKey();
  assert.match(key, /^DBELT-[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/);
  assert.notEqual(key, generateKey());
  assert.equal(normalizeKey(` ${key.toLowerCase().replaceAll('-', ' ')} `), key);
  assert.equal(normalizeKey('DBELT-0O0O0-1I1I1-1L1L1-00000'), 'DBELT-00000-11111-11111-00000');
  assert.equal(normalizeKey('DBELT-1234'), null);
  assert.equal(normalizeKey(undefined), null);
  assert.equal(normalizeKey('DBELT-UUUUU-UUUUU-UUUUU-UUUUU'), null); // U is not in the alphabet
});

test('webhook signature: valid, wrong secret, tampered body, stale, rotated secrets', () => {
  const raw = '{"a":1}', ts = 1_800_000_000, header = sign(raw, ts);
  assert.equal(verifyPaddleSignature(raw, header, SECRET, ts + 10), true);
  assert.equal(verifyPaddleSignature(raw, sign(raw, ts, 'other'), SECRET, ts), false);
  assert.equal(verifyPaddleSignature('{"a":2}', header, SECRET, ts), false);
  assert.equal(verifyPaddleSignature(raw, header, SECRET, ts + 301), false);
  assert.equal(verifyPaddleSignature(raw, `${header};h1=${'0'.repeat(64)}`, SECRET, ts), true);
  assert.equal(verifyPaddleSignature(raw, `ts=${ts};h1=${'0'.repeat(64)};h1=${header.split('h1=')[1]}`, SECRET, ts), true);
  assert.equal(verifyPaddleSignature(raw, 'garbage', SECRET, ts), false);
  assert.equal(verifyPaddleSignature(raw, null, SECRET, ts), false);
  assert.equal(verifyPaddleSignature(raw, header, '', ts), false);
});

test('webhook: bad signature is refused and creates nothing', async () => {
  const { ctx } = setup();
  const res = await hook(ctx, completed(), { secret: 'wrong' });
  assert.equal(res.status, 400);
  assert.equal((await lookup(ctx)).status, 202);
});

test('purchase: the key appears after the webhook, once, and only for our price', async () => {
  const { ctx } = setup();
  assert.equal((await lookup(ctx)).status, 202); // success page polls before the webhook lands
  assert.equal((await (await hook(ctx, completed(TXN, 'pri_other'))).json()).ignored, true);
  assert.equal((await lookup(ctx)).status, 202);
  assert.equal((await (await hook(ctx, completed())).json()).created, true);
  const first = await (await lookup(ctx)).json();
  assert.equal(first.status, 'ready'); assert.match(first.key, /^DBELT-/);
  assert.equal((await (await hook(ctx, completed())).json()).created, false); // Paddle retries deliver the same event again
  assert.equal((await (await lookup(ctx)).json()).key, first.key);
  assert.equal((await lookup(ctx, 'txn_notreal')).status, 400);
});

test('purchase: key is only shown for 7 days', async () => {
  const { ctx, clock } = setup();
  await bought(ctx);
  clock.t += 7 * 24 * 3600 * 1000 + 1;
  assert.equal((await (await lookup(ctx)).json()).status, 'expired');
});

test('devices: three activate, the fourth is refused with the device list, re-activation is free', async () => {
  const { ctx } = setup();
  const key = await bought(ctx);
  const ids = [];
  for (const n of [1, 2, 3]) { const r = await act(ctx, key, n); assert.equal(r.status, 200); ids.push((await r.json()).activation); }
  const again = await (await act(ctx, key, 1)).json();
  assert.equal(again.renewed, true); assert.equal(again.activation, ids[0]); // same PC, same activation, no slot used
  const fourth = await act(ctx, key, 4);
  assert.equal(fourth.status, 409);
  const body = await fourth.json();
  assert.equal(body.error, 'limit_reached'); assert.equal(body.devices.length, 3);
  assert.deepEqual(body.devices.map((d) => d.label).sort(), ['PC 1', 'PC 2', 'PC 3']);
  assert.equal((await act(ctx, key, 1)).status, 200); // the refused attempt did not evict anyone
  // lost PC: free a slot from another machine, then the new PC fits
  const del = await deactivate(post({ key, activation: ids[1] }), ctx);
  assert.equal(del.status, 204);
  assert.equal((await act(ctx, key, 4)).status, 200);
  assert.equal((await deactivate(post({ key, activation: ids[1] }), ctx)).status, 404);
});

test('devices: a burst of new machines never gets more than three receipts', async () => {
  const { ctx } = setup();
  const key = await bought(ctx);
  const results = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map((n) => act(ctx, key, n)));
  assert.ok(results.filter((r) => r.status === 200).length <= 3);
  assert.ok((await ctx.store.devices(key)).length <= 3);
});

test('receipt: signed, verifiable with the public key, bound to key and machine', async () => {
  const { ctx, clock } = setup();
  const key = await bought(ctx);
  const body = await (await act(ctx, key, 1)).json();
  const bytes = Buffer.from(body.receipt, 'base64url');
  assert.equal(verify('sha256', bytes, { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(body.signature, 'base64url')), true);
  bytes[bytes.length - 3] ^= 1; // any edit breaks it
  assert.equal(verify('sha256', bytes, { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(body.signature, 'base64url')), false);
  const payload = JSON.parse(Buffer.from(body.receipt, 'base64url'));
  assert.deepEqual(payload, { v: 1, product: 'designers-belt', k: keyId(key), activation: body.activation, machine: machine(1), issued: Math.floor(clock.t / 1000), limit: 3 });
});

test('refund or chargeback revokes: activation refused, lookup says revoked; partial and pending do not', async () => {
  const { ctx } = setup();
  const key = await bought(ctx);
  assert.equal((await act(ctx, key, 1)).status, 200);
  await hook(ctx, refund({ type: 'partial' }));
  await hook(ctx, refund({ status: 'pending_approval' }));
  await hook(ctx, refund({ action: 'credit' }));
  assert.equal((await act(ctx, key, 1)).status, 200);
  assert.equal((await (await hook(ctx, refund())).json()).revoked, true);
  const res = await act(ctx, key, 1);
  assert.equal(res.status, 403); assert.equal((await res.json()).error, 'revoked');
  assert.equal((await (await lookup(ctx)).json()).status, 'revoked');
  const chargeback = setup(); const k2 = await bought(chargeback.ctx);
  await hook(chargeback.ctx, { event_type: 'adjustment.created', data: { transaction_id: TXN, action: 'chargeback', status: 'approved', type: 'partial' } });
  assert.equal((await act(chargeback.ctx, k2, 1)).status, 403);
});

test('bad input and unknown keys', async () => {
  const { ctx } = setup();
  const key = await bought(ctx);
  assert.equal((await activate(post({ key: 'nope', machine: machine(1) }), ctx)).status, 400);
  assert.equal((await activate(post({ key, machine: 'short' }), ctx)).status, 400);
  assert.equal((await activate(post('not json'), ctx)).status, 400);
  assert.equal((await activate(post({ key, machine: machine(1), pad: 'x'.repeat(5000) }), ctx)).status, 400);
  assert.equal((await act(ctx, generateKey(), 1)).status, 404);
  assert.equal((await deactivate(post({ key }), ctx)).status, 400);
});

test('rate limit on activation', async () => {
  const { ctx } = setup();
  const key = await bought(ctx);
  let last; for (let i = 0; i < 31; i++) last = await act(ctx, key, 1);
  assert.equal(last.status, 429);
});

test('not configured: the service says so instead of pretending', async () => {
  const none = { env: {}, store: null, now: () => T0 };
  assert.equal((await activate(post({}), none)).status, 503);
  assert.equal((await paddleWebhook(post('{}'), none)).status, 503);
  assert.equal((await lookup(none)).status, 503);
  const noSigning = { ...setup().ctx, env: { PADDLE_WEBHOOK_SECRET: SECRET } };
  assert.equal((await activate(post({}), noSigning)).status, 503);
});

test('checkout config: off unless the flag AND the whole backend are present', async () => {
  const full = setup().ctx;
  const read = async (c) => (await checkoutConfig(c)).json();
  assert.deepEqual(await read(full), { enabled: true, environment: 'sandbox', token: 'test_abc', priceId: PRICE });
  assert.deepEqual(await read(setup({ CHECKOUT_ENABLED: undefined }).ctx), { enabled: false });
  assert.deepEqual(await read(setup({ CHECKOUT_ENABLED: '0' }).ctx), { enabled: false });
  assert.deepEqual(await read(setup({ PADDLE_CLIENT_TOKEN: '' }).ctx), { enabled: false });
  assert.deepEqual(await read(setup({ PADDLE_WEBHOOK_SECRET: '' }).ctx), { enabled: false });
  assert.deepEqual(await read(setup({ LICENSE_SIGNING_KEY: '' }).ctx), { enabled: false });
  assert.deepEqual(await read({ ...full, store: null }), { enabled: false });
  assert.deepEqual(await read({ env: {}, store: null, now: Date.now }), { enabled: false });
});

test('storage from env: Upstash REST names and the Vercel Marketplace names both work, none means no store', async () => {
  assert.equal(redisFromEnv({}), null);
  const calls = [];
  const fake = async (url, init) => { calls.push({ url, auth: init.headers.authorization, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ result: 'OK' })); };
  for (const env of [{ UPSTASH_REDIS_REST_URL: 'https://r.test', UPSTASH_REDIS_REST_TOKEN: 't1' }, { KV_REST_API_URL: 'https://r.test', KV_REST_API_TOKEN: 't1' }]) {
    const store = redisFromEnv(env, fake);
    assert.equal((await store.createForTxn('txn_a', 'K', 1)).created, true);
  }
  assert.deepEqual(calls[0], { url: 'https://r.test', auth: 'Bearer t1', body: ['SET', 'txn:txn_a', 'K', 'NX'] });
  const failing = redisFromEnv({ KV_REST_API_URL: 'https://r.test', KV_REST_API_TOKEN: 't' }, async () => new Response(JSON.stringify({ error: 'boom' }), { status: 500 }));
  await assert.rejects(failing.license('K'));
});
