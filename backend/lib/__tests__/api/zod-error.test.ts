/**
 * @fileoverview Tests for zod-error module
 * Tests formatting of Zod validation errors into human-readable strings
 */

import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { formatZodError } from '../../api/zod-error';

describe('formatZodError', () => {
  it('should format a simple ZodError with single path', () => {
    const zodError = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['name'],
        message: 'Expected string, received number',
      } as any,
    ]);

    const result = formatZodError(zodError);
    expect(result).toBe('name: Expected string, received number');
  });

  it('should format a ZodError with nested path', () => {
    const zodError = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['user', 'name'],
        message: 'Expected string, received number',
      } as any,
    ]);

    const result = formatZodError(zodError);
    expect(result).toBe('user.name: Expected string, received number');
  });

  it('should format a ZodError with deep nested path', () => {
    const zodError = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['data', 'user', 'profile', 'name'],
        message: 'Expected string, received number',
      } as any,
    ]);

    const result = formatZodError(zodError);
    expect(result).toBe('data.user.profile.name: Expected string, received number');
  });

  it('should format a ZodError with multiple errors', () => {
    const zodError = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['name'],
        message: 'Expected string, received number',
      } as any,
      {
        code: 'too_small',
        minimum: 18,
        type: 'number',
        inclusive: true,
        path: ['age'],
        message: 'Number must be greater than or equal to 18',
      } as any,
      {
        code: 'invalid_type',
        expected: 'boolean',
        received: 'undefined',
        path: ['active'],
        message: 'Required',
      } as any,
    ]);

    const result = formatZodError(zodError);
    expect(result).toBe(
      'name: Expected string, received number, age: Number must be greater than or equal to 18, active: Required'
    );
  });

  it('should format a ZodError with array indices', () => {
    const zodError = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['items', 0, 'name'],
        message: 'Expected string, received number',
      } as any,
    ]);

    const result = formatZodError(zodError);
    expect(result).toBe('items.0.name: Expected string, received number');
  });

  it('should format a ZodError with empty path', () => {
    const zodError = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: [],
        message: 'Expected string, received number',
      } as any,
    ]);

    const result = formatZodError(zodError);
    expect(result).toBe(': Expected string, received number');
  });

  it('should handle different Zod error codes', () => {
    const zodError = new ZodError([
      {
        code: 'invalid_string',
        validation: 'email',
        path: ['email'],
        message: 'Invalid email',
      } as any,
      {
        code: 'too_small',
        minimum: 8,
        type: 'string',
        inclusive: true,
        path: ['password'],
        message: 'String must contain at least 8 character(s)',
      } as any,
      {
        code: 'invalid_enum',
        received: 'invalid',
        options: ['active', 'inactive'],
        path: ['status'],
        message: "Invalid enum value. Expected 'active' | 'inactive', received 'invalid'",
      } as any,
    ]);

    const result = formatZodError(zodError);
    expect(result).toContain('email: Invalid email');
    expect(result).toContain('password: String must contain at least 8 character(s)');
    expect(result).toContain("status: Invalid enum value. Expected 'active' | 'inactive', received 'invalid'");
  });

  it('should return generic message for non-ZodError', () => {
    const error = new Error('Some other error');
    const result = formatZodError(error);
    expect(result).toBe('Validation failed');
  });

  it('should return generic message for null', () => {
    const result = formatZodError(null);
    expect(result).toBe('Validation failed');
  });

  it('should return generic message for undefined', () => {
    const result = formatZodError(undefined);
    expect(result).toBe('Validation failed');
  });

  it('should return generic message for plain object', () => {
    const error = { message: 'Some error' };
    const result = formatZodError(error);
    expect(result).toBe('Validation failed');
  });

  it('should return generic message for string', () => {
    const error = 'Some error string';
    const result = formatZodError(error);
    expect(result).toBe('Validation failed');
  });

  it('should handle ZodError with complex nested structures', () => {
    const zodError = new ZodError([
      {
        code: 'invalid_type',
        expected: 'object',
        received: 'undefined',
        path: ['user', 'profile'],
        message: 'Required',
      } as any,
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['items', 0],
        message: 'Expected string, received number',
      } as any,
      {
        code: 'invalid_union',
        unionErrors: [],
        path: ['metadata'],
        message: 'Invalid input',
      } as any,
    ]);

    const result = formatZodError(zodError);
    expect(result).toContain('user.profile: Required');
    expect(result).toContain('items.0: Expected string, received number');
    expect(result).toContain('metadata: Invalid input');
  });

  it('should handle ZodError with special characters in path', () => {
    const zodError = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['user-name', 'email_address'],
        message: 'Expected string, received number',
      } as any,
    ]);

    const result = formatZodError(zodError);
    expect(result).toBe('user-name.email_address: Expected string, received number');
  });

  it('should format ZodError with custom error messages', () => {
    const zodError = new ZodError([
      {
        code: 'custom',
        path: ['customField'],
        message: 'This is a custom validation error',
      } as any,
    ]);

    const result = formatZodError(zodError);
    expect(result).toBe('customField: This is a custom validation error');
  });

  it('should handle empty ZodError', () => {
    const zodError = new ZodError([]);
    const result = formatZodError(zodError);
    expect(result).toBe('');
  });

  it('should preserve original error messages exactly', () => {
    const zodError = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['field'],
        message: 'Expected string, received number at index 0',
      } as any,
    ]);

    const result = formatZodError(zodError);
    expect(result).toBe('field: Expected string, received number at index 0');
  });

  it('should handle ZodError with very long paths', () => {
    const zodError = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['level1', 'level2', 'level3', 'level4', 'level5', 'field'],
        message: 'Expected string, received number',
      } as any,
    ]);

    const result = formatZodError(zodError);
    expect(result).toBe('level1.level2.level3.level4.level5.field: Expected string, received number');
  });
});
