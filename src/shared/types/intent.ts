/**
 * Result of classifying a user's modification intent.
 */
export interface IntentClassification {
  /** Type of modification requested */
  type:
  | 'generate'
  | 'add_component'
  | 'modify_component'
  | 'add_route'
  | 'modify_style'
  | 'refactor'
  | 'delete'
  | 'other';
  /** Confidence score (0-1) */
  confidence: number;
  /** File paths or component names affected */
  affectedAreas: string[];
  /** Human-readable description of the intent */
  description: string;
}
