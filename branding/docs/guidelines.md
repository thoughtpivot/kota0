# PoC brand guidelines

Design tokens and marks in this repo align with a **reference corporate marketing stylesheet** (Bootstrap-style `:root`, Manrope, DM Serif Display) captured for internal PoC use. Confirm colors, typography, and logo usage with stakeholders before external release.

## Canonical technical sources (paths only)

Values were audited from a reference site’s published CSS (paths below are relative to that site’s asset root, not live URLs in this doc):

| Asset | Path |
| --- | --- |
| Core palette and Manrope | `/assets/css/style.css` |
| DM Serif Display (display headings) | `/assets/css/fonts/dm.css` |
| Horizontal logos | `/assets/img/horz-light.svg`, `/assets/img/horz-dark.svg` |
| Square mark | `/assets/img/sq-logo.png` |

Repo copies and semantic mapping: [`../tokens/tokens.css`](../tokens/tokens.css), [`colors-and-type.md`](colors-and-type.md), [`../fonts/fonts.css`](../fonts/fonts.css).

## Voice

- Voice: confident, engineering-led, partner-oriented. Favor concrete outcomes (automation, interoperability, delivery) over hype.
- Avoid claiming capabilities this PoC does not implement.

## Positioning pillars (for slides and UI copy)

1. **Prompt-native delivery** — natural language and structured turns produce reviewable UI and backend artifacts.
2. **Preview and iterate** — tight loops from intent to running preview before promotion.
3. **Partner-ready / white-label** — surfaces and narratives meant to be rebranded for GSIs and OEM programs.
4. **Governed engineering** — durable state (Scribe), Flight-class deployment habits, integration hooks without locking to one vertical.

## CTAs (examples)

- Primary: “Talk to us”, “Try now” (use when a real action exists).
- Secondary: “Know more” for educational sections.

## Logo usage

- Use only files under [`../logos/`](../logos/). **Light backgrounds** (`#fefefe`, `#f6f7f9`): `horz-dark.svg` (blue wordmark on white). **Primary / blue hero** (`#164194`): `horz-light.svg` (white wordmark on blue — `horz-dark.svg` is blue-filled and disappears on `#164194`). **Favicon / compact:** `sq-logo.png`.
- Do not stretch, recolor arbitrarily, or crop the wordmark. Scale uniformly.

## Partner marks

- Vendored client logos live under [`../clients/logos/`](../clients/logos/) and are listed in [`../clients/manifest.json`](../clients/manifest.json). See [`client-assets.md`](client-assets.md) for filenames and third-party usage caution.

## Color and type

- **Single source of truth:** [`../tokens/tokens.css`](../tokens/tokens.css) and [`colors-and-type.md`](colors-and-type.md).
- App (Tailwind + shadcn-vue) and Slidev should **import** branding CSS, not fork hex values in components.

## Future brand-system notes (non-blocking for PoC)

A future brand pass could tighten the primary story and CTA hierarchy; this PoC **mirrors** the audited reference palette and typography so deck and UI stay visually consistent, not a full redesign.
