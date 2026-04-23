import { describe, expect, it } from 'vitest';
import { BROKEN_RUNTIME_OUTPUT, SIMPLE_COUNTER_OUTPUT } from './fixtures';
import { runRuntimeSmokeTest } from './runtime-smoke';
import { runRuntimeSmokeTest as runProductionRuntimeSmokeTest } from '../../runtime-smoke';

describe('runtime smoke harness', () => {
  it('passes a valid beginner Vite app snapshot', () => {
    const result = runRuntimeSmokeTest(
      Object.fromEntries(SIMPLE_COUNTER_OUTPUT.files.map((file) => [file.path, file.content])),
    );

    expect(result.passed).toBe(true);
    expect(result.framework).toBe('vite-react');
    expect(result.interactionSignals).toEqual(expect.arrayContaining(['button', 'onClick']));
  });

  it('fails obvious non-loading runtime snapshots', () => {
    const result = runRuntimeSmokeTest(
      Object.fromEntries(BROKEN_RUNTIME_OUTPUT.files.map((file) => [file.path, file.content])),
    );

    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.type)).toEqual(
      expect.arrayContaining(['missing_entry_render', 'missing_default_export', 'obvious_runtime_throw']),
    );
  });

  it('flags missing scripts and dependencies in production smoke checks', () => {
    const result = runRuntimeSmokeTest({
      'src/main.tsx': `import ReactDOM from 'react-dom/client'; import App from './App'; ReactDOM.createRoot(document.getElementById('root')!).render(<App />);`,
      'src/App.tsx': `export default function App() { return <button>Click</button>; }`,
      'package.json': JSON.stringify({ name: 'broken-runtime' }),
    });

    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.type)).toEqual(
      expect.arrayContaining(['missing_dependency', 'missing_script']),
    );
  });

  it('reuses the production runtime smoke implementation in eval (behavioral equivalence)', () => {
    const files = Object.fromEntries(
      SIMPLE_COUNTER_OUTPUT.files.map((file) => [file.path, file.content]),
    );
    const evalResult = runRuntimeSmokeTest(files);
    const prodResult = runProductionRuntimeSmokeTest(files);
    expect(evalResult.passed).toBe(prodResult.passed);
    expect(evalResult.framework).toBe(prodResult.framework);
    expect(evalResult.issues).toEqual(prodResult.issues);
  });
});
