/**
 * Modification Engine Service
 * 
 * Orchestrates context-aware code modifications by:
 * 1. Classifying user intent
 * 2. Selecting relevant code slices
 * 3. Sending only relevant context to Gemini
 * 4. Validating and applying changes
 * 
 * Requirements: 3.5, 4.6, 4.7
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  ProjectState,
  Version,
  FileDiff,
  ChangeSummary,
  EditOperation,
  FileEdit,
  ModificationOutput,
  EditApplicationResult,
} from '@ai-app-builder/shared';
import type { CodeSlice } from '../analysis/file-planner/types';
import { GeminiClient, createGeminiClient } from '../ai';
import { ValidationPipeline } from '../core/validation-pipeline';
import { BuildValidator, createBuildValidator } from '../core/build-validator';
import { CORE_MODIFICATION_PROMPT, DESIGN_SYSTEM_PROMPT, MODIFICATION_OUTPUT_SCHEMA } from './prompts/modification-prompt';
import { formatCode } from '../prettier-config';
import { createLogger } from '../logger';
import { config } from '../config';
import {
  FilePlanner,
  createFilePlanner,
  IntentClassifier,
  createIntentClassifier,
  SliceSelector,
  createSliceSelector
} from '../analysis';
import { computeLineHunks } from '../core/diff-utils';
import { ModificationOutputSchema } from '../core/schemas';
import { parseAIOutput } from '../core/validators';

const logger = createLogger('ModificationEngine');

/**
 * Result of a modification operation.
 */
export interface ModificationResult {
  success: boolean;
  projectState?: ProjectState;
  version?: Version;
  diffs?: FileDiff[];
  changeSummary?: ChangeSummary;
  error?: string;
  validationErrors?: Array<{
    type: string;
    message: string;
    filePath?: string;
    line?: number;
  }>;
}

/**
 * Modification Engine service for modifying existing projects.
 * Includes build validation with auto-retry.
 */
export class ModificationEngine {
  private readonly geminiClient: GeminiClient;
  private readonly validationPipeline: ValidationPipeline;
  private readonly filePlanner: FilePlanner;
  private readonly intentClassifier: IntentClassifier;
  private readonly sliceSelector: SliceSelector;
  private readonly buildValidator: BuildValidator;
  private readonly maxBuildRetries = 2;

  constructor(geminiClient?: GeminiClient) {
    // Modification requires the most capable model (Pro or specialized Flash) for complex instruction following and code generation
    this.geminiClient = geminiClient ?? createGeminiClient(config.ai.hardModel);
    this.validationPipeline = new ValidationPipeline();
    // This passes the Pro client, but IntentClassifier might want Flash?
    // Actually IntentClassifier creates its own if not passed. 
    // If we pass 'gemini-1.5-pro' client here, IntentClassifier uses it. 
    // We should probably NOT pass it if we want IntentClassifier to use its default (which we changed to Flash).
    // Let's create a separate client for intent classifier or let it create its own.
    this.intentClassifier = createIntentClassifier();
    this.sliceSelector = createSliceSelector();
    this.filePlanner = createFilePlanner(this.geminiClient);
    this.buildValidator = createBuildValidator();
  }


