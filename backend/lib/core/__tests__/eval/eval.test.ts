/**
 * Generation Eval Suite
 *
 * Tests scoring logic against snapshot outputs.
 * For live AI evaluation, run: npm run eval --workspace=@ai-app-builder/backend
 */

import { describe, it, expect } from 'vitest';
import { REFERENCE_PROMPTS } from './reference-prompts';
import { scoreOutput } from './scoring';
import type { ProjectOutput } from '../../schemas';

// ── Broken-import checker ──────────────────────────────────────────────────────

function resolvePath(dir: string, importPath: string): string {
  const parts = (dir + '/' + importPath).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.') out.push(p);
  }
  return out.join('/');
}

/** Returns a list of broken relative imports (relative paths that don't resolve). */
function findBrokenImports(files: { path: string; content: string }[]): string[] {
  const filePaths = new Set(files.map(f => f.path));
  const broken: string[] = [];
  const fromRe = /from\s+['"](\.[^'"]+)['"]/g;

  for (const file of files) {
    const dir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
    let m: RegExpExecArray | null;
    fromRe.lastIndex = 0;
    while ((m = fromRe.exec(file.content)) !== null) {
      const imp = m[1];
      const base = dir ? resolvePath(dir, imp) : imp.replace(/^\.\//, '');
      const resolved =
        filePaths.has(base) ||
        filePaths.has(base + '.ts') ||
        filePaths.has(base + '.tsx') ||
        filePaths.has(base + '/index.ts') ||
        filePaths.has(base + '/index.tsx');
      if (!resolved) broken.push(`${file.path} → ${imp}`);
    }
  }
  return broken;
}

/** Returns names exported by a file (export interface/type/function/const/class/enum). */
function getExportedNames(content: string): string[] {
  const re = /export\s+(?:default\s+)?(?:type\s+)?(?:interface|type|enum|class|const|function)\s+(\w+)/g;
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) names.push(m[1]);
  return names;
}

// ── Snapshot outputs for offline testing ──

const SIMPLE_COUNTER_OUTPUT: ProjectOutput = {
  files: [
    { path: 'package.json', content: '{"name":"counter","dependencies":{"react":"^18.2.0","react-dom":"^18.2.0"}}' },
    { path: 'src/main.tsx', content: 'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\nimport "./index.css";\nReactDOM.createRoot(document.getElementById("root")!).render(<App />);' },
    { path: 'src/App.tsx', content: 'import { useState } from "react";\nexport default function App() {\n  const [count, setCount] = useState(0);\n  return (\n    <div>\n      <h1>Counter: {count}</h1>\n      <button onClick={() => setCount(c => c + 1)}>increment</button>\n      <button onClick={() => setCount(c => c - 1)}>decrement</button>\n    </div>\n  );\n}' },
    { path: 'src/index.css', content: ':root { --color-primary: #3b82f6; }\nbody { font-family: sans-serif; margin: 0; padding: 2rem; }\nbutton { padding: 0.5rem 1rem; margin: 0.25rem; cursor: pointer; }' },
  ],
};

// ── Medium todo snapshot (12 files) ──────────────────────────────────────────

