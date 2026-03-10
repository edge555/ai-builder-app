# MVP Improvements Plan

> **Scope:** Onboarding, Error Recovery UX, Responsive Preview, Modal Streaming
> **Created:** 2026-03-08
> **No backward compatibility or unit tests required**

---

## Phase 1: Onboarding & Guided Tour

**Goal:** Help first-time users understand the app and get productive quickly.

**Current state:** WelcomePage has hero input, 3 hardcoded suggestion chips, 8 starter templates, and feature cards. No tour, no tooltips, no contextual guidance. Smart `prompt-suggestions.ts` (with `analyzeProjectForSuggestions()`) exists but is NOT used on WelcomePage.

### Tasks

- [x] **1.1 — First-visit welcome overlay**
  Create a lightweight overlay/modal shown on first visit (track via `localStorage` flag). Should highlight: (1) type a prompt to generate an app, (2) pick a template, (3) open a saved project. Dismiss with "Get Started" button. No complex tour library needed — simple 3-step card carousel.

  **Files to modify:**
  - `frontend/src/pages/WelcomePage.tsx` — add overlay trigger on first visit
  - Create `frontend/src/components/OnboardingOverlay/OnboardingOverlay.tsx`
  - Create `frontend/src/components/OnboardingOverlay/OnboardingOverlay.css`

- [x] **1.2 — Builder page contextual tooltips**
  On first project creation, show brief tooltip bubbles on key UI elements: chat input ("Describe changes here"), preview panel ("Live preview updates automatically"), code editor toggle ("View and edit the generated code"), undo/redo buttons. Show once per user (localStorage). Use CSS-only positioned tooltips with fade-in animation — no tooltip library.

  **Files to modify:**
  - `frontend/src/components/AppLayout/AppLayout.tsx` — add tooltip triggers
  - Create `frontend/src/components/ContextualTooltip/ContextualTooltip.tsx`
  - Create `frontend/src/components/ContextualTooltip/ContextualTooltip.css`

- [x] **1.3 — Integrate smart prompt suggestions on WelcomePage**
  Replace the 3 hardcoded suggestion chips with dynamic suggestions from `prompt-suggestions.ts`. Use `initialSuggestions` for new users, and `analyzeProjectForSuggestions()` output for returning users (based on their existing projects). Show 4-6 suggestion chips instead of 3.

  **Files to modify:**
  - `frontend/src/pages/WelcomePage.tsx` — import and use `initialSuggestions` and `analyzeProjectForSuggestions`
  - `frontend/src/data/prompt-suggestions.ts` — may need minor adjustments for WelcomePage context

- [x] **1.4 — Empty state guidance in Builder**
  When BuilderPage loads with a new blank project (no `?prompt=` param, no template), show an empty state in the chat panel with: a short "What would you like to build?" heading, 3-4 clickable example prompts, and a tip about how to iterate ("You can refine your app by describing changes").

  **Files to modify:**
  - `frontend/src/components/ChatInterface/ChatInterface.tsx` — add empty state when no messages
  - `frontend/src/components/ChatInterface/ChatInterface.css`

---

## Phase 2: Error Recovery UX

**Goal:** Give users manual control when auto-repair fails or generation errors out, instead of leaving them stuck.

**Current state:** Auto-repair runs up to 3 attempts automatically. On failure, shows "Unable to auto-fix. Manual intervention needed." toast with only a dismiss button. No retry button, no error details view, no revert suggestion. Chat-level generation errors show plain text — don't use the existing `ErrorMessage` component which already supports `recoverable` prop and `onRetry` callback.

### Tasks

- [x] **2.1 — Add "Try Again" button to RepairStatus on failure**
  When `phase === 'failed'`, show a "Try Again" button that resets `repairAttempts` to 0 and re-triggers auto-repair. Also add a "Revert" button that calls undo to restore the last working state.

  **Files to modify:**
  - `frontend/src/components/RepairStatus/RepairStatus.tsx` — add "Try Again" and "Revert" buttons in failed phase
  - `frontend/src/components/RepairStatus/RepairStatus.css` — style the new buttons
  - `frontend/src/context/PreviewErrorContext.tsx` — add `resetRepairAttempts()` action
  - `frontend/src/components/AppLayout/ErrorOverlay.tsx` — wire up the new actions

