import { History, ListChecks, FileAudio, FilePlus } from 'lucide-react';
import Button from './ui/Button';
import { cx } from '../lib/cx';
import { T } from '../lib/terminology';

// Complete, static class strings selected by a boolean (Req 1.6, 4.3).
// State changes are colour/border only; no scale or gradient (Req 2.4, 2.5).
const ITEM_BASE =
  'inline-flex items-center gap-2 whitespace-nowrap rounded-t-md px-3 min-h-12 min-w-11 text-sm transition-colors duration-150 ease-standard';
const ITEM_ACTIVE =
  'text-primary font-semibold border-b-2 border-primary bg-primary-subtle';
const ITEM_INACTIVE =
  'text-neutral-700 font-medium border-b-2 border-white hover:bg-primary-subtle hover:text-primary';
const ITEM_BUSY = 'aria-disabled:cursor-not-allowed';

// Inset gold ring shows the active state on the navy fill (Req 4.4, 4.5).
const NEW_BASE = 'min-h-11 min-w-11 whitespace-nowrap';
const NEW_ACTIVE = 'ring-2 ring-inset ring-accent-light';

const ITEMS = [
  { view: 'history', label: T.nav.history, icon: History },
  { view: 'tracker', label: T.nav.tracker, icon: ListChecks },
  { view: 'ingest', label: T.nav.ingest, icon: FileAudio },
];

/**
 * Primary navigation bar.
 *
 * Items are always focusable buttons (no `disabled` attribute). While `navBusy`
 * is true they expose `aria-disabled="true"` and ignore activation; the
 * navigation guard in App is the source of truth (Req 4.10).
 */
export default function Navigation({ currentView, setView, onNewMeeting, navBusy = false }) {
  const busyAttr = navBusy ? 'true' : undefined;

  const go = (view) => {
    if (navBusy) return;
    setView?.(view);
  };

  const startNew = () => {
    if (navBusy) return;
    onNewMeeting?.();
  };

  const editorActive = currentView === 'editor';

  return (
    <nav aria-label={T.nav.label} className="bg-white border-b border-neutral-200">
      <div className="mx-auto w-full max-w-(--container-content) px-4 md:px-6">
        <ul className="flex flex-nowrap items-center gap-1 overflow-x-auto py-1">
          {ITEMS.map(({ view, label, icon: Icon }) => {
            const active = currentView === view;
            return (
              <li key={view} className="shrink-0">
                <button
                  type="button"
                  onClick={() => go(view)}
                  aria-current={active ? 'page' : undefined}
                  aria-disabled={busyAttr}
                  className={cx(ITEM_BASE, active ? ITEM_ACTIVE : ITEM_INACTIVE, ITEM_BUSY)}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span>{label}</span>
                </button>
              </li>
            );
          })}
          <li className="ml-auto shrink-0 border-l border-neutral-200 pl-3">
            <Button
              variant="primary"
              icon={FilePlus}
              onClick={startNew}
              aria-current={editorActive ? 'page' : undefined}
              aria-disabled={busyAttr}
              className={cx(NEW_BASE, editorActive ? NEW_ACTIVE : null, ITEM_BUSY)}
            >
              {T.nav.newMeeting}
            </Button>
          </li>
        </ul>
      </div>
    </nav>
  );
}
