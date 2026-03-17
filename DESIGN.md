# Design System — AI App Builder

## Product Context

- **What this is:** An AI-powered React app builder — describe a prompt, get a live editable app with code editor, live preview, and version history
- **Who it's for:** Broad audience: developers, but also founders, designers, and PMs who want to build without writing code
- **Space/industry:** AI developer tools (competitive with v0.dev, bolt.new, Lovable, Replit Agent)
- **Project type:** Web app (builder tool) + marketing/welcome pages

---

## Aesthetic Direction

- **Direction:** Creative Studio / Editorial-Minimal
- **Decoration level:** Intentional — color as signal, subtle warm surface grain optional. No gratuitous decoration.
- **Mood:** A maker's workspace, not a developer terminal. Warm, confident, and inviting for non-technical builders — without losing credibility for engineers. Think editorial design tool, not VS Code dark theme.
- **What to avoid:** Purple/violet gradients (literal AI slop — traced to Tailwind's training data dominating LLM output), cold blue-black backgrounds, uniform pill border radii on everything, three-column feature cards with colored icon circles, Inter as primary font.

---

## Typography

- **Display/Hero:** **Fraunces** (optical-size variable serif, italic variant)
  - Role: Hero headlines, brand moments, key marketing copy only
  - Rationale: Zero competitors use a serif. Fraunces signals editorial confidence and craft. The warm optical size axis and italic cut give it personality without being stuffy. Limit to `font-size >= 24px`.
  - Usage: `font-family: 'Fraunces', Georgia, serif; font-style: italic; font-weight: 400;`

- **Body/UI:** **Geist Sans**
  - Role: All UI text — labels, body copy, buttons, navigation, form inputs, metadata
  - Rationale: Technical, clean, designed for developer tooling (Vercel's typeface). Great at small sizes. Pairs naturally with Fraunces (grotesque body + serif display is a classic editorial pairing).
  - Usage: `font-family: 'Geist', system-ui, sans-serif;`

- **Code:** **Geist Mono**
  - Role: Code editor, file names, technical labels, monospaced data
  - Rationale: Natural pairing with Geist Sans, developer-trusted, tabular-nums support
  - Usage: `font-family: 'Geist Mono', 'Fira Code', monospace;`

- **Loading:** Google Fonts CDN
  ```html
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,600;1,9..144,300;1,9..144,400;1,9..144,600&family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
  ```

- **Type scale:**

  | Token | Size   | Usage                          |
  |-------|--------|--------------------------------|
  | 5xl   | 72px   | Hero headline (Fraunces italic)|
  | 4xl   | 48px   | Section hero (Fraunces)        |
  | 3xl   | 32px   | Page title (Fraunces)          |
  | 2xl   | 24px   | Card title (Fraunces italic)   |
  | xl    | 20px   | Subheading (Geist 600)         |
  | lg    | 18px   | Body large (Geist 400)         |
  | md    | 15px   | Body default (Geist 400)       |
  | sm    | 13px   | UI labels, captions (Geist 500)|
  | xs    | 11px   | Metadata, timestamps (Geist 300)|
  | mono  | 12-13px| Code, file names (Geist Mono)  |

---

## Color

- **Approach:** Balanced — one primary accent, warm neutral scale, semantic colors. Color is rare and meaningful.

### Primary Accent — Amber Orange

| Token        | Hex       | HSL                  | Usage                                      |
|--------------|-----------|----------------------|--------------------------------------------|
| orange-50    | #FFF7F2   | hsl(22, 100%, 97%)   | Accent background, user message bg        |
| orange-100   | #FFE9D9   | hsl(22, 100%, 92%)   | Accent border, hover tint                 |
| orange-200   | #FFD0B0   | hsl(22, 100%, 84%)   | Highlight                                  |
| orange-300   | #FFAE7A   | hsl(22, 100%, 74%)   | Decorative                                 |
| orange-400   | #F7844A   | hsl(22, 91%, 63%)    | —                                          |
| **orange-500** | **#E8612A** | **hsl(22, 79%, 54%)** | **Hover state, dark mode primary**        |
| **orange-600** | **#D4622A** | **hsl(22, 66%, 49%)** | **Primary — light mode buttons, accents** |
| orange-700   | #B54C1A   | hsl(22, 75%, 40%)    | Active/pressed state                       |
| orange-800   | #8F3A13   | hsl(22, 76%, 31%)    | Dark accent                                |
| orange-900   | #6E2C0E   | hsl(22, 77%, 24%)    | Deepest accent                             |

**Rationale:** The entire AI tools category defaults to indigo/violet — literally traced to Tailwind's `bg-indigo-500` default being baked into LLM training data. Warm amber-orange signals creative energy, urgency to build, and is completely distinct from every major competitor.

### Neutral Scale — Warm

Warm whites and near-blacks (2° warm hue shift vs. cold grays). Avoids the clinical, sterile feel of pure `#FAFAFA` surfaces.

| Token      | Light Hex | Dark Hex  | Role                        |
|------------|-----------|-----------|-----------------------------|
| warm-50    | #FAFAF8   | —         | Background (light)          |
| warm-100   | #F4F2EE   | —         | Muted surface, sidebar      |
| warm-200   | #E8E5DF   | —         | Border (light)              |
| warm-300   | #D4D0C9   | —         | Hover border                |
| warm-400   | #A8A39A   | —         | Subtle foreground           |
| warm-500   | #787268   | —         | Muted foreground            |
| warm-600   | #5C5750   | —         | —                           |
| warm-700   | #403C36   | #403C36   | Border (dark)               |
| warm-800   | #2A2722   | #2A2722   | Muted surface (dark)        |
| warm-900   | #1C1B19   | #1C1B19   | Card background (dark)      |
| warm-950   | #111110   | #111110   | Background (dark)           |

### Semantic Colors

| Color   | Light Hex | Usage                       |
|---------|-----------|-----------------------------|
| Success | #2D7D5A   | File created, generation OK |
| Warning | #B45309   | Auto-repair, modified file  |
| Error   | #C53030   | Build errors, destructive   |
| Info    | #1D5FAD   | Neutral status, tips        |

### Theme Mapping

```css
/* Light mode (default) */
--bg:           #FAFAF8;   /* warm off-white */
--bg-card:      #FFFFFF;
--bg-muted:     #F4F2EE;
--bg-accent:    #FFF7F2;   /* orange-50 */
--fg:           #111110;
--fg-muted:     #787268;
--border:       #E8E5DF;
--primary:      #D4622A;   /* orange-600 */

/* Dark mode */
--bg:           #111110;   /* warm near-black */
--bg-card:      #1C1B19;
--bg-muted:     #2A2722;
--bg-accent:    #2A1A0E;
--fg:           #FAFAF8;
--fg-muted:     #A8A39A;
--border:       #403C36;
--primary:      #E8612A;   /* orange-500 — slightly brighter in dark */
```

---

## Spacing

- **Base unit:** 4px
- **Density:** Comfortable — tighter than Notion, looser than VS Code. Right for a product mixing marketing moments with dense builder UI.

| Token | Value | Usage                                   |
|-------|-------|-----------------------------------------|
| xs    | 4px   | Icon gap, tight label spacing           |
| sm    | 8px   | Internal component padding              |
| md    | 16px  | Standard component padding              |
| lg    | 24px  | Section content gap                     |
| xl    | 32px  | Card-to-card spacing                    |
| 2xl   | 48px  | Section internal padding                |
| 3xl   | 64px  | Section vertical spacing (mobile)       |
| 4xl   | 80px  | Section vertical spacing (desktop)      |
| 5xl   | 96px  | Hero section padding                    |

---

## Layout

- **Approach:** Hybrid — grid-disciplined for the builder app (chat + preview + code panels), slightly editorial for welcome/marketing pages
- **Grid:** 12 columns desktop, 4 columns tablet, 1 column mobile
- **Max content width:** 1200px
- **Breakpoints:**
  - Mobile: < 768px — full-screen panel switching via tab bar
  - Tablet: 768–1023px — collapsible overlay sidebar (380px)
  - Desktop: ≥ 1024px — resizable chat sidebar (340px default, min 300px, max 60vw)

### Border Radius

| Token     | Value  | Usage                                   |
|-----------|--------|-----------------------------------------|
| radius-sm | 4px    | Badges, chips, small tags               |
| radius-md | 8px    | Buttons, inputs, small cards            |
| radius-lg | 12px   | Cards, panels, dropdowns                |
| radius-xl | 16px   | Large cards, modals, builder chrome     |
| radius-2xl| 24px   | Overlays, onboarding sheets             |
| radius-full | 9999px | Pills only (status badges, avatar)  |

**Note:** Do NOT use `border-radius: 9999px` on buttons or cards — that's the "AI slop" uniform pill radius pattern. Buttons use `radius-md` (8px). Cards use `radius-lg` (12px).

---

## Motion

- **Approach:** Intentional — every transition aids comprehension. No decorative animation, no bounce, no scroll-driven choreography.
- **Easing:**
  - Enter: `cubic-bezier(0.0, 0.0, 0.2, 1.0)` (ease-out — elements decelerate into place)
  - Exit: `cubic-bezier(0.4, 0.0, 1.0, 1.0)` (ease-in — elements accelerate out)
  - Move: `cubic-bezier(0.4, 0.0, 0.2, 1.0)` (ease-in-out)
- **Duration:**
  - Micro: 80ms — instant feedback (button press, focus ring)
  - Short: 150–180ms — hover states, icon transitions
  - Medium: 250–280ms — panel transitions, theme toggle, dropdown open
  - Long: 400ms — page transitions, modal open/close

---

## Dark Mode

- **Strategy:** Full dark theme via `[data-theme="dark"]` on `<html>` (already implemented)
- **Light mode is the default** — the first impression for new users. Dark mode is excellent and fully supported, but not the opening handshake.
- **Dark mode palette adjustments:**
  - Surfaces: warm near-blacks (`#111110`, `#1C1B19`, `#2A2722`) — not cold blue-blacks
  - Primary accent: orange-500 (`#E8612A`) instead of orange-600 — slightly brighter to maintain contrast on dark surfaces
  - Reduce color saturation ~10% for muted elements in dark mode
  - Semantic colors: shift to lighter tints (`#86EFAC`, `#FCD34D`, `#FCA5A5`) for legibility

---

## Competitive Differentiation

These are the deliberate departures from the category baseline:

1. **Amber-orange primary** (not violet) — every major competitor uses violet/indigo, literally traced to LLM training data. Orange is rare in dev tools, signals creative energy.

2. **Fraunces serif for display type** — zero competitors use serifs. Creates instant recognizability and editorial confidence. v0 uses Geist (clean but cold), Replit uses custom type, Lovable/bolt use generic sans-serif.

3. **Light mode as default** — everyone is dark-first. Warm, open light mode says "this tool is for everyone" — founders, designers, PMs, not just engineers. Dark mode is fully supported.

---

## Do Not

- Use `violet`, `indigo`, or `purple` as primary color — this is literal AI slop
- Recommend Inter, Roboto, Open Sans, or Montserrat as primary font
- Use uniform `border-radius: 9999px` on buttons or cards
- Add gratuitous gradient blobs, glassmorphism overlays, or hero gradient backgrounds
- Center-align every element — use intentional alignment
- Use `3 feature boxes with icons in colored circles` pattern
- Skip Fraunces for hero headlines and default to Geist for everything

---

## Decisions Log

| Date       | Decision                                  | Rationale                                                                 |
|------------|-------------------------------------------|---------------------------------------------------------------------------|
| 2026-03-18 | Initial design system created             | /design-consultation · broader audience (devs + non-devs) + competitor research |
| 2026-03-18 | Amber-orange (#D4622A) as primary         | Entire category uses violet — traced to Tailwind training data. Orange differentiates. |
| 2026-03-18 | Fraunces as display typeface              | No competitor uses serifs. Editorial confidence, memorable, not mistakable for shadcn defaults. |
| 2026-03-18 | Light mode as default                     | Targets broader audience beyond developers. Warm, open first impression. Dark mode fully supported. |
| 2026-03-18 | Warm neutral scale (#FAFAF8 not #FAFAFA)  | 2° warm hue shift makes surfaces feel less clinical without being obviously warm. |
| 2026-03-18 | Geist Sans for all UI text                | Technical credibility, legible at small sizes, pairs naturally with Geist Mono. Avoids overused Inter. |
| 2026-03-18 | 4px spacing base, comfortable density     | Right balance between marketing moments (welcome page) and dense builder UI. |
| 2026-03-18 | 8–16px border radius (not uniform pills)  | Warm but not bubbly. Avoids the uniform 9999px pill pattern that reads as generic AI slop. |
