/**
 * @module core/prompts/modal/modal-prompt-provider
 * @description IPromptProvider implementation for the Modal (self-hosted) path.
 * Uses verbose prompts — full detailed guidance — since Modal is billed per GPU-hour,
 * not per token. Token budgets match the Modal constants in lib/constants.ts.
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
  DATA_MANAGEMENT_INFERENCE,
  DESIGN_SYSTEM_CONSTANTS,
  ACCESSIBILITY_GUIDANCE,
  DEPENDENCY_GUIDANCE,
  getOutputBudgetGuidance,
  SYNTAX_INTEGRITY_RULES,
  COMMON_REACT_PATTERNS,
  DETAILED_REACT_GUIDANCE,
  DETAILED_CSS_GUIDANCE,
  DETAILED_JSON_OUTPUT_GUIDANCE,
  SEARCH_REPLACE_GUIDANCE,
  wrapUserInput,
} from '../shared-prompt-fragments';
import {
  MODAL_MAX_OUTPUT_TOKENS_INTENT,
  MODAL_MAX_OUTPUT_TOKENS_PLANNING_STAGE,
  MODAL_MAX_OUTPUT_TOKENS_GENERATION,
  MODAL_MAX_OUTPUT_TOKENS_MODIFICATION,
  MODAL_MAX_OUTPUT_TOKENS_REVIEW,
  MAX_OUTPUT_TOKENS_ARCHITECTURE_PLANNING,
  MAX_OUTPUT_TOKENS_PLAN_REVIEW,
  MAX_OUTPUT_TOKENS_SCAFFOLD,
  MAX_OUTPUT_TOKENS_LOGIC,
  MAX_OUTPUT_TOKENS_UI,
  MAX_OUTPUT_TOKENS_INTEGRATION,
} from '../../../constants';
import {
  getScaffoldPrompt,
  getLogicPrompt,
  getUIPrompt,
  getIntegrationPrompt,
  getPlanReviewPrompt as buildPlanReviewPrompt,
} from '../phase-prompts';

/** Token budget for bugfix = same as modification */
const BUGFIX_BUDGET = MODAL_MAX_OUTPUT_TOKENS_MODIFICATION;

export class ModalPromptProvider implements IPromptProvider {
  readonly tokenBudgets = {
    intent: MODAL_MAX_OUTPUT_TOKENS_INTENT,
    planning: MODAL_MAX_OUTPUT_TOKENS_PLANNING_STAGE,
    executionGeneration: MODAL_MAX_OUTPUT_TOKENS_GENERATION,
    executionModification: MODAL_MAX_OUTPUT_TOKENS_MODIFICATION,
    review: MODAL_MAX_OUTPUT_TOKENS_REVIEW,
    bugfix: BUGFIX_BUDGET,
    // Multi-phase pipeline (Modal uses same budgets as API)
    architecturePlanning: MAX_OUTPUT_TOKENS_ARCHITECTURE_PLANNING,
    planReview: MAX_OUTPUT_TOKENS_PLAN_REVIEW,
    scaffold: MAX_OUTPUT_TOKENS_SCAFFOLD,
    logic: MAX_OUTPUT_TOKENS_LOGIC,
    ui: MAX_OUTPUT_TOKENS_UI,
    integration: MAX_OUTPUT_TOKENS_INTEGRATION,
  };

  getIntentSystemPrompt(): string {
    return `You are an AI intent classifier for a React web application builder.

Your job is to carefully analyze the user's request and produce a structured JSON object
that will guide subsequent planning and code generation stages.

You MUST return a JSON object with exactly these fields:

{
  "clarifiedGoal": "<string> — clear, detailed description of what to build; resolve ambiguities",
  "complexity": "<'simple' | 'medium' | 'complex'> — estimated project scope",
  "features": ["<feature 1>", "<feature 2>", ...],  // 3–7 concrete features
  "technicalApproach": "<string> — React architecture: routing strategy, state management, key libraries"
}

Complexity guidelines:
- simple: single page, minimal state, 1–2 core features (e.g. counter, calculator, color picker)
- medium: multi-component, custom hooks, 3–5 features (e.g. todo app, weather app, quiz)
- complex: multi-page with routing, context/global state, 6+ features (e.g. task manager, e-commerce, dashboard)

technicalApproach should mention:
- Whether to use react-router-dom (multi-page) or single page
- State management approach (useState, useReducer, Context, or combination)
- Key libraries (lucide-react for icons, uuid for IDs, recharts for charts, etc.)

${DATA_MANAGEMENT_INFERENCE}

Respond with valid JSON ONLY. No markdown code fences, no explanation text.`;
  }

