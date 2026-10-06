import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  applyActionStatus,
  classifyActionItem,
  completionRate,
  computeHistoryStats,
  computeTrackerStats,
  filterActionRows,
  flattenActionItems,
  sortActionRows,
} from './tracker.js';

// ---------------------------------------------------------------------------
// Shared generators (reused by later tracker properties)
// ---------------------------------------------------------------------------

const pad = (n, w = 2) => String(n).padStart(w, '0');
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (y, m) =>
  m === 2 ? (isLeap(y) ? 29 : 28) : [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

/** Independent ordering key for a `{year, month, day}` date (oracle, not the code under test). */
const dateKey = (d) => d.year * 10000 + d.month * 100 + d.day;

const KNOWN_STATUSES = ['Belum Mula', 'Sedang Berjalan', 'Selesai', 'Tertunggak', 'Draf'];

/** Valid calendar date: year 1000-9999, day bounded by days-in-month (leap years included). */
const calendarDateArb = fc
  .record({ year: fc.integer({ min: 1000, max: 9999 }), month: fc.integer({ min: 1, max: 12 }) })
  .chain(({ year, month }) =>
    fc.integer({ min: 1, max: daysIn(year, month) }).map((day) => ({ year, month, day })),
  );

/** A valid date near `today` (same day, adjacent day, same month/year) or fully random. */
const dateRelativeToArb = (today) =>
  fc.oneof(
    fc.constant({ ...today }),
    fc.constantFrom(-1, 1).map((delta) => {
      const day = today.day + delta;
      return day >= 1 && day <= daysIn(today.year, today.month) ? { ...today, day } : { ...today };
    }),
    fc.integer({ min: 1, max: daysIn(today.year, today.month) }).map((day) => ({ ...today, day })),
    fc
      .integer({ min: 1, max: 12 })
      .chain((month) =>
        fc
          .integer({ min: 1, max: daysIn(today.year, month) })
          .map((day) => ({ year: today.year, month, day })),
      ),
    calendarDateArb,
  );

/** Serialises a valid date as ISO (optionally with a time part) or legacy D/M/YYYY. */
const formatDateArb = (d) =>
  fc.constantFrom(
    `${d.year}-${pad(d.month)}-${pad(d.day)}`,
    `${d.year}-${pad(d.month)}-${pad(d.day)}T09:30:00`,
    `${d.day}/${d.month}/${d.year}`,
  );

/**
 * Text that never parses as a date: random strings without 4 consecutive digits (every
 * accepted format has a 4-digit year) plus fixed invalid dates such as '2026-02-30'.
 */
const unparseableArb = fc.oneof(
  fc.constantFrom('', '   ', 'tiada', 'TBD', 'minggu depan', '2026-13-01', '2026-02-30', '31/4/2026'),
  fc.string().filter((s) => !/\d{4}/.test(s)),
);

/**
 * Deadline relative to `today`: `{ value, date }` where `date` is the intended calendar
 * date for parseable values and `null` for empty/unparseable ones.
 */
const deadlineArb = (today) =>
  fc.oneof(
    { weight: 3, arbitrary: dateRelativeToArb(today).chain((date) => formatDateArb(date).map((value) => ({ value, date }))) },
    { weight: 1, arbitrary: unparseableArb.map((value) => ({ value, date: null })) },
  );

/** Stored status: one of the known values, empty, or arbitrary text. */
const storedStatusArb = fc.oneof(fc.constantFrom(...KNOWN_STATUSES, ''), fc.string());

// ---------------------------------------------------------------------------

describe('tracker', () => {
  // Feature: professional-ui-redesign, Property 4: Overdue classification holds exactly when deadline is past and not Selesai
  // **Validates: Requirements 6.5, 6.6, 12.3**
  describe('classifyActionItem', () => {
    it('Property 4: returns Tertunggak iff not Selesai and deadline is strictly before today; else stored status', () => {
      fc.assert(
        fc.property(
          calendarDateArb.chain((today) =>
            fc.record({
              today: fc.constant(today),
              deadline: deadlineArb(today),
              storedStatus: storedStatusArb,
            }),
          ),
          ({ today, deadline, storedStatus }) => {
            const result = classifyActionItem({ storedStatus, deadline: deadline.value }, today);
            const expectOverdue =
              storedStatus !== 'Selesai' &&
              deadline.date !== null &&
              dateKey(deadline.date) < dateKey(today);
            expect(result).toBe(expectOverdue ? 'Tertunggak' : storedStatus);
          },
        ),
        { numRuns: 300 },
      );
    });

    it('keeps the stored status for a deadline equal to today and for Selesai items with past deadlines', () => {
      const today = { year: 2026, month: 3, day: 5 };
      expect(classifyActionItem({ storedStatus: 'Belum Mula', deadline: '2026-03-05' }, today)).toBe('Belum Mula');
      expect(classifyActionItem({ storedStatus: 'Belum Mula', deadline: '2026-03-04' }, today)).toBe('Tertunggak');
      expect(classifyActionItem({ storedStatus: 'Selesai', deadline: '2020-01-01' }, today)).toBe('Selesai');
      expect(classifyActionItem({ storedStatus: '', deadline: '' }, today)).toBe('');
    });
  });

  // Feature: professional-ui-redesign, Property 5: Tracker statistics partition the action items
  // **Validates: Requirements 12.2, 12.3**
  describe('computeTrackerStats', () => {
    const BUCKETS = ['Belum Mula', 'Sedang Berjalan', 'Tertunggak', 'Selesai'];

    /** Independent oracle: overdue overrides non-Selesai; empty/unknown -> Belum Mula. */
    const oracleBucket = (status, date, today) => {
      if (status !== 'Selesai' && date !== null && dateKey(date) < dateKey(today)) return 'Tertunggak';
      return ['Sedang Berjalan', 'Tertunggak', 'Selesai'].includes(status) ? status : 'Belum Mula';
    };

    /** Action item plus its intended deadline date; status may be missing or non-string. */
    const itemArb = (today) =>
      fc.record({
        deadline: deadlineArb(today),
        status: fc.oneof(
          { weight: 4, arbitrary: storedStatusArb },
          { weight: 1, arbitrary: fc.constantFrom(undefined, null, 42) },
        ),
      });

    const meetingsArb = (today) =>
      fc.array(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 8 }),
          meeting_title: fc.string(),
          items: fc.array(itemArb(today), { maxLength: 6 }),
        }),
        { maxLength: 5 },
      );

    it('Property 5: buckets are non-negative, sum to total = number of items, and match the oracle', () => {
      fc.assert(
        fc.property(
          calendarDateArb.chain((today) =>
            fc.record({ today: fc.constant(today), meetings: meetingsArb(today) }),
          ),
          ({ today, meetings }) => {
            const input = meetings.map((m) => ({
              id: m.id,
              meeting_title: m.meeting_title,
              action_items: m.items.map(({ deadline, status }) =>
                status === undefined ? { deadline: deadline.value } : { deadline: deadline.value, status },
              ),
            }));
            const allItems = meetings.flatMap((m) => m.items);

            const stats = computeTrackerStats(flattenActionItems(input), today);

            const expected = { total: allItems.length };
            BUCKETS.forEach((b) => (expected[b] = 0));
            allItems.forEach(({ status, deadline }) => {
              const stored = typeof status === 'string' ? status : '';
              expected[oracleBucket(stored, deadline.date, today)]++;
            });

            expect(stats).toEqual(expected);
            BUCKETS.forEach((b) => {
              expect(Number.isInteger(stats[b]) && stats[b] >= 0).toBe(true);
            });
            expect(BUCKETS.reduce((sum, b) => sum + stats[b], 0)).toBe(stats.total);
          },
        ),
        { numRuns: 200 },
      );
    });

    it('counts empty/unknown statuses as Belum Mula and overdue overrides non-Selesai', () => {
      const today = { year: 2026, month: 3, day: 5 };
      const rows = [
        { storedStatus: '', deadline: '' },
        { storedStatus: 'Draf', deadline: '2026-12-01' },
        { storedStatus: 'Sedang Berjalan', deadline: '2026-03-04' },
        { storedStatus: 'Selesai', deadline: '2020-01-01' },
        { storedStatus: 'Sedang Berjalan', deadline: '2026-03-05' },
      ];
      expect(computeTrackerStats(rows, today)).toEqual({
        total: 5,
        'Belum Mula': 2,
        'Sedang Berjalan': 1,
        Tertunggak: 1,
        Selesai: 1,
      });
      expect(computeTrackerStats([], today).total).toBe(0);
    });
  });

  // Feature: professional-ui-redesign, Property 6: History statistics are exact counts
  // **Validates: Requirements 12.1**
  describe('computeHistoryStats', () => {
    /** Status: exact/near-miss values, arbitrary text, or missing entirely (undefined). */
    const historyStatusArb = fc.oneof(
      { weight: 3, arbitrary: fc.constantFrom('Draf', 'Selesai', '', 'draf', 'Selesai ') },
      { weight: 2, arbitrary: fc.string() },
      { weight: 1, arbitrary: fc.constant(undefined) },
    );

    const historyMeetingsArb = fc.array(
      fc.record({ id: fc.string({ minLength: 1, maxLength: 8 }), status: historyStatusArb }),
      { maxLength: 20 },
    );

    it('Property 6: total = length, draft/done are exact-match counts, draft + done <= total', () => {
      fc.assert(
        fc.property(historyMeetingsArb, (records) => {
          const meetings = records.map(({ id, status }) => (status === undefined ? { id } : { id, status }));

          const stats = computeHistoryStats(meetings);

          const expected = {
            total: records.length,
            draft: records.filter((r) => r.status === 'Draf').length,
            done: records.filter((r) => r.status === 'Selesai').length,
          };
          expect(stats).toEqual(expected);
          ['total', 'draft', 'done'].forEach((k) => {
            expect(Number.isInteger(stats[k]) && stats[k] >= 0).toBe(true);
          });
          expect(stats.draft + stats.done).toBeLessThanOrEqual(stats.total);
        }),
        { numRuns: 200 },
      );
    });

    it('ignores near-miss statuses and handles an empty list', () => {
      expect(
        computeHistoryStats([{ status: 'Draf' }, { status: 'draf' }, { status: 'Selesai ' }, { status: 'Selesai' }, {}]),
      ).toEqual({ total: 5, draft: 1, done: 1 });
      expect(computeHistoryStats([])).toEqual({ total: 0, draft: 0, done: 0 });
    });
  });

  // Feature: professional-ui-redesign, Property 7: Completion rate is a bounded rounded percentage
  // **Validates: Requirements 12.4, 12.5**
  describe('completionRate', () => {
    /** total in 0..10000 and done in 0..total. */
    const doneTotalArb = fc
      .nat({ max: 10000 })
      .chain((total) => fc.record({ total: fc.constant(total), done: fc.integer({ min: 0, max: total }) }));

    it('Property 7: integer in [0, 100], equals Math.round(done/total*100), 0 when total is 0', () => {
      fc.assert(
        fc.property(doneTotalArb, ({ done, total }) => {
          const rate = completionRate(done, total);

          expect(Number.isInteger(rate)).toBe(true);
          expect(rate).toBeGreaterThanOrEqual(0);
          expect(rate).toBeLessThanOrEqual(100);
          expect(rate).toBe(total === 0 ? 0 : Math.round((done / total) * 100));
          if (total > 0 && done === total) expect(rate).toBe(100);
          if (done < total) expect(completionRate(done + 1, total)).toBeGreaterThanOrEqual(rate);
        }),
        { numRuns: 300 },
      );
    });

    it('handles empty totals and rounding boundaries', () => {
      expect(completionRate(0, 0)).toBe(0);
      expect(completionRate(0, 5)).toBe(0);
      expect(completionRate(5, 5)).toBe(100);
      expect(completionRate(1, 3)).toBe(33);
      expect(completionRate(2, 3)).toBe(67);
      expect(completionRate(1, 8)).toBe(13);
    });
  });

  // Feature: professional-ui-redesign, Property 8: Tracker sort ordering
  // **Validates: Requirements 12.8**
  describe('sortActionRows', () => {
    /** Independent oracle for the Tertunggak display status (stored or derived). */
    const oracleOverdue = (storedStatus, date, today) =>
      storedStatus === 'Tertunggak' ||
      (storedStatus !== 'Selesai' && date !== null && dateKey(date) < dateKey(today));

    /**
     * today + rows with unique key/sourceOrder, presented in shuffled input order.
     * Deadlines are drawn either from a small shared pool (duplicates) or fresh.
     */
    const sortCaseArb = calendarDateArb.chain((today) =>
      fc
        .array(deadlineArb(today), { minLength: 1, maxLength: 4 })
        .chain((pool) =>
          fc.array(
            fc.record({
              storedStatus: storedStatusArb,
              deadline: fc.oneof(fc.constantFrom(...pool), deadlineArb(today)),
            }),
            { maxLength: 25 },
          ),
        )
        .map((specs) =>
          specs.map((s, i) => ({
            row: { key: `row-${i}`, sourceOrder: i, storedStatus: s.storedStatus, deadline: s.deadline.value },
            date: s.deadline.date,
          })),
        )
        .chain((entries) =>
          fc.record({
            today: fc.constant(today),
            entries: fc.shuffledSubarray(entries, { minLength: entries.length, maxLength: entries.length }),
          }),
        ),
    );

    it('Property 8: permutation; overdue first; deadline ascending with unparseable last; ties by sourceOrder', () => {
      fc.assert(
        fc.property(sortCaseArb, ({ today, entries }) => {
          const input = entries.map((e) => e.row);
          const snapshot = input.map((r) => ({ ...r }));
          const dateOf = new Map(entries.map((e) => [e.row.key, e.date]));

          const out = sortActionRows(input, today);

          // New array, input not mutated (order or contents).
          expect(out).not.toBe(input);
          expect(input).toEqual(snapshot);

          // Permutation: same rows (by identity) and same keys.
          expect(out).toHaveLength(input.length);
          expect(new Set(out)).toEqual(new Set(input));
          expect(out.map((r) => r.key).sort()).toEqual(input.map((r) => r.key).sort());

          for (let i = 1; i < out.length; i++) {
            const a = out[i - 1];
            const b = out[i];
            const aOver = oracleOverdue(a.storedStatus, dateOf.get(a.key), today);
            const bOver = oracleOverdue(b.storedStatus, dateOf.get(b.key), today);

            // Group order: no overdue row after a non-overdue row.
            expect(!aOver && bOver).toBe(false);
            if (aOver !== bOver) continue;

            const ad = dateOf.get(a.key);
            const bd = dateOf.get(b.key);
            // Unparseable/empty never precede parseable within a group.
            expect(ad === null && bd !== null).toBe(false);
            if (ad !== null && bd !== null) {
              expect(dateKey(ad)).toBeLessThanOrEqual(dateKey(bd));
              if (dateKey(ad) === dateKey(bd)) expect(a.sourceOrder).toBeLessThan(b.sourceOrder);
            } else if (ad === null && bd === null) {
              expect(a.sourceOrder).toBeLessThan(b.sourceOrder);
            }
          }
        }),
        { numRuns: 300 },
      );
    });

    it('orders a fixed example with duplicate, empty and unparseable deadlines', () => {
      const today = { year: 2026, month: 3, day: 5 };
      const rows = [
        { key: 'a', sourceOrder: 0, storedStatus: 'Belum Mula', deadline: '' },
        { key: 'b', sourceOrder: 1, storedStatus: 'Belum Mula', deadline: '2026-04-01' },
        { key: 'c', sourceOrder: 2, storedStatus: 'Sedang Berjalan', deadline: '2026-03-01' },
        { key: 'd', sourceOrder: 3, storedStatus: 'Selesai', deadline: '2026-01-01' },
        { key: 'e', sourceOrder: 4, storedStatus: 'Belum Mula', deadline: '1/4/2026' },
        { key: 'f', sourceOrder: 5, storedStatus: 'Belum Mula', deadline: 'tiada' },
        { key: 'g', sourceOrder: 6, storedStatus: 'Belum Mula', deadline: '2026-02-01' },
      ];
      expect(sortActionRows(rows, today).map((r) => r.key)).toEqual(['g', 'c', 'd', 'b', 'e', 'a', 'f']);
      expect(sortActionRows([], today)).toEqual([]);
    });
  });

  // Feature: professional-ui-redesign, Property 10: Action status change is reversible
  // **Validates: Requirements 7.12**
  describe('applyActionStatus', () => {
    /** Legacy/extra JSON-ish values carried on records (must round-trip untouched). */
    const legacyValueArb = fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null), fc.array(fc.string(), { maxLength: 3 }));

    /** Action item: status missing or a string; optional extra legacy keys. */
    const actionItemArb = fc.record(
      {
        task: fc.string(),
        assignee: fc.string(),
        deadline: fc.string(),
        status: storedStatusArb,
        legacy_note: legacyValueArb,
        tindakan_oleh: legacyValueArb,
      },
      { requiredKeys: ['task'] },
    ).map((r) => ({ ...r })); // plain Object prototype (optional-key records are null-proto)

    const meetingArb = fc.record(
      {
        meeting_title: fc.string(),
        status: fc.constantFrom('Draf', 'Selesai'),
        action_items: fc.array(actionItemArb, { maxLength: 5 }),
        legacy_field: legacyValueArb,
        bil_mesyuarat: legacyValueArb,
      },
      { requiredKeys: ['action_items'] },
    ).map((r) => ({ ...r }));

    /** Meetings with unique ids; at least one meeting has at least one action item. */
    const meetingsArb = fc
      .uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 1, maxLength: 5 })
      .chain((ids) => fc.tuple(...ids.map((id) => meetingArb.map((m) => ({ id, ...m })))))
      .filter((ms) => ms.some((m) => m.action_items.length > 0));

    /** meetings + an existing (meetingIndex, actionIndex) target + a new status. */
    const caseArb = meetingsArb.chain((meetings) => {
      const targets = meetings.flatMap((m, mi) => m.action_items.map((_, ai) => ({ mi, ai })));
      return fc.record({
        meetings: fc.constant(meetings),
        target: fc.constantFrom(...targets),
        newStatus: fc.oneof(fc.constantFrom(...KNOWN_STATUSES), fc.string()),
      });
    });

    it('Property 10: changing a status touches only that item and reverting with previousStatus restores the input', () => {
      fc.assert(
        fc.property(caseArb, ({ meetings, target, newStatus }) => {
          const { mi, ai } = target;
          const snapshot = structuredClone(meetings);
          const originalItem = meetings[mi].action_items[ai];
          const hadStatus = Object.prototype.hasOwnProperty.call(originalItem, 'status');

          const { meetings: next, previousStatus, updatedMeeting } = applyActionStatus(
            meetings,
            meetings[mi].id,
            ai,
            newStatus,
          );

          // (1) Input is not mutated.
          expect(meetings).toStrictEqual(snapshot);
          expect(previousStatus).toBe(originalItem.status);

          // (2) Intermediate result differs only in the target item's status.
          expect(next).not.toBe(meetings);
          expect(updatedMeeting).toBe(next[mi]);
          expect(next[mi].action_items[ai].status).toBe(newStatus);
          next.forEach((m, i) => {
            if (i !== mi) expect(m).toBe(meetings[i]);
          });
          next[mi].action_items.forEach((item, j) => {
            if (j !== ai) expect(item).toBe(meetings[mi].action_items[j]);
          });
          const normalised = structuredClone(next);
          const normItem = normalised[mi].action_items[ai];
          if (hadStatus) normItem.status = originalItem.status;
          else delete normItem.status;
          expect(normalised).toStrictEqual(snapshot);

          // (3) Reverting with previousStatus restores the original (incl. a missing key).
          const reverted = applyActionStatus(next, meetings[mi].id, ai, previousStatus);
          expect(reverted.meetings).toStrictEqual(snapshot);
          expect(Object.prototype.hasOwnProperty.call(reverted.meetings[mi].action_items[ai], 'status')).toBe(hadStatus);
        }),
        { numRuns: 200 },
      );
    });

    it('Property 10: a non-existent target is a no-op', () => {
      fc.assert(
        fc.property(
          meetingsArb.chain((meetings) =>
            fc.record({
              meetings: fc.constant(meetings),
              newStatus: fc.oneof(fc.constantFrom(...KNOWN_STATUSES), fc.string()),
              target: fc.oneof(
                // Unknown meeting id.
                fc
                  .string({ minLength: 1, maxLength: 9 })
                  .filter((id) => !meetings.some((m) => m.id === id))
                  .map((id) => ({ id, ai: 0 })),
                // Known meeting, out-of-range or non-integer index.
                fc.nat({ max: meetings.length - 1 }).chain((mi) =>
                  fc
                    .constantFrom(-1, meetings[mi].action_items.length, meetings[mi].action_items.length + 3, 0.5)
                    .map((ai) => ({ id: meetings[mi].id, ai })),
                ),
              ),
            }),
          ),
          ({ meetings, newStatus, target }) => {
            const snapshot = structuredClone(meetings);
            const result = applyActionStatus(meetings, target.id, target.ai, newStatus);
            expect(result.meetings).toBe(meetings);
            expect(result.previousStatus).toBeUndefined();
            expect(result.updatedMeeting).toBeNull();
            expect(meetings).toStrictEqual(snapshot);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('restores a missing status key on revert', () => {
      const meetings = [{ id: 'm1', action_items: [{ task: 'A' }, { task: 'B', status: 'Selesai' }] }];
      const { meetings: next, previousStatus } = applyActionStatus(meetings, 'm1', 0, 'Sedang Berjalan');
      expect(previousStatus).toBeUndefined();
      expect(next[0].action_items[0]).toEqual({ task: 'A', status: 'Sedang Berjalan' });
      expect(next[0].action_items[1]).toBe(meetings[0].action_items[1]);
      const reverted = applyActionStatus(next, 'm1', 0, previousStatus).meetings;
      expect(reverted).toStrictEqual(meetings);
      expect('status' in reverted[0].action_items[0]).toBe(false);
    });
  });

  // Example tests mirroring the pre-redesign TrackerView search + status filter.
  // _Requirements: 13.7_
  describe('filterActionRows', () => {
    const today = { year: 2026, month: 3, day: 5 };

    const row = (key, fields) => ({
      key,
      meetingId: `m-${key}`,
      meetingTitle: 'Mesyuarat Jawatankuasa',
      actionIndex: 0,
      sourceOrder: 0,
      task: '',
      assignee: '',
      deadline: '',
      storedStatus: 'Belum Mula',
      ...fields,
    });

    // Overdue = deadline strictly before 2026-03-05 and not Selesai.
    const rows = [
      row('a', { task: 'Sediakan Laporan Kewangan', assignee: 'Puan Aminah', meetingTitle: 'Mesyuarat Pengurusan Bil. 1', deadline: '2026-04-01', storedStatus: 'Belum Mula' }),
      row('b', { task: 'Kemas kini sistem', assignee: 'Encik Razak', meetingTitle: 'Mesyuarat Teknikal', deadline: '2026-03-01', storedStatus: 'Belum Mula' }),
      row('c', { task: 'Hantar memo', assignee: 'Cik Siti', meetingTitle: 'Mesyuarat Pengurusan Bil. 2', deadline: '2026-02-01', storedStatus: 'Sedang Berjalan' }),
      row('d', { task: 'Tutup akaun projek', assignee: 'Encik Razak', meetingTitle: 'Mesyuarat Kewangan', deadline: '2026-01-10', storedStatus: 'Selesai' }),
      row('e', { task: 'Semak dokumen tender', assignee: 'Puan Aminah', meetingTitle: 'Mesyuarat Teknikal', deadline: '2026-03-05', storedStatus: 'Sedang Berjalan' }),
      row('f', { task: 'Draf surat edaran', assignee: 'Cik Siti', meetingTitle: 'Mesyuarat Kewangan', deadline: '', storedStatus: 'Selesai' }),
    ];

    const keys = (result) => result.map((r) => r.key);

    it('matches the term case-insensitively on task, assignee and meeting title', () => {
      expect(keys(filterActionRows(rows, { term: 'LAPORAN' }, today))).toEqual(['a']);
      expect(keys(filterActionRows(rows, { term: 'encik razak' }, today))).toEqual(['b', 'd']);
      expect(keys(filterActionRows(rows, { term: 'TeKnIkAl' }, today))).toEqual(['b', 'e']);
      expect(keys(filterActionRows(rows, { term: 'kewangan' }, today))).toEqual(['a', 'd', 'f']);
    });

    it('returns nothing for a non-matching term and everything for an empty/missing term', () => {
      expect(filterActionRows(rows, { term: 'tiada padanan' }, today)).toEqual([]);
      expect(keys(filterActionRows(rows, { term: '' }, today))).toEqual(keys(rows));
      expect(keys(filterActionRows(rows, {}, today))).toEqual(keys(rows));
      expect(keys(filterActionRows(rows, undefined, today))).toEqual(keys(rows));
    });

    it('does not trim the search term', () => {
      // ' memo' matches "Hantar memo" (space before memo); 'memo ' does not.
      expect(keys(filterActionRows(rows, { term: ' memo' }, today))).toEqual(['c']);
      expect(filterActionRows(rows, { term: 'memo ' }, today)).toEqual([]);
      expect(filterActionRows(rows, { term: ' memo ' }, today)).toEqual([]);
    });

    it("treats 'all', 'Semua', empty and missing status as no status filter", () => {
      ['all', 'Semua', '', null, undefined].forEach((status) => {
        expect(keys(filterActionRows(rows, { status }, today))).toEqual(keys(rows));
      });
    });

    it("'Tertunggak' uses the display status: overdue non-Selesai rows only", () => {
      // b (Belum Mula, past) and c (Sedang Berjalan, past); d is Selesai; e is due today.
      expect(keys(filterActionRows(rows, { status: 'Tertunggak' }, today))).toEqual(['b', 'c']);
    });

    it("'Belum Mula' and 'Sedang Berjalan' exclude overdue rows", () => {
      expect(keys(filterActionRows(rows, { status: 'Belum Mula' }, today))).toEqual(['a']);
      expect(keys(filterActionRows(rows, { status: 'Sedang Berjalan' }, today))).toEqual(['e']);
    });

    it("'Selesai' includes Selesai rows even with a past deadline", () => {
      expect(keys(filterActionRows(rows, { status: 'Selesai' }, today))).toEqual(['d', 'f']);
    });

    it('combines term and status filters', () => {
      expect(keys(filterActionRows(rows, { term: 'razak', status: 'Tertunggak' }, today))).toEqual(['b']);
      expect(keys(filterActionRows(rows, { term: 'razak', status: 'Selesai' }, today))).toEqual(['d']);
      expect(filterActionRows(rows, { term: 'razak', status: 'Belum Mula' }, today)).toEqual([]);
      expect(keys(filterActionRows(rows, { term: 'AMINAH', status: 'Sedang Berjalan' }, today))).toEqual(['e']);
    });

    it('tolerates missing task, assignee and meeting title', () => {
      const sparse = [
        { key: 'x', storedStatus: 'Belum Mula', deadline: '' },
        { key: 'y', task: undefined, assignee: undefined, meetingTitle: undefined, storedStatus: '', deadline: undefined },
        row('z', { assignee: undefined, task: 'Laporan' }),
      ];
      expect(() => filterActionRows(sparse, { term: 'laporan', status: 'Tertunggak' }, today)).not.toThrow();
      expect(keys(filterActionRows(sparse, { term: 'laporan' }, today))).toEqual(['z']);
      expect(keys(filterActionRows(sparse, { status: 'Belum Mula' }, today))).toEqual(['x', 'z']);
      expect(filterActionRows(null, { term: 'a' }, today)).toEqual([]);
    });

    it('returns a new array without mutating the input', () => {
      const snapshot = structuredClone(rows);
      const result = filterActionRows(rows, { term: 'mesyuarat', status: 'all' }, today);
      expect(result).not.toBe(rows);
      expect(result).toHaveLength(rows.length);
      result.forEach((r, i) => expect(r).toBe(rows[i]));
      filterActionRows(rows, { term: 'razak', status: 'Tertunggak' }, today);
      expect(rows).toStrictEqual(snapshot);
    });
  });
});
