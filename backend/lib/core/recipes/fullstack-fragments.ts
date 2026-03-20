/**
 * @module core/recipes/fullstack-fragments
 * @description Prompt fragments for full-stack recipe generation (Next.js, Prisma, Supabase Auth).
 * Consumed by the fragment-registry and injected into execution prompts via recipe configs.
 */

/**
 * Next.js App Router API patterns — route handlers, server actions, middleware, directives.
 */
export const NEXTJS_API_PATTERNS = `=== NEXT.JS APP ROUTER PATTERNS (CRITICAL) ===
1. ROUTE HANDLERS (app/api/*/route.ts):
   - Export named functions: GET, POST, PUT, DELETE, PATCH
   - Always type: export async function GET(request: Request) { ... }
   - Return Response or NextResponse: return NextResponse.json({ data }, { status: 200 })
   - Parse body: const body = await request.json()
   - URL params via second arg: export async function GET(req: Request, { params }: { params: { id: string } })

2. SERVER vs CLIENT DIRECTIVES:
   - "use client" at top of file = Client Component (can use useState, useEffect, event handlers)
   - "use server" at top of file or inside a function = Server Action
   - DEFAULT is Server Component (no directive needed) — can directly await DB queries
   - NEVER use useState/useEffect/onClick in Server Components
   - NEVER import server-only modules (prisma, fs, crypto) in Client Components

3. SERVER ACTIONS (lib/actions.ts):
   - Mark with "use server" at top of file
   - Export async functions that mutate data
   - Can be called directly from Client Components via form action or onClick
   - Always revalidate after mutation: revalidatePath('/') or revalidateTag('posts')
   - Example:
     "use server"
     import { prisma } from './prisma'
     import { revalidatePath } from 'next/cache'
     export async function createPost(formData: FormData) {
       await prisma.post.create({ data: { title: formData.get('title') as string } })
       revalidatePath('/posts')
     }

4. MIDDLEWARE (middleware.ts at project root):
   - Runs before every request; use for auth checks, redirects
   - Export function middleware(request: NextRequest) and config with matcher
   - Example: redirect unauthenticated users from /dashboard to /login

5. LAYOUTS & PAGES:
   - app/layout.tsx = root layout (wraps all pages, includes <html>, <body>, providers)
   - app/page.tsx = home page
   - app/[slug]/page.tsx = dynamic routes
   - Layouts are Server Components by default — wrap client-only providers in a separate Client Component`;

/**
 * Database schema guidance — Prisma model patterns, relations, common schemas.
 */
export const DATABASE_SCHEMA_GUIDANCE = `=== DATABASE SCHEMA (PRISMA) ===
1. SCHEMA FILE (prisma/schema.prisma):
   - Always include: generator client { provider = "prisma-client-js" }
   - Always include: datasource db { provider = "postgresql" url = env("DATABASE_URL") }
   - Every model MUST have an id field: id String @id @default(uuid()) or id Int @id @default(autoincrement())
   - Add createdAt DateTime @default(now()) and updatedAt DateTime @updatedAt to every model

2. RELATIONS:
   - One-to-many: Post has many Comments
     model Post { id String @id @default(uuid()); comments Comment[] }
     model Comment { id String @id @default(uuid()); post Post @relation(fields: [postId], references: [id]); postId String }
   - Many-to-many: use implicit relation tables
   - Always add @relation with fields and references on the foreign key side

3. PRISMA CLIENT (lib/prisma.ts):
   - Singleton pattern to avoid multiple instances in dev:
     import { PrismaClient } from '@prisma/client'
     const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
     export const prisma = globalForPrisma.prisma || new PrismaClient()
     if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

4. COMMON PATTERNS:
   - Use select/include to avoid over-fetching
   - Use transactions for multi-step operations: prisma.$transaction([...])
   - Handle unique constraint violations: catch Prisma.PrismaClientKnownRequestError with code 'P2002'
   - Seed data in prisma/seed.ts with realistic sample data`;

/**
 * Authentication scaffolding — Supabase Auth patterns.
 */
export const AUTH_SCAFFOLDING_GUIDANCE = `=== AUTHENTICATION (SUPABASE AUTH) ===
1. CLIENT SETUP:
   - Browser client (lib/supabase/client.ts):
     import { createBrowserClient } from '@supabase/ssr'
     export const createClient = () => createBrowserClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
     )
   - Server client (lib/supabase/server.ts):
     import { createServerClient } from '@supabase/ssr'
     import { cookies } from 'next/headers'
     // Use cookie-based session management

2. AUTH FLOWS:
   - Sign up: supabase.auth.signUp({ email, password })
   - Sign in: supabase.auth.signInWithPassword({ email, password })
   - Sign out: supabase.auth.signOut()
   - Get session: supabase.auth.getSession()
   - Get user: supabase.auth.getUser() (always verify server-side)

3. MIDDLEWARE (middleware.ts):
   - Refresh session on every request
   - Protect routes: redirect to /login if no session on protected paths
   - Use matcher to skip public routes: config = { matcher: ['/dashboard/:path*', '/api/:path*'] }

4. ROW LEVEL SECURITY (RLS):
   - Enable RLS on all tables: ALTER TABLE posts ENABLE ROW LEVEL SECURITY
   - Create policies: users can only read/write their own data
   - Use auth.uid() in policies to match the authenticated user
   - Include SQL migration examples in comments

5. AUTH UI PATTERNS:
   - Login/signup forms with email + password
   - Show loading state during auth operations
   - Redirect after successful auth
   - Display user info in header/nav
   - Protected route layout that checks session`;

/**
 * Full-stack file structure guidance shared across fullstack recipes.
 */
export const FULLSTACK_STRUCTURE = `=== FULL-STACK ARCHITECTURE RULES ===
1. SEPARATION OF CONCERNS:
   - Server code (API routes, server actions, Prisma queries) stays in app/api/ and lib/
   - Client code (React components with interactivity) uses "use client" directive
   - Shared types in types/index.ts — used by both server and client

2. DATA FLOW:
   - Server Components fetch data directly (no API call needed)
   - Client Components call Server Actions for mutations or fetch from API routes
   - Never expose database credentials or server secrets to client code

3. ERROR HANDLING:
   - API routes: return proper HTTP status codes (400, 401, 404, 500) with JSON error messages
   - Server Actions: use try/catch, return { error: string } on failure
   - Client: display error states with retry options

4. ENVIRONMENT VARIABLES:
   - NEXT_PUBLIC_* prefix for client-accessible vars only
   - Server-only vars (DATABASE_URL, secrets) never prefixed with NEXT_PUBLIC_
   - Always provide .env.example with placeholder values`;
