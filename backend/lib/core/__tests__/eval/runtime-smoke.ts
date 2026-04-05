export interface RuntimeSmokeIssue {
  type:
    | 'missing_file'
    | 'missing_entry_render'
    | 'missing_default_export'
    | 'missing_layout_shell'
    | 'no_interaction_surface'
    | 'obvious_runtime_throw';
  message: string;
  file?: string;
}

export interface RuntimeSmokeResult {
  passed: boolean;
  framework: 'vite-react' | 'nextjs-app-router' | 'unknown';
  issues: RuntimeSmokeIssue[];
  interactionSignals: string[];
}

function hasDefaultExport(content: string): boolean {
  return /export\s+default\s+/.test(content);
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
  if (files['src/main.tsx'] || files['src/App.tsx']) {
    return 'vite-react';
  }

  if (files['app/page.tsx'] || files['app/layout.tsx']) {
    return 'nextjs-app-router';
  }

  return 'unknown';
}

export function runRuntimeSmokeTest(files: Record<string, string>): RuntimeSmokeResult {
  const framework = detectFramework(files);
  const issues: RuntimeSmokeIssue[] = [];
  const interactionSignals = new Set<string>();

  const fileEntries = Object.entries(files);
  for (const [path, content] of fileEntries) {
    collectInteractionSignals(content).forEach((signal) => interactionSignals.add(signal));
    if (/throw\s+new\s+Error\s*\(/.test(content)) {
      issues.push({
        type: 'obvious_runtime_throw',
        message: 'Contains an unconditional runtime throw',
        file: path,
      });
    }
  }

  if (framework === 'vite-react') {
    const main = files['src/main.tsx'];
    const app = files['src/App.tsx'];

    if (!main) {
      issues.push({ type: 'missing_file', message: 'Missing Vite entry file', file: 'src/main.tsx' });
    }
    if (!app) {
      issues.push({ type: 'missing_file', message: 'Missing app component file', file: 'src/App.tsx' });
    }

    if (main && !/createRoot\s*\(/.test(main)) {
      issues.push({
        type: 'missing_entry_render',
        message: 'Entry file does not render the app with createRoot',
        file: 'src/main.tsx',
      });
    }

    if (main && !/from\s+["']\.\/App["']/.test(main)) {
      issues.push({
        type: 'missing_entry_render',
        message: 'Entry file does not import the app component',
        file: 'src/main.tsx',
      });
    }

    if (app && !hasDefaultExport(app)) {
      issues.push({
        type: 'missing_default_export',
        message: 'App component is missing a default export',
        file: 'src/App.tsx',
      });
    }
  }

  if (framework === 'nextjs-app-router') {
    const page = files['app/page.tsx'];
    const layout = files['app/layout.tsx'];

    if (!page) {
      issues.push({ type: 'missing_file', message: 'Missing app router page', file: 'app/page.tsx' });
    }
    if (!layout) {
      issues.push({ type: 'missing_file', message: 'Missing app router layout', file: 'app/layout.tsx' });
    }

    if (page && !hasDefaultExport(page)) {
      issues.push({
        type: 'missing_default_export',
        message: 'App router page is missing a default export',
        file: 'app/page.tsx',
      });
    }

    if (layout && (!/<html/i.test(layout) || !/<body/i.test(layout))) {
      issues.push({
        type: 'missing_layout_shell',
        message: 'App router layout must include html and body tags',
        file: 'app/layout.tsx',
      });
    }
  }

  if (interactionSignals.size === 0) {
    issues.push({
      type: 'no_interaction_surface',
      message: 'No obvious interactive UI surface found for smoke testing',
    });
  }

  return {
    passed: issues.length === 0,
    framework,
    issues,
    interactionSignals: [...interactionSignals],
  };
}

