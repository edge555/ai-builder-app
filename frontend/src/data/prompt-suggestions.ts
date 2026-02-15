export interface PromptSuggestion {
  id: string;
  label: string;
  prompt: string;
  category: 'ui' | 'feature' | 'styling' | 'data' | 'improvement' | 'utility' | 'logic';
  icon: React.ReactNode;
}

/**
 * Initial suggestions shown when no project exists.
 */
export const initialSuggestions: PromptSuggestion[] = [
  {
    id: 'dashboard',
    label: 'Analytics Dashboard',
    prompt: 'Create a modern analytics dashboard with charts, stats cards, and a sidebar navigation',
    category: 'ui',
    icon: '📊',
  },
  {
    id: 'landing',
    label: 'Landing Page',
    prompt: 'Build a sleek landing page with a hero section, features grid, testimonials, and a call-to-action',
    category: 'ui',
    icon: '🚀',
  },
  {
    id: 'todo',
    label: 'Task Manager',
    prompt: 'Create a task management app with lists, drag-and-drop reordering, and completion tracking',
    category: 'feature',
    icon: '✅',
  },
  {
    id: 'ecommerce',
    label: 'Product Catalog',
    prompt: 'Build an e-commerce product grid with filtering, search, and a shopping cart',
    category: 'feature',
    icon: '🛒',
  },
];

/**
 * Context-aware suggestions based on existing project features.
 */
export const contextualSuggestions: Record<string, PromptSuggestion[]> = {
  // Suggestions when project has no authentication
  noAuth: [
    {
      id: 'add-auth',
      label: 'Add Login',
      prompt: 'Add a login page with email and password fields, form validation, and a register link',
      category: 'feature',
      icon: '🔐',
    },
  ],
  // Suggestions when project has no navigation
  noNav: [
    {
      id: 'add-navbar',
      label: 'Add Navigation',
      prompt: 'Add a responsive navigation bar with logo, menu items, and a mobile hamburger menu',
      category: 'ui',
      icon: '🧭',
    },
  ],
  // Suggestions when project has no dark mode
  noDarkMode: [
    {
      id: 'add-dark-mode',
      label: 'Dark Mode',
      prompt: 'Implement dark mode with a toggle switch and persist the preference to localStorage',
      category: 'styling',
      icon: '🌙',
    },
  ],
  // Suggestions when project has no footer
  noFooter: [
    {
      id: 'add-footer',
      label: 'Add Footer',
      prompt: 'Add a footer with links, social icons, and copyright information',
      category: 'ui',
      icon: '📋',
    },
  ],
  // Dashboard-specific suggestions
  dashboard: [
    {
      id: 'add-charts',
      label: 'Add Charts',
      prompt: 'Add interactive charts with line graphs, bar charts, and pie charts for data visualization',
      category: 'feature',
      icon: '📈',
    },
    {
      id: 'add-filters',
      label: 'Add Filters',
      prompt: 'Add date range filters and category dropdowns to filter the dashboard data',
      category: 'feature',
      icon: '🔍',
    },
  ],
  // E-commerce specific suggestions
  ecommerce: [
    {
      id: 'add-cart',
      label: 'Shopping Cart',
      prompt: 'Add a shopping cart with add/remove items, quantity controls, and total calculation',
      category: 'feature',
      icon: '🛒',
    },
    {
      id: 'add-checkout',
      label: 'Checkout Flow',
      prompt: 'Add a multi-step checkout with shipping address, payment form, and order summary',
      category: 'feature',
      icon: '💳',
    },
  ],
  // Todo/Task app specific suggestions
  taskApp: [
    {
      id: 'add-categories',
      label: 'Add Categories',
      prompt: 'Add task categories with color labels and filtering by category',
      category: 'feature',
      icon: '🏷️',
    },
    {
      id: 'add-due-dates',
      label: 'Due Dates',
      prompt: 'Add due date picker for tasks with overdue highlighting and sorting',
      category: 'feature',
      icon: '📅',
    },
  ],
  // Form/CRUD specific suggestions
  forms: [
    {
      id: 'add-validation',
      label: 'Form Validation',
      prompt: 'Add comprehensive form validation with real-time error messages and success feedback',
      category: 'improvement',
      icon: '✓',
    },
    {
      id: 'add-search',
      label: 'Search & Filter',
      prompt: 'Add a search bar with autocomplete and filters for the list items',
      category: 'feature',
      icon: '🔎',
    },
  ],
  // General improvement suggestions
  improvements: [
    {
      id: 'improve-styling',
      label: 'Polish Design',
      prompt: 'Make the design more modern with better spacing, shadows, and subtle animations',
      category: 'styling',
      icon: '✨',
    },
    {
      id: 'add-animations',
      label: 'Animations',
      prompt: 'Add smooth transitions and micro-interactions to buttons, cards, and page elements',
      category: 'styling',
      icon: '🎬',
    },
    {
      id: 'improve-mobile',
      label: 'Mobile Layout',
      prompt: 'Optimize the layout for mobile devices with better touch targets and responsive design',
      category: 'ui',
      icon: '📱',
    },
    {
      id: 'add-loading',
      label: 'Loading States',
      prompt: 'Add skeleton loaders and loading spinners for better perceived performance',
      category: 'improvement',
      icon: '⏳',
    },
  ],
};

