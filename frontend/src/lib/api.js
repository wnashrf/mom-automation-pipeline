/**
 * Thin fetch wrapper returning a uniform result shape (Req 7.2, 13.1, 13.2).
 * Request arguments are forwarded to `fetch` unchanged so method, headers and body
 * stay identical to the existing calls.
 */

/**
 * Normalise a FastAPI `detail` value into a display string.
 * Strings pass through; validation arrays are joined by '; ' from each entry's `msg`.
 * Anything else yields ''.
 * @param {unknown} detail
 * @returns {string}
 */
function normaliseDetail(detail) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((entry) => (entry && typeof entry.msg === 'string' ? entry.msg : ''))
      .filter((msg) => msg !== '')
      .join('; ');
  }
  return '';
}

/**
 * Perform a fetch and parse the JSON response.
 * @param {RequestInfo | URL} url
 * @param {RequestInit} [options]
 * @returns {Promise<{ ok: true, status: number, data: unknown } | { ok: false, status: number, detail: string }>}
 *   Network failure → `{ ok: false, status: 0, detail: '' }`.
 *   2xx with an empty or non-JSON body → `data: null`.
 */
export async function requestJson(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    return { ok: false, status: 0, detail: '' };
  }

  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (res.ok) {
    return { ok: true, status: res.status, data: body };
  }

  const detail = body && typeof body === 'object' ? normaliseDetail(body.detail) : '';
  return { ok: false, status: res.status, detail };
}
