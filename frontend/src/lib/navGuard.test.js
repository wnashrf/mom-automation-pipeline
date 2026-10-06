import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createNavigationGuard } from './navGuard.js';

/** A promise whose settlement is controlled by the test. */
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const opArb = fc.oneof(
  fc.constant({ type: 'activate' }),
  fc.integer().map((value) => ({ type: 'resolve', value })),
  fc.string().map((message) => ({ type: 'reject', message })),
);

describe('navigation guard', () => {
  // Feature: professional-ui-redesign, Property 13: At most one navigation change runs at a time
  // **Validates: Requirements 4.10**
  it('runs at most one task at a time for any interleaving of activations and settlements', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(opArb, { maxLength: 40 }), async (ops) => {
        const busyEvents = [];
        const guard = createNavigationGuard((busy) => busyEvents.push(busy));

        let concurrent = 0;
        let maxConcurrent = 0;
        // The in-flight activation, if any: its deferred and the run() promise.
        let inFlight = null;

        for (const op of ops) {
          if (op.type === 'activate') {
            const d = deferred();
            let invoked = false;
            const task = () => {
              invoked = true;
              concurrent += 1;
              maxConcurrent = Math.max(maxConcurrent, concurrent);
              return d.promise.finally(() => {
                concurrent -= 1;
              });
            };
            const runPromise = guard.run(task);

            if (inFlight) {
              // Busy: ignored without invoking the task.
              await expect(runPromise).resolves.toEqual({ accepted: false });
              expect(invoked).toBe(false);
              expect(guard.isBusy()).toBe(true);
            } else {
              // Idle (including first activation after a settle): accepted.
              expect(invoked).toBe(true);
              expect(guard.isBusy()).toBe(true);
              // Attach a handler now so a later rejection is never unhandled.
              const outcome = runPromise.then(
                (value) => ({ ok: true, value }),
                (error) => ({ ok: false, error }),
              );
              inFlight = { d, outcome };
            }
          } else if (inFlight) {
            const { d, outcome } = inFlight;
            if (op.type === 'resolve') {
              d.resolve(op.value);
              const settled = await outcome;
              expect(settled).toEqual({ ok: true, value: { accepted: true, result: op.value } });
            } else {
              const err = new Error(op.message);
              d.reject(err);
              const settled = await outcome;
              expect(settled.ok).toBe(false);
              expect(settled.error).toBe(err);
            }
            inFlight = null;
            // Busy released in finally for both outcomes.
            expect(guard.isBusy()).toBe(false);
            expect(concurrent).toBe(0);
          }

          expect(concurrent).toBeLessThanOrEqual(1);
          expect(guard.isBusy()).toBe(inFlight !== null);
        }

        expect(maxConcurrent).toBeLessThanOrEqual(1);
        // onBusyChange alternates true/false, starting with true.
        busyEvents.forEach((busy, i) => expect(busy).toBe(i % 2 === 0));

        // Cleanup: settle any remaining task so nothing dangles.
        if (inFlight) {
          inFlight.d.resolve(undefined);
          await inFlight.outcome;
          expect(guard.isBusy()).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });
});
