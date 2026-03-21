/**
 * @module core/prompts/api/api-prompt-provider
 * @description IPromptProvider implementation for the OpenRouter (API) path.
 * Uses concise prompts — no detailed React/CSS guidance — to keep token costs low.
 * Token budgets match the API constants in lib/constants.ts.
 *
 * @requires ../prompt-provider - IPromptProvider interface
 * @requires ../generation-prompt-utils - Shared utility functions
 * @requires ../shared-prompt-fragments - Shared prompt text blocks
 * @requires ../../constants - Token budget constants
 */

import type { IPromptProvider, IntentOutput, PlanOutput } from '../prompt-provider';
import type { ArchitecturePlan, PhaseLayer } from '../prompt-provider';
import type { PhaseContext } from '../../batch-context-builder';
import type { GenerationRecipe } from '../../recipes/recipe-types';
import {
  detectComplexity,
  getFileRequirements,
  shouldIncludeDesignSystem,
  getQualityBarReference,
} from '../generation-prompt-utils';
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
  SEARCH_REPLACE_GUIDANCE,
  wrapUserInput,
} from '../shared-prompt-fragments';
import {
  MAX_OUTPUT_TOKENS_INTENT,
  MAX_OUTPUT_TOKENS_PLANNING_STAGE,
  MAX_OUTPUT_TOKENS_GENERATION,
  MAX_OUTPUT_TOKENS_MODIFICATION,
  MAX_OUTPUT_TOKENS_REVIEW,
  MAX_OUTPUT_TOKENS_ARCHITECTURE_PLANNING,
  MAX_OUTPUT_TOKENS_PLAN_REVIEW,
  MAX_OUTPUT_TOKENS_SCAFFOLD,
  MAX_OUTPUT_TOKENS_LOGIC,
  MAX_OUTPUT_TOKENS_UI,
  MAX_OUTPUT_TOKENS_INTEGRATION,
} from '../../../constants';
import { composeExecutionPrompt } from '../../recipes/recipe-engine';
import {
  getScaffoldPrompt,
  getLogicPrompt,
  getUIPrompt,
  getIntegrationPrompt,
  getPlanReviewPrompt as buildPlanReviewPrompt,
} from '../phase-prompts';

/** Token budget for bugfix = same as modification (full file set may need rewriting) */
const BUGFIX_BUDGET = MAX_OUTPUT_TOKENS_MODIFICATION;

export class ApiPromptProvider implements IPromptProvider {
  private recipe: GenerationRecipe | null;

  constructor(recipe?: GenerationRecipe) {
    this.recipe = recipe ?? null;
  }

  /** Update the recipe after intent analysis (for recipe-aware execution prompts). */
  setRecipe(recipe: GenerationRecipe): void {
    this.recipe = recipe;
  }
  readonly tokenBudgets = {
    intent: MAX_OUTPUT_TOKENS_INTENT,
    planning: MAX_OUTPUT_TOKENS_PLANNING_STAGE,
    executionGeneration: MAX_OUTPUT_TOKENS_GENERATION,
    executionModification: MAX_OUTPUT_TOKENS_MODIFICATION,
    review: MAX_OUTPUT_TOKENS_REVIEW,
    bugfix: BUGFIX_BUDGET,
    // Multi-phase pipeline
    architecturePlanning: MAX_OUTPUT_TOKENS_ARCHITECTURE_PLANNING,
    planReview: MAX_OUTPUT_TOKENS_PLAN_REVIEW,
    scaffold: MAX_OUTPUT_TOKENS_SCAFFOLD,
    logic: MAX_OUTPUT_TOKENS_LOGIC,
    ui: MAX_OUTPUT_TOKENS_UI,
    integration: MAX_OUTPUT_TOKENS_INTEGRATION,
  };

