// Static scan: the frontend source must not use native browser dialogs.
// Validates: Requirements 7.10
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Resolve via node:path; jsdom replaces the global URL, which breaks `new URL(rel, import.meta.url)`.
const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TEST_DIR = join(SRC_DIR, 'test');

// Bare calls are matched only when not part of a longer identifier or a member
// access (so `onConfirm(`, `deleteconfirm(` and `obj.alert(` do not match).
// Member access on `window` is matched explicitly, with or without a call.
const PATTERNS = [
  { name: 'alert(', re: /(?<![\w.$])alert\s*\(/ },
  { name: 'confirm(', re: /(?<![\w.$])confirm\s*\(/ },
  { name: 'window.alert / window.confirm', re: /\bwindow\s*\.\s*(?:alert|confirm)\b/ },
];

/** Recursively lists .js/.jsx source files under `dir`, skipping tests. */
function listSourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full === TEST_DIR) continue;
      files.push(...listSourceFiles(full));
    } else if (/\.jsx?$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

/** Returns `file:line: text` entries for every matching line. */
function findViolations(text, label) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const { name, re } of PATTERNS) {
      if (re.test(line)) hits.push(`${label}:${i + 1} [${name}] ${line.trim()}`);
    }
  });
  return hits;
}

describe('browser dialog scan (Req 7.10)', () => {
  it('detects native dialog calls and ignores look-alike identifiers', () => {
    const bad = ['alert("x")', 'confirm ("y")', 'window.alert("z")', 'if (window.confirm(msg)) {}', 'const f = window.confirm;'];
    const good = ['onConfirm()', 'handleConfirmDelete(id)', 'deleteconfirm()', 'toast.alert("x")', '<div role="alert">', 'showAlert(msg)'];
    for (const s of bad) expect(findViolations(s, 'sample'), s).not.toHaveLength(0);
    for (const s of good) expect(findViolations(s, 'sample'), s).toEqual([]);
  });

  it('src/ contains no alert(, confirm(, window.alert or window.confirm', () => {
    const files = listSourceFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(0);
    const violations = files.flatMap((file) =>
      findViolations(readFileSync(file, 'utf8'), relative(SRC_DIR, file).split(sep).join('/')),
    );
    expect(violations, `Native browser dialogs found:\n${violations.join('\n')}`).toEqual([]);
  });
});
