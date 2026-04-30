#!/usr/bin/env node
import { Command } from 'commander';
import fg from 'fast-glob';
import ignore from 'ignore';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import clipboard from 'clipboardy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ALWAYS_EXCLUDE = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'];
const SOURCE_GLOB = '**/*.{ts,tsx,js,jsx,py,go,rs,rb,java,cs,php,swift,kt,vue,svelte}';

// Estimate tokens: ~4 chars per token
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
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

function getChangedFiles(root: string): string[] {
  const run = (cmd: string) =>
    execSync(cmd, { encoding: 'utf-8', cwd: root })
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

function buildContextBlock(filePath: string, root: string): string {
  const rel = path.relative(root, filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  return `// ${rel}\n${content}\n\n`;
}

const program = new Command();

program
  .name('contextsav')
  .description('Save the perfect AI context from your project in one command')
  .version('0.1.0')
  .option('-o, --output <file>', 'write context to file instead of clipboard')
  .option('-t, --max-tokens <number>', 'token budget for output', '4000')
  .option('-i, --include <patterns>', 'extra glob patterns to include (comma-separated)')
  .option('-e, --exclude <patterns>', 'extra patterns to exclude (comma-separated)')
  .option('--diff', 'prepend git diff to context')
  .option('--all', 'include all source files instead of only changed ones')
  .action(async options => {
    const root = process.cwd();
    const maxTokens = parseInt(options.maxTokens as string, 10);
    const ig = loadGitignore(root);

    if (options.exclude) {
      ig.add((options.exclude as string).split(',').map(p => p.trim()));
    }

    // Gather candidate files
    let candidates: string[] = [];

    if (!options.all) {
      try {
        candidates = getChangedFiles(root);
      } catch {
        console.warn('⚠️  Not a git repo or no git found — scanning all source files.');
        options.all = true;
      }
    }

    if (options.all || candidates.length === 0) {
      candidates = await fg(SOURCE_GLOB, { cwd: root, absolute: true, dot: false });
    }

    if (options.include) {
      const extra = await fg(
        (options.include as string).split(',').map(p => p.trim()),
        { cwd: root, absolute: true }
      );
      candidates.push(...extra);
    }

    // Filter ignored files
    const files = [...new Set(candidates)].filter(f => {
      const rel = path.relative(root, f);
      return !ig.ignores(rel) && fs.existsSync(f) && fs.statSync(f).isFile();
    });

    if (files.length === 0) {
      console.log('Nothing to capture. Stage some changes or use --all to scan the whole project.');
      process.exit(0);
    }

    // Build output within token budget
    let output = '';
    let tokens = 0;
    let included = 0;

    // Optionally prepend git diff
    if (options.diff) {
      try {
        const diff = execSync('git diff', { encoding: 'utf-8', cwd: root });
        const block = `// --- git diff ---\n${diff}\n\n`;
        const t = estimateTokens(block);
        if (t < maxTokens) {
          output += block;
          tokens += t;
        }
      } catch { /* not a git repo */ }
    }

    for (const file of files) {
      try {
        const block = buildContextBlock(file, root);
        const t = estimateTokens(block);
        if (tokens + t > maxTokens) break;
        output += block;
        tokens += t;
        included++;
      } catch { /* unreadable file — skip */ }
    }

    // Output
    if (options.output) {
      fs.writeFileSync(options.output as string, output, 'utf-8');
      console.log(`✅ Context saved to ${options.output} (${included} files, ~${tokens} tokens)`);
    } else {
      clipboard.writeSync(output);
      console.log(`✅ Context copied to clipboard — ${included} files, ~${tokens} tokens`);
    }
  });

program.parse();
