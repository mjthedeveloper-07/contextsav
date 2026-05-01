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
import { checkbox, input, confirm, select } from '@inquirer/prompts';

// ── Constants ────────────────────────────────────────────────────────────────

const ALWAYS_EXCLUDE = [
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage',
  '.env', '.env.*', '*.lock', 'pnpm-lock.yaml', 'yarn.lock',
];
const CONFIG_FILE = '.contextsav.yml';
const GLOBAL_CONFIG = path.join(os.homedir(), '.contextsav.yml');
const HISTORY_DIR = path.join(os.homedir(), '.contextsav', 'history');
const MAX_FILE_BYTES = 200 * 1024;

// Language → glob extension mapping
const LANG_MAP: Record<string, string> = {
  ts: '{ts,tsx}', js: '{js,jsx,mjs,cjs}', py: 'py', go: 'go',
  rs: 'rs', rb: 'rb', java: 'java', cs: 'cs', php: 'php',
  swift: 'swift', kt: '{kt,kts}', vue: 'vue', svelte: 'svelte',
  cpp: '{c,cpp,h,hpp}', all: '{ts,tsx,js,jsx,mjs,cjs,py,go,rs,rb,java,cs,php,swift,kt,kts,vue,svelte,c,cpp,h,hpp}',
};

const SOURCE_GLOB = `**/*.${LANG_MAP['all']}`;

// AI model presets — token budgets and preferred formats per target AI
const AI_PRESETS: Record<string, { maxTokens: number; format: OutputFormat; label: string }> = {
  claude:   { maxTokens: 100_000, format: 'xml',      label: 'Claude (Anthropic)' },
  chatgpt:  { maxTokens:  32_000, format: 'markdown', label: 'ChatGPT / GPT-4o (OpenAI)' },
  gemini:   { maxTokens: 500_000, format: 'plain',    label: 'Gemini (Google)' },
  copilot:  { maxTokens:   8_000, format: 'plain',    label: 'GitHub Copilot Chat' },
  grok:     { maxTokens: 128_000, format: 'markdown', label: 'Grok (xAI)' },
  mistral:  { maxTokens:  32_000, format: 'plain',    label: 'Mistral / Le Chat' },
  custom:   { maxTokens:   4_000, format: 'plain',    label: 'Other / Custom' },
};

// ── Types ────────────────────────────────────────────────────────────────────

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
  model?: string;
  lang?: string;
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
  model: string;
  capturedAt: string;
  files: Omit<FileEntry, 'modifiedAt'>[];
  totalTokens: number;
  truncated: boolean;
}

// ── Security ─────────────────────────────────────────────────────────────────

function isWithinRoot(filePath: string, root: string): boolean {
  const resolved = path.resolve(filePath);
  return resolved.startsWith(root + path.sep) || resolved === root;
}

function isBinary(filePath: string): boolean {
  try {
    const buf = Buffer.alloc(8000);
    const fd = fs.openSync(filePath, 'r');
    const bytesRead = fs.readSync(fd, buf, 0, 8000, 0);
    fs.closeSync(fd);
    return buf.slice(0, bytesRead).includes(0);
  } catch {
    return true;
  }
}

function validateConfig(raw: unknown): Config {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const safe: Config = {};

  if (typeof obj['maxTokens'] === 'number') safe.maxTokens = Math.max(100, Math.min(obj['maxTokens'], 1_000_000));
  if (typeof obj['maxFileSize'] === 'number') safe.maxFileSize = Math.max(1024, obj['maxFileSize']);
  if (typeof obj['diff'] === 'boolean') safe.diff = obj['diff'];
  if (typeof obj['all'] === 'boolean') safe.all = obj['all'];
  if (typeof obj['noHeader'] === 'boolean') safe.noHeader = obj['noHeader'];
  if (['plain', 'markdown', 'xml'].includes(obj['format'] as string)) safe.format = obj['format'] as OutputFormat;
  if (typeof obj['model'] === 'string' && obj['model'] in AI_PRESETS) safe.model = obj['model'];
  if (typeof obj['lang'] === 'string' && obj['lang'] in LANG_MAP) safe.lang = obj['lang'];

  for (const key of ['include', 'exclude'] as const) {
    const v = obj[key];
    if (typeof v === 'string') safe[key] = v;
    else if (Array.isArray(v) && v.every(x => typeof x === 'string')) safe[key] = v as string[];
  }
  return safe;
}