  getPlanningSystemPrompt(userPrompt: string, intent: IntentOutput | null): string {
    const intentBlock = intent
      ? `\n=== CLARIFIED GOAL ===\n${intent.clarifiedGoal}\n\nComplexity: ${intent.complexity}\n\nFeatures to implement:\n${intent.features.map((f) => `- ${f}`).join('\n')}\n\nTechnical approach: ${intent.technicalApproach}\n`
      : '';

    return `You are a React application architect. Your task is to create a detailed file plan
for the React application described below.
${intentBlock}
You MUST return a JSON object with exactly these fields:

{
  "files": [
    { "path": "package.json", "purpose": "project dependencies and scripts" },
    { "path": "src/main.tsx", "purpose": "ReactDOM entry point" },
    ...
  ],
  "components": ["ComponentName1", "ComponentName2", ...],
  "dependencies": ["react", "react-dom", "lucide-react", ...],
  "routing": ["/", "/about", "/tasks/:id"]  // empty array if single-page
}

File count guidelines:
- simple: 6–9 files
- medium: 10–15 files
- complex: 16–22 files

Always include: package.json, src/main.tsx, src/App.tsx, src/index.css, src/types/index.ts

File organization:
- src/components/ui/         — Button, Input, Modal, Card, Toast, Badge
- src/components/layout/     — Header, Footer, Sidebar, Layout, SharedLayout
- src/components/features/   — domain-specific feature components
- src/hooks/                 — custom React hooks
- src/context/               — React Context providers (for complex apps)
- src/pages/                 — page-level components (for multi-page apps)

Every component listed in "components" must have a corresponding entry in "files"
(both .tsx and .css if it has styles).

Respond with valid JSON ONLY. No markdown code fences, no explanation text.`;
  }