- [x] **2.2 — Wire ErrorMessage component into chat for generation failures**
  When `useSubmitPrompt` exhausts retries, render an `ErrorMessage` component in the chat (not plain text) with `recoverable={true}` and `onRetry` that re-submits the same prompt. This reuses the existing `ErrorMessage` component which already has retry/dismiss UI and error classification.

  **Files to modify:**
  - `frontend/src/hooks/useSubmitPrompt.ts` — store last failed prompt for retry
  - `frontend/src/components/ChatInterface/MessageItem.tsx` — render `ErrorMessage` for error-type messages with retry action
  - `frontend/src/context/ChatMessagesContext.tsx` — extend message type to include `onRetry` callback or `retryPrompt` field

- [x] **2.3 — "View Details" error panel**
  Implement the `onViewDetails` callback in ErrorOverlay (currently passed as `undefined`). Show a collapsible panel below RepairStatus that displays: error message, affected file(s), stack trace snippet, and the 3 repair attempts with what was tried. Use the existing error queue from `PreviewErrorContext`.

  **Files to modify:**
  - `frontend/src/components/AppLayout/ErrorOverlay.tsx` — implement details panel
  - `frontend/src/components/AppLayout/ErrorOverlay.css` — style the details panel
  - `frontend/src/context/PreviewErrorContext.tsx` — expose error history for display

- [x] **2.4 — Suggest revert to last working version on repeated failures**
  After auto-repair fails, show a suggestion in chat: "The last working version was [version name]. Would you like to revert?" with a clickable action that calls the existing undo/revert functionality from `VersionContext`.

  **Files to modify:**
  - `frontend/src/context/AutoRepairContext.tsx` — on max attempts, emit a revert suggestion message
  - `frontend/src/components/ChatInterface/MessageItem.tsx` — render action buttons for suggestion messages

---

## Phase 3: Responsive Preview Testing

**Goal:** Provide a systematic way to test generated apps across multiple device sizes, beyond the current single-device toggle.

**Current state:** PreviewPanel has 3 device modes (desktop 100%, tablet 768x1024, mobile 375x667) with rotation support. No multi-device view, no custom dimensions, no viewport presets, no zoom.

### Tasks

- [x] **3.1 — Add popular device presets dropdown**
  Replace the 3 icon buttons with a dropdown that includes common presets: iPhone SE (375x667), iPhone 14 (393x852), iPad (768x1024), iPad Pro (1024x1366), Desktop (100%), plus the current custom rotation toggle. Group by category (Phone / Tablet / Desktop).

  **Files to modify:**
  - `frontend/src/components/PreviewPanel/PreviewToolbar.tsx` — replace buttons with dropdown
  - `frontend/src/components/PreviewPanel/PreviewToolbar.css` — style dropdown
  - `frontend/src/components/PreviewPanel/PreviewPanel.tsx` — update device mode state to support custom dimensions
  - `frontend/src/components/PreviewPanel/PreviewPanel.css` — update `.device-frame` to use dynamic width/height

- [x] **3.2 — Custom dimensions input**
  Add width x height number inputs next to the device dropdown. Typing custom values auto-selects a "Custom" mode. Input fields appear inline, compact (60px wide each), with "x" separator.

  **Files to modify:**
  - `frontend/src/components/PreviewPanel/PreviewToolbar.tsx` — add dimension inputs
  - `frontend/src/components/PreviewPanel/PreviewToolbar.css`
  - `frontend/src/components/PreviewPanel/PreviewPanel.tsx` — support custom dimensions in state