  /**
   * Modify an existing project based on a user prompt.
   * @param projectState - The current project state with files
   * @param prompt - The modification prompt
   * @param options - Optional configuration (e.g., skipPlanning to bypass FilePlanner)
   */
  async modifyProject(
    projectState: ProjectState,
    prompt: string,
    options?: { skipPlanning?: boolean }
  ): Promise<ModificationResult> {
    if (!prompt || prompt.trim() === '') {
      return {
        success: false,
        error: 'Modification prompt is required',
      };
    }

    if (!projectState || Object.keys(projectState.files).length === 0) {
      return {
        success: false,
        error: 'Project state with files is required',
      };
    }

    try {
      // Step 1: Get code slices - either from FilePlanner or directly from provided files
      let slices: CodeSlice[];

      if (options?.skipPlanning) {
        // When skipPlanning is true, treat all provided files as primary files
        // Build slices directly without calling FilePlanner
        slices = this.buildSlicesFromFiles(projectState);
        logger.info('Skipping FilePlanner, using all files as primary', {
          fileCount: slices.length
        });
      } else {
        // Use FilePlanner to select relevant code slices
        // FilePlanner replaces IntentClassifier + SliceSelector with AI-powered file selection
        slices = await this.filePlanner.plan(prompt, projectState);
      }

      // Step 2: Build the modification prompt
      const modificationPrompt = this.buildModificationPrompt(prompt, slices, projectState);

      // Retry configuration
      const MAX_RETRIES = 2;
      let attempt = 0;
      let lastEditError: string | null = null;
      let updatedFiles: Record<string, string | null> = {};
      let deletedFiles: string[] = [];

      while (attempt <= MAX_RETRIES) {
        attempt++;
        logger.info('Modification attempt', { attempt, maxAttempts: MAX_RETRIES + 1 });

        // Build prompt with error feedback if this is a retry
        let currentPrompt = modificationPrompt;
        if (lastEditError) {
          currentPrompt += `\n\n[PREVIOUS ATTEMPT FAILED]\nError: ${lastEditError}\n\nPlease fix your edit. Make sure the "search" string EXACTLY matches the existing code (including whitespace and newlines). Try using a smaller, more unique search pattern.`;
        }

        // Log what we're sending to Gemini
        logger.info('Sending modification request to Gemini', {
          attempt,
          promptLength: currentPrompt.length,
          systemInstructionLength: CORE_MODIFICATION_PROMPT.length, // Changed from MODIFICATION_SYSTEM_PROMPT
          temperature: 0.7,
          isRetry: !!lastEditError,
        });
        logger.debug('Gemini modification request details', {
          prompt: currentPrompt,
          systemInstruction: CORE_MODIFICATION_PROMPT, // Changed from MODIFICATION_SYSTEM_PROMPT
          responseSchema: MODIFICATION_OUTPUT_SCHEMA,
        });

        // Construct dynamic system prompt based on intent
        // First, classify the intent to determine if design principles are needed
        const intent = await this.intentClassifier.classify(prompt, projectState);
        let systemInstruction = CORE_MODIFICATION_PROMPT;

        // Add design principles only for UI-related tasks
        if (['add_component', 'modify_component', 'modify_style', 'generate'].includes(intent.type)) {
          systemInstruction += '\n\n' + DESIGN_SYSTEM_PROMPT;
        }

        // Step 5: Call Gemini API with structured output
        const response = await this.geminiClient.generate({
          prompt: currentPrompt,
          systemInstruction: systemInstruction,
          temperature: 0.7,
          maxOutputTokens: 16384,
          responseSchema: MODIFICATION_OUTPUT_SCHEMA,
        });

        // Log what we received from Gemini
        logger.info('Received modification response from Gemini', {
          success: response.success,
          contentLength: response.content?.length ?? 0,
          hasError: !!response.error,
        });
        logger.debug('Gemini modification response content', {
          content: response.content,
          error: response.error,
        });
        if (!response.success || !response.content) {
          logger.error('Gemini error', { error: response.error });
          return {
            success: false,
            error: response.error ?? 'Failed to get modification from AI',
          };
        }

        logger.debug('AI Response content preview', { contentLength: response.content.length });


        // Step 6: Parse and validate the structured output
        const parseResult = parseAIOutput(response.content);
        if (!parseResult.success || !parseResult.data) {
          logger.error('Failed to parse AI output', { error: parseResult.error });
          return {
            success: false,
            error: parseResult.error || 'Failed to parse AI response as valid JSON',
          };
        }

        const zodResult = ModificationOutputSchema.safeParse(parseResult.data);
        if (!zodResult.success) {
          logger.error('Zod validation failed on modification response', {
            errors: zodResult.error.issues,
          });
          return {
            success: false,
            error: `Invalid AI modification structure: ${zodResult.error.message}`,
          };
        }

        const parsedOutput = zodResult.data;

        // Extract files from the structured response
        const aiFilesArray = parsedOutput.files;
        logger.debug('Processing file edits', { fileCount: aiFilesArray?.length ?? 0 });
        if (!aiFilesArray || !Array.isArray(aiFilesArray)) {
          logger.error('AI response missing files array');
          return {
            success: false,
            error: 'AI response missing files array',
          };
        }


        // Step 7: Apply the modifications based on operation type
        updatedFiles = {};
        deletedFiles = [];
        let editFailed = false;
        lastEditError = null;

        for (const fileEdit of aiFilesArray) {
          if (!fileEdit.path) {
            logger.warn('Skipping file entry without path');
            continue;
          }

          // Sanitize path: remove any accidental spaces
          fileEdit.path = fileEdit.path.replace(/\s+/g, '');

          switch (fileEdit.operation) {
            case 'delete':
              deletedFiles.push(fileEdit.path);
              updatedFiles[fileEdit.path] = null;
              break;

            case 'create':
              if (!fileEdit.content) {
                logger.warn('Create operation missing content', { path: fileEdit.path });
                continue;
              }
              let createContent = fileEdit.content;
              // Normalize newlines and tabs
              if (createContent.includes('\\n')) createContent = createContent.replace(/\\n/g, '\n');
              if (createContent.includes('\\t')) createContent = createContent.replace(/\\t/g, '\t');
              // Format with Prettier
              try {
                createContent = await formatCode(createContent, fileEdit.path);
              } catch (e) {
                logger.warn('Failed to format file', { path: fileEdit.path, error: e instanceof Error ? e.message : 'Unknown error' });
              }
              updatedFiles[fileEdit.path] = createContent;
              break;

            case 'modify':
              if (!fileEdit.edits || fileEdit.edits.length === 0) {
                logger.warn('Modify operation missing edits', { path: fileEdit.path });
                continue;
              }
              const originalContent = projectState.files[fileEdit.path];
              if (originalContent === undefined) {
                logger.warn('Cannot modify non-existent file', { path: fileEdit.path });
                continue;
              }
              // Apply the edits
              const editResult = this.applyEdits(originalContent, fileEdit.edits);
              if (!editResult.success) {
                logger.warn('Failed to apply edits', { path: fileEdit.path, error: editResult.error });
                lastEditError = `File: ${fileEdit.path} - ${editResult.error}`;
                editFailed = true;
                break; // Break from switch, will continue retry loop
              }
              // Format the modified content
              let modifiedContent = editResult.content!;
              try {
                modifiedContent = await formatCode(modifiedContent, fileEdit.path);
              } catch (e) {
                logger.warn('Failed to format file', { path: fileEdit.path, error: e instanceof Error ? e.message : 'Unknown error' });
              }
              updatedFiles[fileEdit.path] = modifiedContent;
              break;

            default:
              logger.warn('Unknown operation type', { path: fileEdit.path });
          }

          if (editFailed) break; // Exit the for loop to trigger retry
        }

        // If edits succeeded, break out of retry loop
        if (!editFailed) {
          logger.info('Modification succeeded', { attempt });
          break;
        }

        // If we've exhausted retries, return error
        if (attempt > MAX_RETRIES) {
          return {
            success: false,
            error: `Failed after ${MAX_RETRIES + 1} attempts. Last error: ${lastEditError}`,
          };
        }

        logger.info('Retrying due to error', { error: lastEditError });
      }


      // Step 8: Validate the modified files (excluding deleted files)
      const filesToValidate: Record<string, string> = {};
      for (const [path, content] of Object.entries(updatedFiles)) {
        if (content !== null) {
          filesToValidate[path] = content;
        }
      }

      const validationResult = this.validationPipeline.validate(filesToValidate);
      if (!validationResult.valid) {
        return {
          success: false,
          error: 'AI output failed validation',
          validationErrors: validationResult.errors,
        };
      }

      // Step 8b: Build validation with auto-retry
      // We need to validate the FULL project state with the modifications applied
      // First, create a temporary view of what the project will look like
      const tempFiles = { ...projectState.files };
      for (const [path, content] of Object.entries(updatedFiles)) {
        if (content === null) {
          delete tempFiles[path];
        } else {
          tempFiles[path] = content;
        }
      }

      // Run build validation
      let buildResult = this.buildValidator.validate(tempFiles);
      let buildRetryCount = 0;

      while (!buildResult.valid && buildRetryCount < this.maxBuildRetries) {
        buildRetryCount++;
        logger.info('Modification build retry', {
          attempt: buildRetryCount,
          maxRetries: this.maxBuildRetries,
          errors: buildResult.errors.map(e => e.message),
        });

        // Format errors for AI
        const errorContext = this.buildValidator.formatErrorsForAI(buildResult.errors);

        // Request AI to fix the errors
        // We use the modification endpoint but focus on fixing errors
        const fixPrompt = `The previous modification caused build errors. Please fix them:\n\n${errorContext}\n\nOriginal request: ${prompt}`;

        const fixResponse = await this.geminiClient.generate({
          prompt: await this.buildModificationPrompt(fixPrompt, slices, projectState), // Reuse context
          systemInstruction: CORE_MODIFICATION_PROMPT + '\n\nIMPORTANT: Fix ALL build errors. Adding missing dependencies to package.json is usually the solution.',
          temperature: 0.5,
          maxOutputTokens: 16384,
          responseSchema: MODIFICATION_OUTPUT_SCHEMA,
        });

        if (!fixResponse.success || !fixResponse.content) {
          logger.error('Failed to get fix response from AI');
          break;
        }

        // Parse and process the fix
        try {
          if (typeof fixResponse.content !== 'string') {
            throw new Error('Fix response content is missing');
          }

          let fixOutput: { files?: unknown };
          try {
            fixOutput = JSON.parse(fixResponse.content);
          } catch (parseError) {
            logger.error('Failed to parse fix response JSON', {
              error: parseError instanceof Error ? parseError.message : String(parseError),
            });
            continue;
          }

          if (!fixOutput.files || !Array.isArray(fixOutput.files)) {
            continue;
          }

          // Apply fixes to our updatedFiles map
          for (const fileEdit of fixOutput.files) {
            if (fileEdit.operation === 'modify' && fileEdit.edits) {
              // We need to apply edits to the content in tempFiles (which has previous mods applied)
              const currentContent = tempFiles[fileEdit.path];
              if (currentContent) {
                const editResult = this.applyEdits(currentContent, fileEdit.edits);
                if (editResult.success) {
                  updatedFiles[fileEdit.path] = editResult.content!; // Update the modifications map
                  tempFiles[fileEdit.path] = editResult.content!;    // Update temp view
                }
              }
            } else if (fileEdit.operation === 'create' && fileEdit.content) {
              updatedFiles[fileEdit.path] = fileEdit.content;
              tempFiles[fileEdit.path] = fileEdit.content;
            }
          }

          // Re-validate
          buildResult = this.buildValidator.validate(tempFiles);
          if (buildResult.valid) {
            logger.info('Modification build errors fixed successfully');
          }
        } catch (e) {
          logger.error('Error applying fixes', { error: e instanceof Error ? e.message : 'Unknown error' });
        }
      }

      // Log warning if still has errors
      if (!buildResult.valid) {
        logger.warn('Build warnings after retries', {
          errors: buildResult.errors.map(e => ({ message: e.message, file: e.file })),
        });
      }

      // Step 9: Create updated project state
      const now = new Date();
      const versionId = uuidv4();

      const newFiles = { ...projectState.files };

      // Apply modifications
      for (const [path, content] of Object.entries(updatedFiles)) {
        if (content === null) {
          delete newFiles[path];
        } else {
          newFiles[path] = content;
        }
      }

      const newProjectState: ProjectState = {
        ...projectState,
        files: newFiles,
        updatedAt: now,
        currentVersionId: versionId,
      };

      // Step 10: Compute diffs
      const diffs = this.computeDiffs(projectState.files, newFiles, deletedFiles);

      // Step 11: Create change summary
      const changeSummary = this.createChangeSummary(diffs, prompt);

      // Step 12: Create new version
      const version: Version = {
        id: versionId,
        projectId: projectState.id,
        prompt: prompt,
        timestamp: now,
        files: newFiles,
        diffs: diffs,
        parentVersionId: projectState.currentVersionId,
      };

      return {
        success: true,
        projectState: newProjectState,
        version,
        diffs,
        changeSummary,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during modification',
      };
    }
  }


