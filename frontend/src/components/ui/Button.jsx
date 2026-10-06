import { Loader2 } from 'lucide-react';
import { cx } from '../../lib/cx';

// All class strings are complete literals so Tailwind's scanner sees every class (Req 1.6).
// Hover/active only change colour; no scale, translate or size changes (Req 2.4, 2.5).
const VARIANT = {
  primary:   'bg-primary text-on-primary border border-primary hover:bg-primary-hover active:bg-primary-active',
  secondary: 'bg-neutral-100 text-neutral-900 border border-neutral-200 hover:bg-neutral-200 active:bg-neutral-300',
  outline:   'bg-white text-primary border border-primary hover:bg-primary-subtle active:bg-neutral-200',
  ghost:     'bg-white text-primary border border-white hover:bg-primary-subtle active:bg-neutral-200',
  danger:    'bg-danger text-white border border-danger hover:bg-danger-hover active:bg-danger-fg',
};

const DISABLED = 'disabled:bg-neutral-100 disabled:text-neutral-600 disabled:border-neutral-200 disabled:cursor-not-allowed';

// <a> has no native disabled state, so mirror DISABLED through aria-disabled.
const LINK_DISABLED = 'aria-disabled:bg-neutral-100 aria-disabled:text-neutral-600 aria-disabled:border-neutral-200 aria-disabled:cursor-not-allowed';

// min-h-10 (40px) at every size (Req 10.11). Padding is set per size below.
const BASE = 'inline-flex items-center justify-center gap-2 rounded-md font-medium text-sm min-h-10 transition-colors duration-150 ease-standard';

const SIZE = {
  sm: 'px-3',
  md: 'px-4',
};

const ICON_ONLY_SIZE = {
  sm: 'min-w-10 px-2',
  md: 'min-w-10 px-2.5',
};

const ICON_CLASS = {
  sm: 'size-4 shrink-0',
  md: 'size-4 shrink-0',
};

/**
 * Shared button primitive.
 *
 * - `as="a"` renders a link (e.g. downloads); disabled/busy links get
 *   `aria-disabled="true"`, `tabIndex=-1` and their clicks are prevented.
 * - `busy` swaps the icon for a spinner, disables the control and ignores clicks.
 *   When `busy` is passed at all, `aria-busy` is always "true" or "false" (Req 8.6).
 * - `iconOnly` requires an `aria-label`.
 * - `ref` is a normal prop in React 19 and is forwarded to the rendered element.
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconOnly = false,
  busy,
  disabled = false,
  as = 'button',
  type = 'button',
  className,
  children,
  onClick,
  ref,
  ...rest
}) {
  const isBusy = Boolean(busy);
  const inactive = Boolean(disabled) || isBusy;
  const isLink = as === 'a';

  if (import.meta.env.DEV && iconOnly && !rest['aria-label']) {
    console.error('Button: `iconOnly` buttons must have an `aria-label`.');
  }

  const handleClick = (event) => {
    if (inactive) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  const classes = cx(
    BASE,
    VARIANT[variant] ?? VARIANT.primary,
    iconOnly ? (ICON_ONLY_SIZE[size] ?? ICON_ONLY_SIZE.md) : (SIZE[size] ?? SIZE.md),
    isLink ? LINK_DISABLED : DISABLED,
    className,
  );

  const iconClass = ICON_CLASS[size] ?? ICON_CLASS.md;
  const visual = isBusy ? (
    <Loader2 className={cx(iconClass, 'animate-spin')} aria-hidden="true" />
  ) : Icon ? (
    <Icon className={iconClass} aria-hidden="true" />
  ) : null;

  const content = (
    <>
      {visual}
      {iconOnly ? null : children}
    </>
  );

  // Only render aria-busy when the caller opted into the busy prop.
  const busyAttr = busy === undefined ? {} : { 'aria-busy': isBusy ? 'true' : 'false' };

  if (isLink) {
    return (
      <a
        ref={ref}
        {...rest}
        {...busyAttr}
        className={classes}
        onClick={handleClick}
        aria-disabled={inactive ? 'true' : undefined}
        tabIndex={inactive ? -1 : rest.tabIndex}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      ref={ref}
      {...rest}
      {...busyAttr}
      type={type}
      className={classes}
      onClick={handleClick}
      disabled={inactive}
    >
      {content}
    </button>
  );
}
