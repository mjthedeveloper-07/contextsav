import fg from 'fast-glob';
import ignore from 'ignore';
import * as fs from 'fs';
import * as path from 'path';
import { execSync, execFileSync } from 'child_process';
import clipboard from 'clipboardy';
import { load as parseYaml } from 'js-yaml';
import { checkbox, input, confirm, select } from '@inquirer/prompts';
import { collectDeps } from './deps.js';
import { smartTruncate, compactBlankLines } from './transform.js';
import {
  ALWAYS_EXCLUDE, CONFIG_FILE, GLOBAL_CONFIG, HISTORY_DIR, PROFILES_DIR,
  MAX_FILE_BYTES, LANG_MAP, SOURCE_GLOB, AI_PRESETS, ENV_FILES, TEST_PATTERN,
} from './constants.js';
import type { OutputFormat, Config, Profile, FileEntry, JsonOutput, CaptureOptions } from './types.js';

// ── Security ──────────────────────────────────────────────────────────────────

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

function getChangedFilesSince(root: string, ref: string): string[] {
  try {
    const out = execFileSync('git', ['diff', '--name-only', ref], {
      encoding: 'utf-8', cwd: root, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return out.split('\n').filter(Boolean).map(f => path.resolve(root, f));
  } catch {
    console.warn(`⚠️  git diff --name-only ${ref} failed — ignoring --since.`);
    return [];
  }
}

function getGitBranch(root: string): string | null {
  try { return git('git rev-parse --abbrev-ref HEAD', root); } catch { return null; }
}

function getGitLog(root: string, n: number): string {
  try {
    return execFileSync('git', ['log', '--oneline', `-${n}`], {
      encoding: 'utf-8', cwd: root, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch { return ''; }
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
  header: string, diffBlock: string, summary: string, gitLogBlock: string,
): string {
  const blocks = entries.map(e => {
    switch (format) {
      case 'markdown': return `### \`${e.path}\`\n\`\`\`\n${e.content}\n\`\`\`\n`;
      case 'xml':      return `<file path="${e.path}">\n${e.content}\n</file>\n`;
      default:         return `// ${e.path}\n${e.content}\n\n`;
    }
  });
  if (format === 'xml') return `${header}${summary}<context>\n${gitLogBlock}${diffBlock}${blocks.join('')}</context>\n`;
  return `${header}${summary}${gitLogBlock}${diffBlock}${blocks.join('')}`;
}

// ── History ───────────────────────────────────────────────────────────────────

export function saveHistory(outputName: string, content: string): void {
  try {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const base = path.basename(outputName, path.extname(outputName));
    fs.writeFileSync(path.join(HISTORY_DIR, `${ts}-${base}.txt`), content, 'utf-8');
  } catch { /* non-critical */ }
}

export function listHistory(): void {
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

// ── Profiles ──────────────────────────────────────────────────────────────────

export function saveProfile(name: string, opts: Profile): void {
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
  const file = path.join(PROFILES_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(opts, null, 2), 'utf-8');
  console.log(`✅ Profile '${name}' saved.`);
}

export function loadProfile(name: string): Profile {
  const file = path.join(PROFILES_DIR, `${name}.json`);
  if (!fs.existsSync(file)) { console.error(`Profile '${name}' not found.`); process.exit(1); }
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) as Profile; }
  catch { console.error(`Profile '${name}' is corrupted.`); process.exit(1); }
}

export function listProfiles(): void {
  if (!fs.existsSync(PROFILES_DIR)) { console.log('No profiles saved yet.'); return; }
  const files = fs.readdirSync(PROFILES_DIR).filter(f => f.endsWith('.json')).sort();
  if (!files.length) { console.log('No profiles saved yet.'); return; }
  console.log('\nSaved profiles:\n');
  for (const f of files) {
    const name = f.replace(/\.json$/, '');
    try {
      const p = JSON.parse(fs.readFileSync(path.join(PROFILES_DIR, f), 'utf-8')) as Profile;
      const tags = [p.model, p.format, p.lang, p.all ? '--all' : ''].filter(Boolean).join(', ');
      console.log(`  ${name.padEnd(20)} ${tags}`);
    } catch { console.log(`  ${name}  (corrupted)`); }
  }
  console.log('');
}

export function deleteProfile(name: string): void {
  const file = path.join(PROFILES_DIR, `${name}.json`);
  if (!fs.existsSync(file)) { console.error(`Profile '${name}' not found.`); process.exit(1); }
  fs.unlinkSync(file);
  console.log(`🗑  Profile '${name}' deleted.`);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function showStats(root: string): Promise<void> {
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

// ── Candidate collection ──────────────────────────────────────────────────────

async function collectCandidates(
  root: string,
  scanAll: boolean,
  langGlob: string,
  includePatterns: string[],
  ig: ReturnType<typeof ignore>,
  maxFileBytes: number,
  sinceRef?: string,
  stdinFiles?: string[],
): Promise<string[]> {
  let candidates: string[] = [];
  if (sinceRef) {
    candidates = getChangedFilesSince(root, sinceRef);
  } else if (stdinFiles && stdinFiles.length) {
    candidates = stdinFiles.map(f => path.resolve(root, f));
  } else if (!scanAll) {
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

// ── Core capture ──────────────────────────────────────────────────────────────

async function captureOnce(opts: CaptureOptions, root: string): Promise<void> {
  const profile: Profile = opts.profile ? loadProfile(opts.profile) : {};
  const config = loadConfig(root);
  const modelKey = opts.model || profile.model || config.model || 'custom';
  const preset = AI_PRESETS[modelKey] ?? AI_PRESETS['custom']!;

  const maxTokens = opts.maxTokens
    ? parseInt(opts.maxTokens, 10)
    : profile.maxTokens ?? config.maxTokens ?? preset.maxTokens;

  const maxFileBytes  = config.maxFileSize ?? MAX_FILE_BYTES;
  const useAll        = opts.all         || profile.all        || config.all   || false;
  const useDiff       = opts.diff        || profile.diff       || config.diff  || false;
  const withSummary   = opts.summary     || profile.summary    || false;
  const useDeps       = opts.deps        || profile.deps       || false;
  const useTrunc      = opts.truncate    || profile.truncate   || false;
  const useCompact    = opts.compact     || profile.compact    || false;
  const useEnv        = opts.env         || profile.env        || false;
  const ignoreTests   = opts.ignoreTests || profile.ignoreTests || false;
  const onlyTests     = opts.onlyTests   || profile.onlyTests  || false;
  const showHeader    = opts.header !== false && !config.noHeader;
  const sinceRef      = opts.since;
  const searchTerm    = opts.search      || profile.search;
  const gitLogN       = opts.gitLog ? parseInt(opts.gitLog, 10) : profile.gitLog;
  const splitN        = opts.split  ? parseInt(opts.split,  10) : profile.split;

  let promptAppend = '';
  const promptFilePath = opts.promptFile || profile.promptFile || '';
  const promptText     = opts.prompt     || profile.prompt     || '';
  if (promptFilePath && fs.existsSync(promptFilePath)) {
    promptAppend = '\n\n' + fs.readFileSync(promptFilePath, 'utf-8').trim();
  } else if (promptText) {
    promptAppend = '\n\n' + promptText;
  }

  const format: OutputFormat = (['plain', 'markdown', 'xml'].includes(opts.format ?? '')
    ? opts.format
    : profile.format ?? config.format ?? preset.format) as OutputFormat;

  const langKey  = opts.lang || profile.lang || config.lang || 'all';
  const langGlob = LANG_MAP[langKey] ?? LANG_MAP['all']!;

  const ig = loadGitignore(root);
  const excludePatterns = [
    ...toArray(opts.exclude), ...toArray(profile.exclude), ...toArray(config.exclude),
  ];
  if (excludePatterns.length) ig.add(excludePatterns);

  const includePatterns = [
    ...toArray(opts.include), ...toArray(profile.include), ...toArray(config.include),
  ];
  if (useEnv) includePatterns.push(...ENV_FILES);

  let stdinFiles: string[] | undefined;
  if (opts.stdin) {
    const raw = fs.readFileSync('/dev/stdin', 'utf-8');
    stdinFiles = raw.split('\n').map(l => l.trim()).filter(Boolean);
  }

  let files = await collectCandidates(root, useAll, langGlob, includePatterns, ig, maxFileBytes, sinceRef, stdinFiles);

  if (useDeps && files.length) {
    files = collectDeps(files, root, ig);
    files = files.filter(f => {
      if (!isWithinRoot(f, root)) return false;
      try {
        const stat = fs.statSync(f);
        return stat.isFile() && stat.size <= maxFileBytes;
      } catch { return false; }
    });
  }

  if (ignoreTests) files = files.filter(f => !TEST_PATTERN.test(f));
  if (onlyTests)   files = files.filter(f =>  TEST_PATTERN.test(f));

  if (searchTerm) {
    files = files.filter(f => {
      try { return fs.readFileSync(f, 'utf-8').includes(searchTerm); }
      catch { return false; }
    });
  }

  if (opts.recent) {
    const n = parseInt(opts.recent, 10);
    if (!isNaN(n) && n > 0) files = files.slice(0, n);
  }

  if (files.length === 0) {
    console.log('Nothing to capture. Stage some changes or use --all.');
    return;
  }

  if (opts.dryRun) {
    console.log(`\nDry run — ${files.length} file(s) eligible:\n`);
    let budget = maxTokens;
    for (const f of files) {
      try {
        const rel = path.relative(root, f);
        const raw = fs.readFileSync(f, 'utf-8');
        const content = useTrunc ? smartTruncate(raw, rel) : raw;
        const t = estimateTokens(`// ${rel}\n${content}\n\n`);
        const stat = fs.statSync(f);
        const fits = budget - t >= 0 ? '✓' : '✗ over budget';
        console.log(`  [${fits}] ${rel}  (~${t} tokens, ${getAge(stat.mtimeMs)})`);
        budget -= t;
        if (budget < 0) break;
      } catch { /* skip */ }
    }
    console.log(`\n  Budget: ${maxTokens} tokens  |  Model: ${AI_PRESETS[modelKey]?.label ?? modelKey}`);
    return;
  }

  const entries: FileEntry[] = [];
  let tokens = 0;
  let truncatedOutput = false;

  let diffBlock = '';
  if (useDiff) {
    try {
      const diff = git('git diff', root);
      const block = format === 'xml' ? `<diff>\n${diff}\n</diff>\n` : `// --- git diff ---\n${diff}\n\n`;
      const t = estimateTokens(block);
      if (t < maxTokens) { diffBlock = block; tokens += t; }
    } catch { /* no git */ }
  }

  let gitLogBlock = '';
  if (gitLogN && gitLogN > 0) {
    const log = getGitLog(root, gitLogN);
    if (log) {
      gitLogBlock = format === 'xml'
        ? `<git-log>\n${log}\n</git-log>\n`
        : `// --- last ${gitLogN} commits ---\n${log}\n\n`;
      tokens += estimateTokens(gitLogBlock);
    }
  }

  for (const file of files) {
    try {
      const rel = path.relative(root, file);
      const raw = fs.readFileSync(file, 'utf-8');
      let content = useTrunc ? smartTruncate(raw, rel) : raw;
      if (useCompact) content = compactBlankLines(content);
      const stat = fs.statSync(file);
      const t = estimateTokens(`// ${rel}\n${content}\n\n`);
      if (tokens + t > maxTokens) { truncatedOutput = true; break; }
      entries.push({ path: rel, tokens: t, content, modifiedAt: stat.mtimeMs });
      tokens += t;
    } catch { /* skip */ }
  }

  const project = getProjectName(root);
  const branch  = getGitBranch(root);
  const header  = showHeader ? buildHeader(project, branch, modelKey) : '';
  const summary = withSummary ? buildFileTree(entries) : '';

  let output: string;
  if (opts.json) {
    const result: JsonOutput = {
      project, branch, model: modelKey,
      capturedAt: new Date().toISOString(),
      files: entries.map(({ modifiedAt: _m, ...rest }) => rest),
      totalTokens: tokens, truncated: truncatedOutput,
    };
    output = JSON.stringify(result, null, 2);
  } else {
    output = formatEntries(entries, format, header, diffBlock, summary, gitLogBlock);
  }

  if (promptAppend) output += promptAppend;

  if (splitN && splitN > 1 && opts.output) {
    const allLines = output.split('\n');
    const chunkSize = Math.ceil(allLines.length / splitN);
    const ext = path.extname(opts.output);
    const base = opts.output.slice(0, -ext.length || undefined);
    for (let i = 0; i < splitN; i++) {
      const part = allLines.slice(i * chunkSize, (i + 1) * chunkSize).join('\n');
      fs.writeFileSync(`${base}-part${i + 1}-of-${splitN}${ext}`, part, 'utf-8');
    }
    console.log(`✅ Split into ${splitN} files — ${entries.length} files, ~${tokens} tokens`);
    return;
  }

  if (opts.output) {
    fs.writeFileSync(opts.output, output, 'utf-8');
    if (opts.saveHistory) saveHistory(opts.output, output);
    console.log(`✅ Saved to ${opts.output} — ${entries.length} files, ~${tokens} tokens`);
  } else {
    clipboard.writeSync(output);
    if (opts.saveHistory) saveHistory(`clipboard-${Date.now()}`, output);
    console.log(`✅ Copied to clipboard — ${entries.length} files, ~${tokens} tokens`);
  }

  if (truncatedOutput) console.log(`⚠️  Truncated at ${maxTokens} tokens. Use -t or --model to adjust.`);
}

// ── Watch mode ────────────────────────────────────────────────────────────────

export async function runCapture(opts: CaptureOptions, root: string): Promise<void> {
  await captureOnce(opts, root);

  if (!opts.watch) return;

  console.log('\n👁  Watching for changes… (Ctrl+C to stop)\n');
  let debounce: ReturnType<typeof setTimeout> | null = null;

  fs.watch(root, { recursive: true }, (_, filename) => {
    if (!filename || filename.includes('node_modules') || filename.includes('.git')) return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(async () => {
      console.log(`\n🔄 Change detected: ${filename}`);
      await captureOnce(opts, root);
    }, 500);
  });
}

// ── Interactive mode ──────────────────────────────────────────────────────────

export async function runInteractive(root: string): Promise<void> {
  const ig = loadGitignore(root);
  const project = getProjectName(root);

  console.log(`\n🤖 contextsav — interactive mode  (project: ${project})\n`);

  const modelKey = await select({
    message: 'Which AI are you targeting?',
    choices: Object.entries(AI_PRESETS).map(([value, { label }]) => ({ value, name: label })),
  });
  const preset = AI_PRESETS[modelKey]!;

  const tokenInput = await input({
    message: `Token budget (default: ${preset.maxTokens.toLocaleString()}):`,
    default: String(preset.maxTokens),
  });
  const maxTokens = Math.max(500, parseInt(tokenInput, 10) || preset.maxTokens);

  const format = await select<OutputFormat>({
    message: 'Output format:',
    choices: [
      { value: 'plain',    name: 'plain    — simple // filepath headers' },
      { value: 'markdown', name: 'markdown — fenced code blocks' },
      { value: 'xml',      name: 'xml      — <context><file> tags (best for Claude)' },
    ],
    default: preset.format,
  });

  const scopeAll = await confirm({ message: 'Include ALL source files (not just changed ones)?', default: false });

  const langChoices = [
    { value: 'all', name: 'All languages' },
    ...Object.keys(LANG_MAP).filter(k => k !== 'all').map(k => ({ value: k, name: `.${k}` })),
  ];
  const langKey  = await select({ message: 'Language filter:', choices: langChoices, default: 'all' });
  const langGlob = LANG_MAP[langKey] ?? LANG_MAP['all']!;

  const candidates = await collectCandidates(root, scopeAll, langGlob, [], ig, MAX_FILE_BYTES);

  if (candidates.length === 0) {
    console.log('\nNo files found. Try selecting "All source files" or changing the language filter.');
    process.exit(0);
  }

  const chosen = await checkbox({
    message: `Select files to include (${candidates.length} found):`,
    choices: candidates.map(f => {
      const rel = path.relative(root, f);
      const stat = fs.statSync(f);
      return { value: f, name: `${rel}  (${getAge(stat.mtimeMs)})`, checked: true };
    }),
    pageSize: 20,
  });

  if (chosen.length === 0) { console.log('\nNo files selected. Exiting.'); process.exit(0); }

  const withDiff    = await confirm({ message: 'Prepend git diff?', default: false });
  const withSummary = await confirm({ message: 'Include file tree summary at the top?', default: true });

  const dest = await select({
    message: 'Where should the output go?',
    choices: [
      { value: 'clipboard', name: '📋  Clipboard (paste directly into AI chat)' },
      { value: 'file',      name: '💾  Save to a file' },
    ],
  });

  let outputFile = '';
  if (dest === 'file') {
    outputFile = await input({ message: 'File name:', default: `${project}-context.txt` });
  }

  const branch  = getGitBranch(root);
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

  const header  = buildHeader(project, branch, modelKey);
  const summary = withSummary ? buildFileTree(entries) : '';
  const output  = formatEntries(entries, format, header, diffBlock, summary, '');

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
