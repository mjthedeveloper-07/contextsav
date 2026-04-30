#!/usr/bin/env node
import { Command } from 'commander';
import fg from 'fast-glob';
import ignore from 'ignore';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import clipboard from 'clipboardy';
import { load as parseYaml } from 'js-yaml';

const ALWAYS_EXCLUDE = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.env', '.env.*'];
const SOURCE_GLOB = '**/*.{ts,tsx,js,jsx,mjs,cjs,py,go,rs,rb,java,cs,php,swift,kt,vue,svelte,c,cpp,h,hpp}';
const CONFIG_FILE = '.contextsav.yml';
const GLOBAL_CONFIG = path.join(os.homedir(), '.contextsav.yml');
const MAX_FILE_BYTES = 200 * 1024; // 200 KB per file — skip larger ones

type OutputFormat = 'plain' | 'markdown' | 'xml';

interface Config {
  maxTokens?: number;
  include?: string | string[];
  exclude?: string | string[];
  diff?: boolean;
  all?: boolean;
  format?: OutputFormat;
  maxFileSize?: number;
  noHeader?: boolean;
}

interface FileEntry {
  path: string;
  tokens: number;
  content: string;
  modifiedAt: number;
}

interface JsonOutput {
  project: string;
  branch: string | null;
  capturedAt: string;
  files: Omit<FileEntry, 'modifiedAt'>[];
  totalTokens: number;
  truncated: boolean;
}

// ── Security helpers ─────────────────────────────────────────────────────────

function isWithinRoot(filePath: string, root: string): boolean {
  const resolved = path.resolve(filePath);
  // Guard against path traversal — file must stay inside project root
  return resolved.startsWith(root + path.sep) || resolved === root;
}

function isBinary(filePath: string): boolean {
  try {
    const SAMPLE = 8000;
    const buf = Buffer.alloc(SAMPLE);
    const fd = fs.openSync(filePath, 'r');
    const bytesRead = fs.readSync(fd, buf, 0, SAMPLE, 0);
    fs.closeSync(fd);
    // Null bytes → binary file
    return buf.slice(0, bytesRead).includes(0);
  } catch {
    return true;
  }
}

function validateConfig(raw: unknown): Config {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const safe: Config = {};

  if (typeof obj['maxTokens'] === 'number') safe.maxTokens = Math.max(100, Math.min(obj['maxTokens'], 200_000));
  if (typeof obj['maxFileSize'] === 'number') safe.maxFileSize = Math.max(1024, obj['maxFileSize']);
  if (typeof obj['diff'] === 'boolean') safe.diff = obj['diff'];
  if (typeof obj['all'] === 'boolean') safe.all = obj['all'];
  if (typeof obj['noHeader'] === 'boolean') safe.noHeader = obj['noHeader'];
  if (['plain', 'markdown', 'xml'].includes(obj['format'] as string)) safe.format = obj['format'] as OutputFormat;

  for (const key of ['include', 'exclude'] as const) {
    const v = obj[key];
    if (typeof v === 'string') safe[key] = v;
    else if (Array.isArray(v) && v.every(x => typeof x === 'string')) safe[key] = v as string[];
  }

  return safe;
}

// ── Config loading ────────────────────────────────────────────────────────────

function loadConfig(root: string): Config {
  // Global config first, project config overrides it
  const global = readConfigFile(GLOBAL_CONFIG);
  const local = readConfigFile(path.join(root, CONFIG_FILE));
  return { ...global, ...local };
}

function readConfigFile(filePath: string): Config {
  if (!fs.existsSync(filePath)) return {};
  try {
    return validateConfig(parseYaml(fs.readFileSync(filePath, 'utf-8')));
  } catch {
    console.warn(`⚠️  Could not parse ${filePath} — ignoring it.`);
    return {};
  }
}

// ── Git helpers ───────────────────────────────────────────────────────────────

