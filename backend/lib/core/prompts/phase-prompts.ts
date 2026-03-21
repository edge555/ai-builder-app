/**
 * @module core/prompts/phase-prompts
 * @description System prompt builders for each multi-phase generation stage.
 *
 * Each function returns a complete system prompt string ready to be passed
 * to the AI provider. The prompts reference type contracts, CSS variables,
 * state shape, and phase context from the architecture plan.
 *
 * Functions:
 * - getScaffoldPrompt — types, CSS vars, package.json, entry points
 * - getLogicPrompt — hooks, contexts, utilities
 * - getUIPrompt — components + CSS (recipe-aware)
 * - getIntegrationPrompt — pages, App.tsx, routing
 * - getPlanReviewPrompt — validate plan internal consistency
 */

import type { ArchitecturePlan, PlannedFile, TypeContract } from '../schemas';
import type { PhaseContext } from '../batch-context-builder';
import type { GenerationRecipe } from '../recipes/recipe-types';
import { getFragment } from '../recipes/fragment-registry';
import {
  SYNTAX_INTEGRITY_RULES,
  DEPENDENCY_GUIDANCE,
  COMMON_REACT_PATTERNS,
  LAYOUT_FUNDAMENTALS,
  BASELINE_VISUAL_POLISH,
  ACCESSIBILITY_GUIDANCE,
  REALISTIC_DATA_GUIDANCE,
  getOutputBudgetGuidance,
  wrapUserInput,
} from './shared-prompt-fragments';
import { composePhasePrompt } from '../recipes/recipe-engine';
import {
  MAX_OUTPUT_TOKENS_SCAFFOLD,
  MAX_OUTPUT_TOKENS_LOGIC,
  MAX_OUTPUT_TOKENS_UI,
  MAX_OUTPUT_TOKENS_INTEGRATION,
  MAX_OUTPUT_TOKENS_PLAN_REVIEW,
} from '../../constants';

// ─── Private Helpers ─────────────────────────────────────────────────────────

/** Format the plan's type contracts into a prompt section. */
function formatTypeContracts(contracts: TypeContract[]): string {
  if (contracts.length === 0) return '';
  const lines = contracts.map(tc => `// ${tc.name}\n${tc.definition}`);
  return `=== TYPE CONTRACTS (generate EXACTLY as shown) ===\n${lines.join('\n\n')}`;
}

/** Format the plan's CSS variables into a prompt section. */
function formatCSSVariables(plan: ArchitecturePlan): string {
  if (plan.cssVariables.length === 0) return '';
  const lines = plan.cssVariables.map(v => `  ${v.name}: ${v.value}; /* ${v.purpose} */`);
  return `=== CSS VARIABLES (define EXACTLY in :root) ===\n:root {\n${lines.join('\n')}\n}`;
}

/** Format the plan's state shape into a prompt section. */
function formatStateShape(plan: ArchitecturePlan): string {
  if (!plan.stateShape) return '';

  const parts: string[] = [];

  if (plan.stateShape.contexts?.length) {
    parts.push('CONTEXTS:');
    for (const ctx of plan.stateShape.contexts) {
      parts.push(`  ${ctx.name}:`);
      parts.push(`    State: ${ctx.stateFields.join(', ')}`);
      parts.push(`    Actions: ${ctx.actions.join(', ')}`);
    }
  }

  if (plan.stateShape.hooks?.length) {
    parts.push('HOOKS:');
    for (const hook of plan.stateShape.hooks) {
      parts.push(`  ${hook.name}: ${hook.signature}`);
      parts.push(`    Purpose: ${hook.purpose}`);
    }
  }

  return parts.length > 0
    ? `=== STATE SHAPE (implement matching these signatures) ===\n${parts.join('\n')}`
    : '';
}

/** Format a file list into a compact table for the prompt. */
function formatFilePlan(files: PlannedFile[]): string {
  if (files.length === 0) return '';
  const rows = files.map(f => {
    const exp = f.exports.length > 0 ? f.exports.join(', ') : '-';
    const imp = f.imports.length > 0 ? f.imports.join(', ') : '-';
    return `  ${f.path}  [${f.layer}]  exports: ${exp}  imports: ${imp}`;
  });
  return `=== FILES TO GENERATE ===\n${rows.join('\n')}`;
}

