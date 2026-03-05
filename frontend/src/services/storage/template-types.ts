import type { StarterTemplate } from '../../data/templates';

export interface UserTemplate extends StarterTemplate {
  /** Full file snapshot of the project */
  files: Record<string, string>;
  /** Base64 PNG screenshot of the preview, or null if capture failed */
  screenshot: string | null;
  /** ISO timestamp when the template was saved */
  createdAt: string;
  /** Discriminator flag to distinguish user templates from starter templates */
  isUserTemplate: true;
}
