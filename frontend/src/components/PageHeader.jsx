import { T } from '../lib/terminology';
import { cx } from '../lib/cx';

const WRAPPER = 'flex flex-wrap items-start justify-between gap-3 pt-6 pb-4';
const HEADING = 'text-lg font-semibold text-primary';
// Wraps on small screens; never truncated (Req 3.10).
const DESCRIPTION = 'mt-1 text-sm text-neutral-600';

/**
 * Per-view page heading: the single `h2` for the view plus a one-line
 * description, both taken from `T.views[view]` (Req 3.4, 3.5).
 * Rendered directly below Navigation.
 *
 * `ref` (React 19 prop) or `headingRef`, plus `id` and `tabIndex`, are applied
 * to the `h2` so App can move focus there (e.g. after a meeting is deleted).
 * Unknown `view` keys render nothing.
 */
export default function PageHeader({ view, actions, id, tabIndex, headingRef, ref, className }) {
  const copy = T.views[view];
  if (!copy) return null;

  return (
    <div className={cx(WRAPPER, className)}>
      <div className="min-w-0">
        <h2 ref={ref ?? headingRef} id={id} tabIndex={tabIndex} className={HEADING}>
          {copy.title}
        </h2>
        <p className={DESCRIPTION}>{copy.description}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
