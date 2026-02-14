export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  prompt: string;
}

export const starterTemplates: StarterTemplate[] = [
  {
    id: 'analytics-dashboard',
    name: 'Analytics Dashboard',
    description: 'A comprehensive dashboard with interactive charts, key metrics cards, and data visualizations',
    category: 'Dashboard',
    icon: '📊',
    prompt: 'Create a modern analytics dashboard with a sidebar navigation, header with user profile, grid of stat cards showing key metrics (users, revenue, growth, conversion rate), interactive charts including a line chart for trends and a bar chart for comparisons, a data table with sorting and filtering, and beautiful UI with glassmorphism effects and smooth animations.',
  },
  {
    id: 'landing-page',
    name: 'Landing Page',
    description: 'A stunning marketing landing page with hero section, features, and call-to-action',
    category: 'Marketing',
    icon: '🚀',
    prompt: 'Build a sleek landing page with a bold hero section featuring a headline, subheadline, and prominent CTA button, a features grid showcasing 3-4 key benefits with icons, a testimonials section with customer quotes and avatars, a pricing section with 3 tier cards, an FAQ accordion, and a footer with links and social icons. Use modern gradients, smooth animations, and responsive design.',
  },
  {
    id: 'task-manager',
    name: 'Task Manager',
    description: 'A productivity app with task lists, categories, and completion tracking',
    category: 'Productivity',
    icon: '✅',
    prompt: 'Create a task management app with a clean sidebar showing task categories (Today, Upcoming, Completed), a main area with task cards that can be checked off, an input to add new tasks with due date picker, filter buttons for All/Active/Completed, task priority indicators (high/medium/low) with color coding, and the ability to edit and delete tasks. Include smooth transitions and a modern, minimal design.',
  },
  {
    id: 'ecommerce-store',
    name: 'E-Commerce Store',
    description: 'An online store with product grid, filters, shopping cart, and checkout flow',
    category: 'E-Commerce',
    icon: '🛒',
    prompt: 'Build an e-commerce product catalog with a responsive product grid showing product cards (image, title, price, rating), a sidebar with category filters and price range slider, a search bar with autocomplete, a shopping cart icon with item count badge, product detail modal with image gallery and add-to-cart button, cart sidebar showing cart items with quantity controls and total price, and a multi-step checkout form. Use attractive product images and modern card designs.',
  },
  {
    id: 'portfolio-website',
    name: 'Portfolio Website',
    description: 'A professional portfolio showcasing projects, skills, and contact information',
    category: 'Marketing',
    icon: '👨‍💼',
    prompt: 'Create a personal portfolio website with a hero section introducing yourself with a photo and tagline, an About section with bio and skills tags, a Projects gallery with project cards featuring screenshots, titles, descriptions, and tech stack badges, a responsive grid layout, smooth scroll animations, a contact section with a styled contact form (name, email, message fields), and a footer with social media links. Use a modern, professional design with subtle gradients.',
  },
  {
    id: 'social-feed',
    name: 'Social Media Feed',
    description: 'A social app with posts, comments, likes, and user interactions',
    category: 'Social',
    icon: '💬',
    prompt: 'Build a social media feed with a post creation card at the top (textarea and post button), a feed of post cards showing user avatar, name, timestamp, post content, attached images, and action buttons for like, comment, and share with counts, a comment section that expands below posts, like animation on click, trending topics sidebar, and user profile cards. Use a clean, card-based design with smooth interactions and modern styling.',
  },
  {
    id: 'weather-app',
    name: 'Weather App',
    description: 'A beautiful weather dashboard with forecasts, conditions, and location search',
    category: 'Utility',
    icon: '🌤️',
    prompt: 'Create a weather application with a location search bar, current weather display showing temperature, conditions, and weather icon, hourly forecast cards showing time and temperature, 7-day forecast with high/low temps and condition icons, additional details like humidity, wind speed, UV index, and feels-like temperature, weather condition background that changes based on current weather (sunny, rainy, cloudy), and smooth animations. Use beautiful gradients and weather-themed colors.',
  },
  {
    id: 'blog-cms',
    name: 'Blog / CMS',
    description: 'A content management system with article editor, categories, and rich formatting',
    category: 'Content',
    icon: '📝',
    prompt: 'Build a blog CMS interface with a sidebar navigation showing All Posts, Published, Drafts, and Categories, a main content area with a grid of blog post cards (featured image, title, excerpt, date, author, category tag), a post editor view with title input, rich text formatting toolbar, category selector, featured image uploader, and publish/save draft buttons, a preview toggle, and a modern, clean design with good typography. Include search and filter functionality.',
  },
];