/** Format PhaseContext into prompt sections for injection into phase prompts. */
function formatPhaseContext(context: PhaseContext): string {
  const sections: string[] = [];

  // Type definitions (full content of scaffold files)
  if (context.typeDefinitions.size > 0) {
    const typeParts: string[] = ['=== TYPE DEFINITIONS (already generated — reference these) ==='];
    for (const [path, content] of context.typeDefinitions) {
      typeParts.push(`--- ${path} ---\n${content}`);
    }
    sections.push(typeParts.join('\n'));
  }

  // Direct dependencies (full content)
  if (context.directDependencies.size > 0) {
    const depParts: string[] = ['=== DIRECT DEPENDENCIES (already generated — import from these) ==='];
    for (const [path, content] of context.directDependencies) {
      depParts.push(`--- ${path} ---\n${content}`);
    }
    sections.push(depParts.join('\n'));
  }

  // File summaries (lightweight)
  if (context.fileSummaries.length > 0) {
    const summaryLines = context.fileSummaries.map(s => {
      const exp = s.exports.length > 0 ? `exports: ${s.exports.join(', ')}` : '';
      const cls = s.cssClasses.length > 0 ? `classes: ${s.cssClasses.join(', ')}` : '';
      return `  ${s.path}  ${[exp, cls].filter(Boolean).join('  ')}`;
    });
    sections.push(`=== OTHER GENERATED FILES (summary) ===\n${summaryLines.join('\n')}`);
  }

  // CSS variables
  if (context.cssVariables.length > 0) {
    sections.push(`=== AVAILABLE CSS VARIABLES ===\n${context.cssVariables.join(', ')}`);
  }

  // Relevant contracts
  if (context.relevantContracts.typeContracts.length > 0) {
    sections.push(formatTypeContracts(context.relevantContracts.typeContracts));
  }

  return sections.join('\n\n');
}

// ─── Public Prompt Builders ──────────────────────────────────────────────────

/**
 * System prompt for the scaffold phase.
 * Generates: types/interfaces, CSS variables, package.json, entry points.
 */
export function getScaffoldPrompt(plan: ArchitecturePlan, userPrompt: string): string {
  const scaffoldFiles = plan.files.filter(f => f.layer === 'scaffold');

  // Guarantee package.json is always in the scaffold file list — the planner sometimes omits it
  if (!scaffoldFiles.some(f => f.path === 'package.json')) {
    scaffoldFiles.unshift({
      path: 'package.json',
      purpose: 'npm package manifest with all project dependencies',
      layer: 'scaffold',
      exports: [],
      imports: [],
    });
  }

  return `You are a SENIOR TypeScript architect generating the foundation layer of a React application.
Your output will be consumed by subsequent AI generation phases — accuracy is critical.

${formatFilePlan(scaffoldFiles)}

${formatTypeContracts(plan.typeContracts)}

${formatCSSVariables(plan)}

=== SCAFFOLD RULES ===
1. Type definitions: Generate EXACTLY the interfaces/types listed in TYPE CONTRACTS above.
   Do NOT add extra fields, rename types, or change signatures.
2. CSS variables: Define EXACTLY the variables listed above in :root in index.css.
   Use the exact names and values specified.
3. package.json: Include ALL dependencies listed in the plan: ${plan.dependencies.join(', ')}
   Use specific semver versions (never "latest").
4. Entry files: src/main.tsx MUST import and render the App component. Use EXACTLY this content:
   import React from 'react';
   import ReactDOM from 'react-dom/client';
   import App from './App';
   import './index.css';
   ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
   Do NOT generate a placeholder or add comments about subsequent phases.
5. Every file must be complete and self-contained.

${DEPENDENCY_GUIDANCE}

${SYNTAX_INTEGRITY_RULES}

${getOutputBudgetGuidance(MAX_OUTPUT_TOKENS_SCAFFOLD)}

=== OUTPUT FORMAT ===
Return a JSON object: { "files": [{ "path": "...", "content": "..." }, ...] }
Generate ONLY the scaffold-layer files listed above. Do NOT generate components, hooks, or pages.

${wrapUserInput(userPrompt)}`;
}

