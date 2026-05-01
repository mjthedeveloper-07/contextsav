export type OutputFormat = 'plain' | 'markdown' | 'xml';

export interface Config {
  maxTokens?: number;
  include?: string | string[];
  exclude?: string | string[];
  diff?: boolean;
  all?: boolean;
  format?: OutputFormat;
  maxFileSize?: number;
  noHeader?: boolean;
  model?: string;
  lang?: string;
}

export interface Profile {
  model?: string;
  format?: OutputFormat;
  maxTokens?: number;
  lang?: string;
  all?: boolean;
  diff?: boolean;
  include?: string;
  exclude?: string;
  summary?: boolean;
  deps?: boolean;
  truncate?: boolean;
  env?: boolean;
  ignoreTests?: boolean;
  onlyTests?: boolean;
  compact?: boolean;
  gitLog?: number;
  search?: string;
  prompt?: string;
  promptFile?: string;
  split?: number;
}

export interface FileEntry {
  path: string;
  tokens: number;
  content: string;
  modifiedAt: number;
}

export interface JsonOutput {
  project: string;
  branch: string | null;
  model: string;
  capturedAt: string;
  files: Omit<FileEntry, 'modifiedAt'>[];
  totalTokens: number;
  truncated: boolean;
}

export interface CaptureOptions {
  interactive?: boolean;
  stats?: boolean;
  history?: boolean;
  dryRun?: boolean;
  output?: string;
  saveHistory?: boolean;
  all?: boolean;
  recent?: string;
  lang?: string;
  include?: string;
  exclude?: string;
  since?: string;
  format?: string;
  model?: string;
  maxTokens?: string;
  diff?: boolean;
  summary?: boolean;
  json?: boolean;
  header?: boolean;
  deps?: boolean;
  truncate?: boolean;
  stdin?: boolean;
  profile?: string;
  watch?: boolean;
  prompt?: string;
  promptFile?: string;
  env?: boolean;
  ignoreTests?: boolean;
  onlyTests?: boolean;
  compact?: boolean;
  gitLog?: string;
  search?: string;
  split?: string;
}
