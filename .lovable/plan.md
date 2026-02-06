
# Plan: Enforce Modular Architecture in Project Generation

## Status: ✅ IMPLEMENTED

## Changes Made

### 1. Updated Edge Function Prompt ✅
**File:** `supabase/functions/generate-stream/index.ts`

- Replaced minimal 4-file prompt with comprehensive modular architecture requirements
- Added mandatory folder structure (components/ui/, components/layout/, components/features/, hooks/, types/)
- Added explicit file count requirements (minimum 10-15 files)
- Added component rules, CSS rules, and hook extraction requirements
- Added concrete example showing 22 files for a Todo app

### 2. Added Architecture Validation ✅
- Created `validateModularArchitecture()` function that checks:
  - Minimum 8 files generated
  - /components/ folder exists
  - /hooks/ folder exists
  - /types/ folder exists
  - App.tsx under 60 lines

### 3. Added Auto-Retry Logic ✅
- If first generation fails validation, automatically retries with stricter emphasis
- Retry prompt includes "CRITICAL - PREVIOUS ATTEMPT FAILED VALIDATION" warning
- Explicitly tells model to NOT put everything in App.tsx
- Falls back gracefully if retry still fails

## Expected Outcome

Generated projects will now include:
- `src/types/index.ts` with TypeScript interfaces
- `src/hooks/useXxx.ts` for reusable logic
- `src/components/ui/` for Button, Input, Card
- `src/components/layout/` for Header, Container
- `src/components/features/` for domain-specific components
- Co-located CSS files for each component
- Small, focused App.tsx (~30-40 lines)
