/**
 * Tests for ArchitecturePlanSchema and related sub-schemas.
 *
 * Covers:
 * - Valid plan objects parse correctly
 * - Invalid plans (missing fields, wrong layer values) fail with clear errors
 * - Edge cases: empty files array, no stateShape, no cssVariables
 * - Sub-schema validation (TypeContractSchema, CSSVariableSchema, PlannedFileSchema)
 */

import { describe, it, expect } from 'vitest';
import {
  ArchitecturePlanSchema,
  PlannedFileSchema,
  TypeContractSchema,
  CSSVariableSchema,
  StateShapeSchema,
  PhaseLayerEnum,
} from '../schemas';

// ─── Fixture Factories ──────────────────────────────────────────────────────

function validPlannedFile(overrides = {}) {
  return {
    path: 'src/types/index.ts',
    purpose: 'Shared TypeScript interfaces',
    layer: 'scaffold' as const,
    exports: ['Todo', 'User'],
    imports: [],
    ...overrides,
  };
}

function validTypeContract(overrides = {}) {
  return {
    name: 'Todo',
    definition: 'interface Todo { id: string; title: string; done: boolean; }',
    ...overrides,
  };
}

function validCSSVariable(overrides = {}) {
  return {
    name: '--color-primary',
    value: '#6366f1',
    purpose: 'Primary brand color',
    ...overrides,
  };
}

function validArchitecturePlan(overrides = {}) {
  return {
    files: [
      validPlannedFile(),
      validPlannedFile({ path: 'src/hooks/useTodos.ts', purpose: 'Todo CRUD hook', layer: 'logic', exports: ['useTodos'], imports: ['src/types/index.ts'] }),
      validPlannedFile({ path: 'src/components/TodoList.tsx', purpose: 'Todo list component', layer: 'ui', exports: ['TodoList'], imports: ['src/hooks/useTodos.ts'] }),
      validPlannedFile({ path: 'src/App.tsx', purpose: 'Main app with routing', layer: 'integration', exports: ['default'], imports: ['src/components/TodoList.tsx'] }),
    ],
    components: ['TodoList', 'TodoItem', 'AddTodoForm'],
    dependencies: ['react', 'react-dom', 'lucide-react'],
    routing: ['/', '/todos'],
    typeContracts: [validTypeContract()],
    cssVariables: [validCSSVariable()],
    stateShape: {
      contexts: [
        { name: 'TodoContext', stateFields: ['todos: Todo[]', 'loading: boolean'], actions: ['addTodo', 'deleteTodo', 'toggleTodo'] },
      ],
      hooks: [
        { name: 'useTodos', signature: '() => { todos: Todo[]; addTodo: (t: Todo) => void }', purpose: 'Todo CRUD operations' },
      ],
    },
    ...overrides,
  };
}

// ─── PhaseLayerEnum ─────────────────────────────────────────────────────────

describe('PhaseLayerEnum', () => {
  it('accepts all valid layer values', () => {
    expect(PhaseLayerEnum.parse('scaffold')).toBe('scaffold');
    expect(PhaseLayerEnum.parse('logic')).toBe('logic');
    expect(PhaseLayerEnum.parse('ui')).toBe('ui');
    expect(PhaseLayerEnum.parse('integration')).toBe('integration');
  });

  it('rejects invalid layer values', () => {
    expect(() => PhaseLayerEnum.parse('core')).toThrow();
    expect(() => PhaseLayerEnum.parse('testing')).toThrow();
    expect(() => PhaseLayerEnum.parse('')).toThrow();
  });
});

// ─── TypeContractSchema ─────────────────────────────────────────────────────

describe('TypeContractSchema', () => {
  it('parses a valid type contract', () => {
    const result = TypeContractSchema.parse(validTypeContract());
    expect(result.name).toBe('Todo');
    expect(result.definition).toContain('interface Todo');
  });

  it('rejects empty name', () => {
    expect(() => TypeContractSchema.parse(validTypeContract({ name: '' }))).toThrow();
  });

  it('rejects empty definition', () => {
    expect(() => TypeContractSchema.parse(validTypeContract({ definition: '' }))).toThrow();
  });

  it('rejects missing name', () => {
    const { name: _, ...noName } = validTypeContract();
    expect(() => TypeContractSchema.parse(noName)).toThrow();
  });
});

// ─── CSSVariableSchema ──────────────────────────────────────────────────────

