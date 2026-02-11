/**
 * Multi-Tier String Matcher (Simplified for Deno Edge Functions)
 * 
 * Implements a robust multi-tier matching strategy for search/replace operations.
 * Falls back through progressively more lenient matching strategies to handle
 * common LLM output variations (whitespace differences, formatting, etc.).
 * 
 * This is a simplified version of backend/lib/diff/multi-tier-matcher.ts
 * Implements Tiers 1-3 only (skips Tier 4 fuzzy matching for simplicity).
 */

export interface MatchResult {
  /** Whether a match was found */
  found: boolean;
  /** The index where the match was found (-1 if not found) */
  index: number;
  /** The tier that found the match (1-3, or 0 if not found) */
  tier: number;
  /** The actual matched text from the content */
  matchedText?: string;
  /** Warning message if a non-exact match was used */
  warning?: string;
}

/**
 * Normalize whitespace by collapsing runs of whitespace into single spaces
 * and trimming leading/trailing whitespace from each line.
 */
function normalizeWhitespace(text: string): string {
  return text
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find all occurrences of a search string in content using exact matching.
 */
function findAllExact(content: string, search: string): number[] {
  const indices: number[] = [];
  let index = 0;
  
  while ((index = content.indexOf(search, index)) !== -1) {
    indices.push(index);
    index += search.length;
  }
  
  return indices;
}

/**
 * Find occurrences using whitespace-normalized matching.
 * Returns the index in the original content where the match starts.
 */
function findWithNormalizedWhitespace(content: string, search: string): number[] {
  const normalizedContent = normalizeWhitespace(content);
  const normalizedSearch = normalizeWhitespace(search);
  
  const indices: number[] = [];
  let normIndex = 0;
  
  while ((normIndex = normalizedContent.indexOf(normalizedSearch, normIndex)) !== -1) {
    // Map back to original content index (approximate)
    // This is a heuristic - we find the position in the original that corresponds
    // to this normalized position
    let originalIndex = 0;
    let normalizedPos = 0;
    
    for (let i = 0; i < content.length && normalizedPos < normIndex; i++) {
      const char = content[i];
      if (char === '\n' || char === '\r' || char === '\t' || char === ' ') {
        // Whitespace in original maps to potential space in normalized
        if (normalizedContent[normalizedPos] === ' ') {
          normalizedPos++;
        }
      } else {
        // Non-whitespace character
        if (normalizedContent[normalizedPos] === char) {
          normalizedPos++;
        }
      }
      originalIndex = i + 1;
    }
    
    indices.push(originalIndex);
    normIndex += normalizedSearch.length;
  }
  
  return indices;
}

/**
 * Find occurrences using trimmed-line matching.
 * Looks for a sequence of lines that match when trimmed.
 */
function findWithTrimmedLines(content: string, search: string): number[] {
  const contentLines = content.split('\n');
  const searchLines = search.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  if (searchLines.length === 0) return [];
  
  const indices: number[] = [];
  
  for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
    let match = true;
    let searchIdx = 0;
    let contentIdx = i;
    
    // Try to match all search lines starting from this position
    while (searchIdx < searchLines.length && contentIdx < contentLines.length) {
      const contentLine = contentLines[contentIdx].trim();
      
      // Skip empty lines in content
      if (contentLine.length === 0) {
        contentIdx++;
        continue;
      }
      
      if (contentLine !== searchLines[searchIdx]) {
        match = false;
        break;
      }
      
      searchIdx++;
      contentIdx++;
    }
    
    if (match && searchIdx === searchLines.length) {
      // Found a match - calculate the character index
      let charIndex = 0;
      for (let j = 0; j < i; j++) {
        charIndex += contentLines[j].length + 1; // +1 for newline
      }
      indices.push(charIndex);
    }
  }
  
  return indices;
}

/**
 * Multi-tier string matching with fallback strategies.
 * 
 * Tries matching in this order:
 * 1. Exact match
 * 2. Whitespace-normalized match
 * 3. Trimmed-line match
 * 
 * @param content - The content to search in
 * @param search - The search string
 * @param occurrence - Which occurrence to find (1-indexed, default 1)
 * @returns MatchResult with details about the match
 */
export function multiTierMatch(content: string, search: string, occurrence: number = 1): MatchResult {
  if (!search || search.length === 0) {
    return { found: false, index: -1, tier: 0 };
  }
  
  if (occurrence < 1) {
    occurrence = 1;
  }
  
  // Tier 1: Exact match
  const exactMatches = findAllExact(content, search);
  if (exactMatches.length >= occurrence) {
    const index = exactMatches[occurrence - 1];
    return {
      found: true,
      index,
      tier: 1,
      matchedText: content.substring(index, index + search.length),
    };
  }
  
  // Tier 2: Whitespace-normalized match
  const normalizedMatches = findWithNormalizedWhitespace(content, search);
  if (normalizedMatches.length >= occurrence) {
    const index = normalizedMatches[occurrence - 1];
    return {
      found: true,
      index,
      tier: 2,
      matchedText: content.substring(index, index + search.length),
      warning: 'Match found using whitespace normalization - original had different whitespace',
    };
  }
  
  // Tier 3: Trimmed-line match
  const trimmedMatches = findWithTrimmedLines(content, search);
  if (trimmedMatches.length >= occurrence) {
    const index = trimmedMatches[occurrence - 1];
    return {
      found: true,
      index,
      tier: 3,
      matchedText: content.substring(index, Math.min(index + search.length * 2, content.length)),
      warning: 'Match found using trimmed-line matching - formatting may differ',
    };
  }
  
  // No match found at any tier
  console.error('No match found at any tier', {
    searchLength: search.length,
    searchPreview: search.substring(0, 100),
    occurrence,
  });
  
  return { found: false, index: -1, tier: 0 };
}

/**
 * Apply a search/replace operation using multi-tier matching.
 * 
 * @param content - The content to modify
 * @param search - The search string
 * @param replace - The replacement string
 * @param occurrence - Which occurrence to replace (1-indexed, default 1)
 * @returns Object with success status, modified content, and any warnings
 */
export function applySearchReplace(
  content: string,
  search: string,
  replace: string,
  occurrence: number = 1
): { success: boolean; content?: string; warning?: string; error?: string } {
  const matchResult = multiTierMatch(content, search, occurrence);
  
  if (!matchResult.found) {
    const searchPreview = search.length > 200 ? search.substring(0, 200) + '...' : search;
    return {
      success: false,
      error: `Search text not found (occurrence ${occurrence}). Search preview: ${searchPreview}`,
    };
  }
  
  // For exact matches (tier 1), we can do a simple replacement
  if (matchResult.tier === 1) {
    const before = content.substring(0, matchResult.index);
    const after = content.substring(matchResult.index + search.length);
    return {
      success: true,
      content: before + replace + after,
    };
  }
  
  // For other tiers, we need to be more careful
  // Extract the actual matched region and replace it
  const matchLength = matchResult.matchedText?.length ?? search.length;
  const before = content.substring(0, matchResult.index);
  const after = content.substring(matchResult.index + matchLength);
  
  return {
    success: true,
    content: before + replace + after,
    warning: matchResult.warning,
  };
}
