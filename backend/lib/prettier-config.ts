import * as prettier from 'prettier';

/**
 * Shared Prettier formatting options used across the application.
 */
export const prettierOptions: prettier.Options = {
  semi: true,
  singleQuote: true,
  trailingComma: 'es5',
  printWidth: 100,
  tabWidth: 2,
};

/**
 * Determines the appropriate Prettier parser based on file extension.
 * 
 * @param filePath - The path to the file to be formatted
 * @returns The parser name for Prettier, or undefined if no parser is available
 */
export function getParserForFile(filePath: string): string | undefined {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();

  if (['.ts', '.tsx'].includes(ext)) return 'typescript';
  if (['.js', '.jsx'].includes(ext)) return 'babel';
  if (['.css', '.scss'].includes(ext)) return 'css';
  if (ext === '.json') return 'json';
  if (ext === '.html') return 'html';
  if (ext === '.md') return 'markdown';

  return undefined;
}

/**
 * Formats code content using Prettier with shared configuration.
 * 
 * @param content - The code content to format
 * @param filePath - The file path (used to determine the parser)
 * @returns The formatted content, or the original content if formatting fails
 */
export async function formatCode(content: string, filePath: string): Promise<string> {
  const parser = getParserForFile(filePath);

  if (!parser) {
    return content;
  }

  try {
    return await prettier.format(content, {
      ...prettierOptions,
      parser,
    });
  } catch (e) {
    // If formatting fails, return original content
    return content;
  }
}