// ── Config ────────────────────────────────────────────────────────────────────

function loadConfig(root: string): Config {
  return { ...readConfigFile(GLOBAL_CONFIG), ...readConfigFile(path.join(root, CONFIG_FILE)) };
}

function readConfigFile(filePath: string): Config {
  if (!fs.existsSync(filePath)) return {};
  try { return validateConfig(parseYaml(fs.readFileSync(filePath, 'utf-8'))); }
  catch { console.warn(`⚠️  Could not parse ${filePath} — ignoring it.`); return {}; }
}

// ── Git helpers ───────────────────────────────────────────────────────────────

function git(cmd: string, cwd: string): string {
  return execSync(cmd, { encoding: 'utf-8', cwd, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function getChangedFiles(root: string): string[] {
  const run = (cmd: string) => git(cmd, root).split('\n').filter(Boolean);
  const all = [...new Set([
    ...run('git diff --cached --name-only'),
    ...run('git diff --name-only'),
    ...run('git ls-files --others --exclude-standard'),
  ])];
  return all.map(f => path.resolve(root, f));
}

function getGitBranch(root: string): string | null {
  try { return git('git rev-parse --abbrev-ref HEAD', root); } catch { return null; }
}

function getProjectName(root: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
    if (typeof pkg.name === 'string' && pkg.name) return pkg.name;
  } catch { /* no package.json */ }
  return path.basename(root);
}

// ── File utilities ────────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : value.split(',').map(s => s.trim()).filter(Boolean);
}

function loadGitignore(root: string): ReturnType<typeof ignore> {
  const ig = ignore();
  const gitignorePath = path.join(root, '.gitignore');
  if (fs.existsSync(gitignorePath)) ig.add(fs.readFileSync(gitignorePath, 'utf-8'));
  ig.add(ALWAYS_EXCLUDE);
  return ig;
}

function getAge(mtimeMs: number): string {
  const min = Math.round((Date.now() - mtimeMs) / 60_000);
  if (min < 60) return `${min}m ago`;
  if (min < 1440) return `${Math.round(min / 60)}h ago`;
  return `${Math.round(min / 1440)}d ago`;
}

function buildFileTree(entries: FileEntry[]): string {
  const dirs: Record<string, string[]> = {};
  for (const e of entries) {
    const dir = path.dirname(e.path) === '.' ? '.' : path.dirname(e.path);
    (dirs[dir] ||= []).push(path.basename(e.path));
  }
  const lines = ['📁 File tree'];
  for (const [dir, files] of Object.entries(dirs).sort()) {
    lines.push(`  ${dir}/`);
    for (const f of files.sort()) lines.push(`    ${f}`);
  }
  return lines.join('\n') + '\n\n';
}

// ── Output formatting ─────────────────────────────────────────────────────────

function buildHeader(project: string, branch: string | null, model: string): string {
  const date = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const modelLabel = AI_PRESETS[model]?.label ?? model;
  return `Project: ${project}${branch ? ` | Branch: ${branch}` : ''} | ${date} | AI: ${modelLabel}\n${'─'.repeat(64)}\n\n`;
}

function formatEntries(
  entries: FileEntry[], format: OutputFormat,
  header: string, diffBlock: string, summary: string,
): string {
  const blocks = entries.map(e => {
    switch (format) {
      case 'markdown': return `### \`${e.path}\`\n\`\`\`\n${e.content}\n\`\`\`\n`;
      case 'xml':      return `<file path="${e.path}">\n${e.content}\n</file>\n`;
      default:         return `// ${e.path}\n${e.content}\n\n`;
    }
  });

  if (format === 'xml') return `${header}${summary}<context>\n${diffBlock}${blocks.join('')}</context>\n`;
  return `${header}${summary}${diffBlock}${blocks.join('')}`;
}

// ── History ───────────────────────────────────────────────────────────────────

function saveHistory(outputName: string, content: string): void {
  try {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const base = path.basename(outputName, path.extname(outputName));
    fs.writeFileSync(path.join(HISTORY_DIR, `${ts}-${base}.txt`), content, 'utf-8');
  } catch { /* non-critical */ }
}

function listHistory(): void {
  if (!fs.existsSync(HISTORY_DIR)) { console.log('No history yet.'); return; }
  const files = fs.readdirSync(HISTORY_DIR).sort().reverse().slice(0, 20);
  if (!files.length) { console.log('No history yet.'); return; }
  console.log('\nRecent captures (newest first):\n');
  for (const f of files) {
    const stat = fs.statSync(path.join(HISTORY_DIR, f));
    const kb = (stat.size / 1024).toFixed(1);
    console.log(`  ${f}  (${kb} KB)`);
  }
  console.log(`\nStored in: ${HISTORY_DIR}`);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

async function showStats(root: string): Promise<void> {
  const files = await fg(SOURCE_GLOB, { cwd: root, absolute: true, dot: false });
  const ig = loadGitignore(root);
  const filtered = files.filter(f => {
    const rel = path.relative(root, f);
    return !ig.ignores(rel) && fs.existsSync(f) && !isBinary(f);
  });

  const byExt: Record<string, { count: number; lines: number }> = {};
  let totalLines = 0;
  for (const f of filtered) {
    const ext = path.extname(f).slice(1) || 'other';
    const lines = fs.readFileSync(f, 'utf-8').split('\n').length;
    totalLines += lines;
    byExt[ext] ||= { count: 0, lines: 0 };
    byExt[ext].count++;
    byExt[ext].lines += lines;
  }

  console.log(`\n📊 Project stats for ${getProjectName(root)}\n`);
  console.log(`  Total files : ${filtered.length}`);
  console.log(`  Total lines : ${totalLines.toLocaleString()}`);
  console.log(`\n  By language :`);
  for (const [ext, s] of Object.entries(byExt).sort((a, b) => b[1].lines - a[1].lines)) {
    console.log(`    .${ext.padEnd(8)} ${String(s.count).padStart(4)} files   ${s.lines.toLocaleString()} lines`);
  }
  console.log('');
}

// ── Candidate collection (shared) ────────────────────────────────────────────

async function collectCandidates(
  root: string,
  scanAll: boolean,
  langGlob: string,
  includePatterns: string[],
  ig: ReturnType<typeof ignore>,
  maxFileBytes: number,
): Promise<string[]> {
  let candidates: string[] = [];

  if (!scanAll) {
    try { candidates = getChangedFiles(root); }
    catch { scanAll = true; console.warn('⚠️  Not a git repo — scanning all source files.'); }
  }

  if (scanAll || candidates.length === 0) {
    candidates = await fg(`**/*.${langGlob}`, { cwd: root, absolute: true, dot: false });
  }

  if (includePatterns.length) {
    const extra = await fg(includePatterns, { cwd: root, absolute: true });
    candidates.push(...extra);
  }

  return [...new Set(candidates)].filter(f => {
    if (!isWithinRoot(f, root)) return false;
    const rel = path.relative(root, f);
    if (ig.ignores(rel)) return false;
    try {
      const stat = fs.statSync(f);
      if (!stat.isFile() || stat.size > maxFileBytes) return false;
    } catch { return false; }
    return !isBinary(f);
  }).sort((a, b) => {
    try { return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs; }
    catch { return 0; }
  });
}

// ── Interactive mode ──────────────────────────────────────────────────────────

async function runInteractive(root: string): Promise<void> {
  const ig = loadGitignore(root);
  const project = getProjectName(root);

  console.log(`\n🤖 contextsav — interactive mode  (project: ${project})\n`);

  // 1. Target AI
  const modelKey = await select({
    message: 'Which AI are you targeting?',
    choices: Object.entries(AI_PRESETS).map(([value, { label }]) => ({ value, name: label })),
  });
  const preset = AI_PRESETS[modelKey]!;

  // 2. Token budget
  const tokenInput = await input({
    message: `Token budget (default: ${preset.maxTokens.toLocaleString()}):`,
    default: String(preset.maxTokens),
  });
  const maxTokens = Math.max(500, parseInt(tokenInput, 10) || preset.maxTokens);

  // 3. Output format
  const format = await select<OutputFormat>({
    message: 'Output format:',
    choices: [
      { value: 'plain',    name: 'plain   — simple // filepath headers' },
      { value: 'markdown', name: 'markdown — fenced code blocks' },
      { value: 'xml',      name: 'xml     — <context><file> tags (best for Claude)' },
    ],
    default: preset.format,
  });

  // 4. Scope: changed files or all files
  const scopeAll = await confirm({ message: 'Include ALL source files (not just changed ones)?', default: false });

  // 5. Language filter
  const langChoices = [
    { value: 'all', name: 'All languages' },
    ...Object.keys(LANG_MAP).filter(k => k !== 'all').map(k => ({ value: k, name: `.${k}` })),
  ];
  const langKey = await select({ message: 'Language filter:', choices: langChoices, default: 'all' });
  const langGlob = LANG_MAP[langKey] ?? LANG_MAP['all']!;

  // 6. Collect candidates
  const candidates = await collectCandidates(root, scopeAll, langGlob, [], ig, MAX_FILE_BYTES);

  if (candidates.length === 0) {
    console.log('\nNo files found. Try selecting "All source files" or changing the language filter.');
    process.exit(0);
  }

  // 7. File picker — let user select which files to include
  const chosen = await checkbox({
    message: `Select files to include (${candidates.length} found):`,
    choices: candidates.map(f => {
      const rel = path.relative(root, f);
      const stat = fs.statSync(f);
      return { value: f, name: `${rel}  (${getAge(stat.mtimeMs)})`, checked: true };
    }),
    pageSize: 20,
  });

  if (chosen.length === 0) {
    console.log('\nNo files selected. Exiting.');
    process.exit(0);
  }

  // 8. Include git diff?
  const withDiff = await confirm({ message: 'Prepend git diff?', default: false });

  // 9. Include file tree summary?
  const withSummary = await confirm({ message: 'Include file tree summary at the top?', default: true });

  // 10. Output destination
  const dest = await select({
    message: 'Where should the output go?',
    choices: [
      { value: 'clipboard', name: '📋  Clipboard (paste directly into AI chat)' },
      { value: 'file',      name: '💾  Save to a file' },
    ],
  });

  let outputFile = '';
  if (dest === 'file') {
    outputFile = await input({
      message: 'File name:',
      default: `${project}-context.txt`,
    });
  }

  // 11. Build output
  const branch = getGitBranch(root);
  const entries: FileEntry[] = [];
  let tokens = 0;
  let truncated = false;

  let diffBlock = '';
  if (withDiff) {
    try {
      const diff = git('git diff', root);
      const block = format === 'xml' ? `<diff>\n${diff}\n</diff>\n` : `// --- git diff ---\n${diff}\n\n`;
      const t = estimateTokens(block);
      if (t < maxTokens) { diffBlock = block; tokens += t; }
    } catch { /* no git */ }
  }

  for (const file of chosen) {
    try {
      const rel = path.relative(root, file);
      const content = fs.readFileSync(file, 'utf-8');
      const stat = fs.statSync(file);
      const t = estimateTokens(`// ${rel}\n${content}\n\n`);
      if (tokens + t > maxTokens) { truncated = true; break; }
      entries.push({ path: rel, tokens: t, content, modifiedAt: stat.mtimeMs });
      tokens += t;
    } catch { /* skip */ }
  }

  const header = buildHeader(project, branch, modelKey);
  const summary = withSummary ? buildFileTree(entries) : '';
  const output = formatEntries(entries, format, header, diffBlock, summary);

  if (dest === 'file' && outputFile) {
    fs.writeFileSync(outputFile, output, 'utf-8');
    saveHistory(outputFile, output);
    console.log(`\n✅ Saved to ${outputFile} — ${entries.length} files, ~${tokens} tokens`);
  } else {
    clipboard.writeSync(output);
    saveHistory(`clipboard-${Date.now()}`, output);
    console.log(`\n✅ Copied to clipboard — ${entries.length} files, ~${tokens} tokens`);
  }

  if (truncated) console.log(`⚠️  Truncated at ${maxTokens} tokens.`);
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('contextsav')
  .description('Save the perfect AI context from your project in one command')
  .version('1.2.0')
  // Mode flags
  .option('-I, --interactive', 'guided interactive mode — pick files, AI target, output name')
  .option('--stats', 'show project file/line statistics and exit')
  .option('--history', 'list recent captures saved to ~/.contextsav/history/')
  .option('--dry-run', 'preview files that would be captured without copying or writing')
  // Output
  .option('-o, --output <file>', 'write context to a named file instead of clipboard')
  .option('--save-history', 'always save a copy to ~/.contextsav/history/')
  // Filters
  .option('--all', 'include all source files, not just changed ones')
  .option('--recent <n>', 'capture the N most recently modified files')
  .option('--lang <ext>', 'filter by language: ts, js, py, go, rs, rb, java, cs, php, swift, kt, cpp, all')
  .option('-i, --include <patterns>', 'extra glob patterns to include (comma-separated)')
  .option('-e, --exclude <patterns>', 'extra patterns to exclude (comma-separated)')
  // Format
  .option('-f, --format <type>', 'output format: plain (default), markdown, xml')
  .option('-m, --model <ai>', 'AI preset: claude, chatgpt, gemini, copilot, grok, mistral (sets tokens+format)')
  .option('-t, --max-tokens <number>', 'override token budget')
  // Extras
  .option('--diff', 'prepend git diff to context')
  .option('--summary', 'prepend a file tree summary')
  .option('--json', 'output as structured JSON')
  .option('--no-header', 'omit the project/branch/date/model header')
  .action(async options => {
    const root = process.cwd();

    // Shortcut modes
    if (options.history) { listHistory(); return; }
    if (options.stats)   { await showStats(root); return; }
    if (options.interactive) { await runInteractive(root); return; }

    const config = loadConfig(root);
    const modelKey = (options.model as string) || config.model || 'custom';
    const preset = AI_PRESETS[modelKey] ?? AI_PRESETS['custom']!;

    const maxTokens = options.maxTokens
      ? parseInt(options.maxTokens as string, 10)
      : config.maxTokens ?? preset.maxTokens;

    const maxFileBytes = config.maxFileSize ?? MAX_FILE_BYTES;
    const useAll  = (options.all as boolean)  || config.all  || false;
    const useDiff = (options.diff as boolean) || config.diff || false;
    const withSummary = options.summary as boolean || false;
    const showHeader = !(options.noHeader as boolean) && !config.noHeader;

    const format: OutputFormat = (['plain', 'markdown', 'xml'].includes(options.format as string)
      ? options.format
      : config.format ?? preset.format) as OutputFormat;

    const langKey = (options.lang as string) || config.lang || 'all';
    const langGlob = LANG_MAP[langKey] ?? LANG_MAP['all']!;

    const ig = loadGitignore(root);
    const excludePatterns = [...toArray(options.exclude as string), ...toArray(config.exclude)];
    if (excludePatterns.length) ig.add(excludePatterns);

    const includePatterns = [...toArray(options.include as string), ...toArray(config.include)];

    let files = await collectCandidates(root, useAll, langGlob, includePatterns, ig, maxFileBytes);

    // --recent <n>: keep only the N most recently modified
    if (options.recent) {
      const n = parseInt(options.recent as string, 10);
      if (!isNaN(n) && n > 0) files = files.slice(0, n);
    }

    if (files.length === 0) {
      console.log('Nothing to capture. Stage some changes or use --all.');
      process.exit(0);
    }

    // --dry-run
    if (options.dryRun) {
      console.log(`\nDry run — ${files.length} file(s) eligible:\n`);
      let budget = maxTokens;
      for (const f of files) {
        try {
          const rel = path.relative(root, f);
          const content = fs.readFileSync(f, 'utf-8');
          const t = estimateTokens(`// ${rel}\n${content}\n\n`);
          const stat = fs.statSync(f);
          const fits = budget - t >= 0 ? '✓' : '✗ over budget';
          console.log(`  [${fits}] ${rel}  (~${t} tokens, ${getAge(stat.mtimeMs)})`);
          budget -= t;
          if (budget < 0) break;
        } catch { /* skip */ }
      }
      console.log(`\n  Budget: ${maxTokens} tokens  |  Model: ${AI_PRESETS[modelKey]?.label ?? modelKey}`);
      process.exit(0);
    }

    // Build entries
    const entries: FileEntry[] = [];
    let tokens = 0;
    let truncated = false;

    let diffBlock = '';
    if (useDiff) {
      try {
        const diff = git('git diff', root);
        const block = format === 'xml' ? `<diff>\n${diff}\n</diff>\n` : `// --- git diff ---\n${diff}\n\n`;
        const t = estimateTokens(block);
        if (t < maxTokens) { diffBlock = block; tokens += t; }
      } catch { /* no git */ }
    }

    for (const file of files) {
      try {
        const rel = path.relative(root, file);
        const content = fs.readFileSync(file, 'utf-8');
        const stat = fs.statSync(file);
        const t = estimateTokens(`// ${rel}\n${content}\n\n`);
        if (tokens + t > maxTokens) { truncated = true; break; }
        entries.push({ path: rel, tokens: t, content, modifiedAt: stat.mtimeMs });
        tokens += t;
      } catch { /* skip */ }
    }

    // Build output
    const project = getProjectName(root);
    const branch  = getGitBranch(root);
    const header  = showHeader ? buildHeader(project, branch, modelKey) : '';
    const summary = withSummary ? buildFileTree(entries) : '';

    let output: string;
    if (options.json) {
      const result: JsonOutput = {
        project, branch, model: modelKey,
        capturedAt: new Date().toISOString(),
        files: entries.map(({ modifiedAt: _m, ...rest }) => rest),
        totalTokens: tokens, truncated,
      };
      output = JSON.stringify(result, null, 2);
    } else {
      output = formatEntries(entries, format, header, diffBlock, summary);
    }

    if (options.output) {
      fs.writeFileSync(options.output as string, output, 'utf-8');
      if (options.saveHistory) saveHistory(options.output as string, output);
      console.log(`✅ Saved to ${options.output} — ${entries.length} files, ~${tokens} tokens`);
    } else {
      clipboard.writeSync(output);
      if (options.saveHistory) saveHistory(`clipboard-${Date.now()}`, output);
      console.log(`✅ Copied to clipboard — ${entries.length} files, ~${tokens} tokens`);
    }

    if (truncated) console.log(`⚠️  Truncated at ${maxTokens} tokens. Use -t or --model to adjust.`);
  });

program.parse();
