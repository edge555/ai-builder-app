/**
 * Tests for Planning Prompt Module
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

import { describe, it, expect } from 'vitest';
import {
  PLANNING_SYSTEM_PROMPT,
  PLANNING_OUTPUT_SCHEMA,
  PLANNING_TEMPERATURE,
  getPlanningSystemPrompt,
  buildPlanningPrompt,
  parsePlanningResponse,
} from '../../analysis/file-planner/planning-prompt';

describe('PLANNING_SYSTEM_PROMPT', () => {
  it('should instruct AI to select primary and context files', () => {
    expect(PLANNING_SYSTEM_PROMPT).toContain('Primary files');
    expect(PLANNING_SYSTEM_PROMPT).toContain('Context files');
    expect(PLANNING_SYSTEM_PROMPT).toContain('modification');
  });

  it('should request JSON response', () => {
    expect(PLANNING_SYSTEM_PROMPT).toContain('JSON');
  });
});

describe('getPlanningSystemPrompt', () => {
  it('should include the base planning prompt', () => {
    const prompt = getPlanningSystemPrompt();
    expect(prompt).toContain('Primary files');
    expect(prompt).toContain('JSON');
  });

  it('should NOT include JSON reminder when AI_PROVIDER is openrouter', () => {
    const originalProvider = process.env.AI_PROVIDER;
    process.env.AI_PROVIDER = 'openrouter';
    try {
      const prompt = getPlanningSystemPrompt();
      expect(prompt).not.toContain('=== JSON OUTPUT REMINDER');
    } finally {
      process.env.AI_PROVIDER = originalProvider;
    }
  });

  it('should include JSON reminder when AI_PROVIDER is modal', () => {
    const originalProvider = process.env.AI_PROVIDER;
    process.env.AI_PROVIDER = 'modal';
    try {
      const prompt = getPlanningSystemPrompt();
      expect(prompt).toContain('=== JSON OUTPUT REMINDER');
      expect(prompt).toContain('Output ONLY raw JSON');
    } finally {
      process.env.AI_PROVIDER = originalProvider;
    }
  });
});

describe('PLANNING_OUTPUT_SCHEMA', () => {
  it('should define required fields', () => {
    expect(PLANNING_OUTPUT_SCHEMA.required).toContain('primaryFiles');
    expect(PLANNING_OUTPUT_SCHEMA.required).toContain('contextFiles');
    // reasoning and category have defaults, so they are not in 'required'
  });

  it('should define primaryFiles as array of strings', () => {
    const props = PLANNING_OUTPUT_SCHEMA.properties as any;
    expect(props.primaryFiles.type).toBe('array');
    expect(props.primaryFiles.items.type).toBe('string');
  });

  it('should define contextFiles as array of strings', () => {
    const props = PLANNING_OUTPUT_SCHEMA.properties as any;
    expect(props.contextFiles.type).toBe('array');
    expect(props.contextFiles.items.type).toBe('string');
  });
});

describe('PLANNING_TEMPERATURE', () => {
  it('should be low for deterministic selection (0.3)', () => {
    expect(PLANNING_TEMPERATURE).toBe(0.3);
  });
});

describe('buildPlanningPrompt', () => {
  it('should include user request clearly', () => {
    const userPrompt = 'Add a dark mode toggle to the header';
    const metadata = 'src/\n  Header.tsx (50 lines) [component]';

    const prompt = buildPlanningPrompt(userPrompt, metadata);

    expect(prompt).toContain('USER REQUEST:');
    expect(prompt).toContain(userPrompt);
  });

  it('should include file tree metadata', () => {
    const userPrompt = 'Fix the button styling';
    const metadata = `src/
  components/
    Button.tsx (42 lines) [component]
      exports: Button, ButtonProps
    Card.tsx (38 lines) [component]
      exports: Card`;

    const prompt = buildPlanningPrompt(userPrompt, metadata);

    expect(prompt).toContain('FILE TREE:');
    expect(prompt).toContain(metadata);
  });

  it('should request JSON output with correct format', () => {
    const prompt = buildPlanningPrompt('test', 'test');

    expect(prompt).toContain('primaryFiles');
    expect(prompt).toContain('contextFiles');
    expect(prompt).toContain('reasoning');
    expect(prompt).toContain('JSON');
  });
});

describe('parsePlanningResponse', () => {
  it('should parse valid JSON response', () => {
    const response = JSON.stringify({
      primaryFiles: ['src/App.tsx', 'src/Header.tsx'],
      contextFiles: ['src/types.ts'],
      reasoning: 'App.tsx contains the main layout',
    });

    const result = parsePlanningResponse(response);

    expect(result).not.toBeNull();
    expect(result?.primaryFiles).toEqual(['src/App.tsx', 'src/Header.tsx']);
    expect(result?.contextFiles).toEqual(['src/types.ts']);
    expect(result?.reasoning).toBe('App.tsx contains the main layout');
  });

  it('should handle JSON wrapped in markdown code blocks', () => {
    const response = `\`\`\`json
{
  "primaryFiles": ["src/Button.tsx"],
  "contextFiles": [],
  "reasoning": "Button needs modification"
}
\`\`\``;

    const result = parsePlanningResponse(response);

    expect(result).not.toBeNull();
    expect(result?.primaryFiles).toEqual(['src/Button.tsx']);
  });

  it('should handle code blocks without language specifier', () => {
    const response = `\`\`\`
{
  "primaryFiles": ["src/utils.ts"],
  "contextFiles": ["src/types.ts"],
  "reasoning": "Utils file"
}
\`\`\``;

    const result = parsePlanningResponse(response);

    expect(result).not.toBeNull();
    expect(result?.primaryFiles).toEqual(['src/utils.ts']);
  });

  it('should return null for invalid JSON', () => {
    const response = 'This is not JSON';
    const result = parsePlanningResponse(response);
    expect(result).toBeNull();
  });

  it('should return null for missing primaryFiles', () => {
    const response = JSON.stringify({
      contextFiles: ['src/types.ts'],
      reasoning: 'test',
    });

    const result = parsePlanningResponse(response);
    expect(result).toBeNull();
  });

  it('should return null for missing contextFiles', () => {
    const response = JSON.stringify({
      primaryFiles: ['src/App.tsx'],
      reasoning: 'test',
    });

    const result = parsePlanningResponse(response);
    expect(result).toBeNull();
  });

  it('should handle missing reasoning with empty string', () => {
    const response = JSON.stringify({
      primaryFiles: ['src/App.tsx'],
      contextFiles: [],
    });

    const result = parsePlanningResponse(response);

    expect(result).not.toBeNull();
    expect(result?.reasoning).toBe('');
  });

  it('should return null for non-string values in file arrays (strict Zod validation)', () => {
    const response = JSON.stringify({
      primaryFiles: ['src/App.tsx', 123, null, 'src/utils.ts'],
      contextFiles: ['src/types.ts', undefined, 'src/config.ts'],
      reasoning: 'test',
    });

    const result = parsePlanningResponse(response);

    expect(result).toBeNull();
  });

  it('should handle empty arrays', () => {
    const response = JSON.stringify({
      primaryFiles: [],
      contextFiles: [],
      reasoning: 'No files needed',
    });

    const result = parsePlanningResponse(response);

    expect(result).not.toBeNull();
    expect(result?.primaryFiles).toEqual([]);
    expect(result?.contextFiles).toEqual([]);
  });
});
