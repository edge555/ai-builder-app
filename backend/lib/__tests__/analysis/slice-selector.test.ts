/**
 * Tests for Slice Selector Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SliceSelector, createSliceSelector, selectSlices } from '../../analysis/slice-selector';
import { FileIndex } from '../../analysis/file-index';
import { DependencyGraph } from '../../analysis/dependency-graph';
import type { ProjectState, IntentClassification } from '@ai-app-builder/shared';

describe('SliceSelector', () => {
  let fileIndex: FileIndex;
  let dependencyGraph: DependencyGraph;
  let sliceSelector: SliceSelector;

  const createProjectState = (files: Record<string, string>): ProjectState => ({
    id: 'test-project',
    name: 'Test Project',
    description: 'A test project',
    files,
    createdAt: new Date(),
    updatedAt: new Date(),
    currentVersionId: 'v1',
  });

  const createIntent = (
    type: IntentClassification['type'],
    affectedAreas: string[] = [],
    description = 'Test intent'
  ): IntentClassification => ({
    type,
    confidence: 0.9,
    affectedAreas,
    description,
  });

  beforeEach(() => {
    fileIndex = new FileIndex();
    dependencyGraph = new DependencyGraph();
    sliceSelector = new SliceSelector();
  });

  describe('selectSlices', () => {
    it('should select primary files from affected areas', () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
        'src/Button.tsx': 'export default function Button() { return <button />; }',
      });

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const intent = createIntent('modify_component', ['src/Button.tsx']);
      const slices = sliceSelector.selectSlices(
        intent,
        projectState,
        fileIndex,
        dependencyGraph
      );

      expect(slices).toHaveLength(1);
      expect(slices[0].filePath).toBe('src/Button.tsx');
      expect(slices[0].relevance).toBe('primary');
    });

    it('should include dependents as context slices', () => {
      const projectState = createProjectState({
        'src/App.tsx': `import { Button } from './Button';
export default function App() { return <Button />; }`,
        'src/Button.tsx': 'export function Button() { return <button />; }',
      });

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const intent = createIntent('modify_component', ['src/Button.tsx']);
      const slices = sliceSelector.selectSlices(
        intent,
        projectState,
        fileIndex,
        dependencyGraph
      );

      const primarySlices = slices.filter(s => s.relevance === 'primary');
      const contextSlices = slices.filter(s => s.relevance === 'context');

      expect(primarySlices).toHaveLength(1);
      expect(primarySlices[0].filePath).toBe('src/Button.tsx');
      expect(contextSlices).toHaveLength(1);
      expect(contextSlices[0].filePath).toBe('src/App.tsx');
    });

    it('should include dependencies as context slices', () => {
      const projectState = createProjectState({
        'src/App.tsx': `import { helper } from './utils';
export default function App() { return <div>{helper()}</div>; }`,
        'src/utils.ts': 'export function helper() { return "hello"; }',
      });

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const intent = createIntent('modify_component', ['src/App.tsx']);
      const slices = sliceSelector.selectSlices(
        intent,
        projectState,
        fileIndex,
        dependencyGraph
      );

      const primarySlices = slices.filter(s => s.relevance === 'primary');
      const contextSlices = slices.filter(s => s.relevance === 'context');

      expect(primarySlices).toHaveLength(1);
      expect(primarySlices[0].filePath).toBe('src/App.tsx');
      expect(contextSlices).toHaveLength(1);
      expect(contextSlices[0].filePath).toBe('src/utils.ts');
    });

    it('should search for files by component name', () => {
      const projectState = createProjectState({
        'src/components/Header.tsx': 'export default function Header() { return <header />; }',
        'src/App.tsx': 'export default function App() { return <div />; }',
      });

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const intent = createIntent('modify_component', ['Header']);
      const slices = sliceSelector.selectSlices(
        intent,
        projectState,
        fileIndex,
        dependencyGraph
      );

      const primarySlices = slices.filter(s => s.relevance === 'primary');
      expect(primarySlices.some(s => s.filePath === 'src/components/Header.tsx')).toBe(true);
    });

    it('should find component files for add_component intent', () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
        'src/components/Button.tsx': 'export default function Button() { return <button />; }',
      });

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const intent = createIntent('add_component', []);
      const slices = sliceSelector.selectSlices(
        intent,
        projectState,
        fileIndex,
        dependencyGraph
      );

      // Should include App.tsx and component files
      const filePaths = slices.map(s => s.filePath);
      expect(filePaths).toContain('src/App.tsx');
    });

    it('should find API route files for add_route intent', () => {
      const projectState = createProjectState({
        'app/api/users/route.ts': 'export async function GET() { return Response.json({}); }',
        'src/App.tsx': 'export default function App() { return <div />; }',
      });

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const intent = createIntent('add_route', []);
      const slices = sliceSelector.selectSlices(
        intent,
        projectState,
        fileIndex,
        dependencyGraph
      );

      const filePaths = slices.map(s => s.filePath);
      expect(filePaths).toContain('app/api/users/route.ts');
    });

    it('should find style files for modify_style intent', () => {
      const projectState = createProjectState({
        'src/styles.css': '.app { color: red; }',
        'src/App.tsx': 'export default function App() { return <div />; }',
      });

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const intent = createIntent('modify_style', []);
      const slices = sliceSelector.selectSlices(
        intent,
        projectState,
        fileIndex,
        dependencyGraph
      );

      const filePaths = slices.map(s => s.filePath);
      expect(filePaths).toContain('src/styles.css');
    });

    it('should find entry point files for other intent', () => {
      const projectState = createProjectState({
        'src/main.tsx': 'import App from "./App"; render(<App />);',
        'src/App.tsx': 'export default function App() { return <div />; }',
        'src/utils.ts': 'export function helper() { return 42; }',
      });

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const intent = createIntent('other', []);
      const slices = sliceSelector.selectSlices(
        intent,
        projectState,
        fileIndex,
        dependencyGraph
      );

      const filePaths = slices.map(s => s.filePath);
      expect(filePaths).toContain('src/App.tsx');
      expect(filePaths).toContain('src/main.tsx');
    });

    it('should respect maxPrimarySlices config', () => {
      const files: Record<string, string> = {};
      for (let i = 0; i < 20; i++) {
        files[`src/Component${i}.tsx`] = `export default function Component${i}() { return <div />; }`;
      }
      const projectState = createProjectState(files);

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const selector = new SliceSelector({ maxPrimarySlices: 5 });
      const intent = createIntent('add_component', Object.keys(files));
      const slices = selector.selectSlices(
        intent,
        projectState,
        fileIndex,
        dependencyGraph
      );

      const primarySlices = slices.filter(s => s.relevance === 'primary');
      expect(primarySlices.length).toBeLessThanOrEqual(5);
    });

    it('should respect maxContextSlices config', () => {
      // Create a file with many dependents
      const files: Record<string, string> = {
        'src/utils.ts': 'export function helper() { return 42; }',
      };
      for (let i = 0; i < 20; i++) {
        files[`src/Component${i}.tsx`] = `import { helper } from './utils';
export default function Component${i}() { return <div>{helper()}</div>; }`;
      }
      const projectState = createProjectState(files);

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const selector = new SliceSelector({ maxContextSlices: 5 });
      const intent = createIntent('modify_component', ['src/utils.ts']);
      const slices = selector.selectSlices(
        intent,
        projectState,
        fileIndex,
        dependencyGraph
      );

      const contextSlices = slices.filter(s => s.relevance === 'context');
      expect(contextSlices.length).toBeLessThanOrEqual(5);
    });

    it('should include file content in slices', () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
      });

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const intent = createIntent('modify_component', ['src/App.tsx']);
      const slices = sliceSelector.selectSlices(
        intent,
        projectState,
        fileIndex,
        dependencyGraph
      );

      expect(slices[0].content).toBe('export default function App() { return <div>Hello</div>; }');
    });

    it('should not include non-existent files', () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
      });

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const intent = createIntent('modify_component', ['src/NonExistent.tsx']);
      const slices = sliceSelector.selectSlices(
        intent,
        projectState,
        fileIndex,
        dependencyGraph
      );

      expect(slices.every(s => s.filePath !== 'src/NonExistent.tsx')).toBe(true);
    });

    it('should handle empty project', () => {
      const projectState = createProjectState({});

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const intent = createIntent('add_component', []);
      const slices = sliceSelector.selectSlices(
        intent,
        projectState,
        fileIndex,
        dependencyGraph
      );

      expect(slices).toHaveLength(0);
    });
  });

  describe('createSliceSelector', () => {
    it('should create a SliceSelector instance', () => {
      const selector = createSliceSelector();
      expect(selector).toBeInstanceOf(SliceSelector);
    });

    it('should accept custom config', () => {
      const selector = createSliceSelector({ maxPrimarySlices: 3 });
      expect(selector).toBeInstanceOf(SliceSelector);
    });
  });

  describe('selectSlices helper function', () => {
    it('should select slices using the helper function', () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
      });

      fileIndex.index(projectState);
      dependencyGraph.build(fileIndex);

      const intent = createIntent('modify_component', ['src/App.tsx']);
      const slices = selectSlices(
        intent,
        projectState,
        fileIndex,
        dependencyGraph
      );

      expect(slices).toHaveLength(1);
      expect(slices[0].filePath).toBe('src/App.tsx');
    });
  });
});
