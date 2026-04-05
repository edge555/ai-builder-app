import type { ProjectOutput } from '../../schemas';
import { BEGINNER_LANDING_OUTPUT, COUNTER_AFTER_LABEL_FILES, COUNTER_AFTER_RESET_FILES, COUNTER_BEFORE_FILES, SIMPLE_COUNTER_OUTPUT } from './fixtures';

export interface GenerationEvalCase {
  id: string;
  prompt: string;
  output: ProjectOutput;
  referencePromptId?: string;
  requiredPatterns?: string[];
  forbiddenPatterns?: string[];
}

export interface ModificationEvalCase {
  id: string;
  prompt: string;
  beforeFiles: Record<string, string>;
  afterFiles: Record<string, string>;
  requiredChangedFiles: string[];
  requiredPatterns?: string[];
  unchangedFiles?: string[];
}

export const GENERATION_EVAL_CASES: GenerationEvalCase[] = [
  {
    id: 'beginner-counter-generation',
    prompt: 'Build a simple counter app with increment and decrement buttons.',
    output: SIMPLE_COUNTER_OUTPUT,
    referencePromptId: 'simple-counter',
    requiredPatterns: ['Increment', 'Decrement'],
  },
  {
    id: 'beginner-landing-generation',
    prompt: 'Create a beginner-friendly landing page for a habit tracker app.',
    output: BEGINNER_LANDING_OUTPUT,
    requiredPatterns: ['Start tracking', 'See demo', 'Daily check-ins'],
    forbiddenPatterns: ['TODO', 'FIXME'],
  },
];

export const MODIFICATION_EVAL_CASES: ModificationEvalCase[] = [
  {
    id: 'simple-text-modification',
    prompt: 'Rename the counter labels to be friendlier for beginners.',
    beforeFiles: COUNTER_BEFORE_FILES,
    afterFiles: COUNTER_AFTER_LABEL_FILES,
    requiredChangedFiles: ['src/App.tsx'],
    requiredPatterns: ['Current count', 'Increase', 'Decrease'],
    unchangedFiles: ['src/main.tsx', 'src/index.css'],
  },
  {
    id: 'simple-feature-modification',
    prompt: 'Add a reset button to the counter app.',
    beforeFiles: COUNTER_BEFORE_FILES,
    afterFiles: COUNTER_AFTER_RESET_FILES,
    requiredChangedFiles: ['src/App.tsx'],
    requiredPatterns: ['Reset', 'setCount(0)'],
    unchangedFiles: ['src/main.tsx', 'src/index.css'],
  },
];

