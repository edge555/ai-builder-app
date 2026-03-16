import type { ProjectState } from '@ai-app-builder/shared';

const MAX_OUTPUT_CHARS = 1200;

/**
 * Builds a concise project map giving the AI structural awareness
 * of routes, types, and components in the project.
 */
export function buildProjectMap(projectState: ProjectState): string {
  const lines: string[] = [];

  const routeTree = extractRouteTree(projectState);
  if (routeTree) lines.push(`Routes: ${routeTree}`);

  const typeSummary = extractTypeSummary(projectState);
  if (typeSummary) lines.push(`Types: ${typeSummary}`);

  const componentIndex = extractComponentIndex(projectState);
  if (componentIndex) lines.push(`Components: ${componentIndex}`);

  if (lines.length === 0) return '';

  let output = `=== PROJECT MAP ===\n${lines.join('\n')}`;
  if (output.length > MAX_OUTPUT_CHARS) {
    output = output.slice(0, MAX_OUTPUT_CHARS - 3) + '...';
  }
  return output;
}

/**
 * Parses JSX <Route> elements and createBrowserRouter syntax from App.tsx.
 * Returns a formatted route string like: / → Dashboard, /settings → Settings
 */
export function extractRouteTree(projectState: ProjectState): string {
  const appContent = findAppFile(projectState);
  if (!appContent) return '';

  const routes: Array<{ path: string; component: string }> = [];

  // Parse JSX <Route path="..." element={<Component ... />} />
  const jsxRouteRegex = /<Route\s+[^>]*path=["']([^"']+)["'][^>]*element=\{<(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = jsxRouteRegex.exec(appContent)) !== null) {
    routes.push({ path: match[1], component: match[2] });
  }

  // Also try element before path: <Route element={<X/>} path="...">
  const jsxRouteAltRegex = /<Route\s+[^>]*element=\{<(\w+)[^}]*\}[^>]*path=["']([^"']+)["']/g;
  while ((match = jsxRouteAltRegex.exec(appContent)) !== null) {
    routes.push({ path: match[2], component: match[1] });
  }

  // Parse createBrowserRouter([{ path: "...", element: <Component /> }])
  const routerObjectRegex = /path:\s*["']([^"']+)["'][^}]*element:\s*<(\w+)/g;
  while ((match = routerObjectRegex.exec(appContent)) !== null) {
    // Avoid duplicates if both syntaxes somehow match
    if (!routes.some(r => r.path === match![1])) {
      routes.push({ path: match[1], component: match[2] });
    }
  }

  if (routes.length === 0) return '';

  return routes.map(r => `${r.path} → ${r.component}`).join(', ');
}

/**
 * Extracts interface/type names and key fields from types files.
 */
export function extractTypeSummary(projectState: ProjectState): string {
  const typesContent = findTypesFile(projectState);
  if (!typesContent) return '';

  const types: string[] = [];
  // Match: interface Name { ... } or type Name = { ... }
  const typeRegex = /(?:interface|type)\s+(\w+)(?:\s*=\s*\{|\s*\{)([\s\S]*?)\}/g;
  let match: RegExpExecArray | null;

  while ((match = typeRegex.exec(typesContent)) !== null) {
    const name = match[1];
    const body = match[2];
    // Extract field names (before the colon)
    const fields = body
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('//') && !line.startsWith('/*'))
      .map(line => {
        const fieldMatch = line.match(/^(\w+)\s*[?:]/) ;
        return fieldMatch ? fieldMatch[1] : null;
      })
      .filter(Boolean);

    if (fields.length > 0) {
      types.push(`${name} { ${fields.join(', ')} }`);
    } else {
      types.push(name);
    }
  }

  if (types.length === 0) return '';
  return types.join(', ');
}

/**
 * Lists components with directory categories (ui/, layout/, features/).
 */
export function extractComponentIndex(projectState: ProjectState): string {
  const components: Array<{ name: string; category: string }> = [];

  for (const filePath of Object.keys(projectState.files)) {
    // Match component-like files (JSX/TSX in src/components or similar)
    const compMatch = filePath.match(
      /(?:src\/)?(?:components|pages|features|ui|layout)\/([\w-]+)\/[\w-]+\.(tsx|jsx)$/
    );
    if (compMatch) {
      const name = compMatch[1];
      // Avoid duplicates
      if (components.some(c => c.name === name)) continue;

      const category = categorizeComponent(filePath);
      components.push({ name, category });
      continue;
    }

    // Also catch top-level component files like src/components/Button.tsx
    const topMatch = filePath.match(
      /(?:src\/)?(?:components|pages|features|ui|layout)\/([\w-]+)\.(tsx|jsx)$/
    );
    if (topMatch) {
      const name = topMatch[1];
      if (components.some(c => c.name === name)) continue;

      const category = categorizeComponent(filePath);
      components.push({ name, category });
    }
  }

  if (components.length === 0) return '';
  return components.map(c => `${c.name} (${c.category})`).join(', ');
}

function findAppFile(projectState: ProjectState): string | undefined {
  // Look for common App file names
  const candidates = [
    'src/App.tsx', 'src/App.jsx', 'src/App.ts', 'src/App.js',
    'App.tsx', 'App.jsx', 'App.ts', 'App.js',
  ];
  for (const candidate of candidates) {
    if (projectState.files[candidate]) {
      return projectState.files[candidate];
    }
  }
  return undefined;
}

function findTypesFile(projectState: ProjectState): string | undefined {
  const candidates = [
    'src/types/index.ts', 'src/types/index.tsx',
    'src/types.ts', 'src/types.tsx',
    'types/index.ts', 'types.ts',
  ];
  for (const candidate of candidates) {
    if (projectState.files[candidate]) {
      return projectState.files[candidate];
    }
  }
  return undefined;
}

function categorizeComponent(filePath: string): string {
  if (/\/(ui|common)\//.test(filePath)) return 'ui/';
  if (/\/(layout|layouts)\//.test(filePath)) return 'layout/';
  if (/\/pages\//.test(filePath)) return 'pages/';
  if (/\/features\//.test(filePath)) return 'features/';
  return 'components/';
}
