/**
 * Tests for prettier-config module
 * Following industry best practices: AAA pattern, clear descriptions, edge cases
 */

import { describe, it, expect } from 'vitest';
import { formatCode } from '../prettier-config';

describe('prettier-config', () => {
  describe('formatCode', () => {
    it('should format TypeScript code correctly', async () => {
      // Arrange
      const code = 'const x=1;';
      const filePath = 'test.ts';

      // Act
      const result = await formatCode(code, filePath);

      // Assert
      expect(result).toBeDefined();
      expect(result).toContain('const x = 1;');
    });

    it('should format JavaScript code correctly', async () => {
      // Arrange
      const code = 'const x=1;';
      const filePath = 'test.js';

      // Act
      const result = await formatCode(code, filePath);

      // Assert
      expect(result).toBeDefined();
      expect(result).toContain('const x = 1;');
    });

    it('should format JSON code correctly', async () => {
      // Arrange
      const code = '{"name":"test","value":1}';
      const filePath = 'test.json';

      // Act
      const result = await formatCode(code, filePath);

      // Assert
      expect(result).toBeDefined();
      expect(result).toContain('"name": "test"');
      expect(result).toContain('"value": 1');
    });

    it('should format CSS code correctly', async () => {
      // Arrange
      const code = '.test{color:red;}';
      const filePath = 'test.css';

      // Act
      const result = await formatCode(code, filePath);

      // Assert
      expect(result).toBeDefined();
      expect(result).toContain('.test');
      expect(result).toContain('color: red;');
    });

    it('should format HTML code correctly', async () => {
      // Arrange
      const code = '<div><p>test</p></div>';
      const filePath = 'test.html';

      // Act
      const result = await formatCode(code, filePath);

      // Assert
      expect(result).toBeDefined();
      expect(result).toContain('<div>');
      expect(result).toContain('<p>test</p>');
    });

    it('should format Markdown code correctly', async () => {
      // Arrange
      const code = '# Test\n\n## Subtest';
      const filePath = 'test.md';

      // Act
      const result = await formatCode(code, filePath);

      // Assert
      expect(result).toBeDefined();
      expect(result).toContain('# Test');
      expect(result).toContain('## Subtest');
    });

    it('should return original content for unsupported file types', async () => {
      // Arrange
      const code = 'some content';
      const filePath = 'test.txt';

      // Act
      const result = await formatCode(code, filePath);

      // Assert
      expect(result).toBe(code);
    });

    it('should handle empty code', async () => {
      // Arrange
      const code = '';
      const filePath = 'test.ts';

      // Act
      const result = await formatCode(code, filePath);

      // Assert
      expect(result).toBeDefined();
    });

    it('should handle already formatted code', async () => {
      // Arrange
      const code = 'const x = 1;';
      const filePath = 'test.ts';

      // Act
      const result = await formatCode(code, filePath);

      // Assert
      expect(result).toBeDefined();
      expect(result).toContain('const x = 1;');
    });

    it('should handle malformed code gracefully', async () => {
      // Arrange
      const code = 'const x = ;';
      const filePath = 'test.ts';

      // Act
      const result = await formatCode(code, filePath);

      // Assert
      expect(result).toBeDefined();
      // Should return original content if formatting fails
      expect(result).toBe(code);
    });

    it('should use semicolons in formatted code', async () => {
      // Arrange
      const code = 'const x = 1\nconst y = 2';
      const filePath = 'test.ts';

      // Act
      const result = await formatCode(code, filePath);

      // Assert
      expect(result).toContain(';');
    });

    it('should use single quotes in formatted code', async () => {
      // Arrange
      const code = 'const x = "test";';
      const filePath = 'test.ts';

      // Act
      const result = await formatCode(code, filePath);

      // Assert
      expect(result).toContain("'");
    });

    it('should use proper indentation', async () => {
      // Arrange
      const code = 'function test(){return 1;}';
      const filePath = 'test.ts';

      // Act
      const result = await formatCode(code, filePath);

      // Assert
      expect(result).toContain('  ');
    });

    it('should handle TypeScript with JSX', async () => {
      // Arrange
      const code = 'const Test=()=><div>test</div>';
      const filePath = 'test.tsx';

      // Act
      const result = await formatCode(code, filePath);

      // Assert
      expect(result).toBeDefined();
      expect(result).toContain('<div>test</div>');
    });

    it('should handle JavaScript with JSX', async () => {
      // Arrange
      const code = 'const Test=()=><div>test</div>';
      const filePath = 'test.jsx';

      // Act
      const result = await formatCode(code, filePath);

      // Assert
      expect(result).toBeDefined();
      expect(result).toContain('<div>test</div>');
    });
  });
});
