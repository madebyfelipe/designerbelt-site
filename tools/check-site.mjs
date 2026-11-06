// Static checks for the pricing/legal pages. No dependencies: node tools/check-site.mjs [--allow-drafts]
// Fails while a [[MARKER]] is left in any page, so unapproved drafts cannot be published by mistake.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const allowDrafts = process.argv.includes('--allow-drafts');
const pages = { pricing: 'pricing.html', terms: 'terms.html', privacy: 'privacy.html', refunds: 'refunds.html', success: 'success.html' };
const read = (f) => readFileSync(join(root, f), 'utf8');
const errors = [];
const fail = (m) => errors.push(m);

const index = read('index.html');
const ids = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const route = (path) => (path === '/' ? 'index.html' : existsSync(join(root, path.slice(1))) ? path.slice(1) : existsSync(join(root, path.slice(1) + '.html')) ? path.slice(1) + '.html' : null);

for (const [slug, file] of Object.entries({ index: 'index.html', ...pages })) {
  const html = read(file);
  const text = html.replace(/<[^>]+>/g, ' ');
  if (!/<html lang="en">/.test(html)) fail(`${file}: missing lang`);
  if (!/<meta name="viewport"/.test(html)) fail(`${file}: missing viewport`);
  if (!/<title>[^<]+<\/title>/.test(html)) fail(`${file}: missing title`);
  if (!/<meta name="description" content="[^"]+"/.test(html)) fail(`${file}: missing description`);
  if (slug === 'index') {
    if ((html.match(/<h1[ >]/g) || []).length !== 1) fail('index.html: needs exactly one h1');
    if (!/<main id="content">/.test(html) || /class="skip" href="#content"/.test(html) === false) fail('index.html: missing main/skip link');
    // the home may load three local scripts (the mascot head, the drag section, the page glue); nothing else, and nothing remote
    const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
    const allowed = ['/mascot-head.js', '/drag-v3.js', '/home.js'];
    if (scripts.join(',') !== allowed.join(',')) fail(`index.html: scripts must be exactly ${allowed.join(', ')}, found ${scripts.join(', ') || 'none'}`);
    if (/<script(?![^>]*src=)/i.test(html)) fail('index.html: no inline scripts');
    const css = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((m) => m[1]);
    for (const sheet of css) if (!sheet.startsWith('/')) fail(`index.html: stylesheet must be local, found ${sheet}`);
  }
  if (slug !== 'index') {
    if ((html.match(/<h1[ >]/g) || []).length !== 1) fail(`${file}: needs exactly one h1`);
    if (!/<main id="content">/.test(html) || !/class="skip" href="#content"/.test(html)) fail(`${file}: missing main/skip link`);
    if (slug !== 'success' && !html.includes(`href="/${slug}" aria-current="page"`)) fail(`${file}: current page not marked in nav`);
    for (const l of ['/pricing', '/privacy', '/terms', '/refunds']) if (!html.includes(`href="${l}"`)) fail(`${file}: missing link ${l}`);
    // only the checkout glue, only where a purchase starts or ends; no inline script, nothing remote
    const scripts = [...html.matchAll(/<script[^>]*>/g)].map((m) => m[0]);
    const wantsCheckout = slug === 'pricing' || slug === 'success';
    if (wantsCheckout ? scripts.length !== 1 || !/src="\/checkout\.js"/.test(scripts[0]) : scripts.length) fail(`${file}: unexpected scripts ${scripts.join(' ')}`);
    if (/<script(?![^>]*src=)/i.test(html)) fail(`${file}: no inline scripts`);
    if (!allowDrafts && /\[\[[A-Z_]+\]\]/.test(html)) fail(`${file}: unresolved marker ${html.match(/\[\[[A-Z_]+\]\]/)[0]} (publish gate)`);
  }
  // claims that the app does not back: the Color Picker has HEX, RGB and HSL only
  if (/oklch/i.test(html)) fail(`${file}: mentions OKLCH, which the Color Picker does not support`);
  // no third-party resources: only same-origin assets, mailto, and the repo link already on the landing
  if (/github\.com/i.test(html)) fail(`${file}: links to GitHub, which must not appear on the site`);
  for (const m of html.matchAll(/\s(?:src|href)="([^"]+)"/g)) {
    const u = m[1];
    if (u.startsWith('mailto:') || u.startsWith('#')) continue;
    if (/^https?:/.test(u) && !/^https:\/\/designerbelt-site\.vercel\.app\//.test(u)) fail(`${file}: external reference ${u}`);
    if (u.startsWith('/')) {
      const [path, hash] = u.split('#');
      const target = route(path);
      if (!target) fail(`${file}: broken link ${u}`);
      else if (hash && !ids(read(target)).has(hash)) fail(`${file}: missing anchor ${u}`);
    }
  }
  if (slug === 'index') {
    if (/Pricing and release date to be announced|Prices are to be announced/.test(text)) fail('index.html: still says pricing is to be announced');
    if (!/US\$ 5/.test(text)) fail('index.html: the $5 license price is missing');
    if (!/Up to 3 devices/.test(text)) fail('index.html: the 3-device limit is missing');
    if (!/Price to be announced/.test(text)) fail('index.html: Cloud price must stay "to be announced"');
    if (/href="https?:\/\/[^"]*(paddle|checkout)/i.test(html) || /<a[^>]*>\s*Buy/i.test(text)) fail('index.html: checkout link exists but checkout does not');
    if (!/Not on sale yet/.test(text)) fail('index.html: the disabled license button is missing');
    if (!/class="db-head"/.test(html)) fail('index.html: the head mascot is not inlined');
    if (/dbm-belt|dbm-tail-pivot|dbm-body|dbm-head-look/.test(html)) fail('index.html: the mascot must be head only (v2)');
    if (!/dbh-eye/.test(html)) fail('index.html: the head mascot layers are missing');
    // the drag section: the visitor's own drag needs the canvas, the three files and a way back
    if (!/data-dv3/.test(html) || !/data-dv3-stage/.test(html)) fail('index.html: the drag section root is missing');
    if (!/data-canvas/.test(html)) fail('index.html: the canvas is missing');
    if ((html.match(/class="lb-card"/g) || []).length !== 3) fail('index.html: expected three draggable PNGs in the Library');
    if (!/data-layer="logo"/.test(html) || !/data-layer="photo"/.test(html) || !/data-layer="badge"/.test(html)) fail('index.html: the Layers panel lost its rows');
    if (!/role="status"/.test(html) || !/data-status/.test(html)) fail('index.html: the live status is missing');
    if (!/data-reset/.test(html) || !/Start over/.test(html)) fail('index.html: "Start over" is missing');
    if (!/acme-poster\.psd/.test(html)) fail('index.html: the editor document tab is missing');
    if (!/class="ed-layers"/.test(html)) fail('index.html: the Layers panel is missing');
    if (!/data-lib-client/.test(html) || !/data-lib-title/.test(html)) fail('index.html: the Library client switcher is missing');
    if (/adobe|photoshop|\bps\b/i.test(html)) fail('index.html: no Adobe/Photoshop name or mark may appear');
    if (!/id="drag"/.test(html)) fail('index.html: the drag demo is missing');
    // the tools showcase (card 4 of the cards series): copy plus the three drawn windows
    if (!/data-showcase/.test(html)) fail('index.html: the tools showcase card is missing');
    if (!/Pick, convert and preview/.test(text)) fail('index.html: the tools showcase lost its title');
    if ((html.match(/class="sc-win/g) || []).length !== 3) fail('index.html: the tools showcase needs its three windows');
    if (!/sc-pick/.test(html) || !/sc-conv/.test(html) || !/sc-view/.test(html)) fail('index.html: a tools showcase window is missing');
    if (!/data-clients/.test(html)) fail('index.html: the client library is missing');
    if (/Coming soon/.test(text) === false) fail('index.html: OpticAlign/FixedLink must be marked coming soon');
  }
}

const pricing = read('pricing.html');
if (!/<strong>\$5<\/strong>\s*<span>one time<\/span>/.test(pricing)) fail('pricing.html: $5 one time not shown');
if (!/Up to 3 devices per license/.test(pricing)) fail('pricing.html: 3-device limit not shown');
if (!/Price to be announced/.test(pricing)) fail('pricing.html: Cloud price must stay "to be announced"');
for (const banned of ['Cancel anytime', 'within the same major version', 'reply within', '\$3', '\$4']) if (new RegExp(banned, 'i').test(pricing + read('refunds.html'))) fail(`unapproved claim present: ${banned}`);

// Checkout only exists behind the server flag: the page ships "Not on sale yet", the buy button is hidden, and no
// Paddle request or link exists until /api/checkout-config says enabled.
if (!/<div data-sale-off>\s*<button class="btn" type="button" disabled[^>]*>Not on sale yet<\/button>/.test(pricing)) fail('pricing.html: the default state must be the disabled "Not on sale yet" button');
if (!/<div data-sale-on hidden>[\s\S]*?data-buy[\s\S]*?<\/div>/.test(pricing)) fail('pricing.html: the buy button must sit in a hidden container');
if ((pricing.match(/data-buy(?![-\w])/g) || []).length !== 1) fail('pricing.html: exactly one buy button expected');
if (/href="https?:\/\/[^"]*(paddle|checkout)/i.test(pricing) || /<a[^>]*>\s*Buy/i.test(pricing) || /paddle\.js|cdn\.paddle/i.test(pricing)) fail('pricing.html: checkout must not be linked or loaded from the HTML');
const glue = read('checkout.js');
if (glue.indexOf('config.enabled') < 0 || glue.indexOf('config.enabled') > glue.indexOf('cdn.paddle.com')) fail('checkout.js: Paddle.js must load only after the config says enabled');
if ([...glue.matchAll(/https?:\/\/[^'"`\s)]+/g)].some((m) => !m[0].startsWith('https://cdn.paddle.com/paddle/v2/paddle.js'))) fail('checkout.js: unexpected remote URL');
if (/(live|test)_[a-z0-9]{20,}/i.test(glue)) fail('checkout.js: a Paddle token is hardcoded; it must come from /api/checkout-config');
for (const f of ['api/activate.mjs', 'api/deactivate.mjs', 'api/license.mjs', 'api/paddle-webhook.mjs', 'api/checkout-config.mjs', 'api/_lib/core.mjs', 'api/_lib/store.mjs', 'api/_lib/ctx.mjs']) if (!existsSync(join(root, f))) fail(`${f} is missing`);
const ignore = read('.vercelignore');
for (const d of ['tools', 'tests']) if (!new RegExp(`^${d}[ ]*$`, 'm').test(ignore)) fail(`.vercelignore must exclude ${d}`);
// no secrets in the repo: webhook secrets, API keys, private keys
for (const f of ['checkout.js', 'pricing.html', 'success.html', 'README.md', ...['activate', 'deactivate', 'license', 'paddle-webhook', 'checkout-config'].map((n) => `api/${n}.mjs`), 'api/_lib/core.mjs', 'api/_lib/store.mjs', 'api/_lib/ctx.mjs', 'vercel.json', 'package.json']) {
  const t = read(f);
  if (/pdl_(live|sdbx)_(apikey|ntfset)_\w+/i.test(t) || /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(t)) fail(`${f}: contains a secret`);
}

if (errors.length) { console.error(errors.map((e) => 'FAIL ' + e).join('\n')); process.exit(1); }
console.log(`OK${allowDrafts ? ' (drafts allowed)' : ''}: ${Object.keys(pages).length} pages + landing + checkout gate`);
