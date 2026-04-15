# AI App Builder

Generate full React web applications from natural language prompts. Describe what you want to build and get a live, editable app in seconds.

## Features

- **AI-powered generation** — describe your app, get working React code via multi-phase pipeline
- **Automatic CRUD** — entity apps (blogs, task managers, contacts) automatically include add/edit/delete without asking
- **Live preview** — Sandpack-powered in-browser execution with console panel
- **Code editor** — Monaco editor with file tree
- **Version control** — undo/redo through generation history
- **Auto-repair** — automatic error detection and fix with escalating repair tiers (deterministic fixes → AI repair → per-file rollback)
- **Cloud sync** — optional Supabase-backed project storage
- **Onboarding wizard** — guided 3-step project setup (type → features → design style)
- **21 starter templates** — across 8 categories for quick project bootstrapping
- **Image upload** — paste or drag-drop images into chat for context
- **Fullstack recipes** — Next.js + Prisma and Next.js + Supabase Auth generation (feature-flagged)
- **Fullstack export** — ZIP with context-aware README, Docker Compose, .env.example
- **Blank Canvas Admin** — invite members to a shared org workspace where all AI generation uses the org's own API key; admin dashboard for members, projects, and settings
- **Classroom/beginner mode** — workspace-level flag constrains generation to 4-6 file React SPAs with no network calls and at least 2 event handlers; deterministic planning bypasses AI latency for the 5 common classroom prompt types (counter, todo, quiz, form, calculator)
- **Reliable continuation** — server-side session tracking remembers the last 8 turns per workspace project, so the AI maintains context across requests without the frontend re-sending history

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React 18 + Vite, port 8080)                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ ChatPanel   │  │ MonacoEditor │  │ SandpackPreview│  │
│  └──────┬──────┘  └──────────────┘  └────────────────┘  │
│         │ SSE streaming                                  │
└─────────┼───────────────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────────────┐
│  Backend (Next.js 16, port 4000)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ AgentRouter  │  │ GenPipeline  │  │ RecipeEngine  │  │
│  └──────┬───────┘  └──────┬───────┘  └───────────────┘  │
│         │                 │                              │
│  ┌──────▼─────────────────▼────┐                        │
│  │ AIProvider (OpenRouter/Modal)│                        │
│  └──────────────────────────────┘                        │
└─────────────────────────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────────────┐
│  Shared — Zod schemas + common types (ESM + CJS)        │
└─────────────────────────────────────────────────────────┘
```

## Prerequisites

- Node.js 18+
- npm 9+
- An [OpenRouter](https://openrouter.ai) API key (or a running Modal endpoint)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure backend environment
cp backend/.env.example backend/.env
# Edit backend/.env — set OPENROUTER_API_KEY

# 3. Start everything
npm run dev
```

Frontend: http://localhost:8080
Backend: http://localhost:4000

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENROUTER_API_KEY` | Yes* | — | OpenRouter API key |
| `AI_PROVIDER` | No | `openrouter` | `openrouter` or `modal` |
| `MODAL_DEFAULT_URL` | Yes* | — | Default Modal endpoint (modal only) |
| `MODAL_DEFAULT_STREAM_URL` | No | — | Default Modal streaming URL (modal only) |
| `MODAL_<TASK>_URL` | No | — | Per-task Modal URL; `TASK` = `INTENT`, `PLANNING`, `EXECUTION`, `BUGFIX` |
| `MAX_OUTPUT_TOKENS` | No | `16384` | Token limit per generation |
| `ALLOWED_ORIGINS` | No | `http://localhost:8080` | CORS origins (comma-separated) |
| `LOG_LEVEL` | No | `info` | `debug` / `info` / `warn` / `error` |
| `LOG_FORMAT` | No | `text` | `text` / `json` |
| `LOG_CATEGORIES` | No | all | Comma-separated filter: `ai,api,core,diff,analysis,streaming` |
| `RATE_LIMIT_ENABLED` | No | `true` | Enable rate limiting |
| `TRUSTED_PROXY_DEPTH` | No | `1` | Rightmost X-Forwarded-For IPs to trust for IP extraction |
| `REDIS_URL` | No | — | Redis URL for distributed rate limiting (falls back to in-memory) |
| `ENABLE_FULLSTACK_RECIPES` | No | `false` | Enable fullstack generation (Next.js + Prisma/Supabase) |
| `SESSION_HISTORY_TURNS` | No | `8` | Prior turns injected into AI context per request (0 to disable) |
| `SUPABASE_JWT_SECRET` | No* | — | Enables Supabase Auth; required for config mutation routes in production |
| `WORKSPACE_MASTER_KEY` | No* | — | Base64-encoded 32-byte key for AES-256-GCM org API key encryption (required for Blank Canvas Admin) |

*Required for the selected provider. `SUPABASE_JWT_SECRET` marked `No*` is optional in local dev but required for production deployments that expose AI model/provider config endpoints.

### Frontend (`frontend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_BASE_URL` | No | `http://localhost:4000` | Backend URL |
| `VITE_SUPABASE_URL` | No | — | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | No | — | Supabase anon key |

## Common Commands

```bash
# Development
npm run dev                  # Start all (frontend + backend + shared watch)
npm run dev:frontend         # Frontend only
npm run dev:backend          # Backend only

# Build
npm run build                # Build all (shared → frontend → backend)

# Test
npm test                     # All workspaces
npm test --workspace=@ai-app-builder/backend

# Lint
npm run lint                 # All workspaces
```

## Project Structure

```
├── frontend/          # React 18/Vite SPA
├── backend/           # Next.js 16 API server
├── shared/            # Common types + Zod schemas
├── supabase/          # Edge functions + config
└── modal-code-ai/     # Python Modal app (self-hosted models)
```

For full technical details — architecture decisions, design patterns, pitfalls — see [CLAUDE.md](CLAUDE.md).

For visual design — color palette, typography, spacing, and UI guidelines — see [DESIGN.md](DESIGN.md).
