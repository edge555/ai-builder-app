/**
 * @module core/recipes/recipe-types
 * @description GenerationRecipe interface, recipe registry, and lookup functions.
 *
 * Each recipe defines how a particular project stack is generated:
 * which prompt fragments to include, what file structure to suggest,
 * which validators to run, and how to preview the result.
 *
 * Adding a new stack = adding a new recipe config here. No code changes
 * elsewhere in the pipeline.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

import type { PhaseLayer } from '../schemas';

/**
 * Per-phase fragment assignments for multi-phase generation.
 * Each key maps to a list of prompt fragment keys injected
 * into that phase's system prompt. Phases without explicit
 * fragment lists fall back to the recipe's top-level
 * `promptFragments`.
 */
export type PhaseFragments = Partial<Record<PhaseLayer, string[]>>;

// ─── Interface ───────────────────────────────────────────────────────────────

export interface GenerationRecipe {
  /** Unique recipe identifier. */
  id: string;
  /** Human-readable name shown in logs/UI. */
  name: string;
  /**
   * Which shared prompt fragment keys to include in the execution prompt.
   * Order matters — fragments are concatenated in this order.
   */
  promptFragments: string[];
  /** File-structure guidance text injected into the execution prompt. */
  fileStructure: string | string[];
  /** Which validator IDs/rules to run on generated output. */
  validationRules: string[] | {
    maxFiles: number;
    minFiles: number;
    forbiddenPatterns: string[];
  };
  /** Preview strategy for the frontend. */
  previewStrategy: 'sandpack' | 'export-only';
  /** npm packages always included in generated package.json. */
  defaultDependencies: string[];
  /**
   * Optional per-phase prompt fragment assignments for multi-phase generation.
   * When present, the phase executor injects only the listed fragments
   * for each layer instead of the full `promptFragments` list.
   */
  phaseFragments?: PhaseFragments;
}

// ─── Fragment Registry (validated at registration time) ──────────────────────

/**
 * Set of known fragment keys.
 * Populated by `registerFragment()` in shared-prompt-fragments and new fragment files.
 * Recipes reference fragments by key; unknown keys fail fast at startup.
 */
const knownFragments = new Set<string>();

export function registerFragment(key: string): void {
  knownFragments.add(key);
}

export function isKnownFragment(key: string): boolean {
  return knownFragments.has(key);
}

// ─── Recipe Registry ─────────────────────────────────────────────────────────

const RECIPE_REGISTRY = new Map<string, GenerationRecipe>();

/**
 * React SPA recipe — current default behavior.
 * Generates a client-side React app with Sandpack preview.
 */
const REACT_SPA: GenerationRecipe = {
  id: 'react-spa',
  name: 'React SPA',
  promptFragments: [
    'LAYOUT_FUNDAMENTALS',
    'BASELINE_VISUAL_POLISH',
    'REALISTIC_DATA_GUIDANCE',
    'ACCESSIBILITY_GUIDANCE',
    'DEPENDENCY_GUIDANCE',
    'SYNTAX_INTEGRITY_RULES',
    'COMMON_REACT_PATTERNS',
  ],
  fileStructure: `=== PROJECT STRUCTURE ===
- package.json (all dependencies)
- src/main.tsx (entry point only — ReactDOM.render)
- src/App.tsx (layout/routing only, max 50 lines)
- src/index.css (global styles, CSS variables, resets)
- src/components/ui/*.tsx + *.css (reusable: Button, Input, Card, Modal)
- src/components/layout/*.tsx + *.css (Header, Footer, Sidebar)
- src/components/features/*.tsx + *.css (domain-specific components)
- src/hooks/*.ts (custom hooks: useLocalStorage, useForm)
- src/types/index.ts (TypeScript interfaces)`,
  validationRules: ['imports', 'syntax', 'dependencies'],
  previewStrategy: 'sandpack',
  defaultDependencies: ['react', 'react-dom', 'lucide-react'],
  phaseFragments: {
    scaffold: ['DEPENDENCY_GUIDANCE', 'SYNTAX_INTEGRITY_RULES'],
    logic: ['COMMON_REACT_PATTERNS', 'REALISTIC_DATA_GUIDANCE', 'SYNTAX_INTEGRITY_RULES'],
    ui: [
      'LAYOUT_FUNDAMENTALS',
      'BASELINE_VISUAL_POLISH',
      'REALISTIC_DATA_GUIDANCE',
      'ACCESSIBILITY_GUIDANCE',
      'COMMON_REACT_PATTERNS',
      'SYNTAX_INTEGRITY_RULES',
    ],
    integration: ['COMMON_REACT_PATTERNS', 'REALISTIC_DATA_GUIDANCE', 'SYNTAX_INTEGRITY_RULES'],
  },
};