/**
 * System prompt for the logic phase.
 * Generates: hooks, contexts, utilities.
 */
export function getLogicPrompt(
  plan: ArchitecturePlan,
  context: PhaseContext,
  userPrompt: string,
): string {
  const logicFiles = plan.files.filter(f => f.layer === 'logic');
  const stateShapeBlock = formatStateShape(plan);

  return `You are a SENIOR React developer generating the logic layer (hooks, contexts, utilities) for an application.
The scaffold layer (types, CSS, package.json) has already been generated — import from it.

${formatFilePlan(logicFiles)}

${formatPhaseContext(context)}

${stateShapeBlock}

=== LOGIC RULES ===
1. Hooks and contexts MUST match the signatures in STATE SHAPE above exactly.
2. Import types from the already-generated type files — do NOT redefine them.
3. Use the type names exactly as specified in the type contracts.
4. Each hook/context should be in its own file as listed in FILES TO GENERATE.
5. Do NOT generate any UI components or JSX — logic only.
6. Export all items that downstream phases will import.
7. CRITICAL — INITIAL DATA: Every hook that manages a data collection (useTodos, usePosts, useTasks, etc.)
   MUST initialize useState with a hardcoded array of 5-8 realistic sample items.
   NEVER initialize with an empty array []. NEVER use useEffect + fetch/setTimeout for initial data.
   The app must render with real content on first load — no loading spinners, no blank screens.
   Example: const [items, setItems] = useState<Item[]>(INITIAL_ITEMS);
   Define INITIAL_ITEMS as a const above the hook with realistic, domain-appropriate data.

${COMMON_REACT_PATTERNS}

${SYNTAX_INTEGRITY_RULES}

${getOutputBudgetGuidance(MAX_OUTPUT_TOKENS_LOGIC)}

=== OUTPUT FORMAT ===
Return a JSON object: { "files": [{ "path": "...", "content": "..." }, ...] }
Generate ONLY the logic-layer files listed above.

${wrapUserInput(userPrompt)}`;
}

/**
 * System prompt for the UI phase.
 * Generates: components + co-located CSS.
 * Recipe-aware: uses phaseFragments if available.
 */
export function getUIPrompt(
  plan: ArchitecturePlan,
  context: PhaseContext,
  userPrompt: string,
  recipe?: GenerationRecipe,
): string {
  const uiFiles = plan.files.filter(f => f.layer === 'ui');

  // Use recipe phase fragments if available, otherwise fall back to defaults
  const fragmentsBlock = composePhasePrompt(recipe, 'ui');

  return `You are a SENIOR React UI developer generating production-quality components and CSS.
The scaffold (types, CSS vars) and logic (hooks, contexts) layers are already generated — import from them.

${formatFilePlan(uiFiles)}

${formatPhaseContext(context)}

=== UI RULES ===
1. Import types from scaffold-layer type files. Import hooks/contexts from logic-layer files.
2. Use the CSS variables already defined — do NOT hardcode colors, spacing, or radii.
3. Co-locate CSS with components: ComponentName.tsx + ComponentName.css.
4. Keep components focused and under 80 lines each. Split complex components.
5. Every component file MUST use \`export default ComponentName\`.
6. Use BEM-like naming scoped to component (e.g., .todo-list, .todo-list__item).
7. Add hover states, transitions, and focus styles to all interactive elements.
8. Components MUST render content immediately — no loading spinners on first render.
   Hooks provide pre-populated data. Show empty states only after user deletes all items.
9. Every interactive element must be FUNCTIONAL: buttons do actions, forms submit, lists are editable.
   Never render static text-only UI — every feature must have working CRUD operations.

${fragmentsBlock}

${getOutputBudgetGuidance(MAX_OUTPUT_TOKENS_UI)}

=== OUTPUT FORMAT ===
Return a JSON object: { "files": [{ "path": "...", "content": "..." }, ...] }
Generate ONLY the UI-layer files listed above. Do NOT regenerate scaffold or logic files.

${wrapUserInput(userPrompt)}`;
}

