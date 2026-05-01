# contextsav

> Zero-friction AI context from your terminal. One command. Perfect context every time.

Instead of manually copying files into ChatGPT, Claude, Copilot, or Gemini — run one command. `contextsav` finds what you're working on, respects `.gitignore`, fits inside the AI's token window, and copies it to your clipboard.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Interactive Mode](#interactive-mode)
- [AI Model Presets](#ai-model-presets)
- [Usage](#usage)
- [Options Reference](#options-reference)
- [Step-by-Step Workflow](#step-by-step-workflow)
- [Config File](#config-file)
- [How It Works](#how-it-works)
- [Supported Languages](#supported-languages)
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

### Combine options

```bash
contextsav --model claude --all --diff --summary -o context.xml
```

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
| `--diff` | | Prepend git diff |
| `--summary` | | Prepend file tree summary |
| `--json` | | Output as structured JSON |
| `--no-header` | | Omit project/branch/date/model header |
| `--version` | `-V` | Print version |
| `--help` | `-h` | Show help |

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

1. Detects changed files via `git diff --cached`, `git diff`, and `git ls-files --others`
2. Falls back to all source files if nothing is staged, or when `--all` is used
3. Respects `.gitignore` — ignores the same files git ignores
4. Always excludes: `node_modules`, `dist`, `.git`, `build`, `.next`, `coverage`, `.env`
5. Skips binary files (detects null bytes)
6. Skips files over 200 KB
7. Blocks path traversal — only reads files inside the project root
8. Sorts by most recently modified — most relevant files captured first
9. Stops adding files when the token budget is reached
10. Outputs to clipboard or a named file

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
