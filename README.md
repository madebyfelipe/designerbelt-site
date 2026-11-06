# Designer's Belt website

Responsive static product landing page inspired by the composition of lumabar.xyz, with original CSS artwork and interactive product concepts.

Open index.html with a static HTTP server. No dependencies or build step.

Pre-launch: no payments, downloads or email collection. Launch CTA links to this repository. UI illustrations are labelled as concepts. App is a one-time license; optional Cloud is a separate subscription.

## Brand assets

The mark on the page is the same tile used as the Windows app icon (`belt.ico` in the app repository), not a typographic substitute:

- `logo.png` — 256 px tile with transparent corners, used in the header, the footer, the launch card and as `og:image`;
- `favicon.ico` — 16, 32, 48, 64, 128 and 256 px;
- `apple-touch-icon.png` — 180 px.

They are downscaled from the 1024 px master with Pillow/Lanczos. Regenerate them only when the logo changes.

## Motion layer

The page stays a static HTML/CSS/JS document. On top of it, `app.js` adds:

- an ambient canvas field of drifting glyphs with pointer parallax, a soft repulsion around the cursor and hairline connections to the pointer (hero only, paused when the hero leaves the viewport);
- floating gradient glows, an animated grain and a pointer spotlight that fades out below the hero;
- headings split into characters that rise in with a stagger, plus magnetic letters in the hero;
- scroll reveals with a stagger per group, a scroll-progress line, and a marquee whose speed follows scroll velocity;
- a dock that magnifies under the pointer, cards that tilt in 3D with a light sweep and a scanning line over the Font Finder panel;
- an interactive demo that cycles through tools while it is on screen and stops as soon as a tab is clicked.

Rules kept: no dependencies, no build step, `prefers-reduced-motion: reduce` disables the whole layer (the page renders exactly as the static HTML), content is never hidden without JavaScript, and the split headings keep their text for screen readers in a `.sr-only` element.

Deployment: Vercel static hosting, repository root.

## Pricing and legal pages

`/pricing`, `/terms`, `/privacy` and `/refunds` are static pages (`pricing.html`, `terms.html`, `privacy.html`, `refunds.html`) that share `pages.css` and do not load `style.css` or `app.js`. They follow the UI designer's drawings (`Shared/design/site-legal`), with the claims that are not decided or not built yet removed: no checkout (the license button is disabled), no cancel-anytime or update-policy promise, no reply-time promise, no Cloud price.

The legal copy is a draft pending the owner's approval. Three values are still open and appear as markers: `[[REFUND_DAYS]]`, `[[CONTACT_EMAIL]]` (and the *Last updated* date must be set when the text is approved). `node tools/check-site.mjs` fails while a marker remains, so an unapproved draft cannot be published by mistake; use `--allow-drafts` while working. After approval, replace the markers, update the date, run the check without flags, then deploy.

## Selling the license (Paddle) — behind a flag

The `/pricing` page ships as "Not on sale yet". The buy button exists in the HTML but hidden, and `checkout.js` loads Paddle.js **only** when `/api/checkout-config` answers `enabled`. That needs `CHECKOUT_ENABLED=1` **and** the whole backend configured (client token, webhook secret, signing key, storage); a flag without a backend still answers "off", so nobody can pay for a license that cannot be delivered.

Backend (Vercel Functions in `api/`, no dependencies, Web `Request`/`Response` handlers):

| Endpoint | Purpose |
|---|---|
| `POST /api/paddle-webhook` | Verifies `Paddle-Signature` (HMAC-SHA256 over `ts:rawBody`, 5 min tolerance). `transaction.completed` for our price creates one key per transaction (idempotent). An approved full refund or any approved chargeback (`adjustment.created/updated`) revokes it. |
| `GET /api/license?txn=` | Success page: `202 pending` until the webhook arrives, then the key (shown for 7 days). |
| `POST /api/activate` | `{key, machine, label}`. Up to 3 devices; the same machine again is free and returns a fresh receipt. The 4th gets `409 limit_reached` with the list of devices. Receipt = ECDSA P-256 signature over a small JSON (`product`, key id, activation, machine, issued, limit). |
| `POST /api/deactivate` | `{key, activation}` frees a slot (also for a lost PC). |
| `GET /api/checkout-config` | `{enabled, environment, token, priceId}` for the page. |

Keys are `DBELT-XXXXX-XXXXX-XXXXX-XXXXX` (Crockford base32, 100 bits). Storage is any Redis reachable over the Upstash REST protocol (`UPSTASH_REDIS_REST_URL/TOKEN`, or the `KV_REST_API_URL/TOKEN` names the Marketplace integrations set); until one exists the API answers `503 not_configured`.

Environment variables (Vercel; never in the repo): `CHECKOUT_ENABLED`, `PADDLE_ENV` (`sandbox` or `production`), `PADDLE_CLIENT_TOKEN` (public by design), `PADDLE_WEBHOOK_SECRET`, `LICENSE_SIGNING_KEY` (PKCS#8 PEM of the P-256 private key; the app embeds the public key), optional `PADDLE_PRICE_IDS` (default: the US$ 5 price) and `DOWNLOAD_URL` (shown on the success page; without it the page says the installer is not available).

Checks: `npm test` (14 tests: signature, idempotent key creation, refund revocation, 3-device limit incl. a concurrent burst, receipt signature, flag logic), `npm run check` (static gate, also fails if checkout leaks into the HTML or a secret is committed), `npm run check:checkout` (real browser, real handlers, stubbed Paddle.js: flag off stays off, flag on sells, webhook to key to success page to 3 devices to refund). Paddle's own checkout is **not** exercised by any of them: that needs the Paddle sandbox.
