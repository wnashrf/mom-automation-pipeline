import { T } from './terminology.js';

/**
 * Save_Indicator state machine (Req 9.1–9.3).
 *
 *   idle/saved --SAVE_START--> saving
 *   failed     --SAVE_START--> retrying
 *   saving/retrying --SAVE_SUCCESS(at)--> saved
 *   saving/retrying --SAVE_FAILURE--> failed
 *
 * Transitions not drawn in the design diagram are resolved so the indicator
 * always reflects the latest outcome: any SAVE_SUCCESS lands in `saved`, any
 * SAVE_FAILURE lands in `failed`, and a SAVE_START while already in flight keeps
 * the current in-flight phase (so a pending failure stays visible).
 */

/** @typedef {'idle' | 'saving' | 'saved' | 'failed' | 'retrying'} SavePhase */
/** @typedef {{ phase: SavePhase, savedAt: Date | null }} SaveState */

/** @type {SaveState} */
export const initialSaveState = Object.freeze({ phase: 'idle', savedAt: null });

/**
 * Pure reducer for the save indicator.
 * @param {SaveState} state
 * @param {{ type: 'SAVE_START' } | { type: 'SAVE_SUCCESS', at: Date } | { type: 'SAVE_FAILURE' }} event
 * @returns {SaveState}
 */
export function saveReducer(state, event) {
  const current = state ?? initialSaveState;
  switch (event?.type) {
    case 'SAVE_START': {
      if (current.phase === 'failed' || current.phase === 'retrying') {
        return { ...current, phase: 'retrying' };
      }
      return { ...current, phase: 'saving' };
    }
    case 'SAVE_SUCCESS':
      return { phase: 'saved', savedAt: event.at instanceof Date ? event.at : new Date(event.at) };
    case 'SAVE_FAILURE':
      return { ...current, phase: 'failed' };
    default:
      return current;
  }
}

/**
 * Format a Date as local 24-hour, zero-padded "HH:MM".
 * Returns an empty string for missing or invalid dates.
 * @param {Date} date
 * @returns {string}
 */
export function formatSavedTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Human-readable label for the current save state.
 * @param {SaveState} state
 * @returns {string}
 */
export function saveLabel(state) {
  switch (state?.phase) {
    case 'saving':
      return T.messages.saving;
    case 'saved':
      return T.messages.savedAt(formatSavedTime(state.savedAt));
    case 'failed':
      return T.messages.saveFailed;
    case 'retrying':
      return `${T.messages.saveFailed} · ${T.messages.saving}`;
    case 'idle':
    default:
      return T.messages.autosaveIdle;
  }
}

/**
 * Visual tone for the current save state.
 * @param {SaveState} state
 * @returns {'neutral' | 'success' | 'danger'}
 */
export function saveTone(state) {
  switch (state?.phase) {
    case 'saved':
      return 'success';
    case 'failed':
    case 'retrying':
      return 'danger';
    default:
      return 'neutral';
  }
}
