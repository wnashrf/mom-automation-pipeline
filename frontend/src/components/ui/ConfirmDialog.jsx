import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';
import { T } from '../../lib/terminology';

// Elements that can take keyboard focus inside the panel. Disabled controls are skipped.
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const CONFIRM_VARIANT = {
  danger: 'danger',
  primary: 'primary',
};

/**
 * Modal confirmation dialog following the WAI-ARIA APG dialog pattern (Req 7.7–7.9, 10.7–10.9).
 *
 * - Portalled into `document.body`; `#root` gets `inert` while open so the page behind
 *   cannot be reached by pointer, Tab or assistive technology.
 * - "Batal" is the first control in DOM order and receives focus on open (Req 7.7, 10.7).
 * - Tab / Shift+Tab cycle within the panel; Escape and a `mousedown` on the backdrop
 *   call `onCancel` (Req 7.8, 10.8).
 * - On close the `inert` attribute is removed and focus returns to `returnFocusRef.current`
 *   if that element is still in the document. If the opener was removed (e.g. its row was
 *   deleted), the caller is responsible for choosing a fallback focus target (Req 10.9).
 * - While `busy`, both buttons are disabled and Escape / backdrop do not cancel: the request
 *   is already in flight and cancelling the dialog would not cancel it. Focus moves to the
 *   panel itself so it stays inside the dialog.
 * - The title is an `h2`: the dialog sits outside the page heading hierarchy (it is portalled
 *   next to `#root`), so it starts its own section below the page `h1` level.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = T.actions.delete,
  cancelLabel = T.actions.cancel,
  tone = 'danger',
  onConfirm,
  onCancel,
  returnFocusRef,
  busy = false,
}) {
  const titleId = useId();
  const messageId = useId();
  const panelRef = useRef(null);
  const cancelRef = useRef(null);

  // Keep the latest callbacks/flags available to the document listener without re-binding it.
  const latest = useRef({ busy, onCancel });
  useEffect(() => {
    latest.current = { busy, onCancel };
  });

  // Background inert + focus return. Runs once per open/close cycle.
  useEffect(() => {
    if (!open) return undefined;
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    // Resolve the opener at close time on purpose: the caller's ref may be (re)assigned while
    // the dialog is open, and we want whatever element it points to when focus returns.
    const focusTarget = returnFocusRef;
    return () => {
      root?.removeAttribute('inert');
      const opener = focusTarget?.current;
      if (opener && opener.isConnected) opener.focus();
    };
  }, [open, returnFocusRef]);

  // Initial focus on "Batal"; while busy the buttons are disabled, so hold focus on the panel.
  useEffect(() => {
    if (!open) return;
    if (busy) panelRef.current?.focus();
    else cancelRef.current?.focus();
  }, [open, busy]);

  // Escape + focus trap. Bound on document so it still works if focus ends up on <body>.
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      const panel = panelRef.current;
      if (!panel) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        if (!latest.current.busy) latest.current.onCancel?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusables = Array.from(panel.querySelectorAll(FOCUSABLE));
      event.preventDefault();
      if (focusables.length === 0) {
        panel.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const index = focusables.indexOf(document.activeElement);

      if (event.shiftKey) {
        (index <= 0 ? last : focusables[index - 1]).focus();
      } else {
        (index === -1 || index === focusables.length - 1 ? first : focusables[index + 1]).focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  // Only a press that starts on the backdrop itself counts as "outside" (Req 7.8).
  const handleBackdropMouseDown = (event) => {
    if (event.target !== event.currentTarget) return;
    // Suppress the default mousedown focus change: otherwise it would run after the dialog
    // closes and move focus to <body>, undoing the return-to-opener (Req 10.9).
    event.preventDefault();
    if (!busy) onCancel?.();
  };

  const handleCancel = () => {
    if (!busy) onCancel?.();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 p-4"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={-1}
        className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-md"
      >
        <h2 id={titleId} className="text-lg font-semibold text-neutral-900">
          {title}
        </h2>
        <div id={messageId} className="mt-2 text-sm text-neutral-700">
          {message}
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button ref={cancelRef} variant="secondary" onClick={handleCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={CONFIRM_VARIANT[tone] ?? 'danger'} busy={busy} onClick={() => onConfirm?.()}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
