/**
 * Checks if the project has the minimum required files for a live preview.
 */
export function hasRequiredFiles(files: Record<string, string>): boolean {
  const paths = Object.keys(files);
  const hasAppOrIndex = paths.some(
    (p) => p.includes('App.tsx') || p.includes('App.jsx') ||
      p.includes('index.tsx') || p.includes('index.jsx') ||
      p.includes('main.tsx') || p.includes('main.jsx') ||
      p.includes('package.json')
  );
  return hasAppOrIndex;
}

/**
 * Detect whether a project is fullstack by checking for server-side files.
 * Returns indicators for Prisma (database) and API routes.
 */
export function detectFullstackProject(files: Record<string, string>): {
  isFullstack: boolean;
  hasPrisma: boolean;
  hasApiRoutes: boolean;
} {
  const paths = Object.keys(files);
  const hasPrisma = paths.some(p => p.includes('schema.prisma') || p.includes('prisma.ts'));
  const hasApiRoutes = paths.some(p => p.includes('/api/') && p.includes('route.ts'));
  return { isFullstack: hasPrisma || hasApiRoutes, hasPrisma, hasApiRoutes };
}
