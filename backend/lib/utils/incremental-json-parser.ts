/**
 * Incremental JSON Parser
 * Detects complete JSON objects in a streaming response.
 * 
 * This is a simplified parser for detecting complete file objects
 * in the Gemini streaming response format.
 */

export interface ParsedFile {
  path: string;
  content: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Attempts to extract complete file objects from accumulated JSON text.
 * Returns an array of parsed files and the index where parsing stopped.
 *
 * Optimized for O(n) complexity - processes each character once in a single pass.
 */
export function parseIncrementalFiles(text: string, startFrom: number = 0): {
  files: ParsedFile[];
  lastParsedIndex: number;
} {
  const files: ParsedFile[] = [];
  let currentIndex = startFrom;

  // Single-pass algorithm: scan character-by-character without indexOf
  // Expected format: { "path": "...", "content": "..." }{ "path": "...", ... }

  while (currentIndex < text.length) {
    // Skip whitespace and commas between objects
    while (currentIndex < text.length && /[\s,]/.test(text[currentIndex])) {
      currentIndex++;
    }

    if (currentIndex >= text.length) break;

    // We expect file objects to start with '{'
    if (text[currentIndex] !== '{') {
      currentIndex++;
      continue;
    }

    // Try to find the matching closing brace for this object
    const startPos = currentIndex;
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    let endPos = -1;

    for (let i = startPos; i < text.length; i++) {
      const char = text[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            endPos = i + 1;
            break;
          }
        }
      }
    }

    // If we found a complete object, try to parse it
    if (endPos !== -1) {
      const objText = text.substring(startPos, endPos);
      try {
        const obj = JSON.parse(objText);
        // Only accept objects with required file fields
        if (obj.path && typeof obj.content === 'string') {
          files.push({
            path: obj.path,
            content: obj.content,
            startIndex: startPos,
            endIndex: endPos,
          });
        }
      } catch {
        // Invalid JSON, skip this object
      }
      currentIndex = endPos;
    } else {
      // Incomplete object found, stop parsing here
      break;
    }
  }

  return {
    files,
    lastParsedIndex: currentIndex,
  };
}

/**
 * Estimates the total number of files from partial JSON.
 * Looks for array length indicators or counts file objects.
 */
export function estimateTotalFiles(text: string): number {
  // Try to count complete and incomplete file objects
  const filePathMatches = text.match(/"path"\s*:/g);
  return filePathMatches ? filePathMatches.length : 0;
}

/**
 * Checks if the JSON response appears to be complete.
 */
export function isResponseComplete(text: string): boolean {
  // Simple heuristic: check if we have balanced braces and the text ends properly
  const trimmed = text.trim();
  if (!trimmed.endsWith('}')) return false;

  let braceCount = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') braceCount++;
      else if (char === '}') braceCount--;
    }
  }

  return braceCount === 0;
}