  /**
   * Build the modification prompt with relevant code slices.
   */
  private buildModificationPrompt(
    userPrompt: string,
    slices: CodeSlice[],
    projectState: ProjectState
  ): string {
    const primarySlices = slices.filter(s => s.relevance === 'primary');
    const contextSlices = slices.filter(s => s.relevance === 'context');

    let prompt = `Project: ${projectState.name}\n`;
    prompt += `Description: ${projectState.description}\n\n`;
    prompt += `User Request: ${userPrompt}\n\n`;

    if (primarySlices.length > 0) {
      prompt += `=== PRIMARY FILES (likely need modification) ===\n\n`;
      for (const slice of primarySlices) {
        prompt += `--- ${slice.filePath} ---\n`;
        prompt += `${slice.content}\n\n`;
      }
    }

    if (contextSlices.length > 0) {
      prompt += `=== CONTEXT FILES (for reference) ===\n\n`;
      for (const slice of contextSlices) {
        prompt += `--- ${slice.filePath} ---\n`;
        prompt += `${slice.content}\n\n`;
      }
    }

    // List all files in the project for context
    const allFiles = Object.keys(projectState.files);
    const includedFiles = new Set(slices.map(s => s.filePath));
    const otherFiles = allFiles.filter(f => !includedFiles.has(f));

    if (otherFiles.length > 0) {
      prompt += `=== OTHER PROJECT FILES (not included) ===\n`;
      prompt += otherFiles.join('\n');
      prompt += '\n\n';
    }

    prompt += `Based on the user request, output ONLY the JSON with modified/new files.`;

    return prompt;
  }

