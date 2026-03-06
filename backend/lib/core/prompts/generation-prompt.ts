/**
 * Generation Prompt Module
 * Contains the system prompt and output schema for project generation.
 * Requirements: 8.2, 8.3
 */

import {
  LAYOUT_FUNDAMENTALS,
  DESIGN_SYSTEM_CONSTANTS,
  ACCESSIBILITY_GUIDANCE,
  DEPENDENCY_GUIDANCE,
  getOutputBudgetGuidance,
  SYNTAX_INTEGRITY_RULES,
  COMMON_REACT_PATTERNS,
  DETAILED_REACT_GUIDANCE,
  DETAILED_CSS_GUIDANCE,
  DETAILED_JSON_OUTPUT_GUIDANCE,
  wrapUserInput
} from './shared-prompt-fragments';
import { getProviderPromptConfig } from './provider-prompt-config';

/**
 * Builds the system prompt for project generation.
 * Instructs the AI to output structured JSON with complete file contents.
 */
function shouldIncludeDesignSystem(userPrompt: string): boolean {
  if (!userPrompt) return false;

  const prompt = userPrompt.toLowerCase();

  // Negation words that suppress a match when appearing within 3 words before the keyword
  const NEGATION_RE = /\b(?:no|not|don't|dont|without|avoid|skip)\b/;

  function isNegated(kw: string): boolean {
    const idx = prompt.indexOf(kw);
    if (idx === -1) return false;
    // Grab up to 30 chars before the keyword and check for negation
    const before = prompt.slice(Math.max(0, idx - 30), idx);
    // Only consider the last 3 words before the keyword
    const words = before.trimEnd().split(/\s+/).slice(-3).join(' ');
    return NEGATION_RE.test(words);
  }

  // Multi-word phrases — word-boundary regex match
  const phraseKeywords = [
    // Explicit design requests
    'beautiful ui', 'beautiful design', 'premium design', 'modern ui', 'modern design',
    'clean ui', 'clean design', 'professional ui', 'professional design', 'professional look',
    'good looking', 'good-looking', 'nice looking', 'nice-looking',
    'visually appealing', 'eye-catching', 'eye catching',
    'pixel-perfect', 'pixel perfect', 'ui/ux', 'ui design', 'ux design',
    // Design systems & frameworks
    'design system', 'tailwind', 'chakra ui', 'material ui', 'mantine', 'shadcn',
    'ant design', 'bootstrap',
    // Page types that need strong design
    'landing page', 'marketing site', 'marketing page', 'portfolio site', 'portfolio page',
    'hero section', 'call to action',
    // Layout & interaction patterns
    'responsive layout', 'dark mode', 'light mode', 'dark theme', 'light theme',
    'card layout', 'card-based',
    // Design references
    'dribbble', 'behance', 'figma',
  ];

  for (const kw of phraseKeywords) {
    const escaped = kw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'i');
    if (re.test(prompt) && !isNegated(kw)) return true;
  }

  // Single-word signals — matched with word boundaries to reduce false positives
  // Removed 'theme'/'dashboard' — these are feature signals, not design signals
  const wordKeywords = [
    'sleek', 'polished', 'elegant', 'stylish', 'aesthetic', 'aesthetics',
    'minimalist', 'minimalistic', 'sophisticated', 'refined',
    'animated', 'animation', 'animations', 'glassmorphism', 'gradient', 'gradients',
  ];

  return wordKeywords.some((word) => {
    const re = new RegExp(`\\b${word}\\b`, 'i');
    return re.test(prompt) && !isNegated(word);
  });
}

type ComplexityLevel = 'simple' | 'medium' | 'complex';

/**
 * Detect project complexity from the user prompt.
 * Counts distinct feature/scope signals to classify as simple, medium, or complex.
 */
function detectComplexity(userPrompt: string): ComplexityLevel {
  const prompt = userPrompt.toLowerCase();

  // Feature signals — each match adds 1 point
  const featureSignals = [
    /\bauth(?:entication|orization)?\b/, /\blogin\b/, /\bsign[\s-]?up\b/, /\bregist(?:er|ration)\b/,
    /\bdashboard\b/, /\badmin\s*panel\b/, /\banalytics\b/,
    /\bchart(?:s|ing)?\b/, /\bgraph(?:s|ing)?\b/, /\bvisualization\b/,
    /\bcrud\b/, /\bcreate.*(?:read|edit|delete)\b/,
    /\bsettings?\s*page\b/, /\bprofile\s*page\b/, /\bpreferences\b/,
    /\brouting\b/, /\bmulti[\s-]?page\b/, /\bpages?\b.*\bpages?\b/,
    /\bsearch(?:ing|able)?\b/, /\bfilter(?:ing|s|able)?\b/, /\bsort(?:ing|able)\b/,
    /\bnotification(?:s)?\b/, /\breal[\s-]?time\b/, /\bwebsocket\b/,
    /\be[\s-]?commerce\b/, /\bshopping\s*cart\b/, /\bcheckout\b/, /\bpayment\b/,
    /\bdrag[\s-]?(?:and[\s-]?)?drop\b/, /\bkanban\b/,
    /\bform(?:s)?\b.*\bvalidation\b/, /\bmulti[\s-]?step\s*form\b/,
    /\bchat\b/, /\bmessaging\b/,
    /\bfile\s*upload\b/, /\bimage\s*upload\b/,
    /\btable(?:s)?\b.*\bpagination\b/, /\bdata\s*table\b/,
    /\bapi\s*integration\b/, /\bfetch.*data\b/,
    /\bdark[\s-]?mode\b.*\blight[\s-]?mode\b/, /\btheme\s*switch\b/,
  ];

  let score = 0;
  for (const signal of featureSignals) {
    if (signal.test(prompt)) score++;
  }

  if (score >= 5) return 'complex';
  if (score >= 2) return 'medium';
  return 'simple';
}

