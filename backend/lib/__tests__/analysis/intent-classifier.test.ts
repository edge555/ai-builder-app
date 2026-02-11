/**
 * Tests for Intent Classifier Service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntentClassifier, createIntentClassifier } from '../../analysis/intent-classifier';
import { GeminiClient } from '../../ai/gemini-client';
import type { ProjectState } from '@ai-app-builder/shared';

describe('IntentClassifier', () => {
  let mockGeminiClient: GeminiClient;
  let intentClassifier: IntentClassifier;

  const createProjectState = (files: Record<string, string>): ProjectState => ({
    id: 'test-project',
    name: 'Test Project',
    description: 'A test project',
    files,
    createdAt: new Date(),
    updatedAt: new Date(),
    currentVersionId: 'v1',
  });

  beforeEach(() => {
    mockGeminiClient = {
      generate: vi.fn(),
    } as unknown as GeminiClient;
    intentClassifier = new IntentClassifier(mockGeminiClient);
  });

  describe('classify', () => {
    it('should classify add_component intent correctly', async () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
      });

      vi.mocked(mockGeminiClient.generate).mockResolvedValue({
        success: true,
        content: JSON.stringify({
          type: 'add_component',
          confidence: 0.9,
          affectedAreas: ['src/components/Button.tsx'],
          description: 'Add a new Button component',
        }),
      });

      const result = await intentClassifier.classify(
        'Add a new Button component',
        projectState
      );

      expect(result.type).toBe('add_component');
      expect(result.confidence).toBe(0.9);
      expect(result.affectedAreas).toContain('src/components/Button.tsx');
    });

    it('should classify modify_component intent correctly', async () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
      });

      vi.mocked(mockGeminiClient.generate).mockResolvedValue({
        success: true,
        content: JSON.stringify({
          type: 'modify_component',
          confidence: 0.85,
          affectedAreas: ['src/App.tsx'],
          description: 'Modify the App component to add a header',
        }),
      });

      const result = await intentClassifier.classify(
        'Change the App component to include a header',
        projectState
      );

      expect(result.type).toBe('modify_component');
      expect(result.affectedAreas).toContain('src/App.tsx');
    });

    it('should classify add_route intent correctly', async () => {
      const projectState = createProjectState({
        'app/api/users/route.ts': 'export async function GET() {}',
      });

      vi.mocked(mockGeminiClient.generate).mockResolvedValue({
        success: true,
        content: JSON.stringify({
          type: 'add_route',
          confidence: 0.88,
          affectedAreas: ['app/api/products/route.ts'],
          description: 'Add a new products API endpoint',
        }),
      });

      const result = await intentClassifier.classify(
        'Create a new API endpoint for products',
        projectState
      );

      expect(result.type).toBe('add_route');
    });

    it('should classify modify_style intent correctly', async () => {
      const projectState = createProjectState({
        'src/styles.css': '.app { color: red; }',
      });

      vi.mocked(mockGeminiClient.generate).mockResolvedValue({
        success: true,
        content: JSON.stringify({
          type: 'modify_style',
          confidence: 0.92,
          affectedAreas: ['src/styles.css'],
          description: 'Change the background color to blue',
        }),
      });

      const result = await intentClassifier.classify(
        'Change the background color to blue',
        projectState
      );

      expect(result.type).toBe('modify_style');
    });

    it('should classify delete intent correctly', async () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
        'src/OldComponent.tsx': 'export default function OldComponent() { return <div />; }',
      });

      vi.mocked(mockGeminiClient.generate).mockResolvedValue({
        success: true,
        content: JSON.stringify({
          type: 'delete',
          confidence: 0.95,
          affectedAreas: ['src/OldComponent.tsx'],
          description: 'Delete the OldComponent',
        }),
      });

      const result = await intentClassifier.classify(
        'Remove the OldComponent',
        projectState
      );

      expect(result.type).toBe('delete');
    });

    it('should classify refactor intent correctly', async () => {
      const projectState = createProjectState({
        'src/utils.ts': 'export function helper() { return 42; }',
      });

      vi.mocked(mockGeminiClient.generate).mockResolvedValue({
        success: true,
        content: JSON.stringify({
          type: 'refactor',
          confidence: 0.87,
          affectedAreas: ['src/utils.ts'],
          description: 'Refactor the utils module',
        }),
      });

      const result = await intentClassifier.classify(
        'Refactor the utils module to use classes',
        projectState
      );

      expect(result.type).toBe('refactor');
    });

    it('should handle API failure with fallback classification', async () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
      });

      vi.mocked(mockGeminiClient.generate).mockResolvedValue({
        success: false,
        error: 'API error',
      });

      const result = await intentClassifier.classify(
        'Add a new component',
        projectState
      );

      // Should use fallback classification
      expect(result.type).toBe('add_component');
      expect(result.confidence).toBe(0.5); // Fallback confidence
    });

    it('should handle malformed JSON response with fallback', async () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
      });

      vi.mocked(mockGeminiClient.generate).mockResolvedValue({
        success: true,
        content: 'This is not valid JSON',
      });

      const result = await intentClassifier.classify(
        'Change the CSS style to blue',
        projectState
      );

      // Should use fallback classification
      expect(result.type).toBe('modify_style');
      expect(result.confidence).toBe(0.5);
    });

    it('should handle markdown-wrapped JSON response', async () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
      });

      vi.mocked(mockGeminiClient.generate).mockResolvedValue({
        success: true,
        content: '```json\n{"type": "add_component", "confidence": 0.9, "affectedAreas": [], "description": "Add component"}\n```',
      });

      const result = await intentClassifier.classify(
        'Add a button',
        projectState
      );

      expect(result.type).toBe('add_component');
      expect(result.confidence).toBe(0.9);
    });

    it('should clamp confidence to valid range', async () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
      });

      vi.mocked(mockGeminiClient.generate).mockResolvedValue({
        success: true,
        content: JSON.stringify({
          type: 'add_component',
          confidence: 1.5, // Invalid: > 1
          affectedAreas: [],
          description: 'Add component',
        }),
      });

      const result = await intentClassifier.classify('Add a button', projectState);

      expect(result.confidence).toBe(1);
    });

    it('should convert invalid type to other', async () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
      });

      vi.mocked(mockGeminiClient.generate).mockResolvedValue({
        success: true,
        content: JSON.stringify({
          type: 'invalid_type',
          confidence: 0.8,
          affectedAreas: [],
          description: 'Some modification',
        }),
      });

      const result = await intentClassifier.classify('Do something', projectState);

      expect(result.type).toBe('other');
    });
  });

  describe('fallback classification', () => {
    beforeEach(() => {
      vi.mocked(mockGeminiClient.generate).mockResolvedValue({
        success: false,
        error: 'API error',
      });
    });

    it('should detect add component from keywords', async () => {
      const projectState = createProjectState({});

      const result = await intentClassifier.classify(
        'Create a new component called Header',
        projectState
      );

      expect(result.type).toBe('add_component');
    });

    it('should detect add route from keywords', async () => {
      const projectState = createProjectState({});

      const result = await intentClassifier.classify(
        'Add a new API endpoint for authentication',
        projectState
      );

      expect(result.type).toBe('add_route');
    });

    it('should detect modify style from keywords', async () => {
      const projectState = createProjectState({});

      const result = await intentClassifier.classify(
        'Change the CSS color to blue',
        projectState
      );

      expect(result.type).toBe('modify_style');
    });

    it('should detect delete from keywords', async () => {
      const projectState = createProjectState({});

      const result = await intentClassifier.classify(
        'Remove the old component',
        projectState
      );

      expect(result.type).toBe('delete');
    });

    it('should detect refactor from keywords', async () => {
      const projectState = createProjectState({});

      const result = await intentClassifier.classify(
        'Refactor the code structure',
        projectState
      );

      expect(result.type).toBe('refactor');
    });

    it('should find affected files from prompt', async () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
        'src/Header.tsx': 'export default function Header() { return <header />; }',
      });

      const result = await intentClassifier.classify(
        'Modify the Header component',
        projectState
      );

      expect(result.affectedAreas).toContain('src/Header.tsx');
    });
  });

  describe('createIntentClassifier', () => {
    it('should create an IntentClassifier instance', () => {
      const classifier = createIntentClassifier(mockGeminiClient);
      expect(classifier).toBeInstanceOf(IntentClassifier);
    });
  });
});