const MEDIUM_TODO_OUTPUT: ProjectOutput = {
  files: [
    { path: 'package.json', content: '{"name":"todo-app","dependencies":{"react":"^18.2.0","react-dom":"^18.2.0"},"devDependencies":{"typescript":"^5.0.0","vite":"^5.0.0","@vitejs/plugin-react":"^4.0.0"}}' },
    { path: 'src/main.tsx', content: 'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\nimport "./index.css";\nReactDOM.createRoot(document.getElementById("root")!).render(<App />);' },
    { path: 'src/App.tsx', content: 'import { useTodos } from "./hooks/useTodos";\nimport { useSearch } from "./hooks/useSearch";\nimport { TodoList } from "./components/TodoList";\nimport { SearchBar } from "./components/SearchBar";\nimport { CategoryFilter } from "./components/CategoryFilter";\nexport default function App() {\n  const { todos, addTodo, completeTodo, deleteTodo, filter, setFilter } = useTodos();\n  const { query, setQuery, filteredTodos } = useSearch(todos);\n  return (\n    <div className="app">\n      <h1>Todo App</h1>\n      <SearchBar query={query} onSearch={setQuery} />\n      <CategoryFilter filter={filter} onFilter={setFilter} />\n      <TodoList todos={filteredTodos} onComplete={completeTodo} onDelete={deleteTodo} />\n    </div>\n  );\n}' },
    { path: 'src/index.css', content: ':root { --color-primary: #3b82f6; --color-danger: #ef4444; }\nbody { font-family: sans-serif; margin: 0; padding: 2rem; background: #f9fafb; }\n.app { max-width: 640px; margin: 0 auto; }\n.todo-item { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: #fff; border-radius: 0.5rem; margin-bottom: 0.5rem; }\n.search-bar input { width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem; }\n.filter-btn { padding: 0.375rem 0.75rem; border: none; border-radius: 0.25rem; cursor: pointer; }\n.filter-btn.active { background: var(--color-primary); color: #fff; }' },
    { path: 'src/types/index.ts', content: 'export interface Todo {\n  id: string;\n  title: string;\n  completed: boolean;\n  category: Category;\n  createdAt: number;\n}\nexport type Category = "work" | "personal" | "shopping" | "other";\nexport type Filter = "all" | "active" | "completed";' },
    { path: 'src/hooks/useTodos.ts', content: 'import { useState, useCallback } from "react";\nimport type { Todo, Category, Filter } from "../types/index";\nimport { loadTodos, saveTodos } from "../utils/storage";\nexport function useTodos() {\n  const [todos, setTodos] = useState<Todo[]>(loadTodos);\n  const [filter, setFilter] = useState<Filter>("all");\n  const addTodo = useCallback((title: string, category: Category) => {\n    const todo: Todo = { id: crypto.randomUUID(), title, completed: false, category, createdAt: Date.now() };\n    setTodos(prev => { const next = [todo, ...prev]; saveTodos(next); return next; });\n  }, []);\n  const completeTodo = useCallback((id: string) => {\n    setTodos(prev => { const next = prev.map(t => t.id === id ? { ...t, completed: true } : t); saveTodos(next); return next; });\n  }, []);\n  const deleteTodo = useCallback((id: string) => {\n    setTodos(prev => { const next = prev.filter(t => t.id !== id); saveTodos(next); return next; });\n  }, []);\n  return { todos, addTodo, completeTodo, deleteTodo, filter, setFilter };\n}' },
    { path: 'src/hooks/useSearch.ts', content: 'import { useState, useMemo } from "react";\nimport type { Todo } from "../types/index";\nexport function useSearch(todos: Todo[]) {\n  const [query, setQuery] = useState("");\n  const filteredTodos = useMemo(\n    () => todos.filter(t => t.title.toLowerCase().includes(query.toLowerCase())),\n    [todos, query]\n  );\n  return { query, setQuery, filteredTodos };\n}' },
    { path: 'src/components/TodoList.tsx', content: 'import type { Todo } from "../types/index";\nimport { TodoItem } from "./TodoItem";\ninterface Props { todos: Todo[]; onComplete: (id: string) => void; onDelete: (id: string) => void; }\nexport function TodoList({ todos, onComplete, onDelete }: Props) {\n  if (todos.length === 0) return <p className="empty-state">No todos yet.</p>;\n  return <ul className="todo-list">{todos.map(t => <TodoItem key={t.id} todo={t} onComplete={onComplete} onDelete={onDelete} />)}</ul>;\n}' },
    { path: 'src/components/TodoItem.tsx', content: 'import type { Todo } from "../types/index";\ninterface Props { todo: Todo; onComplete: (id: string) => void; onDelete: (id: string) => void; }\nexport function TodoItem({ todo, onComplete, onDelete }: Props) {\n  return (\n    <li className={`todo-item ${todo.completed ? "completed" : ""}`}>\n      <input type="checkbox" checked={todo.completed} onChange={() => onComplete(todo.id)} />\n      <span>{todo.title}</span>\n      <span className="category-badge">{todo.category}</span>\n      <button onClick={() => onDelete(todo.id)} aria-label="delete">×</button>\n    </li>\n  );\n}' },
    { path: 'src/components/SearchBar.tsx', content: 'interface Props { query: string; onSearch: (q: string) => void; }\nexport function SearchBar({ query, onSearch }: Props) {\n  return (\n    <div className="search-bar">\n      <input type="text" value={query} onChange={e => onSearch(e.target.value)} placeholder="Search todos..." />\n    </div>\n  );\n}' },
    { path: 'src/components/CategoryFilter.tsx', content: 'import type { Filter } from "../types/index";\nconst FILTERS: Filter[] = ["all", "active", "completed"];\ninterface Props { filter: Filter; onFilter: (f: Filter) => void; }\nexport function CategoryFilter({ filter, onFilter }: Props) {\n  return (\n    <div className="category-filter">\n      {FILTERS.map(f => (\n        <button key={f} className={`filter-btn ${filter === f ? "active" : ""}`} onClick={() => onFilter(f)}>{f}</button>\n      ))}\n    </div>\n  );\n}' },
    { path: 'src/utils/storage.ts', content: 'import type { Todo } from "../types/index";\nconst KEY = "todos";\nexport function loadTodos(): Todo[] {\n  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }\n}\nexport function saveTodos(todos: Todo[]): void {\n  localStorage.setItem(KEY, JSON.stringify(todos));\n}' },
  ],
};

