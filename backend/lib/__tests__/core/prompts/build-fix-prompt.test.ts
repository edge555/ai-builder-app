/**
 * @fileoverview Tests for build-fix-prompt module
 * Tests construction of build-fix prompts for retrying failed builds
 */

import { describe, it, expect } from 'vitest';
import { buildFixPrompt, type BuildFixMode, type BuildFixPromptOptions } from '../../../core/prompts/build-fix-prompt';

describe('buildFixPrompt', () => {
  it('should build a basic generation fix prompt', () => {
    const options: BuildFixPromptOptions = {
      mode: 'generation',
      errorContext: 'Error: Cannot find module "react"',
      originalPrompt: 'Create a React todo app',
    };

    const result = buildFixPrompt(options);

    expect(result).toContain('Fix the following build errors in the project:');
    expect(result).toContain('Error: Cannot find module "react"');
    expect(result).toContain('Original description: Create a React todo app');
    expect(result).toContain('Return the COMPLETE fixed project with all files.');
  });

  it('should build a basic modification fix prompt', () => {
    const options: BuildFixPromptOptions = {
      mode: 'modification',
      errorContext: 'Type error: Property "name" does not exist',
      originalPrompt: 'Add a name field to the user interface',
    };

    const result = buildFixPrompt(options);

    expect(result).toContain('Fix the following build errors in the project:');
    expect(result).toContain('Type error: Property "name" does not exist');
    expect(result).toContain('Original request: Add a name field to the user interface');
    expect(result).toContain('Return the COMPLETE fixed project with all files.');
  });

  it('should include failure history when provided', () => {
    const options: BuildFixPromptOptions = {
      mode: 'generation',
      errorContext: 'Error: Cannot find module "react"',
      originalPrompt: 'Create a React todo app',
      failureHistory: [
        {
          attempt: 1,
          error: 'Error: Cannot find module "react"',
          strategy: 'Added react to dependencies',
          timestamp: '2024-01-01T10:00:00Z',
        },
        {
          attempt: 2,
          error: 'Error: Cannot find module "react-dom"',
          strategy: 'Added react-dom to dependencies',
          timestamp: '2024-01-01T10:05:00Z',
        },
      ],
    };

    const result = buildFixPrompt(options);

    expect(result).toContain('=== PREVIOUS REPAIR ATTEMPTS ===');
    expect(result).toContain('The following fixes were already tried and FAILED. Do NOT repeat these approaches:');
    expect(result).toContain('Attempt 1:');
    expect(result).toContain('Error: Error: Cannot find module "react"');
    expect(result).toContain('What was tried: Added react to dependencies');
    expect(result).toContain('Attempt 2:');
    expect(result).toContain('Error: Error: Cannot find module "react-dom"');
    expect(result).toContain('What was tried: Added react-dom to dependencies');
    expect(result).toContain('You MUST try a DIFFERENT approach than the previous attempts.');
  });

  it('should handle failure history without strategy', () => {
    const options: BuildFixPromptOptions = {
      mode: 'generation',
      errorContext: 'Error: Cannot find module "react"',
      originalPrompt: 'Create a React todo app',
      failureHistory: [
        {
          attempt: 1,
          error: 'Error: Cannot find module "react"',
          timestamp: '2024-01-01T10:00:00Z',
        },
      ],
    };

    const result = buildFixPrompt(options);

    expect(result).toContain('=== PREVIOUS REPAIR ATTEMPTS ===');
    expect(result).toContain('Attempt 1:');
    expect(result).toContain('Error: Error: Cannot find module "react"');
    expect(result).not.toContain('What was tried:');
  });

  it('should handle multiple failure attempts', () => {
    const options: BuildFixPromptOptions = {
      mode: 'modification',
      errorContext: 'Type error: Property "name" does not exist',
      originalPrompt: 'Add a name field to the user interface',
      failureHistory: [
        {
          attempt: 1,
          error: 'Error 1',
          strategy: 'Strategy 1',
          timestamp: '2024-01-01T10:00:00Z',
        },
        {
          attempt: 2,
          error: 'Error 2',
          strategy: 'Strategy 2',
          timestamp: '2024-01-01T10:05:00Z',
        },
        {
          attempt: 3,
          error: 'Error 3',
          strategy: 'Strategy 3',
          timestamp: '2024-01-01T10:10:00Z',
        },
      ],
    };

    const result = buildFixPrompt(options);

    expect(result).toContain('Attempt 1:');
    expect(result).toContain('Attempt 2:');
    expect(result).toContain('Attempt 3:');
    expect(result).toContain('Strategy 1');
    expect(result).toContain('Strategy 2');
    expect(result).toContain('Strategy 3');
  });

  it('should handle empty error context', () => {
    const options: BuildFixPromptOptions = {
      mode: 'generation',
      errorContext: '',
      originalPrompt: 'Create a React todo app',
    };

    const result = buildFixPrompt(options);

    expect(result).toContain('Fix the following build errors in the project:');
    expect(result).toContain('Original description: Create a React todo app');
  });

  it('should handle whitespace in error context', () => {
    const options: BuildFixPromptOptions = {
      mode: 'generation',
      errorContext: '   Error: Cannot find module "react"   ',
      originalPrompt: 'Create a React todo app',
    };

    const result = buildFixPrompt(options);

    expect(result).toContain('Error: Cannot find module "react"');
    expect(result).not.toContain('   Error: Cannot find module "react"   ');
  });

  it('should handle multiline error context', () => {
    const options: BuildFixPromptOptions = {
      mode: 'generation',
      errorContext: `Error: Cannot find module "react"
Error: Cannot find module "react-dom"
Type error: Property "name" does not exist`,
      originalPrompt: 'Create a React todo app',
    };

    const result = buildFixPrompt(options);

    expect(result).toContain('Error: Cannot find module "react"');
    expect(result).toContain('Error: Cannot find module "react-dom"');
    expect(result).toContain('Type error: Property "name" does not exist');
  });

  it('should handle long original prompt', () => {
    const longPrompt = 'Create a comprehensive React todo application with the following features: user authentication, real-time updates, drag and drop functionality, dark mode support, responsive design, and local storage persistence.';

    const options: BuildFixPromptOptions = {
      mode: 'generation',
      errorContext: 'Error: Cannot find module "react"',
      originalPrompt: longPrompt,
    };

    const result = buildFixPrompt(options);

    expect(result).toContain('Original description: ' + longPrompt);
  });

  it('should handle special characters in error context', () => {
    const options: BuildFixPromptOptions = {
      mode: 'generation',
      errorContext: 'Error: Unexpected token < at line 42, column 15',
      originalPrompt: 'Create a React app',
    };

    const result = buildFixPrompt(options);

    expect(result).toContain('Error: Unexpected token < at line 42, column 15');
  });

  it('should maintain proper structure with failure history', () => {
    const options: BuildFixPromptOptions = {
      mode: 'generation',
      errorContext: 'Error: Cannot find module "react"',
      originalPrompt: 'Create a React todo app',
      failureHistory: [
        {
          attempt: 1,
          error: 'Error 1',
          strategy: 'Strategy 1',
          timestamp: '2024-01-01T10:00:00Z',
        },
      ],
    };

    const result = buildFixPrompt(options);
    const lines = result.split('\n');

    // Check structure
    expect(lines[0]).toBe('Fix the following build errors in the project:');
    expect(lines[1]).toBe('');
    expect(lines[2]).toBe('Error: Cannot find module "react"');
    expect(lines[3]).toBe('');
    expect(lines[4]).toBe('=== PREVIOUS REPAIR ATTEMPTS ===');
    expect(lines[5]).toBe('');
    expect(lines[6]).toBe('The following fixes were already tried and FAILED. Do NOT repeat these approaches:');
    expect(lines[7]).toBe('');
    expect(lines[8]).toBe('Attempt 1:');
    expect(lines[9]).toBe('  Error: Error 1');
    expect(lines[10]).toBe('  What was tried: Strategy 1');
    expect(lines[11]).toBe('');
    expect(lines[12]).toBe('You MUST try a DIFFERENT approach than the previous attempts.');
    expect(lines[13]).toBe('');
    expect(lines[14]).toBe('Original description: Create a React todo app');
    expect(lines[15]).toBe('');
    expect(lines[16]).toBe('Return the COMPLETE fixed project with all files.');
  });

  it('should handle empty failure history array', () => {
    const options: BuildFixPromptOptions = {
      mode: 'generation',
      errorContext: 'Error: Cannot find module "react"',
      originalPrompt: 'Create a React todo app',
      failureHistory: [],
    };

    const result = buildFixPrompt(options);

    expect(result).not.toContain('=== PREVIOUS REPAIR ATTEMPTS ===');
    expect(result).not.toContain('The following fixes were already tried and FAILED');
    expect(result).not.toContain('You MUST try a DIFFERENT approach');
  });

  it('should handle undefined failure history', () => {
    const options: BuildFixPromptOptions = {
      mode: 'generation',
      errorContext: 'Error: Cannot find module "react"',
      originalPrompt: 'Create a React todo app',
      failureHistory: undefined,
    };

    const result = buildFixPrompt(options);

    expect(result).not.toContain('=== PREVIOUS REPAIR ATTEMPTS ===');
    expect(result).not.toContain('The following fixes were already tried and FAILED');
    expect(result).not.toContain('You MUST try a DIFFERENT approach');
  });

  it('should use correct label for generation mode', () => {
    const options: BuildFixPromptOptions = {
      mode: 'generation',
      errorContext: 'Error: Cannot find module "react"',
      originalPrompt: 'Create a React todo app',
    };

    const result = buildFixPrompt(options);

    expect(result).toContain('Original description: Create a React todo app');
    expect(result).not.toContain('Original request:');
  });

  it('should use correct label for modification mode', () => {
    const options: BuildFixPromptOptions = {
      mode: 'modification',
      errorContext: 'Error: Cannot find module "react"',
      originalPrompt: 'Add a name field to the user interface',
    };

    const result = buildFixPrompt(options);

    expect(result).toContain('Original request: Add a name field to the user interface');
    expect(result).not.toContain('Original description:');
  });

  it('should handle complex error messages with stack traces', () => {
    const complexError = `
Error: Module not found: Can't resolve './components' in '/app/src'
    at webpack:///app/src/index.js:42:15
    at processTicksAndRejections (internal/process/task_queues.js:95:5)
    at async /app/node_modules/webpack/lib/Compilation.js:1234:15
`;

    const options: BuildFixPromptOptions = {
      mode: 'generation',
      errorContext: complexError,
      originalPrompt: 'Create a React app',
    };

    const result = buildFixPrompt(options);

    expect(result).toContain('Error: Module not found');
    expect(result).toContain("Can't resolve './components'");
  });

  it('should handle failure history with long error messages', () => {
    const longError = 'This is a very long error message that spans multiple lines and contains detailed information about what went wrong in the build process including file paths, line numbers, and stack traces.';

    const options: BuildFixPromptOptions = {
      mode: 'generation',
      errorContext: 'Error: Cannot find module "react"',
      originalPrompt: 'Create a React todo app',
      failureHistory: [
        {
          attempt: 1,
          error: longError,
          strategy: 'Attempted to fix by installing missing dependencies',
          timestamp: '2024-01-01T10:00:00Z',
        },
      ],
    };

    const result = buildFixPrompt(options);

    expect(result).toContain('Error: ' + longError);
    expect(result).toContain('What was tried: Attempted to fix by installing missing dependencies');
  });

  it('should handle failure history with multiple strategies', () => {
    const options: BuildFixPromptOptions = {
      mode: 'generation',
      errorContext: 'Error: Cannot find module "react"',
      originalPrompt: 'Create a React todo app',
      failureHistory: [
        {
          attempt: 1,
          error: 'Error 1',
          strategy: 'Strategy 1: Added dependency',
          timestamp: '2024-01-01T10:00:00Z',
        },
        {
          attempt: 2,
          error: 'Error 2',
          strategy: 'Strategy 2: Updated import paths',
          timestamp: '2024-01-01T10:05:00Z',
        },
        {
          attempt: 3,
          error: 'Error 3',
          strategy: 'Strategy 3: Fixed type definitions',
          timestamp: '2024-01-01T10:10:00Z',
        },
      ],
    };

    const result = buildFixPrompt(options);

    expect(result).toContain('Strategy 1: Added dependency');
    expect(result).toContain('Strategy 2: Updated import paths');
    expect(result).toContain('Strategy 3: Fixed type definitions');
  });

  it('should preserve exact error context formatting', () => {
    const formattedError = `
Build Error Summary:
====================
File: src/index.ts
Line: 42
Error: Type 'string' is not assignable to type 'number'
`;

    const options: BuildFixPromptOptions = {
      mode: 'generation',
      errorContext: formattedError,
      originalPrompt: 'Create a React app',
    };

    const result = buildFixPrompt(options);

    expect(result).toContain('Build Error Summary:');
    expect(result).toContain('====================');
    expect(result).toContain('File: src/index.ts');
    expect(result).toContain('Line: 42');
    expect(result).toContain("Error: Type 'string' is not assignable to type 'number'");
  });
});
