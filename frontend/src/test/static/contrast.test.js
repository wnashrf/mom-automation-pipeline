// WCAG 2.x contrast checks for every pair in the design's contrast table,
// computed from the token values parsed out of src/index.css.
// Validates: Requirements 6.3, 10.1, 10.2
import { describe, it, expect } from 'vitest';
import { parseTheme } from './theme.js';

const tokens = parseTheme();

function hexToRgb(hex) {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`Unsupported colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function color(name) {
  const value = tokens.get(`--color-${name}`);
  if (!value) throw new Error(`Missing token --color-${name}`);
  return value;
}

// [foreground, background, required ratio] — mirrors design.md "Contrast pairs".
const PAIRS = [
  ['on-primary', 'primary', 4.5],
  ['on-primary-muted', 'primary', 4.5],
  ['accent-light', 'primary', 3],
  ['neutral-900', 'white', 4.5],
  ['neutral-900', 'neutral-50', 4.5],
  ['neutral-600', 'white', 4.5],
  ['neutral-600', 'neutral-50', 4.5],
  ['neutral-500', 'white', 3],
  ['accent', 'white', 3],
  ['success-fg', 'success-bg', 4.5],
  ['warning-fg', 'warning-bg', 4.5],
  ['danger-fg', 'danger-bg', 4.5],
  ['info-fg', 'info-bg', 4.5],
  ['neutral-fg', 'neutral-bg', 4.5],
  ['white', 'danger', 4.5],
  ['success-border', 'success-bg', 3],
  ['warning-border', 'warning-bg', 3],
  ['danger-border', 'danger-bg', 3],
  ['info-border', 'info-bg', 3],
  ['neutral-border', 'neutral-bg', 3],
  ['focus', 'white', 3],
  ['focus', 'neutral-50', 3],
];

describe('contrast helper', () => {
  it('matches known WCAG reference values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
});

describe('design token contrast pairs', () => {
  it.each(PAIRS)('%s on %s meets %s:1', (fg, bg, required) => {
    const ratio = contrast(color(fg), color(bg));
    expect(ratio, `${fg} on ${bg} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(required);
  });
});