  getIntentSystemPrompt(): string {
    return `You are an AI intent classifier for a web app builder.
Analyze the user's request and return a JSON object with exactly these fields:
- clarifiedGoal: string — refined, unambiguous statement of what to build
- complexity: "simple" | "medium" | "complex" — estimated scope
- features: string[] — 3–7 key features to implement
- technicalApproach: string — recommended React architecture (routing, state, libs)
- projectType: "spa" | "fullstack" | "fullstack-auth" — IMPORTANT classification rules:
  * "spa" (DEFAULT) — use for ALL client-only React apps. This includes blogs, task trackers, dashboards, portfolios, calculators, games, landing pages, and any app that can work with mock/local data. When in doubt, choose "spa".
  * "fullstack" — ONLY when the user explicitly requests a database, backend API, server-side rendering, or specifically mentions Next.js, Prisma, PostgreSQL, MongoDB, etc.
  * "fullstack-auth" — ONLY when the user explicitly requests user authentication, login/signup, or mentions Supabase Auth, OAuth, etc.
  Most prompts like "build a blog app", "build a task tracker", "build a todo app" should be "spa" — they work perfectly with local state and mock data.

Respond with valid JSON only. No markdown, no explanation.`;
  }

  getPlanningSystemPrompt(userPrompt: string, intent: IntentOutput | null): string {
    const intentBlock = intent
      ? `\n=== CLARIFIED GOAL ===\n${intent.clarifiedGoal}\nComplexity: ${intent.complexity}\nFeatures: ${intent.features.join(', ')}\nApproach: ${intent.technicalApproach}\n`
      : '';

    return `You are a React architecture planner.
${intentBlock}
Given the user's request, output a JSON file plan:
- files: [{ path: string, purpose: string }] — all files to create
- components: string[] — React component names to implement
- dependencies: string[] — npm packages required (e.g. "react-router-dom", "lucide-react")
- routing: string[] — routes to define (empty array if single-page)

Base file count on complexity: simple=5–8 files, medium=10–14 files, complex=15–20 files.
Respond with valid JSON only.`;
  }

  getExecutionGenerationSystemPrompt(
    userPrompt: string,
    intent: IntentOutput | null,
    plan: PlanOutput | null
  ): string {
    // If a recipe is set, delegate to the data-driven prompt composer
    if (this.recipe) {
      return composeExecutionPrompt(this.recipe, userPrompt, intent, plan);
    }

    const complexity = intent?.complexity ?? detectComplexity(userPrompt);
    const useDesignSystem = shouldIncludeDesignSystem(userPrompt);

    const intentBlock = intent
      ? `\n=== INTENT ANALYSIS ===\nGoal: ${intent.clarifiedGoal}\nFeatures: ${intent.features.join(', ')}\nApproach: ${intent.technicalApproach}\n`
      : '';

    const planBlock = plan
      ? `\n=== FILE PLAN ===\nFiles: ${plan.files.map((f) => f.path).join(', ')}\nComponents: ${plan.components.join(', ')}\nDependencies: ${plan.dependencies.join(', ')}\n`
      : '';

    return `You are a SENIOR React architect generating production-quality, modular React applications.
CRITICAL: NEVER put everything in App.tsx — use proper component separation.
${intentBlock}${planBlock}
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

${useDesignSystem ? `${DESIGN_SYSTEM_CONSTANTS}\n` : ''}${ACCESSIBILITY_GUIDANCE}

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
  --font-sans: 'Geist', system-ui, -apple-system, sans-serif;
  --text-sm: 0.875rem; --text-base: 1rem; --text-lg: 1.125rem; --text-xl: 1.25rem;
  --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05); --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1);

${DEPENDENCY_GUIDANCE}

${SYNTAX_INTEGRITY_RULES}

${COMMON_REACT_PATTERNS}

${getOutputBudgetGuidance(MAX_OUTPUT_TOKENS_GENERATION)}

${getQualityBarReference(complexity)}

${wrapUserInput(userPrompt)}

CRITICAL: The app MUST be fully functional on first render. Initialize all state with hardcoded sample data (5-8 realistic items). NEVER use loading states, fetch(), or setTimeout for initial data. Every button, form, and list must be interactive and working.

Generate a complete React application with perfect syntax and proper component separation.`;
  }

