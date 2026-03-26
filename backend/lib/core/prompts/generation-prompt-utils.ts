/**
 * @module core/prompts/generation-prompt-utils
 * @description Utility functions for prompt assembly — complexity detection,
 * file requirements, design-system detection, and quality bar references.
 * These are provider-agnostic; used by UnifiedPromptProvider for both
 * API and Modal paths.
 *
 * @requires ./shared-prompt-fragments - Reusable prompt text blocks
 */

export type ComplexityLevel = 'simple' | 'medium' | 'complex';

/**
 * Returns true if the user prompt requests design-quality UI.
 * Uses negation detection to avoid false positives ("no design system").
 */
export function shouldIncludeDesignSystem(userPrompt: string): boolean {
  if (!userPrompt) return false;

  const prompt = userPrompt.toLowerCase();

  const NEGATION_RE = /\b(?:no|not|don't|dont|without|avoid|skip)\b/;

  function isNegated(kw: string): boolean {
    const idx = prompt.indexOf(kw);
    if (idx === -1) return false;
    const before = prompt.slice(Math.max(0, idx - 30), idx);
    const words = before.trimEnd().split(/\s+/).slice(-3).join(' ');
    return NEGATION_RE.test(words);
  }

  const phraseKeywords = [
    'beautiful ui', 'beautiful design', 'premium design', 'modern ui', 'modern design',
    'clean ui', 'clean design', 'professional ui', 'professional design', 'professional look',
    'good looking', 'good-looking', 'nice looking', 'nice-looking',
    'visually appealing', 'eye-catching', 'eye catching',
    'pixel-perfect', 'pixel perfect', 'ui/ux', 'ui design', 'ux design',
    'design system', 'tailwind', 'chakra ui', 'material ui', 'mantine', 'shadcn',
    'ant design', 'bootstrap',
    'landing page', 'marketing site', 'marketing page', 'portfolio site', 'portfolio page',
    'hero section', 'call to action',
    'responsive layout', 'dark mode', 'light mode', 'dark theme', 'light theme',
    'card layout', 'card-based',
    'dribbble', 'behance', 'figma',
  ];

  for (const kw of phraseKeywords) {
    const escaped = kw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'i');
    if (re.test(prompt) && !isNegated(kw)) return true;
  }

  const wordKeywords = [
    'sleek', 'polished', 'elegant', 'stylish', 'aesthetic', 'aesthetics',
    'minimalist', 'minimalistic', 'sophisticated', 'refined',
    'animated', 'animation', 'animations', 'glassmorphism', 'gradient', 'gradients',
  ];

  return wordKeywords.some((word) => {
    const re = new RegExp(`\\b${word}\\b`, 'i');
    return re.test(prompt) && !isNegated(word);
  });
}

/**
 * Detect project complexity from the user prompt.
 * Counts distinct feature/scope signals to classify as simple, medium, or complex.
 */
export function detectComplexity(userPrompt: string): ComplexityLevel {
  const prompt = userPrompt.toLowerCase();

  const featureSignals = [
    /\bauth(?:entication|orization)?\b/, /\blogin\b/, /\bsign[\s-]?up\b/, /\bregist(?:er|ration)\b/,
    /\bdashboard\b/, /\badmin\s*panel\b/, /\banalytics\b/,
    /\bchart(?:s|ing)?\b/, /\bgraph(?:s|ing)?\b/, /\bvisualization\b/,
    /\bcrud\b/, /\bcreate.*(?:read|edit|delete)\b/,
    /\bsettings?\s*page\b/, /\bprofile\s*page\b/, /\bpreferences\b/,
    /\brouting\b/, /\bmulti[\s-]?page\b/, /\bpages?\b.*\bpages?\b/,
    /\bsearch(?:ing|able)?\b/, /\bfilter(?:ing|s|able)?\b/, /\bsort(?:ing|able)\b/,
    /\bnotification(?:s)?\b/, /\breal[\s-]?time\b/, /\bwebsocket\b/,
    /\be[\s-]?commerce\b/, /\bshopping\s*cart\b/, /\bcheckout\b/, /\bpayment\b/,
    /\bdrag[\s-]?(?:and[\s-]?)?drop\b/, /\bkanban\b/,
    /\bform(?:s)?\b.*\bvalidation\b/, /\bmulti[\s-]?step\s*form\b/,
    /\bchat\b/, /\bmessaging\b/,
    /\bfile\s*upload\b/, /\bimage\s*upload\b/,
    /\btable(?:s)?\b.*\bpagination\b/, /\bdata\s*table\b/,
    /\bapi\s*integration\b/, /\bfetch.*data\b/,
    /\bdark[\s-]?mode\b.*\blight[\s-]?mode\b/, /\btheme\s*switch\b/,
  ];

  let score = 0;
  for (const signal of featureSignals) {
    if (signal.test(prompt)) score++;
  }

  if (score >= 4) return 'complex';
  if (score >= 2) return 'medium';
  return 'simple';
}