// ── Complex project-management snapshot (19 files) ───────────────────────────

const COMPLEX_PM_OUTPUT: ProjectOutput = {
  files: [
    { path: 'package.json', content: '{"name":"project-management","dependencies":{"react":"^18.2.0","react-dom":"^18.2.0"},"devDependencies":{"typescript":"^5.0.0","vite":"^5.0.0","@vitejs/plugin-react":"^4.0.0"}}' },
    { path: 'src/main.tsx', content: 'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\nimport "./index.css";\nReactDOM.createRoot(document.getElementById("root")!).render(<App />);' },
    { path: 'src/App.tsx', content: 'import { useState } from "react";\nimport { AppProvider } from "./context/AppContext";\nimport { DashboardPage } from "./pages/DashboardPage";\nimport { KanbanPage } from "./pages/KanbanPage";\nimport { TeamPage } from "./pages/TeamPage";\ntype Page = "dashboard" | "kanban" | "team";\nexport default function App() {\n  const [page, setPage] = useState<Page>("dashboard");\n  return (\n    <AppProvider>\n      <nav>{(["dashboard","kanban","team"] as Page[]).map(p => <button key={p} onClick={() => setPage(p)}>{p}</button>)}</nav>\n      {page === "dashboard" && <DashboardPage />}\n      {page === "kanban" && <KanbanPage />}\n      {page === "team" && <TeamPage />}\n    </AppProvider>\n  );\n}' },
    { path: 'src/index.css', content: ':root { --color-primary: #6366f1; --color-surface: #fff; --color-bg: #f3f4f6; }\nbody { font-family: sans-serif; margin: 0; background: var(--color-bg); }\n.dashboard { padding: 2rem; }\n.kanban-board { display: flex; gap: 1rem; padding: 2rem; overflow-x: auto; }\n.kanban-column { background: #e5e7eb; border-radius: 0.5rem; min-width: 260px; padding: 1rem; }\n.task-card { background: #fff; border-radius: 0.375rem; padding: 0.75rem; margin-bottom: 0.5rem; box-shadow: 0 1px 3px rgba(0,0,0,.1); }\n.stats-card { background: #fff; border-radius: 0.5rem; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,.1); }\n.team-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; padding: 2rem; }' },
    { path: 'src/types/index.ts', content: 'export interface Project {\n  id: string;\n  name: string;\n  description: string;\n  status: "active" | "completed" | "paused";\n}\nexport interface Task {\n  id: string;\n  projectId: string;\n  title: string;\n  description: string;\n  status: ColumnType;\n  assigneeId: string | null;\n  priority: "low" | "medium" | "high";\n  createdAt: number;\n}\nexport interface TeamMember {\n  id: string;\n  name: string;\n  role: string;\n  avatarUrl: string;\n  taskCount: number;\n}\nexport type ColumnType = "todo" | "in-progress" | "review" | "done";\nexport interface Column {\n  id: ColumnType;\n  title: string;\n  tasks: Task[];\n}' },
    { path: 'src/context/AppContext.tsx', content: 'import { createContext, useContext, useState, type ReactNode } from "react";\nimport type { Project, Task, TeamMember } from "../types/index";\ninterface AppState { projects: Project[]; tasks: Task[]; team: TeamMember[]; }\ninterface AppContextValue extends AppState { addTask: (t: Omit<Task, "id"|"createdAt">) => void; moveTask: (id: string, status: Task["status"]) => void; }\nconst AppContext = createContext<AppContextValue | null>(null);\nexport function AppProvider({ children }: { children: ReactNode }) {\n  const [projects] = useState<Project[]>([]);\n  const [tasks, setTasks] = useState<Task[]>([]);\n  const [team] = useState<TeamMember[]>([]);\n  const addTask = (t: Omit<Task, "id"|"createdAt">) => setTasks(prev => [...prev, { ...t, id: crypto.randomUUID(), createdAt: Date.now() }]);\n  const moveTask = (id: string, status: Task["status"]) => setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));\n  return <AppContext.Provider value={{ projects, tasks, team, addTask, moveTask }}>{children}</AppContext.Provider>;\n}\nexport function useAppContext() { const ctx = useContext(AppContext); if (!ctx) throw new Error("Missing AppProvider"); return ctx; }' },
    { path: 'src/hooks/useProjects.ts', content: 'import { useMemo } from "react";\nimport type { Project } from "../types/index";\nimport { useAppContext } from "../context/AppContext";\nexport function useProjects() {\n  const { projects } = useAppContext();\n  const activeProjects = useMemo(() => projects.filter(p => p.status === "active"), [projects]);\n  return { projects, activeProjects };\n}' },
    { path: 'src/hooks/useTasks.ts', content: 'import { useMemo } from "react";\nimport type { Task, ColumnType } from "../types/index";\nimport { useAppContext } from "../context/AppContext";\nexport function useTasks() {\n  const { tasks, addTask, moveTask } = useAppContext();\n  const tasksByColumn = useMemo(() => {\n    const cols: Record<ColumnType, Task[]> = { "todo": [], "in-progress": [], "review": [], "done": [] };\n    tasks.forEach(t => cols[t.status].push(t));\n    return cols;\n  }, [tasks]);\n  return { tasks, tasksByColumn, addTask, moveTask };\n}' },
    { path: 'src/hooks/useTeam.ts', content: 'import { useAppContext } from "../context/AppContext";\nexport function useTeam() {\n  const { team } = useAppContext();\n  return { team };\n}' },
    { path: 'src/components/dashboard/Dashboard.tsx', content: 'import { StatsCard } from "./StatsCard";\nimport { useAppContext } from "../../context/AppContext";\nexport function Dashboard() {\n  const { tasks, projects, team } = useAppContext();\n  return (\n    <div className="dashboard">\n      <h1>Dashboard</h1>\n      <div className="stats-grid">\n        <StatsCard label="Projects" value={projects.length} />\n        <StatsCard label="Tasks" value={tasks.length} />\n        <StatsCard label="Team" value={team.length} />\n        <StatsCard label="Done" value={tasks.filter(t => t.status === "done").length} />\n      </div>\n    </div>\n  );\n}' },
    { path: 'src/components/dashboard/StatsCard.tsx', content: 'interface Props { label: string; value: number; }\nexport function StatsCard({ label, value }: Props) {\n  return <div className="stats-card"><h3>{value}</h3><p>{label}</p></div>;\n}' },
    { path: 'src/components/kanban/KanbanBoard.tsx', content: 'import { useTasks } from "../../hooks/useTasks";\nimport { KanbanColumn } from "./KanbanColumn";\nimport type { ColumnType } from "../../types/index";\nconst COLUMNS: { id: ColumnType; title: string }[] = [\n  { id: "todo", title: "To Do" }, { id: "in-progress", title: "In Progress" },\n  { id: "review", title: "Review" }, { id: "done", title: "Done" },\n];\nexport function KanbanBoard() {\n  const { tasksByColumn, moveTask } = useTasks();\n  return (\n    <div className="kanban-board">\n      {COLUMNS.map(col => <KanbanColumn key={col.id} column={col} tasks={tasksByColumn[col.id]} onMoveTask={moveTask} />)}\n    </div>\n  );\n}' },
    { path: 'src/components/kanban/KanbanColumn.tsx', content: 'import type { Task, ColumnType } from "../../types/index";\nimport { TaskCard } from "./TaskCard";\ninterface Props { column: { id: ColumnType; title: string }; tasks: Task[]; onMoveTask: (id: string, status: ColumnType) => void; }\nexport function KanbanColumn({ column, tasks, onMoveTask }: Props) {\n  return (\n    <div className="kanban-column">\n      <h3>{column.title} ({tasks.length})</h3>\n      {tasks.map(t => <TaskCard key={t.id} task={t} onMove={onMoveTask} />)}\n    </div>\n  );\n}' },
    { path: 'src/components/kanban/TaskCard.tsx', content: 'import type { Task, ColumnType } from "../../types/index";\ninterface Props { task: Task; onMove: (id: string, status: ColumnType) => void; }\nexport function TaskCard({ task, onMove }: Props) {\n  return (\n    <div className={`task-card priority-${task.priority}`}>\n      <p>{task.title}</p>\n      <span className="badge">{task.priority}</span>\n    </div>\n  );\n}' },
    { path: 'src/components/team/TeamView.tsx', content: 'import { MemberCard } from "./MemberCard";\nimport { useTeam } from "../../hooks/useTeam";\nexport function TeamView() {\n  const { team } = useTeam();\n  return (\n    <div className="team-view">\n      <h1>Team</h1>\n      <div className="team-grid">{team.map(m => <MemberCard key={m.id} member={m} />)}</div>\n    </div>\n  );\n}' },
    { path: 'src/components/team/MemberCard.tsx', content: 'import type { TeamMember } from "../../types/index";\ninterface Props { member: TeamMember; }\nexport function MemberCard({ member }: Props) {\n  return (\n    <div className="member-card">\n      <img src={member.avatarUrl} alt={member.name} width={48} height={48} />\n      <h4>{member.name}</h4>\n      <p>{member.role}</p>\n      <span>{member.taskCount} tasks</span>\n    </div>\n  );\n}' },
    { path: 'src/pages/DashboardPage.tsx', content: 'import { Dashboard } from "../components/dashboard/Dashboard";\nexport function DashboardPage() { return <Dashboard />; }' },
    { path: 'src/pages/KanbanPage.tsx', content: 'import { KanbanBoard } from "../components/kanban/KanbanBoard";\nexport function KanbanPage() {\n  return <div><h1>Kanban Board</h1><KanbanBoard /></div>;\n}' },
    { path: 'src/pages/TeamPage.tsx', content: 'import { TeamView } from "../components/team/TeamView";\nexport function TeamPage() { return <TeamView />; }' },
  ],
};

