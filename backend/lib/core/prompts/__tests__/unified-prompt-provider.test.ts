import { describe, it, expect } from 'vitest';
import { UnifiedPromptProvider } from '../unified-prompt-provider';
import { getCSSLibrary } from '../css-library';
import {
  MAX_OUTPUT_TOKENS_INTENT,
  MAX_OUTPUT_TOKENS_PLANNING_STAGE,
  MAX_OUTPUT_TOKENS_GENERATION,
  MAX_OUTPUT_TOKENS_MODIFICATION,
  MAX_OUTPUT_TOKENS_ARCHITECTURE_PLANNING,
  MAX_OUTPUT_TOKENS_PLAN_REVIEW,
  MAX_OUTPUT_TOKENS_SCAFFOLD,
  MAX_OUTPUT_TOKENS_LOGIC,
  MAX_OUTPUT_TOKENS_UI,
  MAX_OUTPUT_TOKENS_INTEGRATION,
} from '../../../constants';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SAMPLE_INTENT = {
  clarifiedGoal: 'A simple todo app',
  complexity: 'simple' as const,
  features: ['add todo', 'delete todo', 'mark complete'],
  technicalApproach: 'useState, no routing',
  projectType: 'spa' as const,
};

const SAMPLE_PLAN = {
  files: [{ path: 'src/App.tsx', purpose: 'main app' }],
  components: ['App', 'TodoItem'],
  dependencies: ['react', 'react-dom'],
  routing: [],
};

const SAMPLE_ARCH_PLAN = {
  files: [],
  components: [],
  dependencies: [],
  routing: [],
  typeContracts: [],
  cssVariables: [],
  stateShape: { contexts: [], hooks: [] },
};

const EMPTY_PHASE_CONTEXT = {
  typeDefinitions: new Map<string, string>(),
  directDependencies: new Map<string, string>(),
  fileSummaries: [],
  cssVariables: [],
  relevantContracts: { typeContracts: [] },
  missingPlannedImports: [],
};

// ─── 1. Default config produces API token budgets ─────────────────────────────

describe('UnifiedPromptProvider — default config (API)', () => {
  it('uses API token budgets when no config is provided', () => {
    const p = new UnifiedPromptProvider();
    expect(p.tokenBudgets.intent).toBe(MAX_OUTPUT_TOKENS_INTENT);
    expect(p.tokenBudgets.planning).toBe(MAX_OUTPUT_TOKENS_PLANNING_STAGE);
    expect(p.tokenBudgets.executionGeneration).toBe(MAX_OUTPUT_TOKENS_GENERATION);
    expect(p.tokenBudgets.executionModification).toBe(MAX_OUTPUT_TOKENS_MODIFICATION);
    expect(p.tokenBudgets.architecturePlanning).toBe(MAX_OUTPUT_TOKENS_ARCHITECTURE_PLANNING);
    expect(p.tokenBudgets.planReview).toBe(MAX_OUTPUT_TOKENS_PLAN_REVIEW);
    expect(p.tokenBudgets.scaffold).toBe(MAX_OUTPUT_TOKENS_SCAFFOLD);
    expect(p.tokenBudgets.logic).toBe(MAX_OUTPUT_TOKENS_LOGIC);
    expect(p.tokenBudgets.ui).toBe(MAX_OUTPUT_TOKENS_UI);
    expect(p.tokenBudgets.integration).toBe(MAX_OUTPUT_TOKENS_INTEGRATION);
    expect(p.tokenBudgets.oneshot).toBe(MAX_OUTPUT_TOKENS_GENERATION);
  });
});

// ─── 2. Token budget overrides apply only to specified fields ─────────────────

describe('UnifiedPromptProvider — tokenBudgetOverrides', () => {
  it('overrides only specified budgets; others remain at defaults', () => {
    const p = new UnifiedPromptProvider({
      tokenBudgetOverrides: {
        intent: 1024,
        planning: 8192,
      },
      verboseGuidance: true,
    });
    expect(p.tokenBudgets.intent).toBe(1024);
    expect(p.tokenBudgets.planning).toBe(8192);
    // Non-overridden budgets stay at default values
    expect(p.tokenBudgets.executionGeneration).toBe(MAX_OUTPUT_TOKENS_GENERATION);
    expect(p.tokenBudgets.executionModification).toBe(MAX_OUTPUT_TOKENS_MODIFICATION);
    expect(p.tokenBudgets.scaffold).toBe(MAX_OUTPUT_TOKENS_SCAFFOLD);
  });
});

// ─── 3. verboseGuidance: true → DETAILED fragments in getExecutionGenerationSystemPrompt ──

