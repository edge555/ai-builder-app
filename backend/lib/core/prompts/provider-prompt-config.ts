/**
 * Provider Prompt Configuration
 * Controls how prompts are assembled for the active AI provider.
 */

export interface ProviderPromptConfig {
  provider: 'openrouter';
  /** Approximate output token budget to communicate to the model */
  outputBudgetTokens: number;
  /** Whether to include detailed React/CSS/JSON guidance */
  includeDetailedGuidance: boolean;
}

export function getProviderPromptConfig(): ProviderPromptConfig {
  return {
    provider: 'openrouter',
    outputBudgetTokens: 28000,
    includeDetailedGuidance: false,
  };
}
