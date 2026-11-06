// Static checks for the pricing/legal pages. No dependencies: node tools/check-site.mjs [--allow-drafts]
// Fails while a [[MARKER]] is left in any page, so unapproved drafts cannot be published by mistake.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const allowDrafts = process.argv.includes('--allow-drafts');
const pages = { pricing: 'pricing.html', terms: 'terms.html', privacy: 'privacy.html', refunds: 'refunds.html' };
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
    // the home may load one local script (the mascot and the drag demo); nothing else, and nothing remote
    const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
    const allowed = ['/mascot-head.js', '/drag-autoplay.js', '/home.js'];
    if (scripts.join(',') !== allowed.join(',')) fail(`index.html: scripts must be exactly ${allowed.join(', ')}, found ${scripts.join(', ') || 'none'}`);
    if (/<script(?![^>]*src=)/i.test(html)) fail('index.html: no inline scripts');
    const css = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((m) => m[1]);
    for (const sheet of css) if (!sheet.startsWith('/')) fail(`index.html: stylesheet must be local, found ${sheet}`);
  }
  if (slug !== 'index') {
    if ((html.match(/<h1[ >]/g) || []).length !== 1) fail(`${file}: needs exactly one h1`);
    if (!/<main id="content">/.test(html) || !/class="skip" href="#content"/.test(html)) fail(`${file}: missing main/skip link`);
    if (!html.includes(`href="/${slug}" aria-current="page"`)) fail(`${file}: current page not marked in nav`);
    for (const l of ['/pricing', '/privacy', '/terms', '/refunds']) if (!html.includes(`href="${l}"`)) fail(`${file}: missing link ${l}`);
    if (/<script/i.test(html)) fail(`${file}: pages must not load scripts`);
    if (!allowDrafts && /\[\[[A-Z_]+\]\]/.test(html)) fail(`${file}: unresolved marker ${html.match(/\[\[[A-Z_]+\]\]/)[0]} (publish gate)`);
  }
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
    if (!/data-asset/.test(html)) fail('index.html: the draggable asset is missing');
    if (!/data-target/.test(html)) fail('index.html: the editor drop target is missing');
    if (!/data-result/.test(html)) fail('index.html: the new layer row is missing');
    if (!/brand-poster\.psd/.test(html)) fail('index.html: the editor document tab is missing');
    if (!/class="ed-layers"/.test(html)) fail('index.html: the Layers panel is missing');
    if (/adobe|photoshop|ps/i.test(html)) fail('index.html: no Adobe/Photoshop name or mark may appear');
    if (!/id="drag"/.test(html) || !/data-asset/.test(html)) fail('index.html: the drag demo is missing');
    if (!/data-clients/.test(html)) fail('index.html: the client library is missing');
    if (/Coming soon/.test(text) === false) fail('index.html: OpticAlign/FixedLink must be marked coming soon');
  }
}

const pricing = read('pricing.html');
if (!/<strong>\$5<\/strong>\s*<span>one time<\/span>/.test(pricing)) fail('pricing.html: $5 one time not shown');
if (!/Up to 3 devices per license/.test(pricing)) fail('pricing.html: 3-device limit not shown');
if (/<a[^>]*>\s*Buy/i.test(pricing) || /href="https?:\/\/[^"]*(paddle|checkout)/i.test(pricing)) fail('pricing.html: checkout link exists but checkout does not');
if (!/<button class="btn" type="button" disabled[^>]*>Not on sale yet/.test(pricing)) fail('pricing.html: license button must be disabled');
if (!/Price to be announced/.test(pricing)) fail('pricing.html: Cloud price must stay "to be announced"');
for (const banned of ['Cancel anytime', 'within the same major version', 'reply within', '\\$3', '\\$4']) if (new RegExp(banned, 'i').test(pricing + read('refunds.html'))) fail(`unapproved claim present: ${banned}`);

if (errors.length) { console.error(errors.map((e) => 'FAIL ' + e).join('\n')); process.exit(1); }
console.log(`OK${allowDrafts ? ' (drafts allowed)' : ''}: ${Object.keys(pages).length} pages + landing`);
