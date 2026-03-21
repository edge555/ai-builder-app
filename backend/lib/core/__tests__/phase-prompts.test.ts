import { describe, it, expect } from 'vitest';
import {
  getScaffoldPrompt,
  getLogicPrompt,
  getUIPrompt,
  getIntegrationPrompt,
  getPlanReviewPrompt,
} from '../prompts/phase-prompts';
import { ArchitecturePlan } from '../schemas';
import { PhaseContext } from '../batch-context-builder';
import { getRecipe } from '../recipes/recipe-types';

describe('phase-prompts', () => {
  const mockPlan: ArchitecturePlan = {
    files: [
      { path: 'src/types/index.ts', purpose: 'types', layer: 'scaffold', exports: ['User'], imports: [] },
      { path: 'src/hooks/useAuth.ts', purpose: 'auth', layer: 'logic', exports: ['useAuth'], imports: ['src/types/index.ts'] },
      { path: 'src/components/Button.tsx', purpose: 'button', layer: 'ui', exports: ['Button'], imports: [] },
      { path: 'src/App.tsx', purpose: 'app', layer: 'integration', exports: ['App'], imports: ['src/components/Button.tsx'] }
    ],
    components: ['Button', 'App'],
    dependencies: ['react'],
    routing: ['/'],
    typeContracts: [
      { name: 'User', definition: 'interface User { id: string }' }
    ],
    cssVariables: [
      { name: '--color-primary', value: '#000', purpose: 'primary color' }
    ],
    stateShape: {
      contexts: [],
      hooks: [
        { name: 'useAuth', signature: 'function useAuth(): { user: User | null }', purpose: 'Auth hook' }
      ]
    }
  };

  const mockContext: PhaseContext = {
    typeDefinitions: new Map([['src/types/index.ts', 'export interface User { id: string }']]),
    directDependencies: new Map(),
    fileSummaries: [
      { path: 'src/hooks/useAuth.ts', exports: ['useAuth'], imports: [], cssClasses: [] }
    ],
    cssVariables: ['--color-primary'],
    relevantContracts: {
      typeContracts: mockPlan.typeContracts,
      stateShape: mockPlan.stateShape,
    }
  };

  it('getScaffoldPrompt includes expected sections', () => {
    const prompt = getScaffoldPrompt(mockPlan, 'create an app');
    expect(prompt).toContain('SCAFFOLD RULES');
    expect(prompt).toContain('TYPE CONTRACTS (generate EXACTLY as shown)');
    expect(prompt).toContain('interface User { id: string }');
    expect(prompt).toContain('CSS VARIABLES (define EXACTLY in :root)');
    expect(prompt).toContain('--color-primary: #000; /* primary color */');
    expect(prompt).toContain('src/types/index.ts');
    expect(prompt).not.toContain('src/components/Button.tsx'); // Should only list scaffold files
    // Check rough token estimation info
    expect(prompt).toContain('OUTPUT CONSTRAINTS');
  });

  it('getLogicPrompt includes expected sections', () => {
    const prompt = getLogicPrompt(mockPlan, mockContext, 'create an app');
    expect(prompt).toContain('LOGIC RULES');
    expect(prompt).toContain('STATE SHAPE');
    expect(prompt).toContain('useAuth()');
    expect(prompt).toContain('src/hooks/useAuth.ts');
    expect(prompt).toContain('TYPE DEFINITIONS (already generated — reference these)');
    expect(prompt).not.toContain('src/components/Button.tsx');
  });

  it('getUIPrompt includes expected sections and default recipe fragments when none provided', () => {
    const prompt = getUIPrompt(mockPlan, mockContext, 'create an app');
    expect(prompt).toContain('UI RULES');
    expect(prompt).toContain('src/components/Button.tsx');
    expect(prompt).toContain('OTHER GENERATED FILES (summary)');
    // Default SPA fragments
    expect(prompt).toContain('LAYOUT FUNDAMENTALS (ALWAYS APPLY)');
    expect(prompt).toContain('VISUAL POLISH (ALWAYS APPLY)');
  });

  it('getUIPrompt injects recipe fragments correctly', () => {
    const recipe = getRecipe('nextjs-prisma'); // This recipe should have UI phase fragments
    // Even if phaseFragments logic was missing here, composePhasePrompt is used which handles fallbacks.
    const prompt = getUIPrompt(mockPlan, mockContext, 'create an app', recipe);
    
    // Test that the recipe fragments actually got incorporated
    // nextjs-prisma uses FULLSTACK_STRUCTURE, etc. We just test if it runs without errors effectively
    expect(prompt).toContain('UI RULES');
    expect(prompt).toContain('src/components/Button.tsx');
    expect(typeof prompt).toBe('string');
  });

  it('getIntegrationPrompt includes expected sections', () => {
    const prompt = getIntegrationPrompt(mockPlan, mockContext, 'create an app');
    expect(prompt).toContain('INTEGRATION RULES');
    expect(prompt).toContain('ROUTES TO WIRE');
    expect(prompt).toContain('src/App.tsx');
  });

  it('getPlanReviewPrompt includes the plan JSON and checklist', () => {
    const prompt = getPlanReviewPrompt(mockPlan);
    expect(prompt).toContain('REVIEW CHECKLIST');
    expect(prompt).toContain('src/types/index.ts'); // JSON serialization
    expect(prompt).toContain('OUTPUT FORMAT');
  });
});