/**
 * Analyzes project files to determine which features are missing and app type.
 * Returns context-aware suggestions based on what the project actually is.
 */
export function analyzeProjectForSuggestions(files: Record<string, string>): PromptSuggestion[] {
  const suggestions: PromptSuggestion[] = [];
  const allContent = Object.values(files).join('\n').toLowerCase();
  const fileNames = Object.keys(files).map(f => f.toLowerCase());

  // Detect app type for context-specific suggestions
  const isDashboard = allContent.includes('dashboard') ||
    allContent.includes('analytics') ||
    allContent.includes('chart') ||
    allContent.includes('stats');

  const isEcommerce = allContent.includes('cart') ||
    allContent.includes('product') ||
    allContent.includes('shop') ||
    allContent.includes('price');

  const isTaskApp = allContent.includes('todo') ||
    allContent.includes('task') ||
    allContent.includes('checklist') ||
    fileNames.some(f => f.includes('todo') || f.includes('task'));

  const hasForms = allContent.includes('<form') ||
    allContent.includes('onsubmit') ||
    allContent.includes('handlesubmit');

  // Add type-specific suggestions first (most relevant)
  if (isDashboard) {
    suggestions.push(...contextualSuggestions.dashboard);
  }
  if (isEcommerce) {
    suggestions.push(...contextualSuggestions.ecommerce);
  }
  if (isTaskApp) {
    suggestions.push(...contextualSuggestions.taskApp);
  }
  if (hasForms) {
    suggestions.push(...contextualSuggestions.forms.slice(0, 1));
  }

  // Check for missing common features
  const hasAuth = allContent.includes('login') ||
    allContent.includes('signin') ||
    allContent.includes('authentication') ||
    fileNames.some(f => f.includes('auth') || f.includes('login'));
  if (!hasAuth && suggestions.length < 4) {
    suggestions.push(...contextualSuggestions.noAuth);
  }

  const hasNav = allContent.includes('navbar') ||
    allContent.includes('navigation') ||
    allContent.includes('<nav') ||
    fileNames.some(f => f.includes('nav') || f.includes('header'));
  if (!hasNav && suggestions.length < 4) {
    suggestions.push(...contextualSuggestions.noNav);
  }

  const hasDarkMode = allContent.includes('dark-mode') ||
    allContent.includes('darkmode') ||
    allContent.includes('theme-toggle') ||
    allContent.includes('prefers-color-scheme');
  if (!hasDarkMode && suggestions.length < 4) {
    suggestions.push(...contextualSuggestions.noDarkMode);
  }

  // Fill remaining slots with improvement suggestions
  const remaining = 4 - suggestions.length;
  if (remaining > 0) {
    suggestions.push(...contextualSuggestions.improvements.slice(0, remaining));
  }

  // Return exactly 4 suggestions
  return suggestions.slice(0, 4);
}
