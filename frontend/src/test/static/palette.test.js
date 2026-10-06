// Static scan: colours come only from Design_Tokens and banned visual effects are absent.
// Validates: Requirements 1.2, 2.1, 2.2, 2.4, 2.5, 2.7, 2.9, 3.7, 3.8, 10.3
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Resolve via node:path; jsdom replaces the global URL.
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function listSources(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listSources(full));
    else if (/\.jsx?$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

const FILES = [...listSources(join(SRC, 'components')), join(SRC, 'App.jsx')];

/** Replaces comments with whitespace so line numbers stay intact. */
function stripComments(code) {
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  return code
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:'"`\\\w])(\/\/[^\n]*)/gm, (_, pre, c) => pre + blank(c));
}

const SOURCES = FILES.map((file) => ({
  file: relative(SRC, file).replace(/\\/g, '/'),
  code: stripComments(readFileSync(file, 'utf8')),
}));

function lineOf(code, index) {
  return code.slice(0, index).split('\n').length;
}

/** Returns `file:line match` for every hit of `re` (global) that passes `accept`. */
function scan(re, accept = () => true) {
  const hits = [];
  for (const { file, code } of SOURCES) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    let m;
    while ((m = g.exec(code)) !== null) {
      if (accept(m)) hits.push(`${file}:${lineOf(code, m.index)} ${m[0]}`);
      if (m[0] === '') g.lastIndex += 1;
    }
  }
  return hits;
}

const PALETTE = 'purple|indigo|violet|fuchsia|pink|emerald|amber|blue|red|gray|slate|green';
const COLOUR_UTILS =
  'bg|text|border|ring|from|to|via|fill|stroke|divide|outline|decoration|placeholder|accent|caret|shadow';

describe('palette scan', () => {
  it('finds the in-scope source files', () => {
    expect(SOURCES.map((s) => s.file)).toEqual(
      expect.arrayContaining(['App.jsx', 'components/Header.jsx', 'components/ui/Button.jsx']),
    );
  });

  it('has no raw hex colours', () => {
    expect(scan(/#[0-9a-fA-F]{3,8}\b/)).toEqual([]);
  });

  it('has no rgb(), rgba() or hsl() colours', () => {
    expect(scan(/\b(?:rgba?|hsla?)\(/)).toEqual([]);
  });

  it('has no arbitrary colour classes', () => {
    expect(
      scan(/\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|shadow)-\[(?:#|rgb|hsl|color:)/),
    ).toEqual([]);
  });

  it('has no inline style colours', () => {
    expect(scan(/style=\{\{[^}]*\b(?:color|background(?:Color)?|borderColor|fill|stroke)\s*:/)).toEqual([]);
  });

  it('has no default Tailwind palette classes', () => {
    const re = new RegExp(`\\b(?:[a-z-]+:)*(?:${COLOUR_UTILS})-(?:${PALETTE})-\\d{2,3}\\b`);
    expect(scan(re)).toEqual([]);
  });
});

describe('visual-rule scan', () => {
  const banned = [
    ['gradients', /\bbg-gradient|linear-gradient/],
    ['blur effects', /\bblur-|backdrop-blur/],
    ['pulse animation', /\banimate-pulse\b/],
    ['hover scale / lift', /hover:scale|hover:-translate/],
    ['large or arbitrary radii', /\brounded(?:-[trblse]{1,2})?-(?:xl|2xl|3xl|\[)/],
    ['extreme font weights', /\bfont-(?:black|extrabold|light|thin)\b/],
    ['text below 12px', /text-\[(?:10|11)px\]/],
    ['outline-none', /\boutline-none\b/],
    ['gold accent as a fill', /\bbg-accent(?:-light)?\b/],
    ['positive tabIndex', /tabIndex=\{?\s*["']?[1-9]/],
  ];

  it.each(banned)('has no %s', (_, re) => {
    expect(scan(re)).toEqual([]);
  });

  it('has no transition durations above 200ms', () => {
    const hits = scan(/\bduration-(?:(\d+)\b|\[(\d+(?:\.\d+)?)(ms|s)\])/, (m) => {
      const ms = m[1] ? Number(m[1]) : Number(m[2]) * (m[3] === 's' ? 1000 : 1);
      return ms > 200;
    });
    expect(hits).toEqual([]);
  });
});
