# Supabase Auth + Cloud Storage

## Context

The app builder works fully locally — AI generation, live preview, code editing, version history, and auto-repair. But everything is stored in IndexedDB (browser-only). Users lose projects on browser data clear and can't access across devices. Supabase infrastructure already exists (schema, edge functions, config) but is unused. This plan wires up auth and cloud persistence for a real multi-user MVP.

**Strategy:** Hybrid storage — Supabase is source of truth for authenticated users; IndexedDB acts as local cache. Anonymous users use IndexedDB only.

---

## Phase 1: Database Schema ✅

- [x] Create migration file `supabase/migrations/20260307_add_auth.sql`
- [x] Add `user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE` to `projects` table
- [x] Add `user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE` to `versions` table
- [x] Add index `idx_projects_user_id` on `projects(user_id)`
- [x] Create `chat_messages` table (id UUID PK, project_id FK, user_id FK, role, content, created_at, change_summary JSONB, diffs JSONB, is_error)
- [x] Add index on `chat_messages(project_id, created_at ASC)`
- [x] Drop all existing "Public can ..." RLS policies on projects and versions
- [x] Create user-scoped RLS policies (`auth.uid() = user_id`) for SELECT/INSERT/UPDATE/DELETE on projects, versions, chat_messages
- [x] Enable RLS on chat_messages

---

## Phase 2: Shared Types ✅

- [x] Create `shared/src/types/auth.ts` with `AuthUser` type (`id, email, displayName?, avatarUrl?`)
- [x] Add `AuthSession` type (`user, accessToken, refreshToken, expiresAt`)
- [x] Export auth types from `shared/src/types/index.ts`

---

## Phase 3: Supabase Client Setup ✅

- [x] Install `@supabase/supabase-js` in `frontend/package.json`
- [x] Create `frontend/src/integrations/supabase/client.ts` — singleton client using `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`
- [x] Configure `persistSession: true`, `autoRefreshToken: true`

---

## Phase 4: Auth Context (Split Pattern) ✅

Follow the pattern in `frontend/src/context/GenerationContext.context.ts`.

- [x] Create `frontend/src/context/AuthContext.context.ts`
  - [x] `AuthStateContext` — user, session, isLoading, isAuthenticated
  - [x] `AuthActionsContext` — signIn, signUp, signInWithProvider, signOut
  - [x] `useAuthState()` and `useAuthActions()` hooks
- [x] Create `frontend/src/context/AuthContext.tsx`
  - [x] `AuthProvider` restores session on mount via `supabase.auth.getSession()`
  - [x] Subscribe to `supabase.auth.onAuthStateChange()` for token refresh / cross-tab logout
  - [x] Stable action callbacks via `useCallback`
- [x] Wrap `<Routes>` in `<AuthProvider>` in `frontend/src/App.tsx`

---

## Phase 5: Auth UI Components ✅

- [x] Create `frontend/src/pages/LoginPage.tsx`
  - [x] Email/password form with sign-in / sign-up tabs
  - [x] Optional social login buttons (Google, GitHub)
  - [x] Redirect to `/` on success
  - [x] Lazy-loaded
- [x] Create `frontend/src/components/AuthGuard/AuthGuard.tsx`
  - [x] Check `useAuthState().isAuthenticated`
  - [x] Redirect to `/login` if not authenticated
  - [x] Show skeleton while loading
- [x] Create `frontend/src/components/UserMenu/UserMenu.tsx`
  - [x] Dropdown in SiteHeader: user email, "Sign Out"
  - [x] Uses `useAuthState()` + `useAuthActions()`
- [x] Modify `frontend/src/components/SiteHeader/SiteHeader.tsx` — render UserMenu or "Sign In" link
- [x] Modify `frontend/src/App.tsx`
  - [x] Add `/login` route with lazy-loaded LoginPage
  - [x] Wrap `/project/*` and `/settings/*` in `<AuthGuard>`

**Updated routing:**
```
/           -> WelcomePage (public, content varies by auth state)
/login      -> LoginPage (public, redirects if logged in)
/project/*  -> AuthGuard -> BuilderPage
/settings/* -> AuthGuard -> AgentSettingsPage
```

---

## Phase 6: Cloud Storage Service ✅

- [x] Create `frontend/src/services/cloud/CloudStorageService.ts`
  - [x] Mirror StorageService API using Supabase queries
  - [x] `saveProject()`, `getProject()`, `getAllProjectMetadata()`
  - [x] `deleteProject()`, `renameProject()`, `duplicateProject()`
  - [x] `saveChatMessages()`, `getChatMessages()`
  - [x] RLS handles user isolation (no userId param needed)
