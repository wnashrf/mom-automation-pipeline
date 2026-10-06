// Static checks on the design tokens in src/index.css.
// Validates: Requirements 1.1, 2.7, 2.10, 3.1, 3.3, 3.6, 3.9
import { describe, it, expect } from 'vitest';
import { parseTheme, countThemeBlocks, toPx } from './theme.js';

const tokens = parseTheme();

// Size keys only: `--text-<name>` but not `--text-<name>--line-height`.
const textSizes = [...tokens.entries()].filter(
  ([name, value]) => /^--text-[\w-]+$/.test(name) && !name.includes('--', 2) && value !== 'initial',
);
const sizePx = (key) => toPx(tokens.get(`--text-${key}`));

describe('@theme block', () => {
  it('is the only @theme block', () => {
    expect(countThemeBlocks()).toBe(1);
  });

  it('resets the default Tailwind namespaces', () => {
    for (const ns of ['color', 'radius', 'shadow', 'font', 'text']) {
      expect(tokens.get(`--${ns}-*`), `--${ns}-*`).toBe('initial');
    }
  });

  it('defines exactly one sans and one mono font stack', () => {
    const fonts = [...tokens.keys()].filter((k) => k.startsWith('--font-') && k !== '--font-*');
    expect(fonts.sort()).toEqual(['--font-mono', '--font-sans']);
    expect(tokens.get('--font-sans')).toMatch(/sans-serif$/);
    expect(tokens.get('--font-mono')).toMatch(/monospace$/);
  });

  it('defines 4 to 6 text sizes, all within 12..32px', () => {
    expect(textSizes.length).toBeGreaterThanOrEqual(4);
    expect(textSizes.length).toBeLessThanOrEqual(6);
    for (const [name, value] of textSizes) {
      const px = toPx(value);
      expect(px, name).toBeGreaterThanOrEqual(12);
      expect(px, name).toBeLessThanOrEqual(32);
    }
  });

  it('uses a body size of at least 14px with line height of at least 1.5', () => {
    expect(sizePx('sm')).toBeGreaterThanOrEqual(14);
    expect(parseFloat(tokens.get('--text-sm--line-height'))).toBeGreaterThanOrEqual(1.5);
    // Small text used for labels/helpers shares the body line-height floor.
    expect(parseFloat(tokens.get('--text-xs--line-height'))).toBeGreaterThanOrEqual(1.5);
  });

  it('orders headings h1 >= h2 > h3 > body', () => {
    expect(sizePx('xl')).toBeGreaterThanOrEqual(sizePx('lg'));
    expect(sizePx('lg')).toBeGreaterThan(sizePx('base'));
    expect(sizePx('base')).toBeGreaterThan(sizePx('sm'));
  });

  it('keeps every radius at or below 8px except --radius-full', () => {
    const radii = [...tokens.entries()].filter(
      ([name]) => name.startsWith('--radius-') && name !== '--radius-*' && name !== '--radius-full',
    );
    expect(radii.length).toBeGreaterThan(0);
    for (const [name, value] of radii) {
      expect(toPx(value), name).toBeLessThanOrEqual(8);
    }
  });
});
