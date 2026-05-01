import * as path from 'path';

export function smartTruncate(content: string, filePath: string): string {
  const lines = content.split('\n');
  const HEAD = 80;
  const TAIL = 30;
  if (lines.length <= HEAD + TAIL) return content;
  const omitted = lines.length - HEAD - TAIL;
  const ext = path.extname(filePath);
  const comment = ['.py', '.rb', '.sh', '.yaml', '.yml'].includes(ext) ? '#' : '//';
  return [
    ...lines.slice(0, HEAD),
    `${comment} … ${omitted} lines omitted (remove --truncate to see full file) …`,
    ...lines.slice(-TAIL),
  ].join('\n');
}

export function compactBlankLines(content: string): string {
  return content.replace(/\n{3,}/g, '\n\n');
}
