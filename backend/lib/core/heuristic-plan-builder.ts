/**
 * @module core/heuristic-plan-builder
 * @description Provides a fallback architecture plan when the AI planning stage fails.
 */

import { ArchitecturePlan } from './prompts/prompt-provider';
import { IntentOutput } from './schemas';

/**
 * Builds a heuristic (safe minimal) architecture plan based on the intent.
 * Used as a fallback if the LLM planning stage fails or times out.
 */
export function buildHeuristicPlan(intent: IntentOutput | null, userPrompt: string): ArchitecturePlan {
    // Basic single-file generation for now as a safe stub
    // Task 5.7 will expand this to create a more comprehensive heuristic plan
    return {
        files: [
            {
                path: 'src/App.tsx',
                purpose: 'Main entry point and UI component',
                layer: 'ui',
                exports: ['default App'],
                imports: []
            }
        ],
        components: ['App'],
        dependencies: ['react', 'react-dom'],
        routing: [],
        typeContracts: [],
        cssVariables: [],
        stateShape: {
            contexts: [],
            hooks: []
        }
    };
}