- [x] Create `frontend/src/services/storage/HybridStorageService.ts`
  - [x] `setAuthenticated(userId: string | null)` — toggles mode
  - [x] Authenticated: write to Supabase, write-through to IndexedDB
  - [x] Anonymous: write to IndexedDB only

---

## Phase 7: Wire Up Hybrid Storage ✅

- [x] In `App.tsx` — call `hybridStorage.setAuthenticated()` when auth state changes
- [x] Replace `storageService` with `hybridStorageService` in:
  - [x] `frontend/src/hooks/useAutoSave.ts`
  - [x] `frontend/src/pages/BuilderPage.tsx`
  - [x] `frontend/src/App.tsx` (WelcomePageWrapper handlers)

---

## Phase 8: Local Project Import ✅

- [x] Create `frontend/src/components/ImportLocalProjectsDialog/ImportLocalProjectsDialog.tsx`
  - [x] Show once after first login if local IndexedDB projects exist
  - [x] Checkbox list of local projects
  - [x] "Import Selected" uploads to Supabase
  - [x] Mark `localProjectsImported: true` in IndexedDB metadata
- [x] Trigger import dialog in App.tsx or WelcomePage after auth state changes to authenticated

---

## Phase 9: Backend Auth Middleware ✅

- [x] Create `backend/lib/security/auth.ts` — `verifySupabaseToken(token): { userId } | null`
- [x] Modify `backend/middleware.ts`
  - [x] Read `Authorization: Bearer <token>` on `/api/*` routes (except `/api/health`)
  - [x] Verify JWT, extract userId, set `X-User-Id` header
  - [x] Return 401 if invalid
- [x] Add `SUPABASE_JWT_SECRET` to `backend/lib/config.ts` env schema
- [x] Add `SUPABASE_JWT_SECRET` to `backend/.env`

---

## Phase 10: Supabase Edge Functions Auth

- [ ] Set `verify_jwt = true` in `supabase/config.toml` for all functions
- [ ] Add `createAuthClient(authHeader)` to `supabase/functions/_shared/supabase-client.ts`
- [ ] Update `generate-stream` edge function to use auth client for DB writes
- [ ] Update `modify` edge function to use auth client for DB writes

---

## File Reference

### New Files
| File | Purpose |
|------|---------|
| `supabase/migrations/20260307_add_auth.sql` | user_id columns, RLS policies, chat_messages table |
| `shared/src/types/auth.ts` | AuthUser, AuthSession types |
| `frontend/src/integrations/supabase/client.ts` | Supabase client singleton |
| `frontend/src/context/AuthContext.context.ts` | Auth contexts + hooks |
| `frontend/src/context/AuthContext.tsx` | AuthProvider |
| `frontend/src/pages/LoginPage.tsx` | Login/signup page |
| `frontend/src/components/AuthGuard/AuthGuard.tsx` | Route protection |
| `frontend/src/components/UserMenu/UserMenu.tsx` | User dropdown in header |
| `frontend/src/services/cloud/CloudStorageService.ts` | Supabase storage |
| `frontend/src/services/storage/HybridStorageService.ts` | IndexedDB + Supabase facade |
| `frontend/src/components/ImportLocalProjectsDialog/ImportLocalProjectsDialog.tsx` | Local-to-cloud import |
| `backend/lib/security/auth.ts` | JWT verification |

### Modified Files
| File | Change |
|------|--------|
| `supabase/config.toml` | Enable JWT verification |
| `shared/src/types/index.ts` | Export auth types |
| `frontend/src/App.tsx` | AuthProvider, /login route, AuthGuard, hybrid storage |
| `frontend/src/components/SiteHeader/SiteHeader.tsx` | UserMenu / Sign In link |
| `frontend/src/hooks/useAutoSave.ts` | Use hybridStorageService |
| `frontend/src/pages/BuilderPage.tsx` | Use hybridStorageService |
| `backend/middleware.ts` | JWT verification middleware |
| `backend/lib/config.ts` | SUPABASE_JWT_SECRET env var |
| `supabase/functions/_shared/supabase-client.ts` | Add createAuthClient() |

---

## Verification

1. **Auth flow:** Sign up with email -> redirected to `/` -> user menu shows in header
2. **Cloud persistence:** Create project -> sign out -> sign back in -> project still there
3. **Import flow:** Have local projects -> sign up -> import dialog appears -> import -> projects visible
4. **RLS isolation:** User A can't see User B's projects (test with two accounts)
5. **Protected routes:** Accessing `/project/new` while logged out -> redirects to `/login`
