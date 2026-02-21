/**
 * Tests for unified validator
 */

import { describe, it, expect } from 'vitest';

import { validateProjectQuality } from '../../core/validators/unified-validator';

describe('unified-validator', () => {
  describe('validateProjectQuality', () => {
    it('should return no warnings for well-structured project', () => {
      const files = {
        'src/App.tsx': 'export default function App() { return <div>App</div>; }',
        'src/components/ui/Button.tsx': 'export const Button = () => <button>Click</button>;',
        'src/components/layout/Header.tsx': 'export const Header = () => <header>Header</header>;',
        'src/hooks/useCounter.ts': 'export const useCounter = () => { const [count, setCount] = useState(0); return { count, setCount }; }',
        'src/types/index.ts': 'export interface User { id: string; name: string; }',
        'src/styles/global.css': ':root { --primary-color: blue; } @media (max-width: 768px) { body { font-size: 14px; } }',
      };

      const warnings = validateProjectQuality(files);
      expect(warnings.length).toBe(0);
    });

    it('should warn about large App.tsx', () => {
      // MAX_APP_LINES is 100, so we need more than 100 lines
      const largeAppContent = 'export default function App() {\n' + '  return <div>Line</div>;\n'.repeat(110) + '}';
      const files = {
        'src/App.tsx': largeAppContent,
        'src/components/Button.tsx': 'export const Button = () => <button>Click</button>;',
      };

      const warnings = validateProjectQuality(files);
      const appWarning = warnings.find(w => w.message.includes('App.tsx has'));
      expect(appWarning).toBeDefined();
      expect(appWarning?.type).toBe('architecture_warning');
    });

    it('should warn about too few component files', () => {
      const files = {
        'src/App.tsx': 'export default function App() { return <div>App</div>; }',
      };

      const warnings = validateProjectQuality(files);
      const componentWarning = warnings.find(w => w.message.includes('component files found'));
      expect(componentWarning).toBeDefined();
    });

    it('should warn about missing custom hooks', () => {
      const files = {
        'src/App.tsx': 'export default function App() { const [count, setCount] = useState(0); return <div>{count}</div>; }',
        'src/components/Button.tsx': 'export const Button = () => <button>Click</button>;',
      };

      const warnings = validateProjectQuality(files);
      const hookWarning = warnings.find(w => w.message.includes('No custom hooks'));
      expect(hookWarning).toBeDefined();
    });

    it('should warn about missing types file', () => {
      const files = {
        'src/App.tsx': 'export default function App() { return <div>App</div>; }',
        'src/components/Button.tsx': 'export const Button = () => <button>Click</button>;',
      };

      const warnings = validateProjectQuality(files);
      const typesWarning = warnings.find(w => w.message.includes('No types file'));
      expect(typesWarning).toBeDefined();
    });

    it('should warn about unorganized components', () => {
      const files = {
        'src/App.tsx': 'export default function App() { return <div>App</div>; }',
        'src/components/Button.tsx': 'export const Button = () => <button>Click</button>;',
        'src/components/Header.tsx': 'export const Header = () => <header>Header</header>;',
      };

      const warnings = validateProjectQuality(files);
      const structureWarning = warnings.find(w => w.message.includes('not organized in folders'));
      expect(structureWarning).toBeDefined();
    });

    it('should warn about excessive inline styles', () => {
      const componentWithInlineStyles = `
        export const Component = () => (
          <div>
            <div style={{ color: 'red' }}>Text 1</div>
            <div style={{ color: 'blue' }}>Text 2</div>
            <div style={{ color: 'green' }}>Text 3</div>
            <div style={{ color: 'yellow' }}>Text 4</div>
          </div>
        );
      `;
      const files = {
        'src/components/Component.tsx': componentWithInlineStyles,
      };

      const warnings = validateProjectQuality(files);
      const styleWarning = warnings.find(w => w.message.includes('inline styles'));
      expect(styleWarning).toBeDefined();
      expect(styleWarning?.type).toBe('styling_warning');
    });

    it('should warn about missing CSS files', () => {
      const files = {
        'src/App.tsx': 'export default function App() { return <div>App</div>; }',
        'src/components/Button.tsx': 'export const Button = () => <button>Click</button>;',
      };

      const warnings = validateProjectQuality(files);
      const cssWarning = warnings.find(w => w.message.includes('No CSS files'));
      expect(cssWarning).toBeDefined();
    });

    it('should warn about missing CSS variables', () => {
      const files = {
        'src/App.tsx': 'export default function App() { return <div>App</div>; }',
        'src/components/Button.tsx': 'export const Button = () => <button>Click</button>;',
        'src/components/Header.tsx': 'export const Header = () => <header>Header</header>;',
        'src/components/Footer.tsx': 'export const Footer = () => <footer>Footer</footer>;',
        'src/components/Sidebar.tsx': 'export const Sidebar = () => <aside>Sidebar</aside>;',
        'src/styles/global.css': 'body { margin: 0; padding: 0; }',
      };

      const warnings = validateProjectQuality(files);
      const variablesWarning = warnings.find(w => w.message.includes('CSS variables'));
      expect(variablesWarning).toBeDefined();
    });

    it('should warn about missing responsive design', () => {
      const files = {
        'src/App.tsx': 'export default function App() { return <div>App</div>; }',
        'src/components/Button.tsx': 'export const Button = () => <button>Click</button>;',
        'src/components/Header.tsx': 'export const Header = () => <header>Header</header>;',
        'src/components/Footer.tsx': 'export const Footer = () => <footer>Footer</footer>;',
        'src/styles/global.css': 'body { margin: 0; }',
      };

      const warnings = validateProjectQuality(files);
      const responsiveWarning = warnings.find(w => w.message.includes('responsive design'));
      expect(responsiveWarning).toBeDefined();
    });

    it('should combine architecture and styling warnings', () => {
      const files = {
        'src/App.tsx': 'export default function App() { const [count, setCount] = useState(0); return <div>App</div>; }',
        'src/components/Button.tsx': 'export const Button = () => <button>Click</button>;',
      };

      const warnings = validateProjectQuality(files);

      // Should have both architecture warnings (hooks, types, organization)
      // and styling warnings (no CSS files)
      expect(warnings.length).toBeGreaterThan(2);

      const architectureWarnings = warnings.filter(w => w.type === 'architecture_warning');
      const stylingWarnings = warnings.filter(w => w.type === 'styling_warning');

      expect(architectureWarnings.length).toBeGreaterThan(0);
      expect(stylingWarnings.length).toBeGreaterThan(0);
    });
  });
});
