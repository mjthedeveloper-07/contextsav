# contextsav

> Zero-friction AI context from your terminal. One command. Perfect context every time.

[![npm version](https://img.shields.io/npm/v/contextsav.svg)](https://www.npmjs.com/package/contextsav)
[![npm downloads](https://img.shields.io/npm/dm/contextsav.svg)](https://www.npmjs.com/package/contextsav)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js 18+](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

Instead of manually copying files into ChatGPT, Claude, Copilot, or Gemini — run one command. `contextsav` finds what you're working on, respects `.gitignore`, fits inside the AI's token window, and copies it to your clipboard.

---

## Why contextsav?

| Without contextsav | With contextsav |
| --- | --- |
| Open files manually, copy each one | `npx contextsav` — done |
| Forget which files are relevant | Git-aware: captures exactly what you're editing |
| Paste too much, hit token limit | Token budget enforced automatically |
| Wrong format for the AI you're using | `--model claude` sets format + budget for you |
| Lose context between sessions | `--save-history` keeps every capture |
| Copy unrelated files by accident | `--since main` captures only what changed |
| Miss files that import shared code | `--deps` auto-pulls in your imports |
| Re-type the same flags every session | `profile save` stores your flag combos |
| Forget package.json / tsconfig in context | `--env` auto-pulls config files |
| Context floods with test boilerplate | `--ignore-tests` strips them out |
| Can't find which file has the bug | `--search <term>` filters to relevant files |
| AI misses recent commit context | `--git-log 5` prepends your last commits |
| Need to ask a question with the context | `--prompt "what's wrong here?"` appends it |
| Huge output breaks paste limit | `--split 3` writes 3 part files automatically |
| Re-capture manually after every save | `--watch` re-captures on every file change |

---

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Interactive Mode](#interactive-mode)
- [AI Model Presets](#ai-model-presets)
- [Usage](#usage)
- [Named Profiles](#named-profiles)
- [Options Reference](#options-reference)
- [Step-by-Step Workflow](#step-by-step-workflow)
- [Vibe Coding Workflows](#vibe-coding-workflows)
- [Config File](#config-file)
- [How It Works](#how-it-works)
- [Supported Languages](#supported-languages)
- [Changelog](#changelog)
- [Contributing](#contributing)
- [License](#license)

---

## Quick Start

```bash
npx contextsav
```

Context is on your clipboard. Paste into any AI chat and ask your question.

---

## Installation

### No install — run directly

```bash
npx contextsav
```

### Global install

```bash
npm install -g contextsav
```

### Requirements

- Node.js 18+
- Git (optional — used to detect changed files)

---

## Interactive Mode

The easiest way to use contextsav. It walks you through everything:

```bash
npx contextsav --interactive
# or
npx contextsav -I
```

It will ask you:

1. **Which AI are you targeting?** — Claude, ChatGPT, Gemini, Copilot, Grok, Mistral, or custom
2. **Token budget** — auto-filled based on the AI you picked
3. **Output format** — plain, markdown, or XML
4. **Scope** — changed files only, or all source files
5. **Language filter** — TypeScript only, Python only, all, etc.
6. **File picker** — checkbox list of every eligible file with "modified X ago" timestamps
7. **Include git diff?** — prepend your recent changes
8. **File tree summary?** — add a directory overview at the top
9. **Output destination** — clipboard or save to a named file

---

## AI Model Presets

Use `--model` to automatically configure the token budget and output format for your target AI:

```bash
contextsav --model claude       # 100k tokens, XML format  (best for Claude)
contextsav --model chatgpt      # 32k tokens,  Markdown
contextsav --model gemini       # 500k tokens, plain text
contextsav --model copilot      # 8k tokens,   plain text
contextsav --model grok         # 128k tokens, Markdown
contextsav --model mistral      # 32k tokens,  plain text
```

| Model | Token Budget | Format |
| --- | --- | --- |
| `claude` | 100,000 | xml |
| `chatgpt` | 32,000 | markdown |
| `gemini` | 500,000 | plain |
| `copilot` | 8,000 | plain |
| `grok` | 128,000 | markdown |
| `mistral` | 32,000 | plain |

---

## Usage

### Default — copy changed files to clipboard

```bash
contextsav
```

### Interactive guided mode

```bash
contextsav -I
```

### Target a specific AI

```bash
contextsav --model claude
contextsav --model chatgpt
```

### Include all source files

```bash
contextsav --all
```

### Filter by language

```bash
contextsav --lang ts      # TypeScript only
contextsav --lang py      # Python only
contextsav --lang go      # Go only
```

### Grab N most recently modified files

```bash
contextsav --recent 5
```

### Include git diff at the top

```bash
contextsav --diff
```

### Add a file tree summary

```bash
contextsav --summary
```

### Save to a named file

```bash
contextsav -o my-context.txt
contextsav -o feature-auth-context.txt
```

### Set a custom token budget

```bash
contextsav -t 8000
```

### Output format

```bash
contextsav -f plain       # default — // filepath headers
contextsav -f markdown    # fenced code blocks
contextsav -f xml         # <context><file> tags (best for Claude)
```

### Preview without capturing

```bash
contextsav --dry-run
contextsav --dry-run --all --model claude
```

### Project statistics

```bash
contextsav --stats
```

Output:

```text
📊 Project stats for my-app

  Total files : 42
  Total lines : 8,312

  By language :
    .ts          28 files   5,204 lines
    .py           9 files   2,100 lines
    .go           5 files   1,008 lines
```

### View capture history

```bash
contextsav --history
```

Captures are saved to `~/.contextsav/history/` when you use `--save-history` or interactive mode.

### Save a backup to history

```bash
contextsav --save-history
contextsav -o ctx.txt --save-history
```

### JSON output for scripting

```bash
contextsav --json
contextsav --json --all -o ctx.json
```

### Files changed since a git ref

```bash
contextsav --since main          # files changed since main
contextsav --since HEAD~5        # files changed in the last 5 commits
contextsav --since v1.0.0        # files changed since a tag
```

### Auto-include imported files

```bash
contextsav --deps                # pull in relative imports of selected files
contextsav --deps --since HEAD~3 # changed files + everything they import
```

> **Note:** `--deps` only resolves relative imports (e.g. `import x from './utils'`). TypeScript path aliases (`@/lib/foo`) are not followed.

### Truncate large files

```bash
contextsav --truncate            # show head 80 + tail 30 lines for large files
```

### Read file list from stdin

```bash
git diff --name-only HEAD~1 | contextsav --stdin
find src -name "*.ts" | contextsav --stdin --dry-run
```

### Combine options

```bash
contextsav --model claude --all --diff --summary -o context.xml
contextsav --since main --deps --truncate --model claude
```

---

## Named Profiles

Save frequently used flag combinations as named profiles so you don't type them every time.

```bash
# Save a profile
contextsav profile save claude-ts -m claude -f xml --lang ts --deps

# Use it
contextsav --profile claude-ts

# CLI flags override the profile
contextsav --profile claude-ts --since main

# List all saved profiles
contextsav profile list

# Delete a profile
contextsav profile delete claude-ts
```

Profiles are stored in `~/.contextsav/profiles/` as plain JSON files.

**Priority order** (highest wins): CLI flag > profile > config file > preset default.

---

## Options Reference

| Option | Short | Description |
| --- | --- | --- |
| `--interactive` | `-I` | Guided interactive mode |
| `--stats` | | Show project file/line statistics |
| `--history` | | List recent captures from history |
| `--dry-run` | | Preview files without capturing |
| `--output <file>` | `-o` | Save to a named file instead of clipboard |
| `--save-history` | | Save a copy to `~/.contextsav/history/` |
| `--all` | | Include all source files, not just changed |
| `--recent <n>` | | Capture the N most recently modified files |
| `--lang <ext>` | | Filter by language (ts, js, py, go, rs, etc.) |
| `--include <globs>` | `-i` | Extra glob patterns to include |
| `--exclude <globs>` | `-e` | Extra patterns to exclude |
| `--format <type>` | `-f` | Output format: plain, markdown, xml |
| `--model <ai>` | `-m` | AI preset: claude, chatgpt, gemini, copilot, grok, mistral |
| `--max-tokens <n>` | `-t` | Override token budget |
| `--since <ref>` | | Files changed since a git ref (branch, tag, or SHA) |
| `--deps` | | Auto-include relative imports of selected files |
| `--env` | | Auto-include config files (package.json, Dockerfile, tsconfig, etc.) |
| `--truncate` | | Smart-truncate large files: head 80 + tail 30 lines |
| `--compact` | | Collapse 3+ consecutive blank lines to 1 |
| `--stdin` | | Read newline-separated file paths from stdin |
| `--profile <name>` | | Load a saved profile as defaults |
| `--diff` | | Prepend git diff |
| `--summary` | | Prepend file tree summary |
| `--git-log <n>` | | Prepend the last N git commit messages |
| `--prompt <text>` | | Append a question or instruction to the output |
| `--prompt-file <path>` | | Append prompt loaded from a file |
| `--search <term>` | | Keep only files whose content contains the term |
| `--ignore-tests` | | Exclude test files (`*.test.*`, `*.spec.*`, `*_test.*`) |
| `--only-tests` | | Include only test files |
| `--watch` | | Re-capture automatically on every file change (500 ms debounce) |
| `--split <n>` | | Split output into N part files (requires `-o`) |
| `--json` | | Output as structured JSON |
| `--no-header` | | Omit project/branch/date/model header |
| `--version` | `-V` | Print version |
| `--help` | `-h` | Show help |

### Profile subcommand

| Command | Description |
| --- | --- |
| `contextsav profile save <name> [flags]` | Save flags as a named profile |
| `contextsav profile list` | List all saved profiles |
| `contextsav profile delete <name>` | Delete a saved profile |

---

## Step-by-Step Workflow

### Step 1 — Navigate to your project

```bash
cd ~/projects/my-app
```

### Step 2 — Run (choose one)

```bash
# Quickest — changed files to clipboard
contextsav

# Guided — recommended for first-timers
contextsav -I

# For Claude — best format automatically
contextsav --model claude
```

### Step 3 — Paste into your AI tool

`Cmd+V` on Mac, `Ctrl+V` on Windows/Linux.

### Step 4 — Add your question

```text
[pasted context]

Can you find the bug in the auth middleware?
```

---

### Workflow: Debug a bug targeting Claude

```bash
git add src/api/users.ts src/db/queries.ts
contextsav --model claude --diff
# Paste → "I'm getting a 500 error on POST /users. What's wrong?"
```

### Workflow: Review your whole feature

```bash
contextsav --all --model chatgpt --summary -o review.md
# Paste contents → "Review this for bugs, security issues, and improvements."
```

### Workflow: Quick check — what would be captured?

```bash
contextsav --dry-run --model claude
```

### Workflow: Save context by filename for a sprint

```bash
contextsav --all -o sprint-42-context.txt --save-history
```

### Workflow: Review a PR (files changed since main)

```bash
contextsav --since main --deps --model claude --summary
# Paste → "Review this PR for bugs, edge cases, and missing tests."
```

`--deps` auto-pulls in any shared utilities those files import — the AI sees the full picture.

### Workflow: Share context from specific commits

```bash
contextsav --since HEAD~3 --model chatgpt
# Paste → "Here's what I changed in the last 3 commits. Anything look wrong?"
```

### Workflow: Pipe a custom file list

```bash
# Only changed test files
git diff --name-only HEAD~1 | grep '\.test\.' | contextsav --stdin --model claude

# Only the files you care about right now
echo -e "src/auth.ts\nsrc/db.ts\nsrc/routes.ts" | contextsav --stdin
```

### Workflow: Save your go-to flags as a profile

```bash
# Save once
contextsav profile save mydefault -m claude -f xml --lang ts --deps --summary

# Use forever after
contextsav --profile mydefault
contextsav --profile mydefault --since main   # profile + extra flag
```

### Workflow: Large repo — truncate giant files to fit the budget

```bash
contextsav --all --model claude --truncate
# Big files show head 80 + tail 30 lines instead of being dropped entirely
```

---

## Vibe Coding Workflows

Built for developers who live in the terminal and iterate fast.

### Auto-capture on every save — watch mode

```bash
contextsav --watch --model claude -o ctx.xml
# Re-captures the context automatically every time you save a file
```

Pair with your AI chat window open — paste the updated `ctx.xml` whenever the AI needs a refresh.

### Ask your question right inside the context

```bash
contextsav --model claude --prompt "Why is the auth middleware returning 401 on valid tokens?"
contextsav --model claude --prompt-file my-question.txt
```

The prompt is appended at the end of the output — paste once, get an answer.

### Include config files so the AI sees the full picture

```bash
contextsav --model claude --env
# Adds package.json, tsconfig.json, Dockerfile, go.mod, etc. automatically
```

### Filter to only the files that matter

```bash
# Only files that reference a specific function
contextsav --all --search "useAuthToken" --model claude

# Skip the noise — production code only, no tests
contextsav --all --ignore-tests --model claude

# Only the tests — for a focused test review
contextsav --all --only-tests --model claude
```

### Add recent commit history for full context

```bash
contextsav --since main --git-log 5 --model claude
# Captures changed files AND your last 5 commit messages
```

### Split large outputs for paste-limited UIs

```bash
contextsav --all --model chatgpt --split 3 -o ctx.txt
# Writes ctx-part1-of-3.txt, ctx-part2-of-3.txt, ctx-part3-of-3.txt
```

### Vibe coder profile — save your complete setup once

```bash
# Save your full vibe-coding workflow as a profile
contextsav profile save vibe -m claude -f xml --deps --env --compact --git-log 5

# Every session: one command
contextsav --profile vibe
contextsav --profile vibe --prompt "Review this for bugs and performance issues"
```

### Strip excess whitespace to save tokens

```bash
contextsav --all --compact --model claude
# 3+ blank lines collapsed to 1 — cleaner output, more files fit in budget
```

---

## Config File

Create `.contextsav.yml` in your project root to set defaults. CLI flags always override it.

```yaml
# .contextsav.yml

# Target AI preset
model: claude

# Token budget (overrides preset default)
maxTokens: 50000

# Output format: plain, markdown, xml
format: xml

# Always include these extra files
include:
  - README.md
  - Makefile

# Always exclude these paths
exclude:
  - tests/fixtures/
  - "*.spec.ts"

# Scan all files by default
all: false

# Always prepend git diff
diff: false

# Max file size in bytes (default: 204800 = 200 KB)
maxFileSize: 102400

# Skip the header line
noHeader: false
```

You can also create `~/.contextsav.yml` as a global config that applies to all projects. Project config overrides global config.

---

## How It Works

**File selection** (in priority order):

1. `--stdin` — reads the file list from stdin (pipe from `find`, `git diff`, etc.)
2. `--since <ref>` — runs `git diff --name-only <ref>` to get files changed since a git ref
3. Default — detects changed files via `git diff --cached`, `git diff`, and `git ls-files --others`
4. `--all` — scans all source files when no changes are found or explicitly requested

**Filtering:**

1. Respects `.gitignore` — ignores the same files git ignores
2. Always excludes: `node_modules`, `dist`, `.git`, `build`, `.next`, `coverage`, `.env`
3. Skips binary files (detects null bytes) and files over 200 KB
4. Blocks path traversal — only reads files inside the project root

**Expansion and sorting:**

1. `--deps` — parses relative `import`/`require`/`export` statements and adds imported files (up to 3 hops). Only resolves relative paths; path aliases like `@/lib/foo` are not followed.
2. Sorts by most recently modified — most relevant files appear first

**Output:**

1. `--truncate` — optionally shows head 80 + tail 30 lines for large files instead of dropping them
2. Stops adding files when the token budget is reached
3. Formats output as plain, markdown, or XML
4. Copies to clipboard or writes to a named file

---

## Supported Languages

| Language | Extensions |
| --- | --- |
| TypeScript | `.ts`, `.tsx` |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` |
| Python | `.py` |
| Go | `.go` |
| Rust | `.rs` |
| Ruby | `.rb` |
| Java | `.java` |
| C# | `.cs` |
| PHP | `.php` |
| Swift | `.swift` |
| Kotlin | `.kt`, `.kts` |
| Vue | `.vue` |
| Svelte | `.svelte` |
| C/C++ | `.c`, `.cpp`, `.h`, `.hpp` |

---

## Changelog

### v1.4.0

- `--watch` — re-capture context automatically on every file save (500 ms debounce, no extra dependencies)
- `--prompt <text>` — append a question or instruction directly to the captured output
- `--prompt-file <path>` — load the prompt from a file (great for reusable question templates)
- `--env` — auto-include project config files: `package.json`, `tsconfig.json`, `Dockerfile`, `go.mod`, `Cargo.toml`, `Makefile`, and more
- `--ignore-tests` — strip test files (`*.test.*`, `*.spec.*`, `*_test.*`) from the output
- `--only-tests` — include only test files (focused test review)
- `--compact` — collapse 3+ consecutive blank lines to a single blank line (saves tokens)
- `--git-log <n>` — prepend the last N git commit messages to give the AI recent history
- `--search <term>` — keep only files whose content contains the search term
- `--split <n>` — split large output into N part files (requires `-o`)
- Internal refactor: logic split into `src/lib/capture.ts`, `src/lib/constants.ts`, `src/lib/transform.ts`, `src/lib/types.ts`

### v1.3.0

- `--since <ref>` — capture only files changed since a git branch, tag, or SHA
- `--deps` — auto-expand selected files to include their relative imports (up to 3 hops)
- `--truncate` — opt-in smart truncation: head 80 + tail 30 lines for large files
- `--stdin` — read file paths from stdin (e.g. pipe from `find` or `git diff`)
- `--profile <name>` — load saved flag presets; `profile save/list/delete` subcommands
- Priority chain: CLI flag > profile > config file > AI preset default

### v1.2.0

- `-I / --interactive` — guided mode: pick AI, files, format, and output name interactively
- `--model claude|chatgpt|gemini|copilot|grok|mistral` — auto-sets token budget and format per AI
- `--recent <n>` — capture the N most recently modified files
- `--lang <ext>` — filter by language (ts, py, go, etc.)
- `--summary` — prepend a file tree overview to the context
- `--stats` — show file and line count breakdown by language
- `--history` — list past captures from `~/.contextsav/history/`
- `--save-history` — save every capture with a timestamp
- Named output files prompted in interactive mode or via `-o`
- Files sorted by most recently modified first

### v1.1.0

- `--dry-run` — preview files and token estimates without capturing
- `--json` — structured JSON output for scripting and tooling
- `-f / --format plain|markdown|xml` — choose output format
- `.contextsav.yml` per-project config and `~/.contextsav.yml` global config
- `--no-header` — omit project/branch/date header
- Security: path traversal guard, binary file detection, `.env` exclusion, YAML validation
- `prompt.md` — paste templates for Claude, ChatGPT, Copilot
- `LICENSE` file added

### v0.1.0

- Initial release — git-aware file capture, clipboard output, token budget, `.gitignore` support

---

## Contributing

1. Fork: [github.com/mjthedeveloper-07/contextsav](https://github.com/mjthedeveloper-07/contextsav)

2. Clone and install:

```bash
git clone https://github.com/your-username/contextsav.git
cd contextsav
npm install
```

3. Edit `src/index.ts`

4. Build and test:

```bash
npm run build
node dist/index.js --help
node dist/index.js --dry-run --all
```

5. Open a pull request

---

## License

MIT — free to use, modify, and distribute.
