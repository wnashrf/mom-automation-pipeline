// Static scan: icons must come from lucide-react only.
// No emoji characters and no hand-written inline <svg>/<path> in components or App.jsx.
// Validates: Requirements 2.6, 4.1
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve via node:path; jsdom replaces the global URL, which breaks `new URL(rel, import.meta.url)`.
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const SOURCE_EXT = /\.(js|jsx)$/;
const TEST_FILE = /\.test\.(js|jsx)$/;

/** Recursively lists .js/.jsx source files under `dir`, excluding test files. */
function listSourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listSourceFiles(full);
    return SOURCE_EXT.test(name) && !TEST_FILE.test(name) ? [full] : [];
  });
}

const FILES = [...listSourceFiles(join(SRC, 'components')), join(SRC, 'App.jsx')];

/** Returns "file:line: text" entries for every line matching `re`. */
function findViolations(re) {
  const hits = [];
  for (const file of FILES) {
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (re.test(line)) {
          hits.push(`${relative(SRC, file).replace(/\\/g, '/')}:${i + 1}: ${line.trim()}`);
        }
      });
  }
  return hits;
}

describe('icon usage (static scan)', () => {
  it('scans a non-empty set of source files', () => {
    expect(FILES.length).toBeGreaterThan(1);
  });

  it('contains no emoji characters', () => {
    const hits = findViolations(/\p{Extended_Pictographic}/u);
    expect(hits, `Emoji found:\n${hits.join('\n')}`).toEqual([]);
  });

  it('contains no hand-written inline <svg> or <path> elements', () => {
    const hits = findViolations(/<(svg|path)\b/i);
    expect(hits, `Inline SVG found:\n${hits.join('\n')}`).toEqual([]);
  });
});
