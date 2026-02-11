/**
 * Tests for Dependency Graph Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DependencyGraph, buildDependencyGraph } from '../../analysis/dependency-graph';
import { FileIndex } from '../../analysis/file-index';
import type { ProjectState } from '@ai-app-builder/shared';

describe('DependencyGraph', () => {
  let fileIndex: FileIndex;
  let dependencyGraph: DependencyGraph;

  beforeEach(() => {
    fileIndex = new FileIndex();
    dependencyGraph = new DependencyGraph();
  });

  const createProjectState = (files: Record<string, string>): ProjectState => ({
    id: 'test-project',
    name: 'Test Project',
    description: 'A test project',
    files,
    createdAt: new Date(),
    updatedAt: new Date(),
    currentVersionId: 'v1',
  });

  describe('build', () => {
    it('should build graph from file index', () => {
      const projectState = createProjectState({
        'src/App.tsx': `import { Button } from './components/Button';
export default function App() { return <Button />; }`,
        'src/components/Button.tsx': 'export function Button() { return <button />; }',
      });

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      expect(dependencyGraph.hasFile('src/App.tsx')).toBe(true);
      expect(dependencyGraph.hasFile('src/components/Button.tsx')).toBe(true);
    });

    it('should clear previous graph when rebuilding', () => {
      const projectState1 = createProjectState({
        'src/old.ts': 'export const old = 1;',
      });
      const projectState2 = createProjectState({
        'src/new.ts': 'export const newVal = 2;',
      });

      fileIndex.index(projectState1);
      dependencyGraph.build(fileIndex);

      fileIndex.index(projectState2);
      dependencyGraph.build(fileIndex);

      expect(dependencyGraph.hasFile('src/old.ts')).toBe(false);
      expect(dependencyGraph.hasFile('src/new.ts')).toBe(true);
    });
  });

  describe('getDependencies', () => {
    it('should return files that a file imports', () => {
      const projectState = createProjectState({
        'src/App.tsx': `import { helper } from './utils';
export default function App() { return <div>{helper()}</div>; }`,
        'src/utils.ts': 'export function helper() { return "hello"; }',
      });

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const dependencies = dependencyGraph.getDependencies('src/App.tsx');
      expect(dependencies).toContain('src/utils.ts');
    });

    it('should return empty array for files with no imports', () => {
      const projectState = createProjectState({
        'src/utils.ts': 'export function helper() { return 42; }',
      });

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const dependencies = dependencyGraph.getDependencies('src/utils.ts');
      expect(dependencies).toEqual([]);
    });

    it('should return empty array for non-existent files', () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
      });

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const dependencies = dependencyGraph.getDependencies('src/nonexistent.ts');
      expect(dependencies).toEqual([]);
    });
  });


  describe('getDependents', () => {
    it('should return files that import a given file', () => {
      const projectState = createProjectState({
        'src/App.tsx': `import { helper } from './utils';
export default function App() { return <div>{helper()}</div>; }`,
        'src/utils.ts': 'export function helper() { return "hello"; }',
      });

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const dependents = dependencyGraph.getDependents('src/utils.ts');
      expect(dependents).toContain('src/App.tsx');
    });

    it('should return multiple dependents', () => {
      const projectState = createProjectState({
        'src/App.tsx': `import { helper } from './utils';
export default function App() { return <div>{helper()}</div>; }`,
        'src/Other.tsx': `import { helper } from './utils';
export default function Other() { return <span>{helper()}</span>; }`,
        'src/utils.ts': 'export function helper() { return "hello"; }',
      });

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const dependents = dependencyGraph.getDependents('src/utils.ts');
      expect(dependents).toContain('src/App.tsx');
      expect(dependents).toContain('src/Other.tsx');
      expect(dependents).toHaveLength(2);
    });

    it('should return empty array for files with no dependents', () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
      });

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const dependents = dependencyGraph.getDependents('src/App.tsx');
      expect(dependents).toEqual([]);
    });
  });

  describe('getAffectedFiles', () => {
    it('should return the input files themselves', () => {
      const projectState = createProjectState({
        'src/utils.ts': 'export function helper() { return 42; }',
      });

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const affected = dependencyGraph.getAffectedFiles(['src/utils.ts']);
      expect(affected).toContain('src/utils.ts');
    });

    it('should return direct dependents', () => {
      const projectState = createProjectState({
        'src/App.tsx': `import { helper } from './utils';
export default function App() { return <div>{helper()}</div>; }`,
        'src/utils.ts': 'export function helper() { return "hello"; }',
      });

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const affected = dependencyGraph.getAffectedFiles(['src/utils.ts']);
      expect(affected).toContain('src/utils.ts');
      expect(affected).toContain('src/App.tsx');
    });

    it('should return transitive dependents', () => {
      const projectState = createProjectState({
        'src/main.tsx': `import App from './App';
export default function Main() { return <App />; }`,
        'src/App.tsx': `import { helper } from './utils';
export default function App() { return <div>{helper()}</div>; }`,
        'src/utils.ts': 'export function helper() { return "hello"; }',
      });

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const affected = dependencyGraph.getAffectedFiles(['src/utils.ts']);
      expect(affected).toContain('src/utils.ts');
      expect(affected).toContain('src/App.tsx');
      expect(affected).toContain('src/main.tsx');
    });

    it('should handle multiple input files', () => {
      const projectState = createProjectState({
        'src/App.tsx': `import { a } from './a';
import { b } from './b';
export default function App() { return <div>{a()}{b()}</div>; }`,
        'src/a.ts': 'export function a() { return "a"; }',
        'src/b.ts': 'export function b() { return "b"; }',
      });

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const affected = dependencyGraph.getAffectedFiles(['src/a.ts', 'src/b.ts']);
      expect(affected).toContain('src/a.ts');
      expect(affected).toContain('src/b.ts');
      expect(affected).toContain('src/App.tsx');
    });

    it('should handle circular dependencies without infinite loop', () => {
      const projectState = createProjectState({
        'src/a.ts': `import { b } from './b';
export function a() { return b(); }`,
        'src/b.ts': `import { a } from './a';
export function b() { return a(); }`,
      });

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const affected = dependencyGraph.getAffectedFiles(['src/a.ts']);
      expect(affected).toContain('src/a.ts');
      expect(affected).toContain('src/b.ts');
    });
  });

  describe('buildDependencyGraph helper', () => {
    it('should create and build a DependencyGraph', () => {
      const projectState = createProjectState({
        'src/App.tsx': `import { helper } from './utils';
export default function App() { return <div>{helper()}</div>; }`,
        'src/utils.ts': 'export function helper() { return "hello"; }',
      });

      fileIndex.index(projectState);
      const graph = buildDependencyGraph(fileIndex);

      expect(graph.getDependents('src/utils.ts')).toContain('src/App.tsx');
    });
  });

  describe('getAllFiles', () => {
    it('should return all files in the graph', () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
        'src/utils.ts': 'export function helper() { return 42; }',
      });

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const allFiles = dependencyGraph.getAllFiles();
      expect(allFiles).toContain('src/App.tsx');
      expect(allFiles).toContain('src/utils.ts');
      expect(allFiles).toHaveLength(2);
    });
  });
});
