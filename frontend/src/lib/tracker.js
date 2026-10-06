/**
 * Pure action-item tracker logic (Req 6.5, 6.6, 7.12, 12.1-12.5, 12.8, 13.7).
 * No React, no I/O. `today` is always passed in as `{year, month, day}`.
 */
import { parseCalendarDate, compareCalendarDates } from './dates.js';

const OVERDUE = 'Tertunggak';
const DONE = 'Selesai';
const IN_PROGRESS = 'Sedang Berjalan';
const NOT_STARTED = 'Belum Mula';

/** Status-filter values that mean "no status filter" (today's TrackerView uses 'all'). */
const ALL_FILTERS = new Set(['all', 'Semua', '']);

/**
 * Flattens meetings -> rows in source order (meeting order, then item order).
 * `storedStatus` is the raw stored value ('' when missing or not a string).
 */
export function flattenActionItems(meetings) {
  const rows = [];
  let sourceOrder = 0;
  (meetings || []).forEach((meeting) => {
    if (!meeting) return;
    const items = Array.isArray(meeting.action_items) ? meeting.action_items : [];
    items.forEach((item, actionIndex) => {
      const it = item || {};
      rows.push({
        key: `${meeting.id}-${actionIndex}`,
        meetingId: meeting.id,
        meetingTitle: meeting.meeting_title,
        actionIndex,
        sourceOrder: sourceOrder++,
        task: it.task,
        assignee: it.assignee,
        deadline: it.deadline,
        storedStatus: typeof it.status === 'string' ? it.status : '',
      });
    });
  });
  return rows;
}

/**
 * Display status for one row: 'Tertunggak' when not Selesai and the deadline parses to a
 * date strictly before `today`; otherwise the stored status unchanged.
 */
export function classifyActionItem({ storedStatus, deadline }, today) {
  if (storedStatus !== DONE) {
    const d = parseCalendarDate(deadline);
    if (d && compareCalendarDates(d, today) < 0) return OVERDUE;
  }
  return storedStatus;
}

/** Statistic bucket for a display status; empty/unknown statuses count as Belum Mula. */
export function statBucket(displayStatus) {
  if (displayStatus === OVERDUE || displayStatus === DONE || displayStatus === IN_PROGRESS) {
    return displayStatus;
  }
  return NOT_STARTED;
}

/** -> { total, 'Belum Mula', 'Sedang Berjalan', 'Tertunggak', 'Selesai' } */
export function computeTrackerStats(rows, today) {
  const stats = { total: 0, [NOT_STARTED]: 0, [IN_PROGRESS]: 0, [OVERDUE]: 0, [DONE]: 0 };
  (rows || []).forEach((row) => {
    stats.total++;
    stats[statBucket(classifyActionItem(row, today))]++;
  });
  return stats;
}

/** -> { total, draft, done } using exact status matches (Req 12.1). */
export function computeHistoryStats(meetings) {
  const list = meetings || [];
  let draft = 0;
  let done = 0;
  list.forEach((m) => {
    const status = m ? m.status : undefined;
    if (status === 'Draf') draft++;
    else if (status === DONE) done++;
  });
  return { total: list.length, draft, done };
}

export function completionRate(done, total) {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/**
 * Stable sort: Tertunggak first; within each group deadline ascending, rows without a
 * parseable deadline last; ties keep `sourceOrder`. Returns a new array.
 */
export function sortActionRows(rows, today) {
  return (rows || [])
    .map((row, i) => ({
      row,
      i,
      overdue: classifyActionItem(row, today) === OVERDUE,
      date: parseCalendarDate(row.deadline),
    }))
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      const byDate = compareCalendarDates(a.date, b.date);
      if (byDate !== 0) return byDate;
      const ao = a.row.sourceOrder ?? a.i;
      const bo = b.row.sourceOrder ?? b.i;
      return ao !== bo ? ao - bo : a.i - b.i;
    })
    .map((x) => x.row);
}

/**
 * Pure status update for one action item. Does not mutate `meetings`.
 * Unchanged meetings and items keep their identity. Setting `undefined` removes the
 * `status` key so a revert with `previousStatus` restores an originally missing key.
 * Returns `updatedMeeting: null` (and the original array) when the target does not exist.
 */
export function applyActionStatus(meetings, meetingId, actionIndex, newStatus) {
  const list = meetings || [];
  const mi = list.findIndex((m) => m && m.id === meetingId);
  const items = mi >= 0 && Array.isArray(list[mi].action_items) ? list[mi].action_items : null;
  if (!items || !Number.isInteger(actionIndex) || actionIndex < 0 || actionIndex >= items.length) {
    return { meetings: list, previousStatus: undefined, updatedMeeting: null };
  }

  const item = items[actionIndex] || {};
  const previousStatus = item.status;
  let nextItem;
  if (newStatus === undefined) {
    nextItem = { ...item };
    delete nextItem.status;
  } else {
    nextItem = { ...item, status: newStatus };
  }

  const nextItems = items.slice();
  nextItems[actionIndex] = nextItem;
  const updatedMeeting = { ...list[mi], action_items: nextItems };
  const next = list.slice();
  next[mi] = updatedMeeting;
  return { meetings: next, previousStatus, updatedMeeting };
}

/**
 * Same semantics as the pre-redesign TrackerView:
 * - term: case-insensitive substring on task, assignee or meetingTitle (no trimming).
 * - status: 'all'/'Semua'/empty -> no filter; 'Tertunggak' -> overdue rows;
 *   'Selesai' -> stored Selesai; other values -> not overdue and stored status equals it.
 */
export function filterActionRows(rows, { term, status } = {}, today) {
  const search = term ? String(term).toLowerCase() : '';
  const noStatusFilter = status == null || ALL_FILTERS.has(status);

  return (rows || []).filter((row) => {
    let statusMatch = true;
    if (!noStatusFilter) {
      const overdue = classifyActionItem(row, today) === OVERDUE;
      if (status === OVERDUE) statusMatch = overdue;
      else if (status === DONE) statusMatch = row.storedStatus === DONE;
      else statusMatch = !overdue && row.storedStatus === status;
    }

    const textMatch =
      !search ||
      String(row.task || '').toLowerCase().includes(search) ||
      String(row.assignee || '').toLowerCase().includes(search) ||
      String(row.meetingTitle || '').toLowerCase().includes(search);

    return statusMatch && textMatch;
  });
}
