/**
 * Provider Prompt Configuration
 * Controls how prompts are assembled based on the active AI provider.
 * Modal/Qwen is billed per GPU-hour (not per token), so richer prompts are free.
 * Qwen 7B is less capable than Gemini and benefits from more explicit guidance.
 */

export interface ProviderPromptConfig {
  provider: 'modal' | 'openrouter';
  /** Approximate output token budget to communicate to the model */
  outputBudgetTokens: number;
  /** Whether to include detailed React/CSS/JSON guidance (for less capable models) */
  includeDetailedGuidance: boolean;
}

/**
 * Returns prompt configuration based on the active AI provider.
 * Reads AI_PROVIDER from the environment on each call.
 */
export function getProviderPromptConfig(): ProviderPromptConfig {
  const provider = (process.env.AI_PROVIDER ?? 'openrouter') as 'modal' | 'openrouter';

  if (provider === 'modal') {
    return {
      provider: 'modal',
      outputBudgetTokens: 30000,
      includeDetailedGuidance: true,
    };
  }

  return {
    provider: 'openrouter',
    outputBudgetTokens: 28000,
    includeDetailedGuidance: false,
  };
}
