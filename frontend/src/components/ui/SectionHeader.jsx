import { cx } from '../../lib/cx';

// Only real heading tags; anything else falls back to h3 (Req 9.10 heading hierarchy).
const HEADING_TAG = {
  2: 'h2',
  3: 'h3',
  4: 'h4',
};

const WRAPPER = 'flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200 pb-3 mb-4';
const HEADING = 'text-base font-semibold text-primary';
const DESCRIPTION = 'mt-1 text-sm text-neutral-600';

/**
 * Section heading with an optional description and right-aligned actions.
 *
 * `id`, `tabIndex` and `ref` are applied to the heading element so the
 * section navigation can move focus there (`tabIndex={-1}`, Req 9.10).
 * `ref` is a normal prop in React 19.
 */
export default function SectionHeader({
  title,
  level = 3,
  description,
  actions,
  id,
  tabIndex,
  className,
  ref,
}) {
  const Heading = HEADING_TAG[level] ?? HEADING_TAG[3];

  return (
    <div className={cx(WRAPPER, className)}>
      <div className="min-w-0">
        <Heading ref={ref} id={id} tabIndex={tabIndex} className={HEADING}>
          {title}
        </Heading>
        {description ? <p className={DESCRIPTION}>{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
