import { describe, it, expect, vi } from 'vitest';
import {
  tryDeterministicFixes,
  extractNamedExports,
  countBrackets,
  levenshteinDistance,
  computeRelativePath,
} from '../deterministic-fixes';
import type { BuildError } from '../../core/build-validator';

// Mock logger
vi.mock('../../logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

function makeError(overrides: Partial<BuildError>): BuildError {
  return {
    type: 'missing_dependency',
    message: 'test error',
    file: 'src/App.tsx',
    severity: 'fixable',
    ...overrides,
  };
}

describe('tryDeterministicFixes', () => {
  describe('missing_dependency strategy', () => {
    it('should add known package to package.json', () => {
      const errors = [
        makeError({
          type: 'missing_dependency',
          message: "Package 'zustand' is imported but not in package.json",
          file: 'src/store.ts',
        }),
      ];
      const files = {
        'src/store.ts': "import { create } from 'zustand';",
        'package.json': '{"name":"test","dependencies":{"react":"^18.2.0"}}',
      };

      const result = tryDeterministicFixes(errors, files);

      expect(result.fixed).toHaveLength(1);
      expect(result.remaining).toHaveLength(0);
      const pkg = JSON.parse(result.fileChanges['package.json']);
      expect(pkg.dependencies.zustand).toBe('latest');
    });

    it('should use "latest" for unknown packages', () => {
      const errors = [
        makeError({
          type: 'missing_dependency',
          message: "Package 'some-obscure-lib' is imported but not in package.json",
        }),
      ];
      const files = {
        'src/App.tsx': "import something from 'some-obscure-lib';",
        'package.json': '{"name":"test","dependencies":{}}',
      };

      const result = tryDeterministicFixes(errors, files);

      expect(result.fixed).toHaveLength(1);
      const pkg = JSON.parse(result.fileChanges['package.json']);
      expect(pkg.dependencies['some-obscure-lib']).toBe('latest');
    });

    it('should skip unfixable errors (Node.js built-ins)', () => {
      const errors = [
        makeError({
          type: 'missing_dependency',
          message: "Node.js module 'fs' cannot be used in browser code",
          severity: 'unfixable',
        }),
      ];
      const files = {
        'src/App.tsx': "import fs from 'fs';",
        'package.json': '{"name":"test","dependencies":{}}',
      };

      const result = tryDeterministicFixes(errors, files);

      expect(result.fixed).toHaveLength(0);
      expect(result.remaining).toHaveLength(1);
    });

    it('should skip if package.json is malformed', () => {
      const errors = [
        makeError({
          type: 'missing_dependency',
          message: "Package 'zustand' is imported but not in package.json",
        }),
      ];
      const files = {
        'src/App.tsx': "import { create } from 'zustand';",
        'package.json': 'not valid json {{{',
      };

      const result = tryDeterministicFixes(errors, files);

      expect(result.fixed).toHaveLength(0);
      expect(result.remaining).toHaveLength(1);
    });
  });

  describe('broken_import strategy', () => {
    it('should fix import via fuzzy match (Levenshtein ≤ 2)', () => {
      const errors = [
        makeError({
          type: 'broken_import',
          message: "Cannot find module './utlis'", // typo: utlis vs utils
          file: 'src/App.tsx',
        }),
      ];
      const files = {
        'src/App.tsx': "import { helper } from './utlis';",
        'src/utils.ts': 'export const helper = () => {};',
      };

      const result = tryDeterministicFixes(errors, files);

      expect(result.fixed).toHaveLength(1);
      expect(result.fileChanges['src/App.tsx']).toContain('./utils');
    });

    it('should skip if fuzzy match is tied', () => {
      const errors = [
        makeError({
          type: 'broken_import',
          message: "Cannot find module './hlper'",
          file: 'src/App.tsx',
        }),
      ];
      const files = {
        'src/App.tsx': "import { x } from './hlper';",
        'src/helper.ts': 'export const x = 1;',
        'src/halper.ts': 'export const x = 2;',
      };

      const result = tryDeterministicFixes(errors, files);

      // Both "helper" and "halper" are distance 1 from "hlper" — tied
      expect(result.fixed).toHaveLength(0);
      expect(result.remaining).toHaveLength(1);
    });
  });

  describe('import_export_mismatch strategy', () => {
    it('should flip default to named import if unambiguous', () => {
      const errors = [
        makeError({
          type: 'import_export_mismatch',
          message: "'src/utils.ts' has no default export, but 'src/App.tsx' imports it as default (import Utils)",
          file: 'src/App.tsx',
          suggestion: "Add 'export default Utils' to 'src/utils.ts', or change to a named import: import { Utils } from './utils'",
        }),
      ];
      const files = {
        'src/App.tsx': "import Utils from './utils';\nconst x = Utils();",
        'src/utils.ts': 'export const Utils = () => "hello";',
      };

      const result = tryDeterministicFixes(errors, files);

      expect(result.fixed).toHaveLength(1);
      expect(result.fileChanges['src/App.tsx']).toContain('{ Utils }');
      expect(result.fileChanges['src/App.tsx']).not.toContain('import Utils from');
    });

    it('should skip if export name is ambiguous', () => {
      const errors = [
        makeError({
          type: 'import_export_mismatch',
          message: "'src/utils.ts' has no default export, but 'src/App.tsx' imports it as default (import Foo)",
          file: 'src/App.tsx',
          suggestion: "Add 'export default Foo' to 'src/utils.ts', or change to a named import: import { Foo } from './utils'",
        }),
      ];
      const files = {
        'src/App.tsx': "import Foo from './utils';\nconst x = Foo();",
        'src/utils.ts': 'export const Bar = () => "hello";', // No matching export
      };

      const result = tryDeterministicFixes(errors, files);

      expect(result.fixed).toHaveLength(0);
      expect(result.remaining).toHaveLength(1);
    });
  });

  describe('syntax_error strategy', () => {
    it('should append missing closing brace at EOF', () => {
      const errors = [
        makeError({
          type: 'syntax_error',
          message: 'Unexpected end of file — unclosed brace',
          file: 'src/App.tsx',
        }),
      ];
      const files = {
        'src/App.tsx': 'function App() {\n  return <div>hello</div>;\n',
      };

      const result = tryDeterministicFixes(errors, files);

      expect(result.fixed).toHaveLength(1);
      expect(result.fileChanges['src/App.tsx']).toContain('}');
    });

    it('should skip if bracket is inside a string', () => {
      const errors = [
        makeError({
          type: 'syntax_error',
          message: 'Unexpected end of file — unclosed brace',
          file: 'src/App.tsx',
        }),
      ];
      // This code has balanced brackets — the "extra" open brace is inside a string
      const files = {
        'src/App.tsx': 'const x = "{";\nconst y = 1;',
      };

      const result = tryDeterministicFixes(errors, files);

      // Brackets are balanced when string contents are excluded
      expect(result.fixed).toHaveLength(0);
    });

    it('should skip non-unclosed errors', () => {
      const errors = [
        makeError({
          type: 'syntax_error',
          message: 'Unexpected token ;',
          file: 'src/App.tsx',
        }),
      ];
      const files = {
        'src/App.tsx': 'const x = ;',
      };

      const result = tryDeterministicFixes(errors, files);

      expect(result.fixed).toHaveLength(0);
      expect(result.remaining).toHaveLength(1);
    });
  });
});

describe('extractNamedExports', () => {
  it('should extract function exports', () => {
    const exports = extractNamedExports('export function hello() {}\nexport const world = 1;');
    expect(exports).toContain('hello');
    expect(exports).toContain('world');
  });

  it('should extract brace exports', () => {
    const exports = extractNamedExports('const a = 1;\nconst b = 2;\nexport { a, b };');
    expect(exports).toContain('a');
    expect(exports).toContain('b');
  });

  it('should handle "as" aliases', () => {
    const exports = extractNamedExports('export { foo as bar };');
    expect(exports).toContain('bar');
    expect(exports).not.toContain('foo');
  });

  it('should skip default in braces', () => {
    const exports = extractNamedExports('export { App as default };');
    expect(exports).not.toContain('default');
  });
});

describe('countBrackets', () => {
  it('should count unmatched braces', () => {
    expect(countBrackets('{ { }')).toEqual({ braces: 1, parens: 0, brackets: 0 });
  });

  it('should ignore brackets in strings', () => {
    expect(countBrackets('const x = "{";')).toEqual({ braces: 0, parens: 0, brackets: 0 });
  });

  it('should ignore brackets in comments', () => {
    expect(countBrackets('// {\nconst x = 1;')).toEqual({ braces: 0, parens: 0, brackets: 0 });
  });

  it('should ignore brackets in block comments', () => {
    expect(countBrackets('/* { */ const x = 1;')).toEqual({ braces: 0, parens: 0, brackets: 0 });
  });

  it('should ignore brackets in template literals', () => {
    expect(countBrackets('const x = `{`;')).toEqual({ braces: 0, parens: 0, brackets: 0 });
  });
});

describe('levenshteinDistance', () => {
  it('should return 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
  });

  it('should return correct distance for single edit', () => {
    expect(levenshteinDistance('utils', 'utlis')).toBe(2); // transposition = 2 edits
  });

  it('should handle empty strings', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
  });
});

describe('computeRelativePath', () => {
  it('should compute same-directory path', () => {
    expect(computeRelativePath('src/App.tsx', 'src/utils.ts')).toBe('./utils');
  });

  it('should compute parent-directory path', () => {
    expect(computeRelativePath('src/components/Button.tsx', 'src/utils.ts')).toBe('../utils');
  });

  it('should compute nested path', () => {
    expect(computeRelativePath('src/App.tsx', 'src/components/Button.tsx')).toBe('./components/Button');
  });
});
