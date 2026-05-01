#!/usr/bin/env node
import { Command } from 'commander';
import {
  runCapture, runInteractive, showStats, listHistory,
  saveProfile, loadProfile, listProfiles, deleteProfile,
} from './lib/capture.js';
import type { Profile, CaptureOptions } from './lib/types.js';

const program = new Command();

// ── Profile subcommand ────────────────────────────────────────────────────────

const profileCmd = program.command('profile').description('manage named flag profiles');

profileCmd
  .command('save <name>')
  .description('save current flags as a named profile')
  .option('-m, --model <ai>', 'AI preset')
  .option('-f, --format <type>', 'output format')
  .option('-t, --max-tokens <number>', 'token budget')
  .option('--lang <ext>', 'language filter')
  .option('--all', 'include all files')
  .option('--diff', 'prepend git diff')
  .option('--summary', 'include file tree')
  .option('--deps', 'expand dependency graph')
  .option('--truncate', 'truncate large files')
  .option('--compact', 'collapse extra blank lines')
  .option('--env', 'auto-include config/env files')
  .option('--ignore-tests', 'exclude test files')
  .option('--only-tests', 'include only test files')
  .option('--git-log <n>', 'prepend last N commit messages')
  .option('--search <term>', 'keep only files matching term')
  .option('--split <n>', 'split output into N part files')
  .option('--prompt <text>', 'append a question or instruction')
  .option('--prompt-file <path>', 'append prompt loaded from file')
  .option('-i, --include <patterns>', 'extra include patterns')
  .option('-e, --exclude <patterns>', 'extra exclude patterns')
  .action((name: string, opts) => {
    const p: Profile = {};
    if (opts.model)       p.model       = opts.model;
    if (opts.format)      p.format      = opts.format;
    if (opts.maxTokens)   p.maxTokens   = parseInt(opts.maxTokens, 10);
    if (opts.lang)        p.lang        = opts.lang;
    if (opts.all)         p.all         = true;
    if (opts.diff)        p.diff        = true;
    if (opts.summary)     p.summary     = true;
    if (opts.deps)        p.deps        = true;
    if (opts.truncate)    p.truncate    = true;
    if (opts.compact)     p.compact     = true;
    if (opts.env)         p.env         = true;
    if (opts.ignoreTests) p.ignoreTests = true;
    if (opts.onlyTests)   p.onlyTests   = true;
    if (opts.gitLog)      p.gitLog      = parseInt(opts.gitLog, 10);
    if (opts.search)      p.search      = opts.search;
    if (opts.split)       p.split       = parseInt(opts.split, 10);
    if (opts.prompt)      p.prompt      = opts.prompt;
    if (opts.promptFile)  p.promptFile  = opts.promptFile;
    if (opts.include)     p.include     = opts.include;
    if (opts.exclude)     p.exclude     = opts.exclude;
    saveProfile(name, p);
  });

profileCmd.command('list').description('list all saved profiles').action(() => listProfiles());
profileCmd.command('delete <name>').description('delete a saved profile').action((n: string) => deleteProfile(n));

// ── Main command ──────────────────────────────────────────────────────────────

program
  .name('contextsav')
  .description('Save the perfect AI context from your project in one command')
  .version('1.4.0')
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
  .option('--since <ref>', 'include files changed since a git ref (branch, tag, or SHA)')
  .option('--ignore-tests', 'exclude test files (*.test.*, *.spec.*, *_test.*)')
  .option('--only-tests', 'include only test files')
  .option('--search <term>', 'keep only files whose content contains the search term')
  // Format
  .option('-f, --format <type>', 'output format: plain (default), markdown, xml')
  .option('-m, --model <ai>', 'AI preset: claude, chatgpt, gemini, copilot, grok, mistral')
  .option('-t, --max-tokens <number>', 'override token budget')
  // Enrichment
  .option('--diff', 'prepend git diff to context')
  .option('--summary', 'prepend a file tree summary')
  .option('--deps', 'auto-include files imported by the selected files (relative imports only)')
  .option('--env', 'auto-include project config files (package.json, Dockerfile, etc.)')
  .option('--git-log <n>', 'prepend the last N git commit messages')
  .option('--prompt <text>', 'append a question or instruction to the output')
  .option('--prompt-file <path>', 'append prompt loaded from a file')
  // Transforms
  .option('--truncate', 'smart-truncate large files: head 80 + tail 30 lines')
  .option('--compact', 'collapse 3+ consecutive blank lines to 1')
  // Output control
  .option('--json', 'output as structured JSON')
  .option('--no-header', 'omit the project/branch/date/model header')
  .option('--split <n>', 'split output into N part files (requires -o)')
  // Misc
  .option('--stdin', 'read newline-separated file paths from stdin')
  .option('--profile <name>', 'load a saved profile as defaults (CLI flags override profile)')
  .option('--watch', 're-capture automatically on every file change (500 ms debounce)')
  .action(async options => {
    const root = process.cwd();
    if (options.history)     { listHistory(); return; }
    if (options.stats)       { await showStats(root); return; }
    if (options.interactive) { await runInteractive(root); return; }
    await runCapture(options as CaptureOptions, root);
  });

program.parse();
