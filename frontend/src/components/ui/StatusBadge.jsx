import { cx } from '../../lib/cx';
import { getStatusConfig, TONE_CLASSES } from '../../lib/status';

const BASE = 'inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-medium';

/** Complete static size strings so Tailwind detects them at build time. Text never below 12px. */
const SIZE_CLASSES = Object.freeze({
  sm: 'gap-1 px-2 py-0.5 text-xs',
  md: 'gap-1.5 px-2.5 py-0.5 text-xs',
});

const ICON_SIZE = Object.freeze({
  sm: 'size-3',
  md: 'size-3.5',
});

/**
 * Status pill (Req 1.10, 6.1–6.4, 6.7).
 *
 * Status is conveyed by label + icon + tone, never colour alone. The icon is decorative
 * (`aria-hidden`) so the visible label is the accessible name. Unknown or non-string values
 * render the "Tidak Diketahui" config; the raw value is never displayed or modified.
 */
export default function StatusBadge({ status, size = 'md', className }) {
  const { label, tone, Icon } = getStatusConfig(status);
  const sizeKey = Object.hasOwn(SIZE_CLASSES, size) ? size : 'md';

  return (
    <span className={cx(BASE, SIZE_CLASSES[sizeKey], TONE_CLASSES[tone], className)}>
      <Icon className={cx('shrink-0', ICON_SIZE[sizeKey])} aria-hidden="true" focusable="false" />
      <span>{label}</span>
    </span>
  );
}
