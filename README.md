# Designer's Belt website

Responsive static product landing page inspired by the composition of lumabar.xyz, with original CSS artwork and interactive product concepts.

Open index.html with a static HTTP server. No dependencies or build step.

Pre-launch: no payments, downloads or email collection. Launch CTA links to this repository. UI illustrations are labelled as concepts. App is a one-time license; optional Cloud is a separate subscription.

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
