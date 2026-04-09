import { describe, expect, it } from 'vitest';
import { buildHeuristicPlan } from './heuristic-plan-builder';
import type { GenerationRecipe } from './recipes/recipe-types';

const beginnerRecipe = { id: 'react-spa-beginner' } as GenerationRecipe;

describe('heuristic-plan-builder beginner mode', () => {
  it('counter keywords produce Counter component plan with 5 files', () => {
    const plan = buildHeuristicPlan(null, 'Build a counter with increment and decrement', beginnerRecipe);
    expect(plan.files).toHaveLength(5);
    expect(plan.files.some((file) => file.path === 'src/components/Counter.tsx')).toBe(true);
  });

  it('todo keywords produce TodoList component plan with 5 files', () => {
    const plan = buildHeuristicPlan(null, 'Make a task checklist app', beginnerRecipe);
    expect(plan.files).toHaveLength(5);
    expect(plan.files.some((file) => file.path === 'src/components/TodoList.tsx')).toBe(true);
  });

  it('quiz keywords produce Quiz component plan with 5 files', () => {
    const plan = buildHeuristicPlan(null, 'Create a quiz with question and answer cards', beginnerRecipe);
    expect(plan.files).toHaveLength(5);
    expect(plan.files.some((file) => file.path === 'src/components/Quiz.tsx')).toBe(true);
  });

  it('form keywords produce FormTracker component plan with 5 files', () => {
    const plan = buildHeuristicPlan(null, 'Build a habit tracker form', beginnerRecipe);
    expect(plan.files).toHaveLength(5);
    expect(plan.files.some((file) => file.path === 'src/components/FormTracker.tsx')).toBe(true);
  });

  it('calculator keywords produce Calculator component plan with 5 files', () => {
    const plan = buildHeuristicPlan(null, 'Create a calculator app', beginnerRecipe);
    expect(plan.files).toHaveLength(5);
    expect(plan.files.some((file) => file.path === 'src/components/Calculator.tsx')).toBe(true);
  });

  it('unrecognized keyword returns 4-file generic plan', () => {
    const plan = buildHeuristicPlan(null, 'Build a simple classroom app', beginnerRecipe);
    expect(plan.files).toHaveLength(4);
    expect(plan.files.some((file) => file.path === 'src/App.tsx')).toBe(true);
  });

  it('null intent does not throw and returns valid plan', () => {
    expect(() => buildHeuristicPlan(null, 'any prompt', beginnerRecipe)).not.toThrow();
    const plan = buildHeuristicPlan(null, 'any prompt', beginnerRecipe);
    expect(plan.files.length).toBeGreaterThanOrEqual(4);
  });

  it('react-spa-beginner recipe keeps plans within 4-6 files', () => {
    const prompts = [
      'counter app',
      'todo app',
      'quiz app',
      'habit form tracker',
      'calculator app',
      'misc app',
    ];

    for (const prompt of prompts) {
      const plan = buildHeuristicPlan(null, prompt, beginnerRecipe);
      expect(plan.files.length).toBeGreaterThanOrEqual(4);
      expect(plan.files.length).toBeLessThanOrEqual(6);
    }
  });

  it('nextjs-prisma recipe returns fullstack-compatible fallback plan', () => {
    const fullstackRecipe = { id: 'nextjs-prisma', defaultDependencies: ['next', 'react', 'react-dom', 'prisma', '@prisma/client'] } as GenerationRecipe;
    const plan = buildHeuristicPlan(null, 'Build a fullstack inventory app', fullstackRecipe);

    expect(plan.files.some((file) => file.path === 'app/page.tsx')).toBe(true);
    expect(plan.files.some((file) => file.path === 'prisma/schema.prisma')).toBe(true);
    expect(plan.files.some((file) => file.path === 'src/main.tsx')).toBe(false);
  });

  it('nextjs-supabase-auth recipe returns auth fullstack-compatible fallback plan', () => {
    const authRecipe = { id: 'nextjs-supabase-auth', defaultDependencies: ['next', 'react', 'react-dom', '@supabase/supabase-js', '@supabase/ssr'] } as GenerationRecipe;
    const plan = buildHeuristicPlan(null, 'Build an auth dashboard app', authRecipe);

    expect(plan.files.some((file) => file.path === 'app/(auth)/login/page.tsx')).toBe(true);
    expect(plan.files.some((file) => file.path === 'app/(protected)/dashboard/page.tsx')).toBe(true);
    expect(plan.files.some((file) => file.path === 'src/main.tsx')).toBe(false);
  });
});
