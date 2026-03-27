# UI/UX Quality Upgrade — "From AI-Generated to Designer-Quality"

> **Goal:** When someone generates a simple todo app, they say "wow, this looks professional" instead of "this looks AI-generated."

## Background

Generated apps have a telltale "AI look" — generic blue (#3b82f6), flat shadows, "0.2s ease" on everything, no dark mode, flat typography, wireframe-looking forms, and vague empty states. This plan replaces *descriptive CSS instructions* with an *embedded pre-written CSS library* that the AI copies verbatim. More reliable, deterministic, 10x better output.

**Architecture decision:** Embed actual production CSS as string constants. The AI copies the library into `index.css` and uses its classes — instead of inventing CSS from scratch.

---

## Problem: The 12 "AI Slop" Signals

1. Generic blue everywhere — `#3b82f6` is the Tailwind blue-500 default. Every AI tool uses it.
2. Only 2 shadow levels — no visual depth hierarchy between cards, dropdowns, modals.
3. "0.2s ease" on everything — identical motion timing feels robotic.
4. No dark mode — `DESIGN_SYSTEM_CONSTANTS` only triggers on "beautiful" keyword.
5. Flat typography — no heading scale, no letter-spacing, no line-height rhythm.
6. Empty states say "No items yet" — no icon, no CTA, no visual treatment.
7. Toast/skeleton patterns are text descriptions — no actual CSS.
8. Forms look like wireframes — no label styling, no validation animations, no focus glow.
9. Onboarding styles are meaningless — vague one-sentence descriptions.
10. No image fallback — broken picsum.photos URLs show browser error icon.
11. No mobile-specific patterns — just "reflow at 768px" with no touch targets.
12. No gradient/accent on CTAs — primary buttons look identical to everything else.

---

## Phases

### Phase 1 — Foundation: CSS Library + Design Tokens
> **Day 1–2** | Highest impact. Everything else builds on this.

#### Tasks

- [x] **1.1** Create `backend/lib/core/prompts/css-library.ts` (new file)
  - Export `CSS_LIBRARY_BASE` string constant (~400 tokens of production CSS)
  - Classes: `.btn` `.btn-primary` `.btn-secondary` `.btn-danger` `.btn-ghost`
  - Classes: `.input` `.input-group` `.input-label` `.input-error` `.input-hint`
  - Classes: `.card` `.card-hover`
  - Classes: `.badge` `.badge-success` `.badge-warning` `.badge-error` `.badge-neutral`
  - Classes: `.empty-state` `.empty-state__icon` `.empty-state__title` `.empty-state__subtitle`
  - Typography: `h1` `h2` `h3` `p` global styles
  - Dark mode: `[data-theme="dark"]` block (matches builder's manual toggle — NOT `prefers-color-scheme`)
  - Reduced motion: `@media (prefers-reduced-motion: reduce)` block
  - Export `CSS_LIBRARY_FULL` string constant (~300 tokens, appended after BASE for medium/complex apps)
    - Classes: `.toast-container` `.toast` `.toast--success` `.toast--error` `.toast--info`
    - Classes: `.skeleton` `.skeleton-text` `.skeleton-title` `.skeleton-avatar`
    - Classes: `.modal-backdrop` `.modal-panel` `.modal-footer`
    - Classes: `.table-container` `.table-header` `.table-row`
    - Classes: `.nav-header`
  - Export `getCSSLibrary(complexity: 'simple' | 'medium' | 'complex'): string`
    - `'simple'` → BASE only
    - `'medium'` | `'complex'` → BASE + FULL

- [x] **1.2** Update design token defaults in `backend/lib/core/prompts/unified-prompt-provider.ts` (lines 209–219)
  - Replace minimal 9-variable token set with full token system:
    - **Color palette:** `--color-primary` through `--color-warning-light` (16 variables)
    - **Elevation:** `--shadow-xs` through `--shadow-xl` (5 levels)
    - **Typography scale:** `--text-xs` through `--text-4xl` + `--leading-*` + `--tracking-*`
    - **Spacing:** `--space-2xs` through `--space-3xl` (8 steps)
    - **Radii:** `--radius-sm` through `--radius-full`
    - **Motion tokens:** `--dur-fast: 150ms` `--dur-normal: 250ms` `--dur-slow: 350ms` + easing curves
      > **Note:** Use `--dur-*` (short form) to match CSS library class references exactly
    - **Font stack:** `--font-sans` `--font-mono`

- [x] **1.3** Add domain-aware color + font selection prompt to `unified-prompt-provider.ts`
  - Inject `=== SMART COLOR & FONT SELECTION ===` block into `getExecutionGenerationSystemPrompt()`
  - Domain → color + font mapping:
    - Productivity/task → blue `#2563eb` + Inter
    - Finance/money → green `#059669` + Inter
    - Food/recipe → orange `#ea580c` + system-ui
    - Health/fitness → emerald `#10b981` + Inter
    - Social/chat → violet `#7c3aed` + system-ui
    - E-commerce → indigo `#4f46e5` + Inter
    - Creative/portfolio → rose `#e11d48` + Georgia serif
    - Blog/editorial → slate `#334155` + Georgia serif
    - Education → sky `#0284c7` + Inter
    - Marketing/landing → indigo `#4f46e5` + system-ui
    - Default → blue `#2563eb` + Inter
  - User onboarding style choice always overrides domain auto-pick
  - Instruct AI to generate `primary-light` (10% opacity), `primary-ghost` (5% opacity), `primary-hover` (10% darker) tints

- [x] **1.4** Add `@fontsource` package injection rule to `unified-prompt-provider.ts`
  - Prompt instructs AI to add the correct `@fontsource` package to generated `package.json`:
    - Inter → `@fontsource/inter: ^5.0.0` + 3 weight imports in `main.tsx`
    - Source Serif 4 (editorial) → `@fontsource/source-serif-4: ^5.0.0`
    - Geist → `@fontsource/geist: ^1.0.0`
    - Geist Mono → `@fontsource/geist-mono: ^1.0.0`

- [x] **1.5** Add `@fontsource` packages to `PINNED_VERSIONS` in `backend/lib/core/file-processor.ts`
  ```
  '@fontsource/inter': '^5.0.0'
  '@fontsource/source-serif-4': '^5.0.0'
  '@fontsource/geist': '^1.0.0'
  '@fontsource/geist-mono': '^1.0.0'
  ```

---

### Phase 2 — Always-On Polish: Design System + Fragments
> **Day 3** | Makes every app get premium treatment, not just "beautiful" keyword apps.

#### Tasks

- [x] **2.1** Make `DESIGN_SYSTEM_CONSTANTS` always-on in `unified-prompt-provider.ts` (line 204)
  - Remove conditional: `${useDesignSystem ? DESIGN_SYSTEM_CONSTANTS : ''}`
  - Replace with unconditional: `${DESIGN_SYSTEM_CONSTANTS}`
  - Update `DESIGN_SYSTEM_CONSTANTS` text to reference CSS library classes (less vague)
  - `shouldIncludeDesignSystem()` is demoted: now controls only the **premium tier** (gradient CTAs, playful animations) — not basic design quality

- [x] **2.2** Inject CSS library usage instruction into `getExecutionGenerationSystemPrompt()` in `unified-prompt-provider.ts`
  - Inject `getCSSLibrary(complexity)` result into the single-phase generation prompt
  - **Do NOT inject into `getArchitecturePlanningPrompt()`** — the architecture planner outputs `cssVariables[]` JSON; seeing the CSS library would cause it to duplicate those variables in its plan output, which then get injected again in the scaffold phase

- [x] **2.3** Upgrade `BASELINE_VISUAL_POLISH` in `backend/lib/core/prompts/shared-prompt-fragments.ts` (lines 41–65)
  - Replace vague instructions ("add hover states", "use transitions") with concrete, copy-paste-ready patterns referencing CSS library classes:
    - **Button styles:** reference `.btn-primary`, `.btn-secondary`, `.btn-danger` from CSS library
    - **Input styles:** reference `.input`, `.input-group`, `.input-error` from CSS library
    - **Card styles:** reference `.card`, `.card-hover` from CSS library
    - **Elevation hierarchy:** 4-level system (page → card → dropdown → modal → toast) with z-index values
    - **Typography hierarchy:** page title, section heading, body, meta — all with concrete token references using `--text-*`, `--leading-*`, `--tracking-*`
    - **Motion:** `--dur-fast` for hover, `--dur-normal` for enter, `--dur-slow` for page transitions
    - Add: `CRITICAL: Dark mode is handled by the CSS library's [data-theme="dark"] block — NEVER add @media (prefers-color-scheme: dark) or hardcode colors. Always use var() tokens.`

- [x] **2.4** Update `DESIGN_SYSTEM_CONSTANTS` in `shared-prompt-fragments.ts` to reference CSS library classes instead of vague adjectives

---

### Phase 3 — Onboarding: Concrete Design Styles
> **Day 4** | Fixes the "design style" selector in onboarding from vague to actionable.

#### Tasks

- [x] **3.1** Update design style strings in `frontend/src/components/OnboardingOverlay/OnboardingOverlay.tsx`
  - Replace each vague one-liner with a concrete color palette + font + personality description:

  **Editorial (Clean & Minimal):**
  ```
  Primary: #0f172a (near-black). Accent: #3b82f6 (blue, CTAs only).
  Font: Georgia, 'Times New Roman', serif (headings). system-ui (body).
  Padding 24-48px sections. Line-height 1.7-1.8. Border-only cards (no shadow).
  No gradients. No colored backgrounds. Maximum whitespace. font-weight 400-500 headings.
  ```

  **Energetic (Bold & Vibrant):**
  ```
  Primary: #7c3aed (violet) or #e11d48 (rose) — pick based on domain.
  Font: system-ui, -apple-system, 'Segoe UI', sans-serif.
  Bold 700-weight headings. Gradient CTA: linear-gradient(135deg, primary, darker).
  Rounded corners (radius-lg to radius-xl). Hover: scale(1.05) + translateY(-2px).
  shadow-md on cards. Colorful icons (use primary/success/warning, not gray).
  ```

  **Polished (Professional & Business):**
  ```
  Primary: #1e40af (deep blue) or #0f766e (teal). Cool slate neutrals.
  Font: 'Inter', system-ui, sans-serif.
  Compact spacing. Subtle shadows. 1px borders everywhere.
  border-radius max 8px. font-weight 500 headings (not 700). No gradients.
  --text-sm as default body size. Muted badge colors.
  ```

  - Each style string is prepended to the user prompt before AI generation
  - User style choice always overrides domain auto-pick from Phase 1

---

### Phase 4 — Multi-Phase Pipeline: CSS Library in Phase Prompts
> **Day 5** | Ensures multi-phase generated apps (complex projects) also get the CSS library.

#### Tasks

- [x] **4.1** Inject `getCSSLibrary(complexity)` into `getUIPrompt()` in `backend/lib/core/prompts/phase-prompts.ts`
  - UI phase is where components are generated — this is the right injection point
  - Pass `complexity` from `ArchitecturePlan` or detect from user prompt

- [x] **4.2** Add `[data-theme="dark"]` requirement to `getScaffoldPrompt()` in `phase-prompts.ts`
  - Scaffold phase generates `index.css` — instruct AI to include the dark mode token overrides
  - The CSS library's dark mode block should be in `index.css`, not component CSS

- [x] **4.3** Add theme toggle instruction to `getIntegrationPrompt()` in `phase-prompts.ts`
  - Integration phase wires `App.tsx` — instruct AI to add a `data-theme` toggle button
  - Simple: `document.documentElement.setAttribute('data-theme', 'dark' | 'light')`

---

### Phase 5 — Responsive & Image Handling
> **Day 5** | Mobile excellence and image fallbacks.

#### Tasks

- [x] **5.1** Upgrade responsive section in `LAYOUT_FUNDAMENTALS` in `shared-prompt-fragments.ts`
  - Replace "reflow at 768px" with mobile-first specifics:
    - Mobile-first CSS: base = mobile, `@media (min-width: 768px)` for tablet
    - Fluid typography: `clamp(1rem, 0.5rem + 1.5vw, 1.25rem)`
    - Touch targets: ALL interactive elements minimum 44px × 44px
    - Mobile navigation: hamburger overlay (secondary nav) or bottom tab bar (primary nav)
    - Mobile modals: full-width bottom sheets on `< 768px`
    - Container: `max-width: 1200px; margin: 0 auto; padding: 0 var(--space-md)`
    - Images: `max-width: 100%; height: auto; display: block`
    - Scrollable areas: `-webkit-overflow-scrolling: touch`

- [x] **5.2** Upgrade image guidance in `REALISTIC_DATA_GUIDANCE` in `shared-prompt-fragments.ts`
  - Replace vague image placeholder instruction with:
    - Wrap in `aspect-ratio` containers to prevent layout shift
    - `loading="lazy"` on all below-fold images
    - `onError` fallback: hide broken image, show gradient or icon placeholder
    - Avatar fallback: display user initials on `var(--color-primary-light)` background

---

### Phase 6 — Tests
> **Day 6** | Prevent silent regressions.

#### Tasks

- [x] **6.1** Update existing tests in `backend/lib/core/prompts/__tests__/unified-prompt-provider.test.ts`
  - Tests 3–6 check verboseGuidance → DESIGN_SYSTEM_CONSTANTS presence/absence
    - **Test 4 currently asserts `DESIGN_SYSTEM_CONSTANTS` is ABSENT** — this breaks after 2.1 (always-on). Update assertion to reflect always-on behavior
  - Update any test checking CSS variable names: `--duration-fast` → `--dur-fast`

- [x] **6.2** Add new test: `getCSSLibrary()` tier gating
  - `getCSSLibrary('simple')` → contains `.btn`, does NOT contain `.toast` or `.skeleton`
  - `getCSSLibrary('medium')` → contains both `.btn` and `.toast` and `.skeleton`
  - `getCSSLibrary('complex')` → same as medium

- [x] **6.3** Add new test: domain color detection
  - Generation prompt for "build a finance dashboard" contains green `#059669`
  - Generation prompt for "build a recipe manager" contains orange `#ea580c`
  - Generation prompt for "build a todo app" contains default blue `#2563eb`

- [x] **6.4** Add new test: DESIGN_SYSTEM_CONSTANTS always-on
  - Generation prompt always contains `DESIGN_SYSTEM_CONSTANTS` regardless of `verboseGuidance` value

---

### Phase 7 — QA
> **Day 7–8** | Before/after validation across diverse app types.

#### Tasks

- [ ] **7.1** Generate these 6 apps BEFORE changes and screenshot them (baseline)
  - "Build a todo app" (simple)
  - "Build a recipe manager" (images, cards)
  - "Build a personal finance dashboard" (charts, tables)
  - "Build a landing page for a SaaS product" (hero, features)
  - "Build a chat application" (message bubbles, real-time UI)
  - "Build a project management tool" (complex, kanban, sidebar)

- [ ] **7.2** Implement all phases (1–6) and generate the same 6 apps AFTER

- [ ] **7.3** For each app, verify:
  - [ ] Primary color is NOT generic blue (domain-appropriate)
  - [ ] `[data-theme="dark"]` dark mode works when toggling builder theme
  - [ ] CSS library classes (`.btn`, `.card`, `.badge`, `.input`) are used in components
  - [ ] Typography has clear hierarchy (h1/h2/h3 vs body vs meta)
  - [ ] Buttons have hover, active, focus-visible, disabled states
  - [ ] Inputs have focus glow and error states
  - [ ] Empty states use `.empty-state` pattern (not just "No items")
  - [ ] Medium/complex apps: Toast, Modal, Skeleton from `CSS_LIBRARY_FULL` present
  - [ ] Mobile layout works at 375px width
  - [ ] `@fontsource` font is loaded (check browser font rendering)
  - [ ] Images have aspect-ratio containers
  - [ ] Reduced motion respected (`@media prefers-reduced-motion`)

- [ ] **7.4** Run test suite: `npm run test --workspace=@ai-app-builder/backend`
  - All 17 existing UnifiedPromptProvider tests pass (updated)
  - New tests 6.2–6.4 pass

---

## Files Modified

| File | Phase | Change |
|------|-------|--------|
| `backend/lib/core/prompts/css-library.ts` **(NEW)** | 1 | Create CSS_LIBRARY_BASE + FULL + getCSSLibrary() |
| `backend/lib/core/prompts/unified-prompt-provider.ts` | 1, 2 | New tokens, always-on design system, domain picker, @fontsource rules, CSS library injection (generation prompt only — NOT architecture planner) |
| `backend/lib/core/prompts/shared-prompt-fragments.ts` | 2, 5 | Upgrade BASELINE_VISUAL_POLISH, DESIGN_SYSTEM_CONSTANTS, LAYOUT_FUNDAMENTALS, REALISTIC_DATA_GUIDANCE images |
| `backend/lib/core/prompts/generation-prompt-utils.ts` | 2 | Demote shouldIncludeDesignSystem() to premium tier only |
| `frontend/src/components/OnboardingOverlay/OnboardingOverlay.tsx` | 3 | Concrete palette + font strings for 3 design styles |
| `backend/lib/core/prompts/phase-prompts.ts` | 4 | Inject CSS library into getUIPrompt(), dark mode in getScaffoldPrompt(), theme toggle in getIntegrationPrompt() |
| `backend/lib/core/file-processor.ts` | 1 | Add @fontsource/* to PINNED_VERSIONS |
| `backend/lib/core/prompts/__tests__/unified-prompt-provider.test.ts` | 6 | Update 17 tests + add 3 new test groups |

---

## Not In Scope

- Deployment / GitHub sync — deferred
- "Improve Design" quick action button — added to TODOS.md as vision item (~2h)
- CSS variable inspector in preview — vision item, deferred
- User-supplied CSS presets — future platform feature
- Post-generation design quality scoring — requires eval infrastructure
- Visual color picker in onboarding — UI change, out of scope
- WebContainers migration — separate TODOS.md item

---

## Key Decisions (from CEO + Eng review)

| Decision | Choice | Reason |
|---|---|---|
| CSS approach | Embedded CSS library (not descriptions) | LLMs copy code faithfully; deterministic results |
| Font loading | `@fontsource` in generated `package.json` | Self-hosted, no CDN dependency |
| Dark mode selector | `[data-theme="dark"]` | Matches builder's manual toggle; not OS-preference |
| CSS library gating | `detectComplexity()` — simple gets BASE, medium/complex gets FULL | Toasts/modals overkill for a counter app |
| Motion tokens | `--dur-fast` / `--dur-normal` / `--dur-slow` (short form) | Must match CSS library class references exactly |
| Architecture planner | No CSS library injection | Planner outputs `cssVariables[]` JSON — would duplicate tokens |
| Workstream 6 (dark mode fragment) | Removed | Dark mode already in CSS_LIBRARY_BASE; separate fragment would create two conflicting systems |
