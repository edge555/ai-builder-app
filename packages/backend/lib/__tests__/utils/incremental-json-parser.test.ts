/**
 * Tests for Incremental JSON Parser
 */

import { describe, it, expect } from 'vitest';
import {
  parseIncrementalFiles,
  estimateTotalFiles,
  isResponseComplete,
} from '../../utils/incremental-json-parser';

describe('parseIncrementalFiles', () => {
  it('should parse a single complete file object', () => {
    const json = '{"path":"src/App.tsx","content":"export default function App() {}"}';
    const result = parseIncrementalFiles(json);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('src/App.tsx');
    expect(result.files[0].content).toBe('export default function App() {}');
  });

  it('should parse multiple complete file objects', () => {
    const json = '{"path":"src/App.tsx","content":"app"}{"path":"src/index.tsx","content":"index"}';
    const result = parseIncrementalFiles(json);

    expect(result.files).toHaveLength(2);
    expect(result.files[0].path).toBe('src/App.tsx');
    expect(result.files[1].path).toBe('src/index.tsx');
  });

  it('should handle escaped quotes in content', () => {
    const json = '{"path":"src/App.tsx","content":"const msg = \\"hello\\";"}';
    const result = parseIncrementalFiles(json);

    expect(result.files).toHaveLength(1);
    // JSON.parse automatically unescapes, so the result will have actual quotes
    expect(result.files[0].content).toBe('const msg = "hello";');
  });

  it('should handle nested braces in content', () => {
    const json = '{"path":"src/App.tsx","content":"function App() { return {}; }"}';
    const result = parseIncrementalFiles(json);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].content).toBe('function App() { return {}; }');
  });

  it('should stop at incomplete objects', () => {
    const json = '{"path":"src/App.tsx","content":"app"}{"path":"src/index.tsx","content":"ind';
    const result = parseIncrementalFiles(json);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('src/App.tsx');
  });

  it('should resume parsing from lastParsedIndex', () => {
    const json = '{"path":"src/App.tsx","content":"app"}{"path":"src/index.tsx","content":"index"}';
    
    // First parse
    const result1 = parseIncrementalFiles(json, 0);
    expect(result1.files).toHaveLength(2);
    
    // Resume from where we left off (should find nothing new)
    const result2 = parseIncrementalFiles(json, result1.lastParsedIndex);
    expect(result2.files).toHaveLength(0);
  });

  it('should handle empty or invalid JSON', () => {
    const result = parseIncrementalFiles('');
    expect(result.files).toHaveLength(0);
    
    const result2 = parseIncrementalFiles('invalid json');
    expect(result2.files).toHaveLength(0);
  });

  it('should skip objects without required fields', () => {
    const json = '{"path":"src/App.tsx"}{"path":"src/index.tsx","content":"index"}';
    const result = parseIncrementalFiles(json);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('src/index.tsx');
  });
});

describe('estimateTotalFiles', () => {
  it('should count file objects', () => {
    const json = '{"path":"src/App.tsx","content":"app"}{"path":"src/index.tsx","content":"index"}';
    const count = estimateTotalFiles(json);
    expect(count).toBe(2);
  });

  it('should count partial file objects', () => {
    const json = '{"path":"src/App.tsx","content":"app"}{"path":"src/index.tsx","content":"ind';
    const count = estimateTotalFiles(json);
    expect(count).toBe(2);
  });

  it('should return 0 for empty string', () => {
    const count = estimateTotalFiles('');
    expect(count).toBe(0);
  });
});

describe('isResponseComplete', () => {
  it('should return true for complete JSON', () => {
    const json = '{"files":[{"path":"src/App.tsx","content":"app"}]}';
    expect(isResponseComplete(json)).toBe(true);
  });

  it('should return false for incomplete JSON', () => {
    const json = '{"files":[{"path":"src/App.tsx","content":"app"}';
    expect(isResponseComplete(json)).toBe(false);
  });

  it('should return false for JSON not ending with }', () => {
    const json = '{"files":[{"path":"src/App.tsx","content":"app"}]},';
    expect(isResponseComplete(json)).toBe(false);
  });

  it('should handle empty string', () => {
    expect(isResponseComplete('')).toBe(false);
  });
});
