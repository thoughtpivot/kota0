# nCircle Tech — PoC brand guidelines

Derived from public positioning and **live CSS** on [ncircletech.com](https://ncircletech.com). This is a **proof-of-concept** document: confirm colors, typography, and logo usage with marketing before external release.

## Canonical technical sources

| Asset | URL |
| --- | --- |
| Core palette and Manrope | [`/assets/css/style.css`](https://ncircletech.com/assets/css/style.css) |
| DM Serif Display (display headings) | [`/assets/css/fonts/dm.css`](https://ncircletech.com/assets/css/fonts/dm.css) |
| Horizontal logos | [`/assets/img/horz-light.svg`](https://ncircletech.com/assets/img/horz-light.svg), [`/assets/img/horz-dark.svg`](https://ncircletech.com/assets/img/horz-dark.svg) |
| Square mark | [`/assets/img/sq-logo.png`](https://ncircletech.com/assets/img/sq-logo.png) |

Repo copies and semantic mapping: [`../tokens/tokens.css`](../tokens/tokens.css), [`colors-and-type.md`](colors-and-type.md), [`../fonts/fonts.css`](../fonts/fonts.css).

## Name and voice

- Prefer **nCircle Tech** in formal contexts; **nCircle** is acceptable in body copy when space is tight.
- Voice: confident, engineering-led, partner-oriented. Favor concrete outcomes (automation, interoperability, delivery) over hype.
- Avoid claiming capabilities this PoC does not implement; testimonials on the live site are **not** copied here.

## Positioning pillars (for slides and UI copy)

1. **AEC and manufacturing** — CAD/BIM customization, workflow automation, 3D web and mobile.
2. **Scan-to-BIM and modeling** — ML-assisted and automation-driven BIM services.
3. **Platform depth** — Autodesk / Forge / Revit ecosystem familiarity (reference only when accurate for the product being demoed).
4. **Partnership** — Augmented teams, long-horizon delivery, clear communication.

## CTAs (examples aligned with the site)

- Primary: “Talk to us”, “Try now” (use when a real action exists).
- Secondary: “Know more” for educational sections.

## Logo usage

- Use only files under [`../logos/`](../logos/). **Light backgrounds** (`#fefefe`, `#f6f7f9`): `horz-dark.svg` (blue wordmark on white). **Primary / blue hero** (`#164194`): `horz-light.svg` (white wordmark on blue — `horz-dark.svg` is blue-filled and disappears on `#164194`). **Favicon / compact:** `sq-logo.png`.
- Do not stretch, recolor arbitrarily, or crop the wordmark. Scale uniformly.

## Partner marks

- Vendored client logos live under [`../clients/logos/`](../clients/logos/) and are listed in [`../clients/manifest.json`](../clients/manifest.json). See [`client-assets.md`](client-assets.md) for source URLs and third-party usage caution.

## Color and type

- **Single source of truth:** [`../tokens/tokens.css`](../tokens/tokens.css) and [`colors-and-type.md`](colors-and-type.md).
- App (Tailwind + shadcn-vue) and Slidev should **import** branding CSS, not fork hex values in components.

## Future brand-system notes (non-blocking for PoC)

The public homepage repeats similar hero blocks and broad service lists. A future brand pass could tighten the primary story and CTA hierarchy; this PoC should **mirror** current nCircle so stakeholders recognize the look, not redesign it.
