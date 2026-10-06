/**
 * Pure reducer for the Toast stack (Req 7.3, 7.4, 7.11).
 *
 * State shape: { visible: Toast[], pending: Toast[] }
 * Toast: { id, type: 'success'|'info'|'error', title, message, action? }
 * Actions: { type: 'add', toast } | { type: 'dismiss', id }
 *
 * Rules:
 * - At most MAX_VISIBLE toasts are visible, in order of appearance.
 * - When full, adding evicts the oldest visible success/info toast.
 * - Error toasts are never evicted; if all visible toasts are errors the new
 *   toast waits in `pending` and is promoted (FIFO) when space frees up.
 */

export const MAX_VISIBLE = 3;
export const AUTO_DISMISS_MS = 5500;
export const initialToastState = Object.freeze({ visible: [], pending: [] });

const isTransient = (toast) => toast.type === 'success' || toast.type === 'info';

function promote(visible, pending) {
  if (visible.length >= MAX_VISIBLE || pending.length === 0) {
    return { visible, pending };
  }
  const take = Math.min(MAX_VISIBLE - visible.length, pending.length);
  return {
    visible: [...visible, ...pending.slice(0, take)],
    pending: pending.slice(take),
  };
}

function addToast(state, toast) {
  const { visible, pending } = state;

  if (visible.length < MAX_VISIBLE) {
    return { visible: [...visible, toast], pending };
  }

  const oldestTransient = visible.findIndex(isTransient);
  if (oldestTransient !== -1) {
    return {
      visible: [
        ...visible.slice(0, oldestTransient),
        ...visible.slice(oldestTransient + 1),
        toast,
      ],
      pending,
    };
  }

  // All visible toasts are errors: queue the new one.
  return { visible, pending: [...pending, toast] };
}

function dismissToast(state, id) {
  const visible = state.visible.filter((t) => t.id !== id);
  const pending = state.pending.filter((t) => t.id !== id);
  if (visible.length === state.visible.length && pending.length === state.pending.length) {
    return state; // unknown id: no change
  }
  return promote(visible, pending);
}

export function toastReducer(state, action) {
  switch (action?.type) {
    case 'add':
      return action.toast ? addToast(state, action.toast) : state;
    case 'dismiss':
      return dismissToast(state, action.id);
    default:
      return state;
  }
}

/** Auto-dismiss delay in ms for a toast type; null means never (errors). */
export function autoDismissDelay(type) {
  return type === 'success' || type === 'info' ? AUTO_DISMISS_MS : null;
}
