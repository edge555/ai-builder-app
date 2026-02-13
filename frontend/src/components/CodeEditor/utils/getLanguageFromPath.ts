const extToLanguage: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.json': 'json',
  '.css': 'css',
  '.html': 'html',
  '.htm': 'html',
  '.md': 'markdown',
  '.svg': 'xml',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
};

export function getLanguageFromPath(filePath: string): string {
  const dotIndex = filePath.lastIndexOf('.');
  if (dotIndex === -1) return 'plaintext';
  const ext = filePath.slice(dotIndex).toLowerCase();
  return extToLanguage[ext] ?? 'plaintext';
}
