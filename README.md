# contextsav

> Zero-friction AI context from your terminal. No VS Code needed.

Instead of manually copying files into ChatGPT or Claude, just run:

```bash
npx contextsav
```

It finds the files you're working on, respects your `.gitignore`, fits everything within your AI's token window, and copies it straight to your clipboard.

## Install

```bash
npm install -g contextsav
# or just use it directly
npx contextsav
```

## Usage

```bash
# Copy changed files to clipboard (default)
contextsav

# Include all source files, not just changed ones
contextsav --all

# Include git diff at the top
contextsav --diff

# Save to a file instead of clipboard
contextsav -o context.txt

# Set a bigger token budget (default: 4000)
contextsav -t 8000

# Include extra files by glob
contextsav -i "*.md,Makefile"

# Exclude extra paths
contextsav -e "tests/,fixtures/"
```

## How it works

1. Runs `git diff` + `git status` to find files you're actively editing
2. Falls back to all source files if nothing is staged (or use `--all`)
3. Respects `.gitignore` automatically
4. Truncates output to fit the token budget
5. Copies to clipboard — ready to paste into any AI chat

## Supported languages

TypeScript, JavaScript, Python, Go, Rust, Ruby, Java, C#, PHP, Swift, Kotlin, Vue, Svelte

## License

MIT
