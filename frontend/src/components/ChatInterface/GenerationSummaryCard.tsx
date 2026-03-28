import { FileCode, Package, Route, Layers } from 'lucide-react';
import type { ChangeSummary } from '@ai-app-builder/shared/types';
import './GenerationSummaryCard.css';

interface GenerationSummaryCardProps {
  /** The project files (path → content) */
  files: Record<string, string>;
  /** Optional change summary from backend */
  changeSummary?: ChangeSummary;
}

interface FileStat {
  category: string;
  count: number;
  icon: React.ReactNode;
}

/**
 * Rich summary card shown after generation completes.
 * Displays file count, component list, routes, and dependencies.
 */
export function GenerationSummaryCard({ files, changeSummary }: GenerationSummaryCardProps) {
  const paths = Object.keys(files);
  if (paths.length === 0) return null;

  // Categorize files
  const components = paths.filter(p => p.match(/components?\//i) && p.endsWith('.tsx'));
  const pages = paths.filter(p => p.match(/page\.tsx$|pages?\//i));
  const apiRoutes = paths.filter(p => p.includes('/api/') && p.includes('route.'));

  // Extract dependencies from package.json
  const pkgFile = files['package.json'] || files['/package.json'];
  let dependencies: string[] = [];
  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile);
      dependencies = Object.keys(pkg.dependencies ?? {}).filter(
        d => !['react', 'react-dom'].includes(d)
      );
    } catch { /* ignore */ }
  }

  // Build stats
  const stats: FileStat[] = [
    { category: 'Files', count: paths.length, icon: <FileCode size={14} /> },
  ];
  if (components.length > 0) {
    stats.push({ category: 'Components', count: components.length, icon: <Layers size={14} /> });
  }
  if (pages.length > 0 || apiRoutes.length > 0) {
    stats.push({ category: 'Routes', count: pages.length + apiRoutes.length, icon: <Route size={14} /> });
  }
  if (dependencies.length > 0) {
    stats.push({ category: 'Packages', count: dependencies.length, icon: <Package size={14} /> });
  }

  // Build mini file tree (top-level dirs)
  const dirs = new Map<string, number>();
  for (const p of paths) {
    const clean = p.startsWith('/') ? p.slice(1) : p;
    const parts = clean.split('/');
    const dir = parts.length > 1 ? parts[0] + '/' : '(root)';
    dirs.set(dir, (dirs.get(dir) ?? 0) + 1);
  }

  return (
    <div className="gen-summary-card">
      <div className="gen-summary-header">
        <span className="gen-summary-title">Project Generated</span>
        {changeSummary && (
          <span className="gen-summary-badge">
            +{changeSummary.linesAdded} lines
          </span>
        )}
      </div>

      <div className="gen-summary-stats">
        {stats.map(s => (
          <div key={s.category} className="gen-summary-stat">
            {s.icon}
            <span className="gen-summary-stat-value">{s.count}</span>
            <span className="gen-summary-stat-label">{s.category}</span>
          </div>
        ))}
      </div>

      {/* Mini file tree */}
      <div className="gen-summary-tree">
        {Array.from(dirs.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([dir, count]) => (
            <div key={dir} className="gen-summary-tree-item">
              <span className="gen-summary-tree-dir">{dir}</span>
              <span className="gen-summary-tree-count">{count} file{count > 1 ? 's' : ''}</span>
            </div>
          ))}
      </div>

      {/* Dependencies */}
      {dependencies.length > 0 && (
        <div className="gen-summary-deps">
          {dependencies.slice(0, 8).map(d => (
            <span key={d} className="gen-summary-dep-tag">{d}</span>
          ))}
          {dependencies.length > 8 && (
            <span className="gen-summary-dep-more">+{dependencies.length - 8} more</span>
          )}
        </div>
      )}
    </div>
  );
}