/** Return scaled FILE REQUIREMENTS guidance based on detected complexity. */
function getFileRequirements(complexity: ComplexityLevel): string {
  switch (complexity) {
    case 'simple':
      return `=== FILE REQUIREMENTS (simple project) ===
Generate a focused set of files: package.json, main.tsx, App.tsx (max 50 lines), index.css, types, 1–2 UI components, 1 layout component, 1–2 feature components, 1 hook if needed.
Keep the project small and focused — do not over-engineer.`;

    case 'complex':
      return `=== FILE REQUIREMENTS (complex project) ===
Generate a comprehensive file set: package.json, main.tsx, App.tsx (routing/layout only, max 50 lines), index.css, types, 4–6 UI components, 2–3 layout components, 4–6 feature components, 2–4 hooks.
Use react-router-dom for multi-page apps. Split large features into sub-components. Create shared hooks for repeated logic.`;

    default: // medium
      return `=== FILE REQUIREMENTS ===
Generate files appropriate to complexity: package.json, main.tsx, App.tsx (max 50 lines), index.css, types, 2–3 UI components, 1–2 layout components, 2–3 feature components, 1–2 hooks.`;
  }
}

function buildGenerationPrompt(userPrompt: string): string {
  const config = getProviderPromptConfig();
  const complexity = detectComplexity(userPrompt);
  return `You are a SENIOR React architect generating production-quality, modular React applications.
CRITICAL: NEVER put everything in App.tsx — use proper component separation.

=== PROJECT STRUCTURE ===
- package.json (all dependencies)
- src/main.tsx (entry point only — ReactDOM.render)
- src/App.tsx (layout/routing only, max 50 lines)
- src/index.css (global styles, CSS variables, resets)
- src/components/ui/*.tsx + *.css (reusable: Button, Input, Card, Modal)
- src/components/layout/*.tsx + *.css (Header, Footer, Sidebar)
- src/components/features/*.tsx + *.css (domain-specific components)
- src/hooks/*.ts (custom hooks: useLocalStorage, useForm)
- src/types/index.ts (TypeScript interfaces)

=== COMPONENT RULES ===
- Single responsibility, under 80 lines each. Split if larger.
- UI components = pure presentation via props. Containers = state + data flow. Hooks = reusable logic.
- Create generic reusable UI components (Button, Input, Card). Co-locate CSS per component.

${getFileRequirements(complexity)}

${LAYOUT_FUNDAMENTALS}

${shouldIncludeDesignSystem(userPrompt) ? `${DESIGN_SYSTEM_CONSTANTS}
` : ''}
${ACCESSIBILITY_GUIDANCE}

=== CSS BEST PRACTICES ===
- BEM-like naming per component. No inline styles. Use modern CSS (aspect-ratio, clamp()).
- Components MUST reference these variables instead of hardcoded values.
- Define all tokens in :root in index.css using this starter set:
  --color-primary: #3b82f6;    --color-primary-hover: #2563eb;
  --color-bg: #ffffff;         --color-surface: #f8fafc;
  --color-text: #1e293b;       --color-text-secondary: #64748b;
  --color-border: #e2e8f0;     --color-error: #ef4444;
  --color-success: #22c55e;
  --space-xs: 4px; --space-sm: 8px; --space-md: 16px; --space-lg: 24px; --space-xl: 32px;
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --text-sm: 0.875rem; --text-base: 1rem; --text-lg: 1.125rem; --text-xl: 1.25rem;
  --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05); --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1);

${DEPENDENCY_GUIDANCE}

${SYNTAX_INTEGRITY_RULES}

${COMMON_REACT_PATTERNS}

${config.includeDetailedGuidance ? `${DETAILED_REACT_GUIDANCE}

${DETAILED_CSS_GUIDANCE}

${DETAILED_JSON_OUTPUT_GUIDANCE}

` : ''}${getOutputBudgetGuidance(config.outputBudgetTokens)}

${wrapUserInput(userPrompt)}

Generate a complete React application with perfect syntax and proper component separation.`;
}


/**
 * Builds a generation prompt with user input properly wrapped for injection defense.
 */
export function getGenerationPrompt(userPrompt: string): string {
  return buildGenerationPrompt(userPrompt);
}

import { ProjectOutputSchema } from '../schemas';
import { toSimpleJsonSchema } from '../zod-to-json-schema';

/**
 * JSON Schema for project generation output.
 * Forces the AI to return properly structured JSON.
 * Note: Some providers don't support additionalProperties, so we use an array structure instead.
 */
export const PROJECT_OUTPUT_SCHEMA = toSimpleJsonSchema(ProjectOutputSchema);
