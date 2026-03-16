/**
 * Generation Prompt Module
 * Contains the system prompt and output schema for project generation.
 * Requirements: 8.2, 8.3
 */

import {
  LAYOUT_FUNDAMENTALS,
  BASELINE_VISUAL_POLISH,
  REALISTIC_DATA_GUIDANCE,
  DESIGN_SYSTEM_CONSTANTS,
  ACCESSIBILITY_GUIDANCE,
  DEPENDENCY_GUIDANCE,
  getOutputBudgetGuidance,
  SYNTAX_INTEGRITY_RULES,
  COMMON_REACT_PATTERNS,
  DETAILED_REACT_GUIDANCE,
  DETAILED_CSS_GUIDANCE,
  DETAILED_JSON_OUTPUT_GUIDANCE,
  wrapUserInput
} from './shared-prompt-fragments';
import { getProviderPromptConfig } from './provider-prompt-config';
import {
  shouldIncludeDesignSystem,
  detectComplexity,
  getFileRequirements,
  getQualityBarReference,
} from './generation-prompt-utils';
export {
  shouldIncludeDesignSystem,
  detectComplexity,
  getFileRequirements,
  getQualityBarReference,
} from './generation-prompt-utils';

function buildGenerationPrompt(userPrompt: string): string {
  const config = getProviderPromptConfig();
  const complexity = detectComplexity(userPrompt);
  return `You are a SENIOR React architect generating production-quality, modular React applications.
CRITICAL: NEVER put everything in App.tsx — use proper component separation.

=== PROJECT STRUCTURE ===
- package.json (all dependencies)
- src/main.tsx (entry point only — ReactDOM.render)
- src/App.tsx (layout/routing only, max 50 lines)
- src/index.css (global styles, CSS variables, resets)
- src/components/ui/*.tsx + *.css (reusable: Button, Input, Card, Modal)
- src/components/layout/*.tsx + *.css (Header, Footer, Sidebar)
- src/components/features/*.tsx + *.css (domain-specific components)
- src/hooks/*.ts (custom hooks: useLocalStorage, useForm)
- src/types/index.ts (TypeScript interfaces)

=== COMPONENT RULES ===
- Single responsibility, under 80 lines each. Split if larger.
- UI components = pure presentation via props. Containers = state + data flow. Hooks = reusable logic.
- Create generic reusable UI components (Button, Input, Card). Co-locate CSS per component.

${getFileRequirements(complexity)}

${LAYOUT_FUNDAMENTALS}

${BASELINE_VISUAL_POLISH}

${REALISTIC_DATA_GUIDANCE}

${shouldIncludeDesignSystem(userPrompt) ? `${DESIGN_SYSTEM_CONSTANTS}
` : ''}
${ACCESSIBILITY_GUIDANCE}

=== CSS BEST PRACTICES ===
- BEM-like naming per component. No inline styles. Use modern CSS (aspect-ratio, clamp()).
- Components MUST reference these variables instead of hardcoded values.
- Define all tokens in :root in index.css using this starter set:
  --color-primary: #3b82f6;    --color-primary-hover: #2563eb;
  --color-bg: #ffffff;         --color-surface: #f8fafc;
  --color-text: #1e293b;       --color-text-secondary: #64748b;
  --color-border: #e2e8f0;     --color-error: #ef4444;
  --color-success: #22c55e;
  --space-xs: 4px; --space-sm: 8px; --space-md: 16px; --space-lg: 24px; --space-xl: 32px;
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --text-sm: 0.875rem; --text-base: 1rem; --text-lg: 1.125rem; --text-xl: 1.25rem;
  --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05); --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1);

${DEPENDENCY_GUIDANCE}

${SYNTAX_INTEGRITY_RULES}

${COMMON_REACT_PATTERNS}

${config.includeDetailedGuidance ? `${DETAILED_REACT_GUIDANCE}

${DETAILED_CSS_GUIDANCE}

${DETAILED_JSON_OUTPUT_GUIDANCE}

` : ''}${getOutputBudgetGuidance(config.outputBudgetTokens)}

${getQualityBarReference(complexity)}

${wrapUserInput(userPrompt)}

Generate a complete React application with perfect syntax and proper component separation.`;
}


/**
 * Builds a generation prompt with user input properly wrapped for injection defense.
 */
export function getGenerationPrompt(userPrompt: string): string {
  return buildGenerationPrompt(userPrompt);
}

import { ProjectOutputSchema } from '../schemas';
import { toSimpleJsonSchema } from '../zod-to-json-schema';

/**
 * JSON Schema for project generation output.
 * Forces the AI to return properly structured JSON.
 * Note: Some providers don't support additionalProperties, so we use an array structure instead.
 */
export const PROJECT_OUTPUT_SCHEMA = toSimpleJsonSchema(ProjectOutputSchema);
