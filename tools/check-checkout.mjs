// End-to-end check of the purchase flow in a real browser (Edge/Chrome via DevTools), against the REAL api handlers on a
// memory store. Paddle.js itself is replaced by a stub that records its calls: what this proves is our side (flag, button,
// webhook -> key -> success page -> activation), not Paddle's checkout. node tools/check-checkout.mjs
import { spawn } from 'node:child_process';
import { createHmac, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { start } from './dev-server.mjs';

const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!exe) { console.error('No Edge/Chrome found'); process.exit(2); }
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const SECRET = 'whsec_check_only';
const baseEnv = { LICENSE_SIGNING_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }), PADDLE_WEBHOOK_SECRET: SECRET, PADDLE_CLIENT_TOKEN: 'test_checkonlytoken', PADDLE_ENV: 'sandbox' };
const failures = [];
const expect = (cond, msg) => { if (!cond) failures.push(msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STUB = `window.__p = { calls: [] };
window.Paddle = { Environment: { set: (e) => __p.calls.push(['env', e]) }, Initialize: (o) => { __p.init = o; __p.calls.push(['init', o.token]); },
  Checkout: { open: (o) => { __p.opened = o; __p.calls.push(['open', JSON.stringify(o)]); }, close: () => __p.calls.push(['close']) } };`;

const proc = spawn(exe, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9335', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'belt-co-'))}`, 'about:blank'], { stdio: 'ignore' });
let target; for (let i = 0; i < 50 && !target; i++) { try { target = (await (await fetch('http://127.0.0.1:9335/json')).json()).find((t) => t.type === 'page'); } catch { await sleep(200); } }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map(); const paddleRequests = [];
ws.addEventListener('message', async (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result ?? m); pend.delete(m.id); }
  if (m.method === 'Fetch.requestPaused') {
    paddleRequests.push(m.params.request.url);
    send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'text/javascript' }], body: Buffer.from(STUB).toString('base64') });
  }
});
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pend.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
const evalIn = async (expression) => (await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression })).result?.value;
const go = async (url) => { await send('Page.navigate', { url }); await sleep(900); };
const waitFor = async (expression, ms = 12000) => { for (let t = 0; t < ms; t += 250) { if (await evalIn(expression)) return true; await sleep(250); } return false; };
await send('Page.enable'); await send('Runtime.enable');
await send('Fetch.enable', { patterns: [{ urlPattern: 'https://cdn.paddle.com/*' }] });

const webhook = (url, event) => { const raw = JSON.stringify(event); const ts = Math.floor(Date.now() / 1000); return fetch(url + '/api/paddle-webhook', { method: 'POST', body: raw, headers: { 'paddle-signature': `ts=${ts};h1=${createHmac('sha256', SECRET).update(`${ts}:${raw}`).digest('hex')}` } }); };

// 1. flag off: the page stays "Not on sale yet" and never talks to Paddle
let app = await start({ env: { ...baseEnv }, port: 4181 });
await go(app.url + '/pricing'); await sleep(800);
expect(await evalIn('document.querySelector("[data-sale-on]").hidden'), 'flag off: the buy container must stay hidden');
expect(await evalIn('!document.querySelector("[data-sale-off]").hidden'), 'flag off: "Not on sale yet" must stay visible');
expect(paddleRequests.length === 0, 'flag off: the page requested Paddle.js');
expect((await (await fetch(app.url + '/api/checkout-config')).json()).enabled === false, 'flag off: config must say disabled');
app.server.close();

// 2. the flag alone is not enough: no storage, no sale
app = await start({ env: { ...baseEnv, CHECKOUT_ENABLED: '1' }, port: 4182 });
app.ctx.store = null;
expect((await (await fetch(app.url + '/api/checkout-config')).json()).enabled === false, 'flag on without storage: config must say disabled');
app.server.close();