const FULLSTACK_TODO_OUTPUT: ProjectOutput = {
  files: [
    { path: 'package.json', content: '{"name":"todo-fullstack","dependencies":{"next":"^14.0.0","react":"^18.2.0","react-dom":"^18.2.0","prisma":"^5.0.0","@prisma/client":"^5.0.0"}}' },
    { path: 'prisma/schema.prisma', content: 'datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}\ngenerator client {\n  provider = "prisma-client-js"\n}\nmodel Todo {\n  id String @id @default(uuid())\n  title String\n  completed Boolean @default(false)\n}' },
    { path: 'app/page.tsx', content: '"use client";\nimport { useState, useEffect } from "react";\nexport default function Home() {\n  const [todos, setTodos] = useState([]);\n  useEffect(() => { fetch("/api/todos").then(r=>r.json()).then(setTodos); }, []);\n  return <div>Todos</div>;\n}' },
    { path: 'app/layout.tsx', content: 'export const metadata = { title: "Todo App" };\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html><body>{children}</body></html>;\n}' },
    { path: 'app/api/todos/route.ts', content: 'import { PrismaClient } from "@prisma/client";\nconst prisma = new PrismaClient();\nexport async function GET() {\n  const todos = await prisma.todo.findMany();\n  return Response.json(todos);\n}\nexport async function POST(req: Request) {\n  const body = await req.json();\n  const todo = await prisma.todo.create({ data: body });\n  return Response.json(todo);\n}' },
    { path: 'app/globals.css', content: 'body { font-family: sans-serif; margin: 0; padding: 2rem; }' },
    { path: 'next.config.js', content: 'module.exports = {};' },
    { path: 'lib/prisma.ts', content: 'import { PrismaClient } from "@prisma/client";\nexport const prisma = new PrismaClient();' },
  ],
};