  getExecutionModificationSystemPrompt(
    userPrompt: string,
    intent: IntentOutput | null,
    _plan: PlanOutput | null,
    designSystem: boolean
  ): string {
    const designSystemSection = designSystem
      ? `\n${DESIGN_SYSTEM_CONSTANTS}\n\n${ACCESSIBILITY_GUIDANCE}\n`
      : '';

    const intentBlock = intent
      ? `\n=== INTENT ===\n${intent.clarifiedGoal}\n`
      : '';

    return `You are a SENIOR full-stack developer modifying an existing web application.
${intentBlock}
=== COMPONENT RULES ===
- Never add >30 lines to App.tsx — create new components in ui/, layout/, or features/ instead.
- Keep components under 80 lines. Extract repeated logic into hooks in src/hooks/.
- Co-locate CSS per component (ComponentName.tsx + ComponentName.css).

${LAYOUT_FUNDAMENTALS}
${designSystemSection}
=== OUTPUT FORMAT ===
For each file, output JSON with "path", "operation" ("modify"|"create"|"replace_file"|"delete").
- "create": include "content" with full file content (new files only).
- "delete": just path and operation.
- "modify": include "edits" array with search/replace pairs.
- "replace_file": include "content" with the complete new file content. Use ONLY when the file needs such extensive changes that search/replace would be unreliable (e.g. >60% of lines changing). Prefer "modify" for smaller changes.

=== EDIT RULES ===
- "search" must exactly match existing code (whitespace, newlines included). Include 3–5 lines of context.
- Multiple edits to same file: list in file order. No line numbers in search.
- Small changes (<30 lines): modify. Large features (>50 lines new): create new component files.
- If a file needs many scattered edits (>5 edits or >60% rewrite), use "replace_file" instead of "modify".

${SEARCH_REPLACE_GUIDANCE}

${getOutputBudgetGuidance(MAX_OUTPUT_TOKENS_MODIFICATION)}

${SYNTAX_INTEGRITY_RULES}

${wrapUserInput(userPrompt)}`;
  }

  getReviewSystemPrompt(): string {
    return `You are a senior React code reviewer performing a final quality check on a generated application.

Review the provided files for:
1. Broken imports (missing files, wrong paths)
2. TypeScript errors (undefined variables, wrong types)
3. Missing CSS classes referenced in JSX
4. package.json missing required dependencies
5. Syntax errors (unclosed JSX, missing brackets)

Return a JSON object:
- verdict: "pass" if the code is correct, "fixed" if you made corrections
- corrections: array of { path, content, reason } for files you corrected (empty array if verdict is "pass")

Each correction must include the COMPLETE file content — not just the changed section.
Only correct files with definite errors. Do NOT refactor or improve working code.
Respond with valid JSON only.`;
  }

