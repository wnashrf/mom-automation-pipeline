import { AlertCircle, Cloud, CloudCheck, Loader2 } from 'lucide-react';
import { saveLabel, saveTone } from '../../lib/saveState.js';
import { cx } from '../../lib/cx.js';

/** Complete static class strings per tone (Tailwind must see them literally). */
const TONE_CLASSES = {
  neutral: 'text-neutral-600',
  success: 'text-success-fg',
  danger: 'text-danger-fg',
};

/** Icon per save phase (design table). */
const PHASE_ICONS = {
  idle: { Icon: Cloud, spin: false },
  saving: { Icon: Loader2, spin: true },
  saved: { Icon: CloudCheck, spin: false },
  failed: { Icon: AlertCircle, spin: false },
  retrying: { Icon: Loader2, spin: true },
};

/**
 * Save_Indicator: polite live region announcing the auto-save state
 * (Req 9.1–9.3, 9.5). The assertive failure announcement comes from the error
 * toast, not from this region.
 */
export default function SaveIndicator({ state, className }) {
  const { Icon, spin } = PHASE_ICONS[state?.phase] ?? PHASE_ICONS.idle;
  const tone = TONE_CLASSES[saveTone(state)] ?? TONE_CLASSES.neutral;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cx('inline-flex items-center gap-2 text-sm font-medium', tone, className)}
    >
      <Icon aria-hidden="true" className={cx('h-4 w-4 shrink-0', spin && 'animate-spin')} />
      <span>{saveLabel(state)}</span>
    </div>
  );
}