describe('Generation Eval Suite', () => {
  describe('Scoring logic', () => {
    it('scores a valid simple SPA output highly', () => {
      const ref = REFERENCE_PROMPTS.find(r => r.id === 'simple-counter')!;
      const result = scoreOutput(ref, SIMPLE_COUNTER_OUTPUT);

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(70);
    });

    it('scores a valid fullstack output highly', () => {
      const ref = REFERENCE_PROMPTS.find(r => r.id === 'fullstack-todo-db')!;
      const result = scoreOutput(ref, FULLSTACK_TODO_OUTPUT);

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(70);
    });

    it('fails when required files are missing', () => {
      const ref = REFERENCE_PROMPTS.find(r => r.id === 'simple-counter')!;
      const output: ProjectOutput = {
        files: [
          { path: 'src/App.tsx', content: 'export default function App() { return <div>Hello</div>; }' },
        ],
      };
      const result = scoreOutput(ref, output);

      expect(result.score).toBeLessThan(70);
      const filesCheck = result.checks.find(c => c.name === 'required-files');
      expect(filesCheck?.passed).toBe(false);
    });

    it('fails when forbidden patterns are present', () => {
      const ref = REFERENCE_PROMPTS.find(r => r.id === 'simple-counter')!;
      const output: ProjectOutput = {
        files: [
          ...SIMPLE_COUNTER_OUTPUT.files,
          { path: 'prisma/schema.prisma', content: 'datasource db { provider = "postgresql" }' },
        ],
      };
      const result = scoreOutput(ref, output);

      const forbiddenCheck = result.checks.find(c => c.name === 'no-forbidden-patterns');
      expect(forbiddenCheck?.passed).toBe(false);
    });

    it('detects TODO comments', () => {
      const ref = REFERENCE_PROMPTS.find(r => r.id === 'simple-counter')!;
      const output: ProjectOutput = {
        files: [
          ...SIMPLE_COUNTER_OUTPUT.files.map(f =>
            f.path === 'src/App.tsx'
              ? { ...f, content: f.content + '\n// TODO: add more features' }
              : f
          ),
        ],
      };
      const result = scoreOutput(ref, output);

      const todoCheck = result.checks.find(c => c.name === 'no-todos');
      expect(todoCheck?.passed).toBe(false);
    });

    it('detects empty files', () => {
      const ref = REFERENCE_PROMPTS.find(r => r.id === 'simple-counter')!;
      const output: ProjectOutput = {
        files: [
          ...SIMPLE_COUNTER_OUTPUT.files,
          { path: 'src/utils.ts', content: '' },
        ],
      };
      const result = scoreOutput(ref, output);

      const emptyCheck = result.checks.find(c => c.name === 'no-empty-files');
      expect(emptyCheck?.passed).toBe(false);
    });

    it('validates all reference prompts have sane expectations', () => {
      for (const ref of REFERENCE_PROMPTS) {
        expect(ref.minFiles).toBeGreaterThan(0);
        expect(ref.maxFiles).toBeGreaterThanOrEqual(ref.minFiles);
        expect(ref.requiredFiles.length).toBeGreaterThan(0);
        expect(ref.prompt.length).toBeGreaterThan(10);
      }
    });
  });
});