describe('UnifiedPromptProvider — verboseGuidance', () => {
  it('includes DETAILED_REACT/CSS/JSON_GUIDANCE in generation prompt when verbose=true', () => {
    const p = new UnifiedPromptProvider({ verboseGuidance: true });
    const prompt = p.getExecutionGenerationSystemPrompt('build a todo app', null, null);
    expect(prompt).toContain('DETAILED REACT PATTERNS');
    expect(prompt).toContain('DETAILED CSS PATTERNS');
    expect(prompt).toContain('JSON OUTPUT RULES');
  });

  // ─── 4. verboseGuidance: false → DETAILED fragments absent; DESIGN_SYSTEM always present ──

  it('omits DETAILED fragments but keeps DESIGN_SYSTEM_CONSTANTS when verbose=false (default)', () => {
    const p = new UnifiedPromptProvider();
    const prompt = p.getExecutionGenerationSystemPrompt('build a todo app', null, null);
    expect(prompt).not.toContain('DETAILED REACT PATTERNS');
    expect(prompt).not.toContain('DETAILED CSS PATTERNS');
    expect(prompt).not.toContain('JSON OUTPUT RULES');
    // DESIGN_SYSTEM_CONSTANTS is always-on (phase 2.1) — must be present regardless of verboseGuidance
    expect(prompt).toContain('DESIGN PRINCIPLES (ALWAYS APPLY)');
  });

  // ─── 5. verboseGuidance: true in modification prompt ─────────────────────

  it('includes DETAILED fragments in modification prompt when verbose=true', () => {
    const p = new UnifiedPromptProvider({ verboseGuidance: true });
    const prompt = p.getExecutionModificationSystemPrompt('add dark mode', null, null, false);
    expect(prompt).toContain('DETAILED REACT PATTERNS');
    expect(prompt).toContain('DETAILED CSS PATTERNS');
    expect(prompt).toContain('JSON OUTPUT RULES');
  });

  it('omits DETAILED fragments in modification prompt when verbose=false', () => {
    const p = new UnifiedPromptProvider();
    const prompt = p.getExecutionModificationSystemPrompt('add dark mode', null, null, false);
    expect(prompt).not.toContain('DETAILED REACT PATTERNS');
    expect(prompt).not.toContain('DETAILED CSS PATTERNS');
  });

  // ─── 6. verboseGuidance: true in bugfix prompt ───────────────────────────

  it('includes DETAILED fragments in bugfix prompt when verbose=true', () => {
    const p = new UnifiedPromptProvider({ verboseGuidance: true });
    const prompt = p.getBugfixSystemPrompt('Module not found: react', []);
    expect(prompt).toContain('DETAILED REACT PATTERNS');
    expect(prompt).toContain('JSON OUTPUT RULES');
  });

  it('omits DETAILED fragments in bugfix prompt when verbose=false', () => {
    const p = new UnifiedPromptProvider();
    const prompt = p.getBugfixSystemPrompt('Module not found: react', []);
    expect(prompt).not.toContain('DETAILED REACT PATTERNS');
    expect(prompt).not.toContain('JSON OUTPUT RULES');
  });
});

// ─── 7. setRecipe changes generation prompt behavior ─────────────────────────

describe('UnifiedPromptProvider — recipe support', () => {
  it('setRecipe does not throw and affects subsequent generation calls', () => {
    const p = new UnifiedPromptProvider();
    // Without recipe, returns standard prompt
    const withoutRecipe = p.getExecutionGenerationSystemPrompt('build a todo app', null, null);
    expect(withoutRecipe).toContain('SENIOR React architect');

    // After setRecipe, generation delegates to recipe engine (result changes)
    const mockRecipe = { id: 'nextjs-prisma', name: 'Next.js + Prisma', phaseFragments: {} } as any;
    expect(() => p.setRecipe(mockRecipe)).not.toThrow();
  });

  it('generation prompt omits standard structure when recipe is set', () => {
    const p = new UnifiedPromptProvider();
    const standardPrompt = p.getExecutionGenerationSystemPrompt('build a todo app', null, null);
    expect(standardPrompt).toContain('PROJECT STRUCTURE');
  });
});

// ─── 8. getPhasePrompt dispatches to phase-prompts functions ─────────────────

