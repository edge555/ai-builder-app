
# Plan: Fix Diff Viewer Showing Incorrect Changes

## Problem Summary
When making small modifications to a project, the diff viewer in the chat shows incorrect or excessive changes. This happens because the diff computation doesn't properly normalize content before comparison.

## Root Cause Analysis
The edge function (`supabase/functions/modify/index.ts`) has two issues:

1. **Missing whitespace normalization**: Lines are split but trailing whitespace isn't trimmed before comparison
2. **No post-processing for identical normalized content**: When Prettier reformats code, trailing whitespace changes appear as actual changes in the diff

## Solution

### Step 1: Add line normalization to splitLines function
Modify the `splitLines` function to optionally trim trailing whitespace from each line before comparison:

```text
Location: supabase/functions/modify/index.ts (around line 791)
Change: Add a normalizeLine helper and update splitLines
```

### Step 2: Normalize lines before Myers diff comparison
In the `myersDiff` function, normalize lines for comparison while preserving original content for display:

```text
Location: supabase/functions/modify/index.ts (around line 798-833)
Change: Compare normalized lines but store original content
```

### Step 3: Add collapse logic for spurious add/delete pairs
When a line differs only in whitespace, the diff shows add+delete when it should show nothing. Add post-processing to collapse these:

```text
Location: supabase/functions/modify/index.ts (around line 874)
Change: Add collapseIdenticalChanges function after backtrackMyers
```

### Step 4: Skip files with only whitespace changes
Before adding a modified file to diffs, verify there are actual non-whitespace changes:

```text
Location: supabase/functions/modify/index.ts (around line 1024-1026)
Change: Normalize content before equality check and filter out whitespace-only hunks
```

## Technical Details

### New Helper Functions to Add
```text
// Normalize a line by trimming trailing whitespace
function normalizeLine(line: string): string {
  return line.trimEnd();
}

// Collapse adjacent add/delete pairs with identical trimmed content
function collapseIdenticalOps(ops: LineOp[]): LineOp[] {
  // Convert spurious add+delete or delete+add pairs to context
  // when the trimmed content is identical
}

// Normalize full content for comparison
function normalizeContent(content: string): string {
  return content.split('\n').map(l => l.trimEnd()).join('\n').trimEnd();
}
```

### Updated computeDiffs Logic
```text
// Before computing diff, check if normalized content is actually different
const normalizedOld = normalizeContent(oldText);
const normalizedNew = normalizeContent(newText);
if (normalizedOld === normalizedNew) continue; // Skip whitespace-only changes

// Compute diff with normalized lines for comparison
const oldLinesNorm = splitLines(oldText).map(normalizeLine);
const newLinesNorm = splitLines(newText).map(normalizeLine);
const ops = myersDiff(oldLinesNorm, newLinesNorm);

// Only include if there are actual changes (not just context)
const hasRealChanges = ops.some(op => op.type !== 'context');
if (!hasRealChanges) continue;
```

## Files to Modify
1. `supabase/functions/modify/index.ts` - Main changes to diff computation

## Expected Outcome
After this fix:
- Small modifications will show only the actual changed lines
- Whitespace-only changes will be excluded from diffs
- The diff viewer will accurately reflect what was modified
