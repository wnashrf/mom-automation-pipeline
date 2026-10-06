import { useState } from 'react';
import {
  Calendar, Download, Eye, FilePlus, FileText, MapPin, PencilLine,
  Search, SearchX, Sparkles, Trash2,
} from 'lucide-react';
import Button from './ui/Button';
import Card from './ui/Card';
import EmptyState from './ui/EmptyState';
import FormField from './ui/FormField';
import OverflowMenu from './ui/OverflowMenu';
import Skeleton from './ui/Skeleton';
import StatusBadge from './ui/StatusBadge';
import { T } from '../lib/terminology';
import { formatDisplayDate } from '../lib/dates';
import { computeHistoryStats } from '../lib/tracker';
import { selectListState } from '../lib/listState';
import { STATUS_CONFIG, TONE_CLASSES } from '../lib/status';
import { cx } from '../lib/cx';

const ALL = 'all';

/** Same matching as the pre-redesign view: exact status, untrimmed case-insensitive substring. */
function matchesMeeting(m, term, statusFilter) {
  const matchesStatus = statusFilter === ALL || m.status === statusFilter;
  const t = term.toLowerCase();
  const matchesSearch =
    (m.meeting_title || '').toLowerCase().includes(t) ||
    (m.chairperson_name || '').toLowerCase().includes(t) ||
    (m.location || '').toLowerCase().includes(t) ||
    (m.date || '').toLowerCase().includes(t);
  return matchesStatus && matchesSearch;
}

/** Download URL is unchanged from the pre-redesign view. */
const docxUrl = (id) => `/api/meetings/${id}/export`;

function StatCard({ label, value, Icon, tone }) {
  return (
    <Card className="flex items-center gap-3">
      <span className={cx('inline-flex size-10 shrink-0 items-center justify-center rounded-md', TONE_CLASSES[tone])}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-neutral-600">{label}</p>
        <p className="text-2xl font-bold text-neutral-900">{value}</p>
      </div>
    </Card>
  );
}

