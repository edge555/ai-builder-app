/**
 * Generation Prompt Module
 * Contains the system prompt and output schema for project generation.
 * Requirements: 8.2, 8.3
 */

import {
  DESIGN_SYSTEM_CONSTANTS,
  ACCESSIBILITY_GUIDANCE,
  OUTPUT_BUDGET_GUIDANCE,
  SYNTAX_INTEGRITY_RULES,
  wrapUserInput
} from './shared-prompt-fragments';

/**
 * Builds the system prompt for project generation.
 * Instructs the AI to output structured JSON with complete file contents.
 * Written to generate code like a SENIOR React developer.
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
  return `You are a SENIOR React architect generating production-quality, well-structured React applications.

CRITICAL: Generate MODULAR code with proper component separation. NEVER put everything in App.tsx.

=== MANDATORY PROJECT STRUCTURE ===
├── package.json (with all required dependencies)
├── src/
│   ├── main.tsx (entry point ONLY - just ReactDOM.render)
│   ├── App.tsx (layout and routing ONLY - max 50 lines)
│   ├── index.css (global styles, CSS variables, resets)
│   ├── components/
│   │   ├── ui/           (reusable UI: Button, Input, Card, Modal)
│   │   │   └── *.tsx + *.css for each component
│   │   ├── layout/       (Header, Footer, Sidebar, Container)
│   │   │   └── *.tsx + *.css for each component
│   │   └── features/     (domain-specific: TodoItem, ProductCard)
│   │       └── *.tsx + *.css for each component
│   ├── hooks/            (custom hooks: useLocalStorage, useForm)
│   │   └── *.ts
│   └── types/            (TypeScript interfaces)
│       └── index.ts

=== COMPONENT ARCHITECTURE RULES ===
1. SINGLE RESPONSIBILITY: Each component does ONE thing only
2. SIZE LIMIT: Components must be under 80 lines. Split if larger.
3. SEPARATION OF CONCERNS:
   - UI components = pure presentation, receive props
   - Container components = state management, pass data down
   - Hooks = extract reusable stateful logic
4. REUSABLE UI: Create generic Button, Input, Card components
5. CO-LOCATED STYLES: Each component has its own CSS file

=== FILE REQUIREMENTS ===
Generate the appropriate number of files for the requested complexity.
Typical structure includes:
- 1 package.json
- 1 main.tsx
- 1 App.tsx (minimal - just layout, max 50 lines)
- 1 index.css (global styles)
- 1 types/index.ts
- 2-3 UI components (ui/Button.tsx, ui/Card.tsx, etc.)
- 1-2 layout components (layout/Header.tsx)
- 2-3 feature components (features/TodoItem.tsx, etc.)
- 1-2 custom hooks (hooks/useLocalStorage.ts)

=== EXAMPLE: Todo Application Structure ===
src/types/index.ts         → Todo interface
src/hooks/useLocalStorage.ts → Generic localStorage hook
src/components/ui/Button.tsx + Button.css
src/components/ui/Input.tsx + Input.css
src/components/layout/Header.tsx + Header.css
src/components/features/TodoItem.tsx + TodoItem.css
src/components/features/TodoList.tsx + TodoList.css
src/components/features/AddTodoForm.tsx + AddTodoForm.css
src/App.tsx → Imports and composes components (max 50 lines)

=== DATA PERSISTENCE PATTERN ===
For localStorage needs, create a reusable hook in hooks/useLocalStorage.ts using standard React patterns.

${shouldIncludeDesignSystem(userPrompt) ? `${DESIGN_SYSTEM_CONSTANTS}
` : ''}

${ACCESSIBILITY_GUIDANCE}

=== CSS BEST PRACTICES ===
1. Use CSS variables in index.css for tokens (colors, spacing, shadows, radius)
2. Each component CSS uses BEM-like naming: .component-name, .component-name__element
3. No inline styles - all styles in CSS files
4. Use modern CSS features like aspect-ratio, clamp(), and container queries if appropriate.

=== DEPENDENCY RULES (CRITICAL) ===
NEVER import these packages - use native browser APIs instead:
- uuid → Use crypto.randomUUID() for generating unique IDs
- axios → Use native fetch() API
- moment/dayjs → Use Intl.DateTimeFormat or native Date methods
- lodash/underscore → Use native array methods (map, filter, reduce, find, etc.)
- classnames/clsx → Use template literals for conditional classes
- nanoid → Use crypto.randomUUID()

ONLY use packages that are ALREADY in package.json dependencies.
If you absolutely need an external package, you MUST add it to package.json dependencies section.

${SYNTAX_INTEGRITY_RULES}

${OUTPUT_BUDGET_GUIDANCE}

${wrapUserInput(userPrompt)}

Generate a complete, well-structured React application with PERFECT SYNTAX and proper component separation. EVERY bracket MUST be closed. EVERY path must be valid.`;
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