/**
 * System prompt for the integration phase.
 * Generates: pages, App.tsx, routing.
 */
export function getIntegrationPrompt(
  plan: ArchitecturePlan,
  context: PhaseContext,
  userPrompt: string,
): string {
  const integrationFiles = plan.files.filter(f => f.layer === 'integration');
  const routingBlock = plan.routing.length > 0
    ? `=== ROUTES TO WIRE ===\n${plan.routing.map(r => `  ${r}`).join('\n')}`
    : '';

  return `You are a SENIOR React architect wiring together the integration layer — pages, App.tsx, and routing.
All scaffold, logic, and UI components are already generated — import and compose them.

${formatFilePlan(integrationFiles)}

${formatPhaseContext(context)}

${routingBlock}

=== INTEGRATION RULES ===
1. App.tsx MUST be routing/layout only — max 50 lines. Delegate to page components.
2. Import components from the UI layer and hooks/contexts from the logic layer.
3. Wire routing as specified in ROUTES TO WIRE above.
4. Wrap with context providers as needed (from logic layer).
5. Do NOT reimplement any component or hook — only import and compose.
6. Do NOT add new CSS — use existing component styles and CSS variables.
7. Each page component should be thin: compose existing components, manage page-level state only.
8. CRITICAL: The app MUST be fully functional on first render — no loading screens, no blank pages.
   All data hooks provide pre-populated sample data. All UI components render content immediately.

${COMMON_REACT_PATTERNS}

${SYNTAX_INTEGRITY_RULES}

${getOutputBudgetGuidance(MAX_OUTPUT_TOKENS_INTEGRATION)}

=== OUTPUT FORMAT ===
Return a JSON object: { "files": [{ "path": "...", "content": "..." }, ...] }
Generate ONLY the integration-layer files listed above.

${wrapUserInput(userPrompt)}`;
}

/**
 * System prompt for the plan review stage.
 * AI validates the architecture plan for internal consistency.
 */
export function getPlanReviewPrompt(plan: ArchitecturePlan): string {
  const planJson = JSON.stringify(plan, null, 2);

  return `You are a SENIOR software architect reviewing an architecture plan for a React application.
Check the plan below for internal consistency issues.

=== ARCHITECTURE PLAN ===
${planJson}

=== REVIEW CHECKLIST ===
1. IMPORT VALIDITY: Every file's "imports" array must reference paths that exist in the plan's files list.
2. TYPE REFERENCES: Every typeContract name must be exported by at least one scaffold-layer file.
3. LAYER ASSIGNMENTS: Files in the wrong layer (e.g., a component in "scaffold", a type file in "ui").
4. CIRCULAR IMPORTS: No circular dependency chains between files.
5. EXPORT COMPLETENESS: Every symbol imported by another file should be in the source file's exports.
6. MISSING FILES: If a file imports a path not in the plan, flag it.
7. STATE SHAPE: Hook/context names in stateShape should match exports of logic-layer files.

=== OUTPUT FORMAT ===
Return a JSON object:
{
  "valid": true/false,
  "issues": [
    { "type": "dangling_import" | "missing_type" | "wrong_layer" | "circular_dep" | "missing_export",
      "file": "path",
      "detail": "description" }
  ],
  "corrections": {
    "filesToAdd": [{ "path": "...", "purpose": "...", "layer": "...", "exports": [...], "imports": [...] }],
    "filesToRemove": ["path"],
    "importsToFix": [{ "file": "path", "removeImport": "old", "addImport": "new" }]
  }
}

If no issues found, return { "valid": true, "issues": [], "corrections": {} }.
Respond with valid JSON only. Do NOT be overly pedantic — only report issues that would cause build failures or runtime errors.

${getOutputBudgetGuidance(MAX_OUTPUT_TOKENS_PLAN_REVIEW)}`;
}
