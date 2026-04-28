# Colors and typography audit

All values below are traced to **ncircletech.com** stylesheets or inline rules documented on 2026-04-25.

## Typography

| Token / usage | Value | Source |
| --- | --- | --- |
| Sans (UI, body) | `Manrope` weights 400, 500, 700 | [`assets/css/style.css`](https://ncircletech.com/assets/css/style.css) — `@import` Google Fonts Manrope |
| Display (large headings, counters) | `DM Serif Display` | [`assets/css/fonts/dm.css`](https://ncircletech.com/assets/css/fonts/dm.css) — `@import` Google Fonts DM Serif Display |
| Monospace | Bootstrap `--bs-font-monospace` string | [`assets/css/style.css`](https://ncircletech.com/assets/css/style.css) `:root` |

**PoC wiring:** [`branding/fonts/fonts.css`](../fonts/fonts.css) duplicates the same Google Fonts `@import` URLs. [`branding/tokens/tokens.css`](../tokens/tokens.css) sets `--nc-font-sans`, `--nc-font-display`, `--nc-font-mono`.

## Color tokens (`:root` from site)

| CSS variable | Hex / value | Source |
| --- | --- | --- |
| `--bs-primary` | `#164194` | `style.css` `:root` |
| `--bs-navy` | `#343f52` | `style.css` `:root` |
| `--bs-dark` | `#262b32` | `style.css` `:root` |
| `--bs-light` | `#fefefe` | `style.css` `:root` |
| `--bs-gray` | `#f6f7f9` | `style.css` `:root` |
| `--bs-white` | `#fff` | `style.css` `:root` |
| `--bs-secondary` | `#aab0bc` | `style.css` `:root` |
| `--bs-info` | `#54a8c7` | `style.css` `:root` |
| `--bs-danger` | `#e2626b` | `style.css` `:root` |
| `body` text | `#60697b` | `style.css` `body { color: … }` |
| `body` background | `#fefefe` | `style.css` `body { background-color: … }` |
| `h1–h6` color | `#343f52` | `style.css` heading block |
| `hr` color | `rgba(164, 174, 198, .2)` | `style.css` `hr` rule |

## Semantic aliases (PoC only; no new pigment)

These map UI roles to the audited values above. See [`../tokens/tokens.css`](../tokens/tokens.css).

| Alias | Maps to | Rationale |
| --- | --- | --- |
| `--nc-hero-bg` | `--bs-primary` | Dark hero strip uses site primary blue |
| `--nc-hero-text` | `--bs-white` | Text on primary hero |
| `--nc-hero-subtle` | `--bs-secondary` | Muted line on hero |
| `--nc-hero-chip-bg` | `rgba(255, 255, 255, 0.12)` | Inline code / chips on hero; white matches `--bs-white` |
| `--nc-hero-mesh` | Two-layer `radial-gradient(…)` | Optional overlay on top of `--nc-hero-bg` (e.g. `/home`); uses audited `--bs-info` + white, no new hex. |
| `--nc-body-text` | `#60697b` | Literal body color from `style.css` |
| `--nc-heading-text` | `--bs-navy` | Matches heading color rule |

## Logos

See [`../logos/SOURCES.md`](../logos/SOURCES.md) and [`client-assets.md`](client-assets.md) for file URLs and usage notes.

## Slidev-only chrome

The Slidev player paints the **outer letterbox** (bars around the scaled slide) with CSS variable `--slidev-slide-container-background` (library default: black). The PoC sets this in [`../../slides/styles/slides.css`](../../slides/styles/slides.css) to **`#343f52`** (audited `--bs-navy`) so the chrome never falls back to black if a nested `var()` were invalid.