/**
 * Next.js + Prisma recipe — full-stack with database.
 */
const NEXTJS_PRISMA: GenerationRecipe = {
  id: 'nextjs-prisma',
  name: 'Next.js + Prisma',
  promptFragments: [
    'LAYOUT_FUNDAMENTALS',
    'BASELINE_VISUAL_POLISH',
    'REALISTIC_DATA_GUIDANCE',
    'ACCESSIBILITY_GUIDANCE',
    'DEPENDENCY_GUIDANCE',
    'SYNTAX_INTEGRITY_RULES',
    'COMMON_REACT_PATTERNS',
    'NEXTJS_API_PATTERNS',
    'DATABASE_SCHEMA_GUIDANCE',
    'FULLSTACK_STRUCTURE',
  ],
  fileStructure: `=== PROJECT STRUCTURE (Next.js + Prisma) ===
- package.json (all dependencies including prisma, @prisma/client, next)
- next.config.js
- prisma/schema.prisma (database models with relations)
- app/layout.tsx (root layout with metadata, fonts, providers)
- app/page.tsx (home page — "use client" only if interactive)
- app/api/[resource]/route.ts (REST API routes using Prisma client)
- app/[page]/page.tsx (additional pages)
- components/ui/*.tsx + *.css (reusable UI components)
- components/features/*.tsx + *.css (domain-specific components)
- lib/prisma.ts (singleton Prisma client)
- lib/actions.ts (server actions for mutations)
- types/index.ts (TypeScript interfaces matching Prisma models)`,
  validationRules: ['imports', 'syntax', 'dependencies', 'prisma', 'server-client-boundary'],
  previewStrategy: 'export-only',
  defaultDependencies: ['next', 'react', 'react-dom', 'prisma', '@prisma/client', 'lucide-react'],
  phaseFragments: {
    scaffold: ['DEPENDENCY_GUIDANCE', 'SYNTAX_INTEGRITY_RULES', 'DATABASE_SCHEMA_GUIDANCE'],
    logic: ['COMMON_REACT_PATTERNS', 'REALISTIC_DATA_GUIDANCE', 'SYNTAX_INTEGRITY_RULES', 'NEXTJS_API_PATTERNS'],
    ui: [
      'LAYOUT_FUNDAMENTALS',
      'BASELINE_VISUAL_POLISH',
      'REALISTIC_DATA_GUIDANCE',
      'ACCESSIBILITY_GUIDANCE',
      'COMMON_REACT_PATTERNS',
      'SYNTAX_INTEGRITY_RULES',
    ],
    integration: ['COMMON_REACT_PATTERNS', 'REALISTIC_DATA_GUIDANCE', 'SYNTAX_INTEGRITY_RULES', 'FULLSTACK_STRUCTURE'],
  },
};

/**
 * Next.js + Supabase Auth recipe — full-stack with auth and RLS.
 */
