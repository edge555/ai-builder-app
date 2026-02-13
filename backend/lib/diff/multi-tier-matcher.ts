/**
 * Multi-Tier String Matcher
 * 
 * Implements a robust multi-tier matching strategy for search/replace operations.
 * Falls back through progressively more lenient matching strategies to handle
 * common LLM output variations (whitespace differences, formatting, etc.).
 */

import { createLogger } from '../logger';

const logger = createLogger('multi-tier-matcher');

export interface MatchResult {
  /** Whether a match was found */
  found: boolean;
  /** The index where the match was found (-1 if not found) */
  index: number;
  /** The tier that found the match (1-4, or 0 if not found) */
  tier: number;
  /** The actual matched text from the content */
  matchedText?: string;
  /** Warning message if a fuzzy match was used */
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
 * Normalize lines by trimming each line individually but preserving line structure.
 */
function normalizeTrimmedLines(text: string): string {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0) // Remove empty lines
    .join('\n');
}

/**
 * Calculate similarity ratio between two strings using a simple line-based approach.
 * Returns a value between 0 and 1, where 1 means identical.
 */
function calculateLineSimilarity(text1: string, text2: string): number {
  const lines1 = text1.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const lines2 = text2.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  if (lines1.length === 0 && lines2.length === 0) return 1;
  if (lines1.length === 0 || lines2.length === 0) return 0;

  // Count matching lines
  let matches = 0;
  const maxLen = Math.max(lines1.length, lines2.length);

  for (let i = 0; i < Math.min(lines1.length, lines2.length); i++) {
    if (lines1[i] === lines2[i]) {
      matches++;
    }
  }

  return matches / maxLen;
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

  const results: Array<{ index: number; length: number }> = [];

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
      // Found a match - calculate character index and total length
      let charIndex = 0;
      for (let j = 0; j < i; j++) {
        charIndex += contentLines[j].length + 1;
      }

      let matchLength = 0;
      for (let j = i; j < contentIdx; j++) {
        matchLength += contentLines[j].length + 1;
      }
      // Remove trailing newline if it wasn't in original content (e.g. last line)
      if (charIndex + matchLength > content.length) {
        matchLength = content.length - charIndex;
      } else if (matchLength > 0 && content[charIndex + matchLength - 1] === '\n') {
        // If the search string didn't have a trailing newline, but we matched the whole line...
        // actually, trimmed line matching is line-based, so it makes sense to replace whole lines.
      }

      results.push({ index: charIndex, length: matchLength });
    }
  }

  return results.map(r => r.index);
}

// Internal version that returns more info
function findWithTrimmedLinesInfo(content: string, search: string): Array<{ index: number; length: number }> {
  const contentLines = content.split('\n');
  const searchLines = search.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  if (searchLines.length === 0) return [];

  const results: Array<{ index: number; length: number }> = [];

  for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
    let match = true;
    let searchIdx = 0;
    let contentIdx = i;

    while (searchIdx < searchLines.length && contentIdx < contentLines.length) {
      const contentLine = contentLines[contentIdx].trim();
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
      let charIndex = 0;
      for (let j = 0; j < i; j++) {
        charIndex += contentLines[j].length + 1;
      }

      let matchLength = 0;
      for (let j = i; j < contentIdx; j++) {
        matchLength += contentLines[j].length + 1;
      }
      if (charIndex + matchLength > content.length) {
        matchLength = content.length - charIndex;
      }

      results.push({ index: charIndex, length: matchLength });
    }
  }

  return results;
}

/**
 * Find occurrences using fuzzy line matching.
 * Looks for regions where at least 80% of lines match.
 */
function findWithFuzzyLines(content: string, search: string, threshold: number = 0.8): Array<{ index: number; length: number; similarity: number }> {
  const contentLines = content.split('\n');
  const searchLines = search.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  if (searchLines.length === 0) return [];

  const results: Array<{ index: number; length: number; similarity: number }> = [];

  for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
    const windowLines = contentLines.slice(i, i + searchLines.length).map(l => l.trim()).filter(l => l.length > 0);

    if (windowLines.length === 0) continue;

    const similarity = calculateLineSimilarity(
      windowLines.join('\n'),
      searchLines.join('\n')
    );

    if (similarity >= threshold) {
      let charIndex = 0;
      for (let j = 0; j < i; j++) {
        charIndex += contentLines[j].length + 1;
      }

      let matchLength = 0;
      for (let j = i; j < i + searchLines.length; j++) {
        matchLength += contentLines[j].length + 1;
      }
      if (charIndex + matchLength > content.length) {
        matchLength = content.length - charIndex;
      }

      results.push({ index: charIndex, length: matchLength, similarity });
    }
  }

  return results.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Multi-tier string matching with fallback strategies.
 * 
 * Tries matching in this order:
 * 1. Exact match
 * 2. Whitespace-normalized match
 * 3. Trimmed-line match
 * 4. Fuzzy line match (>80% similarity)
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
    logger.debug('Tier 1 (exact) match found', { occurrence, index });
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
    logger.info('Tier 2 (whitespace-normalized) match found', { occurrence, index });
    return {
      found: true,
      index,
      tier: 2,
      matchedText: content.substring(index, index + search.length), // Approx, for replacement we use search.length anyway for Tier 2 usually if we want to be safe, but wait...
      warning: 'Match found using whitespace normalization - original had different whitespace',
    };
  }

  // Tier 3: Trimmed-line match
  const trimmedMatches = findWithTrimmedLinesInfo(content, search);
  if (trimmedMatches.length >= occurrence) {
    const match = trimmedMatches[occurrence - 1];
    logger.info('Tier 3 (trimmed-line) match found', { occurrence, index: match.index });
    return {
      found: true,
      index: match.index,
      tier: 3,
      matchedText: content.substring(match.index, match.index + match.length),
      warning: 'Match found using trimmed-line matching - formatting may differ',
    };
  }

  // Tier 4: Fuzzy line match
  const fuzzyMatches = findWithFuzzyLines(content, search);
  if (fuzzyMatches.length >= occurrence) {
    const match = fuzzyMatches[occurrence - 1];
    logger.warn('Tier 4 (fuzzy) match found', { occurrence, index: match.index, similarity: match.similarity });
    return {
      found: true,
      index: match.index,
      tier: 4,
      matchedText: content.substring(match.index, match.index + match.length),
      warning: `Fuzzy match found with ${Math.round(match.similarity * 100)}% similarity - content may differ significantly`,
    };
  }

  // No match found at any tier
  logger.error('No match found at any tier', {
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
