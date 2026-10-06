// Static scan: Tailwind v4 only detects complete, literal class names, so no
// component may build a class name at runtime (Requirement 1.6).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Resolve via node:path; jsdom replaces the global URL, which breaks `new URL(rel, import.meta.url)`.
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function collectSources(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...collectSources(full));
    else if (/\.(js|jsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

const FILES = [...collectSources(join(SRC, 'components')), join(SRC, 'App.jsx')].map((path) => ({
  path,
  rel: relative(SRC, path).replace(/\\/g, '/'),
  text: readFileSync(path, 'utf8'),
}));

/** Returns `file:line: snippet` for every match of each (global) pattern. */
function scan(patterns) {
  const hits = [];
  for (const { rel, text } of FILES) {
    for (const pattern of patterns) {
      const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
      let m;
      while ((m = re.exec(text)) !== null) {
        const line = text.slice(0, m.index).split('\n').length;
        hits.push(`${rel}:${line}: ${m[0].split('\n')[0].trim()}`);
      }
    }
  }
  return hits;
}

// (1) Template interpolation inside class strings.
const INTERPOLATION = [
  /className=\{\s*`[^`]*\$\{/,          // className={`... ${x}`}
  /\bclass(?:Name)?\s*:\s*`[^`]*\$\{/,  // { className: `...${x}` } in object maps
  /\b(?:text|bg|border|ring|fill|stroke|from|to|via)-\$\{/, // `bg-${tone}` fragments anywhere
];

// (2) Concatenation of partial class fragments ('bg-' + x, x + '-500').
const CONCATENATION = [
  /['"][\w:-]*-['"]\s*\+/,
  /\+\s*['"]-[\w-]+['"]/,
];

// (3) `.replace(` used to derive one class from another.
const REPLACE = [
  /\b(?:className|Class|classes|textColor|bgColor|color)\w*\s*\.replace\(/,
  /['"](?:text|bg|border)-[\w-]+['"]\s*\.replace\(/,
];

describe('dynamic class name scan (Requirement 1.6)', () => {
  it('scans the component sources and App.jsx', () => {
    expect(FILES.length).toBeGreaterThan(1);
    expect(FILES.some((f) => f.rel === 'App.jsx')).toBe(true);
  });

  it('has no template interpolation in class names', () => {
    expect(scan(INTERPOLATION)).toEqual([]);
  });

  it('has no string concatenation of partial class fragments', () => {
    expect(scan(CONCATENATION)).toEqual([]);
  });

  it('has no .replace( applied to class strings', () => {
    expect(scan(REPLACE)).toEqual([]);
  });

  it('flags violating samples and ignores legitimate patterns', () => {
    const matches = (patterns, src) => patterns.some((p) => p.test(src));
    // Violations
    expect(matches(INTERPOLATION, 'className={`px-2 bg-${tone}-500`}')).toBe(true);
    expect(matches(INTERPOLATION, 'className={\n  `px-2 ${active ? "a" : "b"}`\n}')).toBe(true);
    expect(matches(INTERPOLATION, "{ className: `text-${c}` }")).toBe(true);
    expect(matches(CONCATENATION, "'bg-' + tone")).toBe(true);
    expect(matches(CONCATENATION, "tone + '-500'")).toBe(true);
    expect(matches(REPLACE, "textColor.replace('text-', 'bg-')")).toBe(true);
    expect(matches(REPLACE, "'text-neutral-700'.replace('700', '900')")).toBe(true);
    // Legitimate
    const ok = [
      "className={cx('px-2', active && 'bg-primary-700')}",
      'href={`/api/meetings/${id}/export`}',
      'aria-label={`Padam ${title}`}',
      'style={{ width: `${pct}%` }}',
      "const id = `field-${generatedId}`;",
      "'w-full rounded-md border ' +\n  'focus-visible:outline-2'",
      "crypto.randomUUID().replace(/-/g, '')",
    ];
    for (const src of ok) {
      expect(matches([...INTERPOLATION, ...CONCATENATION, ...REPLACE], src), src).toBe(false);
    }
  });
});
