/**
 * @module core/recipes/recipe-engine
 * @description RecipeSelector (picks a recipe from intent output) and
 * PromptComposer (assembles the execution prompt from a recipe's fragment list).
 *
 * The selector runs after the intent stage. If fullstack recipes are disabled
 * (feature flag off) or intent is null, it falls back to react-spa.
 *
 * The composer replaces the hardcoded fragment assembly in ApiPromptProvider
 * with a data-driven approach: iterate the recipe's promptFragments list,
 * look up each fragment, and concatenate.
 */

import type { IntentOutput, PlanOutput } from '../schemas';
import type { GenerationRecipe } from './recipe-types';
import { getRecipe, getDefaultRecipe } from './recipe-types';
import { getFragment } from './fragment-registry';
import { createLogger } from '../../logger';
import {
  detectComplexity,
  shouldIncludeDesignSystem,
  getFileRequirements,
  getQualityBarReference,
} from '../prompts/generation-prompt-utils';
import {
  DESIGN_SYSTEM_CONSTANTS,
  getOutputBudgetGuidance,
  wrapUserInput,
} from '../prompts/shared-prompt-fragments';
import { MAX_OUTPUT_TOKENS_GENERATION } from '../../constants';

const logger = createLogger('RecipeEngine');

// ─── Recipe Selector ─────────────────────────────────────────────────────────

/**
 * Maps intent output projectType to a recipe ID.
 * Falls back to react-spa on unknown values or null intent.
 */
const PROJECT_TYPE_TO_RECIPE: Record<string, string> = {
  spa: 'react-spa',
  fullstack: 'nextjs-prisma',
  'fullstack-auth': 'nextjs-supabase-auth',
};

export interface RecipeSelectorOptions {
  /** When false, always returns react-spa regardless of intent. */
  fullstackEnabled: boolean;
}

/**
 * Select the appropriate recipe based on intent analysis output.
 *
 * Decision flow:
 *   1. If fullstack disabled or intent is null → react-spa
 *   2. Map intent.projectType → recipe ID
 *   3. If recipe not found → react-spa + log warning
 */
/**
 * Explicit keywords that indicate the user actually wants a fullstack/backend setup.
 * Without these, even if the LLM classifies as "fullstack", we fall back to SPA.
 */
const FULLSTACK_SIGNALS = [
  'database', 'backend', 'server', 'api route', 'api endpoint',
  'next.js', 'nextjs', 'prisma', 'postgresql', 'postgres', 'mysql', 'mongodb', 'sqlite',
  'supabase', 'firebase', 'server-side', 'ssr', 'server side rendering',
  'rest api', 'graphql', 'drizzle', 'orm',
];

const AUTH_SIGNALS = [
  'login', 'sign in', 'signin', 'sign up', 'signup', 'register', 'registration',
  'authentication', 'auth', 'oauth', 'jwt', 'session', 'supabase auth',
  'user account', 'user accounts', 'protected route',
];

/**
 * Returns true only if the user prompt contains explicit fullstack/auth signals.
 * This prevents the LLM from over-classifying simple apps as fullstack.
 */
function hasExplicitSignals(userPrompt: string, signals: string[]): boolean {
  const lower = userPrompt.toLowerCase();
  return signals.some(s => {
    // Multi-word signals (e.g. "api route") — substring match is safe
    if (s.includes(' ') || s.includes('.') || s.includes('-')) return lower.includes(s);
    // Single-word signals — use word boundary to avoid "auth" matching "author"
    return new RegExp(`\\b${s}\\b`).test(lower);
  });
}

export function selectRecipe(
  intent: IntentOutput | null,
  options: RecipeSelectorOptions,
  userPrompt?: string
): GenerationRecipe {
  if (!options.fullstackEnabled || !intent) {
    return getDefaultRecipe();
  }

  const projectType = intent.projectType;
  if (!projectType || projectType === 'spa') {
    return getDefaultRecipe();
  }

  // Guard: require explicit signals in the user's prompt before using a fullstack recipe.
  // The LLM frequently over-classifies simple apps (blog, task tracker, todo) as fullstack.
  if (userPrompt) {
    if (projectType === 'fullstack-auth' && !hasExplicitSignals(userPrompt, AUTH_SIGNALS)) {
      logger.info('Overriding fullstack-auth → spa: no explicit auth signals in prompt', { userPrompt });
      return getDefaultRecipe();
    }
    if ((projectType === 'fullstack' || projectType === 'fullstack-auth') && !hasExplicitSignals(userPrompt, FULLSTACK_SIGNALS)) {
      logger.info('Overriding fullstack → spa: no explicit fullstack signals in prompt', { projectType, userPrompt });
      return getDefaultRecipe();
    }
  }

  const recipeId = PROJECT_TYPE_TO_RECIPE[projectType];
  if (!recipeId) {
    logger.warn('Unknown projectType from intent, falling back to react-spa', { projectType });
    return getDefaultRecipe();
  }

  const recipe = getRecipe(recipeId);
  if (!recipe) {
    logger.warn('Recipe not found, falling back to react-spa', { recipeId });
    return getDefaultRecipe();
  }

  logger.info('Selected recipe', { recipeId: recipe.id, projectType });
  return recipe;
}

