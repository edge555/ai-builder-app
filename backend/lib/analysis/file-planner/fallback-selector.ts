/**
 * Fallback Selector
 *
 * Heuristic-based file selection when AI planning fails.
 * Uses keyword matching, file name matching, and intent patterns.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import type { ProjectState } from '@ai-app-builder/shared';
import type { ChunkIndex, FilePlannerResult, ScoredFile } from './types';

/** Intent patterns for common modification types */
const INTENT_PATTERNS: Array<{
  keywords: string[];
  targetPatterns: string[];
  fileTypes: string[];
}> = [
  {
    keywords: ['add', 'create', 'new', 'component'],
    targetPatterns: ['App.tsx', 'App.jsx', 'index.tsx', 'index.jsx'],
    fileTypes: ['.tsx', '.jsx'],
  },
  {
    keywords: ['style', 'css', 'color', 'layout', 'design', 'theme'],
    targetPatterns: ['.css', '.scss', '.less', 'styles'],
    fileTypes: ['.css', '.scss', '.less'],
  },
  {
    keywords: ['api', 'endpoint', 'route', 'fetch', 'request'],
    targetPatterns: ['route.ts', 'route.js', '/api/'],
    fileTypes: ['.ts', '.js'],
  },
  {
    keywords: ['type', 'interface', 'types'],
    targetPatterns: ['types.ts', 'types/index.ts', 'types.d.ts'],
    fileTypes: ['.ts'],
  },
  {
    keywords: ['config', 'configuration', 'settings'],
    targetPatterns: ['.config.', 'config.ts', 'config.js'],
    fileTypes: ['.ts', '.js', '.json'],
  },
  {
    keywords: ['hook', 'use'],
    targetPatterns: ['hooks/', 'use'],
    fileTypes: ['.ts', '.tsx'],
  },
  {
    keywords: ['util', 'helper', 'utility'],
    targetPatterns: ['utils/', 'helpers/', 'lib/'],
    fileTypes: ['.ts', '.js'],
  },
];

/**
 * FallbackSelector provides heuristic-based file selection
 * when AI planning fails or is unavailable.
 */
export class FallbackSelector {
  /**
   * Select files using heuristics when AI planning fails.
   * Ensures at least one file is always selected.
   */
  select(
    prompt: string,
    chunkIndex: ChunkIndex,
    projectState: ProjectState
  ): FilePlannerResult {
    const files = Object.keys(projectState.files);

    // Score files using different strategies
    const keywordScores = this.scoreByKeywords(prompt, chunkIndex);
    const fileNameScores = this.scoreByFileName(prompt, files);
    const intentScores = this.scoreByIntent(prompt, chunkIndex, files);
    const contentScores = this.scoreByContent(prompt, projectState);

    // Combine and rank scores
    const combinedScores = this.combineScores(
      keywordScores,
      fileNameScores,
      intentScores,
      contentScores
    );

    // Select top files for primary and context
    const { primaryFiles, contextFiles } = this.selectTopFiles(combinedScores, files);

    return {
      primaryFiles,
      contextFiles,
      usedFallback: true,
      reasoning: this.buildReasoning(combinedScores.slice(0, 5)),
    };
  }

  /**
   * Score files by keyword matching.
   * Matches prompt words to symbol names in the chunk index.
   */
  private scoreByKeywords(prompt: string, chunkIndex: ChunkIndex): ScoredFile[] {
    const scores: Map<string, ScoredFile> = new Map();
    const promptWords = this.extractWords(prompt.toLowerCase());

    for (const [, chunk] of chunkIndex.chunks) {
      const symbolWords = this.extractWords(chunk.symbolName.toLowerCase());
      const matchedWords: string[] = [];

      for (const promptWord of promptWords) {
        for (const symbolWord of symbolWords) {
          if (
            symbolWord.includes(promptWord) ||
            promptWord.includes(symbolWord)
          ) {
            matchedWords.push(promptWord);
            break;
          }
        }
      }

      if (matchedWords.length > 0) {
        const existing = scores.get(chunk.filePath);
        const score = matchedWords.length * 10;
        const reason = `Symbol "${chunk.symbolName}" matches: ${matchedWords.join(', ')}`;

        if (existing) {
          existing.score += score;
          existing.matchReasons.push(reason);
        } else {
          scores.set(chunk.filePath, {
            filePath: chunk.filePath,
            score,
            matchReasons: [reason],
          });
        }
      }
    }

    return Array.from(scores.values());
  }


