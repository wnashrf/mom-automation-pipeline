/**
 * Status configuration shared by meeting and action-item badges (Req 1.10, 6.1, 6.2, 6.7, 2.8).
 * Every status is conveyed by label + icon + tone, never colour alone.
 */
import { PencilLine, CircleCheck, Circle, Clock, TriangleAlert, CircleHelp } from 'lucide-react';
import { T } from './terminology.js';

export const STATUS_KEYS = Object.freeze([
  T.status.draft, T.status.done, T.status.notStarted, T.status.inProgress, T.status.overdue,
]);

export const STATUS_CONFIG = Object.freeze({
  [T.status.draft]:      Object.freeze({ label: T.status.draft,      tone: 'warning', Icon: PencilLine }),
  [T.status.done]:       Object.freeze({ label: T.status.done,       tone: 'success', Icon: CircleCheck }),
  [T.status.notStarted]: Object.freeze({ label: T.status.notStarted, tone: 'neutral', Icon: Circle }),
  [T.status.inProgress]: Object.freeze({ label: T.status.inProgress, tone: 'info',    Icon: Clock }),
  [T.status.overdue]:    Object.freeze({ label: T.status.overdue,    tone: 'danger',  Icon: TriangleAlert }),
});

export const UNKNOWN_STATUS = Object.freeze({ label: T.status.unknown, tone: 'neutral', Icon: CircleHelp });

/**
 * Exact (case-sensitive, untrimmed) match on the raw stored value.
 * Non-strings and inherited keys such as "toString" or "__proto__" map to UNKNOWN_STATUS.
 */
export function getStatusConfig(raw) {
  if (typeof raw === 'string' && Object.hasOwn(STATUS_CONFIG, raw)) return STATUS_CONFIG[raw];
  return UNKNOWN_STATUS;
}

/** Complete static class strings so Tailwind can detect them at build time. */
export const TONE_CLASSES = Object.freeze({
  success: 'bg-success-bg text-success-fg border border-success-border',
  warning: 'bg-warning-bg text-warning-fg border border-warning-border',
  danger: 'bg-danger-bg text-danger-fg border border-danger-border',
  info: 'bg-info-bg text-info-fg border border-info-border',
  neutral: 'bg-neutral-bg text-neutral-fg border border-neutral-border',
});
