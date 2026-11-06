// Layout check through Edge/Chrome DevTools: no horizontal overflow and readable text at common widths.
// node tools/check-layout.mjs <base-url> [screenshot-dir]   (needs Edge or Chrome and Node 22+)
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const base = process.argv[2] ?? 'http://localhost:4173';
const shots = process.argv[3];
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!exe) { console.error('No Edge/Chrome found'); process.exit(2); }
if (shots) mkdirSync(shots, { recursive: true });

const port = 9333;
const proc = spawn(exe, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'belt-layout-'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { await sleep(200); } }
if (!target) { proc.kill(); console.error('Browser did not start'); process.exit(2); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });

const widths = [360, 390, 768, 1024, 1440];
const paths = ['/', '/pricing', '/terms', '/privacy', '/refunds', '/success'];
const failures = [];
for (const w of widths) for (const p of paths) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 700 });
  await send('Page.navigate', { url: base + p });
  await sleep(700);
  const r = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => { const de = document.documentElement; const wide = [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => e.tagName + '.' + e.className).slice(0, 3); const small = [...document.querySelectorAll('main p, main li, main h2, footer *, .topbar a')].filter(e => e.childElementCount === 0 && e.textContent.trim() && parseFloat(getComputedStyle(e).fontSize) < 12).length; return { sw: de.scrollWidth, iw: innerWidth, wide, small, h1: document.querySelectorAll('h1').length }; })()` });
  const v = r.result.value;
  if (v.sw > v.iw || v.wide.length || v.small || v.h1 !== 1) failures.push(`${p} @${w}: ${JSON.stringify(v)}`);
  if (shots && [390, 1440].includes(w)) {
    const m = await send('Page.getLayoutMetrics');
    const h = Math.ceil(m.cssContentSize?.height ?? m.contentSize.height);
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
    const s = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(shots, `${p.slice(1)}-${w}.png`), Buffer.from(s.data, 'base64'));
  }
}
ws.close(); proc.kill();
if (failures.length) { console.error(failures.map((f) => 'FAIL ' + f).join('\n')); process.exit(1); }
console.log(`OK: ${paths.length} pages x ${widths.length} widths, no horizontal overflow, text >= 12px, one h1`);
