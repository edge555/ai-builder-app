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

export interface ParseWarning {
  type: 'invalid_object' | 'duplicate_file';
  message: string;
  path?: string;
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
  warnings: ParseWarning[];
  lastParsedIndex: number;
} {
  const files: ParsedFile[] = [];
  const warnings: ParseWarning[] = [];
  let currentIndex = startFrom;
  const seenPaths = new Set<string>();

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

    // Detect { "files": [ ... ] } wrapper and skip into the array so we can
    // parse inner file objects incrementally as they stream in.
    const lookahead = text.substring(currentIndex, currentIndex + 50);
    const wrapperMatch = lookahead.match(/^\{\s*"files"\s*:\s*\[/);
    if (wrapperMatch) {
      currentIndex += wrapperMatch[0].length;
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
        // Handle wrapped format: { "files": [{ "path": "...", "content": "..." }, ...] }
        if (obj.files && Array.isArray(obj.files)) {
          for (const fileObj of obj.files) {
            if (fileObj.path && typeof fileObj.content === 'string') {
              if (seenPaths.has(fileObj.path)) {
                warnings.push({
                  type: 'duplicate_file',
                  message: `Duplicate streamed file ignored: ${fileObj.path}`,
                  path: fileObj.path,
                  startIndex: startPos,
                  endIndex: endPos,
                });
                continue;
              }

              seenPaths.add(fileObj.path);
              files.push({
                path: fileObj.path,
                content: fileObj.content,
                startIndex: startPos,
                endIndex: endPos,
              });
            }
          }
        } else if (obj.path && typeof obj.content === 'string') {
          if (seenPaths.has(obj.path)) {
            warnings.push({
              type: 'duplicate_file',
              message: `Duplicate streamed file ignored: ${obj.path}`,
              path: obj.path,
              startIndex: startPos,
              endIndex: endPos,
            });
            currentIndex = endPos;
            continue;
          }

          seenPaths.add(obj.path);
          // Handle bare format: { "path": "...", "content": "..." }
          files.push({
            path: obj.path,
            content: obj.content,
            startIndex: startPos,
            endIndex: endPos,
          });
        } else {
          warnings.push({
            type: 'invalid_object',
            message: 'Skipped streamed JSON object that did not match the expected file shape',
            startIndex: startPos,
            endIndex: endPos,
          });
        }
      } catch {
        warnings.push({
          type: 'invalid_object',
          message: 'Skipped malformed streamed JSON object',
          startIndex: startPos,
          endIndex: endPos,
        });
      }
      currentIndex = endPos;
    } else {
      // Incomplete object found, stop parsing here
      break;
    }
  }

  return {
    files,
    warnings,
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
