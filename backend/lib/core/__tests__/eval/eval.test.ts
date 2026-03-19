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

// ── Snapshot outputs for offline testing ──

const SIMPLE_COUNTER_OUTPUT: ProjectOutput = {
  files: [
    { path: 'package.json', content: '{"name":"counter","dependencies":{"react":"^18.2.0","react-dom":"^18.2.0"}}' },
    { path: 'src/main.tsx', content: 'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\nimport "./index.css";\nReactDOM.createRoot(document.getElementById("root")!).render(<App />);' },
    { path: 'src/App.tsx', content: 'import { useState } from "react";\nexport default function App() {\n  const [count, setCount] = useState(0);\n  return (\n    <div>\n      <h1>Counter: {count}</h1>\n      <button onClick={() => setCount(c => c + 1)}>increment</button>\n      <button onClick={() => setCount(c => c - 1)}>decrement</button>\n    </div>\n  );\n}' },
    { path: 'src/index.css', content: ':root { --color-primary: #3b82f6; }\nbody { font-family: sans-serif; margin: 0; padding: 2rem; }\nbutton { padding: 0.5rem 1rem; margin: 0.25rem; cursor: pointer; }' },
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
