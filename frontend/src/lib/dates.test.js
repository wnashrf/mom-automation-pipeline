import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { formatDisplayDate, parseCalendarDate } from './dates.js';
import { T } from './terminology.js';

const pad = (n, w = 2) => String(n).padStart(w, '0');

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (y, m) => (m === 2 ? (isLeap(y) ? 29 : 28) : [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]);

/** Valid calendar date: day bounded by days-in-month (leap years included). */
const validDateArb = fc
  .record({ year: fc.integer({ min: 1000, max: 9999 }), month: fc.integer({ min: 1, max: 12 }) })
  .chain(({ year, month }) =>
    fc.integer({ min: 1, max: daysIn(year, month) }).map((day) => ({ year, month, day })),
  );

/** Optional time part: "", "THH:MM[:SS[.mmm]][Z]" or " HH:MM[:SS]". */
const timeSuffixArb = fc.option(
  fc
    .record({
      sep: fc.constantFrom('T', ' '),
      h: fc.integer({ min: 0, max: 23 }),
      m: fc.integer({ min: 0, max: 59 }),
      s: fc.option(fc.integer({ min: 0, max: 59 }), { nil: undefined }),
      ms: fc.option(fc.integer({ min: 0, max: 999 }), { nil: undefined }),
      zone: fc.constantFrom('', 'Z', '+08:00'),
    })
    .map(({ sep, h, m, s, ms, zone }) => {
      let t = `${sep}${pad(h)}:${pad(m)}`;
      if (s !== undefined) {
        t += `:${pad(s)}`;
        if (ms !== undefined) t += `.${pad(ms, 3)}`;
      }
      return t + zone;
    }),
  { nil: '' },
);

const DISPLAY_RE =
  /^(\d{2}) (Januari|Februari|Mac|April|Mei|Jun|Julai|Ogos|September|Oktober|November|Disember) (\d{4})$/;

describe('dates', () => {
  // Feature: professional-ui-redesign, Property 1: Display date format round trip
  // **Validates: Requirements 5.4, 12.6**
  it('Property 1: formatDisplayDate round-trips valid YYYY-MM-DD dates', () => {
    fc.assert(
      fc.property(validDateArb, timeSuffixArb, ({ year, month, day }, suffix) => {
        const input = `${year}-${pad(month)}-${pad(day)}${suffix}`;
        const out = formatDisplayDate(input);
        const match = DISPLAY_RE.exec(out);
        expect(match).not.toBeNull();
        expect(Number(match[1])).toBe(day);
        expect(T.months.indexOf(match[2]) + 1).toBe(month);
        expect(Number(match[3])).toBe(year);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: professional-ui-redesign, Property 2: Invalid or empty dates display "Tiada tarikh"
  // **Validates: Requirements 5.5, 6.6**
  it('Property 2: invalid or empty dates display "Tiada tarikh" and leave the record unchanged', () => {
    const blankArb = fc
      .array(fc.constantFrom(' ', '\t', '\n', '\r', '\u00a0'), { maxLength: 6 })
      .map((chars) => chars.join(''));
    const invalidArb = fc
      .oneof(
        fc.anything(),
        blankArb,
        fc.constantFrom('2026-02-30', '2026-13-01', 'Invalid Date', '2026-00-10', '31/02/2026'),
        fc.string(),
      )
      // Exclude anything that genuinely parses as a calendar date.
      .filter((v) => parseCalendarDate(v) === null);

    // fc.clone yields two structurally identical but independent values:
    // one is passed through formatting, the other is the untouched reference.
    fc.assert(
      fc.property(fc.clone(invalidArb, 2), ([value, reference]) => {
        const record = { id: 'meet_00000000', date: value };
        const out = formatDisplayDate(record.date);
        expect(out).toBe(T.messages.noDate);
        expect(out).toBe('Tiada tarikh');
        expect(record).toStrictEqual({ id: 'meet_00000000', date: reference });
      }),
      { numRuns: 200 },
    );
  });

  it('formats a known date and a leap day', () => {
    expect(formatDisplayDate('2026-03-05')).toBe('05 Mac 2026');
    expect(formatDisplayDate('2024-02-29T10:00:00')).toBe('29 Februari 2024');
  });
});
