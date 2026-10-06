// Shared helpers for static tests that read the @theme block in src/index.css.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve via node:path; jsdom replaces the global URL, which breaks `new URL(rel, import.meta.url)`.
const INDEX_CSS = resolve(dirname(fileURLToPath(import.meta.url)), '../../index.css');

/** Returns the raw text inside the (single) `@theme { ... }` block. */
export function readThemeBlock() {
  const css = readFileSync(INDEX_CSS, 'utf8');
  const start = css.indexOf('@theme');
  if (start === -1) throw new Error('No @theme block in index.css');
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error('Unterminated @theme block');
}

/** Counts `@theme` blocks in index.css. */
export function countThemeBlocks() {
  const css = readFileSync(INDEX_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return (css.match(/@theme\b/g) || []).length;
}

/**
 * Parses custom-property declarations in the @theme block into a Map of
 * name -> value (comments stripped). Wildcard resets such as `--color-*: initial`
 * are kept under their literal name (`--color-*`).
 */
export function parseTheme() {
  const body = readThemeBlock().replace(/\/\*[\s\S]*?\*\//g, '');
  const tokens = new Map();
  const re = /(--[\w-]+(?:-\*)?)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(body)) !== null) tokens.set(m[1], m[2].trim());
  return tokens;
}

/** Converts a `rem` or `px` length to px (1rem = 16px). */
export function toPx(value) {
  const m = /^(-?\d*\.?\d+)(rem|px)$/.exec(value.trim());
  if (!m) throw new Error(`Unsupported length: ${value}`);
  return m[2] === 'rem' ? parseFloat(m[1]) * 16 : parseFloat(m[1]);
}
