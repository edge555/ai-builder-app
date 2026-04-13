/**
 * @module core/recipes/fragment-registry
 * @description Central registry of prompt fragment keys → text content.
 *
 * All prompt fragments (from shared-prompt-fragments.ts and fullstack-fragments.ts)
 * register here at import time. Recipes reference fragments by key; the
 * PromptComposer in recipe-engine.ts looks them up via `getFragment()`.
 *
 * Unknown keys are caught at startup by `validateRecipeFragments()` in recipe-types.ts.
 */

import { registerFragment } from './recipe-types';

// ─── Fragment Store ──────────────────────────────────────────────────────────

const fragments = new Map<string, string>();

/**
 * Register a prompt fragment by key. Also registers the key in recipe-types
 * so that `validateRecipeFragments()` can verify recipe configs at startup.
 */
export function addFragment(key: string, text: string): void {
  fragments.set(key, text);
  registerFragment(key);
}

/**
 * Look up a fragment by key. Returns undefined if not registered.
 */
export function getFragment(key: string): string | undefined {
  return fragments.get(key);
}

// ─── Register shared fragments ──────────────────────────────────────────────

import {
  LAYOUT_FUNDAMENTALS,
  BASELINE_VISUAL_POLISH,
  REALISTIC_DATA_GUIDANCE,
  ACCESSIBILITY_GUIDANCE,
  DEPENDENCY_GUIDANCE,
  SYNTAX_INTEGRITY_RULES,
  COMMON_REACT_PATTERNS,
} from '../prompts/shared-prompt-fragments';

addFragment('LAYOUT_FUNDAMENTALS', LAYOUT_FUNDAMENTALS);
addFragment('BASELINE_VISUAL_POLISH', BASELINE_VISUAL_POLISH);
addFragment('REALISTIC_DATA_GUIDANCE', REALISTIC_DATA_GUIDANCE);
addFragment('ACCESSIBILITY_GUIDANCE', ACCESSIBILITY_GUIDANCE);
addFragment('DEPENDENCY_GUIDANCE', DEPENDENCY_GUIDANCE);
addFragment('SYNTAX_INTEGRITY_RULES', SYNTAX_INTEGRITY_RULES);
addFragment('COMMON_REACT_PATTERNS', COMMON_REACT_PATTERNS);

// ─── Register fullstack fragments ────────────────────────────────────────────

import {
  NEXTJS_API_PATTERNS,
  DATABASE_SCHEMA_GUIDANCE,
  AUTH_SCAFFOLDING_GUIDANCE,
  FULLSTACK_STRUCTURE,
} from './fullstack-fragments';

addFragment('NEXTJS_API_PATTERNS', NEXTJS_API_PATTERNS);
addFragment('DATABASE_SCHEMA_GUIDANCE', DATABASE_SCHEMA_GUIDANCE);
addFragment('AUTH_SCAFFOLDING_GUIDANCE', AUTH_SCAFFOLDING_GUIDANCE);
addFragment('FULLSTACK_STRUCTURE', FULLSTACK_STRUCTURE);
addFragment(
  'BEGINNER_MODE_CONSTRAINTS',
  `CONSTRAINTS: max 6 files, no fetch() or axios, no external APIs,
local state only with useState, minimum 2 event handlers (onClick/onChange/onSubmit),
hardcode all sample data inline`
);
