import { describe, it, expect } from 'vitest';
import {
  buildProjectMap,
  extractRouteTree,
  extractTypeSummary,
  extractComponentIndex,
} from './project-map';
import type { ProjectState } from '@ai-app-builder/shared';

function makeProjectState(files: Record<string, string>): ProjectState {
  return {
    id: 'test',
    name: 'Test',
    description: 'test project',
    files,
    createdAt: new Date(),
    updatedAt: new Date(),
    currentVersionId: 'v1',
  };
}

describe('extractRouteTree', () => {
  it('parses JSX <Route> elements', () => {
    const state = makeProjectState({
      'src/App.tsx': `
        import { Route, Routes } from 'react-router-dom';
        export default function App() {
          return (
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          );
        }
      `,
    });
    const result = extractRouteTree(state);
    expect(result).toBe('/ → Dashboard, /settings → Settings');
  });

  it('parses createBrowserRouter syntax', () => {
    const state = makeProjectState({
      'src/App.tsx': `
        const router = createBrowserRouter([
          { path: "/", element: <Home /> },
          { path: "/about", element: <About /> },
        ]);
      `,
    });
    const result = extractRouteTree(state);
    expect(result).toBe('/ → Home, /about → About');
  });

  it('handles dynamic routes with :id', () => {
    const state = makeProjectState({
      'src/App.tsx': `
        <Routes>
          <Route path="/tasks/:id" element={<TaskDetail />} />
        </Routes>
      `,
    });
    const result = extractRouteTree(state);
    expect(result).toBe('/tasks/:id → TaskDetail');
  });

  it('returns empty string when no App.tsx exists', () => {
    const state = makeProjectState({
      'src/index.tsx': 'ReactDOM.render(<App />, root);',
    });
    const result = extractRouteTree(state);
    expect(result).toBe('');
  });
});

describe('extractTypeSummary', () => {
  it('extracts interface names and fields', () => {
    const state = makeProjectState({
      'src/types/index.ts': `
        export interface Task {
          id: string;
          title: string;
          status: 'todo' | 'done';
        }

        export interface User {
          id: string;
          name: string;
        }
      `,
    });
    const result = extractTypeSummary(state);
    expect(result).toBe('Task { id, title, status }, User { id, name }');
  });

  it('returns empty string when no types file exists', () => {
    const state = makeProjectState({
      'src/App.tsx': 'export default function App() {}',
    });
    const result = extractTypeSummary(state);
    expect(result).toBe('');
  });
});

describe('extractComponentIndex', () => {
  it('lists components with directory categories', () => {
    const state = makeProjectState({
      'src/components/Dashboard/Dashboard.tsx': 'export default ...',
      'src/layout/Sidebar/Sidebar.tsx': 'export default ...',
      'src/ui/Button/Button.tsx': 'export default ...',
    });
    const result = extractComponentIndex(state);
    expect(result).toContain('Dashboard (components/)');
    expect(result).toContain('Sidebar (layout/)');
    expect(result).toContain('Button (ui/)');
  });
});

describe('buildProjectMap', () => {
  it('builds full project map with all sections', () => {
    const state = makeProjectState({
      'src/App.tsx': `
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      `,
      'src/types/index.ts': `
        export interface Task {
          id: string;
          title: string;
        }
      `,
      'src/components/Dashboard/Dashboard.tsx': 'export default ...',
    });
    const result = buildProjectMap(state);
    expect(result).toContain('=== PROJECT MAP ===');
    expect(result).toContain('Routes: / → Dashboard, /settings → Settings');
    expect(result).toContain('Types: Task { id, title }');
    expect(result).toContain('Components: Dashboard (components/)');
  });

  it('returns empty string when project has no recognizable structure', () => {
    const state = makeProjectState({
      'index.html': '<html></html>',
    });
    const result = buildProjectMap(state);
    expect(result).toBe('');
  });

  it('truncates output when over 1200 chars', () => {
    // Create a project with many routes to exceed the limit
    const routes = Array.from({ length: 50 }, (_, i) =>
      `<Route path="/page-${i}-with-a-very-long-path-name" element={<VeryLongComponentName${i} />} />`
    ).join('\n');
    const state = makeProjectState({
      'src/App.tsx': `<Routes>${routes}</Routes>`,
    });
    const result = buildProjectMap(state);
    expect(result.length).toBeLessThanOrEqual(1200);
    expect(result).toMatch(/\.\.\.$/);
  });
});
