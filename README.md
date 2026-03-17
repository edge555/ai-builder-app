# AI App Builder

Generate full React web applications from natural language prompts. Describe what you want to build and get a live, editable app in seconds.

## Features

- **AI-powered generation** — describe your app, get working React code
- **Live preview** — Sandpack-powered in-browser execution
- **Code editor** — Monaco editor with file tree
- **Version control** — undo/redo through generation history
- **Auto-repair** — automatic error detection and fix (up to 3 attempts)
- **Cloud sync** — optional Supabase-backed project storage

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
│  Backend (Next.js 14, port 4000)                        │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────┐  │
│  │ AgentRouter  │  │ FileProcessor│  │ VersionManager │  │
│  └──────┬───────┘  └─────────────┘  └────────────────┘  │
│         │                                               │
│  ┌──────▼───────────────────────┐                       │
│  │ AIProvider (OpenRouter/Modal)│                       │
│  └──────────────────────────────┘                       │
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
| `MODAL_<TASK>_URL` | No | — | Per-task Modal URL; `TASK` = `INTENT`, `PLANNING`, `EXECUTION`, `BUGFIX`, `REVIEW` |
| `MAX_OUTPUT_TOKENS` | No | `16384` | Token limit per generation |
| `ALLOWED_ORIGINS` | No | `http://localhost:8080` | CORS origins (comma-separated) |
| `LOG_LEVEL` | No | `info` | `debug` / `info` / `warn` / `error` |
| `SUPABASE_JWT_SECRET` | No | — | Enables Supabase Auth verification |

*Required for the selected provider.

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
├── backend/           # Next.js 14 API server
├── shared/            # Common types + Zod schemas
├── supabase/          # Edge functions + config
└── modal-code-ai/     # Python Modal app (self-hosted models)
```

For full technical details — architecture decisions, design patterns, pitfalls — see [CLAUDE.md](CLAUDE.md).
