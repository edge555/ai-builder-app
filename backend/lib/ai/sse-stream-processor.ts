import { createLogger } from '../logger';
import { stateError } from '@ai-app-builder/shared/utils';

const logger = createLogger('sse-stream-processor');

/**
 * Reads an SSE response body, calling parseLine() on each line to extract tokens.
 * Returns the full accumulated content string.
 *
 * @param response   The fetch Response with an SSE body
 * @param parseLine  Provider-specific parser: given a raw SSE line, returns a token string or null
 * @param onToken    Called for each extracted token with the token and running total length
 * @param serviceName Used in error messages (e.g. 'OpenRouter')
 */
export async function processSSEStream(
  response: Response,
  parseLine: (line: string) => string | null,
  onToken: (token: string, totalLength: number) => void,
  serviceName: string
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error(stateError(serviceName, 'response body is null'));
  }

  const decoder = new TextDecoder();
  let accumulated = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const token = parseLine(line);
      if (token !== null) {
        accumulated += token;
        onToken(token, accumulated.length);
      }
    }
  }

  return accumulated;
}
