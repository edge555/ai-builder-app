import { describe, it, expect, beforeEach } from 'vitest';
import { analyzeImpact } from '../../analysis/impact-analyzer';
import { DependencyGraph } from '../../analysis/dependency-graph';
import { FileIndex } from '../../analysis/file-index';
import type { ProjectState } from '@ai-app-builder/shared';

describe('analyzeImpact', () => {
  let fileIndex: FileIndex;
  let depGraph: DependencyGraph;

  const createProjectState = (files: Record<string, string>): ProjectState => ({
    id: 'test-project',
    name: 'Test Project',
    description: 'A test project',
    files,
    createdAt: new Date(),
    updatedAt: new Date(),
    currentVersionId: 'v1',
  });

  const buildGraph = (files: Record<string, string>) => {
    fileIndex = new FileIndex();
    depGraph = new DependencyGraph();
    fileIndex.index(createProjectState(files));
    depGraph.build(fileIndex);
  };

  beforeEach(() => {
    fileIndex = new FileIndex();
    depGraph = new DependencyGraph();
  });

  it('should produce correct modificationOrder for linear chain', () => {
    buildGraph({
      'src/a.ts': 'export const a = 1;',
      'src/b.ts': `import { a } from './a';\nexport const b = a;`,
      'src/c.ts': `import { b } from './b';\nexport const c = b;`,
    });

    const report = analyzeImpact(['src/a.ts', 'src/b.ts', 'src/c.ts'], depGraph);

    expect(report.modificationOrder.indexOf('src/a.ts')).toBeLessThan(
      report.modificationOrder.indexOf('src/b.ts')
    );
    expect(report.modificationOrder.indexOf('src/b.ts')).toBeLessThan(
      report.modificationOrder.indexOf('src/c.ts')
    );
  });

  it('should group independent files into the same tier', () => {
    buildGraph({
      'src/a.ts': 'export const a = 1;',
      'src/b.ts': 'export const b = 2;',
      'src/c.ts': `import { a } from './a';\nimport { b } from './b';\nexport const c = a + b;`,
    });

    const report = analyzeImpact(['src/a.ts', 'src/b.ts', 'src/c.ts'], depGraph);

    // a and b should be in tier 0 (no dependencies within the set)
    expect(report.tiers[0]).toContain('src/a.ts');
    expect(report.tiers[0]).toContain('src/b.ts');
    // c should be in tier 1
    expect(report.tiers[1]).toContain('src/c.ts');
  });

  it('should identify affectedButUnmodified files', () => {
    buildGraph({
      'src/utils.ts': 'export const helper = () => {};',
      'src/App.tsx': `import { helper } from './utils';\nexport default function App() { return <div />; }`,
      'src/Page.tsx': `import { helper } from './utils';\nexport default function Page() { return <div />; }`,
    });

    // Only modifying utils, App and Page are affected but not modified
    const report = analyzeImpact(['src/utils.ts'], depGraph);

    expect(report.affectedButUnmodified).toContain('src/App.tsx');
    expect(report.affectedButUnmodified).toContain('src/Page.tsx');
    expect(report.affectedButUnmodified).not.toContain('src/utils.ts');
  });

  it('should return empty affectedButUnmodified when all dependents are modified', () => {
    buildGraph({
      'src/utils.ts': 'export const helper = () => {};',
      'src/App.tsx': `import { helper } from './utils';\nexport default function App() { return <div />; }`,
    });

    const report = analyzeImpact(['src/utils.ts', 'src/App.tsx'], depGraph);

    expect(report.affectedButUnmodified).toHaveLength(0);
  });

  it('should estimate small magnitude for <=2 files', () => {
    buildGraph({
      'src/a.ts': 'export const a = 1;',
      'src/b.ts': `import { a } from './a';\nexport const b = a;`,
    });

    const report = analyzeImpact(['src/a.ts', 'src/b.ts'], depGraph);

    expect(report.estimatedMagnitude).toBe('small');
  });

  it('should estimate medium magnitude for 3-5 files', () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 4; i++) {
      files[`src/file${i}.ts`] = `export const x${i} = ${i};`;
    }
    buildGraph(files);

    const report = analyzeImpact(Object.keys(files), depGraph);

    expect(report.estimatedMagnitude).toBe('medium');
  });

  it('should estimate large magnitude for >5 files with spread', () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 6; i++) {
      files[`src/file${i}.ts`] = `export const x${i} = ${i};`;
    }
    // Add 5 more affected-but-unmodified files
    for (let i = 0; i < 5; i++) {
      files[`src/consumer${i}.ts`] = `import { x0 } from './file0';\nexport const c${i} = x0;`;
    }
    buildGraph(files);

    const report = analyzeImpact(
      Array.from({ length: 6 }, (_, i) => `src/file${i}.ts`),
      depGraph,
    );

    expect(report.estimatedMagnitude).toBe('large');
  });

  it('should handle diamond dependency in tiers', () => {
    buildGraph({
      'src/a.ts': 'export const a = 1;',
      'src/b.ts': `import { a } from './a';\nexport const b = a;`,
      'src/c.ts': `import { a } from './a';\nexport const c = a;`,
      'src/d.ts': `import { b } from './b';\nimport { c } from './c';\nexport const d = b + c;`,
    });

    const report = analyzeImpact(
      ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'],
      depGraph,
    );

    // Tier 0: a (no deps)
    expect(report.tiers[0]).toContain('src/a.ts');
    // Tier 1: b and c (both depend only on a)
    expect(report.tiers[1]).toContain('src/b.ts');
    expect(report.tiers[1]).toContain('src/c.ts');
    // Tier 2: d (depends on b and c)
    expect(report.tiers[2]).toContain('src/d.ts');
  });

  it('should handle cycles without crashing', () => {
    buildGraph({
      'src/a.ts': `import { b } from './b';\nexport const a = 1;`,
      'src/b.ts': `import { a } from './a';\nexport const b = 2;`,
    });

    const report = analyzeImpact(['src/a.ts', 'src/b.ts'], depGraph);

    expect(report.modificationOrder).toHaveLength(2);
    expect(report.tiers.length).toBeGreaterThan(0);
  });
});
