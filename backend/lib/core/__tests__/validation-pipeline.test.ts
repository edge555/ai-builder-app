/**
 * Tests for validation-pipeline module
 * Following industry best practices: AAA pattern, clear descriptions, edge cases, proper mocking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ValidationPipeline } from '../validation-pipeline';

// Mock the logger
vi.mock('../../logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock the validators
vi.mock('../validators', () => ({
  validateJsonStructure: vi.fn(),
  validateFilePaths: vi.fn(),
  detectForbiddenPatterns: vi.fn(),
  validateSyntax: vi.fn(),
  validateCssSyntax: vi.fn(),
  validateCssClassConsistency: vi.fn(),
  validateProjectQuality: vi.fn(),
  validateFileSizes: vi.fn(),
  validateProjectStructure: vi.fn(),
  parseAIOutput: vi.fn(),
}));

import {
  validateJsonStructure,
  validateFilePaths,
  detectForbiddenPatterns,
  validateSyntax,
  validateCssSyntax,
  validateCssClassConsistency,
  validateProjectQuality,
  validateFileSizes,
  validateProjectStructure,
  parseAIOutput,
} from '../validators';

describe('ValidationPipeline class', () => {
  let pipeline: ValidationPipeline;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateCssSyntax).mockReturnValue([]);
    vi.mocked(validateCssClassConsistency).mockReturnValue([]);
    pipeline = new ValidationPipeline();
  });

  describe('validate method', () => {
    it('should call internal validation logic', () => {
      // Arrange
      const aiOutput = { 'file.ts': 'content' };
      vi.mocked(validateJsonStructure).mockReturnValue([]);
      vi.mocked(validateProjectStructure).mockReturnValue([]);
      vi.mocked(validateFilePaths).mockReturnValue([]);
      vi.mocked(validateFileSizes).mockReturnValue([]);
      vi.mocked(detectForbiddenPatterns).mockReturnValue([]);
      vi.mocked(validateSyntax).mockReturnValue([]);
      vi.mocked(validateCssSyntax).mockReturnValue([]);
      vi.mocked(validateProjectQuality).mockReturnValue([]);
      vi.mocked(validateCssClassConsistency).mockReturnValue([]);

      // Act
      const result = pipeline.validate(aiOutput);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should validate in correct order', () => {
      // Arrange
      const aiOutput = { 'file.ts': 'content' };
      vi.mocked(validateJsonStructure).mockReturnValue([]);
      vi.mocked(validateProjectStructure).mockReturnValue([]);
      vi.mocked(validateFilePaths).mockReturnValue([]);
      vi.mocked(validateFileSizes).mockReturnValue([]);
      vi.mocked(detectForbiddenPatterns).mockReturnValue([]);
      vi.mocked(validateSyntax).mockReturnValue([]);
      vi.mocked(validateCssSyntax).mockReturnValue([]);
      vi.mocked(validateProjectQuality).mockReturnValue([]);
      vi.mocked(validateCssClassConsistency).mockReturnValue([]);

      // Act
      pipeline.validate(aiOutput);

      // Assert
      expect(validateJsonStructure).toHaveBeenCalled();
      expect(validateProjectStructure).toHaveBeenCalled();
      expect(validateFilePaths).toHaveBeenCalled();
      expect(validateFileSizes).toHaveBeenCalled();
      expect(detectForbiddenPatterns).toHaveBeenCalled();
      expect(validateSyntax).toHaveBeenCalled();
      expect(validateCssSyntax).toHaveBeenCalled();
      expect(validateProjectQuality).toHaveBeenCalled();
      expect(validateCssClassConsistency).toHaveBeenCalled();

      // Check order
      const calls = [
        validateJsonStructure,
        validateProjectStructure,
        validateFilePaths,
        validateFileSizes,
        detectForbiddenPatterns,
        validateSyntax,
        validateCssSyntax,
        validateProjectQuality,
        validateCssClassConsistency,
      ];
      for (let i = 1; i < calls.length; i++) {
        const prevCallOrder = vi.mocked(calls[i - 1]).mock.invocationCallOrder[0];
        const currCallOrder = vi.mocked(calls[i]).mock.invocationCallOrder[0];
        expect(prevCallOrder).toBeLessThan(currCallOrder);
      }
    });

    it('should return invalid result for validation errors', () => {
      // Arrange
      const aiOutput = { 'file.ts': 'content' };
      vi.mocked(validateJsonStructure).mockReturnValue([
        { type: 'invalid_json', message: 'Invalid JSON structure' },
      ] as ReturnType<typeof validateJsonStructure>);

      // Act
      const result = pipeline.validate(aiOutput);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it('should return valid result with warnings', () => {
      // Arrange
      const aiOutput = { 'file.ts': 'content' };
      const warnings = [
        { type: 'architecture_warning', message: 'Quality warning 1' },
        { type: 'styling_warning', message: 'Quality warning 2' },
      ] as ReturnType<typeof validateProjectQuality>;
      vi.mocked(validateJsonStructure).mockReturnValue([]);
      vi.mocked(validateProjectStructure).mockReturnValue([]);
      vi.mocked(validateFilePaths).mockReturnValue([]);
      vi.mocked(validateFileSizes).mockReturnValue([]);
      vi.mocked(detectForbiddenPatterns).mockReturnValue([]);
      vi.mocked(validateSyntax).mockReturnValue([]);
      vi.mocked(validateCssSyntax).mockReturnValue([]);
      vi.mocked(validateProjectQuality).mockReturnValue(warnings);
      vi.mocked(validateCssClassConsistency).mockReturnValue([]);

      // Act
      const result = pipeline.validate(aiOutput);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual(warnings);
    });

    it('should include CSS class consistency warnings in final warnings', () => {
      // Arrange
      const aiOutput = { 'file.ts': 'content' };
      const qualityWarnings = [
        { type: 'architecture_warning', message: 'Quality warning 1' },
      ] as ReturnType<typeof validateProjectQuality>;
      const cssWarnings = [
        { type: 'styling_warning', message: 'className "missing" was not found in CSS selectors' },
      ] as ReturnType<typeof validateCssClassConsistency>;
      vi.mocked(validateJsonStructure).mockReturnValue([]);
      vi.mocked(validateProjectStructure).mockReturnValue([]);
      vi.mocked(validateFilePaths).mockReturnValue([]);
      vi.mocked(validateFileSizes).mockReturnValue([]);
      vi.mocked(detectForbiddenPatterns).mockReturnValue([]);
      vi.mocked(validateSyntax).mockReturnValue([]);
      vi.mocked(validateCssSyntax).mockReturnValue([]);
      vi.mocked(validateProjectQuality).mockReturnValue(qualityWarnings);
      vi.mocked(validateCssClassConsistency).mockReturnValue(cssWarnings);

      // Act
      const result = pipeline.validate(aiOutput);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([...qualityWarnings, ...cssWarnings]);
    });
  });

  describe('parseAndValidate method', () => {
    it('should parse and validate valid JSON string', () => {
      // Arrange
      const rawOutput = JSON.stringify({ 'file.ts': 'content' });
      vi.mocked(parseAIOutput).mockReturnValue({
        success: true,
        data: { 'file.ts': 'content' },
      });
      vi.mocked(validateJsonStructure).mockReturnValue([]);
      vi.mocked(validateProjectStructure).mockReturnValue([]);
      vi.mocked(validateFilePaths).mockReturnValue([]);
      vi.mocked(validateFileSizes).mockReturnValue([]);
      vi.mocked(detectForbiddenPatterns).mockReturnValue([]);
      vi.mocked(validateSyntax).mockReturnValue([]);
      vi.mocked(validateProjectQuality).mockReturnValue([]);

      // Act
      const result = pipeline.parseAndValidate(rawOutput);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.parseError).toBeUndefined();
      expect(parseAIOutput).toHaveBeenCalledWith(rawOutput);
    });

    it('should return parse error for invalid JSON', () => {
      // Arrange
      const rawOutput = 'invalid json';
      vi.mocked(parseAIOutput).mockReturnValue({
        success: false,
        error: 'Unexpected token',
      });

      // Act
      const result = pipeline.parseAndValidate(rawOutput);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.parseError).toBe('Unexpected token');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('invalid_json');
    });

    it('should return parse error with custom message', () => {
      // Arrange
      const rawOutput = 'invalid json';
      vi.mocked(parseAIOutput).mockReturnValue({
        success: false,
        error: 'Custom parse error',
      });

      // Act
      const result = pipeline.parseAndValidate(rawOutput);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.parseError).toBe('Custom parse error');
    });

    it('should return parse error without message', () => {
      // Arrange
      const rawOutput = 'invalid json';
      vi.mocked(parseAIOutput).mockReturnValue({
        success: false,
        error: undefined,
      });

      // Act
      const result = pipeline.parseAndValidate(rawOutput);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.parseError).toBeUndefined();
      expect(result.errors[0].message).toBe('Failed to parse AI output');
    });

    it('should validate after successful parse', () => {
      // Arrange
      const rawOutput = JSON.stringify({ 'file.ts': 'content' });
      vi.mocked(parseAIOutput).mockReturnValue({
        success: true,
        data: { 'file.ts': 'content' },
      });
      vi.mocked(validateJsonStructure).mockReturnValue([]);
      vi.mocked(validateProjectStructure).mockReturnValue([]);
      vi.mocked(validateFilePaths).mockReturnValue([]);
      vi.mocked(validateFileSizes).mockReturnValue([]);
      vi.mocked(detectForbiddenPatterns).mockReturnValue([]);
      vi.mocked(validateSyntax).mockReturnValue([]);
      vi.mocked(validateProjectQuality).mockReturnValue([]);

      // Act
      const result = pipeline.parseAndValidate(rawOutput);

      // Assert
      expect(result.valid).toBe(true);
      expect(validateJsonStructure).toHaveBeenCalled();
    });

    it('should not validate after failed parse', () => {
      // Arrange
      const rawOutput = 'invalid json';
      vi.mocked(parseAIOutput).mockReturnValue({
        success: false,
        error: 'Parse error',
      });

      // Act
      const result = pipeline.parseAndValidate(rawOutput);

      // Assert
      expect(result.valid).toBe(false);
      expect(validateJsonStructure).not.toHaveBeenCalled();
    });
  });

  describe('edge cases for ValidationPipeline', () => {
    it('should handle empty JSON string', () => {
      // Arrange
      const rawOutput = '{}';
      vi.mocked(parseAIOutput).mockReturnValue({
        success: true,
        data: {},
      });
      vi.mocked(validateJsonStructure).mockReturnValue([]);
      vi.mocked(validateProjectStructure).mockReturnValue([]);
      vi.mocked(validateFilePaths).mockReturnValue([]);
      vi.mocked(validateFileSizes).mockReturnValue([]);
      vi.mocked(detectForbiddenPatterns).mockReturnValue([]);
      vi.mocked(validateSyntax).mockReturnValue([]);
      vi.mocked(validateProjectQuality).mockReturnValue([]);

      // Act
      const result = pipeline.parseAndValidate(rawOutput);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.sanitizedOutput).toEqual({});
    });

    it('should handle JSON with many files', () => {
      // Arrange
      const files: Record<string, string> = {};
      for (let i = 0; i < 50; i++) {
        files[`file${i}.ts`] = `content${i}`;
      }
      const rawOutput = JSON.stringify(files);
      vi.mocked(parseAIOutput).mockReturnValue({
        success: true,
        data: files,
      });
      vi.mocked(validateJsonStructure).mockReturnValue([]);
      vi.mocked(validateProjectStructure).mockReturnValue([]);
      vi.mocked(validateFilePaths).mockReturnValue([]);
      vi.mocked(validateFileSizes).mockReturnValue([]);
      vi.mocked(detectForbiddenPatterns).mockReturnValue([]);
      vi.mocked(validateSyntax).mockReturnValue([]);
      vi.mocked(validateProjectQuality).mockReturnValue([]);

      // Act
      const result = pipeline.parseAndValidate(rawOutput);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.sanitizedOutput).toEqual(files);
    });

    it('should handle JSON with unicode content', () => {
      // Arrange
      const files = { 'file.ts': 'Hello 世界 🌍' };
      const rawOutput = JSON.stringify(files);
      vi.mocked(parseAIOutput).mockReturnValue({
        success: true,
        data: files,
      });
      vi.mocked(validateJsonStructure).mockReturnValue([]);
      vi.mocked(validateProjectStructure).mockReturnValue([]);
      vi.mocked(validateFilePaths).mockReturnValue([]);
      vi.mocked(validateFileSizes).mockReturnValue([]);
      vi.mocked(detectForbiddenPatterns).mockReturnValue([]);
      vi.mocked(validateSyntax).mockReturnValue([]);
      vi.mocked(validateProjectQuality).mockReturnValue([]);

      // Act
      const result = pipeline.parseAndValidate(rawOutput);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.sanitizedOutput).toEqual(files);
    });

    it('should handle very large JSON string', () => {
      // Arrange
      const largeContent = 'x'.repeat(100000);
      const files = { 'file.ts': largeContent };
      const rawOutput = JSON.stringify(files);
      vi.mocked(parseAIOutput).mockReturnValue({
        success: true,
        data: files,
      });
      vi.mocked(validateJsonStructure).mockReturnValue([]);
      vi.mocked(validateProjectStructure).mockReturnValue([]);
      vi.mocked(validateFilePaths).mockReturnValue([]);
      vi.mocked(validateFileSizes).mockReturnValue([]);
      vi.mocked(detectForbiddenPatterns).mockReturnValue([]);
      vi.mocked(validateSyntax).mockReturnValue([]);
      vi.mocked(validateProjectQuality).mockReturnValue([]);

      // Act
      const result = pipeline.parseAndValidate(rawOutput);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.sanitizedOutput).toEqual(files);
    });
  });
});
