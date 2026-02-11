/**
 * Tests for Diff Utilities
 * Validates the LCS-based diff algorithm for computing file changes.
 */

import { describe, it, expect } from 'vitest';
import { computeLineHunks, buildLCSTable } from '../../core/diff-utils';

describe('diff-utils', () => {
  describe('computeLineHunks', () => {
    it('should handle empty files', () => {
      const hunks = computeLineHunks([], []);
      expect(hunks).toHaveLength(0);
    });

    it('should handle adding content to empty file', () => {
      const oldLines: string[] = [];
      const newLines = ['line1', 'line2', 'line3'];

      const hunks = computeLineHunks(oldLines, newLines);

      expect(hunks).toHaveLength(1);
      expect(hunks[0].oldStart).toBe(1);
      expect(hunks[0].oldLines).toBe(0);
      expect(hunks[0].newStart).toBe(1);
      expect(hunks[0].newLines).toBe(3);

      const changes = hunks[0].changes;
      expect(changes).toHaveLength(3);
      expect(changes.every(c => c.type === 'add')).toBe(true);
      expect(changes[0].content).toBe('line1');
      expect(changes[0].lineNumber).toBe(1);
      expect(changes[1].content).toBe('line2');
      expect(changes[1].lineNumber).toBe(2);
      expect(changes[2].content).toBe('line3');
      expect(changes[2].lineNumber).toBe(3);
    });

    it('should handle deleting all content', () => {
      const oldLines = ['line1', 'line2', 'line3'];
      const newLines: string[] = [];

      const hunks = computeLineHunks(oldLines, newLines);

      expect(hunks).toHaveLength(1);
      expect(hunks[0].oldStart).toBe(1);
      expect(hunks[0].oldLines).toBe(3);
      expect(hunks[0].newStart).toBe(1);
      expect(hunks[0].newLines).toBe(0);

      const changes = hunks[0].changes;
      expect(changes).toHaveLength(3);
      expect(changes.every(c => c.type === 'delete')).toBe(true);
      expect(changes[0].content).toBe('line1');
      expect(changes[0].lineNumber).toBe(1);
    });

    it('should handle identical files (no changes)', () => {
      const lines = ['line1', 'line2', 'line3'];
      const hunks = computeLineHunks(lines, lines);
      expect(hunks).toHaveLength(0);
    });

    it('should correctly identify a single line change', () => {
      const oldLines = ['line1', 'old content', 'line3'];
      const newLines = ['line1', 'new content', 'line3'];

      const hunks = computeLineHunks(oldLines, newLines);

      expect(hunks).toHaveLength(1);
      
      const changes = hunks[0].changes;
      const deleteChanges = changes.filter(c => c.type === 'delete');
      const addChanges = changes.filter(c => c.type === 'add');
      
      expect(deleteChanges).toHaveLength(1);
      expect(deleteChanges[0].content).toBe('old content');
      expect(deleteChanges[0].lineNumber).toBe(2);
      
      expect(addChanges).toHaveLength(1);
      expect(addChanges[0].content).toBe('new content');
      expect(addChanges[0].lineNumber).toBe(2);
    });

    it('should handle line insertion at the beginning', () => {
      const oldLines = ['line2', 'line3'];
      const newLines = ['line1', 'line2', 'line3'];

      const hunks = computeLineHunks(oldLines, newLines);

      expect(hunks).toHaveLength(1);
      
      const addChanges = hunks[0].changes.filter(c => c.type === 'add');
      expect(addChanges).toHaveLength(1);
      expect(addChanges[0].content).toBe('line1');
      expect(addChanges[0].lineNumber).toBe(1);
    });

    it('should handle line insertion in the middle', () => {
      const oldLines = ['line1', 'line3'];
      const newLines = ['line1', 'line2', 'line3'];

      const hunks = computeLineHunks(oldLines, newLines);

      expect(hunks).toHaveLength(1);
      
      const addChanges = hunks[0].changes.filter(c => c.type === 'add');
      expect(addChanges).toHaveLength(1);
      expect(addChanges[0].content).toBe('line2');
      expect(addChanges[0].lineNumber).toBe(2);
    });

    it('should handle line insertion at the end', () => {
      const oldLines = ['line1', 'line2'];
      const newLines = ['line1', 'line2', 'line3'];

      const hunks = computeLineHunks(oldLines, newLines);

      expect(hunks).toHaveLength(1);
      
      const addChanges = hunks[0].changes.filter(c => c.type === 'add');
      expect(addChanges).toHaveLength(1);
      expect(addChanges[0].content).toBe('line3');
      expect(addChanges[0].lineNumber).toBe(3);
    });

    it('should handle line deletion at the beginning', () => {
      const oldLines = ['line1', 'line2', 'line3'];
      const newLines = ['line2', 'line3'];

      const hunks = computeLineHunks(oldLines, newLines);

      expect(hunks).toHaveLength(1);
      
      const deleteChanges = hunks[0].changes.filter(c => c.type === 'delete');
      expect(deleteChanges).toHaveLength(1);
      expect(deleteChanges[0].content).toBe('line1');
      expect(deleteChanges[0].lineNumber).toBe(1);
    });

    it('should handle line deletion in the middle', () => {
      const oldLines = ['line1', 'line2', 'line3'];
      const newLines = ['line1', 'line3'];

      const hunks = computeLineHunks(oldLines, newLines);

      expect(hunks).toHaveLength(1);
      
      const deleteChanges = hunks[0].changes.filter(c => c.type === 'delete');
      expect(deleteChanges).toHaveLength(1);
      expect(deleteChanges[0].content).toBe('line2');
      expect(deleteChanges[0].lineNumber).toBe(2);
    });

    it('should handle line deletion at the end', () => {
      const oldLines = ['line1', 'line2', 'line3'];
      const newLines = ['line1', 'line2'];

      const hunks = computeLineHunks(oldLines, newLines);

      expect(hunks).toHaveLength(1);
      
      const deleteChanges = hunks[0].changes.filter(c => c.type === 'delete');
      expect(deleteChanges).toHaveLength(1);
      expect(deleteChanges[0].content).toBe('line3');
      expect(deleteChanges[0].lineNumber).toBe(3);
    });

    it('should handle multiple consecutive changes', () => {
      const oldLines = ['line1', 'old2', 'old3', 'line4'];
      const newLines = ['line1', 'new2', 'new3', 'line4'];

      const hunks = computeLineHunks(oldLines, newLines);

      expect(hunks).toHaveLength(1);
      
      const deleteChanges = hunks[0].changes.filter(c => c.type === 'delete');
      const addChanges = hunks[0].changes.filter(c => c.type === 'add');
      
      expect(deleteChanges).toHaveLength(2);
      expect(deleteChanges[0].content).toBe('old2');
      expect(deleteChanges[1].content).toBe('old3');
      
      expect(addChanges).toHaveLength(2);
      expect(addChanges[0].content).toBe('new2');
      expect(addChanges[1].content).toBe('new3');
    });

    it('should split into multiple hunks when changes are far apart', () => {
      // Create a file with 10 lines, change line 2 and line 9
      const oldLines = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
      const newLines = ['a', 'B', 'c', 'd', 'e', 'f', 'g', 'h', 'I', 'j'];

      const hunks = computeLineHunks(oldLines, newLines);

      // With 3 lines of context, changes at line 2 and 9 should be in separate hunks
      expect(hunks.length).toBeGreaterThanOrEqual(2);
    });

    it('should have correct hunk metadata for added lines', () => {
      // When only adding lines, oldLines count should be just context
      const oldLines = ['line1', 'line2'];
      const newLines = ['line1', 'new line', 'line2'];

      const hunks = computeLineHunks(oldLines, newLines);

      expect(hunks).toHaveLength(1);
      // Should have context lines + 0 old-only lines
      // and context lines + 1 new-only line
      expect(hunks[0].newLines).toBe(hunks[0].oldLines + 1);
    });

    it('should have correct hunk metadata for deleted lines', () => {
      const oldLines = ['line1', 'deleted line', 'line2'];
      const newLines = ['line1', 'line2'];

      const hunks = computeLineHunks(oldLines, newLines);

      expect(hunks).toHaveLength(1);
      // Should have context lines + 1 old-only line
      // and context lines + 0 new-only lines
      expect(hunks[0].oldLines).toBe(hunks[0].newLines + 1);
    });

    it('should handle complex real-world change (function modification)', () => {
      const oldLines = [
        'function hello() {',
        '  console.log("Hello");',
        '}',
      ];
      const newLines = [
        'function hello() {',
        '  console.log("Hello, World!");',
        '  return true;',
        '}',
      ];

      const hunks = computeLineHunks(oldLines, newLines);

      expect(hunks).toHaveLength(1);
      
      // Should delete the old console.log line
      const deleteChanges = hunks[0].changes.filter(c => c.type === 'delete');
      expect(deleteChanges.some(c => c.content.includes('console.log("Hello")'))).toBe(true);
      
      // Should add the new console.log and return lines
      const addChanges = hunks[0].changes.filter(c => c.type === 'add');
      expect(addChanges.some(c => c.content.includes('console.log("Hello, World!")'))).toBe(true);
      expect(addChanges.some(c => c.content.includes('return true'))).toBe(true);
    });
    it('should handle small changes without marking whole file as added', () => {
      const oldLines = [
        "import React from 'react';",
        "",
        "export const Button = () => {",
        "  return <button>Equal</button>;",
        "};"
      ];
      const newLines = [
        "import React, { useState } from 'react';",
        "",
        "export const Button = () => {",
        "  return <button style={{ backgroundColor: 'green' }}>Equal</button>;",
        "};"
      ];

      const hunks = computeLineHunks(oldLines, newLines);

      expect(hunks).toHaveLength(1);
      const changes = hunks[0].changes;
      
      // Check that it's a modification, not a full replacement
      const contextLines = changes.filter(c => c.type === 'context');
      expect(contextLines.length).toBeGreaterThan(0);
      
      // Check specific changes
      const addLines = changes.filter(c => c.type === 'add').map(c => c.content);
      const deleteLines = changes.filter(c => c.type === 'delete').map(c => c.content);
      
      expect(addLines).toContain("import React, { useState } from 'react';");
      expect(deleteLines).toContain("import React from 'react';");
      expect(addLines).toContain("  return <button style={{ backgroundColor: 'green' }}>Equal</button>;");
      expect(deleteLines).toContain("  return <button>Equal</button>;");
    });

    it('should handle whitespace-only differences as context', () => {
      const oldLines = ["  line1"];
      const newLines = ["line1"];

      const hunks = computeLineHunks(oldLines, newLines);
      
      // Should treat as context because of .trim() comparison
      expect(hunks).toHaveLength(0);
    });
  });

  describe('buildLCSTable', () => {
    it('should build correct LCS table for identical arrays', () => {
      const lines = ['a', 'b', 'c'];
      const lcs = buildLCSTable(lines, lines);
      
      // LCS should be the length of the array at [m][n]
      expect(lcs[3][3]).toBe(3);
    });

    it('should build correct LCS table for completely different arrays', () => {
      const oldLines = ['a', 'b', 'c'];
      const newLines = ['x', 'y', 'z'];
      const lcs = buildLCSTable(oldLines, newLines);
      
      // LCS should be 0
      expect(lcs[3][3]).toBe(0);
    });

    it('should build correct LCS table for partial overlap', () => {
      const oldLines = ['a', 'b', 'c'];
      const newLines = ['a', 'x', 'c'];
      const lcs = buildLCSTable(oldLines, newLines);
      
      // LCS should be 2 (a and c are common)
      expect(lcs[3][3]).toBe(2);
    });
  });
});
