// Static scan: banned English / synonym strings must not appear in UI-authored text.
// Validates: Requirements 5.1, 5.2, 5.3
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { T } from '../../lib/terminology.js';

// Resolve via node:path; jsdom replaces the global URL.
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Case-sensitive for Edit/Delete; case-insensitive for the rest.
const BANNED = [
  /\bEdit\b/,
  /\bDelete\b/,
  /\bOverview\b/i,
  /\bNo date\b/i,
  /\bNo location\b/i,
  /\bUbah\b/i,
  /\bHapus\b/i,
];

function listSources(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listSources(full));
    else if (/\.(jsx?|js)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

/** Blanks comments while preserving offsets/newlines (so line numbers stay valid). */
function stripComments(src) {
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  return src
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, blank)
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, pre) => pre + blank(m.slice(pre.length)));
}

const lineOf = (src, index) => src.slice(0, index).split('\n').length;

/** Extracts UI-facing text fragments: JSX text nodes and string-valued text attributes. */
function extractTexts(src) {
  const found = [];
  const textNode = />([^<>{}]+)</g;
  let m;
  while ((m = textNode.exec(src)) !== null) {
    if (m[1].trim()) found.push({ index: m.index + 1, text: m[1].trim() });
  }
  const attr = /\b(aria-label|title|placeholder|alt|[A-Za-z]*[lL]abel|description|heading|message)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*["'`]([^"'`]*)["'`]\s*\})/g;
  while ((m = attr.exec(src)) !== null) {
    const text = m[2] ?? m[3] ?? m[4] ?? '';
    if (text.trim()) found.push({ index: m.index, text: `${m[1]}="${text}"` });
  }
  return found;
}

/** Collects every string value in T; function values are called with a sample argument. */
function walkStrings(value, path, out) {
  if (typeof value === 'string') out.push({ path, text: value });
  else if (typeof value === 'function') {
    const args = Array.from({ length: Math.max(value.length, 1) }, () => 'X');
    walkStrings(value(...args), `${path}()`, out);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) walkStrings(v, path ? `${path}.${k}` : k, out);
  }
  return out;
}

const isBanned = (text) => BANNED.some((re) => re.test(text));

describe('Bahasa Melayu consistency (static scan)', () => {
  it('helper detects banned terms but not identifiers or BM equivalents', () => {
    const sample = '<button aria-label="Edit item" onClick={onEditMeeting}>Overview</button><p>Sunting</p>';
    const texts = extractTexts(sample).map((t) => t.text);
    expect(texts.filter(isBanned)).toEqual(['Overview', 'aria-label="Edit item"']);
    expect(isBanned('onEditMeeting')).toBe(false);
    expect(isBanned('Sunting')).toBe(false);
  });

  it('components and App.jsx contain no banned strings in text or attributes', () => {
    const files = [...listSources(join(SRC, 'components')), join(SRC, 'App.jsx')];
    expect(files.length).toBeGreaterThan(1);
    const violations = [];
    for (const file of files) {
      const src = stripComments(readFileSync(file, 'utf8'));
      for (const { index, text } of extractTexts(src)) {
        if (isBanned(text)) violations.push(`${relative(SRC, file)}:${lineOf(src, index)} ${text}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('terminology module T contains no banned strings', () => {
    const strings = walkStrings(T, '', []);
    expect(strings.length).toBeGreaterThan(10);
    const violations = strings.filter((s) => isBanned(s.text)).map((s) => `T.${s.path}: ${s.text}`);
    expect(violations).toEqual([]);
  });
});
