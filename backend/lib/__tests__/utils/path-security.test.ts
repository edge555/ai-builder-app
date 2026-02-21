/**
 * Tests for path security utilities
 */

import { describe, it, expect } from 'vitest';

import { isSafePath, validatePath } from '../../utils/path-security';

describe('path-security', () => {
  describe('isSafePath', () => {
    it('should accept valid paths with src/ prefix', () => {
      expect(isSafePath('src/components/Button.tsx')).toBe(true);
      expect(isSafePath('src/utils/helper.ts')).toBe(true);
      expect(isSafePath('src/index.tsx')).toBe(true);
    });

    it('should accept valid paths with public/ prefix', () => {
      expect(isSafePath('public/images/logo.png')).toBe(true);
      expect(isSafePath('public/index.html')).toBe(true);
    });

    it('should accept valid paths with frontend/ prefix', () => {
      expect(isSafePath('frontend/src/App.tsx')).toBe(true);
      expect(isSafePath('frontend/public/favicon.ico')).toBe(true);
    });

    it('should accept valid paths with app/ prefix', () => {
      expect(isSafePath('app/page.tsx')).toBe(true);
      expect(isSafePath('app/layout.tsx')).toBe(true);
    });

    it('should reject path traversal attempts', () => {
      expect(isSafePath('src/../../../etc/passwd')).toBe(false);
      expect(isSafePath('src/components/../../secrets.txt')).toBe(false);
      expect(isSafePath('../config.json')).toBe(false);
    });

    it('should reject absolute paths', () => {
      expect(isSafePath('/etc/passwd')).toBe(false);
      expect(isSafePath('/home/user/file.txt')).toBe(false);
    });

    it('should reject Windows absolute paths', () => {
      expect(isSafePath('C:\\Windows\\System32')).toBe(false);
      expect(isSafePath('D:\\secrets.txt')).toBe(false);
    });

    it('should reject paths with invalid characters', () => {
      expect(isSafePath('src/file<test>.txt')).toBe(false);
      expect(isSafePath('src/file|test.txt')).toBe(false);
      expect(isSafePath('src/file?.txt')).toBe(false);
    });

    it('should reject empty or invalid paths', () => {
      expect(isSafePath('')).toBe(false);
      expect(isSafePath('   ')).toBe(false);
      expect(isSafePath(null as any)).toBe(false);
      expect(isSafePath(undefined as any)).toBe(false);
    });

    it('should reject paths without valid prefix', () => {
      expect(isSafePath('components/Button.tsx')).toBe(false);
      expect(isSafePath('utils/helper.ts')).toBe(false);
      expect(isSafePath('package.json')).toBe(false);
    });
  });

  describe('validatePath', () => {
    it('should return null for valid paths', () => {
      expect(validatePath('src/components/Button.tsx')).toBeNull();
      expect(validatePath('public/images/logo.png')).toBeNull();
      expect(validatePath('frontend/src/App.tsx')).toBeNull();
    });

    it('should return error message for path traversal', () => {
      const result = validatePath('src/../../../etc/passwd');
      expect(result).toContain('traversal');
    });

    it('should return error message for absolute paths', () => {
      const result = validatePath('/etc/passwd');
      expect(result).toContain('Absolute');
    });

    it('should return error message for invalid characters', () => {
      const result = validatePath('src/file<test>.txt');
      expect(result).toContain('invalid characters');
    });

    it('should return error message for paths without valid prefix', () => {
      const result = validatePath('components/Button.tsx');
      expect(result).toContain('must start with');
    });

    it('should return error message for empty paths', () => {
      const result = validatePath('');
      expect(result).toContain('empty');
    });
  });
});
