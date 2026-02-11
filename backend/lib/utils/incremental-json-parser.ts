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
 */
export function parseIncrementalFiles(text: string, startFrom: number = 0): {
  files: ParsedFile[];
  lastParsedIndex: number;
} {
  const files: ParsedFile[] = [];
  let currentIndex = startFrom;

  // Look for file objects in the "files" array
  // Expected format: { "files": [ { "path": "...", "content": "..." }, ... ] }
  
  while (currentIndex < text.length) {
    // Find the start of a file object
    const fileObjStart = text.indexOf('{"path":', currentIndex);
    if (fileObjStart === -1) break;

    // Try to find the matching closing brace
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    let fileObjEnd = -1;

    for (let i = fileObjStart; i < text.length; i++) {
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
            fileObjEnd = i + 1;
            break;
          }
        }
      }
    }

    // If we found a complete object, try to parse it
    if (fileObjEnd !== -1) {
      const fileObjText = text.substring(fileObjStart, fileObjEnd);
      try {
        const fileObj = JSON.parse(fileObjText);
        if (fileObj.path && typeof fileObj.content === 'string') {
          files.push({
            path: fileObj.path,
            content: fileObj.content,
            startIndex: fileObjStart,
            endIndex: fileObjEnd,
          });
        }
      } catch {
        // Invalid JSON, skip this object
      }
      currentIndex = fileObjEnd;
    } else {
      // No complete object found, stop parsing
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
