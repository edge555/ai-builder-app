import type { FileSystemTree } from '@webcontainer/api';

/**
 * Convert flat Record<string, string> (Sandpack format) to WebContainers nested FileSystemTree.
 * e.g. { 'src/App.tsx': '...' } → { src: { directory: { 'App.tsx': { file: { contents: '...' } } } } }
 */
export function buildWebContainerFileTree(files: Record<string, string>): FileSystemTree {
  const tree: FileSystemTree = {};
  for (const [rawPath, contents] of Object.entries(files)) {
    const path = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;
    const parts = path.split('/');
    let node: FileSystemTree = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!node[part]) {
        node[part] = { directory: {} };
      }
      node = (node[part] as { directory: FileSystemTree }).directory;
    }
    const filename = parts[parts.length - 1];
    node[filename] = { file: { contents } };
  }
  return tree;
}

/**
 * Detect project type from files to determine which dev script to run.
 * Returns the npm script name.
 */
export function detectDevScript(files: Record<string, string>): string {
  const paths = Object.keys(files);
  if (paths.some(p => p.includes('next.config'))) return 'dev'; // Next.js uses `next dev`
  return 'dev'; // Vite and everything else
}

/**
 * Check if the project needs package installation (has a package.json with dependencies).
 */
export function hasPackageJson(files: Record<string, string>): boolean {
  return 'package.json' in files || '/package.json' in files;
}

/**
 * Get package.json contents from files map.
 */
export function getPackageJson(files: Record<string, string>): string | null {
  return files['package.json'] ?? files['/package.json'] ?? null;
}