// 3. flag on: button, Paddle init, purchase, webhook, success page, activation
app = await start({ env: { ...baseEnv, CHECKOUT_ENABLED: '1' }, port: 4183 });
await go(app.url + '/pricing');
expect(await waitFor('document.querySelector("[data-sale-on]") && !document.querySelector("[data-sale-on]").hidden'), 'flag on: the buy button never appeared');
expect(await evalIn('document.querySelector("[data-sale-off]").hidden'), 'flag on: "Not on sale yet" must be hidden');
expect(paddleRequests.length === 1 && paddleRequests[0] === 'https://cdn.paddle.com/paddle/v2/paddle.js', 'flag on: Paddle.js must be requested once from the Paddle CDN');
expect((await evalIn('JSON.stringify(__p.calls.slice(0, 2))')) === '[["env","sandbox"],["init","test_checkonlytoken"]]', 'flag on: sandbox environment and client token not passed to Paddle.js');
await evalIn('document.querySelector("[data-buy]").click()');
const opened = JSON.parse((await evalIn('JSON.stringify(__p.opened ?? null)')) ?? 'null');
expect(opened?.items?.[0]?.priceId === 'pri_01m6s00sy0fb1s86f2nfkhgphp' && opened.items[0].quantity === 1, 'Checkout.open must use the US$ 5 price');
const TXN = 'txn_01k9ppwf885xk7azx0xgnp6kp1';
await evalIn(`__p.init.eventCallback({ name: 'checkout.completed', data: { transaction_id: '${TXN}' } })`);
expect(await waitFor('location.pathname === "/success"'), 'checkout.completed must send the buyer to /success');
expect((await evalIn('location.search')) === `?txn=${TXN}`, 'the success URL must carry the transaction id');
await sleep(600);
expect((await evalIn('document.querySelector("[data-state]").textContent')).includes('Confirming'), 'success page: must wait for the webhook');
expect(await evalIn('document.querySelector("[data-ready]").hidden'), 'success page: the key must not show before the webhook');
await webhook(app.url, { event_type: 'transaction.completed', data: { id: TXN, status: 'completed', items: [{ price: { id: 'pri_01m6s00sy0fb1s86f2nfkhgphp' } }] } });
expect(await waitFor('!document.querySelector("[data-ready]").hidden'), 'success page: the key never appeared after the webhook');
const key = await evalIn('document.querySelector("[data-key]").textContent');
expect(/^DBELT-[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/.test(key), `success page: unexpected key ${key}`);
expect((await evalIn('document.querySelector("[data-no-download]").hidden')) === false, 'success page: must say the installer is not available yet (no DOWNLOAD_URL)');
const act = (n) => fetch(app.url + '/api/activate', { method: 'POST', body: JSON.stringify({ key, machine: n.toString(16).padStart(32, 'a'), label: `PC ${n}` }) });
expect((await Promise.all([1, 2, 3].map(act))).every((r) => r.status === 200), 'the key must activate on three devices');
expect((await act(4)).status === 409, 'the fourth device must be refused');
await webhook(app.url, { event_type: 'adjustment.updated', data: { transaction_id: TXN, action: 'refund', status: 'approved', type: 'full' } });
expect((await act(1)).status === 403, 'after a refund the key must stop activating');
await go(app.url + `/success?txn=${TXN}`); await sleep(1200);
expect((await evalIn('document.querySelector("[data-state]").textContent')).includes('refunded'), 'success page: a refunded purchase must say so');

// 4. success page edge cases and layout
await go(app.url + '/success'); await sleep(500);
expect((await evalIn('document.querySelector("[data-state]").textContent')).includes('no purchase'), 'success page without a txn must not poll or show anything');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
for (const p of ['/pricing', `/success?txn=${TXN}`]) { await go(app.url + p); await sleep(800); expect((await evalIn('document.documentElement.scrollWidth')) <= 390, `${p}: horizontal overflow at 390 px`); }

ws.close(); proc.kill(); app.server.close();
if (failures.length) { console.error(failures.map((f) => 'FAIL ' + f).join('\n')); process.exit(1); }
console.log('OK: flag off stays off, flag on sells (stubbed Paddle.js), webhook -> key -> success page -> 3 devices -> refund revokes');
