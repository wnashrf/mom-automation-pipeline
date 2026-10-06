// Static scan: single theme source, no legacy App.css, Bahasa Melayu document shell,
// and no third-party font hosting.
// Validates: Requirements 1.1, 1.7, 3.2, 5.7, 10.12
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { T } from '../../lib/terminology.js';

// Resolve via node:path; jsdom replaces the global URL, which breaks `new URL(rel, import.meta.url)`.
const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FRONTEND_DIR = resolve(SRC_DIR, '..');
const TEST_DIR = join(SRC_DIR, 'test');
const INDEX_HTML = join(FRONTEND_DIR, 'index.html');

const SOURCE_EXT = /\.(css|js|jsx)$/;

/** Lists non-test .css/.js/.jsx files under src/ (excludes *.test.* and src/test/**). */
function listSourceFiles(dir = SRC_DIR) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full === TEST_DIR) continue;
      out.push(...listSourceFiles(full));
    } else if (SOURCE_EXT.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const rel = (file) => relative(FRONTEND_DIR, file).split(sep).join('/');
const stripCssComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');

const SOURCE_FILES = listSourceFiles();

const THIRD_PARTY_FONT_PATTERNS = [
  /fonts\.googleapis\.com/i,
  /fonts\.gstatic\.com/i,
  /use\.typekit\.net/i,
  /fonts\.bunny\.net/i,
  /<link[^>]+font/i,
];

/** Returns `@font-face` blocks whose `src:` loads from a remote (http or protocol-relative) URL. */
function remoteFontFaces(css) {
  const hits = [];
  const re = /@font-face\s*\{([^}]*)\}/gi;
  let m;
  while ((m = re.exec(css)) !== null) {
    const srcDecl = /src\s*:([^;]*)/i.exec(m[1]);
    if (srcDecl && /url\(\s*['"]?(https?:)?\/\//i.test(srcDecl[1])) hits.push(m[0].trim());
  }
  return hits;
}

describe('theme source and document shell', () => {
  it('scans a non-empty set of source files', () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(0);
  });

  it('has exactly one @theme block across src/, located in src/index.css', () => {
    const occurrences = [];
    for (const file of SOURCE_FILES) {
      const text = stripCssComments(readFileSync(file, 'utf8'));
      const count = (text.match(/@theme\b/g) || []).length;
      for (let i = 0; i < count; i += 1) occurrences.push(rel(file));
    }
    expect(occurrences, `@theme found in: ${occurrences.join(', ') || '(none)'}`).toEqual([
      'src/index.css',
    ]);
  });

  it('has no src/App.css and no source file imports App.css', () => {
    expect(existsSync(join(SRC_DIR, 'App.css')), 'src/App.css should not exist').toBe(false);
    const importers = SOURCE_FILES.filter((file) =>
      /import\s+['"][^'"]*App\.css['"]/.test(readFileSync(file, 'utf8')),
    ).map(rel);
    expect(importers, `App.css imported by: ${importers.join(', ')}`).toEqual([]);
  });

  it('declares lang="ms" and a Bahasa Melayu title in index.html', () => {
    const html = readFileSync(INDEX_HTML, 'utf8');
    expect(html).toMatch(/<html[^>]*\blang="ms"/i);
    const title = /<title>([^<]*)<\/title>/i.exec(html);
    expect(title, 'index.html has no <title>').not.toBeNull();
    expect(title[1].trim()).toBe(T.app.tabTitle);
    expect(title[1].trim()).toBe('Penjana Minit Mesyuarat');
  });

  it('references no third-party font hosts or remote @font-face sources', () => {
    const violations = [];
    for (const file of [INDEX_HTML, ...SOURCE_FILES]) {
      const raw = readFileSync(file, 'utf8');
      const text = file.endsWith('.css') ? stripCssComments(raw) : raw;
      for (const pattern of THIRD_PARTY_FONT_PATTERNS) {
        if (pattern.test(text)) violations.push(`${rel(file)}: matches ${pattern}`);
      }
      for (const block of remoteFontFaces(text)) {
        violations.push(`${rel(file)}: remote @font-face ${block.replace(/\s+/g, ' ')}`);
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });
});