  /**
   * Build code slices directly from project files without using FilePlanner.
   * All files are treated as primary files (full content included).
   * Used when skipPlanning option is true.
   */
  private buildSlicesFromFiles(projectState: ProjectState): CodeSlice[] {
    const slices: CodeSlice[] = [];

    for (const [filePath, content] of Object.entries(projectState.files)) {
      slices.push({
        filePath,
        content,
        relevance: 'primary',
      });
    }

    return slices;
  }

  /**
   * Apply search/replace edits to file content.
   * Returns the modified content or an error if edits cannot be applied.
   */
  private applyEdits(
    originalContent: string,
    edits: EditOperation[]
  ): EditApplicationResult {
    let content = originalContent;

    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];

      // Normalize escape sequences in search and replace strings
      let search = edit.search;
      let replace = edit.replace;

      // Handle escaped newlines and tabs from JSON
      if (search.includes('\\n')) search = search.replace(/\\n/g, '\n');
      if (search.includes('\\t')) search = search.replace(/\\t/g, '\t');
      if (replace.includes('\\n')) replace = replace.replace(/\\n/g, '\n');
      if (replace.includes('\\t')) replace = replace.replace(/\\t/g, '\t');

      // Count occurrences
      let occurrences = content.split(search).length - 1;

      // If exact match not found, try whitespace-normalized matching
      let normalizedSearch = search;
      let useNormalizedMatching = false;
      if (occurrences === 0) {
        const normalizedResult = this.findWithNormalizedWhitespace(content, search);
        if (normalizedResult) {
          normalizedSearch = normalizedResult;
          occurrences = 1;
          useNormalizedMatching = true;
          logger.info('Using whitespace-normalized matching for edit', { editIndex: i });
        }
      }