/** Return scaled FILE REQUIREMENTS guidance based on detected complexity. */
export function getFileRequirements(complexity: ComplexityLevel): string {
  switch (complexity) {
    case 'simple':
      return `=== FILE REQUIREMENTS (simple project) ===
Generate a focused set of files: package.json, main.tsx, App.tsx (max 50 lines), index.css, types, 1–2 UI components, 1 layout component, 1–2 feature components, 1 hook if needed.
Keep the project small and focused — do not over-engineer.`;

    case 'complex':
      return `=== FILE REQUIREMENTS (complex project) ===
Generate a comprehensive file set: package.json, main.tsx, App.tsx (routing/layout only, max 50 lines), index.css, types, 4–6 UI components, 2–3 layout components, 4–6 feature components, 2–4 hooks.

STRUCTURAL PATTERNS (complex):
- Use react-router-dom with a SharedLayout component wrapping an <Outlet /> for consistent chrome across pages
- Add a responsive sidebar with a hamburger toggle button for mobile (hidden by default on <768px)
- Create a context provider for the primary data domain (e.g., TasksContext for a task manager)
- Include search and filter controls on all list views
- Add breadcrumb navigation for nested routes
- Split large features into sub-components. Create shared hooks for repeated logic.
- Each page component should manage its own state or use a shared context — don't prop-drill across pages
- Keep page components thin (delegate to feature components) so modifications can target individual features
- Add barrel exports (index.ts) per directory for cleaner imports`;

    default: // medium
      return `=== FILE REQUIREMENTS ===
Generate files appropriate to complexity: package.json, main.tsx, App.tsx (max 50 lines), index.css, types, 2–3 UI components, 1–2 layout components, 2–3 feature components, 1–2 hooks.

STRUCTURAL PATTERNS (medium):
- Create a Layout wrapper component that provides consistent header/footer chrome
- Extract a reusable Modal component for create/edit/confirm flows
- Create a custom hook for the primary data operations (e.g., useTodos for a todo app)
- Add client-side form validation with inline error messages`;
  }
}

import { ProjectOutputSchema } from '../schemas';
import { toSimpleJsonSchema } from '../zod-to-json-schema';

/**
 * JSON Schema for project generation output.
 * Forces the AI to return properly structured JSON.
 */
export const PROJECT_OUTPUT_SCHEMA = toSimpleJsonSchema(ProjectOutputSchema);

/** Return a complexity-appropriate quality bar reference for the prompt. */
export function getQualityBarReference(complexity: ComplexityLevel): string {
  if (complexity === 'simple') {
    return `=== QUALITY BAR REFERENCE (adapt to whatever the user requests — do NOT copy this verbatim) ===
Example: if the user asks "build a counter app", a production-quality result looks like:

FILES:
  package.json                        — dependencies (react, react-dom, lucide-react)
  src/main.tsx                        — ReactDOM.createRoot entry point
  src/App.tsx                         — layout shell, renders Counter
  src/index.css                       — CSS variables, resets, global typography
  src/types/index.ts                  — TypeScript interfaces
  src/components/ui/Button.tsx + .css — reusable button with variants
  src/components/features/Counter.tsx + .css — counter with increment/decrement/reset

Keep it focused — no routing, no context providers, no extra abstractions for a simple app.`;
  }

  if (complexity === 'medium') {
    return `=== QUALITY BAR REFERENCE (adapt to whatever the user requests — do NOT copy this verbatim) ===
Example: if the user asks "build a todo app with search", a production-quality result looks like:

FILES:
  package.json                          — dependencies (react, react-dom, lucide-react, uuid)
  src/main.tsx                          — ReactDOM.createRoot entry point
  src/App.tsx                           — layout wrapper, renders main feature
  src/index.css                         — CSS variables, resets, global typography
  src/types/index.ts                    — Todo, FilterStatus interfaces
  src/hooks/useTodos.ts                 — CRUD operations, search/filter logic
  src/components/layout/Layout.tsx + .css — header + main content area
  src/components/ui/Button.tsx + .css   — variants: primary, secondary, danger
  src/components/ui/Modal.tsx + .css    — overlay, Escape to close
  src/components/features/TodoList.tsx + .css  — list with search bar, empty state
  src/components/features/TodoItem.tsx + .css  — item with status toggle, delete action
  src/components/features/TodoForm.tsx + .css  — create/edit form with validation

Adapt the file names, data shapes, and features to match the user's actual request.`;
  }

  return `=== QUALITY BAR REFERENCE (adapt to whatever the user requests — do NOT copy this verbatim) ===
Example: if the user asks "build a task manager", a production-quality result looks like:

FILES:
  package.json                          — dependencies (react, react-dom, react-router-dom, lucide-react, uuid)
  src/main.tsx                          — ReactDOM.createRoot, BrowserRouter wrapper
  src/App.tsx                           — routes only (<Routes>, <Route>), imports SharedLayout
  src/index.css                         — CSS variables, resets, global typography
  src/types/index.ts                    — Task, Priority, Status interfaces
  src/context/TasksContext.tsx           — tasks state, CRUD actions, provider
  src/hooks/useFilteredTasks.ts         — search + status filter logic
  src/components/layout/SharedLayout.tsx — sidebar + header + <Outlet />
  src/components/layout/Sidebar.tsx     — nav links, hamburger toggle, responsive
  src/components/ui/Button.tsx + .css   — variants: primary, secondary, danger, ghost
  src/components/ui/Modal.tsx + .css    — overlay, Escape to close, focus trap
  src/components/ui/Toast.tsx + .css    — auto-dismiss, success/error variants
  src/components/features/TaskList.tsx + .css      — list with search bar, empty state, skeleton loader
  src/components/features/TaskCard.tsx + .css      — card with status badge, priority indicator, actions
  src/components/features/TaskForm.tsx + .css      — create/edit form with validation
  src/components/features/Dashboard.tsx + .css     — stats cards, task breakdown chart

DATA SHAPE:
  interface Task { id: string; title: string; description: string; status: 'todo'|'in-progress'|'done'; priority: 'low'|'medium'|'high'; createdAt: string; }

This is the quality bar — every generated app should have this level of structure, separation, and completeness. Adapt the file names, data shapes, and features to match the user's actual request.`;
}
