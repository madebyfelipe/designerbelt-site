// Checkout glue for /pricing and /success. Nothing here runs a purchase unless /api/checkout-config says the sale is open,
// and Paddle.js is only requested at that point: with the flag off the page makes no request to Paddle.
const $ = (s) => document.querySelector(s);
const say = (el, text) => { if (el) el.textContent = text; };

async function setupBuy(button) {
  const status = $('[data-buy-status]');
  let config;
  try { config = await (await fetch('/api/checkout-config', { cache: 'no-store' })).json(); } catch { return; } // stay "not on sale"
  if (!config.enabled) return;
  try {
    await new Promise((ok, fail) => { const s = document.createElement('script'); s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js'; s.onload = ok; s.onerror = fail; document.head.append(s); });
  } catch { say(status, 'The checkout could not load. Check your connection and reload the page.'); return; }
  if (config.environment === 'sandbox') Paddle.Environment.set('sandbox');
  Paddle.Initialize({
    token: config.token,
    eventCallback: (e) => {
      if (e.name === 'checkout.completed' && e.data?.transaction_id) {
        const hash = e.data.custom_data?.claim_hash;
        const claim = hash && sessionStorage.getItem('belt:pending:' + hash);
        if (!claim) { say(status, 'Purchase claim unavailable. Keep your Paddle receipt and contact support.'); return; }
        sessionStorage.setItem('belt:claim:' + e.data.transaction_id, claim);
        Paddle.Checkout.close();
        location.assign('/success?txn=' + encodeURIComponent(e.data.transaction_id));
      }
    },
  });
  $('[data-sale-off]').hidden = true;
  $('[data-sale-on]').hidden = false;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const claim = Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) => n.toString(16).padStart(2, '0')).join('');
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(claim))), (n) => n.toString(16).padStart(2, '0')).join('');
      // Save before opening: an unavailable session store must never lead to a paid but unclaimable checkout.
      sessionStorage.setItem('belt:pending:' + hash, claim);
      Paddle.Checkout.open({ items: [{ priceId: config.priceId, quantity: 1 }], customData: { claim_hash: hash }, settings: { displayMode: 'overlay', variant: 'one-page' } });
    } catch { say(status, 'Checkout could not start. Allow session storage and reload to try again.'); }
    finally { button.disabled = false; }
  });
}

async function showLicense(box) {
  const txn = new URLSearchParams(location.search).get('txn') ?? '';
  const status = box.querySelector('[data-state]');
  const key = box.querySelector('[data-key]');
  const done = box.querySelector('[data-ready]');
  const download = box.querySelector('[data-download]');
  if (!/^txn_[a-z0-9]{20,40}$/.test(txn)) { say(status, 'There is no purchase to show here. Your license key was shown after payment.'); return; }
  let claim;
  try { claim = sessionStorage.getItem('belt:claim:' + txn); } catch { /* unavailable session store fails closed below */ }
  if (!claim) { say(status, 'Purchase claim unavailable in this browser. Keep your Paddle receipt and contact support.'); return; }
  for (let attempt = 0; attempt < 30; attempt++) {
    let res, body;
    try { res = await fetch('/api/license?txn=' + encodeURIComponent(txn), { cache: 'no-store', headers: { authorization: 'Bearer ' + claim } }); body = await res.json(); } catch { say(status, 'Could not reach the license service. Reload to try again.'); return; }
    if (res.status === 202) { say(status, 'Confirming your payment…'); await new Promise((r) => setTimeout(r, 2000)); continue; }
    if (!res.ok) { say(status, body.message ?? 'Something went wrong. Reload to try again.'); return; }
    if (body.status === 'revoked') { say(status, 'This purchase was refunded, so its license is no longer valid.'); return; }
    if (body.status === 'expired') { say(status, body.message); return; }
    say(status, 'Payment confirmed. Keep this key safe: it is your license.');
    key.textContent = body.key;
    done.hidden = false;
    if (body.downloadUrl) { download.querySelector('a').href = body.downloadUrl; download.hidden = false; } else { box.querySelector('[data-no-download]').hidden = false; }
    box.querySelector('[data-copy]').addEventListener('click', async (e) => { try { await navigator.clipboard.writeText(body.key); e.target.textContent = 'Copied'; } catch { e.target.textContent = 'Select the key and copy it'; } });
    return;
  }
  say(status, 'Your payment is taking longer than usual to confirm. Reload this page in a minute. If it still fails, write to the support address on the Terms page with your Paddle receipt.');
}

const buy = $('[data-buy]');
if (buy) setupBuy(buy);
const box = $('[data-license]');
if (box) showLicense(box);
