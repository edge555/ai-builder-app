export interface RuntimeSmokeIssue {
  type:
    | 'missing_file'
    | 'missing_entry_render'
    | 'missing_default_export'
    | 'missing_layout_shell'
    | 'missing_dependency'
    | 'missing_script'
    | 'empty_file'
    | 'placeholder_content'
    | 'no_interaction_surface'
    | 'obvious_runtime_throw'
    | 'unknown_framework';
  message: string;
  file?: string;
}

export interface RuntimeSmokeResult {
  passed: boolean;
  framework: 'vite-react' | 'nextjs-app-router' | 'unknown';
  issues: RuntimeSmokeIssue[];
  interactionSignals: string[];
}

const PLACEHOLDER_PATTERNS = [
  /subsequent phases/i,
  /todo:\s*implement/i,
  /replace this stub/i,
  /implement this file/i,
  /coming soon/i,
];

const JS_TS_EXTENSIONS = /\.(ts|tsx|js|jsx)$/;

function hasDefaultExport(content: string): boolean {
  return /export\s+default\s+/.test(content);
}

function hasObviousRuntimeThrow(content: string): boolean {
  // Strip catch blocks and known error boundary patterns before checking for top-level throws.
  // React error boundaries (getDerivedStateFromError, componentDidCatch) legitimately rethrow.
  const withoutCatchBlocks = content.replace(/catch\s*\([^)]*\)\s*\{[^}]*\}/gs, '');
  return /throw\s+new\s+Error\s*\(/.test(withoutCatchBlocks) || /throw\s+['"`]/.test(withoutCatchBlocks);
}

function collectInteractionSignals(content: string): string[] {
  const signals = new Set<string>();

  if (/<button\b/i.test(content)) signals.add('button');
  if (/<form\b/i.test(content)) signals.add('form');
  if (/<input\b/i.test(content)) signals.add('input');
  if (/onClick\s*=/.test(content)) signals.add('onClick');
  if (/onSubmit\s*=/.test(content)) signals.add('onSubmit');
  if (/onChange\s*=/.test(content)) signals.add('onChange');

  return [...signals];
}

function detectFramework(files: Record<string, string>): RuntimeSmokeResult['framework'] {
  if (files['src/main.tsx'] || files['src/App.tsx'] || files['src/main.jsx'] || files['src/App.jsx']) {
    return 'vite-react';
  }

  if (
    files['app/page.tsx'] ||
    files['app/page.jsx'] ||
    files['app/page.js'] ||
    files['app/layout.tsx'] ||
    files['app/layout.jsx'] ||
    files['app/layout.js']
  ) {
    return 'nextjs-app-router';
  }

  return 'unknown';
}

function addEmptyOrPlaceholderIssue(issues: RuntimeSmokeIssue[], file: string, content: string | undefined): void {
  if (!content) {
    return;
  }

  if (content.trim().length === 0) {
    issues.push({
      type: 'empty_file',
      message: 'Critical file is empty',
      file,
    });
    return;
  }

  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(content))) {
    issues.push({
      type: 'placeholder_content',
      message: 'Critical file still contains placeholder content',
      file,
    });
  }
}

