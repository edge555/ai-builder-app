/**
 * Gemini Response Validator
 * Validates and extracts content from Gemini API responses.
 */

import { createLogger } from '../logger';
import { truncatePayload } from './gemini-utils';
import type { GeminiAPIResponse } from './gemini-types';

const logger = createLogger('gemini-response-validator');

/**
 * Validates and extracts text content from a Gemini API response.
 * Throws an error if the response doesn't contain valid content.
 */
export function extractResponseContent(data: GeminiAPIResponse): string {
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) {
    logger.error('No content found in Gemini response', {
      response: truncatePayload(JSON.stringify(data, null, 2)),
    });
    throw new Error('No content in Gemini response');
  }

  return content;
}

/**
 * Validates that accumulated streaming content is not empty.
 * Throws an error if no content was received.
 */
export function validateStreamingContent(accumulated: string): void {
  if (!accumulated) {
    throw new Error('No content in streaming response');
  }
}
