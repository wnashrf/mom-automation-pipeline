import { cx } from '../../lib/cx';
import Button from './Button';

const WRAPPER = 'flex flex-col items-center justify-center text-center px-6 py-12';
const ICON = 'size-10 text-neutral-500 mb-4';
const TITLE = 'text-base font-semibold text-neutral-900';
const DESCRIPTION = 'mt-2 max-w-md text-sm text-neutral-600';

/**
 * Centered empty-list message (Req 8.7).
 *
 * - `icon`: lucide component, rendered decoratively (`aria-hidden`).
 * - `title`: rendered as an `h3`.
 * - `action`: optional `{ label, onClick, icon }`, rendered as a primary Button.
 * - `children`: optional extra content (e.g. a secondary action) under the primary action.
 */
export default function EmptyState({ icon: Icon, title, description, action, className, children }) {
  return (
    <div className={cx(WRAPPER, className)}>
      {Icon ? <Icon className={ICON} aria-hidden="true" /> : null}
      <h3 className={TITLE}>{title}</h3>
      {description ? <p className={DESCRIPTION}>{description}</p> : null}
      {action || children ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {action ? (
            <Button variant="primary" icon={action.icon} onClick={action.onClick}>
              {action.label}
            </Button>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
