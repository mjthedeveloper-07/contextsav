import * as fs from 'fs';
import * as path from 'path';

const JS_TS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const RESOLVE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.vue', '.svelte'];

function extractRelativeSpecifiers(content: string, ext: string): string[] {
  const specs: string[] = [];
  if (!JS_TS_EXTS.has(ext)) return specs;
  const patterns = [
    /(?:^|\n)\s*import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /export\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (m[1]?.startsWith('.')) specs.push(m[1]);
    }
  }
  return specs;
}

function resolveSpec(dir: string, spec: string): string | null {
  const base = path.resolve(dir, spec);
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of RESOLVE_EXTS) {
    const p = base + ext;
    if (fs.existsSync(p)) return p;
    const idx = path.join(base, `index${ext}`);
    if (fs.existsSync(idx)) return idx;
  }
  return null;
}

type IgnoreInstance = { ignores(p: string): boolean };

export function collectDeps(seeds: string[], root: string, ig: IgnoreInstance, maxDepth = 3): string[] {
  const visited = new Set<string>(seeds);
  let frontier = [...seeds];
  for (let d = 0; d < maxDepth && frontier.length; d++) {
    const next: string[] = [];
    for (const file of frontier) {
      let content: string;
      try { content = fs.readFileSync(file, 'utf-8'); } catch { continue; }
      for (const spec of extractRelativeSpecifiers(content, path.extname(file))) {
        const resolved = resolveSpec(path.dirname(file), spec);
        if (!resolved || visited.has(resolved)) continue;
        const rel = path.relative(root, resolved);
        if (!rel.startsWith('..') && !ig.ignores(rel)) {
          visited.add(resolved);
          next.push(resolved);
        }
      }
    }
    frontier = next;
  }
  return [...visited];
}
