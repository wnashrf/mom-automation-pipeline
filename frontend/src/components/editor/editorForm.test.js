import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import fc from 'fast-check';
import { hasMeaningfulContent } from './editorForm';
import { useAutoSave } from './useAutoSave';

// ─── Generators ───────────────────────────────────────────────────────────────

const EMPTY_TITLES = new Set(['', 'draf tanpa tajuk', 'mesyuarat tanpa tajuk']);

// Whitespace-only strings (possibly empty)
const whitespace = fc.string({ unit: fc.constantFrom(' ', '\t', '\n', '\r'), maxLength: 4 });

// Random per-character casing of a base string
const randomCase = (base) =>
  fc
    .array(fc.boolean(), { minLength: base.length, maxLength: base.length })
    .map((flags) =>
      base
        .split('')
        .map((ch, i) => (flags[i] ? ch.toUpperCase() : ch.toLowerCase()))
        .join(''),
    );

// Default/untitled title: any casing + leading/trailing whitespace, or empty
const blankTitle = fc.oneof(
  fc.constantFrom('', undefined, null),
  fc
    .tuple(
      whitespace,
      fc.oneof(randomCase('Draf Tanpa Tajuk'), randomCase('Mesyuarat Tanpa Tajuk'), fc.constant('')),
      whitespace,
    )
    .map(([lead, core, trail]) => `${lead}${core}${trail}`),
);

// Participants with only blank names (other fields arbitrary — not considered)
const blankParticipant = fc.record({
  name: fc.oneof(whitespace, fc.constant(undefined)),
  position: fc.string(),
  organisation: fc.string(),
  status: fc.constantFrom('Hadir', 'Tidak Hadir', 'Turut Hadir'),
});

// Agenda items with only blank titles (summary/decision arbitrary)
const blankAgenda = fc.record({
  title: fc.oneof(whitespace, fc.constant(undefined)),
  summary: fc.string(),
  decision: fc.string(),
});

const blankForm = fc.record({
  id: fc.oneof(fc.constant(''), fc.string({ unit: fc.constantFrom(...'0123456789abcdef'), minLength: 8, maxLength: 8 }).map((h) => `meet_${h}`)),
  meeting_title: blankTitle,
  meeting_number: fc.string(),
  location: fc.string(),
  date: fc.string(),
  start_time: fc.string(),
  end_time: fc.string(),
  chairperson_name: fc.string(),
  secretary_name: fc.string(),
  participants: fc.array(blankParticipant, { maxLength: 4 }),
  agenda_items: fc.array(blankAgenda, { maxLength: 4 }),
  action_items: fc.constant([]),
  matters_arising: whitespace,
  raw_transcript: fc.string(),
});

const nonBlank = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);

// Mutation adding exactly one meaningful field to a blank form
const meaningfulMutation = fc.oneof(
  nonBlank
    .filter((s) => !EMPTY_TITLES.has(s.trim().toLowerCase()))
    .map((title) => (f) => ({ ...f, meeting_title: title })),
  nonBlank.map((name) => (f) => ({
    ...f,
    participants: [...f.participants, { name, position: '', organisation: '', status: 'Hadir' }],
  })),
  nonBlank.map((title) => (f) => ({
    ...f,
    agenda_items: [...f.agenda_items, { title, summary: '', decision: '' }],
  })),
  fc
    .record({ task: fc.string(), assignee: fc.string(), deadline: fc.string(), status: fc.string() })
    .map((item) => (f) => ({ ...f, action_items: [item] })),
  nonBlank.map((text) => (f) => ({ ...f, matters_arising: text })),
);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('blank meetings are never auto-saved', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Feature: professional-ui-redesign, Property 17: Blank meetings are never auto-saved
  // **Validates: Requirements 13.6**
  it('hasMeaningfulContent is false for any blank form', () => {
    fc.assert(
      fc.property(blankForm, (form) => {
        expect(hasMeaningfulContent(form)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: professional-ui-redesign, Property 17: Blank meetings are never auto-saved
  // **Validates: Requirements 13.6**
  it('save() skips blank forms without calling fetch (including on unmount)', async () => {
    await fc.assert(
      fc.asyncProperty(blankForm, async (form) => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const { result, unmount } = renderHook(() => useAutoSave(form, false));
        let res;
        await act(async () => {
          res = await result.current.save(form);
        });
        expect(res).toEqual({ ok: true, skipped: true });

        unmount(); // unmount handler also fires a save — must also skip
        await Promise.resolve();
        expect(fetchMock).not.toHaveBeenCalled();

        vi.unstubAllGlobals();
      }),
      { numRuns: 75 },
    );
  });

  // Feature: professional-ui-redesign, Property 17: Blank meetings are never auto-saved
  // **Validates: Requirements 13.6**
  it('adding one meaningful field makes hasMeaningfulContent true', () => {
    fc.assert(
      fc.property(blankForm, meaningfulMutation, (form, mutate) => {
        expect(hasMeaningfulContent(mutate(form))).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('treats specific default titles as blank', () => {
    for (const t of ['', '  Draf Tanpa Tajuk ', 'MESYUARAT TANPA TAJUK', '\tdraf tanpa tajuk\n']) {
      expect(hasMeaningfulContent({ meeting_title: t })).toBe(false);
    }
    expect(hasMeaningfulContent(null)).toBe(false);
    expect(hasMeaningfulContent({ meeting_title: 'Mesyuarat Bulanan' })).toBe(true);
  });
});
