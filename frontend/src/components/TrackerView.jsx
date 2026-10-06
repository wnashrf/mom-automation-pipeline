import { useState } from 'react';
import { FileAudio, FilePlus, ListChecks, Search, SearchX } from 'lucide-react';
import Button from './ui/Button';
import Card from './ui/Card';
import SectionHeader from './ui/SectionHeader';
import FormField from './ui/FormField';
import StatusBadge from './ui/StatusBadge';
import EmptyState from './ui/EmptyState';
import Skeleton from './ui/Skeleton';
import ProgressBar from './ui/ProgressBar';
import { useToast } from './ui/toastContext';
import {
  flattenActionItems,
  classifyActionItem,
  computeTrackerStats,
  completionRate,
  filterActionRows,
  sortActionRows,
  applyActionStatus,
} from '../lib/tracker';
import { formatDisplayDate, todayLocal } from '../lib/dates';
import { STATUS_CONFIG, TONE_CLASSES } from '../lib/status';
import { selectListState } from '../lib/listState';
import { requestJson } from '../lib/api';
import { buildErrorMessage } from '../lib/errors';
import { cx } from '../lib/cx';
import { T } from '../lib/terminology';

// Stat cards: Jumlah uses the primary palette; the rest reuse StatusBadge icon + tone (Req 12.2).
const STAT_STATUSES = [T.status.notStarted, T.status.inProgress, T.status.overdue, T.status.done];
const TOTAL_ICON_CLASS = 'bg-primary-subtle text-primary border border-neutral-200';

// Filter options and values are identical to the pre-redesign TrackerView.
const FILTER_OPTIONS = [
  { value: 'all', label: T.tracker.allStatuses },
  { value: T.status.notStarted, label: T.status.notStarted },
  { value: T.status.inProgress, label: T.status.inProgress },
  { value: T.status.overdue, label: T.status.overdue },
  { value: T.status.done, label: T.status.done },
];

// Editable statuses (Tertunggak is derived from the deadline, never stored).
const EDIT_OPTIONS = [T.status.notStarted, T.status.inProgress, T.status.done];

// Complete static class strings (Req 1.6).
const SELECT_CLASS =
  'w-full rounded-md bg-white text-sm text-neutral-900 px-2 py-1.5 min-h-10 border border-neutral-500 hover:border-neutral-700 ' +
  'disabled:bg-neutral-100 disabled:text-neutral-600 disabled:cursor-not-allowed';
const TH_CLASS = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-700';
const TD_CLASS = 'px-4 py-3 align-top text-sm text-neutral-900';
const DATE_NORMAL = 'text-neutral-900';
const DATE_OVERDUE = 'font-medium text-danger-fg';

/** Number card for one statistic. Module-level so it is not re-created on every render. */
function StatCard({ label, value, Icon, iconClass }) {
  return (
    <Card as="li" className="flex items-center gap-3">
      <span className={cx('inline-flex shrink-0 items-center justify-center rounded-md p-2', iconClass)}>
        <Icon className="size-5" aria-hidden="true" focusable="false" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-700">{label}</p>
        <p className="text-2xl font-bold text-neutral-900">{value}</p>
      </div>
    </Card>
  );
}