export default function HistoryView({
  meetings = [],
  loading = false,
  onSelectMeeting,
  onEditMeeting,
  onDeleteMeeting,
  onDeleteRequest,
  onNewMeeting,
  onOpenIngest,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState(ALL);

  const list = meetings || [];
  const stats = computeHistoryStats(list);
  const filtered = list.filter((m) => m && matchesMeeting(m, searchTerm, statusFilter));
  const listState = selectListState({ loading, totalCount: list.length, visibleCount: filtered.length });

  const requestDelete = (id, triggerEl) => (onDeleteRequest ?? onDeleteMeeting)?.(id, triggerEl);

  const draftConfig = STATUS_CONFIG[T.status.draft];
  const doneConfig = STATUS_CONFIG[T.status.done];

  const filters = [
    { key: ALL, label: T.history.all, count: stats.total },
    { key: T.status.draft, label: T.status.draft, count: stats.draft },
    { key: T.status.done, label: T.status.done, count: stats.done },
  ];

  const clearSearch = () => {
    setSearchTerm('');
    setStatusFilter(ALL);
  };

  let content;
  if (listState === 'loading') {
    content = <Skeleton variant="card" count={4} />;
  } else if (listState === 'empty') {
    content = (
      <Card>
        <EmptyState
          icon={FileText}
          title={T.history.emptyTitle}
          description={T.history.emptyDescription}
          action={{ label: T.nav.newMeeting, onClick: () => onNewMeeting?.(), icon: FilePlus }}
        >
          <Button variant="outline" icon={Sparkles} onClick={() => onOpenIngest?.()}>
            {T.nav.ingest}
          </Button>
        </EmptyState>
      </Card>
    );
  } else if (listState === 'no-match') {
    content = (
      <Card>
        <EmptyState
          icon={SearchX}
          title={T.history.noMatchTitle}
          description={T.history.noMatchDescription}
          action={{ label: T.actions.clearSearch, onClick: clearSearch }}
        />
      </Card>
    );
  } else {
    content = (
      <div className="space-y-4">
        {filtered.map((m) => {
          const title = m.meeting_title || T.history.untitled;
          return (
            <Card as="article" key={m.id} className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-neutral-900 break-words">{title}</h3>
                  <StatusBadge status={m.status} />
                </div>
                <div className="mt-2 flex flex-col gap-1 text-sm text-neutral-600 sm:flex-row sm:flex-wrap sm:gap-x-6">
                  <span className="flex items-center gap-2">
                    <Calendar className="size-4 shrink-0 text-neutral-500" aria-hidden="true" />
                    {formatDisplayDate(m.date)}
                  </span>
                  <span className="flex items-center gap-2">
                    <MapPin className="size-4 shrink-0 text-neutral-500" aria-hidden="true" />
                    {m.location || T.messages.noLocation}
                  </span>
                </div>
              </div>

              {/* Desktop / tablet actions */}
              <div className="hidden md:flex md:flex-wrap md:justify-end gap-2">
                <Button size="sm" variant="primary" icon={Eye} onClick={() => onSelectMeeting?.(m.id)}>
                  {T.actions.view}
                </Button>
                <Button size="sm" variant="outline" icon={PencilLine} onClick={() => onEditMeeting?.(m.id)}>
                  {T.actions.edit}
                </Button>
                <Button size="sm" variant="outline" icon={Download} as="a" href={docxUrl(m.id)} download>
                  {T.history.downloadDocx}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  icon={Trash2}
                  onClick={(event) => requestDelete(m.id, event.currentTarget)}
                >
                  {T.actions.delete}
                </Button>
              </div>

              {/* Mobile actions */}
              <div className="flex md:hidden items-center gap-2">
                <Button size="sm" variant="primary" icon={Eye} onClick={() => onSelectMeeting?.(m.id)}>
                  {T.actions.view}
                </Button>
                <Button size="sm" variant="outline" icon={PencilLine} onClick={() => onEditMeeting?.(m.id)}>
                  {T.actions.edit}
                </Button>
                <OverflowMenu
                  label={T.history.moreFor(title)}
                  items={[
                    { label: T.history.downloadDocx, icon: Download, href: docxUrl(m.id), download: true },
                    {
                      label: T.actions.delete,
                      icon: Trash2,
                      tone: 'danger',
                      onSelect: (_event, { trigger }) => requestDelete(m.id, trigger),
                    },
                  ]}
                />
              </div>
            </Card>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
      <aside className="lg:col-span-1 space-y-6">
        <section className="space-y-3">
          <h3 className="text-base font-semibold text-primary">{T.history.summary}</h3>
          <StatCard label={T.history.total} value={stats.total} Icon={FileText} tone="info" />
          <StatCard label={T.status.draft} value={stats.draft} Icon={draftConfig.Icon} tone={draftConfig.tone} />
          <StatCard label={T.status.done} value={stats.done} Icon={doneConfig.Icon} tone={doneConfig.tone} />
        </section>

        <Card>
          <fieldset>
            <legend className="mb-3 text-sm font-medium text-neutral-900">{T.history.filterLegend}</legend>
            <div className="flex flex-col gap-2">
              {filters.map((f) => {
                const pressed = statusFilter === f.key;
                return (
                  <Button
                    key={f.key}
                    variant={pressed ? 'primary' : 'secondary'}
                    aria-pressed={pressed ? 'true' : 'false'}
                    className="w-full justify-between!"
                    onClick={() => setStatusFilter(f.key)}
                  >
                    <span>{f.label}</span>
                    <span className="text-xs font-semibold">{f.count}</span>
                  </Button>
                );
              })}
            </div>
          </fieldset>
        </Card>
      </aside>

      <div className="lg:col-span-3 space-y-6">
        <Card>
          <FormField label={T.history.searchLabel}>
            {({ id, describedBy, className }) => (
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-500"
                  aria-hidden="true"
                />
                <input
                  id={id}
                  type="search"
                  aria-describedby={describedBy}
                  placeholder={T.history.searchPlaceholder}
                  className={cx(className, 'pl-9')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            )}
          </FormField>
        </Card>
        {content}
      </div>
    </div>
  );
}
