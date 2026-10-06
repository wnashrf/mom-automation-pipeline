/**
 * Navigation guard (Req 4.10).
 *
 * Ensures at most one navigation change is in flight at a time.
 * - While a task is running, `run()` ignores new tasks and resolves to
 *   `{ accepted: false }` without invoking them.
 * - When idle, `run()` executes the task and resolves to
 *   `{ accepted: true, result }`. A rejected task propagates its error.
 * - Busy is always released in `finally`, for resolved and rejected tasks.
 *
 * @param {(busy: boolean) => void} [onBusyChange] notified on busy transitions
 * @returns {{ isBusy: () => boolean, run: (task: () => any) => Promise<{ accepted: boolean, result?: any }> }}
 */
export function createNavigationGuard(onBusyChange) {
  let busy = false;
  return {
    isBusy: () => busy,
    async run(task) {
      if (busy) return { accepted: false };
      busy = true; onBusyChange?.(true);
      try { return { accepted: true, result: await task() }; }
      finally { busy = false; onBusyChange?.(false); }
    },
  };
}
