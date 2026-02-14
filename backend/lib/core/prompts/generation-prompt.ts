/**
 * Generation Prompt Module
 * Contains the system prompt and output schema for project generation.
 * Requirements: 8.2, 8.3
 */

import {
  LAYOUT_FUNDAMENTALS,
  DESIGN_SYSTEM_CONSTANTS,
  ACCESSIBILITY_GUIDANCE,
  OUTPUT_BUDGET_GUIDANCE,
  SYNTAX_INTEGRITY_RULES,
  wrapUserInput
} from './shared-prompt-fragments';

/**
 * Builds the system prompt for project generation.
 * Instructs the AI to output structured JSON with complete file contents.
 */
function shouldIncludeDesignSystem(userPrompt: string): boolean {
  if (!userPrompt) return false;

  const prompt = userPrompt.toLowerCase();

  const designKeywords = [
    'beautiful ui',
    'beautiful design',
    'premium design',
    'modern ui',
    'modern design',
    'design system',
    'tailwind',
    'chakra ui',
    'material ui',
    'mantine',
    'landing page',
    'marketing site',
    'marketing page',
    'dashboard',
    'admin panel',
    'animated',
    'animation',
    'glassmorphism',
    'gradient',
    'theme',
    'theming',
    'responsive layout',
    'pixel-perfect',
    'pixel perfect',
    'dribbble',
    'behance'
  ];

  return designKeywords.some((keyword) => prompt.includes(keyword));
}

function buildGenerationPrompt(userPrompt: string): string {
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

=== FILE REQUIREMENTS ===
Generate files appropriate to complexity: package.json, main.tsx, App.tsx (max 50 lines), index.css, types, 2–3 UI components, 1–2 layout components, 2–3 feature components, 1–2 hooks.

${LAYOUT_FUNDAMENTALS}

${shouldIncludeDesignSystem(userPrompt) ? `${DESIGN_SYSTEM_CONSTANTS}
` : ''}
${ACCESSIBILITY_GUIDANCE}

=== CSS BEST PRACTICES ===
- Define tokens (colors, spacing, shadows, radius) as CSS variables in index.css.
- BEM-like naming per component. No inline styles. Use modern CSS (aspect-ratio, clamp()).

=== DEPENDENCY RULES (CRITICAL) ===
NEVER import these — use native APIs: uuid/nanoid → crypto.randomUUID(), axios → fetch(), moment/dayjs → Intl.DateTimeFormat, lodash → native array methods, classnames → template literals.
Only use packages listed in package.json. Add to dependencies if absolutely needed.

${SYNTAX_INTEGRITY_RULES}

${OUTPUT_BUDGET_GUIDANCE}

${wrapUserInput(userPrompt)}

Generate a complete React application with perfect syntax and proper component separation.`;
}

/**
 * System prompt for project generation.
 * @deprecated Use buildGenerationPrompt() instead for proper prompt injection defense
 */
export const GENERATION_SYSTEM_PROMPT = buildGenerationPrompt('');

/**
 * Builds a generation prompt with user input properly wrapped for injection defense.
 */
export function getGenerationPrompt(userPrompt: string): string {
  return buildGenerationPrompt(userPrompt);
}

import { ProjectOutputSchema } from '../schemas';
import { toGeminiSchema } from '../gemini-schema-converter';

/**
 * JSON Schema for project generation output.
 * Forces Gemini to return properly structured JSON.
 * Note: Gemini API doesn't support additionalProperties, so we use an array structure instead.
 */
export const PROJECT_OUTPUT_SCHEMA = toGeminiSchema(ProjectOutputSchema);