- [x] **3.3 — Zoom control for device frames**
  When viewing tablet/mobile frames, add a zoom slider (50%-150%) so users can inspect details or see the full frame when the preview area is small. Apply CSS `transform: scale()` to `.device-frame`.

  **Files to modify:**
  - `frontend/src/components/PreviewPanel/PreviewToolbar.tsx` — add zoom slider
  - `frontend/src/components/PreviewPanel/PreviewPanel.css` — apply scale transform to device frame
  - `frontend/src/components/PreviewPanel/PreviewPanel.tsx` — manage zoom state

- [x] **3.4 — Multi-device side-by-side view**
  Add a "Compare" toggle that shows mobile + tablet + desktop previews simultaneously in a horizontal scroll container. Each runs its own Sandpack preview iframe at the respective dimensions. Show device labels above each frame.

  **Files to modify:**
  - `frontend/src/components/PreviewPanel/PreviewPanel.tsx` — add compare mode with multiple Sandpack instances
  - `frontend/src/components/PreviewPanel/PreviewPanel.css` — layout for side-by-side frames
  - `frontend/src/components/PreviewPanel/PreviewToolbar.tsx` — add compare toggle button

---

## Phase 4: Modal True Streaming

**Goal:** Make Modal's streaming genuinely incremental instead of potentially buffered, matching OpenRouter's real-time behavior.

**Current state:** Modal Python app uses `TextIteratorStreamer` which yields tokens as generated, wrapped in `StreamingResponse` with SSE format. The backend `modal-client.ts` parses these SSE events. However, buffering may occur at Modal runtime, FastAPI, or network layers. No verification mechanism exists.

### Tasks

- [x] **4.1 — Add timestamp diagnostics to Modal SSE events**
  Add a `timestamp` field to each SSE token event in `app.py` so the client can measure inter-token delays. Add logging in `modal-client.ts` to report average/max inter-token delay and detect batch patterns (e.g., 50 tokens arriving within 1ms = buffered).

  **Files to modify:**
  - `modal-code-ai/app.py` — add `time.time()` to each SSE event payload
  - `backend/lib/ai/modal-client.ts` — log inter-token timing in `parseSSEToken()`

- [x] **4.2 — Fix Modal FastAPI endpoint for async streaming**
  Convert `generate_stream_api` to an async generator to avoid synchronous blocking. Add explicit flush hints. Ensure `StreamingResponse` uses `media_type="text/event-stream"` (already done) and disable any proxy buffering.

  **Files to modify:**
  - `modal-code-ai/app.py` — convert to `async def event_stream()` with `yield`, add `Connection: keep-alive` header

- [x] **4.3 — Add chunked encoding and flush control**
  Configure the Modal endpoint to use chunked transfer encoding and send a flush byte after each token. Add `X-Content-Type-Options: nosniff` to prevent browsers from buffering. Test with `curl --no-buffer` to verify token-by-token delivery.

  **Files to modify:**
  - `modal-code-ai/app.py` — add response headers for chunked encoding
  - `backend/lib/ai/modal-client.ts` — verify chunk-by-chunk reading of response body

- [x] **4.4 — Add streaming progress indicator parity with OpenRouter**
  Ensure Modal streaming triggers the same `onChunk` callbacks at similar granularity as OpenRouter. If tokens arrive in batches despite fixes, add client-side token dripping (release accumulated tokens at a steady rate) to smooth the UX.

  **Files to modify:**
  - `backend/lib/ai/modal-client.ts` — add optional token dripping logic
  - `backend/lib/core/streaming-generator.ts` — ensure Modal path uses same progress events as OpenRouter

---

## Priority Recommendation

| Phase | Impact | Effort | Suggested Order |
|-------|--------|--------|-----------------|
| Phase 1 (Onboarding) | High — reduces user drop-off | Low-Medium | 1st |
| Phase 2 (Error Recovery) | High — reduces user frustration | Medium | 2nd |
| Phase 3 (Responsive Preview) | Medium — improves quality assurance | Medium | 3rd |
| Phase 4 (Modal Streaming) | Low-Medium — only affects Modal users | Medium | 4th |

> **Recommendation:** Start with Phase 1 + Phase 2 for maximum MVP impact. These address the two biggest UX gaps: getting users started and keeping them unblocked.
