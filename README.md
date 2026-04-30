# contextsav

> Zero-friction AI context from your terminal. No VS Code needed.

Instead of manually copying files into ChatGPT, Claude, or Copilot Chat, just run one command. `contextsav` finds the files you're working on, respects your `.gitignore`, fits everything inside your AI's token window, and copies it straight to your clipboard — ready to paste.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Usage](#usage)
- [Options Reference](#options-reference)
- [Step-by-Step Workflow](#step-by-step-workflow)
- [How It Works](#how-it-works)
- [Supported Languages](#supported-languages)
- [Contributing](#contributing)
- [License](#license)

---

## Quick Start

No install needed. Just run in any project directory:

```bash
npx contextsav
```

Your AI-ready context is now on your clipboard. Paste it into ChatGPT, Claude, or any AI tool.

---

## Installation

### Option 1 — Run without installing (recommended for one-off use)

```bash
npx contextsav
```

### Option 2 — Install globally via npm

```bash
npm install -g contextsav
```

After installing globally, use it anywhere:

```bash
contextsav
```

### Option 3 — Install globally via npx with a version pin

```bash
npx contextsav@0.1.0
```

### Requirements

- Node.js 18 or later
- npm 7 or later
- Git (optional — used to detect changed files)

---

## Usage

### Default — copy changed files to clipboard

```bash
contextsav
```

Detects files from `git diff`, `git status`, and untracked files. Copies context to clipboard automatically.

### Include all source files (not just changed ones)

```bash
contextsav --all
```

Scans every supported source file in the project, up to the token budget.

### Include git diff at the top

```bash
contextsav --diff
```

Prepends the full `git diff` output before the file contents — useful when asking an AI to review your changes.

### Save context to a file instead of clipboard

```bash
contextsav -o context.txt
```

Writes the output to `context.txt` in the current directory.

### Set a custom token budget

```bash
contextsav -t 8000
```

Default is `4000` tokens. Increase this for models with larger context windows (e.g. Claude, GPT-4o).

### Include extra files by glob pattern

```bash
contextsav -i "*.md,Makefile,docker-compose.yml"
```

Appends matched files to the captured context.

### Exclude specific paths or patterns

```bash
contextsav -e "tests/,fixtures/,*.spec.ts"
```

Excludes matching files from the output. Stacks on top of `.gitignore`.

### Combine options

```bash
contextsav --all --diff -t 8000 -o full-context.txt
```

---

## Options Reference

| Option | Short | Default | Description |
| --- | --- | --- | --- |
| `--all` | | off | Include all source files, not just changed ones |
| `--diff` | | off | Prepend `git diff` output to context |
| `--output <file>` | `-o` | clipboard | Write output to a file instead of clipboard |
| `--max-tokens <n>` | `-t` | `4000` | Maximum token budget for the output |
| `--include <globs>` | `-i` | — | Comma-separated glob patterns to always include |
| `--exclude <globs>` | `-e` | — | Comma-separated glob patterns to exclude |
| `--version` | `-V` | | Print version number |
| `--help` | `-h` | | Show help |

---

## Step-by-Step Workflow

### Step 1 — Navigate to your project

```bash
cd ~/projects/my-app
```

### Step 2 — Make some changes (or stage files)

```bash
# Edit some files, then optionally stage them
git add src/auth.ts src/middleware.ts
```

### Step 3 — Run contextsav

```bash
npx contextsav
```

Output:

```text
✅ Context copied to clipboard — 3 files, ~1800 tokens
```

### Step 4 — Paste into your AI tool

Open ChatGPT, Claude, or Copilot Chat and paste with `Cmd+V` / `Ctrl+V`.

### Step 5 — Ask your question

Add your prompt after the pasted context:

```text
[pasted context]

Can you find the bug in the auth middleware and suggest a fix?
```

---

### Workflow: Debug a specific bug

```bash
# Stage the files related to the bug
git add src/api/users.ts src/db/queries.ts

# Capture with diff to show what changed
npx contextsav --diff

# Paste into Claude and ask:
# "Here are my recent changes and the files involved.
#  I'm getting a 500 error on POST /users. What's wrong?"
```

### Workflow: Ask AI to review your entire feature

```bash
# Capture all source files with a large token budget
npx contextsav --all -t 10000 -o feature-context.txt

# Then paste the file contents into your AI tool
```

### Workflow: Save context for later

```bash
npx contextsav -o context-$(date +%Y%m%d).txt
# Saves: context-20260430.txt
```

---

## How It Works

1. **Detects changed files** — runs `git diff --cached`, `git diff`, and `git ls-files --others` to find what you're working on
2. **Falls back to full scan** — if nothing is changed (or you use `--all`), scans all source files
3. **Respects `.gitignore`** — ignores the same files git ignores, plus `node_modules`, `dist`, `.git`, `build`, `.next`, `coverage`
4. **Applies token budget** — estimates tokens (~4 chars per token) and stops adding files when the budget is reached
5. **Outputs to clipboard or file** — copies directly or writes to a path you specify

---

## Supported Languages

| Language | Extensions |
| --- | --- |
| TypeScript | `.ts`, `.tsx` |
| JavaScript | `.js`, `.jsx` |
| Python | `.py` |
| Go | `.go` |
| Rust | `.rs` |
| Ruby | `.rb` |
| Java | `.java` |
| C# | `.cs` |
| PHP | `.php` |
| Swift | `.swift` |
| Kotlin | `.kt` |
| Vue | `.vue` |
| Svelte | `.svelte` |

---

## Contributing

1. Fork the repo: [github.com/mjthedeveloper-07/contextsav](https://github.com/mjthedeveloper-07/contextsav)
2. Clone your fork and install dependencies:

```bash
git clone https://github.com/your-username/contextsav.git
cd contextsav
npm install
```

3. Make your changes in `src/index.ts`

4. Build and test:

```bash
npm run build
node dist/index.js --help
```

5. Open a pull request

---

## License

MIT — free to use, modify, and distribute.
