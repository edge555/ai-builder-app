import type { ProjectOutput } from '../../schemas';

export const SIMPLE_COUNTER_OUTPUT: ProjectOutput = {
  files: [
    {
      path: 'package.json',
      content: JSON.stringify({
        name: 'counter-app',
        private: true,
        version: '0.0.0',
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'vite build',
        },
        dependencies: {
          react: '^18.2.0',
          'react-dom': '^18.2.0',
        },
        devDependencies: {
          typescript: '^5.0.0',
          vite: '^5.0.0',
          '@vitejs/plugin-react': '^4.0.0',
        },
      }),
    },
    {
      path: 'src/main.tsx',
      content: `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,
    },
    {
      path: 'src/App.tsx',
      content: `import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <main className="app-shell">
      <h1>Counter App</h1>
      <p className="count">Count: {count}</p>
      <div className="actions">
        <button onClick={() => setCount((value) => value - 1)}>Decrement</button>
        <button onClick={() => setCount((value) => value + 1)}>Increment</button>
      </div>
    </main>
  );
}
`,
    },
    {
      path: 'src/index.css',
      content: `:root {
  color: #1f2937;
  background: #fff7ed;
  font-family: Arial, sans-serif;
}

body {
  margin: 0;
}

.app-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  gap: 1rem;
  padding: 2rem;
}

.actions {
  display: flex;
  gap: 0.75rem;
}

button {
  border: 1px solid #d4622a;
  background: #d4622a;
  color: white;
  padding: 0.75rem 1rem;
  cursor: pointer;
}
`,
    },
  ],
};

export const BEGINNER_LANDING_OUTPUT: ProjectOutput = {
  files: [
    SIMPLE_COUNTER_OUTPUT.files[0],
    SIMPLE_COUNTER_OUTPUT.files[1],
    {
      path: 'src/App.tsx',
      content: `export default function App() {
  return (
    <main className="landing">
      <section className="hero">
        <p className="eyebrow">Beginner friendly</p>
        <h1>Launch a habit tracker in minutes</h1>
        <p>Track daily wins, build streaks, and stay focused with a simple dashboard.</p>
        <div className="hero-actions">
          <button>Start tracking</button>
          <button>See demo</button>
        </div>
      </section>
      <section className="features">
        <article>
          <h2>Daily check-ins</h2>
          <p>Log progress with one click.</p>
        </article>
        <article>
          <h2>Weekly review</h2>
          <p>Spot patterns before you lose momentum.</p>
        </article>
      </section>
    </main>
  );
}
`,
    },
    {
      path: 'src/index.css',
      content: `:root {
  color: #1f2937;
  background: #fffaf4;
  font-family: Arial, sans-serif;
}

body {
  margin: 0;
}

.landing {
  min-height: 100vh;
  padding: 4rem 1.5rem;
  display: grid;
  gap: 3rem;
  background: linear-gradient(180deg, #fffaf4 0%, #ffe7d6 100%);
}

.hero {
  max-width: 48rem;
  display: grid;
  gap: 1rem;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.features {
  display: grid;
  gap: 1rem;
}

article,
button {
  border: 1px solid #d4622a;
  border-radius: 12px;
}

article {
  background: white;
  padding: 1rem;
}

button {
  background: #d4622a;
  color: white;
  padding: 0.85rem 1.15rem;
}
`,
    },
  ],
};

export const BROKEN_RUNTIME_OUTPUT: ProjectOutput = {
  files: [
    SIMPLE_COUNTER_OUTPUT.files[0],
    {
      path: 'src/main.tsx',
      content: `import ReactDOM from "react-dom/client";
import BrokenApp from "./App";

BrokenApp();
`,
    },
    {
      path: 'src/App.tsx',
      content: `export function App() {
  throw new Error("boom");
}
`,
    },
    {
      path: 'src/index.css',
      content: `body { margin: 0; }`,
    },
  ],
};

export const COUNTER_BEFORE_FILES: Record<string, string> = Object.fromEntries(
  SIMPLE_COUNTER_OUTPUT.files.map((file) => [file.path, file.content]),
);

export const COUNTER_AFTER_LABEL_FILES: Record<string, string> = {
  ...COUNTER_BEFORE_FILES,
  'src/App.tsx': `import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <main className="app-shell">
      <h1>Click Counter</h1>
      <p className="count">Current count: {count}</p>
      <div className="actions">
        <button onClick={() => setCount((value) => value - 1)}>Decrease</button>
        <button onClick={() => setCount((value) => value + 1)}>Increase</button>
      </div>
    </main>
  );
}
`,
};

export const COUNTER_AFTER_RESET_FILES: Record<string, string> = {
  ...COUNTER_BEFORE_FILES,
  'src/App.tsx': `import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <main className="app-shell">
      <h1>Counter App</h1>
      <p className="count">Count: {count}</p>
      <div className="actions">
        <button onClick={() => setCount((value) => value - 1)}>Decrement</button>
        <button onClick={() => setCount(0)}>Reset</button>
        <button onClick={() => setCount((value) => value + 1)}>Increment</button>
      </div>
    </main>
  );
}
`,
};
