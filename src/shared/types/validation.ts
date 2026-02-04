/**
 * Result of validating AI-generated output.
 */
export interface ValidationResult {
  /** Whether the output is valid */
  valid: boolean;
  /** List of validation errors */
  errors: ValidationError[];
  /** Sanitized output if validation passed */
  sanitizedOutput?: Record<string, string>;
}

/**
 * A single validation error.
 */
export interface ValidationError {
  /** Type of validation error */
  type: 'invalid_json' | 'invalid_path' | 'syntax_error' | 'forbidden_pattern' | 'architecture_warning';
  /** Human-readable error message */
  message: string;
  /** File path where the error occurred (if applicable) */
  filePath?: string;
  /** Line number where the error occurred (if applicable) */
  line?: number;
}