  getBugfixSystemPrompt(errorContext: string, failureHistory: string[]): string {
    const historyBlock = failureHistory.length > 0
      ? `\n=== PREVIOUS FAILED ATTEMPTS ===\nDo NOT repeat these approaches:\n${failureHistory.map((h, i) => `Attempt ${i + 1}: ${h.replace(/[`$\\]/g, ' ').slice(0, 500)}`).join('\n')}\n`
      : '';

    return `You are a SENIOR React developer fixing build errors in an existing project.
${historyBlock}
=== BUILD ERRORS TO FIX ===
${errorContext}

Fix ALL errors. Return the complete modified project as JSON with all files.
Common fixes: add missing dependencies to package.json, fix broken imports, correct TypeScript errors.
${SYNTAX_INTEGRITY_RULES}`;
  }

  // ─── Multi-Phase Pipeline Methods ──────────────────────────────────────

  /**
   * Architecture planning: request a full ArchitecturePlan JSON.
   * The AI must produce files with layer assignments, typeContracts,
   * cssVariables, stateShape, and dependency lists.
   */
  getArchitecturePlanningPrompt(userPrompt: string, intent: IntentOutput | null): string {
    const intentBlock = intent
      ? `=== INTENT ANALYSIS ===\nGoal: ${intent.clarifiedGoal}\nComplexity: ${intent.complexity}\nFeatures: ${intent.features.join(', ')}\nApproach: ${intent.technicalApproach}\n`
      : '';

    return `You are a SENIOR React software architect creating a detailed architecture plan for a multi-phase code generator.

${intentBlock}
=== OUTPUT: ArchitecturePlan JSON ===
Return a single valid JSON object matching this schema exactly:

{
  "files": [
    {
      "path": "src/types/index.ts",
      "purpose": "TypeScript interfaces",
      "layer": "scaffold" | "logic" | "ui" | "integration",
      "exports": ["SymbolName"],
      "imports": ["src/other/file.ts"]
    }
  ],
  "components": ["ComponentName"],
  "dependencies": ["react", "react-dom"],
  "routing": ["/", "/dashboard"],
  "typeContracts": [
    { "name": "TypeName", "definition": "interface TypeName { ... }" }
  ],
  "cssVariables": [
    { "name": "--color-primary", "value": "#6366f1", "purpose": "Brand color" }
  ],
  "stateShape": {
    "contexts": [{ "name": "CtxName", "stateFields": ["field: Type"], "actions": ["actionName"] }],
    "hooks": [{ "name": "useHookName", "signature": "() => { ... }", "purpose": "..." }]
  }
}

=== MANDATORY SCAFFOLD FILES (ALWAYS include these — no exceptions) ===
The following files MUST appear in the "files" array with layer "scaffold":
- { "path": "package.json", "purpose": "npm manifest", "layer": "scaffold", "exports": [], "imports": [] }
- { "path": "src/main.tsx", "purpose": "React entry point", "layer": "scaffold", "exports": [], "imports": [] }
- { "path": "src/index.css", "purpose": "Global styles and CSS variables", "layer": "scaffold", "exports": [], "imports": [] }

=== PLANNING RULES ===
1. LAYERS (assign every file to exactly one):
   - "scaffold": types, interfaces, CSS tokens, package.json, main.tsx, index.css
   - "logic": hooks, contexts, utilities, API clients
   - "ui": React components (.tsx), co-located CSS files (.css)
   - "integration": pages, App.tsx, routing, top-level providers

2. FILES: Include every file the app needs. Use paths like "src/types/index.ts", "src/hooks/useFoo.ts", "src/components/ui/Button.tsx".

3. EXPORTS: List the TypeScript symbols each file exports (function names, interface names, component names).

4. IMPORTS: List other files in this plan that this file imports from (by path). Only list plan-internal paths.

5. TYPE CONTRACTS: Define the full TypeScript interface/type text for key shared types. These will be enforced exactly by scaffold generation.

6. CSS VARIABLES: Define ALL design tokens (colors, spacing, radii, shadows, fonts). These will be placed exactly in :root.

7. STATE SHAPE: Define the signature for every hook and context that will be shared across components.

8. DEPENDENCIES: Include only what is needed. Prefer: react, react-dom, lucide-react, react-router-dom.

9. HOOKS MUST PRE-POPULATE DATA: Every hook in the "logic" layer that manages a collection (useTodos, usePosts, etc.)
   must initialize with hardcoded sample data. The app renders instantly with content — no loading screens.

Base file count on complexity:
- simple: 6–9 files
- medium: 10–14 files
- complex: 15–22 files

Respond with valid JSON only. No markdown, no explanation.

${getOutputBudgetGuidance(MAX_OUTPUT_TOKENS_ARCHITECTURE_PLANNING)}

${wrapUserInput(userPrompt)}`;
  }

  /**
   * Plan review: validates the ArchitecturePlan for internal consistency.
   * Delegates to getPlanReviewPrompt from phase-prompts.ts.
   */
  getPlanReviewPrompt(plan: ArchitecturePlan): string {
    return buildPlanReviewPrompt(plan);
  }

  /**
   * Phase prompt dispatcher.
   * Delegates to the appropriate function in phase-prompts.ts based on phase.
   * Recipe phaseFragments are injected into getUIPrompt when available.
   */
  getPhasePrompt(
    phase: PhaseLayer,
    plan: ArchitecturePlan,
    context: PhaseContext,
    userPrompt: string,
    recipe?: GenerationRecipe,
  ): string {
    switch (phase) {
      case 'scaffold':
        return getScaffoldPrompt(plan, userPrompt);
      case 'logic':
        return getLogicPrompt(plan, context, userPrompt);
      case 'ui':
        return getUIPrompt(plan, context, userPrompt, recipe);
      case 'integration':
        return getIntegrationPrompt(plan, context, userPrompt);
    }
  }
}