      if (occurrences === 0) {
        // Try to find a fuzzy match to provide better error message
        const searchPreview = search.length > 80
          ? search.slice(0, 80) + '...'
          : search;
        return {
          success: false,
          error: `Search pattern not found: "${searchPreview}"`,
          failedEditIndex: i,
        };
      }

      const actualSearch = useNormalizedMatching ? normalizedSearch : search;

      if (occurrences > 1 && edit.occurrence !== undefined) {
        // Replace specific occurrence (1-indexed)
        let count = 0;
        let result = '';
        let lastIndex = 0;
        let index = content.indexOf(actualSearch);

        while (index !== -1) {
          count++;
          if (count === edit.occurrence) {
            result += content.slice(lastIndex, index) + replace;
            lastIndex = index + actualSearch.length;
            break;
          } else {
            result += content.slice(lastIndex, index + actualSearch.length);
            lastIndex = index + actualSearch.length;
          }
          index = content.indexOf(actualSearch, lastIndex);
        }
        result += content.slice(lastIndex);
        content = result;
      } else if (occurrences > 1) {
        // Multiple occurrences but no specific occurrence specified
        // Replace first occurrence only and log warning
        logger.warn('Multiple occurrences found, replacing first', { occurrences, editIndex: i });
        content = content.replace(actualSearch, replace);
      } else {
        // Single occurrence, safe to replace
        content = content.replace(actualSearch, replace);
      }
    }

    return { success: true, content };
  }

  /**
   * Find a search string in content using whitespace-normalized matching.
   * Returns the actual substring from content that matches, or null if not found.
   */
  private findWithNormalizedWhitespace(content: string, search: string): string | null {
    // Normalize the search pattern: collapse whitespace to single spaces
    const normalizeWs = (s: string) => s.replace(/\s+/g, ' ').trim();
    const normalizedSearch = normalizeWs(search);
    
    if (!normalizedSearch) return null;

    // Split content into lines and try to find matching consecutive lines
    const contentLines = content.split('\n');
    const searchLines = search.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    if (searchLines.length === 0) return null;

    // Try to find the first line of the search pattern
    for (let startIdx = 0; startIdx < contentLines.length; startIdx++) {
      if (normalizeWs(contentLines[startIdx]) === normalizeWs(searchLines[0])) {
        // Check if subsequent lines match
        let allMatch = true;
        let searchLineIdx = 1;
        let contentLineIdx = startIdx + 1;
        
        while (searchLineIdx < searchLines.length && contentLineIdx < contentLines.length) {
          // Skip empty lines in content
          if (contentLines[contentLineIdx].trim() === '') {
            contentLineIdx++;
            continue;
          }
          
          if (normalizeWs(contentLines[contentLineIdx]) !== normalizeWs(searchLines[searchLineIdx])) {
            allMatch = false;
            break;
          }
          searchLineIdx++;
          contentLineIdx++;
        }
        
        // Check if we matched all search lines
        if (allMatch && searchLineIdx === searchLines.length) {
          // Return the actual content substring
          const matchedLines = contentLines.slice(startIdx, contentLineIdx);
          return matchedLines.join('\n');
        }
      }
    }
    
    return null;
  }

  /**
   * Normalize file content for comparison.
   * Removes trailing whitespace from each line and ensures consistent line endings.
   */
  private normalizeContent(content: string): string {
    return content
      .split('\n')
      .map(line => line.trimEnd())
      .join('\n')
      .trimEnd();
  }

  /**
   * Compute diffs between old and new file states.
   */
  private computeDiffs(
    oldFiles: Record<string, string>,
    newFiles: Record<string, string>,
    deletedFiles: string[]
  ): FileDiff[] {
    const diffs: FileDiff[] = [];
    const processedPaths = new Set<string>();

    // Handle modified and added files
    for (const [path, newContent] of Object.entries(newFiles)) {
      processedPaths.add(path);
      const oldContent = oldFiles[path];

      if (oldContent === undefined) {
        // File was added
        diffs.push(this.createAddedFileDiff(path, newContent));
      } else {
        // Normalize both contents for comparison
        const normalizedOld = this.normalizeContent(oldContent);
        const normalizedNew = this.normalizeContent(newContent);
        
        if (normalizedOld !== normalizedNew) {
          // File was actually modified (not just whitespace changes)
          const fileDiff = this.createModifiedFileDiff(path, oldContent, newContent);
          // Only include if there are actual hunks with real changes
          if (fileDiff.hunks.length > 0 && this.hasRealChanges(fileDiff)) {
            diffs.push(fileDiff);
          }
        }
      }
    }

    // Handle deleted files
    for (const path of deletedFiles) {
      if (oldFiles[path] !== undefined) {
        diffs.push(this.createDeletedFileDiff(path, oldFiles[path]));
      }
    }

    return diffs;
  }

  /**
   * Check if a file diff has real changes (not just whitespace).
   */
  private hasRealChanges(fileDiff: FileDiff): boolean {
    for (const hunk of fileDiff.hunks) {
      for (const change of hunk.changes) {
        if (change.type === 'add' || change.type === 'delete') {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Create a diff for an added file.
   */
  private createAddedFileDiff(filePath: string, content: string): FileDiff {
    const lines = content.split('\n');
    return {
      filePath,
      status: 'added',
      hunks: [{
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: lines.length,
        changes: lines.map((line, index) => ({
          type: 'add' as const,
          lineNumber: index + 1,
          content: line,
        })),
      }],
    };
  }

  /**
   * Create a diff for a deleted file.
   */
  private createDeletedFileDiff(filePath: string, content: string): FileDiff {
    const lines = content.split('\n');
    return {
      filePath,
      status: 'deleted',
      hunks: [{
        oldStart: 1,
        oldLines: lines.length,
        newStart: 0,
        newLines: 0,
        changes: lines.map((line, index) => ({
          type: 'delete' as const,
          lineNumber: index + 1,
          content: line,
        })),
      }],
    };
  }


  /**
   * Create a diff for a modified file.
   */
  private createModifiedFileDiff(
    filePath: string,
    oldContent: string,
    newContent: string
  ): FileDiff {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    return {
      filePath,
      status: 'modified',
      hunks: computeLineHunks(oldLines, newLines),
    };
  }



  /**
   * Create a human-readable change summary.
   */
  private createChangeSummary(diffs: FileDiff[], prompt: string): ChangeSummary {
    let filesAdded = 0;
    let filesModified = 0;
    let filesDeleted = 0;
    let linesAdded = 0;
    let linesDeleted = 0;
    const affectedFiles: string[] = [];

    for (const diff of diffs) {
      affectedFiles.push(diff.filePath);

      switch (diff.status) {
        case 'added':
          filesAdded++;
          break;
        case 'modified':
          filesModified++;
          break;
        case 'deleted':
          filesDeleted++;
          break;
      }

      for (const hunk of diff.hunks) {
        for (const change of hunk.changes) {
          if (change.type === 'add') {
            linesAdded++;
          } else if (change.type === 'delete') {
            linesDeleted++;
          }
        }
      }
    }

    // Generate description
    const parts: string[] = [];
    if (filesAdded > 0) {
      parts.push(`${filesAdded} file${filesAdded > 1 ? 's' : ''} added`);
    }
    if (filesModified > 0) {
      parts.push(`${filesModified} file${filesModified > 1 ? 's' : ''} modified`);
    }
    if (filesDeleted > 0) {
      parts.push(`${filesDeleted} file${filesDeleted > 1 ? 's' : ''} deleted`);
    }

    const description = parts.length > 0
      ? `${parts.join(', ')} (${linesAdded} lines added, ${linesDeleted} lines deleted)`
      : 'No changes made';

    return {
      filesAdded,
      filesModified,
      filesDeleted,
      linesAdded,
      linesDeleted,
      description,
      affectedFiles,
    };
  }
}

/**
 * Creates a ModificationEngine instance with default configuration.
 */
export function createModificationEngine(): ModificationEngine {
  return new ModificationEngine();
}
