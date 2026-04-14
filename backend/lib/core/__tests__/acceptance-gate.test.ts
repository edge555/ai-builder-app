import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AcceptanceGate } from '../acceptance-gate';

const validateAllMock = vi.fn().mockReturnValue({ valid: true, errors: [] });
const validateCrossFileReferencesMock = vi.fn().mockReturnValue([]);

vi.mock('../build-validator', () => ({
  createBuildValidator: () => ({
    validateAll: validateAllMock,
    validateCrossFileReferences: validateCrossFileReferencesMock,
  }),
}));

describe('AcceptanceGate', () => {
  beforeEach(() => {
    validateAllMock.mockClear();
    validateCrossFileReferencesMock.mockClear();
    validateAllMock.mockReturnValue({ valid: true, errors: [] });
    validateCrossFileReferencesMock.mockReturnValue([]);
  });

  it('rejects placeholder content in critical files', () => {
    const gate = new AcceptanceGate();

    const result = gate.validate({
      'package.json': JSON.stringify({ name: 'test-app', dependencies: {} }),
      'src/main.tsx': 'import "./index.css"; // Subsequent phases will complete this file',
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      type: 'placeholder_content',
      file: 'src/main.tsx',
    }));
  });

  it.each([
    // Note: placeholder text in string literals to avoid the forbidden `// TODO` pattern validator
    { desc: 'todo: implement', content: 'export default function App() { return "todo: implement this"; }' },
    { desc: 'replace this stub', content: 'export default function App() { return "replace this stub"; }' },
    // implement this file pattern is comment-anchored — must appear after //
    { desc: 'implement this file (comment)', content: 'export default function App() {\n  // implement this file\n  return null;\n}' },
  ])('rejects "$desc" placeholder in src/App.tsx', ({ content }) => {
    const gate = new AcceptanceGate();
    const result = gate.validate({ 'src/App.tsx': content, 'package.json': '{"name":"app","dependencies":{}}' });
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ type: 'placeholder_content', file: 'src/App.tsx' }));
  });

  it('does not reject "implement this file" in a string literal (not a comment)', () => {
    const gate = new AcceptanceGate();
    const result = gate.validate({
      'src/App.tsx': 'export default function App() { return <p>Use this to implement this file-based routing</p>; }',
      'package.json': '{"name":"app","description":"implement this file-based routing","dependencies":{}}',
    });
    expect(result.valid).toBe(true);
  });

  it('does not reject placeholder text in non-critical files', () => {
    const gate = new AcceptanceGate();
    const result = gate.validate({
      'src/components/Placeholder.tsx': 'export default function Placeholder() { return "coming soon"; }',
      'src/main.tsx': 'import App from "./App";',
      'package.json': '{"name":"app","dependencies":{}}',
    });
    expect(result.valid).toBe(true);
  });

  describe('lightValidate', () => {
    it('passes structurally valid files', () => {
      const gate = new AcceptanceGate();
      const result = gate.lightValidate({
        'src/App.tsx': 'export default function App() { return <div>hello</div>; }',
        'package.json': '{"name":"app","dependencies":{}}',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects placeholder content in critical files', () => {
      const gate = new AcceptanceGate();
      const result = gate.lightValidate({
        'src/App.tsx': 'export default function App() {\n  // implement this file\n  return null;\n}',
        'package.json': '{"name":"app","dependencies":{}}',
      });
      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(expect.objectContaining({ type: 'placeholder_content', file: 'src/App.tsx' }));
    });

    it('returns a valid AcceptanceResult shape', () => {
      const gate = new AcceptanceGate();
      const result = gate.lightValidate({
        'src/App.tsx': 'export default function App() { return null; }',
        'package.json': '{"name":"app","dependencies":{}}',
      });
      expect(result).toMatchObject({ valid: expect.any(Boolean), issues: expect.any(Array), validationErrors: expect.any(Array), buildErrors: expect.any(Array) });
    });
  });

  it('does not reject legitimate JSX placeholder attributes', () => {
    const gate = new AcceptanceGate();

    const result = gate.validate({
      'package.json': JSON.stringify({ name: 'test-app', dependencies: {} }),
      'src/main.tsx': 'import App from "./App"; import "./index.css";',
      'src/App.tsx': 'export default function App() { return <input placeholder="Email" />; }',
    });

    expect(result.valid).toBe(true);
  });

  describe('beginner mode constraints', () => {
    function beginnerBaseFiles(): Record<string, string> {
      return {
        'package.json': '{"name":"app","dependencies":{"react":"18.0.0","react-dom":"18.0.0"}}',
        'src/main.tsx': 'import React from "react"; import ReactDOM from "react-dom/client"; import App from "./App"; import "./index.css"; ReactDOM.createRoot(document.getElementById("root")!).render(<App />);',
        'src/index.css': ':root { color: #111; }',
        'src/App.tsx': 'import { useState } from "react"; export default function App() { const [n, setN] = useState(0); return <button onClick={() => setN(n + 1)}>Add</button>; }',
        'src/components/Counter.tsx': 'import { useState } from "react"; export function Counter() { const [n, setN] = useState(0); return <input onChange={() => setN(n + 1)} value={n} />; }',
      };
    }

    it('passes beginner 5-file app with 2+ handlers', () => {
      const gate = new AcceptanceGate();
      const result = gate.validate(beginnerBaseFiles(), { beginnerMode: true });
      expect(result.valid).toBe(true);
    });

    it('fails beginner 7-file app', () => {
      const gate = new AcceptanceGate();
      const files = beginnerBaseFiles();
      files['src/components/Extra1.tsx'] = 'export const Extra1 = () => null;';
      files['src/components/Extra2.tsx'] = 'export const Extra2 = () => null;';
      const result = gate.validate(files, { beginnerMode: true });
      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(expect.objectContaining({
        type: 'beginner_constraint',
        message: expect.stringContaining('requires 4-6 files'),
      }));
    });

    it('fails beginner 3-file app', () => {
      const gate = new AcceptanceGate();
      const result = gate.validate({
        'package.json': '{"name":"app","dependencies":{}}',
        'src/main.tsx': 'import App from "./App";',
        'src/App.tsx': 'export default function App() { return <button onClick={() => {}}>x</button>; }',
      }, { beginnerMode: true });
      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(expect.objectContaining({
        type: 'beginner_constraint',
        message: expect.stringContaining('requires 4-6 files'),
      }));
    });

    it('fails beginner app with fetch() in component', () => {
      const gate = new AcceptanceGate();
      const files = beginnerBaseFiles();
      files['src/components/Counter.tsx'] = 'export function Counter() { fetch("/api"); return null; }';
      const result = gate.validate(files, { beginnerMode: true });
      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(expect.objectContaining({
        type: 'beginner_constraint',
        message: 'fetch/axios not allowed in beginner mode',
      }));
    });

    it('fails beginner app with axios import', () => {
      const gate = new AcceptanceGate();
      const files = beginnerBaseFiles();
      files['src/components/Counter.tsx'] = 'import axios from "axios"; export function Counter() { return null; }';
      const result = gate.validate(files, { beginnerMode: true });
      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(expect.objectContaining({
        type: 'beginner_constraint',
        message: 'fetch/axios not allowed in beginner mode',
      }));
    });

    it('fails beginner app with 1 event handler', () => {
      const gate = new AcceptanceGate();
      const files = beginnerBaseFiles();
      files['src/components/Counter.tsx'] = 'export function Counter() { return <div>No handlers</div>; }';
      const result = gate.validate(files, { beginnerMode: true });
      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(expect.objectContaining({
        type: 'beginner_constraint',
        message: 'Beginner mode requires 2 event handlers',
      }));
    });

    it('passes beginner app when fetch() appears in comment only', () => {
      const gate = new AcceptanceGate();
      const files = beginnerBaseFiles();
      files['src/components/Counter.tsx'] = [
        'export function Counter() {',
        '  // fetch("/api")',
        '  return <input onChange={() => {}} />;',
        '}',
      ].join('\n');
      const result = gate.validate(files, { beginnerMode: true });
      expect(result.valid).toBe(true);
    });

    it('passes non-beginner 10-file app with fetch()', () => {
      const gate = new AcceptanceGate();
      const files = beginnerBaseFiles();
      for (let i = 0; i < 5; i++) {
        files[`src/components/Extra${i}.tsx`] = `export function Extra${i}() { return <button onClick={() => {}}>ok</button>; }`;
      }
      files['src/components/Counter.tsx'] = 'export function Counter() { fetch(\"/api\"); return <button onClick={() => {}}>Go</button>; }';
      const result = gate.validate(files);
      expect(result.valid).toBe(true);
    });
  });

  describe('scoped build validation', () => {
    it('includes unchanged module dependencies when changed file imports them', () => {
      const gate = new AcceptanceGate();
      const files = {
        'package.json': '{"name":"app","dependencies":{}}',
        'src/main.tsx': 'import App from "./App";',
        'src/App.tsx': 'import { helper } from "./utils"; export default function App() { return <div>{helper()}</div>; }',
        'src/utils.ts': 'export function helper() { return "ok"; }',
      };

      const result = gate.validate(files, { changedFiles: ['src/App.tsx'] });

      expect(result.valid).toBe(true);
      expect(validateAllMock).toHaveBeenCalledTimes(1);
      const scopedFiles = validateAllMock.mock.calls[0][0] as Record<string, string>;
      expect(scopedFiles['src/App.tsx']).toBeDefined();
      expect(scopedFiles['src/utils.ts']).toBeDefined();
    });

    it('includes package.json when changed file imports an external package', () => {
      const gate = new AcceptanceGate();
      const files = {
        'package.json': '{"name":"app","dependencies":{"lodash":"^4.17.21"}}',
        'src/main.tsx': 'import App from "./App";',
        'src/App.tsx': 'import _ from "lodash"; export default function App() { return <div>{_.capitalize("ok")}</div>; }',
      };

      const result = gate.validate(files, { changedFiles: ['src/App.tsx'] });

      expect(result.valid).toBe(true);
      expect(validateAllMock).toHaveBeenCalledTimes(1);
      const scopedFiles = validateAllMock.mock.calls[0][0] as Record<string, string>;
      expect(scopedFiles['src/App.tsx']).toBeDefined();
      expect(scopedFiles['package.json']).toBeDefined();
    });
  });
});
