import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { initialSaveState, saveReducer, saveLabel } from './saveState.js';

const pad2 = (n) => String(n).padStart(2, '0');

const eventArb = fc.oneof(
  fc.constant({ type: 'SAVE_START' }),
  fc.date({ noInvalidDate: true }).map((at) => ({ type: 'SAVE_SUCCESS', at })),
  fc.constant({ type: 'SAVE_FAILURE' }),
);

describe('save indicator state', () => {
  // Feature: professional-ui-redesign, Property 11: Save indicator reflects the latest save outcome
  // **Validates: Requirements 9.1, 9.2, 9.3**
  it('label reflects the latest save outcome for any event sequence', () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 40 }), (events) => {
        let state = initialSaveState;
        // Model: has a failure occurred since the last success?
        let failedSinceSuccess = false;

        for (const event of events) {
          state = saveReducer(state, event);
          const label = saveLabel(state);

          if (event.type === 'SAVE_SUCCESS') {
            failedSinceSuccess = false;
            const expected = `Disimpan pada ${pad2(event.at.getHours())}:${pad2(event.at.getMinutes())}`;
            expect(label).toBe(expected);
          } else if (event.type === 'SAVE_FAILURE') {
            failedSinceSuccess = true;
          } else {
            // Req 9.1: a started save shows "Menyimpan..."
            expect(label).toContain('Menyimpan...');
          }

          // Req 9.3: "Gagal disimpan" stays visible until the next success.
          if (failedSinceSuccess) {
            expect(label).toContain('Gagal disimpan');
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('starts idle with the auto-save label', () => {
    expect(saveLabel(initialSaveState)).toBe('Auto-simpan aktif');
  });

  it('shows both failure and saving text when retrying after a failure', () => {
    let state = saveReducer(initialSaveState, { type: 'SAVE_START' });
    state = saveReducer(state, { type: 'SAVE_FAILURE' });
    expect(saveLabel(state)).toBe('Gagal disimpan');
    state = saveReducer(state, { type: 'SAVE_START' });
    expect(saveLabel(state)).toBe('Gagal disimpan · Menyimpan...');
    state = saveReducer(state, { type: 'SAVE_SUCCESS', at: new Date(2026, 0, 5, 7, 3) });
    expect(saveLabel(state)).toBe('Disimpan pada 07:03');
  });
});