  /**
   * Score files by name matching.
   * Matches prompt to file names (with or without extension).
   */
  private scoreByFileName(prompt: string, files: string[]): ScoredFile[] {
    const scores: ScoredFile[] = [];
    const promptLower = prompt.toLowerCase();
    const promptWords = this.extractWords(promptLower);

    for (const filePath of files) {
      const fileName = this.getFileName(filePath).toLowerCase();
      const fileNameNoExt = fileName.replace(/\.[^.]+$/, '');
      const matchReasons: string[] = [];
      let score = 0;

      // Exact file name match (highest priority)
      if (promptLower.includes(fileName)) {
        score += 50;
        matchReasons.push(`Exact file name match: ${fileName}`);
      }

      // File name without extension match
      if (promptLower.includes(fileNameNoExt) && fileNameNoExt.length > 2) {
        score += 40;
        matchReasons.push(`File name match: ${fileNameNoExt}`);
      }

      // Partial word match in file name
      for (const word of promptWords) {
        if (word.length > 2 && fileNameNoExt.includes(word)) {
          score += 15;
          matchReasons.push(`Partial match: "${word}" in ${fileName}`);
        }
      }

      // Path segment match
      const pathSegments = filePath.toLowerCase().split('/');
      for (const word of promptWords) {
        if (word.length > 2) {
          for (const segment of pathSegments) {
            if (segment.includes(word) && segment !== fileName) {
              score += 5;
              matchReasons.push(`Path match: "${word}" in ${segment}`);
              break;
            }
          }
        }
      }

      if (score > 0) {
        scores.push({ filePath, score, matchReasons });
      }
    }

    return scores;
  }

  /**
   * Score files by content matching.
   * Searches file contents for prompt keywords to find relevant files
   * even when file paths don't match.
   */
  private scoreByContent(
    prompt: string,
    projectState: ProjectState
  ): ScoredFile[] {
    const scores: ScoredFile[] = [];
    const promptWords = this.extractWords(prompt.toLowerCase());
    
    // Skip if no meaningful words
    if (promptWords.length === 0) {
      return scores;
    }

    // Pre-compile regexes for each word to avoid re-creating per file
    const wordRegexes = new Map<string, { global: RegExp; single: RegExp }>();
    for (const word of promptWords) {
      if (word.length > 3) {
        wordRegexes.set(word, {
          global: new RegExp(`\\b${word}\\b`, 'gi'),
          single: new RegExp(`\\b${word}\\b`, 'i'),
        });
      }
    }

    for (const [filePath, content] of Object.entries(projectState.files)) {
      const contentLower = content.toLowerCase();
      const matchReasons: string[] = [];
      let score = 0;

      // Check for keyword matches in content
      for (const [word, regexes] of wordRegexes) {
        // Reset lastIndex for global regex reuse
        regexes.global.lastIndex = 0;
        const matches = contentLower.match(regexes.global);

        if (matches) {
          const count = matches.length;
          // Score based on frequency, but cap to avoid over-weighting
          const wordScore = Math.min(count * 3, 15);
          score += wordScore;
          matchReasons.push(`Content contains "${word}" (${count}x)`);
        }
      }

      // Bonus for files that contain multiple prompt words
      const matchedWords = promptWords.filter(word => {
        const regexes = wordRegexes.get(word);
        if (!regexes) return false;
        regexes.single.lastIndex = 0;
        return regexes.single.test(contentLower);
      });

      if (matchedWords.length > 1) {
        score += matchedWords.length * 5;
        matchReasons.push(`Multiple keywords matched: ${matchedWords.length}`);
      }

      if (score > 0) {
        scores.push({ filePath, score, matchReasons });
      }
    }

    return scores;
  }

  /**
   * Score files by intent patterns.
   * Uses common patterns like "add component → App.tsx".
   */
  private scoreByIntent(
    prompt: string,
    chunkIndex: ChunkIndex,
    files: string[]
  ): ScoredFile[] {
    const scores: Map<string, ScoredFile> = new Map();
    const promptLower = prompt.toLowerCase();

    for (const pattern of INTENT_PATTERNS) {
      // Check if prompt matches any intent keywords
      const matchedKeywords = pattern.keywords.filter((kw) =>
        promptLower.includes(kw)
      );

      if (matchedKeywords.length === 0) continue;

      // Find files matching the target patterns
      for (const filePath of files) {
        const filePathLower = filePath.toLowerCase();
        let matched = false;
        let reason = '';

        for (const targetPattern of pattern.targetPatterns) {
          if (filePathLower.includes(targetPattern.toLowerCase())) {
            matched = true;
            reason = `Intent "${matchedKeywords.join(', ')}" → ${targetPattern}`;
            break;
          }
        }

        // Also check file type match
        if (!matched) {
          for (const fileType of pattern.fileTypes) {
            if (filePathLower.endsWith(fileType)) {
              matched = true;
              reason = `Intent "${matchedKeywords.join(', ')}" → ${fileType} files`;
              break;
            }
          }
        }

        if (matched) {
          const score = matchedKeywords.length * 8;
          const existing = scores.get(filePath);

          if (existing) {
            existing.score += score;
            existing.matchReasons.push(reason);
          } else {
            scores.set(filePath, {
              filePath,
              score,
              matchReasons: [reason],
            });
          }
        }
      }
    }

    return Array.from(scores.values());
  }