function parsePackageJson(files: Record<string, string>): Record<string, unknown> | null {
  const pkgContent = files['package.json'];
  if (!pkgContent) {
    return null;
  }

  try {
    return JSON.parse(pkgContent) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hasDependency(pkg: Record<string, unknown> | null, dependency: string): boolean {
  if (!pkg) return false;

  const dependencies = typeof pkg.dependencies === 'object' && pkg.dependencies
    ? pkg.dependencies as Record<string, unknown>
    : {};
  const devDependencies = typeof pkg.devDependencies === 'object' && pkg.devDependencies
    ? pkg.devDependencies as Record<string, unknown>
    : {};

  return dependency in dependencies || dependency in devDependencies;
}

function hasScript(pkg: Record<string, unknown> | null, scriptName: string): boolean {
  if (!pkg || typeof pkg.scripts !== 'object' || !pkg.scripts) {
    return false;
  }

  return scriptName in (pkg.scripts as Record<string, unknown>);
}

export function runRuntimeSmokeTest(files: Record<string, string>): RuntimeSmokeResult {
  const framework = detectFramework(files);
  const issues: RuntimeSmokeIssue[] = [];
  const interactionSignals = new Set<string>();
  const pkg = parsePackageJson(files);

  // delivery gate
  //   acceptance -> runtime smoke -> repair -> approve/fail
  // runtime smoke stays heuristic in-request: file/export/script/dependency checks only.
  // Only collect interaction signals from JS/TS files to avoid false signals from CSS/JSON/markdown.
  for (const [path, content] of Object.entries(files)) {
    if (JS_TS_EXTENSIONS.test(path)) {
      collectInteractionSignals(content).forEach((signal) => interactionSignals.add(signal));
    }
  }

  if (!files['package.json']) {
    issues.push({
      type: 'missing_file',
      message: 'Missing package.json',
      file: 'package.json',
    });
  }

  if (framework === 'unknown') {
    // Cannot run framework-specific checks — flag so repair can scaffold the correct structure.
    issues.push({
      type: 'unknown_framework',
      message: 'Could not detect project framework (expected src/main.tsx or app/page.tsx/app/page.jsx/app/page.js). Add the appropriate entry point.',
    });
  }

  if (framework === 'vite-react') {
    const mainPath = files['src/main.tsx'] ? 'src/main.tsx' : 'src/main.jsx';
    const appPath = files['src/App.tsx'] ? 'src/App.tsx' : 'src/App.jsx';
    const main = files[mainPath];
    const app = files[appPath];

    if (!main) {
      issues.push({ type: 'missing_file', message: 'Missing Vite entry file', file: 'src/main.tsx' });
    }
    if (!app) {
      issues.push({ type: 'missing_file', message: 'Missing app component file', file: 'src/App.tsx' });
    }

    addEmptyOrPlaceholderIssue(issues, mainPath, main);
    addEmptyOrPlaceholderIssue(issues, appPath, app);

    if (main && !/createRoot\s*\(/.test(main)) {
      issues.push({
        type: 'missing_entry_render',
        message: 'Entry file does not render the app with createRoot',
        file: mainPath,
      });
    }

    if (main && !/from\s+["']\.\/App(?:\.[^"']+)?["']/.test(main)) {
      issues.push({
        type: 'missing_entry_render',
        message: 'Entry file does not import the app component',
        file: mainPath,
      });
    }

    if (app && !hasDefaultExport(app)) {
      issues.push({
        type: 'missing_default_export',
        message: 'App component is missing a default export',
        file: appPath,
      });
    }

    if ((main && hasObviousRuntimeThrow(main)) || (app && hasObviousRuntimeThrow(app))) {
      issues.push({
        type: 'obvious_runtime_throw',
        message: 'Critical runtime file contains an obvious unconditional throw',
        file: app && hasObviousRuntimeThrow(app) ? appPath : mainPath,
      });
    }

    for (const dependency of ['react', 'react-dom']) {
      if (!hasDependency(pkg, dependency)) {
        issues.push({
          type: 'missing_dependency',
          message: `package.json is missing required dependency "${dependency}"`,
          file: 'package.json',
        });
      }
    }

    for (const script of ['dev', 'build']) {
      if (!hasScript(pkg, script)) {
        issues.push({
          type: 'missing_script',
          message: `package.json is missing required script "${script}"`,
          file: 'package.json',
        });
      }
    }
  }

  if (framework === 'nextjs-app-router') {
    const pagePath = files['app/page.tsx']
      ? 'app/page.tsx'
      : files['app/page.jsx']
        ? 'app/page.jsx'
        : 'app/page.js';
    const layoutPath = files['app/layout.tsx']
      ? 'app/layout.tsx'
      : files['app/layout.jsx']
        ? 'app/layout.jsx'
        : 'app/layout.js';
    const page = files[pagePath];
    const layout = files[layoutPath];

    if (!page) {
      issues.push({ type: 'missing_file', message: 'Missing app router page', file: 'app/page.tsx' });
    }
    if (!layout) {
      issues.push({ type: 'missing_file', message: 'Missing app router layout', file: 'app/layout.tsx' });
    }

    addEmptyOrPlaceholderIssue(issues, pagePath, page);
    addEmptyOrPlaceholderIssue(issues, layoutPath, layout);

    if (page && !hasDefaultExport(page)) {
      issues.push({
        type: 'missing_default_export',
        message: 'App router page is missing a default export',
        file: pagePath,
      });
    }

    if (layout && (!/<html/i.test(layout) || !/<body/i.test(layout))) {
      issues.push({
        type: 'missing_layout_shell',
        message: 'App router layout must include html and body tags',
        file: layoutPath,
      });
    }

    if ((page && hasObviousRuntimeThrow(page)) || (layout && hasObviousRuntimeThrow(layout))) {
      issues.push({
        type: 'obvious_runtime_throw',
        message: 'Critical runtime file contains an obvious unconditional throw',
        file: page && hasObviousRuntimeThrow(page) ? pagePath : layoutPath,
      });
    }

    for (const dependency of ['next', 'react', 'react-dom']) {
      if (!hasDependency(pkg, dependency)) {
        issues.push({
          type: 'missing_dependency',
          message: `package.json is missing required dependency "${dependency}"`,
          file: 'package.json',
        });
      }
    }

    for (const script of ['dev', 'build']) {
      if (!hasScript(pkg, script)) {
        issues.push({
          type: 'missing_script',
          message: `package.json is missing required script "${script}"`,
          file: 'package.json',
        });
      }
    }
  }

  // Advisory only — static/content apps with no buttons or forms are valid.
  // Log the signal for observability but do not block delivery.

  return {
    passed: issues.length === 0,
    framework,
    issues,
    interactionSignals: [...interactionSignals],
  };
}