describe('CSSVariableSchema', () => {
  it('parses a valid CSS variable', () => {
    const result = CSSVariableSchema.parse(validCSSVariable());
    expect(result.name).toBe('--color-primary');
    expect(result.value).toBe('#6366f1');
    expect(result.purpose).toBe('Primary brand color');
  });

  it('rejects empty name', () => {
    expect(() => CSSVariableSchema.parse(validCSSVariable({ name: '' }))).toThrow();
  });

  it('rejects empty value', () => {
    expect(() => CSSVariableSchema.parse(validCSSVariable({ value: '' }))).toThrow();
  });

  it('rejects empty purpose', () => {
    expect(() => CSSVariableSchema.parse(validCSSVariable({ purpose: '' }))).toThrow();
  });
});

// ─── PlannedFileSchema ──────────────────────────────────────────────────────

describe('PlannedFileSchema', () => {
  it('parses a valid planned file', () => {
    const result = PlannedFileSchema.parse(validPlannedFile());
    expect(result.path).toBe('src/types/index.ts');
    expect(result.layer).toBe('scaffold');
    expect(result.exports).toEqual(['Todo', 'User']);
    expect(result.imports).toEqual([]);
  });

  it('accepts all valid layer values', () => {
    for (const layer of ['scaffold', 'logic', 'ui', 'integration'] as const) {
      const result = PlannedFileSchema.parse(validPlannedFile({ layer }));
      expect(result.layer).toBe(layer);
    }
  });

  it('rejects invalid layer value', () => {
    expect(() =>
      PlannedFileSchema.parse(validPlannedFile({ layer: 'backend' }))
    ).toThrow();
  });

  it('rejects invalid path characters', () => {
    expect(() =>
      PlannedFileSchema.parse(validPlannedFile({ path: 'src/<script>.ts' }))
    ).toThrow();
  });

  it('rejects empty path', () => {
    expect(() =>
      PlannedFileSchema.parse(validPlannedFile({ path: '' }))
    ).toThrow();
  });

  it('rejects empty purpose', () => {
    expect(() =>
      PlannedFileSchema.parse(validPlannedFile({ purpose: '' }))
    ).toThrow();
  });

  it('allows empty exports array', () => {
    const result = PlannedFileSchema.parse(validPlannedFile({ exports: [] }));
    expect(result.exports).toEqual([]);
  });

  it('allows empty imports array', () => {
    const result = PlannedFileSchema.parse(validPlannedFile({ imports: [] }));
    expect(result.imports).toEqual([]);
  });
});

// ─── StateShapeSchema ───────────────────────────────────────────────────────

describe('StateShapeSchema', () => {
  it('parses a full state shape with contexts and hooks', () => {
    const result = StateShapeSchema.parse({
      contexts: [
        { name: 'TodoContext', stateFields: ['todos: Todo[]'], actions: ['addTodo'] },
      ],
      hooks: [
        { name: 'useTodos', signature: '() => Todo[]', purpose: 'Get all todos' },
      ],
    });
    expect(result.contexts).toHaveLength(1);
    expect(result.hooks).toHaveLength(1);
  });

  it('accepts empty object (both optional)', () => {
    const result = StateShapeSchema.parse({});
    expect(result.contexts).toBeUndefined();
    expect(result.hooks).toBeUndefined();
  });

  it('accepts contexts without hooks', () => {
    const result = StateShapeSchema.parse({
      contexts: [{ name: 'AppContext', stateFields: ['theme: string'], actions: ['setTheme'] }],
    });
    expect(result.contexts).toHaveLength(1);
    expect(result.hooks).toBeUndefined();
  });

  it('accepts hooks without contexts', () => {
    const result = StateShapeSchema.parse({
      hooks: [{ name: 'useTheme', signature: '() => string', purpose: 'Get current theme' }],
    });
    expect(result.contexts).toBeUndefined();
    expect(result.hooks).toHaveLength(1);
  });

  it('rejects hook with empty name', () => {
    expect(() =>
      StateShapeSchema.parse({
        hooks: [{ name: '', signature: '() => void', purpose: 'noop' }],
      })
    ).toThrow();
  });

  it('rejects hook with empty signature', () => {
    expect(() =>
      StateShapeSchema.parse({
        hooks: [{ name: 'useFoo', signature: '', purpose: 'noop' }],
      })
    ).toThrow();
  });

  it('rejects context with empty name', () => {
    expect(() =>
      StateShapeSchema.parse({
        contexts: [{ name: '', stateFields: [], actions: [] }],
      })
    ).toThrow();
  });
});

// ─── ArchitecturePlanSchema ─────────────────────────────────────────────────

