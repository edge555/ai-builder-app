
# Plan: Enforce Modular Architecture in Project Generation

## Problem Identified

The project generation produces only basic files (`App.tsx`, `index.css`, `main.tsx`, `index.html`) instead of a modular senior-developer-style structure because:

| Component | Issue |
|-----------|-------|
| `generate-stream` edge function | Uses minimal prompt asking for only 4 files |
| Backend `generation-prompt.ts` | Has comprehensive modular prompt but not used by streaming |
| Validation | Architecture validator exists but only logs warnings, doesn't enforce |

## Solution Overview

Update the streaming generation edge function to use a comprehensive prompt that enforces modular architecture, requiring:
- Proper component separation (`ui/`, `layout/`, `features/`)
- Custom hooks extraction (`hooks/`)
- TypeScript types (`types/`)
- Co-located CSS files
- Minimum 8-10 files for any app

---

## Technical Changes

### 1. Update Edge Function Prompt

**File:** `supabase/functions/generate-stream/index.ts`

Replace `buildPreviewCompatiblePrompt()` with a comprehensive modular architecture prompt:

```text
Required Structure:
- src/main.tsx (entry point only)
- src/App.tsx (layout/routing only, max 50 lines)
- src/index.css (global styles with CSS variables)
- src/types/index.ts (TypeScript interfaces)
- src/hooks/*.ts (custom hooks for reusable logic)
- src/components/ui/*.tsx (Button, Input, Card)
- src/components/layout/*.tsx (Header, Footer)
- src/components/features/*.tsx (domain components)

Minimum 10-15 files for any non-trivial app
Each component has co-located .css file
```

### 2. Add Architecture Enforcement to Prompt

The updated prompt will include explicit examples and requirements:

| Requirement | Enforcement |
|-------------|-------------|
| App.tsx size | Max 50 lines - just imports and layout composition |
| Component files | Minimum 3 UI + 2 layout + 2 feature components |
| Hooks | Minimum 1 custom hook (e.g., `useLocalStorage`) |
| Types | Required `types/index.ts` with interfaces |
| CSS | Each component must have its own `.css` file |

### 3. Add Build Validation for Architecture

**File:** `supabase/functions/generate-stream/index.ts`

Add post-generation validation that checks for modular structure:

```text
Validation checks:
- Files in /components/ folder exist
- At least one file in /hooks/
- types/index.ts exists
- App.tsx under 60 lines
```

If validation fails, trigger a repair request with specific guidance.

### 4. Add Auto-Retry for Non-Modular Output

If the generated project has fewer than 8 files or lacks proper structure, automatically retry with more explicit instructions:

```text
Retry prompt additions:
- "You MUST create separate component files"
- "App.tsx should ONLY import and compose components"
- "Extract state logic to custom hooks"
```

---

## Updated Prompt Content

The new prompt will include:

**Mandatory Structure Example:**
```text
For a Todo app, generate:
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx (imports only, ~30 lines)
│   ├── index.css (CSS variables + base styles)
│   ├── types/
│   │   └── index.ts (Todo interface)
│   ├── hooks/
│   │   └── useLocalStorage.ts
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   ├── Button.css
│   │   │   ├── Input.tsx
│   │   │   └── Input.css
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   └── Header.css
│   │   └── features/
│   │       ├── TodoItem.tsx
│   │       ├── TodoItem.css
│   │       ├── TodoList.tsx
│   │       ├── TodoList.css
│   │       ├── AddTodoForm.tsx
│   │       └── AddTodoForm.css
```

---

## File Changes Summary

| File | Change |
|------|--------|
| `supabase/functions/generate-stream/index.ts` | Replace minimal prompt with comprehensive modular architecture prompt; add structure validation; add retry logic for non-modular output |

---

## Expected Outcome

After this change, generated projects will include:

**Before (4 files):**
```text
index.html
src/App.tsx (everything in one file)
src/main.tsx
src/index.css
```

**After (12+ files):**
```text
index.html
src/main.tsx
src/App.tsx (small, just composition)
src/index.css (CSS variables)
src/types/index.ts
src/hooks/useLocalStorage.ts
src/components/ui/Button.tsx
src/components/ui/Button.css
src/components/ui/Input.tsx
src/components/layout/Header.tsx
src/components/layout/Header.css
src/components/features/[Feature].tsx
src/components/features/[Feature].css
...
```

---

## Implementation Priority

1. Update `buildPreviewCompatiblePrompt()` with comprehensive modular requirements
2. Add structure validation function
3. Add retry logic if structure is insufficient
4. Test with sample prompts to verify modular output
