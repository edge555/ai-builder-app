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