// ── Eval Case 1: Simple counter (5-8 files, one-shot path) ────────────────────

describe('Eval: simple counter app', () => {
  const ref = REFERENCE_PROMPTS.find(r => r.id === 'simple-counter')!;

  it('scores >= 70', () => {
    const result = scoreOutput(ref, SIMPLE_COUNTER_OUTPUT);
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it('file count is within expected range (4-12)', () => {
    expect(SIMPLE_COUNTER_OUTPUT.files.length).toBeGreaterThanOrEqual(ref.minFiles);
    expect(SIMPLE_COUNTER_OUTPUT.files.length).toBeLessThanOrEqual(ref.maxFiles);
  });

  it('has no broken relative imports', () => {
    const broken = findBrokenImports(SIMPLE_COUNTER_OUTPUT.files);
    expect(broken).toHaveLength(0);
  });
});

// ── Eval Case 2: Medium todo with search + categories (12-16 files) ───────────

describe('Eval: medium todo app with search and categories', () => {
  const ref = REFERENCE_PROMPTS.find(r => r.id === 'medium-todo')!;

  it('scores >= 70', () => {
    const result = scoreOutput(ref, MEDIUM_TODO_OUTPUT);
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it('file count is within expected range (6-20)', () => {
    expect(MEDIUM_TODO_OUTPUT.files.length).toBeGreaterThanOrEqual(ref.minFiles);
    expect(MEDIUM_TODO_OUTPUT.files.length).toBeLessThanOrEqual(ref.maxFiles);
  });

  it('has no broken relative imports', () => {
    const broken = findBrokenImports(MEDIUM_TODO_OUTPUT.files);
    expect(broken).toHaveLength(0);
  });

  it('types file exports Todo and Category', () => {
    const typesFile = MEDIUM_TODO_OUTPUT.files.find(f => f.path.includes('types'));
    expect(typesFile).toBeDefined();
    const exported = getExportedNames(typesFile!.content);
    expect(exported).toContain('Todo');
    expect(exported).toContain('Category');
  });
});

// ── Eval Case 3: Complex project management (18-25 files) ─────────────────────

describe('Eval: complex project management with kanban + dashboard', () => {
  const ref = REFERENCE_PROMPTS.find(r => r.id === 'complex-project-management')!;

  it('scores >= 70', () => {
    const result = scoreOutput(ref, COMPLEX_PM_OUTPUT);
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it('file count is within expected range (10-35)', () => {
    expect(COMPLEX_PM_OUTPUT.files.length).toBeGreaterThanOrEqual(ref.minFiles);
    expect(COMPLEX_PM_OUTPUT.files.length).toBeLessThanOrEqual(ref.maxFiles);
  });

  it('has no broken relative imports', () => {
    const broken = findBrokenImports(COMPLEX_PM_OUTPUT.files);
    expect(broken).toHaveLength(0);
  });

  it('types file exports Project, Task, and TeamMember', () => {
    const typesFile = COMPLEX_PM_OUTPUT.files.find(f => f.path.includes('types'));
    expect(typesFile).toBeDefined();
    const exported = getExportedNames(typesFile!.content);
    expect(exported).toContain('Project');
    expect(exported).toContain('Task');
    expect(exported).toContain('TeamMember');
  });

  it('has routing between dashboard, kanban, and team pages', () => {
    const appFile = COMPLEX_PM_OUTPUT.files.find(f => f.path.endsWith('App.tsx'));
    expect(appFile).toBeDefined();
    expect(appFile!.content).toContain('dashboard');
    expect(appFile!.content).toContain('kanban');
    expect(appFile!.content).toContain('team');
  });

  it('context provider wraps the app', () => {
    const appFile = COMPLEX_PM_OUTPUT.files.find(f => f.path.endsWith('App.tsx'));
    const contextFile = COMPLEX_PM_OUTPUT.files.find(f => f.path.includes('context'));
    expect(contextFile).toBeDefined();
    expect(appFile!.content).toMatch(/Provider/);
  });
});
