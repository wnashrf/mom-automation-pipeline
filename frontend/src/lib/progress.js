/**
 * Transcription progress helpers (Req 8.2, 8.3). Pure and total: every input,
 * including NaN, infinities, negatives and non-numbers, yields a valid result.
 */

/**
 * Clamps a percentage to an integer in [0, 100].
 * NaN (and anything non-numeric) → 0; +Infinity → 100; -Infinity → 0;
 * values within [0, 100] → Math.round(x).
 */
export function clampPercent(x) {
  const n = typeof x === 'number' ? x : Number(x);
  if (Number.isNaN(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 100) return 100;
  return Math.round(n);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Formats seconds as `M:SS` (under one hour) or `H:MM:SS`.
 * Fractional seconds are floored; negative or non-finite input is treated as 0.
 */
export function formatAudioTime(sec) {
  const n = typeof sec === 'number' ? sec : Number(sec);
  const total = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

/**
 * "elapsed / total" when `total` is a finite number > 0, otherwise just "elapsed"
 * (total duration unknown).
 */
export function formatAudioProgress(elapsed, total) {
  const head = formatAudioTime(elapsed);
  if (typeof total === 'number' && Number.isFinite(total) && total > 0) {
    return `${head} / ${formatAudioTime(total)}`;
  }
  return head;
}