// ─── Prompt Composer ─────────────────────────────────────────────────────────

/**
 * Compose the execution generation system prompt from a recipe.
 *
 * Replaces the hardcoded fragment assembly in ApiPromptProvider.getExecutionGenerationSystemPrompt()
 * with a data-driven approach driven by the recipe's promptFragments list.
 */
export function composeExecutionPrompt(
  recipe: GenerationRecipe,
  userPrompt: string,
  intent: IntentOutput | null,
  plan: PlanOutput | null
): string {
  const complexity = intent?.complexity ?? detectComplexity(userPrompt);
  const useDesignSystem = shouldIncludeDesignSystem(userPrompt);

  // Build intent block
  const intentBlock = intent
    ? `\n=== INTENT ANALYSIS ===\nGoal: ${intent.clarifiedGoal}\nFeatures: ${intent.features.join(', ')}\nApproach: ${intent.technicalApproach}\n`
    : '';

  // Build plan block
  const planBlock = plan
    ? `\n=== FILE PLAN ===\nFiles: ${plan.files.map((f) => f.path).join(', ')}\nComponents: ${plan.components.join(', ')}\nDependencies: ${plan.dependencies.join(', ')}\n`
    : '';

  // Assemble fragments from the recipe
  const fragmentSections: string[] = [];
  for (const fragKey of recipe.promptFragments) {
    const text = getFragment(fragKey);
    if (text) {
      fragmentSections.push(text);
    } else {
      logger.warn('Missing prompt fragment, skipping', { fragment: fragKey, recipe: recipe.id });
    }
  }

  // Preamble
  const preamble = recipe.id === 'react-spa'
    ? 'You are a SENIOR React architect generating production-quality, modular React applications.\nCRITICAL: NEVER put everything in App.tsx — use proper component separation.'
    : `You are a SENIOR full-stack developer generating production-quality ${recipe.name} applications.\nCRITICAL: Follow the file structure and patterns exactly as specified.`;

  const parts = [
    preamble,
    intentBlock,
    planBlock,
    recipe.fileStructure,
    '\n=== COMPONENT RULES ===',
    '- Single responsibility, under 80 lines each. Split if larger.',
    '- UI components = pure presentation via props. Containers = state + data flow. Hooks = reusable logic.',
    '- Create generic reusable UI components (Button, Input, Card). Co-locate CSS per component.\n',
    getFileRequirements(complexity),
    ...fragmentSections,
    useDesignSystem ? `${DESIGN_SYSTEM_CONSTANTS}\n` : '',
    // CSS best practices (only for SPA — fullstack recipes have their own patterns)
    recipe.id === 'react-spa' ? CSS_BEST_PRACTICES : '',
    getOutputBudgetGuidance(MAX_OUTPUT_TOKENS_GENERATION),
    getQualityBarReference(complexity),
    wrapUserInput(userPrompt),
    'Generate a complete application with perfect syntax and proper component separation.',
  ];

  return parts.filter(Boolean).join('\n\n');
}

/**
 * Compose a prompt fragment block for a specific pipeline phase.
 * 
 * Looks up `recipe.phaseFragments[phase]` and concatenates the fragments.
 * If the recipe lacks specific fragments for the phase, it falls back to a default set
 * of SPA fragments.
 */
export function composePhasePrompt(
  recipe: GenerationRecipe | undefined | null,
  phase: string
): string {
  // If recipe provides specific fragments for this phase, use them
  if (recipe?.phaseFragments) {
    const keys = recipe.phaseFragments[phase as keyof typeof recipe.phaseFragments];
    if (keys && keys.length > 0) {
      const parts: string[] = [];
      for (const key of keys) {
        const text = getFragment(key);
        if (text) parts.push(text);
        else logger.warn('Missing phase prompt fragment, skipping', { fragment: key, recipe: recipe.id, phase });
      }
      return parts.join('\n\n');
    }
  }

  // Fallback to default SPA fragments based on the phase.
  // Generally, UI and Integration phases need full visual/patterns guidance,
  // while logic and scaffold prompts are heavily structured and don't need all visual patterns.
  // For safety and fallback context, we'll provide the comprehensive regular set 
  // similar to what was originally in getUIPrompt.
  const DEFAULT_SPA_PHASE_FRAGMENTS = [
    'LAYOUT_FUNDAMENTALS',
    'BASELINE_VISUAL_POLISH',
    'REALISTIC_DATA_GUIDANCE',
    'ACCESSIBILITY_GUIDANCE',
    'COMMON_REACT_PATTERNS',
    'SYNTAX_INTEGRITY_RULES'
  ];
  
  return DEFAULT_SPA_PHASE_FRAGMENTS.map(key => getFragment(key)).filter(Boolean).join('\n\n');
}

const CSS_BEST_PRACTICES = `=== CSS BEST PRACTICES ===
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
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05); --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1);`;
