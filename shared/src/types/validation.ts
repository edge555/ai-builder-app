/**
 * Result of validating AI-generated output.
 */
export interface ValidationResult {
  /** Whether the output is valid */
  valid: boolean;
  /** List of blocking validation errors */
  errors: ValidationError[];
  /** List of non-blocking quality warnings */
  warnings?: ValidationError[];
  /** Sanitized output if validation passed */
  sanitizedOutput?: Record<string, string>;
}

/**
 * A single validation error.
 */
export interface ValidationError {
  /** Type of validation error */
  type: 'invalid_json' | 'invalid_path' | 'syntax_error' | 'forbidden_pattern' | 'file_too_large' | 'missing_structure' | 'architecture_warning' | 'styling_warning';
  /** Human-readable error message */
  message: string;
  /** File path where the error occurred (if applicable) */
  filePath?: string;
  /** Line number where the error occurred (if applicable) */
  line?: number;
}
