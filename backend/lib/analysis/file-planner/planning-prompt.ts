/**
 * @module analysis/file-planner/planning-prompt
 * @description System prompt, user prompt builder, and response parser for the AI planning call.
 * The planning call receives compact file-tree metadata (no code content) and returns
 * which files should be included as primary or context for modification.
 * Handles provider-specific prompt enrichments (extra instructions for Modal).
 *
 * @requires ./types - PlanningResponse type
 * @requires ../../core/schemas - PlanningResponseSchema for Zod validation
 * @requires ../../core/zod-to-json-schema - JSON Schema conversion for AI response format
 * @requires ../../core/prompts/provider-prompt-config - Provider-specific prompt configuration
 * @requires ../../ai/modal-response-parser - JSON extraction from raw AI responses
 */

import type { PlanningResponse } from './types';
import { PlanningResponseSchema } from '../../core/schemas';
import { toSimpleJsonSchema } from '../../core/zod-to-json-schema';

import { getProviderPromptConfig } from '../../core/prompts/provider-prompt-config';

/**
 * System prompt for the AI planning call.
 * Instructs the AI to select files based on the user's modification request.
 */
export const PLANNING_SYSTEM_PROMPT = `You are a code planning assistant. Your task is to analyze a user's modification request and select which files from the project need to be included for the modification.

You will receive:
1. A user's modification request describing what changes they want to make
2. A file tree showing the project structure with file metadata (line counts, file types, and exported symbols)

Your job is to identify:
- **Primary files**: Files that will likely need to be modified to fulfill the request
- **Context files**: Files needed for reference (type definitions, parent components, utilities used by primary files)
- **Category**: Classify the modification as 'ui' (components/UI changes), 'logic' (business logic/functionality), 'style' (CSS/styling only), or 'mixed' (combination)

Guidelines:
- Be selective: Only include files that are directly relevant to the request
- Consider file names and exported symbols when making selections
- Include type definition files if the primary files use those types
- Include parent components if modifying child components
- For style changes, include relevant CSS/style files
- When adding new components, include the parent file where it will be imported
- When using Modal/Qwen: Output ONLY raw JSON without markdown code fences.

Respond with valid JSON only. No additional text or explanation outside the JSON.`;

/**
 * Returns the planning system prompt, potentially enriched for specific providers.
 */
export function getPlanningSystemPrompt(): string {
  const config = getProviderPromptConfig();

  let prompt = PLANNING_SYSTEM_PROMPT;

  if (config.provider === 'modal') {
    prompt += `

=== JSON OUTPUT REMINDER (CRITICAL) ===
- Output ONLY raw JSON. No markdown code fences (\`\`\`json ... \`\`\`).
- No text before or after the JSON object.
- Use exact file paths as shown in the FILE TREE.
- Include a "reasoning" field explaining your selection.`;
  }

  return prompt;
}

/**
 * JSON schema for the planning response.
 * Used to validate and parse AI responses.
 */
export const PLANNING_OUTPUT_SCHEMA = toSimpleJsonSchema(PlanningResponseSchema);

/**
 * Recommended temperature for planning calls.
 * Low temperature (0.3) ensures consistent, deterministic file selection.
 */
export const PLANNING_TEMPERATURE = 0.3;

/**
 * Build the complete planning prompt for the AI call.
 *
 * @param userPrompt - The user's modification request
 * @param metadata - Compact file tree metadata (from generateFileTreeMetadata)
 * @returns The formatted prompt string for the AI planning call
 */
export function buildPlanningPrompt(userPrompt: string, metadata: string): string {
  return `USER REQUEST:
${userPrompt}

FILE TREE:
${metadata}

Respond with JSON in this exact format:
{
  "primaryFiles": ["path/to/file1.ts", "path/to/file2.tsx"],
  "contextFiles": ["path/to/types.ts", "path/to/utils.ts"],
  "category": "ui",
  "reasoning": "Brief explanation of why these files were selected"
}

Remember:
- primaryFiles: Files that will be modified
- contextFiles: Type definitions, parent components, utilities for reference
- category: "ui" for component/UI changes, "logic" for business logic, "style" for CSS only, "mixed" for combination
- Only include files shown in the FILE TREE above
- Use exact file paths as shown in the tree`;
}

import { extractJsonFromResponse } from '../../ai/modal-response-parser';

/**
 * Parse and validate the AI planning response.
 * Handles potential markdown code blocks and other formatting artifacts.
 *
 * @param response - Raw response string from the AI
 * @returns Parsed PlanningResponse or null if invalid
 */
export function parsePlanningResponse(response: string): PlanningResponse | null {
  const extracted = extractJsonFromResponse(response);
  if (!extracted) return null;

  try {
    const parsedData = JSON.parse(extracted);
    const zodResult = PlanningResponseSchema.safeParse(parsedData);

    if (!zodResult.success) {
      return null;
    }

    return zodResult.data;
  } catch {
    return null;
  }
}
