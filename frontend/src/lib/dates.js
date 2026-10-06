/**
 * Deterministic, timezone-independent calendar-date helpers (Req 5.4, 5.5, 6.5, 6.6, 12.3, 12.6).
 * No Intl and no `new Date(string)` parsing, so output is identical across browsers and Node.
 */
import { T } from './terminology.js';

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/;
const DMY_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year, month) {
  return month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function validated(year, month, day) {
  if (year < 1000 || year > 9999) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/**
 * Parses `YYYY-MM-DD` (optional time part ignored) or legacy `D/M/YYYY`.
 * @returns {{year:number, month:number, day:number} | null}
 */
export function parseCalendarDate(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (s === '') return null;

  const iso = ISO_RE.exec(s);
  if (iso) return validated(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dmy = DMY_RE.exec(s);
  if (dmy) return validated(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));

  return null;
}

/** "05 Mac 2026", or T.messages.noDate when unparseable. Never modifies `value`. */
export function formatDisplayDate(value) {
  const d = parseCalendarDate(value);
  if (!d) return T.messages.noDate;
  return `${pad2(d.day)} ${T.months[d.month - 1]} ${d.year}`;
}

function toDate(v) {
  if (v && typeof v === 'object' && Number.isInteger(v.year) && Number.isInteger(v.month) && Number.isInteger(v.day)) {
    return validated(v.year, v.month, v.day);
  }
  return parseCalendarDate(v);
}

/**
 * Compares two dates (raw strings or `{year, month, day}` objects).
 * Returns -1 | 0 | 1. Unparseable values sort after parseable ones; two unparseable values are equal.
 */
export function compareCalendarDates(a, b) {
  const da = toDate(a);
  const db = toDate(b);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  const ka = da.year * 10000 + da.month * 100 + da.day;
  const kb = db.year * 10000 + db.month * 100 + db.day;
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/** Current calendar date from the local clock. */
export function todayLocal(now = new Date()) {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}