const NEXTJS_SUPABASE_AUTH: GenerationRecipe = {
  id: 'nextjs-supabase-auth',
  name: 'Next.js + Supabase Auth',
  promptFragments: [
    'LAYOUT_FUNDAMENTALS',
    'BASELINE_VISUAL_POLISH',
    'REALISTIC_DATA_GUIDANCE',
    'ACCESSIBILITY_GUIDANCE',
    'DEPENDENCY_GUIDANCE',
    'SYNTAX_INTEGRITY_RULES',
    'COMMON_REACT_PATTERNS',
    'NEXTJS_API_PATTERNS',
    'AUTH_SCAFFOLDING_GUIDANCE',
    'FULLSTACK_STRUCTURE',
  ],
  fileStructure: `=== PROJECT STRUCTURE (Next.js + Supabase Auth) ===
- package.json (all dependencies including @supabase/supabase-js, @supabase/ssr, next)
- next.config.js
- .env.example (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)
- app/layout.tsx (root layout with SupabaseProvider)
- app/page.tsx (home/landing page)
- app/(auth)/login/page.tsx (login form)
- app/(auth)/signup/page.tsx (signup form)
- app/(protected)/layout.tsx (auth guard layout)
- app/(protected)/dashboard/page.tsx (authenticated dashboard)
- app/api/auth/callback/route.ts (OAuth callback handler)
- components/ui/*.tsx + *.css (reusable UI components)
- components/features/*.tsx + *.css (domain-specific components)
- lib/supabase/client.ts (browser Supabase client)
- lib/supabase/server.ts (server Supabase client)
- lib/supabase/middleware.ts (session refresh middleware)
- middleware.ts (Next.js middleware for auth)
- types/index.ts (TypeScript interfaces)`,
  validationRules: ['imports', 'syntax', 'dependencies', 'server-client-boundary'],
  previewStrategy: 'export-only',
  defaultDependencies: ['next', 'react', 'react-dom', '@supabase/supabase-js', '@supabase/ssr', 'lucide-react'],
  phaseFragments: {
    scaffold: ['DEPENDENCY_GUIDANCE', 'SYNTAX_INTEGRITY_RULES', 'AUTH_SCAFFOLDING_GUIDANCE'],
    logic: ['COMMON_REACT_PATTERNS', 'REALISTIC_DATA_GUIDANCE', 'SYNTAX_INTEGRITY_RULES', 'NEXTJS_API_PATTERNS', 'AUTH_SCAFFOLDING_GUIDANCE'],
    ui: [
      'LAYOUT_FUNDAMENTALS',
      'BASELINE_VISUAL_POLISH',
      'REALISTIC_DATA_GUIDANCE',
      'ACCESSIBILITY_GUIDANCE',
      'COMMON_REACT_PATTERNS',
      'SYNTAX_INTEGRITY_RULES',
    ],
    integration: ['COMMON_REACT_PATTERNS', 'REALISTIC_DATA_GUIDANCE', 'SYNTAX_INTEGRITY_RULES', 'FULLSTACK_STRUCTURE', 'AUTH_SCAFFOLDING_GUIDANCE'],
  },
};

/**
 * React SPA beginner recipe — constrained classroom-safe generation.
 */
const REACT_SPA_BEGINNER: GenerationRecipe = {
  id: 'react-spa-beginner',
  name: 'React SPA (Beginner)',
  promptFragments: [
    'COMMON_REACT_PATTERNS',
    'SYNTAX_INTEGRITY_RULES',
    'BEGINNER_MODE_CONSTRAINTS',
  ],
  fileStructure: [
    'package.json',
    'src/main.tsx',
    'src/index.css',
    'src/App.tsx',
    'src/components/[AppName].tsx',
  ],
  validationRules: {
    maxFiles: 6,
    minFiles: 4,
    forbiddenPatterns: ['fetch(', 'axios'],
  },
  previewStrategy: 'sandpack',
  defaultDependencies: ['react', 'react-dom'],
};

// ─── Registration ────────────────────────────────────────────────────────────

function registerRecipe(recipe: GenerationRecipe): void {
  RECIPE_REGISTRY.set(recipe.id, recipe);
}

// Register all built-in recipes
registerRecipe(REACT_SPA);
registerRecipe(NEXTJS_PRISMA);
registerRecipe(NEXTJS_SUPABASE_AUTH);
registerRecipe(REACT_SPA_BEGINNER);

// ─── Lookup Functions ────────────────────────────────────────────────────────

export function getRecipe(id: string): GenerationRecipe | undefined {
  return RECIPE_REGISTRY.get(id);
}

export function getDefaultRecipe(): GenerationRecipe {
  return REACT_SPA;
}

export function listRecipes(): GenerationRecipe[] {
  return Array.from(RECIPE_REGISTRY.values());
}

/**
 * Validate that all recipes reference known fragments.
 * Call this at startup after all fragments have been registered.
 */
export function validateRecipeFragments(): string[] {
  const errors: string[] = [];
  for (const recipe of RECIPE_REGISTRY.values()) {
    for (const frag of recipe.promptFragments) {
      if (!isKnownFragment(frag)) {
        errors.push(`Recipe "${recipe.id}" references unknown fragment "${frag}"`);
      }
    }
    // Also validate per-phase fragments if present
    if (recipe.phaseFragments) {
      for (const [phase, frags] of Object.entries(recipe.phaseFragments)) {
        for (const frag of frags) {
          if (!isKnownFragment(frag)) {
            errors.push(`Recipe "${recipe.id}" phase "${phase}" references unknown fragment "${frag}"`);
          }
        }
      }
    }
  }
  return errors;
}
