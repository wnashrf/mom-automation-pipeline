import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestJson } from './api.js';

/** Build a JSON Response with the given status. */
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(impl) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestJson', () => {
  it('forwards url and options to fetch unchanged', async () => {
    const fetchMock = stubFetch(async () => jsonResponse({}));
    const body = new FormData();
    body.append('file', 'x');
    const options = { method: 'POST', headers: { 'X-Test': '1' }, body };

    await requestJson('/api/transcribe', options);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/transcribe');
    expect(fetchMock.mock.calls[0][1]).toBe(options);
  });

  it('forwards an undefined options argument as-is', async () => {
    const fetchMock = stubFetch(async () => jsonResponse([]));
    await requestJson('/api/meetings');
    expect(fetchMock).toHaveBeenCalledWith('/api/meetings', undefined);
  });

  it('returns parsed data for a 2xx JSON response', async () => {
    stubFetch(async () => jsonResponse({ id: 'meet_1234abcd', title: 'Mesyuarat' }, 200));
    const result = await requestJson('/api/meetings/meet_1234abcd');
    expect(result).toEqual({
      ok: true,
      status: 200,
      data: { id: 'meet_1234abcd', title: 'Mesyuarat' },
    });
  });

  it('returns data null for a 2xx response with an empty body', async () => {
    stubFetch(async () => new Response(null, { status: 204 }));
    const result = await requestJson('/api/meetings/x', { method: 'DELETE' });
    expect(result).toEqual({ ok: true, status: 204, data: null });
  });

  it('passes through a string detail for a non-2xx response', async () => {
    stubFetch(async () => jsonResponse({ detail: 'Mesyuarat tidak dijumpai' }, 404));
    const result = await requestJson('/api/meetings/missing');
    expect(result).toEqual({ ok: false, status: 404, detail: 'Mesyuarat tidak dijumpai' });
  });

  it('joins FastAPI validation-array messages with "; "', async () => {
    stubFetch(async () =>
      jsonResponse(
        {
          detail: [
            { loc: ['body', 'title'], msg: 'Field required', type: 'missing' },
            { loc: ['body', 'date'], msg: 'Invalid date', type: 'value_error' },
          ],
        },
        422,
      ),
    );
    const result = await requestJson('/api/meetings/save', { method: 'POST' });
    expect(result).toEqual({ ok: false, status: 422, detail: 'Field required; Invalid date' });
  });

  it('returns empty detail for a non-JSON error body', async () => {
    stubFetch(
      async () =>
        new Response('<html>Internal Server Error</html>', {
          status: 500,
          headers: { 'Content-Type': 'text/html' },
        }),
    );
    const result = await requestJson('/api/extract');
    expect(result).toEqual({ ok: false, status: 500, detail: '' });
  });

  it('returns empty detail when the error body has a non-string, non-array detail', async () => {
    stubFetch(async () => jsonResponse({ detail: { reason: 'x' } }, 400));
    const result = await requestJson('/api/extract');
    expect(result).toEqual({ ok: false, status: 400, detail: '' });
  });

  it('returns status 0 and empty detail when fetch rejects', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    const result = await requestJson('/api/meetings');
    expect(result).toEqual({ ok: false, status: 0, detail: '' });
  });
});
