/**
 * @module core/phase-executor
 * @description Executes a single generation phase in the multi-phase pipeline.
 * Handles AI generation, streaming parsing, retries, truncation detection, and
 * validation.
 */

import type { AIProvider } from '../ai/ai-provider';
import type { IPromptProvider, PhaseLayer, ExecutionLayer, ArchitecturePlan } from './prompts/prompt-provider';
import type { BuildValidator, BuildValidationResult } from './build-validator';
import type { PhaseContext } from './batch-context-builder';
import type { GeneratedFile } from './schemas';
import type { GenerationRecipe } from './recipes/recipe-types';
import { parseIncrementalFiles, estimateTotalFiles } from '../utils/incremental-json-parser';
import { createLogger } from '../logger';
import { PHASE_EXECUTION_TIMEOUT } from '../constants';

const logger = createLogger('PhaseExecutor');

/** Drain warnings from a parse result into accumulatedWarnings and the callback. Returns the new lastParsedIndex. */
function applyParseWarnings(
  parseResult: ReturnType<typeof parseIncrementalFiles>,
  lastParsedIndex: number,
  accumulatedWarnings: string[],
  onWarning?: (msg: string) => void,
): number {
  for (const warning of parseResult.warnings) {
    accumulatedWarnings.push(warning.message);
    onWarning?.(warning.message);
  }
  return Math.max(lastParsedIndex, parseResult.lastParsedIndex);
}

export interface PhaseDefinition {
  layer: ExecutionLayer;
  plan: ArchitecturePlan;
  userPrompt: string;
  recipe?: GenerationRecipe;
  /** Override the expected file list for truncation detection (required for 'oneshot' layer). */
  expectedFiles?: string[];
}

export interface PhaseCallbacks {
  onProgress?: (length: number) => void;
  /** Emitted as each file becomes available during streaming */
  onFileStream?: (file: GeneratedFile, isComplete: boolean) => void;
  onWarning?: (warning: string) => void;
  signal?: AbortSignal;
}

export interface PhaseResult {
  /** The files successfully generated during this phase */
  files: GeneratedFile[];
  /** Any validation or parsing warnings */
  warnings: string[];
}

export class PhaseExecutor {
  constructor(
    private readonly provider: AIProvider,
    private readonly promptProvider: IPromptProvider,
    private readonly buildValidator: BuildValidator
  ) {}

