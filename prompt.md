# How to Use contextsav Output with AI

## Step 1 — Capture your context

```bash
npx contextsav
```

Your project context is now on your clipboard.

## Step 2 — Paste into your AI tool

Open ChatGPT, Claude, Copilot Chat, or any AI assistant and paste with `Cmd+V` (Mac) or `Ctrl+V` (Windows/Linux).

## Step 3 — Add your prompt below the pasted context

Use one of the templates below.

---

## Prompt Templates

### Debug a bug

```
<context>
[PASTE CONTEXTSAV OUTPUT HERE]
</context>

I'm getting the following error:
[PASTE ERROR MESSAGE]

What's causing it and how do I fix it?
```

### Code review

```
<context>
[PASTE CONTEXTSAV OUTPUT HERE]
</context>

Please review this code for:
- Bugs or logic errors
- Security vulnerabilities
- Performance issues
- Anything that looks wrong or could be improved
```

### Add a feature

```
<context>
[PASTE CONTEXTSAV OUTPUT HERE]
</context>

I want to add the following feature:
[DESCRIBE FEATURE]

Show me how to implement it without breaking the existing code.
```

### Explain the code

```
<context>
[PASTE CONTEXTSAV OUTPUT HERE]
</context>

Explain what this code does, how it fits together, and what I should know before modifying it.
```

### Write tests

```
<context>
[PASTE CONTEXTSAV OUTPUT HERE]
</context>

Write unit tests for the functions in this code.
Use [Jest / Vitest / Pytest / Go test] and cover edge cases.
```

---

## Tips

- Use `contextsav --diff` to include your recent changes — great for asking "what did I break?"
- Use `contextsav -t 8000` for larger models like Claude or GPT-4o that support bigger windows
- Use `contextsav -o context.txt` to save context to a file if you want to reuse it
- Use `contextsav --dry-run` first to see which files will be included before committing
