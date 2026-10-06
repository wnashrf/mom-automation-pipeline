import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildErrorMessage } from './errors.js';
import { T } from './terminology.js';

// Whitespace characters recognised by String.prototype.trim (ASCII and Unicode).
const whitespaceArb = fc.string({
  unit: fc.constantFrom(' ', '\t', '\n', '\r', '\u00a0', '\u2003', '\u3000', '\ufeff'),
});

const detailArb = fc.oneof(
  fc.constant(undefined),
  fc.constant(''),
  whitespaceArb,
  fc.string({ unit: 'grapheme' }),
  fc.string({ unit: 'binary' }),
);

const operationArb = fc.oneof(
  fc.constantFrom(...Object.values(T.ops)),
  fc.string({ unit: 'grapheme' }),
);

describe('buildErrorMessage', () => {
  // Feature: professional-ui-redesign, Property 12: Error messages name the operation and preserve backend detail
  // **Validates: Requirements 5.6, 7.2**
  it('names the operation and preserves non-blank detail verbatim', () => {
    fc.assert(
      fc.property(operationArb, detailArb, (operation, detail) => {
        const msg = buildErrorMessage(operation, detail);
        expect(msg.startsWith(operation)).toBe(true);

        if (typeof detail === 'string' && detail.trim() !== '') {
          expect(msg).toContain(detail);
          expect(msg).toBe(`${operation} gagal: ${detail}`);
        } else {
          expect(msg).toContain(T.messages.genericError);
          expect(msg).toBe(`${operation} gagal. ${T.messages.genericError}`);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('uses the generic message for undefined, empty and whitespace-only detail', () => {
    const op = Object.values(T.ops)[0];
    const generic = `${op} gagal. ${T.messages.genericError}`;
    expect(buildErrorMessage(op, undefined)).toBe(generic);
    expect(buildErrorMessage(op, '')).toBe(generic);
    expect(buildErrorMessage(op, ' \t\n\u00a0')).toBe(generic);
  });

  it('inserts backend detail verbatim', () => {
    const op = Object.values(T.ops)[0];
    expect(buildErrorMessage(op, '  Rekod tidak dijumpai ')).toBe(`${op} gagal:   Rekod tidak dijumpai `);
  });
});
