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
interface ContextualSuggestions {
  noAuth: PromptSuggestion[];
  noNav: PromptSuggestion[];
  noDarkMode: PromptSuggestion[];
  noFooter: PromptSuggestion[];
  dashboard: PromptSuggestion[];
  ecommerce: PromptSuggestion[];
  taskApp: PromptSuggestion[];
  forms: PromptSuggestion[];
  improvements: PromptSuggestion[];
  nextSteps: {
    auth: PromptSuggestion[];
    dashboard: PromptSuggestion[];
    ecommerce: PromptSuggestion[];
    taskApp: PromptSuggestion[];
    generic: PromptSuggestion[];
  };
}

const contextualSuggestions: ContextualSuggestions = {
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
  // Next-step suggestions based on what was just built
  nextSteps: {
    auth: [
      { id: 'next-profile', label: 'User Profile', prompt: 'Add a user profile page with avatar upload, name editing, and password change', category: 'feature' as const, icon: '👤' },
      { id: 'next-roles', label: 'User Roles', prompt: 'Add admin and regular user roles with different permissions and a role-based dashboard', category: 'feature' as const, icon: '🛡️' },
    ],
    dashboard: [
      { id: 'next-export', label: 'Export Data', prompt: 'Add CSV and PDF export buttons for the dashboard data and charts', category: 'feature' as const, icon: '📤' },
      { id: 'next-realtime', label: 'Real-time Updates', prompt: 'Add auto-refresh and real-time data updates to the dashboard with a refresh interval selector', category: 'feature' as const, icon: '🔄' },
    ],
    ecommerce: [
      { id: 'next-wishlist', label: 'Wishlist', prompt: 'Add a wishlist feature where users can save products for later', category: 'feature' as const, icon: '❤️' },
      { id: 'next-reviews', label: 'Product Reviews', prompt: 'Add a product review and rating system with star ratings and written reviews', category: 'feature' as const, icon: '⭐' },
    ],
    taskApp: [
      { id: 'next-drag', label: 'Drag & Drop', prompt: 'Add drag-and-drop reordering to the task list with smooth animations', category: 'feature' as const, icon: '↕️' },
      { id: 'next-subtasks', label: 'Subtasks', prompt: 'Add subtask support with nested checklists under each main task', category: 'feature' as const, icon: '📋' },
    ],
    generic: [
      { id: 'next-notifications', label: 'Notifications', prompt: 'Add a toast notification system for success, error, and info messages', category: 'feature' as const, icon: '🔔' },
      { id: 'next-keyboard', label: 'Keyboard Shortcuts', prompt: 'Add keyboard shortcuts for common actions with a help modal showing all shortcuts', category: 'feature' as const, icon: '⌨️' },
    ],
  },
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
      id: 'add-footer',
      label: 'Add Footer',
      prompt: 'Add a footer with links, social icons, and copyright information',
      category: 'ui',
      icon: '📋',
    },
    {
      id: 'improve-performance',
      label: 'Optimize Performance',
      prompt: 'Analyze the app and implement performance optimizations like memoization and lazy loading',
      category: 'improvement',
      icon: '⚡',
    },
    {
      id: 'add-seo',
      label: 'SEO Meta Tags',
      prompt: 'Add SEO meta tags, Open Graph tags, and a sitemap for better search engine visibility',
      category: 'utility',
      icon: '🔍',
    },
  ],
};

/**
 * Analyzes project files to determine which features are missing and app type.
 * Returns context-aware suggestions based on what the project actually is.
 */
export function analyzeProjectForSuggestions(files: Record<string, string>): PromptSuggestion[] {
  const suggestions: PromptSuggestion[] = [];
  // Sample first 10 files and first 2000 chars of each to avoid performance issues with large projects
  const allContent = Object.values(files)
    .slice(0, 10)
    .map(content => content.slice(0, 2000))
    .join('\n')
    .toLowerCase();
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

  // Add next-step suggestions first (complementary features for what was built)
  if (isDashboard) {
    suggestions.push(...contextualSuggestions.nextSteps.dashboard);
  } else if (isEcommerce) {
    suggestions.push(...contextualSuggestions.nextSteps.ecommerce);
  } else if (isTaskApp) {
    suggestions.push(...contextualSuggestions.nextSteps.taskApp);
  }

  // Add type-specific suggestions
  if (isDashboard && suggestions.length < 4) {
    suggestions.push(...contextualSuggestions.dashboard);
  }
  if (isEcommerce && suggestions.length < 4) {
    suggestions.push(...contextualSuggestions.ecommerce);
  }
  if (isTaskApp && suggestions.length < 4) {
    suggestions.push(...contextualSuggestions.taskApp);
  }
  if (hasForms && suggestions.length < 4) {
    suggestions.push(...contextualSuggestions.forms.slice(0, 1));
  }

  // Check for missing common features
  const hasAuth = allContent.includes('login') ||
    allContent.includes('signin') ||
    allContent.includes('authentication') ||
    fileNames.some(f => f.includes('auth') || f.includes('login'));
  if (hasAuth && suggestions.length < 4) {
    suggestions.push(...contextualSuggestions.nextSteps.auth);
  } else if (!hasAuth && suggestions.length < 4) {
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

  // Add generic next-steps if we still have room
  if (suggestions.length < 4) {
    suggestions.push(...contextualSuggestions.nextSteps.generic.slice(0, 4 - suggestions.length));
  }

  // Fill remaining slots with improvement suggestions
  const remaining = 4 - suggestions.length;
  if (remaining > 0) {
    suggestions.push(...contextualSuggestions.improvements.slice(0, remaining));
  }

  // Return exactly 4 suggestions
  return suggestions.slice(0, 4);
}
