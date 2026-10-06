import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { clampPercent, formatAudioTime, formatAudioProgress } from './progress.js';

// Any double, biased towards the interesting regions: NaN, ±Infinity,
// negatives, fractions inside [0, 100] and values above 100.
const anyNumberArb = fc.oneof(
  fc.double(),
  fc.double({ min: 0, max: 100, noNaN: true }),
  fc.double({ min: -1e6, max: 1e6, noNaN: true }),
  fc.constantFrom(NaN, Infinity, -Infinity, -0, 0, 100, 100.4, 100.5, -0.4, 99.5),
);

const elapsedArb = fc.oneof(
  fc.double({ min: 0, max: 1e6, noNaN: true }),
  fc.integer({ min: 0, max: 360000 }),
);

describe('transcription progress formatting', () => {
  // Feature: professional-ui-redesign, Property 15: Transcription progress formatting
  // **Validates: Requirements 8.2, 8.3**
  it('clampPercent returns an integer in [0, 100], equal to Math.round(x) within range', () => {
    fc.assert(
      fc.property(anyNumberArb, (x) => {
        const p = clampPercent(x);
        expect(Number.isInteger(p)).toBe(true);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(100);
        if (x >= 0 && x <= 100) {
          // Object.is would distinguish -0; compare numerically.
          expect(p === Math.round(x)).toBe(true);
        }
        if (Number.isNaN(x)) expect(p).toBe(0);
        if (x === Infinity) expect(p).toBe(100);
        if (x === -Infinity || x < 0) expect(p).toBe(0);
        if (x > 100) expect(p).toBe(100);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: professional-ui-redesign, Property 15: Transcription progress formatting
  // **Validates: Requirements 8.2, 8.3**
  it('formatAudioProgress starts with elapsed and shows " / total" iff total is finite and > 0', () => {
    fc.assert(
      fc.property(elapsedArb, anyNumberArb, (elapsed, total) => {
        const out = formatAudioProgress(elapsed, total);
        const head = formatAudioTime(elapsed);
        expect(out.startsWith(head)).toBe(true);

        const totalKnown = Number.isFinite(total) && total > 0;
        if (totalKnown) {
          expect(out).toBe(`${head} / ${formatAudioTime(total)}`);
        } else {
          expect(out).toBe(head);
          expect(out.includes(' / ')).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });

  // Feature: professional-ui-redesign, Property 15: Transcription progress formatting
  // **Validates: Requirements 8.2, 8.3**
  it('formatAudioTime yields M:SS under an hour and H:MM:SS otherwise, flooring seconds', () => {
    fc.assert(
      // Realistic durations (up to ~11.5 days) plus negatives, fractions, NaN and ±Infinity.
      // Astronomically large values are out of scope: String() switches to exponent notation.
      fc.property(
        fc.oneof(
          fc.double({ min: -1e6, max: 1e6 }),
          fc.constantFrom(NaN, Infinity, -Infinity, -0, 59.999, 3599.9, 3600, 86399.5),
        ),
        (sec) => {
          const out = formatAudioTime(sec);
          const total = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
          if (total < 3600) {
            expect(out).toMatch(/^\d{1,2}:\d{2}$/);
          } else {
            expect(out).toMatch(/^\d+:\d{2}:\d{2}$/);
          }
          const parts = out.split(':').map(Number);
          const seconds = parts.reduce((acc, v) => acc * 60 + v, 0);
          expect(seconds).toBe(total);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('handles specific edge cases', () => {
    expect(clampPercent(NaN)).toBe(0);
    expect(clampPercent(Infinity)).toBe(100);
    expect(clampPercent(-Infinity)).toBe(0);
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(42.6)).toBe(43);
    expect(formatAudioTime(65.9)).toBe('1:05');
    expect(formatAudioTime(3661)).toBe('1:01:01');
    expect(formatAudioTime(-10)).toBe('0:00');
    expect(formatAudioTime(NaN)).toBe('0:00');
    expect(formatAudioProgress(30, 120)).toBe('0:30 / 2:00');
    expect(formatAudioProgress(30, 0)).toBe('0:30');
    expect(formatAudioProgress(30, Infinity)).toBe('0:30');
    expect(formatAudioProgress(30, NaN)).toBe('0:30');
  });
});