/** Compact status select for one row; disabled with aria-busy while that row saves. */
function StatusSelect({ row, saving, onChange }) {
  return (
    <select
      aria-label={T.tracker.updateStatusFor(row.task || T.tracker.noTask)}
      value={row.storedStatus || T.status.notStarted}
      onChange={(e) => onChange(row, e.target.value)}
      disabled={saving}
      aria-busy={saving ? 'true' : 'false'}
      className={SELECT_CLASS}
    >
      {EDIT_OPTIONS.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

function DeadlineText({ row }) {
  return (
    <span className={row.overdue ? DATE_OVERDUE : DATE_NORMAL}>
      {row.deadline ? formatDisplayDate(row.deadline) : T.messages.noDate}
    </span>
  );
}

export default function TrackerView({ meetings, loading = false, onNewMeeting, onOpenIngest }) {
  const toast = useToast();

  // Local copy for optimistic status updates. Synced from props with the
  // "store previous props" pattern (setState during render, no effect), so a new
  // `meetings` list from App replaces any local edits without a cascading render.
  const [localMeetings, setLocalMeetings] = useState(meetings);
  const [syncedMeetings, setSyncedMeetings] = useState(meetings);
  if (meetings !== syncedMeetings) {
    setSyncedMeetings(meetings);
    setLocalMeetings(meetings);
  }

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [savingKeys, setSavingKeys] = useState(() => new Set());

  // ── Data pipeline ──────────────────────────────────────────────────────────
  const today = todayLocal();
  const rows = flattenActionItems(localMeetings);
  const stats = computeTrackerStats(rows, today);
  const rate = completionRate(stats[T.status.done], stats.total);
  const visible = sortActionRows(
    filterActionRows(rows, { term: searchTerm, status: statusFilter }, today),
    today,
  ).map((row) => {
    const displayStatus = classifyActionItem(row, today);
    return { ...row, displayStatus, overdue: displayStatus === T.status.overdue };
  });
  const listState = selectListState({ loading, totalCount: stats.total, visibleCount: visible.length });

  const setRowSaving = (key, saving) => {
    setSavingKeys((prev) => {
      const next = new Set(prev);
      if (saving) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  // ── Status change: optimistic update, persist, roll back on failure ─────────
  const handleStatusChange = async (row, newStatus) => {
    const { meetings: next, previousStatus, updatedMeeting } = applyActionStatus(
      localMeetings, row.meetingId, row.actionIndex, newStatus,
    );
    if (!updatedMeeting) return;
    setLocalMeetings(next);
    setRowSaving(row.key, true);

    // Same endpoint, method, headers and full-meeting payload as before the redesign.
    const result = await requestJson('/api/meetings/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedMeeting),
    });

    setRowSaving(row.key, false);
    if (!result.ok) {
      // Functional update so the rollback applies to the latest state, not this closure.
      setLocalMeetings((prev) => applyActionStatus(prev, row.meetingId, row.actionIndex, previousStatus).meetings);
      toast.error(buildErrorMessage(T.ops.statusSave, result.detail));
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
  };

  // ── List body by state ─────────────────────────────────────────────────────
  let listBody;
  if (listState === 'loading') {
    listBody = <Skeleton variant="row" count={5} />;
  } else if (listState === 'empty') {
    listBody = (
      <EmptyState
        icon={ListChecks}
        title={T.tracker.emptyTitle}
        description={T.tracker.emptyDescription}
        action={onOpenIngest ? { label: T.nav.ingest, onClick: onOpenIngest, icon: FileAudio } : undefined}
      >
        {onNewMeeting ? (
          <Button variant="outline" icon={FilePlus} onClick={onNewMeeting}>
            {T.nav.newMeeting}
          </Button>
        ) : null}
      </EmptyState>
    );
  } else if (listState === 'no-match') {
    listBody = (
      <EmptyState
        icon={SearchX}
        title={T.tracker.noMatchTitle}
        description={T.tracker.noMatchDescription}
        action={{ label: T.actions.clearSearch, onClick: clearFilters }}
      />
    );
  } else {
    listBody = (
      <>
        {/* Desktop: table (Req 12.6) */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full border-collapse">
            <caption className="sr-only">{T.tracker.caption}</caption>
            <thead className="border-b border-neutral-200 bg-neutral-50">
              <tr>
                <th scope="col" className={TH_CLASS}>{T.tracker.colTask}</th>
                <th scope="col" className={TH_CLASS}>{T.tracker.colAssignee}</th>
                <th scope="col" className={TH_CLASS}>{T.tracker.colDeadline}</th>
                <th scope="col" className={TH_CLASS}>{T.tracker.colMeeting}</th>
                <th scope="col" className={TH_CLASS}>{T.tracker.colStatus}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.key} className="border-b border-neutral-200 last:border-b-0">
                  <td className={cx(TD_CLASS, 'font-medium')}>{row.task || T.tracker.noTask}</td>
                  <td className={TD_CLASS}>{row.assignee || T.messages.unassigned}</td>
                  <td className={cx(TD_CLASS, 'whitespace-nowrap')}><DeadlineText row={row} /></td>
                  <td className={cx(TD_CLASS, 'text-neutral-700')}>{row.meetingTitle || T.tracker.untitledMeeting}</td>
                  <td className={cx(TD_CLASS, 'w-56')}>
                    <div className="flex flex-col items-start gap-2">
                      <StatusBadge status={row.displayStatus} />
                      <StatusSelect row={row} saving={savingKeys.has(row.key)} onChange={handleStatusChange} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile / tablet: stacked cards with the same five fields (Req 12.7) */}
        <ul className="flex flex-col gap-3 lg:hidden">
          {visible.map((row) => (
            <Card as="li" key={row.key}>
              <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                <div className="md:col-span-2">
                  <dt className="text-xs font-semibold text-neutral-600">{T.tracker.colTask}</dt>
                  <dd className="mt-0.5 font-medium text-neutral-900 break-words">{row.task || T.tracker.noTask}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-neutral-600">{T.tracker.colAssignee}</dt>
                  <dd className="mt-0.5 text-neutral-900 break-words">{row.assignee || T.messages.unassigned}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-neutral-600">{T.tracker.colDeadline}</dt>
                  <dd className="mt-0.5"><DeadlineText row={row} /></dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-xs font-semibold text-neutral-600">{T.tracker.colMeeting}</dt>
                  <dd className="mt-0.5 text-neutral-700 break-words">{row.meetingTitle || T.tracker.untitledMeeting}</dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-xs font-semibold text-neutral-600">{T.tracker.colStatus}</dt>
                  <dd className="mt-1 flex flex-col items-start gap-2">
                    <StatusBadge status={row.displayStatus} />
                    <StatusSelect row={row} saving={savingKeys.has(row.key)} onChange={handleStatusChange} />
                  </dd>
                </div>
              </dl>
            </Card>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics (Req 12.2) */}
      <section aria-label={T.tracker.statsLabel}>
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <StatCard label={T.tracker.total} value={stats.total} Icon={ListChecks} iconClass={TOTAL_ICON_CLASS} />
          {STAT_STATUSES.map((status) => {
            const { label, tone, Icon } = STATUS_CONFIG[status];
            return (
              <StatCard key={status} label={label} value={stats[status]} Icon={Icon} iconClass={TONE_CLASSES[tone]} />
            );
          })}
        </ul>
      </section>

      {/* Completion rate (Req 12.4, 12.5) */}
      <Card padding="lg">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-primary">{T.tracker.completionTitle}</h3>
          <p className="text-2xl font-bold text-neutral-900">{rate}%</p>
        </div>
        <ProgressBar value={rate} tone="success" label={T.tracker.completionLabel} className="mt-3" />
        <p className="mt-2 text-sm text-neutral-600">
          {T.tracker.completionSummary(stats[T.status.done], stats.total)}
        </p>
      </Card>

      {/* Filters */}
      <Card>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_16rem]">
          <FormField label={T.tracker.searchLabel}>
            {({ id, describedBy, className }) => (
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-600"
                  aria-hidden="true"
                />
                <input
                  id={id}
                  type="search"
                  aria-describedby={describedBy}
                  placeholder={T.tracker.searchPlaceholder}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={cx(className, 'pl-9')}
                />
              </div>
            )}
          </FormField>
          <FormField
            as="select"
            label={T.tracker.statusFilterLabel}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </FormField>
        </div>
      </Card>

      {/* Action-item list */}
      <Card padding="lg">
        <SectionHeader
          title={T.tracker.listTitle}
          description={listState === 'list' ? T.tracker.shownCount(visible.length, stats.total) : undefined}
        />
        {listBody}
      </Card>
    </div>
  );
}
