/**
 * Modification Prompt Module
 * Contains the system prompt and output schema for code modification.
 * Requirements: 8.1, 8.3
 */

import {
  LAYOUT_FUNDAMENTALS,
  DESIGN_SYSTEM_CONSTANTS,
  ACCESSIBILITY_GUIDANCE,
  SEARCH_REPLACE_GUIDANCE,
  getOutputBudgetGuidance,
  SYNTAX_INTEGRITY_RULES,
  DETAILED_REACT_GUIDANCE,
  DETAILED_CSS_GUIDANCE,
  DETAILED_JSON_OUTPUT_GUIDANCE,
  wrapUserInput
} from '../../core/prompts/shared-prompt-fragments';
import { getProviderPromptConfig } from '../../core/prompts/provider-prompt-config';

/**
 * Design system prompt for UI-related modifications.
 * Applied when the FilePlanner determines the modification involves UI changes.
 */
export const DESIGN_SYSTEM_PROMPT = DESIGN_SYSTEM_CONSTANTS;

/**
 * Builds the core modification prompt with user input properly wrapped.
 */
function buildModificationPrompt(userPrompt: string, includeDesignSystem: boolean): string {
  const config = getProviderPromptConfig();
  const designSystemSection = includeDesignSystem ? `\n${DESIGN_SYSTEM_CONSTANTS}\n\n${ACCESSIBILITY_GUIDANCE}\n` : '';

  return `You are a SENIOR full-stack developer modifying an existing web application.

=== COMPONENT RULES ===
- Never add >30 lines to App.tsx — create new components in ui/, layout/, or features/ instead.
- Keep components under 80 lines. Extract repeated logic into hooks in src/hooks/.
- Co-locate CSS per component (ComponentName.tsx + ComponentName.css).

${LAYOUT_FUNDAMENTALS}
${designSystemSection}
=== OUTPUT FORMAT ===
For each file, output JSON with "path", "operation" ("modify"|"create"|"delete").
- "create": include "content" with full file content.
- "delete": just path and operation.
- "modify": include "edits" array with search/replace pairs.

=== EDIT RULES ===
- "search" must exactly match existing code (whitespace, newlines included). Include 3–5 lines of context.
- Multiple edits to same file: list in file order. No line numbers in search.
- Small changes (<30 lines): modify. Large features (>50 lines new): create new component files.

${SEARCH_REPLACE_GUIDANCE}

${getOutputBudgetGuidance(config.outputBudgetTokens)}

${SYNTAX_INTEGRITY_RULES}

${config.includeDetailedGuidance ? `${DETAILED_REACT_GUIDANCE}

${DETAILED_CSS_GUIDANCE}

${DETAILED_JSON_OUTPUT_GUIDANCE}
` : ''}

You will receive:
- The user's modification request
- Relevant code slices from the project (marked as PRIMARY or CONTEXT)
- PRIMARY files are the ones most likely to need modification
- CONTEXT files are provided for reference to understand dependencies

${wrapUserInput(userPrompt)}

=== EXAMPLE OUTPUT ===
{
  "files": [
    {
      "path": "src/components/features/NewFeature.tsx",
      "operation": "create",
      "content": "import React from 'react';\\nimport './NewFeature.css';\\n\\nexport function NewFeature() {...}"
    },
    {
      "path": "src/components/features/NewFeature.css",
      "operation": "create",
      "content": ".new-feature { ... }"
    },
    {
      "path": "src/App.tsx",
      "operation": "modify",
      "edits": [
        {
          "search": "import { Header } from './components/layout/Header';",
          "replace": "import { Header } from './components/layout/Header';\\nimport { NewFeature } from './components/features/NewFeature';"
        }
      ]
    }
  ]
}`;
}


/**
 * Builds a modification prompt with user input properly wrapped for injection defense.
 * @param userPrompt The user's modification request
 * @param includeDesignSystem Whether to include design system guidance (for UI-related changes)
 */
export function getModificationPrompt(userPrompt: string, includeDesignSystem: boolean = false): string {
  return buildModificationPrompt(userPrompt, includeDesignSystem);
}

import { ModificationOutputSchema } from '../../core/schemas';
import { toSimpleJsonSchema } from '../../core/zod-to-json-schema';

/**
 * JSON Schema for diff-based modification output.
 * Forces the AI to return properly structured JSON with edit operations.
 */
export const MODIFICATION_OUTPUT_SCHEMA = toSimpleJsonSchema(ModificationOutputSchema);