  getExecutionGenerationSystemPrompt(
    userPrompt: string,
    intent: IntentOutput | null,
    plan: PlanOutput | null
  ): string {
    const complexity = intent?.complexity ?? detectComplexity(userPrompt);
    const useDesignSystem = shouldIncludeDesignSystem(userPrompt);

    const intentBlock = intent
      ? `\n=== INTENT ANALYSIS ===\nGoal: ${intent.clarifiedGoal}\nComplexity: ${intent.complexity}\nFeatures: ${intent.features.map((f) => `\n  - ${f}`).join('')}\nApproach: ${intent.technicalApproach}\n`
      : '';

    const planBlock = plan
      ? `\n=== ARCHITECTURE PLAN ===\nFiles to create:\n${plan.files.map((f) => `  ${f.path} — ${f.purpose}`).join('\n')}\n\nComponents: ${plan.components.join(', ')}\nDependencies: ${plan.dependencies.join(', ')}\nRoutes: ${plan.routing.length ? plan.routing.join(', ') : 'none (single-page)'}\n`
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

${DATA_MANAGEMENT_INFERENCE}

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

${DETAILED_REACT_GUIDANCE}

${DETAILED_CSS_GUIDANCE}

${DETAILED_JSON_OUTPUT_GUIDANCE}

${getOutputBudgetGuidance(MODAL_MAX_OUTPUT_TOKENS_GENERATION)}

${getQualityBarReference(complexity)}

${wrapUserInput(userPrompt)}

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
      ? `\n=== INTENT ===\nGoal: ${intent.clarifiedGoal}\n`
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
Return a JSON object: { "files": [ ... ] }
Each element has "path", "operation" ("modify"|"create"|"replace_file"|"delete").
- "create": include "content" with full file content (new files only).
- "delete": just path and operation.
- "modify": include "edits" array with search/replace pairs.
- "replace_file": include "content" with the complete new file content. Use ONLY when the file needs such extensive changes that search/replace would be unreliable (e.g. >60% of lines changing). Prefer "modify" for smaller changes.
Respond with valid JSON only. Do NOT wrap in markdown code fences.

=== EDIT RULES ===
- "search" must exactly match existing code (whitespace, newlines included). Include 3–5 lines of context.
- Multiple edits to same file: list in file order. No line numbers in search.
- Small changes (<30 lines): modify. Large features (>50 lines new): create new component files.
- If a file needs many scattered edits (>5 edits or >60% rewrite), use "replace_file" instead of "modify".

${SEARCH_REPLACE_GUIDANCE}

${getOutputBudgetGuidance(MODAL_MAX_OUTPUT_TOKENS_MODIFICATION)}

${SYNTAX_INTEGRITY_RULES}

${DETAILED_REACT_GUIDANCE}

${DETAILED_CSS_GUIDANCE}

${DETAILED_JSON_OUTPUT_GUIDANCE}

${wrapUserInput(userPrompt)}`;
  }

  getReviewSystemPrompt(): string {
    return `You are a senior React code reviewer performing a final quality check on a generated application.

Your task is to carefully review all provided files and identify:
1. Broken imports — files referenced but not included in the project
2. TypeScript errors — undefined variables, incorrect types, missing props
3. Missing CSS classes — class names used in JSX but not defined in CSS files
4. Missing dependencies — packages used in code but not in package.json
5. Syntax errors — unclosed JSX tags, missing brackets, malformed expressions
6. React anti-patterns — missing key props in lists, calling hooks conditionally

Return a JSON object with exactly these fields:
{
  "verdict": "pass" | "fixed",
  "corrections": [
    {
      "path": "src/components/Button.tsx",
      "content": "<complete file content with fix applied>",
      "reason": "Missing import for useState"
    }
  ]
}

Rules:
- "pass": no errors found — corrections must be an empty array []
- "fixed": you made corrections — list every corrected file with its COMPLETE new content
- Only correct files with DEFINITE errors. Do NOT refactor or improve working code.
- Each correction must include the COMPLETE file content, not just the changed section.
- If a dependency is missing, correct package.json with the complete updated content.

Respond with valid JSON ONLY. No markdown code fences, no explanation text.`;
  }

  getBugfixSystemPrompt(errorContext: string, failureHistory: string[]): string {
    const historyBlock = failureHistory.length > 0
      ? `\n=== PREVIOUS FAILED REPAIR ATTEMPTS ===\nThe following approaches were tried and FAILED. You MUST try a different approach:\n${failureHistory.map((h, i) => `\nAttempt ${i + 1}:\n${h}`).join('\n')}\n`
      : '';

    return `You are a SENIOR React developer. Your task is to fix build errors in an existing React project.
${historyBlock}
=== BUILD ERRORS TO FIX ===
${errorContext}

=== INSTRUCTIONS ===
- Analyze each error carefully and understand its root cause
- Fix ALL errors listed above — do not leave any unfixed
- Return the complete modified project as JSON (all files, including unchanged ones)
- Common fixes:
  * Missing npm package → add to dependencies in package.json
  * Broken import path → fix the import statement
  * TypeScript error → fix the type or add the missing property
  * Undefined variable → add the missing declaration or import
  * JSX syntax error → fix the malformed JSX

${SYNTAX_INTEGRITY_RULES}

${DETAILED_REACT_GUIDANCE}

${DETAILED_JSON_OUTPUT_GUIDANCE}`;
  }

  // ─── Multi-Phase Pipeline Methods ──────────────────────────────────────

  getArchitecturePlanningPrompt(userPrompt: string, intent: IntentOutput | null): string {
    const intentBlock = intent
      ? `=== INTENT ANALYSIS ===\nGoal: ${intent.clarifiedGoal}\nComplexity: ${intent.complexity}\nFeatures:\n${intent.features.map(f => `  - ${f}`).join('\n')}\nApproach: ${intent.technicalApproach}\n`
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

=== LAYER DEFINITIONS ===
- "scaffold": types, interfaces, CSS tokens, package.json, main.tsx, index.css
- "logic": hooks, contexts, utilities, API clients
- "ui": React components (.tsx), co-located CSS files (.css)
- "integration": pages, App.tsx, routing, top-level providers

=== REQUIREMENTS ===
- Every file must be assigned to exactly one layer
- exports[] must list the TypeScript symbols this file exports
- imports[] must list only other plan files (by path) that this file imports from
- typeContracts must include the full TypeScript interface/type text
- cssVariables must include ALL design tokens (colors, spacing, radii, shadows)
- stateShape must define signatures for all shared hooks and contexts

File count: simple=6–9, medium=10–14, complex=15–22

Respond with valid JSON ONLY. No markdown code fences, no explanation.

${getOutputBudgetGuidance(MAX_OUTPUT_TOKENS_ARCHITECTURE_PLANNING)}

${wrapUserInput(userPrompt)}`;
  }

  getPlanReviewPrompt(plan: ArchitecturePlan): string {
    return buildPlanReviewPrompt(plan);
  }

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
