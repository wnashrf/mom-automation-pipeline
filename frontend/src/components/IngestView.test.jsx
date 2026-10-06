import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IngestView from './IngestView';
import ToastProvider from './ui/ToastProvider';
import { T } from '../lib/terminology';

const S = T.ingest;
const encoder = new TextEncoder();

// Controllable SSE body: tests push `data: {json}\n\n` events and close when done.
function createSseStream() {
  let controller;
  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
  });
  return {
    body: stream,
    send(event) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    },
    close() {
      controller.close();
    },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const jsonResponse = (data, ok = true) => ({ ok, json: async () => data });

// fetch stub that dispatches by URL; each test fills in the routes it needs.
function stubFetch(routes) {
  const fetchMock = vi.fn((url, init) => {
    const handler = routes[url];
    if (!handler) return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    return Promise.resolve(handler(init));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderIngest(props = {}) {
  const onExtracted = props.onExtracted ?? vi.fn();
  const utils = render(
    <ToastProvider>
      <IngestView onExtracted={onExtracted} onBack={vi.fn()} />
    </ToastProvider>,
  );
  // The view's own polite region (not the ToastProvider's role=status region).
  const liveRegion = utils.container.querySelector('div.sr-only[aria-live="polite"]');
  return { ...utils, onExtracted, liveRegion };
}

const audioInput = (container) => container.querySelector('input[type="file"][accept*=".mp3"]');
const transcriptBox = () => screen.getByLabelText(S.transcriptLabel);

beforeEach(() => {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    vi.stubGlobal('crypto', { randomUUID: () => '1234abcd-0000-4000-8000-000000000000' });
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('IngestView transcription (SSE)', () => {
  it('shows the download notice, then progress, then the transcript; live region only follows stages', async () => {
    const user = userEvent.setup();
    const sse = createSseStream();
    const fetchMock = stubFetch({ '/api/transcribe': () => ({ ok: true, body: sse.body }) });
    const { container, liveRegion } = renderIngest();

    // Record every text the live region takes on.
    const announcements = [];
    const observer = new MutationObserver(() => announcements.push(liveRegion.textContent));
    observer.observe(liveRegion, { childList: true, characterData: true, subtree: true });

    await user.upload(audioInput(container), new File(['x'], 'a.mp3', { type: 'audio/mpeg' }));

    // Req 13.1: request URL, method and FormData fields unchanged.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/transcribe');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.get('file').name).toBe('a.mp3');
    expect(init.body.get('model_size')).toBe('base');

    // Req 8.4: download notice appears on the downloading status event...
    act(() => sse.send({ type: 'status', stage: 'downloading', message: 'Memuat turun...' }));
    expect(await screen.findByText(T.messages.modelDownloading)).toBeInTheDocument();
    await waitFor(() => expect(liveRegion).toHaveTextContent(S.stages.downloading));

    // ...and clears on the first progress event. Req 8.2, 8.3: elapsed / total.
    act(() => sse.send({ type: 'progress', progress: 42.4, currentTime: 65, totalTime: 300, text: 'Segmen satu' }));
    expect(await screen.findByText('42% · 1:05 / 5:00')).toBeInTheDocument();
    expect(screen.queryByText(T.messages.modelDownloading)).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
    expect(liveRegion).toHaveTextContent(S.stages.transcribing);

    // More progress events within the same stage; total unknown → elapsed only.
    act(() => sse.send({ type: 'progress', progress: 60, currentTime: 125, totalTime: 0, text: 'Segmen dua' }));
    expect(await screen.findByText('60% · 2:05')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60');

    act(() => sse.send({ type: 'progress', progress: 75.6, currentTime: 3725 }));
    expect(await screen.findByText('76% · 1:02:05')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '76');
    expect(transcriptBox()).toHaveValue('Segmen satu\nSegmen dua');

    act(() => {
      sse.send({ type: 'complete', transcript: 'Transkrip penuh.', transcript_id: 'abc123' });
      sse.close();
    });
    await waitFor(() => expect(transcriptBox()).toHaveValue('Transkrip penuh.'));
    await waitFor(() => expect(liveRegion).toHaveTextContent(S.stages.transcribed));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(sessionStorage.getItem('mom_transcript_id')).toBe('abc123');

    // Req 8.9: the live region changed only at stage transitions, never per percent.
    observer.disconnect();
    const distinct = announcements.filter((text, i) => text !== announcements[i - 1]);
    expect(distinct).toEqual([
      S.stages.transcribing,
      S.stages.downloading,
      S.stages.transcribing,
      S.stages.transcribed,
    ]);
    expect(announcements.every((text) => !/%/.test(text))).toBe(true);
  });
});

describe('IngestView extraction', () => {
  it('marks the extract button busy while pending and keeps request shapes unchanged', async () => {
    const user = userEvent.setup();
    const extract = deferred();
    const fetchMock = stubFetch({
      '/api/extract': () => extract.promise,
      '/api/meetings/save': () => jsonResponse({ status: 'ok' }),
    });
    const { onExtracted, liveRegion } = renderIngest();

    await user.type(transcriptBox(), 'Mesyuarat bermula.');
    const idle = screen.getByRole('button', { name: T.actions.extract });
    expect(idle).toHaveAttribute('aria-busy', 'false');
    await user.click(idle);

    // Req 8.5, 8.6: busy state and label while the request is pending.
    const busy = await screen.findByRole('button', { name: T.messages.extracting });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(busy).toBeDisabled();
    expect(liveRegion).toHaveTextContent(S.stages.extracting);

    // Req 13.1: extract request unchanged.
    const [extractUrl, extractInit] = fetchMock.mock.calls[0];
    expect(extractUrl).toBe('/api/extract');
    expect(extractInit.method).toBe('POST');
    expect(extractInit.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(extractInit.body)).toEqual({
      transcript: 'Mesyuarat bermula.',
      template_type: 'standard',
    });

    await act(async () => {
      extract.resolve(jsonResponse({
        data: {
          title: 'Mesyuarat Jawatankuasa',
          participants: [{ name: 'Ali', jawatan: 'Pengarah', organisation: 'JPA' }],
          agenda_items: [],
          action_items: [],
        },
      }));
    });

    await waitFor(() => expect(onExtracted).toHaveBeenCalledTimes(1));
    const meeting = onExtracted.mock.calls[0][0];
    expect(meeting.id).toMatch(/^meet_[0-9a-f]{8}$/);
    expect(meeting.meeting_title).toBe('Mesyuarat Jawatankuasa');

    // Draf pre-save goes to /api/meetings/save with the same record id.
    const [saveUrl, saveInit] = fetchMock.mock.calls[1];
    expect(saveUrl).toBe('/api/meetings/save');
    expect(saveInit.method).toBe('POST');
    expect(saveInit.headers).toEqual({ 'Content-Type': 'application/json' });
    const saved = JSON.parse(saveInit.body);
    expect(saved).toMatchObject({ id: meeting.id, status: 'Draf', meeting_title: 'Mesyuarat Jawatankuasa' });
    expect(saved.participants[0]).toEqual({
      name: 'Ali', jawatan: 'Pengarah', organisation: 'JPA', status: 'Hadir', label: 'Ali', department: 'JPA',
    });

    const done = await screen.findByRole('button', { name: T.actions.extract });
    expect(done).toHaveAttribute('aria-busy', 'false');
    expect(liveRegion).toHaveTextContent(S.stages.extracted);
  });

  it('sends template_text when a custom template is loaded', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch({
      '/api/extract': () => jsonResponse({ data: { title: 'X' } }),
      '/api/meetings/save': () => jsonResponse({ status: 'ok' }),
    });
    const { container, onExtracted } = renderIngest();

    await user.selectOptions(screen.getByLabelText(S.templateLabel), 'custom');
    const templateInput = container.querySelector('input[type="file"][accept=".txt,.md,.docx"]');
    await user.upload(templateInput, new File(['TEMPLAT KHAS'], 'templat.txt', { type: 'text/plain' }));
    await screen.findByText(S.templateLoadedSuffix);

    await user.type(transcriptBox(), 'Teks.');
    await user.click(screen.getByRole('button', { name: T.actions.extract }));
    await waitFor(() => expect(onExtracted).toHaveBeenCalled());

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/extract');
    expect(JSON.parse(init.body)).toEqual({
      transcript: 'Teks.',
      template_type: 'custom',
      template_text: 'TEMPLAT KHAS',
    });
  });

  // Req 10.14: inline error, value retained, no request sent.
  it('shows an inline error for an empty transcript and keeps the typed value', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch({});
    renderIngest();

    await user.click(screen.getByRole('button', { name: T.actions.extract }));
    expect(screen.getByText(S.transcriptRequired)).toBeInTheDocument();
    expect(transcriptBox()).toHaveAttribute('aria-invalid', 'true');

    await user.type(transcriptBox(), '   ');
    expect(transcriptBox()).not.toHaveAttribute('aria-invalid');
    await user.click(screen.getByRole('button', { name: T.actions.extract }));
    expect(screen.getByText(S.transcriptRequired)).toBeInTheDocument();
    expect(transcriptBox()).toHaveAttribute('aria-invalid', 'true');
    expect(transcriptBox()).toHaveValue('   ');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('IngestView session restore', () => {
  it('restores the transcript from sessionStorage via GET /api/transcript/{id}', async () => {
    sessionStorage.setItem('mom_transcript_id', 'abc123');
    const fetchMock = stubFetch({
      '/api/transcript/abc123': () => jsonResponse({ transcript: 'Transkrip lama.' }),
    });
    renderIngest();

    await waitFor(() => expect(transcriptBox()).toHaveValue('Transkrip lama.'));
    expect(screen.getByText(S.restored)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/transcript/abc123');
  });
});
