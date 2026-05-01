import * as os from 'os';
import * as path from 'path';
import type { OutputFormat } from './types.js';

export const ALWAYS_EXCLUDE = [
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage',
  '.env', '.env.*', '*.lock', 'pnpm-lock.yaml', 'yarn.lock',
];
export const CONFIG_FILE = '.contextsav.yml';
export const GLOBAL_CONFIG = path.join(os.homedir(), '.contextsav.yml');
export const HISTORY_DIR = path.join(os.homedir(), '.contextsav', 'history');
export const PROFILES_DIR = path.join(os.homedir(), '.contextsav', 'profiles');
export const MAX_FILE_BYTES = 200 * 1024;

export const LANG_MAP: Record<string, string> = {
  ts: '{ts,tsx}', js: '{js,jsx,mjs,cjs}', py: 'py', go: 'go',
  rs: 'rs', rb: 'rb', java: 'java', cs: 'cs', php: 'php',
  swift: 'swift', kt: '{kt,kts}', vue: 'vue', svelte: 'svelte',
  cpp: '{c,cpp,h,hpp}', all: '{ts,tsx,js,jsx,mjs,cjs,py,go,rs,rb,java,cs,php,swift,kt,kts,vue,svelte,c,cpp,h,hpp}',
};

export const SOURCE_GLOB = `**/*.${LANG_MAP['all']}`;

export const AI_PRESETS: Record<string, { maxTokens: number; format: OutputFormat; label: string }> = {
  claude:  { maxTokens: 100_000, format: 'xml',      label: 'Claude (Anthropic)' },
  chatgpt: { maxTokens:  32_000, format: 'markdown', label: 'ChatGPT / GPT-4o (OpenAI)' },
  gemini:  { maxTokens: 500_000, format: 'plain',    label: 'Gemini (Google)' },
  copilot: { maxTokens:   8_000, format: 'plain',    label: 'GitHub Copilot Chat' },
  grok:    { maxTokens: 128_000, format: 'markdown', label: 'Grok (xAI)' },
  mistral: { maxTokens:  32_000, format: 'plain',    label: 'Mistral / Le Chat' },
  custom:  { maxTokens:   4_000, format: 'plain',    label: 'Other / Custom' },
};

export const ENV_FILES = [
  'package.json', 'tsconfig.json', 'tsconfig.*.json',
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  '.env.example', '.env.sample',
  'go.mod', 'Cargo.toml',
  'pyproject.toml', 'requirements.txt', 'setup.py',
  'Makefile',
  '.eslintrc*', '.prettierrc*', 'biome.json',
  'vite.config.*', 'webpack.config.*',
  'jest.config.*', 'vitest.config.*',
];

export const TEST_PATTERN = /\.(test|spec)\.[^.]+$|_test\.[^.]+$/;