function getChangedFiles(root: string): string[] {
  const run = (cmd: string) =>
    execSync(cmd, { encoding: 'utf-8', cwd: root, stdio: ['pipe', 'pipe', 'pipe'] })
      .trim()
      .split('\n')
      .filter(Boolean);

  const staged = run('git diff --cached --name-only');
  const unstaged = run('git diff --name-only');
  const untracked = run('git ls-files --others --exclude-standard');

  return [...new Set([...staged, ...unstaged, ...untracked])].map(f =>
    path.resolve(root, f)
  );
}

function getGitBranch(root: string): string | null {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf-8', cwd: root, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function getProjectName(root: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
    if (typeof pkg.name === 'string' && pkg.name) return pkg.name;
  } catch { /* no package.json */ }
  return path.basename(root);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value)
    ? value
    : value.split(',').map(s => s.trim()).filter(Boolean);
}

function loadGitignore(root: string): ReturnType<typeof ignore> {
  const ig = ignore();
  const gitignorePath = path.join(root, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    ig.add(fs.readFileSync(gitignorePath, 'utf-8'));
  }
  ig.add(ALWAYS_EXCLUDE);
  return ig;
}

// ── Output formatting ─────────────────────────────────────────────────────────

function buildHeader(project: string, branch: string | null): string {
  const date = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  return `Project: ${project}${branch ? ` | Branch: ${branch}` : ''} | ${date}\n${'─'.repeat(60)}\n\n`;
}

