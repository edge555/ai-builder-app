import { describe, expect, it, vi } from 'vitest';
import { AcceptanceGate } from '../acceptance-gate';

vi.mock('../build-validator', () => ({
  createBuildValidator: () => ({
    validateAll: vi.fn().mockReturnValue({ valid: true, errors: [] }),
    validateCrossFileReferences: vi.fn().mockReturnValue([]),
  }),
}));

describe('AcceptanceGate', () => {
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
});
