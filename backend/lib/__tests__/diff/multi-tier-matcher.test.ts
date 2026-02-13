import { describe, it, expect } from 'vitest';
import { multiTierMatch, applySearchReplace } from '../../diff/multi-tier-matcher';

describe('MultiTierMatcher', () => {
  const content = `import React from 'react';

export function MyComponent() {
  return (
    <div className="container">
      <h1>Hello World</h1>
      <p>This is a test component.</p>
    </div>
  );
}`;

  describe('multiTierMatch', () => {
    it('should find exact matches (Tier 1)', () => {
      const search = '<h1>Hello World</h1>';
      const result = multiTierMatch(content, search);

      expect(result.found).toBe(true);
      expect(result.tier).toBe(1);
      expect(result.matchedText).toBe(search);
    });

    it('should find matches with different whitespace (Tier 2)', () => {
      const search = "import  React  from  'react';";
      const result = multiTierMatch(content, search);

      expect(result.found).toBe(true);
      expect(result.tier).toBe(2);
      expect(result.warning).toContain('whitespace');
    });

    it('should find matches with different indentation (Tier 2/3)', () => {
      // Change indentation to trigger Tier 3
      const search = `
return (
<div className="container">
<h1>Hello World</h1>
<p>This is a test component.</p>
</div>
);`;

      const result = multiTierMatch(content, search);

      expect(result.found).toBe(true);
      expect(result.tier).toBe(2); // Tier 2 handles indentation too via whitespace normalization
      expect(result.warning).toContain('whitespace');
    });

    it('should find fuzzy matches (Tier 4)', () => {
      // Change one line + remove some to keep similarity high enough
      // 4 lines match out of 5 = 0.8
      const search = `
    <div className="container">
      <h3>Hello World</h3>
      <p>This is a test component.</p>
      <span>Extra line</span>
    </div>`;

      // Wait, similarity is matchCount / max(len1, len2).
      // Search: div, h3, p, span, /div (5 lines)
      // Content: div, h1, p, /div (4 lines)
      // Matches: div, p, /div (3 matches)
      // Similarity: 3 / 5 = 0.6. Still too low.

      const search2 = `
    <div className="container">
      <h3>Hello World</h3>
      <p>This is a test component.</p>
    </div>
  );`;
      // Search: div, h3, p, /div, ); (5 lines)
      // Content: div, h1, p, /div, ); (5 lines)
      // Matches: div, p, /div, ); (4 matches)
      // Similarity: 4 / 5 = 0.8. EXACTLY the threshold.

      const result = multiTierMatch(content, search2);

      expect(result.found).toBe(true);
      expect(result.tier).toBe(4);
      expect(result.warning).toContain('Fuzzy match');
    });
  });

  describe('applySearchReplace', () => {
    it('should correctly replace text for exact matches', () => {
      const content = 'Hello World';
      const result = applySearchReplace(content, 'World', 'AI');

      expect(result.success).toBe(true);
      expect(result.content).toBe('Hello AI');
    });

    it('should correctly replace text for fuzzy matches', () => {
      const content = '  <div>  \n    <h1>Hello</h1>\n  </div>';
      // Search with different spacing
      const search = '<div>\n<h1>Hello</h1>\n</div>';
      const replace = '<div>\n<h1>Hi</h1>\n</div>';

      const result = applySearchReplace(content, search, replace);

      expect(result.success).toBe(true);
      // It should replace the matching region
      expect(result.content).toContain('<h1>Hi</h1>');
      expect(result.warning).toBeDefined();
    });

    it('should fail gracefully if search text is not found', () => {
      const result = applySearchReplace('abc', 'def', 'ghi');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Search text not found');
    });
  });
});
