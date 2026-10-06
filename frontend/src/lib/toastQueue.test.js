import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  MAX_VISIBLE,
  AUTO_DISMISS_MS,
  initialToastState,
  toastReducer,
  autoDismissDelay,
} from './toastQueue.js';

const TOAST_TYPES = ['success', 'info', 'error'];
const isTransient = (t) => t.type === 'success' || t.type === 'info';

// A command is either an add of a random type, or a dismiss that targets an
// id issued earlier (known, may already be dismissed) or one never issued.
const commandArb = fc.oneof(
  fc.record({ kind: fc.constant('add'), type: fc.constantFrom(...TOAST_TYPES) }),
  fc.record({ kind: fc.constant('dismiss'), known: fc.boolean(), pick: fc.nat() }),
);

describe('toastQueue', () => {
  // Feature: professional-ui-redesign, Property 9: Toast queue invariants
  // **Validates: Requirements 7.4, 7.11**
  it('Property 9: keeps visible ≤ 3, appearance order, errors until dismissed, evicts oldest success/info', () => {
    fc.assert(
      fc.property(fc.array(commandArb, { maxLength: 60 }), (commands) => {
        let state = initialToastState;
        let nextSeq = 0; // ids are numeric, so id order == order of appearance

        for (const cmd of commands) {
          const prev = state;
          const prevAll = [...prev.visible, ...prev.pending];
          let action;

          if (cmd.kind === 'add') {
            action = { type: 'add', toast: { id: nextSeq, type: cmd.type, title: 't', message: 'm' } };
            nextSeq += 1;
          } else {
            const id = cmd.known && nextSeq > 0 ? cmd.pick % nextSeq : `unknown-${cmd.pick}`;
            action = { type: 'dismiss', id };
          }

          state = toastReducer(prev, action);
          const all = [...state.visible, ...state.pending];
          const ids = all.map((t) => t.id);

          // Visible list never exceeds the cap.
          expect(state.visible.length).toBeLessThanOrEqual(MAX_VISIBLE);
          // Pending only exists while the visible stack is full.
          if (state.pending.length > 0) expect(state.visible.length).toBe(MAX_VISIBLE);
          // Unique ids, and visible + pending together are in order of appearance.
          expect(new Set(ids).size).toBe(ids.length);
          for (let i = 1; i < ids.length; i += 1) expect(ids[i]).toBeGreaterThan(ids[i - 1]);

          // Error toasts leave only via a dismiss of their own id.
          for (const t of prevAll) {
            if (t.type !== 'error') continue;
            const dismissedNow = action.type === 'dismiss' && action.id === t.id;
            expect(ids.includes(t.id)).toBe(!dismissedNow);
          }

          if (action.type === 'add') {
            const full = prev.visible.length === MAX_VISIBLE;
            const oldestTransient = prev.visible.findIndex(isTransient);
            if (full && oldestTransient !== -1) {
              // Exactly the oldest success/info toast is removed, new one appended.
              const expected = [
                ...prev.visible.filter((_, i) => i !== oldestTransient),
                action.toast,
              ];
              expect(state.visible).toEqual(expected);
              expect(state.pending).toEqual(prev.pending);
            } else {
              // Nothing is removed; the new toast is the newest entry.
              expect(all).toEqual([...prevAll, action.toast]);
            }
          } else if (!prevAll.some((t) => t.id === action.id)) {
            // Unknown (or already dismissed) id is a no-op.
            expect(state).toBe(prev);
          } else {
            // Only the dismissed toast is removed.
            expect(all).toEqual(prevAll.filter((t) => t.id !== action.id));
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('auto-dismiss delay applies to success/info only', () => {
    expect(autoDismissDelay('success')).toBe(AUTO_DISMISS_MS);
    expect(autoDismissDelay('info')).toBe(AUTO_DISMISS_MS);
    expect(autoDismissDelay('error')).toBeNull();
  });

  it('queues a fourth toast behind three errors and promotes it on dismiss', () => {
    let s = initialToastState;
    for (let i = 0; i < 3; i += 1) s = toastReducer(s, { type: 'add', toast: { id: i, type: 'error' } });
    s = toastReducer(s, { type: 'add', toast: { id: 3, type: 'success' } });
    expect(s.visible.map((t) => t.id)).toEqual([0, 1, 2]);
    expect(s.pending.map((t) => t.id)).toEqual([3]);
    s = toastReducer(s, { type: 'dismiss', id: 1 });
    expect(s.visible.map((t) => t.id)).toEqual([0, 2, 3]);
    expect(s.pending).toEqual([]);
  });
});