  /**
   * Combine and rank scores from different strategies.
   */
  private combineScores(...scoreLists: ScoredFile[][]): ScoredFile[] {
    const combined: Map<string, ScoredFile> = new Map();

    for (const scoreList of scoreLists) {
      for (const scored of scoreList) {
        const existing = combined.get(scored.filePath);

        if (existing) {
          existing.score += scored.score;
          existing.matchReasons.push(...scored.matchReasons);
        } else {
          combined.set(scored.filePath, {
            filePath: scored.filePath,
            score: scored.score,
            matchReasons: [...scored.matchReasons],
          });
        }
      }
    }

    // Sort by score descending
    return Array.from(combined.values()).sort((a, b) => b.score - a.score);
  }


  /**
   * Select top files for primary and context based on scores.
   * Ensures at least one file is always selected.
   */
  private selectTopFiles(
    scoredFiles: ScoredFile[],
    allFiles: string[]
  ): { primaryFiles: string[]; contextFiles: string[] } {
    const primaryFiles: string[] = [];
    const contextFiles: string[] = [];

    // Select top scored files as primary (max 3)
    const topScored = scoredFiles.slice(0, 3);
    for (const scored of topScored) {
      if (scored.score > 0) {
        primaryFiles.push(scored.filePath);
      }
    }

    // Select next scored files as context (max 5)
    const nextScored = scoredFiles.slice(3, 8);
    for (const scored of nextScored) {
      if (scored.score > 0) {
        contextFiles.push(scored.filePath);
      }
    }

    // Ensure at least one file is selected
    if (primaryFiles.length === 0) {
      // Fall back to selecting the most likely entry point
      const fallbackFile = this.selectFallbackFile(allFiles);
      if (fallbackFile) {
        primaryFiles.push(fallbackFile);
      }
    }

    return { primaryFiles, contextFiles };
  }

  /**
   * Select a fallback file when no matches are found.
   * Prioritizes common entry points.
   */
  private selectFallbackFile(files: string[]): string | null {
    // Priority order for fallback selection
    const priorities = [
      'App.tsx',
      'App.jsx',
      'App.ts',
      'App.js',
      'index.tsx',
      'index.jsx',
      'index.ts',
      'index.js',
      'main.tsx',
      'main.ts',
    ];

    for (const priority of priorities) {
      const match = files.find((f) => f.endsWith(priority));
      if (match) return match;
    }

    // If no common entry point, return the first code file
    const codeExtensions = ['.tsx', '.jsx', '.ts', '.js'];
    for (const ext of codeExtensions) {
      const match = files.find((f) => f.endsWith(ext));
      if (match) return match;
    }

    // Last resort: return the first file
    return files.length > 0 ? files[0] : null;
  }

  /**
   * Build reasoning string from top scored files.
   */
  private buildReasoning(topScored: ScoredFile[]): string {
    if (topScored.length === 0) {
      return 'No specific matches found, selected default entry point.';
    }

    const reasons = topScored
      .map((s) => `${this.getFileName(s.filePath)}: ${s.matchReasons[0]}`)
      .join('; ');

    return `Selected based on: ${reasons}`;
  }

  /**
   * Extract meaningful words from text.
   * Filters out common stop words and short words.
   */
  private extractWords(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
      'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he',
      'she', 'we', 'they', 'what', 'which', 'who', 'whom', 'when', 'where',
      'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
      'other', 'some', 'such', 'no', 'not', 'only', 'same', 'so', 'than',
      'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then',
      'file', 'files', 'code', 'please', 'want', 'make', 'change', 'update',
    ]);

    // Split on non-word characters and camelCase
    const words = text
      .replace(/([a-z])([A-Z])/g, '$1 $2') // Split camelCase
      .split(/[^a-zA-Z0-9]+/)
      .map((w) => w.toLowerCase())
      .filter((w) => w.length > 2 && !stopWords.has(w));

    return [...new Set(words)];
  }

  /**
   * Get file name from path.
   */
  private getFileName(filePath: string): string {
    const parts = filePath.split('/');
    return parts[parts.length - 1];
  }
}

/**
 * Create a fallback selector instance.
 */
export function createFallbackSelector(): FallbackSelector {
  return new FallbackSelector();
}
