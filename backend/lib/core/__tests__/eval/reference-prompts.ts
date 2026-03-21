/**
 * Reference prompts for generation evaluation.
 * Each prompt includes expected characteristics for scoring.
 */

export interface ReferencePrompt {
  id: string;
  prompt: string;
  recipeId: 'react-spa' | 'nextjs-prisma' | 'nextjs-supabase-auth';
  complexity: 'simple' | 'medium' | 'complex';
  /** Minimum number of files expected. */
  minFiles: number;
  /** Maximum reasonable file count. */
  maxFiles: number;
  /** Files that MUST be present (path substrings). */
  requiredFiles: string[];
  /** Strings that should appear somewhere in generated output. */
  requiredPatterns: string[];
  /** Strings that should NOT appear in generated output. */
  forbiddenPatterns: string[];
  /** Description for test output. */
  description: string;
}

export const REFERENCE_PROMPTS: ReferencePrompt[] = [
  // ── Simple SPA ──
  {
    id: 'simple-counter',
    prompt: 'Build a simple counter app with increment and decrement buttons',
    recipeId: 'react-spa',
    complexity: 'simple',
    minFiles: 4,
    maxFiles: 12,
    requiredFiles: ['package.json', 'App.tsx', 'main.tsx', 'index.css'],
    requiredPatterns: ['useState', 'onClick', 'increment', 'decrement'],
    forbiddenPatterns: ['prisma', 'next.config', 'app/api/'],
    description: 'Simple counter — baseline SPA test',
  },

  // ── Medium SPA ──
  {
    id: 'medium-todo',
    prompt: 'Build a todo list app with add, complete, and delete functionality. Include local storage persistence and a filter for all/active/completed.',
    recipeId: 'react-spa',
    complexity: 'medium',
    minFiles: 6,
    maxFiles: 20,
    requiredFiles: ['package.json', 'App.tsx', 'main.tsx', 'index.css'],
    requiredPatterns: ['useState', 'localStorage', 'filter', 'complete', 'delete'],
    forbiddenPatterns: ['prisma', 'next.config'],
    description: 'Medium todo app — state management + persistence',
  },

  // ── Medium SPA: Blog (CRUD inference test) ──
  {
    id: 'medium-blog-crud',
    prompt: 'Create a simple blog app',
    recipeId: 'react-spa',
    complexity: 'medium',
    minFiles: 6,
    maxFiles: 22,
    requiredFiles: ['package.json', 'App.tsx', 'main.tsx', 'index.css'],
    requiredPatterns: [
      'useState',
      'onSubmit',        // add/edit form submission
      'handleDelete',    // or similar delete handler
      'confirm',         // deletion confirmation pattern
    ],
    forbiddenPatterns: ['fetch(', 'prisma', 'next.config'],
    description: 'Blog app — CRUD inference: add/edit/delete should be present without explicit user request',
  },

  // ── Complex SPA ──
  {
    id: 'complex-dashboard',
    prompt: 'Build a personal finance dashboard with expense tracking, category breakdown pie chart, monthly trend line chart, and a transaction history table with search and sort.',
    recipeId: 'react-spa',
    complexity: 'complex',
    minFiles: 10,
    maxFiles: 35,
    requiredFiles: ['package.json', 'App.tsx', 'main.tsx', 'index.css'],
    requiredPatterns: ['useState', 'chart', 'transaction', 'category'],
    forbiddenPatterns: ['prisma', 'next.config'],
    description: 'Complex dashboard — multiple views + data viz',
  },

  // ── Fullstack: Next.js + Prisma ──
  {
    id: 'fullstack-todo-db',
    prompt: 'Build a todo app with a PostgreSQL database, REST API for CRUD operations, and a React frontend.',
    recipeId: 'nextjs-prisma',
    complexity: 'medium',
    minFiles: 8,
    maxFiles: 30,
    requiredFiles: ['package.json', 'schema.prisma', 'route.ts', 'page.tsx'],
    requiredPatterns: ['PrismaClient', '@prisma/client', 'GET', 'POST'],
    forbiddenPatterns: ['supabase'],
    description: 'Fullstack todo — Next.js + Prisma',
  },

  // ── Complex SPA: Project Management ──
  {
    id: 'complex-project-management',
    prompt: 'Build a project management app with a dashboard showing stats, a kanban board for task tracking with columns (todo, in-progress, review, done), and a team members view.',
    recipeId: 'react-spa',
    complexity: 'complex',
    minFiles: 10,
    maxFiles: 35,
    requiredFiles: ['package.json', 'App.tsx', 'main.tsx', 'index.css'],
    requiredPatterns: ['useState', 'kanban', 'dashboard', 'task'],
    forbiddenPatterns: ['prisma', 'next.config'],
    description: 'Complex project management — dashboard + kanban + teams',
  },

  // ── Fullstack: Next.js + Supabase Auth ──
  {
    id: 'fullstack-auth-app',
    prompt: 'Build a notes app with user authentication, where each user can only see their own notes. Include login, signup, and a protected dashboard.',
    recipeId: 'nextjs-supabase-auth',
    complexity: 'complex',
    minFiles: 10,
    maxFiles: 35,
    requiredFiles: ['package.json', 'page.tsx', 'middleware.ts'],
    requiredPatterns: ['supabase', 'login', 'signup', 'auth'],
    forbiddenPatterns: [],
    description: 'Fullstack auth — Next.js + Supabase',
  },
];
