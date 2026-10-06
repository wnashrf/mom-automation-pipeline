import { cx } from '../../lib/cx';
import { clampPercent } from '../../lib/progress';

// Complete static literals so Tailwind's scanner sees every class (Req 1.6).
const TONE = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};

/**
 * Determinate progress bar (Req 8.2, 12.4). `aria-valuenow` always equals the
 * clamped integer percent; the inline style sets width only, never colour.
 */
export default function ProgressBar({ value, label, tone = 'primary', className }) {
  const pct = clampPercent(value);

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className={cx('h-2 w-full overflow-hidden rounded-full bg-neutral-200', className)}
    >
      <div
        className={cx('h-full rounded-full transition-[width] duration-150 ease-standard', TONE[tone] ?? TONE.primary)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
