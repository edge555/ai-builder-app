import { describe, it, expect } from 'vitest';
import { getGenerationPrompt } from './generation-prompt';

/**
 * Helper: check if the generated prompt includes the DESIGN PRINCIPLES section.
 */
function includesDesignSection(userPrompt: string): boolean {
  return getGenerationPrompt(userPrompt).includes('DESIGN PRINCIPLES');
}

/**
 * Helper: extract complexity level from FILE REQUIREMENTS marker.
 */
function getComplexity(userPrompt: string): 'simple' | 'medium' | 'complex' {
  const prompt = getGenerationPrompt(userPrompt);
  if (prompt.includes('FILE REQUIREMENTS (complex project)')) return 'complex';
  if (prompt.includes('FILE REQUIREMENTS (simple project)')) return 'simple';
  return 'medium';
}

describe('shouldIncludeDesignSystem (2.1)', () => {
  describe('phrase keywords trigger design section', () => {
    it('includes design for "sleek landing page"', () => {
      expect(includesDesignSection('sleek landing page')).toBe(true);
    });

    it('includes design for "beautiful ui"', () => {
      expect(includesDesignSection('build me a beautiful ui for my app')).toBe(true);
    });

    it('includes design for "modern design"', () => {
      expect(includesDesignSection('I want a modern design')).toBe(true);
    });
  });

  describe('false positive fixes — theme/dashboard no longer trigger', () => {
    it('does NOT trigger for "build a theming system"', () => {
      expect(includesDesignSection('build a theming system')).toBe(false);
    });

    it('does NOT trigger for "dashboard with analytics"', () => {
      expect(includesDesignSection('build a dashboard with analytics')).toBe(false);
    });

    it('does NOT trigger for "theme switcher"', () => {
      // 'theme' was removed from wordKeywords
      expect(includesDesignSection('add a theme switcher')).toBe(false);
    });
  });

  describe('negation detection', () => {
    it('does NOT trigger for "I don\'t want beautiful ui"', () => {
      expect(includesDesignSection("I don't want beautiful ui")).toBe(false);
    });

    it('does NOT trigger for "without modern design"', () => {
      expect(includesDesignSection('without modern design')).toBe(false);
    });

    it('does NOT trigger for "avoid sleek animations"', () => {
      expect(includesDesignSection('avoid sleek animations')).toBe(false);
    });

    it('does NOT trigger for "skip elegant styling"', () => {
      expect(includesDesignSection('skip elegant styling')).toBe(false);
    });

    it('still triggers when negation is far away', () => {
      // Negation more than 3 words before keyword should not suppress
      expect(includesDesignSection("I don't want bugs but give me a beautiful ui")).toBe(true);
    });
  });

  describe('word-boundary matching prevents partial matches', () => {
    it('does NOT trigger for "animated" inside "reanimated"', () => {
      // 'animated' is a wordKeyword, but word boundaries should prevent matching inside another word
      // Actually "reanimated" contains "animated" at a word boundary on the right but not left
      expect(includesDesignSection('use reanimated for transitions')).toBe(false);
    });
  });

  describe('no prompt returns false', () => {
    it('returns false for empty string', () => {
      expect(includesDesignSection('')).toBe(false);
    });
  });
});

describe('detectComplexity (2.2)', () => {
  describe('simple projects', () => {
    it('classifies "build a simple counter app" as simple', () => {
      expect(getComplexity('build a simple counter app')).toBe('simple');
    });

    it('classifies verbose single-feature prompt (80+ words) as simple', () => {
      // Long verbose prompt about one feature with 0 feature signals
      const verbose = 'I want you to build me a really nice and wonderful and amazing and fantastic ' +
        'and incredible and awesome and superb and excellent and outstanding and remarkable ' +
        'and exceptional and magnificent and brilliant and spectacular and fabulous ' +
        'and gorgeous and stunning and impressive and marvelous and extraordinary ' +
        'and phenomenal and tremendous and terrific and glorious and splendid ' +
        'and beautiful and delightful and charming and lovely and wonderful counter that counts up and down';
      expect(getComplexity(verbose)).toBe('simple');
    });
  });

  describe('medium projects', () => {
    it('classifies "todo app with search and filter" as medium', () => {
      expect(getComplexity('todo app with search and filter')).toBe('medium');
    });

    it('classifies "app with login and dashboard" as medium', () => {
      expect(getComplexity('build an app with login and a dashboard')).toBe('medium');
    });
  });

  describe('complex projects', () => {
    it('classifies multi-feature prompt as complex', () => {
      expect(getComplexity(
        'e-commerce with auth, dashboard, charts, drag-drop, real-time notifications'
      )).toBe('complex');
    });
  });

  describe('word count no longer inflates score', () => {
    it('long prompt with only 1 feature signal stays simple', () => {
      // Has 'dashboard' (1 signal) but many words — should not inflate to medium
      const longPrompt = Array(20).fill('please build me a very nice').join(' ') + ' dashboard';
      expect(getComplexity(longPrompt)).toBe('simple');
    });
  });
});

describe('Phase 3: Prompt Enrichment', () => {
  const prompt = getGenerationPrompt('build a simple counter');

  describe('3.1 Common React Patterns Guidance', () => {
    it('includes COMMON UI PATTERNS section', () => {
      expect(prompt).toContain('COMMON UI PATTERNS');
    });

    it('includes forms guidance', () => {
      expect(prompt).toContain('e.preventDefault()');
      expect(prompt).toContain('aria-describedby');
    });

    it('includes lists guidance with stable keys', () => {
      expect(prompt).toContain('item.id');
    });

    it('includes data fetching state machine guidance', () => {
      expect(prompt).toContain('loading');
      expect(prompt).toContain('error');
    });

    it('includes modal guidance', () => {
      expect(prompt).toContain('Escape');
      expect(prompt).toContain('stopPropagation');
    });

    it('appears after SYNTAX_INTEGRITY_RULES', () => {
      const syntaxIdx = prompt.indexOf('SYNTAX & INTEGRITY RULES');
      const patternsIdx = prompt.indexOf('COMMON UI PATTERNS');
      expect(syntaxIdx).toBeGreaterThan(-1);
      expect(patternsIdx).toBeGreaterThan(syntaxIdx);
    });
  });

  describe('3.2 CSS Variable Starter Tokens', () => {
    it('includes color tokens', () => {
      expect(prompt).toContain('--color-primary: #3b82f6');
      expect(prompt).toContain('--color-bg: #ffffff');
      expect(prompt).toContain('--color-error: #ef4444');
      expect(prompt).toContain('--color-success: #22c55e');
    });

    it('includes spacing tokens', () => {
      expect(prompt).toContain('--space-xs: 4px');
      expect(prompt).toContain('--space-md: 16px');
      expect(prompt).toContain('--space-xl: 32px');
    });

    it('includes typography tokens', () => {
      expect(prompt).toContain('--font-sans:');
      expect(prompt).toContain('--text-base: 1rem');
    });

    it('includes radius and shadow tokens', () => {
      expect(prompt).toContain('--radius-sm: 6px');
      expect(prompt).toContain('--shadow-sm:');
    });

    it('includes instruction to use variables instead of hardcoded values', () => {
      expect(prompt).toContain('Components MUST reference these variables instead of hardcoded values');
    });
  });
});