  /**
   * Executes a specific generation phase block with full retry and validation logic.
   *
   * @param phaseDef   Definition of what to execute (layer, plan, etc.)
   * @param context    The accumulated batch context for prompting
   * @param callbacks  Streaming callbacks
   * @returns          PhaseResult containing generated files and warnings
   */
  async executePhase(
    phaseDef: PhaseDefinition,
    context: PhaseContext,
    callbacks?: PhaseCallbacks
  ): Promise<PhaseResult> {
    const { layer, plan, userPrompt, recipe } = phaseDef;
    const maxOutputTokens = this.promptProvider.tokenBudgets[layer as keyof typeof this.promptProvider.tokenBudgets] as number;
    let attempt = 1;
    const maxAttempts = 2; // Simple retry logic (decision 7A)
    const allExpectedFiles = phaseDef.expectedFiles ?? plan.files.filter((f) => f.layer === layer).map((f) => f.path);

    let lastErrorFeedback = '';

    while (attempt <= maxAttempts) {
      if (callbacks?.signal?.aborted) {
        throw new Error('Phase execution aborted');
      }

      const attemptStartMs = Date.now();
      logger.info(`Starting phase execution`, { layer, attempt, expectedFiles: allExpectedFiles });

      // Build the standard base prompt
      let systemPrompt = this.promptProvider.getPhasePrompt(layer, plan, context, userPrompt, recipe);

      // Append retry feedback if this is the second attempt
      if (lastErrorFeedback) {
        systemPrompt += `\n\n=== PREVIOUS ATTEMPT FAILED ===\n${lastErrorFeedback}\nFix these issues carefully.`;
      }

      const generatedFiles = new Map<string, GeneratedFile>();
      const accumulatedWarnings: string[] = [];
      let accumulatedText = '';
      let lastParsedIndex = 0;

      try {
        // Create a per-phase timeout signal so slow models fall through to
        // the AgentRouter fallback faster than the global 300s HTTP timeout.
        const phaseSignal = this.createPhaseSignal(callbacks?.signal);

        try {
          await this.provider.generateStreaming({
            systemInstruction: systemPrompt,
            prompt: '', // We bake the userPrompt into the system prompt structure for phases
            maxOutputTokens,
            signal: phaseSignal.signal,
            onChunk: (chunk: string, totalLength: number) => {
              phaseSignal.touch(); // reset inactivity timer on each chunk
              accumulatedText += chunk;
              callbacks?.onProgress?.(totalLength);

              const parseResult = parseIncrementalFiles(accumulatedText, lastParsedIndex);
              lastParsedIndex = applyParseWarnings(parseResult, lastParsedIndex, accumulatedWarnings, callbacks?.onWarning);
              if (parseResult.files.length > 0) {
                for (const file of parseResult.files) {
                  if (!generatedFiles.has(file.path)) {
                    generatedFiles.set(file.path, { path: file.path, content: file.content });
                    callbacks?.onFileStream?.(file, false); // Initial stream pass
                  } else {
                    // Replace with updated content if it grew (e.g., if parsing was partial vs full)
                    generatedFiles.set(file.path, { path: file.path, content: file.content });
                  }
                }
              }
            },
          });
        } finally {
          phaseSignal.clear();
        }

        // ─── Truncation Detection & Continuation (Decision 12A) ─────────────────────
        // We allow up to 2 continuation rounds within the current execution attempt
        let continuationRounds = 0;
        const maxContinuations = 2;

        while (continuationRounds < maxContinuations) {
          // Short-circuit if the client disconnected — avoids wasteful 0ms calls
          if (callbacks?.signal?.aborted) {
            logger.info('Skipping continuation — client aborted', { layer, continuationRounds });
            break;
          }

          const generatedPaths = Array.from(generatedFiles.keys());
          const missingPaths = allExpectedFiles.filter((p) => !generatedPaths.includes(p));

          if (missingPaths.length === 0) {
            break; // Truncation resolved (or never truncated)
          }

          logger.warn(`Truncation detected in ${layer} phase, requesting remaining files`, {
            layer,
            missingPaths,
            generatedSoFar: Array.from(generatedFiles.keys()),
            continuationRounds,
            accumulatedTextLength: accumulatedText.length,
          });

          continuationRounds++;
          accumulatedText = '';
          lastParsedIndex = 0;

          const alreadyGeneratedPaths = Array.from(generatedFiles.keys());
          const continuationPrompt = layer === 'oneshot'
            ? `You were generating a complete application but the output was truncated.
These files were already generated: ${alreadyGeneratedPaths.map((p) => `- ${p}`).join('\n')}
Generate ONLY the following missing files: ${missingPaths.map((p) => `- ${p}`).join('\n')}

DO NOT repeat files you have already generated.`
            : `You were generating the ${layer} layer files but the output was truncated.
Please generate ONLY the following missing files exactly matching the previous structure instructions:
${missingPaths.map((p) => `- ${p}`).join('\n')}

DO NOT repeat files you have already generated.`;

          const contSignal = this.createPhaseSignal(callbacks?.signal);
          try {
            await this.provider.generateStreaming({
              systemInstruction: systemPrompt, // Keep original context instructions for syntax accuracy
              prompt: continuationPrompt,
              maxOutputTokens, // Give a full fresh budget
              signal: contSignal.signal,
              onChunk: (chunk: string, totalLength: number) => {
                contSignal.touch(); // reset inactivity timer on each chunk
                accumulatedText += chunk;
                callbacks?.onProgress?.(totalLength);

                const parseResult = parseIncrementalFiles(accumulatedText, lastParsedIndex);
                lastParsedIndex = applyParseWarnings(parseResult, lastParsedIndex, accumulatedWarnings, callbacks?.onWarning);
                if (parseResult.files.length > 0) {
                  for (const file of parseResult.files) {
                    // Only accept files that were actually missing
                    if (missingPaths.includes(file.path)) {
                      generatedFiles.set(file.path, { path: file.path, content: file.content });
                      callbacks?.onFileStream?.(file, false);
                    }
                  }
                }
              },
            });
          } finally {
            contSignal.clear();
          }
        }

        const finalFiles = Array.from(generatedFiles.values());

        // Hard fail for scaffold or oneshot layer if no files generated successfully
        if ((layer === 'scaffold' || layer === 'oneshot') && finalFiles.length === 0) {
          throw new Error(`${layer === 'oneshot' ? 'One-shot' : 'Scaffold'} phase failed: No files generated successfully`);
        }

        // Emit final completeness markers for the successful files
        for (const file of finalFiles) {
          callbacks?.onFileStream?.(file, true);
        }

        // ─── Post-Phase Validation (Task 4.4) ───────────────────────────────────────
        // We aggregate the files generated in THIS phase with the 'context' previously generated
        const validationMap: Record<string, string> = {};
        for (const [path, content] of context.typeDefinitions.entries()) {
            validationMap[path] = content;
        }
        for (const [path, content] of context.directDependencies.entries()) {
            validationMap[path] = content;
        }
        for (const file of finalFiles) {
            validationMap[file.path] = file.content;
        }

        // Note: Missing imports will trigger warnings, but they might just be files from
        // upcoming phases. Real errors (syntax) will be flagged.
        const validationResult = this.buildValidator.validate(validationMap);
        
        if (layer === 'scaffold') {
           // For scaffold, check if we exported all expected Types and defined expected CSS vars
           // We can verify this natively via simple string checks
           const typesContent = finalFiles.find(f => f.path.endsWith('.ts'))?.content || '';
           for (const tc of plan.typeContracts) {
               if (!typesContent.includes(tc.name)) {
                   accumulatedWarnings.push(`Type contract missing: ${tc.name}`);
               }
           }
        }

        if (!validationResult.valid) {
            // Check if there's any critical syntax error causing total failure
            const syntaxErrors = validationResult.errors.filter(e => e.type === 'syntax_error');
            if (syntaxErrors.length > 0 && attempt < maxAttempts) {
                // Formatting/syntax errors -> go to retry!
                lastErrorFeedback = this.buildValidator.formatErrorsForAI(syntaxErrors);
                logger.warn(`Phase ${layer} had syntax errors. Retrying...`, { errors: syntaxErrors.length });
                attempt++;
                continue; // Retry loop
            } else {
                // Collect warnings to pass to next phase
                accumulatedWarnings.push(...validationResult.errors.map(e => `${e.file}: ${e.message}`));
            }
        }

        const missingFiles = allExpectedFiles.filter(p => !finalFiles.some(f => f.path === p));
        logger.info('Phase execution attempt complete', {
          layer,
          attempt,
          durationMs: Date.now() - attemptStartMs,
          expectedCount: allExpectedFiles.length,
          generatedCount: finalFiles.length,
          generatedFiles: finalFiles.map(f => f.path),
          missingFiles,
          warningCount: accumulatedWarnings.length,
        });

        return {
          files: finalFiles,
          warnings: accumulatedWarnings,
        };

      } catch (err: unknown) {
        lastErrorFeedback = err instanceof Error ? err.message : String(err);

        logger.error(`Phase execution failed (attempt ${attempt}/${maxAttempts})`, {
          layer,
          attempt,
          maxAttempts,
          errorMessage: lastErrorFeedback,
          stack: err instanceof Error ? err.stack : undefined,
          expectedFiles: allExpectedFiles,
          generatedFilesSoFar: Array.from(generatedFiles.keys()),
          accumulatedTextLength: accumulatedText.length,
          accumulatedTextTail: accumulatedText.length > 0
            ? accumulatedText.substring(Math.max(0, accumulatedText.length - 300))
            : undefined,
        });

        if (attempt === maxAttempts) {
            throw new Error(`${layer} phase failed after ${maxAttempts} attempts: ${lastErrorFeedback}`);
        }

        attempt++;
      }
    }

    throw new Error('Unreachable code block in PhaseExecutor');
  }

  /**
   * Creates a per-phase abort signal that fires after PHASE_EXECUTION_TIMEOUT of
   * inactivity (no chunks received). Each call to `touch()` resets the timer, so
   * a slow-but-streaming model won't be killed prematurely. If a parent signal
   * (client disconnect) is provided, the phase signal also fires when the parent
   * fires.
   */
  private createPhaseSignal(parentSignal?: AbortSignal): {
    signal: AbortSignal;
    touch: () => void;
    clear: () => void;
  } {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => controller.abort(),
      PHASE_EXECUTION_TIMEOUT
    );

    const touch = () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => controller.abort(), PHASE_EXECUTION_TIMEOUT);
    };

    const clear = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };

    // Combine with parent signal (client disconnect)
    if (parentSignal) {
      const signal = AbortSignal.any([parentSignal, controller.signal]);
      return { signal, touch, clear };
    }

    return { signal: controller.signal, touch, clear };
  }
}
