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
    { desc: 'implement this file', content: 'export default function App() { return "implement this file"; }' },
  ])('rejects "$desc" placeholder in src/App.tsx', ({ content }) => {
    const gate = new AcceptanceGate();
    const result = gate.validate({ 'src/App.tsx': content, 'package.json': '{"name":"app","dependencies":{}}' });
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ type: 'placeholder_content', file: 'src/App.tsx' }));
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
