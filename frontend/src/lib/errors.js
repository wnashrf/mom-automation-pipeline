/**
 * Error message composition for toasts and inline errors (Req 5.6, 7.2).
 */
import { T } from './terminology.js';

/**
 * Build a Bahasa Melayu error message that names the failed operation.
 * A backend `detail` containing any non-whitespace character is inserted verbatim;
 * otherwise (undefined, null, non-string, empty, whitespace-only) the generic message is used.
 * @param {string} operation - Operation name, e.g. T.ops.loadMeetings
 * @param {unknown} detail - Backend error detail
 * @returns {string}
 */
export function buildErrorMessage(operation, detail) {
  if (typeof detail === 'string' && detail.trim() !== '') {
    return `${operation} gagal: ${detail}`;
  }
  return `${operation} gagal. ${T.messages.genericError}`;
}
