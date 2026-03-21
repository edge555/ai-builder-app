/**
 * Analysis Module
 *
 * Re-exports AI-powered file planning used by the modification engine.
 */

export { FilePlanner, createFilePlanner, TokenBudgetManager } from './file-planner';
export { analyzeImpact, type ImpactReport } from './impact-analyzer';
