import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import Button from './Button';
import { cx } from '../../lib/cx';
import { T } from '../../lib/terminology';

// Complete static class strings (Tailwind scanner). Items reuse the ghost Button and
// override alignment/width; the danger tone overrides text and hover fill with `!`
// so it wins over the ghost variant regardless of utility ordering.
// Button already guarantees min-h-10 (40px) touch height.
const ITEM_BASE = 'w-full justify-start!';
const ITEM_TONE = {
  default: '',
  danger: 'text-danger-fg! hover:bg-danger-bg!',
};

/**
 * Disclosure-pattern overflow menu (not an ARIA `menu`): a trigger button with
 * `aria-expanded` / `aria-controls` and a list of buttons/links rendered only while open.
 *
 * - `items: [{ label, icon, onSelect, href, download, tone }]`
 *   - `href` renders a link (with optional `download`); otherwise a button.
 *   - `onSelect(event, { trigger })` receives the trigger element so callers can pass it
 *     on as a focus-return target (e.g. ConfirmDialog `returnFocusRef`).
 * - Selecting an item closes the menu and returns focus to the trigger; a dialog opened
 *   by `onSelect` focuses itself afterwards in its own effect.
 * - Escape and outside `mousedown` close the menu and return focus to the trigger.
 * - `triggerRef` (optional object ref from `useRef`) is attached to the trigger element.
 */
export default function OverflowMenu({ label = T.actions.more, items = [], className, triggerRef }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const wrapperRef = useRef(null);
  const ownTriggerRef = useRef(null);
  // A caller-supplied object ref (useRef) is used directly for the trigger.
  const innerTriggerRef = triggerRef ?? ownTriggerRef;

  const refocusTimerRef = useRef(null);

  const closeAndFocusTrigger = useCallback(() => {
    setOpen(false);
    innerTriggerRef.current?.focus();
  }, [innerTriggerRef]);

  useEffect(() => () => clearTimeout(refocusTimerRef.current), []);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeAndFocusTrigger();
      }
    };
    const onMouseDown = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
        // The browser's mousedown default action moves focus after this listener runs
        // (to the clicked control, or to <body> for non-focusable areas). Return focus to
        // the trigger once that has happened, unless the user clicked another control.
        clearTimeout(refocusTimerRef.current);
        refocusTimerRef.current = setTimeout(() => {
          const active = document.activeElement;
          if (!active || active === document.body || wrapperRef.current?.contains(active)) {
            innerTriggerRef.current?.focus();
          }
        }, 0);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [open, closeAndFocusTrigger, innerTriggerRef]);

  const handleSelect = (item) => (event) => {
    item.onSelect?.(event, { trigger: innerTriggerRef.current });
    closeAndFocusTrigger();
  };

  return (
    <div ref={wrapperRef} className={cx('relative inline-block', className)}>
      <Button
        ref={innerTriggerRef}
        variant="ghost"
        icon={MoreHorizontal}
        iconOnly
        aria-label={label}
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      />
      {open ? (
        <ul
          id={listId}
          className="absolute right-0 mt-1 z-20 min-w-48 py-1 bg-white border border-neutral-200 rounded-md shadow-md"
        >
          {items.map((item, index) => {
            const itemClass = cx(ITEM_BASE, ITEM_TONE[item.tone] ?? ITEM_TONE.default);
            return (
              <li key={item.key ?? `${item.label}-${index}`}>
                {item.href ? (
                  <Button
                    as="a"
                    variant="ghost"
                    href={item.href}
                    download={item.download}
                    icon={item.icon}
                    className={itemClass}
                    onClick={handleSelect(item)}
                  >
                    {item.label}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    icon={item.icon}
                    className={itemClass}
                    onClick={handleSelect(item)}
                  >
                    {item.label}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