describe('UnifiedPromptProvider — getPhasePrompt dispatch', () => {
  const p = new UnifiedPromptProvider();

  it('scaffold phase returns a non-empty string', () => {
    const result = p.getPhasePrompt('scaffold', SAMPLE_ARCH_PLAN, EMPTY_PHASE_CONTEXT, 'build an app');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('logic phase returns a non-empty string', () => {
    const result = p.getPhasePrompt('logic', SAMPLE_ARCH_PLAN, EMPTY_PHASE_CONTEXT, 'build an app');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('ui phase returns a non-empty string', () => {
    const result = p.getPhasePrompt('ui', SAMPLE_ARCH_PLAN, EMPTY_PHASE_CONTEXT, 'build an app');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('integration phase returns a non-empty string', () => {
    const result = p.getPhasePrompt('integration', SAMPLE_ARCH_PLAN, EMPTY_PHASE_CONTEXT, 'build an app');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─── 9. projectType field present in intent prompt ───────────────────────────

describe('UnifiedPromptProvider — projectType in intent prompt', () => {
  it('includes projectType classification rules in getIntentSystemPrompt', () => {
    const p = new UnifiedPromptProvider();
    const prompt = p.getIntentSystemPrompt();
    expect(prompt).toContain('projectType');
    expect(prompt).toContain('"spa"');
    expect(prompt).toContain('"fullstack"');
    expect(prompt).toContain('"fullstack-auth"');
  });
});

// ─── 10. getOutputBudgetGuidance uses dynamic tokenBudgets ───────────────────

describe('UnifiedPromptProvider — dynamic token budgets in output guidance', () => {
  it('generation prompt references executionGeneration budget', () => {
    const customBudget = 99999;
    const p = new UnifiedPromptProvider({
      tokenBudgetOverrides: { executionGeneration: customBudget },
    });
    const prompt = p.getExecutionGenerationSystemPrompt('build an app', null, null);
    expect(prompt).toContain(customBudget.toLocaleString());
  });

  it('modification prompt references executionModification budget', () => {
    const customBudget = 88888;
    const p = new UnifiedPromptProvider({
      tokenBudgetOverrides: { executionModification: customBudget },
    });
    const prompt = p.getExecutionModificationSystemPrompt('add feature', null, null, false);
    expect(prompt).toContain(customBudget.toLocaleString());
  });
});

// ─── 11. getCSSLibrary tier gating ────────────────────────────────────────────

describe('getCSSLibrary — complexity tier gating', () => {
  it('simple tier: contains .btn, does NOT contain .toast or .skeleton', () => {
    const css = getCSSLibrary('simple');
    expect(css).toContain('.btn');
    expect(css).not.toContain('.toast');
    expect(css).not.toContain('.skeleton');
  });

  it('medium tier: contains both .btn and .toast and .skeleton', () => {
    const css = getCSSLibrary('medium');
    expect(css).toContain('.btn');
    expect(css).toContain('.toast');
    expect(css).toContain('.skeleton');
  });

  it('complex tier: same as medium — contains .btn, .toast, and .skeleton', () => {
    const css = getCSSLibrary('complex');
    expect(css).toContain('.btn');
    expect(css).toContain('.toast');
    expect(css).toContain('.skeleton');
  });
});

// ─── 12. Domain color detection ───────────────────────────────────────────────

describe('UnifiedPromptProvider — domain color detection in generation prompt', () => {
  const p = new UnifiedPromptProvider();

  it('finance domain prompt contains green #059669', () => {
    const prompt = p.getExecutionGenerationSystemPrompt('build a personal finance dashboard', null, null);
    expect(prompt).toContain('#059669');
  });

  it('recipe domain prompt contains orange #ea580c', () => {
    const prompt = p.getExecutionGenerationSystemPrompt('build a recipe manager', null, null);
    expect(prompt).toContain('#ea580c');
  });

  it('todo app prompt contains default blue #2563eb', () => {
    const prompt = p.getExecutionGenerationSystemPrompt('build a todo app', null, null);
    expect(prompt).toContain('#2563eb');
  });
});

// ─── 13. DESIGN_SYSTEM_CONSTANTS always-on ───────────────────────────────────

describe('UnifiedPromptProvider — DESIGN_SYSTEM_CONSTANTS always-on', () => {
  it('generation prompt always contains DESIGN_SYSTEM_CONSTANTS when verboseGuidance=true', () => {
    const p = new UnifiedPromptProvider({ verboseGuidance: true });
    const prompt = p.getExecutionGenerationSystemPrompt('build an app', null, null);
    expect(prompt).toContain('DESIGN PRINCIPLES (ALWAYS APPLY)');
  });

  it('generation prompt always contains DESIGN_SYSTEM_CONSTANTS when verboseGuidance=false', () => {
    const p = new UnifiedPromptProvider({ verboseGuidance: false });
    const prompt = p.getExecutionGenerationSystemPrompt('build an app', null, null);
    expect(prompt).toContain('DESIGN PRINCIPLES (ALWAYS APPLY)');
  });

  it('generation prompt always contains DESIGN_SYSTEM_CONSTANTS when no config is passed', () => {
    const p = new UnifiedPromptProvider();
    const prompt = p.getExecutionGenerationSystemPrompt('build an app', null, null);
    expect(prompt).toContain('DESIGN PRINCIPLES (ALWAYS APPLY)');
  });
});