describe('ArchitecturePlanSchema', () => {
  it('parses a valid full architecture plan', () => {
    const plan = validArchitecturePlan();
    const result = ArchitecturePlanSchema.parse(plan);

    expect(result.files).toHaveLength(4);
    expect(result.components).toEqual(['TodoList', 'TodoItem', 'AddTodoForm']);
    expect(result.dependencies).toContain('react');
    expect(result.routing).toEqual(['/', '/todos']);
    expect(result.typeContracts).toHaveLength(1);
    expect(result.cssVariables).toHaveLength(1);
    expect(result.stateShape).toBeDefined();
    expect(result.stateShape?.contexts).toHaveLength(1);
    expect(result.stateShape?.hooks).toHaveLength(1);
  });

  it('parses a minimal plan (no stateShape)', () => {
    const plan = validArchitecturePlan({ stateShape: undefined });
    const result = ArchitecturePlanSchema.parse(plan);

    expect(result.stateShape).toBeUndefined();
    expect(result.files).toHaveLength(4);
  });

  it('parses a plan with empty cssVariables', () => {
    const plan = validArchitecturePlan({ cssVariables: [] });
    const result = ArchitecturePlanSchema.parse(plan);

    expect(result.cssVariables).toEqual([]);
  });

  it('parses a plan with empty typeContracts', () => {
    const plan = validArchitecturePlan({ typeContracts: [] });
    const result = ArchitecturePlanSchema.parse(plan);

    expect(result.typeContracts).toEqual([]);
  });

  it('parses a plan with empty components, dependencies, and routing', () => {
    const plan = validArchitecturePlan({
      components: [],
      dependencies: [],
      routing: [],
    });
    const result = ArchitecturePlanSchema.parse(plan);

    expect(result.components).toEqual([]);
    expect(result.dependencies).toEqual([]);
    expect(result.routing).toEqual([]);
  });

  it('rejects a plan with empty files array', () => {
    expect(() =>
      ArchitecturePlanSchema.parse(validArchitecturePlan({ files: [] }))
    ).toThrow();
  });

  it('rejects a plan with missing files field', () => {
    const { files: _, ...noFiles } = validArchitecturePlan();
    expect(() => ArchitecturePlanSchema.parse(noFiles)).toThrow();
  });

  it('rejects a plan with missing typeContracts field', () => {
    const { typeContracts: _, ...noContracts } = validArchitecturePlan();
    expect(() => ArchitecturePlanSchema.parse(noContracts)).toThrow();
  });

  it('rejects a plan with missing cssVariables field', () => {
    const { cssVariables: _, ...noVars } = validArchitecturePlan();
    expect(() => ArchitecturePlanSchema.parse(noVars)).toThrow();
  });

  it('rejects a plan with missing components field', () => {
    const { components: _, ...noComp } = validArchitecturePlan();
    expect(() => ArchitecturePlanSchema.parse(noComp)).toThrow();
  });

  it('rejects a plan with missing dependencies field', () => {
    const { dependencies: _, ...noDeps } = validArchitecturePlan();
    expect(() => ArchitecturePlanSchema.parse(noDeps)).toThrow();
  });

  it('rejects a plan with missing routing field', () => {
    const { routing: _, ...noRouting } = validArchitecturePlan();
    expect(() => ArchitecturePlanSchema.parse(noRouting)).toThrow();
  });

  it('rejects a plan with invalid layer in files', () => {
    const plan = validArchitecturePlan({
      files: [validPlannedFile({ layer: 'backend' })],
    });
    expect(() => ArchitecturePlanSchema.parse(plan)).toThrow();
  });

  it('infers correct types from parsed plan', () => {
    const result = ArchitecturePlanSchema.parse(validArchitecturePlan());

    // TypeScript type inference check — these access patterns should compile
    const firstFile = result.files[0];
    expect(typeof firstFile.path).toBe('string');
    expect(typeof firstFile.purpose).toBe('string');
    expect(typeof firstFile.layer).toBe('string');
    expect(Array.isArray(firstFile.exports)).toBe(true);
    expect(Array.isArray(firstFile.imports)).toBe(true);

    const firstContract = result.typeContracts[0];
    expect(typeof firstContract.name).toBe('string');
    expect(typeof firstContract.definition).toBe('string');
  });

  it('correctly preserves all file layers after parsing', () => {
    const plan = validArchitecturePlan();
    const result = ArchitecturePlanSchema.parse(plan);

    const layers = result.files.map(f => f.layer);
    expect(layers).toEqual(['scaffold', 'logic', 'ui', 'integration']);
  });

  it('provides clear error message for wrong layer value', () => {
    const plan = validArchitecturePlan({
      files: [validPlannedFile({ layer: 'middleware' })],
    });

    const parseResult = ArchitecturePlanSchema.safeParse(plan);
    expect(parseResult.success).toBe(false);

    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues.map(i => i.message).join(', ');
      expect(errorMessage).toBeTruthy();
    }
  });
});
