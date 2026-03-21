/**
 * @module core/phase-executor
 * @description Executes a single generation phase in the multi-phase pipeline.
 * Handles AI generation, streaming parsing, retries, truncation detection, and
 * validation.
 */

import type { AIProvider } from '../ai/ai-provider';
import type { IPromptProvider, PhaseLayer, ArchitecturePlan } from './prompts/prompt-provider';
import type { BuildValidator, BuildValidationResult } from './build-validator';
import type { PhaseContext } from './batch-context-builder';
import type { GeneratedFile } from './schemas';
import type { GenerationRecipe } from './recipes/recipe-types';
import { parseIncrementalFiles, estimateTotalFiles } from '../utils/incremental-json-parser';
import { createLogger } from '../logger';

const logger = createLogger('PhaseExecutor');

export interface PhaseDefinition {
  layer: PhaseLayer;
  plan: ArchitecturePlan;
  userPrompt: string;
  recipe?: GenerationRecipe;
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
    const allExpectedFiles = plan.files.filter((f) => f.layer === layer).map((f) => f.path);

    let lastErrorFeedback = '';

    while (attempt <= maxAttempts) {
      if (callbacks?.signal?.aborted) {
        throw new Error('Phase execution aborted');
      }

      logger.info(`Starting phase execution`, { layer, attempt });

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
        await this.provider.generateStreaming({
          systemInstruction: systemPrompt,
          prompt: '', // We bake the userPrompt into the system prompt structure for phases
          maxOutputTokens,
          signal: callbacks?.signal,
          onChunk: (chunk: string, totalLength: number) => {
            accumulatedText += chunk;
            callbacks?.onProgress?.(totalLength);

            const parseResult = parseIncrementalFiles(accumulatedText, lastParsedIndex);
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
              lastParsedIndex = parseResult.lastParsedIndex;
            }
          },
        });

        // ─── Truncation Detection & Continuation (Decision 12A) ─────────────────────
        // We allow up to 2 continuation rounds within the current execution attempt
        let continuationRounds = 0;
        const maxContinuations = 2;

        while (continuationRounds < maxContinuations) {
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

          const continuationPrompt = `You were generating the ${layer} layer files but the output was truncated.
Please generate ONLY the following missing files exactly matching the previous structure instructions:
${missingPaths.map((p) => `- ${p}`).join('\n')}

DO NOT repeat files you have already generated.`;

          await this.provider.generateStreaming({
            systemInstruction: systemPrompt, // Keep original context instructions for syntax accuracy
            prompt: continuationPrompt,
            maxOutputTokens, // Give a full fresh budget
            signal: callbacks?.signal,
            onChunk: (chunk: string, totalLength: number) => {
              accumulatedText += chunk;
              callbacks?.onProgress?.(totalLength);

              const parseResult = parseIncrementalFiles(accumulatedText, lastParsedIndex);
              if (parseResult.files.length > 0) {
                for (const file of parseResult.files) {
                  // Only accept files that were actually missing
                  if (missingPaths.includes(file.path)) {
                    generatedFiles.set(file.path, { path: file.path, content: file.content });
                    callbacks?.onFileStream?.(file, false);
                  }
                }
                lastParsedIndex = parseResult.lastParsedIndex;
              }
            },
          });
        }

        const finalFiles = Array.from(generatedFiles.values());

        // Hard fail for scaffold layer if no files generated successfully
        if (layer === 'scaffold' && finalFiles.length === 0) {
          throw new Error('Scaffold phase failed: No files generated successfully');
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
            // Hard fail vs soft fail decision
            if (layer === 'scaffold') {
                throw new Error(`Scaffold phase critical failure: ${lastErrorFeedback}`);
            } else {
                // Soft fail: return whatever we salvaged
                logger.warn(`Returning partial results for ${layer} phase after max retries`, {
                  layer,
                  salvaged: Array.from(generatedFiles.keys()),
                });
                return {
                    files: Array.from(generatedFiles.values()),
                    warnings: [`Phase failed but returning partial output: ${lastErrorFeedback}`],
                };
            }
        }

        attempt++;
      }
    }

    throw new Error('Unreachable code block in PhaseExecutor');
  }
}
