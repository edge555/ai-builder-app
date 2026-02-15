/**
 * Transforms project files to Sandpack-compatible format.
 * Sandpack expects files with leading slashes and without folder prefixes like 'frontend/'.
 */
export function transformFilesForSandpack(
  files: Record<string, string>
): Record<string, string> {
  const sandpackFiles: Record<string, string> = {};

  for (const [path, content] of Object.entries(files)) {
    // Remove 'frontend/' prefix if present (generated projects have frontend/backend structure)
    const cleanPath = path.replace(/^frontend\//, '');

    // Ensure paths start with /
    const sandpackPath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
    sandpackFiles[sandpackPath] = content;
  }

  return sandpackFiles;
}

/**
 * Checks if the project has the minimum required files for React preview.
 */
export function hasRequiredFiles(files: Record<string, string>): boolean {
  const paths = Object.keys(files);
  const hasAppOrIndex = paths.some(
    (p) => p.includes('App.tsx') || p.includes('App.jsx') ||
      p.includes('index.tsx') || p.includes('index.jsx') ||
      p.includes('main.tsx') || p.includes('main.jsx')
  );
  return hasAppOrIndex;
}

/**
 * Default files for an empty preview state.
 */
export const DEFAULT_FILES = {
  '/App.tsx': `export default function App() {
  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui' }}>
      <h1>Welcome to AI App Builder</h1>
      <p>Describe your application in the chat to get started.</p>
    </div>
  );
}`,
  '/index.tsx': `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);`,
};

/**
 * Determines the entry file for Sandpack from available files.
 */
export function getEntryFile(files: Record<string, string>): string {
  const paths = Object.keys(files);

  // Look for common entry points
  const entryPoints = ['/src/main.tsx', '/src/index.tsx', '/main.tsx', '/index.tsx'];
  for (const entry of entryPoints) {
    if (paths.includes(entry)) {
      return entry;
    }
  }

  // Fallback to App.tsx
  const appFile = paths.find(p => p.includes('App.tsx') || p.includes('App.jsx'));
  return appFile || '/App.tsx';
}
