export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  prompt: string;
  /** Tags for filtering */
  tags?: string[];
}

export const starterTemplates: StarterTemplate[] = [
  // ── Dashboard ──
  {
    id: 'analytics-dashboard',
    name: 'Analytics Dashboard',
    description: 'Interactive charts, key metrics cards, and data visualizations',
    category: 'Dashboard',
    icon: '📊',
    tags: ['charts', 'data', 'metrics'],
    prompt: 'Create a modern analytics dashboard with a sidebar navigation, header with user profile, grid of stat cards showing key metrics (users, revenue, growth, conversion rate), interactive charts including a line chart for trends and a bar chart for comparisons, a data table with sorting and filtering, and beautiful UI with smooth animations.',
  },
  {
    id: 'admin-panel',
    name: 'Admin Panel',
    description: 'User management, settings, and system overview dashboard',
    category: 'Dashboard',
    icon: '⚙️',
    tags: ['admin', 'users', 'settings'],
    prompt: 'Build an admin panel with a collapsible sidebar (Dashboard, Users, Settings, Logs), a top bar with search and notifications, a user management table with edit/delete/role actions, a system health overview with status indicators, and a settings page with form sections. Use a clean, professional design.',
  },
  {
    id: 'project-tracker',
    name: 'Project Tracker',
    description: 'Kanban board with drag indicators, team members, and deadlines',
    category: 'Dashboard',
    icon: '📋',
    tags: ['kanban', 'projects', 'teams'],
    prompt: 'Create a project management dashboard with a Kanban board showing columns (Backlog, In Progress, Review, Done), task cards with title, assignee avatar, priority badge, and due date. Include a project list sidebar, team member avatars, and progress bars. Use modern card design with subtle shadows.',
  },

  // ── E-Commerce ──
  {
    id: 'ecommerce-store',
    name: 'Product Catalog',
    description: 'Product grid, filters, shopping cart, and checkout flow',
    category: 'E-Commerce',
    icon: '🛒',
    tags: ['products', 'cart', 'shopping'],
    prompt: 'Build an e-commerce product catalog with a responsive product grid showing product cards (image, title, price, rating), a sidebar with category filters and price range slider, a search bar with autocomplete, a shopping cart icon with item count badge, product detail modal with image gallery and add-to-cart button, cart sidebar showing cart items with quantity controls and total price, and a multi-step checkout form.',
  },
  {
    id: 'marketplace',
    name: 'Marketplace',
    description: 'Multi-vendor marketplace with listings, reviews, and seller profiles',
    category: 'E-Commerce',
    icon: '🏪',
    tags: ['marketplace', 'vendors', 'reviews'],
    prompt: 'Build a marketplace app with a homepage showing featured listings, category navigation, a product listing page with grid/list toggle, seller profile cards with rating, a review system with star ratings, and a listing detail page with image carousel, seller info, and contact button. Include search with filters for price, rating, and category.',
  },
  {
    id: 'restaurant-menu',
    name: 'Restaurant Menu',
    description: 'Digital menu with categories, item details, and order cart',
    category: 'E-Commerce',
    icon: '🍕',
    tags: ['food', 'menu', 'ordering'],
    prompt: 'Create a restaurant ordering app with a menu divided by categories (Appetizers, Mains, Desserts, Drinks), food item cards with photo, description, price, and dietary tags (vegetarian, gluten-free), an add-to-cart button with quantity selector, a floating cart summary, and a checkout page with delivery/pickup toggle and order total.',
  },

  // ── Marketing / Landing ──
  {
    id: 'landing-page',
    name: 'Landing Page',
    description: 'Marketing landing page with hero, features, and call-to-action',
    category: 'Landing Page',
    icon: '🚀',
    tags: ['marketing', 'hero', 'cta'],
    prompt: 'Build a sleek landing page with a bold hero section featuring a headline, subheadline, and prominent CTA button, a features section showcasing 3-4 key benefits with icons, a testimonials section with customer quotes and avatars, a pricing section with 3 tier cards, an FAQ accordion, and a footer with links and social icons. Use modern design, smooth animations, and responsive layout.',
  },
  {
    id: 'saas-landing',
    name: 'SaaS Landing',
    description: 'Software product page with features, pricing tiers, and signup',
    category: 'Landing Page',
    icon: '💎',
    tags: ['saas', 'pricing', 'signup'],
    prompt: 'Create a SaaS product landing page with a hero showing a product screenshot mockup, a logo bar of trusted companies, a features section with alternating image-text layouts, a pricing table with 3 tiers (Free, Pro, Enterprise) with feature comparison, a testimonial carousel, an FAQ section, and a final CTA section. Include a sticky header with navigation and a "Start Free Trial" button.',
  },
  {
    id: 'portfolio-website',
    name: 'Portfolio',
    description: 'Professional portfolio with projects, skills, and contact form',
    category: 'Landing Page',
    icon: '👨‍💼',
    tags: ['portfolio', 'projects', 'personal'],
    prompt: 'Create a personal portfolio website with a hero section introducing yourself with a photo and tagline, an About section with bio and skills tags, a Projects gallery with project cards featuring screenshots, titles, descriptions, and tech stack badges, a responsive grid layout, smooth scroll animations, a contact section with a styled contact form, and a footer with social media links.',
  },

  // ── Productivity ──
  {
    id: 'task-manager',
    name: 'Task Manager',
    description: 'Task lists, categories, priorities, and completion tracking',
    category: 'Productivity',
    icon: '✅',
    tags: ['tasks', 'todo', 'productivity'],
    prompt: 'Create a task management app with a clean sidebar showing task categories (Today, Upcoming, Completed), a main area with task cards that can be checked off, an input to add new tasks with due date picker, filter buttons for All/Active/Completed, task priority indicators (high/medium/low) with color coding, and the ability to edit and delete tasks. Include smooth transitions and a modern, minimal design.',
  },
  {
    id: 'note-taking',
    name: 'Note Taking App',
    description: 'Markdown notes with folders, search, and rich formatting',
    category: 'Productivity',
    icon: '📝',
    tags: ['notes', 'markdown', 'writing'],
    prompt: 'Build a note-taking app with a sidebar showing folders and notes list, a main editor area with markdown support and live preview toggle, a toolbar for formatting (bold, italic, headings, lists, code blocks), search functionality across all notes, note metadata (created date, word count), and the ability to create/rename/delete folders and notes. Use a clean, distraction-free design.',
  },
  {
    id: 'habit-tracker',
    name: 'Habit Tracker',
    description: 'Daily habits with streaks, calendar view, and progress stats',
    category: 'Productivity',
    icon: '🔥',
    tags: ['habits', 'streaks', 'calendar'],
    prompt: 'Create a habit tracking app with a daily checklist of habits, a calendar heatmap showing completion history, streak counters for each habit, a progress dashboard with charts showing weekly/monthly completion rates, the ability to add/edit/archive habits with custom colors and icons, and a motivational quote section. Use warm colors and satisfying check animations.',
  },
  {
    id: 'pomodoro-timer',
    name: 'Pomodoro Timer',
    description: 'Focus timer with sessions, breaks, and productivity stats',
    category: 'Productivity',
    icon: '⏱️',
    tags: ['timer', 'focus', 'pomodoro'],
    prompt: 'Build a Pomodoro timer app with a large circular timer display, start/pause/reset controls, configurable work (25min) and break (5min) durations, a session counter, task list to assign pomodoro sessions to, a daily statistics view showing total focus time and completed sessions, and sound notification when timer ends. Use a calming design with smooth timer animations.',
  },

  // ── Social / Content ──
  {
    id: 'social-feed',
    name: 'Social Feed',
    description: 'Posts, comments, likes, and user interactions',
    category: 'Social',
    icon: '💬',
    tags: ['social', 'posts', 'comments'],
    prompt: 'Build a social media feed with a post creation card at the top, a feed of post cards showing user avatar, name, timestamp, post content, and action buttons for like, comment, and share with counts, a comment section that expands below posts, trending topics sidebar, and user profile cards. Use a clean, card-based design with smooth interactions.',
  },
  {
    id: 'blog-cms',
    name: 'Blog / CMS',
    description: 'Article editor, categories, and rich formatting',
    category: 'Content',
    icon: '📰',
    tags: ['blog', 'articles', 'editor'],
    prompt: 'Build a blog CMS interface with a sidebar navigation showing All Posts, Published, Drafts, and Categories, a main content area with a grid of blog post cards (featured image, title, excerpt, date, author, category tag), a post editor view with title input, rich text formatting toolbar, category selector, and publish/save draft buttons, and a modern, clean design with good typography.',
  },
  {
    id: 'recipe-book',
    name: 'Recipe Book',
    description: 'Recipe collection with ingredients, steps, and meal planning',
    category: 'Content',
    icon: '🍳',
    tags: ['recipes', 'cooking', 'food'],
    prompt: 'Create a recipe book app with a recipe grid showing photo, title, cook time, and difficulty, a detailed recipe view with ingredients list (with checkboxes), step-by-step instructions with photos, serving size adjuster, a search bar with filters for cuisine type, dietary restrictions, and cook time, and a favorites/bookmarks feature. Use appetizing food-themed design with warm colors.',
  },

  // ── Utility ──
  {
    id: 'weather-app',
    name: 'Weather App',
    description: 'Forecasts, conditions, and location search',
    category: 'Utility',
    icon: '🌤️',
    tags: ['weather', 'forecast', 'location'],
    prompt: 'Create a weather application with a location search bar, current weather display showing temperature, conditions, and weather icon, hourly forecast cards, 7-day forecast with high/low temps, additional details like humidity, wind speed, UV index, and weather condition background that changes based on current weather. Use beautiful gradients and weather-themed colors.',
  },
  {
    id: 'calculator',
    name: 'Calculator',
    description: 'Scientific calculator with history and unit conversion',
    category: 'Utility',
    icon: '🔢',
    tags: ['calculator', 'math', 'tools'],
    prompt: 'Build a calculator app with a standard calculator mode and a scientific mode toggle, a history panel showing previous calculations, a unit converter tab (length, weight, temperature), keyboard support for number entry, and a clean display with large, readable numbers. Use a sleek, modern design with satisfying button press animations.',
  },
  // ── Finance ──
  {
    id: 'expense-tracker',
    name: 'Expense Tracker',
    description: 'Budget tracking with categories, charts, and monthly reports',
    category: 'Finance',
    icon: '💰',
    tags: ['finance', 'budget', 'expenses'],
    prompt: 'Build a personal finance tracker with a dashboard showing monthly spending overview, a pie chart for expense categories, a transaction list with date, description, amount, and category, an add expense form with category picker and amount input, a monthly budget comparison bar chart, and category-based spending limits with progress bars. Use green/red for income/expense and clean data visualization.',
  },
  {
    id: 'invoice-generator',
    name: 'Invoice Generator',
    description: 'Create and manage professional invoices with line items',
    category: 'Finance',
    icon: '🧾',
    tags: ['invoices', 'billing', 'business'],
    prompt: 'Create an invoice generator with a form to fill in client details, company info, invoice number, and date, a line items table with description, quantity, rate, and amount columns with add/remove rows, automatic subtotal, tax, and total calculation, a preview mode showing the formatted invoice, and a print-ready layout. Use a professional, clean design.',
  },
];