function formatEntries(entries: FileEntry[], format: OutputFormat, header: string, diffBlock: string): string {
  const blocks = entries.map(e => {
    const content = e.content;
    switch (format) {
      case 'markdown':
        return `### \`${e.path}\`\n\`\`\`\n${content}\n\`\`\`\n`;
      case 'xml':
        return `<file path="${e.path}">\n${content}\n</file>\n`;
      default:
        return `// ${e.path}\n${content}\n\n`;
    }
  });

  if (format === 'xml') {
    return `${header}<context>\n${diffBlock}${blocks.join('')}</context>\n`;
  }
  return `${header}${diffBlock}${blocks.join('')}`;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('contextsav')
  .description('Save the perfect AI context from your project in one command')
  .version('1.1.0')
  .option('-o, --output <file>', 'write context to a file instead of clipboard')
  .option('-t, --max-tokens <number>', 'token budget for output (default: 4000)')
  .option('-i, --include <patterns>', 'extra glob patterns to include (comma-separated)')
  .option('-e, --exclude <patterns>', 'extra patterns to exclude (comma-separated)')
  .option('-f, --format <type>', 'output format: plain (default), markdown, xml')
  .option('--diff', 'prepend git diff to context')
  .option('--all', 'include all source files, not just changed ones')
  .option('--dry-run', 'show what would be captured without copying or writing')
  .option('--json', 'output as structured JSON')
  .option('--no-header', 'omit the project/branch/date header')
  .action(async options => {
    const root = process.cwd();

    // Merge global + project config; CLI flags win
    const config = loadConfig(root);

    const maxTokens = parseInt(options.maxTokens as string, 10) || config.maxTokens || 4000;
    const maxFileBytes = config.maxFileSize || MAX_FILE_BYTES;
    const useAll = (options.all as boolean) || config.all || false;
    const useDiff = (options.diff as boolean) || config.diff || false;
    const showHeader = !(options.noHeader as boolean) && !config.noHeader;
    const format: OutputFormat = (['plain', 'markdown', 'xml'].includes(options.format as string)
      ? options.format
      : config.format || 'plain') as OutputFormat;

    const ig = loadGitignore(root);
    const excludePatterns = [...toArray(options.exclude as string), ...toArray(config.exclude)];
    if (excludePatterns.length) ig.add(excludePatterns);

    // Gather candidate files
    let candidates: string[] = [];
    let scanAll = useAll;

    if (!scanAll) {
      try {
        candidates = getChangedFiles(root);
      } catch {
        console.warn('⚠️  Not a git repo — scanning all source files.');
        scanAll = true;
      }
    }

    if (scanAll || candidates.length === 0) {
      candidates = await fg(SOURCE_GLOB, { cwd: root, absolute: true, dot: false });
    }

    const includePatterns = [...toArray(options.include as string), ...toArray(config.include)];
    if (includePatterns.length) {
      const extra = await fg(includePatterns, { cwd: root, absolute: true });
      candidates.push(...extra);
    }

    // Filter: ignored, outside root (path traversal guard), binary, oversized
    const files = [...new Set(candidates)].filter(f => {
      if (!isWithinRoot(f, root)) return false;
      const rel = path.relative(root, f);
      if (ig.ignores(rel)) return false;
      try {
        const stat = fs.statSync(f);
        if (!stat.isFile() || stat.size > maxFileBytes) return false;
      } catch { return false; }
      if (isBinary(f)) return false;
      return true;
    });

    // Sort by most recently modified — most relevant files first
    files.sort((a, b) => {
      try { return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs; }
      catch { return 0; }
    });

    if (files.length === 0) {
      console.log('Nothing to capture. Stage some changes or use --all to scan the whole project.');
      process.exit(0);
    }

    // Build entries within token budget
    const entries: FileEntry[] = [];
    let tokens = 0;
    let truncated = false;

    let diffBlock = '';
    if (useDiff) {
      try {
        const diff = execSync('git diff', { encoding: 'utf-8', cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
        const candidate = format === 'xml'
          ? `<diff>\n${diff}\n</diff>\n`
          : `// --- git diff ---\n${diff}\n\n`;
        const t = estimateTokens(candidate);
        if (t < maxTokens) { diffBlock = candidate; tokens += t; }
      } catch { /* not a git repo */ }
    }

    for (const file of files) {
      try {
        const rel = path.relative(root, file);
        const content = fs.readFileSync(file, 'utf-8');
        const stat = fs.statSync(file);
        const block = `// ${rel}\n${content}\n\n`;
        const t = estimateTokens(block);
        if (tokens + t > maxTokens) { truncated = true; break; }
        entries.push({ path: rel, tokens: t, content, modifiedAt: stat.mtimeMs });
        tokens += t;
      } catch { /* unreadable — skip */ }
    }

    // --dry-run: preview only
    if (options.dryRun) {
      console.log(`\nDry run — ${entries.length} file(s), ~${tokens} tokens${truncated ? ' (truncated)' : ''}:\n`);
      for (const e of entries) {
        const age = Math.round((Date.now() - e.modifiedAt) / 60000);
        const ageStr = age < 60 ? `${age}m ago` : age < 1440 ? `${Math.round(age / 60)}h ago` : `${Math.round(age / 1440)}d ago`;
        console.log(`  ${e.path}  (~${e.tokens} tokens, modified ${ageStr})`);
      }
      if (truncated) console.log('\n  ⚠️  Budget hit — raise it with -t <number>');
      process.exit(0);
    }

    // Build output
    const project = getProjectName(root);
    const branch = getGitBranch(root);
    const header = showHeader ? buildHeader(project, branch) : '';

    let output: string;
    if (options.json) {
      const result: JsonOutput = {
        project,
        branch,
        capturedAt: new Date().toISOString(),
        files: entries.map(({ modifiedAt: _m, ...rest }) => rest),
        totalTokens: tokens,
        truncated,
      };
      output = JSON.stringify(result, null, 2);
    } else {
      output = formatEntries(entries, format, header, diffBlock);
    }

    if (options.output) {
      fs.writeFileSync(options.output as string, output, 'utf-8');
      console.log(`✅ Saved to ${options.output} — ${entries.length} files, ~${tokens} tokens`);
    } else {
      clipboard.writeSync(output);
      console.log(`✅ Copied to clipboard — ${entries.length} files, ~${tokens} tokens`);
    }

    if (truncated) {
      console.log(`⚠️  Truncated at ${maxTokens} tokens. Use -t to raise the budget.`);
    }
  });

program.parse();
