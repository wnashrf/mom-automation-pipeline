import { cx } from '../../lib/cx';

// Flat surface: 1px decorative border, small shadow, max 8px radius (Req 2.4, 2.7).
const BASE = 'bg-white border border-neutral-200 rounded-lg shadow-sm';

const PADDING = {
  none: '',
  md: 'p-4',
  lg: 'p-6',
};

// Optional 2px gold top rule (design: Card `accent`).
const ACCENT = 'border-t-2 border-t-accent';

/**
 * Surface container.
 *
 * - `as` picks the element (`'div'`, `'article'`, `'section'`, ...).
 * - `padding`: `'md'` (default) | `'lg'` | `'none'`.
 * - `accent` adds the 2px gold top rule.
 * - `ref` is a normal prop in React 19 and is forwarded.
 */
export default function Card({
  as: Component = 'div',
  padding = 'md',
  accent = false,
  className,
  children,
  ref,
  ...rest
}) {
  return (
    <Component
      ref={ref}
      {...rest}
      className={cx(BASE, PADDING[padding] ?? PADDING.md, accent && ACCENT, className)}
    >
      {children}
    </Component>
  );
}
