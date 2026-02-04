/**
 * Tests for Fallback Selector
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { describe, it, expect } from 'vitest';
import { FallbackSelector, createFallbackSelector } from '../../analysis/file-planner/fallback-selector';
import { ChunkIndexBuilder } from '../../analysis/file-planner/chunk-index';
import type { ProjectState } from '@ai-app-builder/shared';

const createProjectState = (files: Record<string, string>): ProjectState => ({
  id: 'test-project',
  name: 'Test Project',
  description: 'A test project',
  files,
  createdAt: new Date(),
  updatedAt: new Date(),
  currentVersionId: 'v1',
});

describe('FallbackSelector', () => {
  describe('select', () => {
    it('should always return at least one primary file', () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
      });
      const builder = new ChunkIndexBuilder();
      const chunkIndex = builder.build(projectState);
      const selector = new FallbackSelector();

      const result = selector.select('random unrelated query', chunkIndex, projectState);

      expect(result.primaryFiles.length).toBeGreaterThanOrEqual(1);
      expect(result.usedFallback).toBe(true);
    });

    it('should include reasoning in the result', () => {
      const projectState = createProjectState({
        'src/Button.tsx': 'export function Button() { return <button>Click</button>; }',
      });
      const builder = new ChunkIndexBuilder();
      const chunkIndex = builder.build(projectState);
      const selector = new FallbackSelector();

      const result = selector.select('modify the button', chunkIndex, projectState);

      expect(result.reasoning).toBeDefined();
      expect(typeof result.reasoning).toBe('string');
    });
  });

  describe('keyword matching (Requirement 4.1)', () => {
    it('should match prompt words to symbol names', () => {
      const projectState = createProjectState({
        'src/UserProfile.tsx': 'export function UserProfile() { return <div>Profile</div>; }',
        'src/Settings.tsx': 'export function Settings() { return <div>Settings</div>; }',
      });
      const builder = new ChunkIndexBuilder();
      const chunkIndex = builder.build(projectState);
      const selector = new FallbackSelector();

      const result = selector.select('update the user profile component', chunkIndex, projectState);

      expect(result.primaryFiles).toContain('src/UserProfile.tsx');
    });

    it('should match partial symbol names', () => {
      const projectState = createProjectState({
        'src/AuthService.ts': 'export class AuthService { login() {} }',
        'src/DataService.ts': 'export class DataService { fetch() {} }',
      });
      const builder = new ChunkIndexBuilder();
      const chunkIndex = builder.build(projectState);
      const selector = new FallbackSelector();

      const result = selector.select('fix authentication', chunkIndex, projectState);

      expect(result.primaryFiles).toContain('src/AuthService.ts');
    });
  });

  describe('file name matching (Requirement 4.2)', () => {
    it('should match exact file names in prompt', () => {
      const projectState = createProjectState({
        'src/Button.tsx': 'export function Button() { return <button />; }',
        'src/Card.tsx': 'export function Card() { return <div />; }',
      });
      const builder = new ChunkIndexBuilder();
      const chunkIndex = builder.build(projectState);
      const selector = new FallbackSelector();

      const result = selector.select('modify Button.tsx', chunkIndex, projectState);

      expect(result.primaryFiles).toContain('src/Button.tsx');
    });

    it('should match file names without extension', () => {
      const projectState = createProjectState({
        'src/Header.tsx': 'export function Header() { return <header />; }',
        'src/Footer.tsx': 'export function Footer() { return <footer />; }',
      });
      const builder = new ChunkIndexBuilder();
      const chunkIndex = builder.build(projectState);
      const selector = new FallbackSelector();

      const result = selector.select('change the Header component', chunkIndex, projectState);

      expect(result.primaryFiles).toContain('src/Header.tsx');
    });
  });


  describe('intent patterns (Requirement 4.3)', () => {
    it('should select App.tsx for "add component" intent', () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
        'src/utils.ts': 'export function helper() { return 42; }',
      });
      const builder = new ChunkIndexBuilder();
      const chunkIndex = builder.build(projectState);
      const selector = new FallbackSelector();

      const result = selector.select('add a new component', chunkIndex, projectState);

      expect(result.primaryFiles).toContain('src/App.tsx');
    });

    it('should select CSS files for style-related prompts', () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
        'src/styles.css': '.app { color: red; }',
      });
      const builder = new ChunkIndexBuilder();
      const chunkIndex = builder.build(projectState);
      const selector = new FallbackSelector();

      const result = selector.select('change the color scheme', chunkIndex, projectState);

      expect(result.primaryFiles).toContain('src/styles.css');
    });

    it('should select API route files for API-related prompts', () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
        'app/api/users/route.ts': 'export async function GET() { return Response.json([]); }',
      });
      const builder = new ChunkIndexBuilder();
      const chunkIndex = builder.build(projectState);
      const selector = new FallbackSelector();

      const result = selector.select('add a new API endpoint', chunkIndex, projectState);

      expect(result.primaryFiles).toContain('app/api/users/route.ts');
    });

    it('should select type files for type-related prompts', () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
        'src/types.ts': 'export interface User { id: string; }',
      });
      const builder = new ChunkIndexBuilder();
      const chunkIndex = builder.build(projectState);
      const selector = new FallbackSelector();

      const result = selector.select('add a new interface', chunkIndex, projectState);

      expect(result.primaryFiles).toContain('src/types.ts');
    });
  });

  describe('score combination (Requirement 4.4)', () => {
    it('should rank files by combined score', () => {
      const projectState = createProjectState({
        'src/UserList.tsx': 'export function UserList() { return <ul />; }',
        'src/UserCard.tsx': 'export function UserCard() { return <div />; }',
        'src/Settings.tsx': 'export function Settings() { return <div />; }',
      });
      const builder = new ChunkIndexBuilder();
      const chunkIndex = builder.build(projectState);
      const selector = new FallbackSelector();

      const result = selector.select('update the user list', chunkIndex, projectState);

      // UserList should be ranked higher due to both keyword and file name match
      expect(result.primaryFiles[0]).toBe('src/UserList.tsx');
    });

    it('should include multiple matching files', () => {
      const projectState = createProjectState({
        'src/UserProfile.tsx': 'export function UserProfile() { return <div />; }',
        'src/UserSettings.tsx': 'export function UserSettings() { return <div />; }',
        'src/Dashboard.tsx': 'export function Dashboard() { return <div />; }',
      });
      const builder = new ChunkIndexBuilder();
      const chunkIndex = builder.build(projectState);
      const selector = new FallbackSelector();

      const result = selector.select('modify user components', chunkIndex, projectState);

      // Both user-related files should be included
      const allFiles = [...result.primaryFiles, ...result.contextFiles];
      expect(allFiles).toContain('src/UserProfile.tsx');
      expect(allFiles).toContain('src/UserSettings.tsx');
    });
  });

  describe('non-empty output (Requirement 4.5)', () => {
    it('should select fallback file when no matches found', () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
        'src/index.ts': 'export * from "./App";',
      });
      const builder = new ChunkIndexBuilder();
      const chunkIndex = builder.build(projectState);
      const selector = new FallbackSelector();

      const result = selector.select('xyz123 completely unrelated', chunkIndex, projectState);

      expect(result.primaryFiles.length).toBeGreaterThanOrEqual(1);
    });

    it('should prefer App.tsx as fallback entry point', () => {
      const projectState = createProjectState({
        'src/App.tsx': 'export default function App() { return <div />; }',
        'src/utils.ts': 'export function helper() {}',
        'src/types.ts': 'export interface User {}',
      });
      const builder = new ChunkIndexBuilder();
      const chunkIndex = builder.build(projectState);
      const selector = new FallbackSelector();

      const result = selector.select('xyz completely unrelated query', chunkIndex, projectState);

      expect(result.primaryFiles).toContain('src/App.tsx');
    });
  });

  describe('createFallbackSelector helper', () => {
    it('should create a FallbackSelector instance', () => {
      const selector = createFallbackSelector();
      expect(selector).toBeInstanceOf(FallbackSelector);
    });
  });
});
