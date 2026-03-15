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

    it('should accept root-level files (no prefix required)', () => {
      expect(isSafePath('package.json')).toBe(true);
      expect(isSafePath('index.html')).toBe(true);
      expect(isSafePath('tsconfig.json')).toBe(true);
      expect(isSafePath('vite.config.ts')).toBe(true);
    });

    it('should accept paths with any directory prefix', () => {
      expect(isSafePath('components/Button.tsx')).toBe(true);
      expect(isSafePath('utils/helper.ts')).toBe(true);
      expect(isSafePath('hooks/useAuth.ts')).toBe(true);
      expect(isSafePath('styles/main.css')).toBe(true);
      expect(isSafePath('lib/api.ts')).toBe(true);
      expect(isSafePath('pages/Home.tsx')).toBe(true);
    });

    it('should reject path traversal attempts', () => {
      expect(isSafePath('src/../../../etc/passwd')).toBe(false);
      expect(isSafePath('src/components/../../secrets.txt')).toBe(false);
      expect(isSafePath('../config.json')).toBe(false);
      expect(isSafePath('foo/../bar')).toBe(false);
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
      expect(isSafePath('file\x00name')).toBe(false);
    });

    it('should reject empty or invalid paths', () => {
      expect(isSafePath('')).toBe(false);
      expect(isSafePath('   ')).toBe(false);
      expect(isSafePath(null as any)).toBe(false);
      expect(isSafePath(undefined as any)).toBe(false);
    });

    it('should reject blocked directory paths', () => {
      expect(isSafePath('node_modules/react/index.js')).toBe(false);
      expect(isSafePath('node_modules/foo')).toBe(false);
      expect(isSafePath('.git/config')).toBe(false);
      expect(isSafePath('.git/HEAD')).toBe(false);
      expect(isSafePath('.github/workflows/ci.yml')).toBe(false);
      expect(isSafePath('__pycache__/mod.pyc')).toBe(false);
    });

    it('should reject .env files and variants', () => {
      expect(isSafePath('.env')).toBe(false);
      expect(isSafePath('.env.local')).toBe(false);
      expect(isSafePath('.env.production')).toBe(false);
      expect(isSafePath('.env.development')).toBe(false);
    });

    it('should reject blocked directories nested in paths', () => {
      expect(isSafePath('src/node_modules/foo.js')).toBe(false);
      expect(isSafePath('lib/.git/config')).toBe(false);
    });

    it('should accept paths that contain blocked names as substrings', () => {
      // "environment" contains "env" but should not be blocked
      expect(isSafePath('src/environment.ts')).toBe(true);
      // "git-helper" starts with "git" but is not ".git/"
      expect(isSafePath('src/git-helper.ts')).toBe(true);
    });
  });

  describe('validatePath', () => {
    it('should return null for valid paths', () => {
      expect(validatePath('src/components/Button.tsx')).toBeNull();
      expect(validatePath('public/images/logo.png')).toBeNull();
      expect(validatePath('frontend/src/App.tsx')).toBeNull();
      expect(validatePath('package.json')).toBeNull();
      expect(validatePath('components/Button.tsx')).toBeNull();
    });

    it('should return error message for path traversal', () => {
      const result = validatePath('src/../../../etc/passwd');
      expect(result).toContain('traversal');
    });

    it('should return error message for absolute paths', () => {
      const result = validatePath('/etc/passwd');
      expect(result).toContain('Absolute');
    });

    it('should return error message for Windows absolute paths', () => {
      const result = validatePath('C:\\Windows\\System32');
      expect(result).toContain('Windows absolute');
    });

    it('should return error message for invalid characters', () => {
      const result = validatePath('src/file<test>.txt');
      expect(result).toContain('invalid characters');
    });

    it('should return error message for blocked paths', () => {
      expect(validatePath('node_modules/react')).toContain('blocked');
      expect(validatePath('.env')).toContain('blocked');
      expect(validatePath('.env.local')).toContain('blocked');
      expect(validatePath('.git/config')).toContain('blocked');
    });

    it('should return error message for empty paths', () => {
      const result = validatePath('');
      expect(result).toContain('empty');
    });
  });

  describe('isSafePath wraps validatePath', () => {
    it('should return true when validatePath returns null', () => {
      expect(validatePath('src/App.tsx')).toBeNull();
      expect(isSafePath('src/App.tsx')).toBe(true);
    });

    it('should return false when validatePath returns an error', () => {
      expect(validatePath('../secret')).not.toBeNull();
      expect(isSafePath('../secret')).toBe(false);
    });
  });
});
