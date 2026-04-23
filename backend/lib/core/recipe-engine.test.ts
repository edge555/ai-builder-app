import { describe, expect, it } from 'vitest';
import { composeExecutionPrompt, selectRecipe } from './recipes/recipe-engine';
import { getRecipe } from './recipes/recipe-types';

describe('recipe-engine', () => {
  it('fullstack intent returns fullstack recipe when enabled', () => {
    const recipe = selectRecipe(
      {
        clarifiedGoal: 'Build fullstack app',
        complexity: 'medium',
        features: ['api'],
        technicalApproach: 'next',
        projectType: 'fullstack',
      },
      { fullstackEnabled: true },
      'Create a Next.js app with postgres database and api route'
    );

    expect(recipe.id).toBe('nextjs-prisma');
  });

  it('null intent returns react-spa', () => {
    const recipe = selectRecipe(null, { fullstackEnabled: true }, 'simple app');
    expect(recipe.id).toBe('react-spa');
  });

  it('react-spa-beginner prompt contains no fetch constraint text', () => {
    const recipe = getRecipe('react-spa-beginner');
    expect(recipe).toBeDefined();

    const prompt = composeExecutionPrompt(recipe!, 'Build a counter app', null, null);
    expect(prompt.toLowerCase()).toContain('no fetch() or axios');
  });
});
