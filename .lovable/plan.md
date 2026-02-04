
Goal
- Fix the “wrong diff” in the chat diff viewer where an unchanged line can appear as both (+) and (-), e.g.
  - + import React, { useState } from 'react';
  - - import React, { useState } from 'react';
- Ensure small edits produce stable, minimal diffs.

What’s happening (root cause)
- The frontend renders exactly what the `modify` edge function returns (`backend.functions.invoke('modify')` in `src/context/ChatContext.tsx`), so the problem is in `supabase/functions/modify/index.ts`.
- The current edge diff logic is a minimal Myers diff:
  - It compares normalized lines (good), but it can still “misalign” when there are repeated/duplicate lines (imports, braces, blank lines, etc.).
  - When that happens, Myers may output a delete+add of the same line content (a “false move”), even though the line didn’t really change.
- The current post-processing (`collapseIdenticalChanges`) only collapses *adjacent* add/delete pairs. In a misalignment case, the matching delete and add are often not adjacent, so they survive and show up in the UI.

Key design change
- Make the diff algorithm more stable by anchoring obviously-unchanged lines before running Myers/LCS on the remaining segments.
- Preserve original (raw) line content for display, while using normalized content only for comparisons.

Implementation plan (code changes only; no new dependencies)

1) Update diff representation to keep both raw and normalized lines
Where: `supabase/functions/modify/index.ts` near `splitLines` / `myersDiff`
- Introduce an internal line type:
  - `type Line = { raw: string; norm: string }`
- Convert text to `Line[]` once per file:
  - `raw = splitLines(text)`
  - `norm = raw.map(normalizeLine)`
  - store as `{ raw, norm }` pairs
Why:
- Lets us compare with `norm`, but output `raw` (so the diff viewer matches the real file content).

2) Add “anchor segmentation” before Myers to prevent false moves
Where: same file, in the “compute diffs for modified file” path (around where `myersDiff(splitLines(oldText), splitLines(newText))` is called)
Algorithm:
- Build anchors where old and new are obviously aligned:
  - For each index `i` while `i < min(oldLen, newLen)`:
    - if `old[i].norm === new[i].norm`, treat it as a guaranteed context anchor
- Split the file into segments separated by these anchor runs:
  - Segment A: lines before first anchor run
  - Segment B/C/...: between anchor runs
  - Segment last: after last anchor run
- For each non-anchor segment, run Myers (or LCS) *within that segment*.
- For anchor runs, emit `context` ops directly.
Why this fixes your symptom:
- If a line is unchanged and still in the same position, we force it to remain context.
- This dramatically reduces the “same line shows as + and -” caused by global misalignment across repeated lines.

3) Fix Myers backtracking to output “new-side” context and raw text
Where: `myersDiff` + `backtrackMyers` in `supabase/functions/modify/index.ts`
Changes:
- Keep comparison on `.norm`, but when emitting operations:
  - `context` should use `newRaw` (or at least `b` side), not `a`, so it reflects the current formatting
  - `add` uses `newRaw`
  - `delete` uses `oldRaw`
- Remove the current behavior where you pass `aNorm/bNorm` into backtrack (that loses the raw text and can worsen edge cases).
Outcome:
- Returned diff content matches the actual updated file lines.
- Context lines are consistent with “new file” formatting.

4) Improve post-processing beyond “adjacent pair collapse”
Where: after ops are produced (before `buildHunksFromOps`)
Add a more robust cleanup pass for false moves:
- Within each hunk-window (or within each segment result), detect matching delete/add lines with identical `.norm` that appear “close” (configurable window, e.g., within 8–15 ops) and convert them into context lines in-place.
- Guardrails to avoid hiding real moves:
  - Only apply this “nearby pairing” when:
    - the delete and add norms are identical AND
    - there is no other non-context change between them that uses the same norm (avoid over-collapsing repeated identical lines) AND
    - the file’s normalized content differs (we already skip whitespace-only files)
Why:
- If Myers still produces a small misalignment, we can remove the remaining “+/- identical” noise even when the pair isn’t adjacent.

5) Add targeted debug logging (temporary, low volume)
Where: in the modified-file diff computation block
- If we detect identical `add` and `delete` lines after cleanup, log:
  - file path
  - counts of add/delete/context
  - a small sample of problematic lines (first 3 norms)
Why:
- Lets us verify in Supabase function logs whether the algorithm is still producing the bad pattern and for which files.
- We can later remove/disable once confirmed fixed.

6) Validate end-to-end with a reproducible scenario
Steps:
- Create a tiny change (e.g., add a single character to a component text) where you currently observe:
  - unchanged import lines showing as both + and -
- After the change:
  - Confirm the “import React…” line is context (no +/-) unless it truly moved positions
  - Confirm only the intended changed line(s) show as add/delete

Files involved
- `supabase/functions/modify/index.ts` (only file that needs changes for this issue)

Risks / trade-offs
- Any algorithm that “hides moves” can technically suppress legitimate moved-line diffs.
- The anchor approach is conservative: it only forces context when the line is unchanged AND at the same index, which is the common case you’re describing.
- The “nearby pairing” cleanup will be implemented with guardrails and a small window to reduce the chance of masking real moves.

Acceptance criteria
- For small edits, the diff viewer does not show identical lines as both added and removed.
- Diffs are stable across repeated lines (imports, blank lines, braces).
- Whitespace-only changes remain filtered out as before.
