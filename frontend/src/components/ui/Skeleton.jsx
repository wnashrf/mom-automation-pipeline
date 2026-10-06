import { cx } from '../../lib/cx';
import { T } from '../../lib/terminology';

// Static neutral blocks only. No pulse/shimmer: decorative looping animation is banned (Req 2.4).
const VARIANT = {
  card: 'h-32 w-full rounded-lg bg-neutral-300',
  row: 'h-10 w-full rounded-md bg-neutral-300',
};

const MIN_COUNT = 3;
const MAX_COUNT = 6;

/** Clamps the placeholder count to an integer in [3, 6]; non-numeric input → 3 (Req 8.1). */
function clampCount(count) {
  const n = typeof count === 'number' ? count : Number(count);
  if (Number.isNaN(n)) return MIN_COUNT;
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, Math.round(n)));
}

/**
 * Loading placeholder. Blocks are `aria-hidden`; assistive tech hears only the
 * visually hidden "Memuatkan..." inside the `role="status"` container.
 */
export default function Skeleton({ variant = 'card', count = 4, className }) {
  const n = clampCount(count);
  const blockClass = VARIANT[variant] ?? VARIANT.card;

  return (
    <div role="status" className={cx('flex flex-col gap-3', className)}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={blockClass} aria-hidden="true" data-skeleton-block="" />
      ))}
      <span className="sr-only">{T.messages.loading}</span>
    </div>
  );
}
