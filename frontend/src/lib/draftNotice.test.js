import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { shouldShowAiDraftNotice } from './draftNotice.js';

// Whitespace-only transcripts: spaces, tabs and newlines (including empty).
const whitespaceArb = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r\n'), { maxLength: 20 })
  .map((parts) => parts.join(''));

// Transcripts guaranteed to contain a visible character, padded with whitespace.
const contentArb = fc
  .tuple(
    whitespaceArb,
    fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
    whitespaceArb,
  )
  .map(([pre, body, post]) => `${pre}${body}${post}`);

const transcriptArb = fc.oneof(
  { arbitrary: whitespaceArb, weight: 3 },
  { arbitrary: contentArb, weight: 3 },
  { arbitrary: fc.string(), weight: 2 },
  { arbitrary: fc.constantFrom(undefined, null), weight: 1 },
);

const statusArb = fc.oneof(
  fc.constantFrom('Draf', 'Selesai', '', 'draf', 'DRAF', ' Draf', 'Draf ', 'Belum Mula'),
  fc.string(),
);

describe('shouldShowAiDraftNotice', () => {
  // Feature: professional-ui-redesign, Property 16: AI draft notice visibility
  // **Validates: Requirements 9.7, 9.8**
  it('is true iff status is exactly "Draf" and the transcript has non-whitespace content', () => {
    fc.assert(
      fc.property(statusArb, transcriptArb, (status, transcript) => {
        const hasContent = typeof transcript === 'string' && transcript.trim().length > 0;
        const expected = status === 'Draf' && hasContent;
        expect(shouldShowAiDraftNotice(status, transcript)).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });

  it('hides the notice for whitespace-only transcripts on drafts', () => {
    fc.assert(
      fc.property(whitespaceArb, (transcript) => {
        expect(shouldShowAiDraftNotice('Draf', transcript)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('shows the notice for drafts with padded visible content', () => {
    fc.assert(
      fc.property(contentArb, (transcript) => {
        expect(shouldShowAiDraftNotice('Draf', transcript)).toBe(true);
        expect(shouldShowAiDraftNotice('Selesai', transcript)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
