# Generation Quality Improvement Plan

## Context

Generated apps feel like demos, not real-world projects. Key gaps: no visual polish unless user asks for it, placeholder data, missing UX patterns (toasts, empty states, skeletons), low token budget truncating complex apps. Goal: make every generated app look and feel production-quality by default.

---

## Phase 1: Always-On Visual Polish (Highest Impact)

**Files:** `backend/lib/core/prompts/shared-prompt-fragments.ts`, `backend/lib/core/prompts/generation-prompt.ts`

- [x] Add `BASELINE_VISUAL_POLISH` exported constant (~15 lines) to `shared-prompt-fragments.ts`
  - Hover effects on all interactive elements
  - Transitions (0.2s ease) on state changes
  - Subtle shadows for depth/elevation
  - Visual hierarchy (size, weight, color contrast)
  - Consistent border-radius using CSS variables
- [x] Import and include `BASELINE_VISUAL_POLISH` in `buildGenerationPrompt()` — always on
- [x] Keep `DESIGN_SYSTEM_CONSTANTS` conditional (gated for premium/glassmorphism requests)
- [x] Run tests: `npm run test --workspace=@ai-app-builder/backend`

**Verify:** Generate from "build a task manager" (no design keywords) — output should have hover effects, transitions, shadows.

---

## Phase 2: Realistic Sample Data

**Files:** `backend/lib/core/prompts/shared-prompt-fragments.ts`, `backend/lib/core/prompts/generation-prompt.ts`

- [x] Add `REALISTIC_DATA_GUIDANCE` exported constant (~15 lines) to `shared-prompt-fragments.ts`
  - Never use Lorem ipsum, "Item 1/2/3", "John Doe", or placeholder.com
  - Generate 5-8 domain-appropriate sample data items
  - Use realistic stats/numbers in dashboards (not 0 or 100)
  - Use `picsum.photos` or `placehold.co` for image URLs
  - Populate form placeholders with realistic values
- [x] Import and include `REALISTIC_DATA_GUIDANCE` unconditionally in `buildGenerationPrompt()`
- [x] Run tests: `npm run test --workspace=@ai-app-builder/backend`

**Verify:** Generate from "build a task manager" — output should have real task names, descriptions, dates instead of placeholders.

---

## Phase 3: Raise Token Budget

**Files:** `backend/lib/core/prompts/provider-prompt-config.ts`, `backend/lib/constants.ts`

- [x] In `constants.ts`: raise `MAX_OUTPUT_TOKENS_GENERATION` from `16384` to `32768`
- [x] In `provider-prompt-config.ts`: raise OpenRouter `outputBudgetTokens` from `15000` to `28000`
- [x] Run tests: `npm run test --workspace=@ai-app-builder/backend`

**Verify:** Generate from a complex prompt (5+ features) — output should have complete component sets without truncation.

> **Cost note:** Doubles worst-case cost per request (~$0.0016 to ~$0.0033). Acceptable at current volume.
>
> **Timeout note:** 32K tokens at ~100 tok/s = ~5 min, close to `OPENROUTER_TIMEOUT` (300s). Monitor but most generations won't hit 32K.

---

## Phase 4: UX Pattern Enrichment

**Files:** `backend/lib/core/prompts/shared-prompt-fragments.ts`

- [x] Expand `COMMON_REACT_PATTERNS` with a new section "6. PRODUCTION UX PATTERNS" (~20 lines)
  - Toast/notification component for user feedback on actions (add, delete, save)
  - Skeleton loaders (CSS animated placeholders) instead of spinners for initial load
  - Empty states with icon/illustration, descriptive text, and primary CTA button
  - Confirmation step for destructive actions (delete) — inline confirm or modal
  - Form submission shows success feedback, not silent success
  - Search inputs include clear button and "No results found" state
- [x] Run tests: `npm run test --workspace=@ai-app-builder/backend`

**Verify:** Generate from "build a task manager" — output should include toast on add/delete, skeleton loader, empty state with CTA.

---

## Phase 5: Smarter Complexity Structure

**Files:** `backend/lib/core/prompts/generation-prompt.ts`

- [x] Export `detectComplexity` function (add `export` keyword)
- [x] Export `getFileRequirements` function (add `export` keyword)
- [x] Lower complex threshold: `score >= 4` (was `>= 5`). Medium stays at `>= 2` (unchanged)
- [x] Rewrite `getFileRequirements()` with specific structural patterns:
  - **Simple:** Keep as-is (focused, minimal)
  - **Medium:** Add guidance for Layout wrapper, Modal component, custom hook for primary data, form validation
  - **Complex:** Add guidance for react-router-dom with SharedLayout/Outlet, responsive sidebar with hamburger toggle, context provider for primary data domain, search/filter on list views, breadcrumb navigation
- [x] Add unit tests in `generation-prompt.test.ts`:
  - `detectComplexity("build a todo app")` returns `'simple'`
  - `detectComplexity` with 4 signals returns `'complex'`
  - `detectComplexity` with 2 signals returns `'medium'`
  - `getFileRequirements('medium')` mentions Layout and Modal
  - `getFileRequirements('complex')` mentions react-router-dom and SharedLayout
- [x] Run tests: `npm run test --workspace=@ai-app-builder/backend`

**Verify:** Medium apps get layout wrapper + modal; complex apps get routing + sidebar.

---

## Phase 6: Few-Shot Quality Anchor

**Files:** `backend/lib/core/prompts/generation-prompt.ts`

- [x] Add compact quality reference (~30 lines) near end of `buildGenerationPrompt()`
  - Show expected file structure for a "task manager" example
  - Include file names, component responsibilities, data shape
  - Frame as "QUALITY BAR reference, not a template to copy"
  - Explicit instruction: "Adapt this structure to whatever the user requests"
- [x] Add unit test: `getGenerationPrompt()` contains few-shot reference text
- [x] Run tests: `npm run test --workspace=@ai-app-builder/backend`

**Verify:** Generated apps consistently follow the expected file structure and quality bar.

---

## Review Notes

**Prompt length budget:** ~2,150 tokens current to ~2,800 after all phases. Well within Gemini's 1M context. Monitor for instruction dilution if future phases add more.

**Duplication note (Phase 1):** `BASELINE_VISUAL_POLISH` partially overlaps with `DETAILED_CSS_GUIDANCE` L165-168. Accepted — they serve different audiences (baseline for all vs detailed for weak models).

**Not in scope:**
- Modification prompt improvements (same fragments for `/api/modify-stream`)
- ESLint/TypeScript validation on generated output
- Dark mode toggle by default
- API mocking patterns
- Auth scaffolding templates
- Eval harness for output quality regression testing
