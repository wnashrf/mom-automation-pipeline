import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { CircleCheck, Info, CircleAlert, X } from 'lucide-react';
import Button from './Button';
import { ToastContext } from './toastContext';
import { toastReducer, initialToastState, autoDismissDelay } from '../../lib/toastQueue';
import { T } from '../../lib/terminology';
import { cx } from '../../lib/cx';

// Complete class literals per tone so Tailwind sees every class (Req 1.6, 2.8).
const TONE = {
  success: {
    Icon: CircleCheck,
    card: 'border-l-success-border',
    icon: 'text-success-fg',
  },
  info: {
    Icon: Info,
    card: 'border-l-info-border',
    icon: 'text-info-fg',
  },
  error: {
    Icon: CircleAlert,
    card: 'border-l-danger-border',
    icon: 'text-danger-fg',
  },
};

const CARD_BASE = 'pointer-events-auto flex items-start gap-3 rounded-lg border border-neutral-200 border-l-4 bg-white p-3 shadow-md';

function Toast({ toast, onDismiss }) {
  const tone = TONE[toast.type] ?? TONE.info;
  const { Icon } = tone;
  const title = toast.title || T.headings[toast.type] || T.headings.info;

  const handleAction = () => {
    // Action buttons run their callback and then close the toast (e.g. "Cuba Lagi").
    toast.action?.onAction?.();
    onDismiss(toast.id);
  };

  return (
    <div className={cx(CARD_BASE, tone.card)}>
      <Icon className={cx('mt-0.5 size-5 shrink-0', tone.icon)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-neutral-900">{title}</p>
        {toast.message ? (
          <p className="mt-0.5 text-sm text-neutral-700 break-words">{toast.message}</p>
        ) : null}
        {toast.action?.label ? (
          <div className="mt-2">
            <Button variant="outline" size="sm" onClick={handleAction}>
              {toast.action.label}
            </Button>
          </div>
        ) : null}
      </div>
      <Button
        variant="ghost"
        size="sm"
        icon={X}
        iconOnly
        aria-label="Tutup pemberitahuan"
        className="-mr-1 -mt-1 shrink-0"
        onClick={() => onDismiss(toast.id)}
      />
    </div>
  );
}

/**
 * Toast system provider (Req 7.1, 7.3–7.6, 7.11, 10.13).
 *
 * Live regions: both containers (`role="status"` polite, `role="alert"` assertive)
 * are rendered on mount, before any toast exists, so screen readers pick up
 * inserted messages reliably. Success/info toasts go into the status region and
 * errors into the alert region.
 *
 * Layout: one fixed wrapper (bottom on mobile, top-right from `sm`) holds both
 * regions. Errors are grouped above success/info; within each region toasts
 * stack in order of appearance. We deliberately avoid `display: contents` +
 * CSS `order` to interleave them, because `display: contents` has a history of
 * dropping elements (and their live-region semantics) from the accessibility tree.
 *
 * Timers: only visible success/info toasts get an auto-dismiss timer. Pending
 * toasts are scheduled when the reducer promotes them. Timers are cleared when a
 * toast leaves the visible list (manual dismiss or eviction) and on unmount.
 */
export default function ToastProvider({ children }) {
  const [state, dispatch] = useReducer(toastReducer, initialToastState);
  const nextId = useRef(0);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    const handle = timers.current.get(id);
    if (handle !== undefined) {
      clearTimeout(handle);
      timers.current.delete(id);
    }
    dispatch({ type: 'dismiss', id });
  }, []);

  const show = useCallback((type, message, opts = {}) => {
    nextId.current += 1;
    const id = `toast-${nextId.current}`;
    dispatch({
      type: 'add',
      toast: { id, type, title: opts.title, message, action: opts.action },
    });
    return id;
  }, []);

  // Sync timers with the visible list.
  useEffect(() => {
    const map = timers.current;
    const visibleIds = new Set(state.visible.map((t) => t.id));

    for (const [id, handle] of map) {
      if (!visibleIds.has(id)) {
        clearTimeout(handle);
        map.delete(id);
      }
    }

    for (const toast of state.visible) {
      const delay = autoDismissDelay(toast.type);
      if (delay !== null && !map.has(toast.id)) {
        const handle = setTimeout(() => {
          map.delete(toast.id);
          dispatch({ type: 'dismiss', id: toast.id });
        }, delay);
        map.set(toast.id, handle);
      }
    }
  }, [state.visible]);

  // Clear every outstanding timer on unmount.
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const handle of map.values()) clearTimeout(handle);
      map.clear();
    };
  }, []);

  const api = useMemo(
    () => ({
      success: (message, opts) => show('success', message, opts),
      info: (message, opts) => show('info', message, opts),
      error: (message, opts) => show('error', message, opts),
      dismiss,
    }),
    [show, dismiss],
  );

  const errors = state.visible.filter((t) => t.type === 'error');
  const others = state.visible.filter((t) => t.type !== 'error');

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col gap-2 sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:w-96">
        <div role="alert" aria-live="assertive" aria-atomic="false" className="flex flex-col gap-2">
          {errors.map((toast) => (
            <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </div>
        <div role="status" aria-live="polite" aria-atomic="false" className="flex flex-col gap-2">
          {others.map((toast) => (
            <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
