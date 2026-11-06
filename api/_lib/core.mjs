import { createHash, createHmac, createPrivateKey, randomInt, randomUUID, sign, timingSafeEqual } from 'node:crypto';

export const MAX_DEVICES = 3;
export const DEFAULT_PRICE_IDS = ['pri_01m6s00sy0fb1s86f2nfkhgphp']; // US$ 5 one-time, "Designer's Belt License"
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O, U
const KEY_RE = /^DBELT-[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/;
const TXN_RE = /^txn_[a-z0-9]{20,40}$/;
const MACHINE_RE = /^[0-9a-f]{32}$/;
const REVEAL_WINDOW_MS = 7 * 24 * 3600 * 1000;

export const json = (status, body, headers = {}) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
export const err = (status, error, message, extra = {}) => json(status, { error, message, ...extra });

export const generateKey = () => 'DBELT-' + [0, 1, 2, 3].map(() => Array.from({ length: 5 }, () => ALPHABET[randomInt(32)]).join('')).join('-');
export const normalizeKey = (raw) => {
  const flat = String(raw ?? '').toUpperCase().replace(/[\s-]/g, '');
  // confusable letters are fixed only in the body, never in the DBELT prefix
  const body = (flat.startsWith('DBELT') ? flat.slice(5) : flat).replace(/[IL]/g, '1').replace(/O/g, '0');
  if (body.length !== 20) return null;
  const key = 'DBELT-' + body.match(/.{5}/g).join('-');
  return KEY_RE.test(key) ? key : null;
};
export const keyId = (key) => createHash('sha256').update(key).digest('hex').slice(0, 16);

// ECDSA P-256 / SHA-256 with a fixed-size (r||s) signature: .NET verifies it natively (also in the Native AOT Host).
export function signReceipt(payload, privateKeyPem) {
  const bytes = Buffer.from(JSON.stringify(payload));
  const signature = sign('sha256', bytes, { key: createPrivateKey(privateKeyPem), dsaEncoding: 'ieee-p1363' });
  return { receipt: bytes.toString('base64url'), signature: signature.toString('base64url') };
}

export function verifyPaddleSignature(rawBody, header, secret, nowSec, toleranceSec = 300) {
  const parts = Object.fromEntries((header ?? '').split(';').map((p) => p.split('=')).filter((p) => p.length === 2));
  const ts = Number(parts.ts);
  if (!secret || !Number.isFinite(ts) || Math.abs(nowSec - ts) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest();
  // h1 may appear more than once while a secret is rotated
  return (header ?? '').split(';').some((p) => {
    if (!p.startsWith('h1=')) return false;
    const got = Buffer.from(p.slice(3), 'hex');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

const clientIp = (request) => (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
async function readJson(request, max = 4096) {
  const text = await request.text();
  if (text.length > max) return null;
  try { const v = JSON.parse(text); return v && typeof v === 'object' ? v : null; } catch { return null; }
}
const notReady = (ctx, needSigning = false) => (!ctx.store || (needSigning && !ctx.env.LICENSE_SIGNING_KEY)) ? err(503, 'not_configured', 'The license service is not configured yet.') : null;

export async function activate(request, ctx) {
  const off = notReady(ctx, true); if (off) return off;
  const body = await readJson(request);
  const key = normalizeKey(body?.key);
  if (!key) return err(400, 'invalid_key', 'That does not look like a Designer\'s Belt license key.');
  if (!MACHINE_RE.test(body.machine ?? '')) return err(400, 'invalid_machine', 'Missing device identifier.');
  const label = String(body.label ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 64) || 'Windows PC';
  if (!(await ctx.store.hit(`act:${clientIp(request)}`, 30, 3600)) || !(await ctx.store.hit(`actkey:${keyId(key)}`, 60, 3600))) return err(429, 'rate_limited', 'Too many attempts. Try again later.');
    const now = ctx.now();
  const result = await ctx.store.activate(key, body.machine, label, randomUUID(), now, MAX_DEVICES);
  if (result.error) return err(result.error === 'revoked' ? 403 : 404, result.error, 'License is unavailable or revoked.');
  if (!result.ok) return err(409, 'limit_reached', `This license is already active on ${MAX_DEVICES} devices. Remove one of them, then try again.`, { limit: MAX_DEVICES, devices: result.devices.map((d) => ({ id: d.id, label: d.label, activatedAt: d.at })) });
  const signed = signReceipt({ v: 1, product: 'designers-belt', k: keyId(key), activation: result.activation.id, machine: body.machine, issued: Math.floor(now / 1000), limit: MAX_DEVICES }, ctx.env.LICENSE_SIGNING_KEY);
  const current = await ctx.store.license(key);
  if (!current || current.revoked) return err(403, 'revoked', 'This license was revoked during activation.');
  if (!Object.values(current.devices ?? {}).some((d) => d.id === result.activation.id)) return err(409, 'activation_changed', 'Activation changed. Try again.');
  return json(200, { activation: result.activation.id, renewed: result.renewed, ...signed });
}

export async function deactivate(request, ctx) {
  const off = notReady(ctx); if (off) return off;
  const body = await readJson(request);
  const key = normalizeKey(body?.key);
  if (!key || typeof body.activation !== 'string' || body.activation.length > 64) return err(400, 'invalid_request', 'A license key and an activation id are required.');
  if (!(await ctx.store.hit(`deact:${clientIp(request)}`, 30, 3600))) return err(429, 'rate_limited', 'Too many attempts. Try again later.');
  if (!(await ctx.store.license(key))) return err(404, 'unknown_key', 'This license key was not found.');
  return (await ctx.store.deactivate(key, body.activation)) ? new Response(null, { status: 204 }) : err(404, 'unknown_activation', 'That device is not activated for this license.');
}

// The transaction ID is not authorization. Only the browser holding the checkout claim can reveal its key.
export async function licenseForTxn(request, ctx) {
  const off = notReady(ctx); if (off) return off;
  const txn = new URL(request.url).searchParams.get('txn') ?? '';
  if (!TXN_RE.test(txn)) return err(400, 'invalid_transaction', 'Missing or invalid transaction id.');
  if (!(await ctx.store.hit(`lookup:${clientIp(request)}`, 120, 3600))) return err(429, 'rate_limited', 'Too many attempts. Try again later.');
  const claim = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!claim) return err(403, 'unauthorized', 'Purchase claim required.');
  const license = await ctx.store.lookup(txn);
  if (license?.key && (!/^[a-f0-9]{64}$/.test(license.claimHash ?? '') || !timingSafeEqual(Buffer.from(license.claimHash, 'hex'), createHash('sha256').update(claim).digest()))) return err(403, 'unauthorized', 'Purchase claim does not match.');
  if (!license?.key) return json(202, { status: 'pending' });
  if (license.revoked) return json(200, { status: 'revoked' });
  if (ctx.now() - license.createdAt > REVEAL_WINDOW_MS) return json(200, { status: 'expired', message: 'For security the key is only shown for 7 days after purchase. Use the key from your purchase.' });
  return json(200, { status: 'ready', key: license.key, downloadUrl: ctx.env.DOWNLOAD_URL || null });
}

const priceIds = (env) => (env.PADDLE_PRICE_IDS ? env.PADDLE_PRICE_IDS.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_PRICE_IDS);

export async function paddleWebhook(request, ctx) {
  const off = notReady(ctx); if (off) return off;
  if (!ctx.env.PADDLE_WEBHOOK_SECRET) return err(503, 'not_configured', 'The webhook secret is not configured.');
  const raw = await request.text();
  if (!verifyPaddleSignature(raw, request.headers.get('paddle-signature'), ctx.env.PADDLE_WEBHOOK_SECRET, Math.floor(ctx.now() / 1000))) return err(400, 'bad_signature', 'Signature verification failed.');
  let event; try { event = JSON.parse(raw); } catch { return err(400, 'bad_json', 'Invalid body.'); }
  const type = event.event_type, data = event.data ?? {};
  if (type === 'transaction.completed') {
    const bought = (data.items ?? []).some((i) => priceIds(ctx.env).includes(i?.price?.id ?? i?.price_id));
    if (!bought || data.status !== 'completed' || typeof data.id !== 'string') return json(200, { ignored: true });
    const claimHash = data.custom_data?.claim_hash;
    if (!TXN_RE.test(data.id) || !/^[a-f0-9]{64}$/.test(claimHash ?? '')) return err(400, 'missing_claim', 'Checkout claim is missing.');
    const { created, error } = await ctx.store.createForTxn(data.id, generateKey(), ctx.now(), claimHash);
    if (error) return err(503, error, 'License issuance must be retried.');
    return json(200, { ok: true, created });
  }
  if ((type === 'adjustment.created' || type === 'adjustment.updated') && data.status === 'approved' && ['refund', 'chargeback'].includes(data.action) && (data.action === 'chargeback' || data.type !== 'partial')) {
    if (!TXN_RE.test(data.transaction_id ?? '')) return err(400, 'invalid_transaction', 'Invalid transaction.');
    const revoked = await ctx.store.revokeTxn(data.transaction_id, data.action, ctx.now());
    return json(200, { ok: true, revoked });
  }
  return json(200, { ignored: true });
}

export function checkoutConfig(ctx) {
  const e = ctx.env;
  // never offer a purchase the backend could not fulfil
  const ready = e.CHECKOUT_ENABLED === '1' && e.PADDLE_CLIENT_TOKEN && e.PADDLE_WEBHOOK_SECRET && e.LICENSE_SIGNING_KEY && ctx.store;
  if (!ready) return json(200, { enabled: false });
  return json(200, { enabled: true, environment: e.PADDLE_ENV === 'sandbox' ? 'sandbox' : 'production', token: e.PADDLE_CLIENT_TOKEN, priceId: priceIds(e)[0] });
}
