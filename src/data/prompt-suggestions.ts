export interface PromptSuggestion {
  id: string;
  label: string;
  prompt: string;
  category: 'ui' | 'feature' | 'styling' | 'data' | 'improvement';
  icon: string;
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
  {
    id: 'chat',
    label: 'Chat Interface',
    prompt: 'Create a chat application UI with message bubbles, user avatars, and an input form',
    category: 'ui',
    icon: '💬',
  },
  {
    id: 'portfolio',
    label: 'Portfolio Site',
    prompt: 'Build a personal portfolio with a hero section, projects gallery, skills, and contact form',
    category: 'ui',
    icon: '👤',
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
      label: 'Add Dark Mode',
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
  // General improvement suggestions
  improvements: [
    {
      id: 'improve-styling',
      label: 'Enhance Styling',
      prompt: 'Make the design more modern with better spacing, shadows, and subtle animations',
      category: 'styling',
      icon: '✨',
    },
    {
      id: 'add-animations',
      label: 'Add Animations',
      prompt: 'Add smooth transitions and micro-interactions to buttons, cards, and page elements',
      category: 'styling',
      icon: '🎬',
    },
    {
      id: 'improve-mobile',
      label: 'Improve Mobile',
      prompt: 'Optimize the layout for mobile devices with better touch targets and responsive design',
      category: 'ui',
      icon: '📱',
    },
    {
      id: 'add-loading',
      label: 'Add Loading States',
      prompt: 'Add skeleton loaders and loading spinners for better perceived performance',
      category: 'improvement',
      icon: '⏳',
    },
  ],
};

/**
 * Analyzes project files to determine which features are missing.
 */
export function analyzeProjectForSuggestions(files: Record<string, string>): PromptSuggestion[] {
  const suggestions: PromptSuggestion[] = [];
  const allContent = Object.values(files).join('\n').toLowerCase();
  const fileNames = Object.keys(files).map(f => f.toLowerCase());

  // Check for authentication
  const hasAuth = allContent.includes('login') || 
                  allContent.includes('signin') || 
                  allContent.includes('authentication') ||
                  fileNames.some(f => f.includes('auth') || f.includes('login'));
  if (!hasAuth) {
    suggestions.push(...contextualSuggestions.noAuth);
  }

  // Check for navigation
  const hasNav = allContent.includes('navbar') || 
                 allContent.includes('navigation') ||
                 allContent.includes('<nav') ||
                 fileNames.some(f => f.includes('nav'));
  if (!hasNav) {
    suggestions.push(...contextualSuggestions.noNav);
  }

  // Check for dark mode
  const hasDarkMode = allContent.includes('dark-mode') || 
                      allContent.includes('darkmode') ||
                      allContent.includes('theme-toggle') ||
                      allContent.includes('prefers-color-scheme');
  if (!hasDarkMode) {
    suggestions.push(...contextualSuggestions.noDarkMode);
  }

  // Check for footer
  const hasFooter = allContent.includes('<footer') || 
                    allContent.includes('classname="footer') ||
                    fileNames.some(f => f.includes('footer'));
  if (!hasFooter) {
    suggestions.push(...contextualSuggestions.noFooter);
  }

  // Always add some improvement suggestions
  suggestions.push(...contextualSuggestions.improvements.slice(0, 2));

  // Limit to 5 suggestions max
  return suggestions.slice(0, 5);
}
