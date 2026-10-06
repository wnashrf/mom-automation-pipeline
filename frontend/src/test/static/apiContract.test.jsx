// API contract tests: every user action sends the same request as the pre-redesign code.
// Fixtures are derived from `git show HEAD:frontend/src/...` (commit 2a1f9ce, the last
// pre-redesign commit); each fixture names its source location in the old code.
// Validates: Requirements 13.1, 13.2, 13.7
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import EditorView from '../../components/EditorView';
import TrackerView from '../../components/TrackerView';
import IngestView from '../../components/IngestView';
import ToastProvider from '../../components/ui/ToastProvider';
import { T } from '../../lib/terminology';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// ── Recording fetch ──────────────────────────────────────────────────────────

/** Parsed body: JSON strings are parsed, FormData becomes an entries list (files → name/type). */
function normaliseBody(body) {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return JSON.parse(body);
  if (body instanceof FormData) {
    return [...body.entries()].map(([key, value]) =>
      [key, typeof value === 'string' ? value : { name: value.name, type: value.type }]);
  }
  return body;
}

/** `fetch(url, init)` → { url, method, headers, body }; an absent method means GET. */
function normalise(url, init) {
  return {
    url: String(url),
    method: (init?.method ?? 'GET').toUpperCase(),
    headers: init?.headers ? { ...init.headers } : {},
    body: normaliseBody(init?.body),
  };
}

const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

/**
 * Stubs `fetch` with a router keyed by "METHOD url". Unrouted requests get a 404.
 * Returns the list of normalised calls (in order).
 */
function installFetch(routes = {}) {
  const calls = [];
  const fetchMock = vi.fn(async (url, init) => {
    const call = normalise(url, init);
    calls.push(call);
    const handler = routes[`${call.method} ${call.url}`];
    return handler ? handler(init) : jsonResponse({ detail: 'Tidak dijumpai' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const callsTo = (calls, method, url) => calls.filter((c) => c.method === method && c.url === url);

// ── Shared data ──────────────────────────────────────────────────────────────

const LIST_MEETING = {
  id: 'meet_abcd1234',
  meeting_title: 'Mesyuarat Jawatankuasa Ujian',
  status: 'Selesai',
  date: '2026-01-10',
  location: 'Bilik A',
  action_items: [],
};

// Legacy record shape: nested chairperson, label/jawatan/department participant,
// tajuk/ringkasan/keputusan agenda, description action item, no title and no status.
const LEGACY_MEETING = {
  id: 'meet_11112222',
  venue: 'Bilik 1',
  chairperson: { name: 'Dato Ali', role: 'Ketua Setiausaha' },
  participants: [{ label: 'Encik Abu', jawatan: 'Pegawai Tadbir', department: 'Bahagian IT' }],
  agenda_items: [{ tajuk: 'Agenda 1', ringkasan: 'Ringkasan 1', keputusan: 'Keputusan 1' }],
  action_items: [{ description: 'Sediakan laporan', assignee: 'En. Ali', deadline: '2026-04-01' }],
  raw_transcript: 'Pengerusi: Selamat pagi.',
};

// Old initForm(LEGACY_MEETING) with location edited to 'Bilik 2', run through the old
// serializeParticipants (HEAD:frontend/src/components/EditorView.jsx, initForm and
// serializeParticipants). initForm drops `status`, so it is never in the form payload.
const LEGACY_FORM_PAYLOAD = {
  id: 'meet_11112222',
  meeting_number: '',
  location: 'Bilik 2',
  date: '',
  start_time: '',
  end_time: '',
  chairperson_name: 'Dato Ali',
  chairperson_role: 'Ketua Setiausaha',
  secretary_name: '',
  secretary_role: '',
  participants: [{
    name: 'Encik Abu',
    jawatan: 'Pegawai Tadbir',
    organisation: 'Bahagian IT',
    status: 'Hadir',
    label: 'Encik Abu',
    department: 'Bahagian IT',
  }],
  matters_arising: '',
  agenda_items: [{ title: 'Agenda 1', summary: 'Ringkasan 1', decision: 'Keputusan 1' }],
  action_items: [{ task: 'Sediakan laporan', assignee: 'En. Ali', deadline: '2026-04-01', status: 'Belum Mula' }],
  raw_transcript: 'Pengerusi: Selamat pagi.',
};

const TRACKER_MEETING = {
  id: 'meet_aaaa1111',
  meeting_title: 'Mesyuarat Pengurusan',
  status: 'Selesai',
  date: '2026-02-15',
  legacy_field: { keep: true },
  action_items: [
    { task: 'Sediakan laporan', assignee: 'En. Ali', deadline: '2026-03-10', status: 'Belum Mula' },
    { task: 'Kemas kini portal', assignee: 'Pn. Siti', deadline: '2026-03-20', status: 'Sedang Berjalan' },
  ],
};

// /api/extract response used for the Draf pre-save fixture.
const EXTRACT_DATA = {
  meeting_number: 'Bil. 1/2026',
  venue: 'Bilik Gerakan',
  date: '2026-03-01',
  start_time: '09:00',
  chairperson: { name: 'Dato Ali', role: 'Pengarah' },
  secretary_name: 'Cik Mei',
  participants: [{ label: 'Encik Abu', jawatan: 'Pegawai Tadbir', department: 'JPA' }],
  agenda_items: [{ id: 'ag1', title: 'Bajet', summary: 'Ringkasan bajet' }],
  decisions: [
    { agenda_item_id: 'ag1', statement: 'Lulus' },
    { agenda_item_id: 'ag1', statement: 'Semak semula' },
  ],
  action_items: [{ description: 'Sediakan kertas', assignee: 'null', deadline: '2026-04-01' }],
};

// ── Fixtures (pre-redesign requests) ─────────────────────────────────────────

const FIXTURES = {
  // HEAD:frontend/src/App.jsx fetchMeetings → fetch('/api/meetings') (no init)
  loadList: { url: '/api/meetings', method: 'GET', headers: {}, body: undefined },

  // HEAD:frontend/src/App.jsx handleSelectMeeting / handleEditMeeting → fetch(`/api/meetings/${id}`)
  openMeeting: { url: `/api/meetings/${LIST_MEETING.id}`, method: 'GET', headers: {}, body: undefined },

  // HEAD:frontend/src/App.jsx handleDeleteMeeting → fetch(`/api/meetings/${id}`, { method: 'DELETE' })
  deleteMeeting: { url: `/api/meetings/${LIST_MEETING.id}`, method: 'DELETE', headers: {}, body: undefined },

  // HEAD:frontend/src/components/EditorView.jsx useAutoSave save() → POST /api/meetings/save,
  // meeting_title default 'Draf Tanpa Tajuk', status 'Draf' unless the form says 'Selesai'
  autoSave: {
    url: '/api/meetings/save',
    method: 'POST',
    headers: JSON_HEADERS,
    body: { ...LEGACY_FORM_PAYLOAD, meeting_title: 'Draf Tanpa Tajuk', status: 'Draf' },
  },

  // HEAD:frontend/src/components/EditorView.jsx handleSave → POST /api/meetings/save,
  // meeting_title default 'Mesyuarat Tanpa Tajuk', status 'Selesai'
  generate: {
    url: '/api/meetings/save',
    method: 'POST',
    headers: JSON_HEADERS,
    body: { ...LEGACY_FORM_PAYLOAD, meeting_title: 'Mesyuarat Tanpa Tajuk', status: 'Selesai' },
  },

  // HEAD:frontend/src/components/TrackerView.jsx status change → POST /api/meetings/save
  // with the full meeting object and only the changed item's status replaced
  trackerStatus: {
    url: '/api/meetings/save',
    method: 'POST',
    headers: JSON_HEADERS,
    body: {
      ...TRACKER_MEETING,
      action_items: [{ ...TRACKER_MEETING.action_items[0], status: 'Selesai' }, TRACKER_MEETING.action_items[1]],
    },
  },

  // HEAD:frontend/src/components/IngestView.jsx handleTriggerExtract → POST /api/extract
  extract: {
    url: '/api/extract',
    method: 'POST',
    headers: JSON_HEADERS,
    body: { transcript: 'Mesyuarat bermula.', template_type: 'standard' },
  },
  extractCustom: {
    url: '/api/extract',
    method: 'POST',
    headers: JSON_HEADERS,
    body: { transcript: 'Teks.', template_type: 'custom', template_text: 'TEMPLAT KHAS' },
  },

  // HEAD:frontend/src/components/IngestView.jsx handleTriggerExtract → formattedMeeting, then
  // POST /api/meetings/save { ...formattedMeeting, status: 'Draf', participants: serialized }.
  // Title falls back to `Perbincangan: ${agenda[0].title}`; decisions joined by '\n• '.
  drafPreSave: {
    url: '/api/meetings/save',
    method: 'POST',
    headers: JSON_HEADERS,
    body: {
      id: 'meet_abcdef12',
      meeting_title: 'Perbincangan: Bajet',
      meeting_number: 'Bil. 1/2026',
      location: 'Bilik Gerakan',
      date: '2026-03-01',
      start_time: '09:00',
      end_time: '',
      chairperson_name: 'Dato Ali',
      chairperson_role: 'Pengarah',
      secretary_name: 'Cik Mei',
      secretary_role: '',
      participants: [{
        name: 'Encik Abu',
        jawatan: 'Pegawai Tadbir',
        organisation: 'JPA',
        status: 'Hadir',
        label: 'Encik Abu',
        department: 'JPA',
      }],
      agenda_items: [{ title: 'Bajet', summary: 'Ringkasan bajet', decision: 'Lulus\n• Semak semula' }],
      action_items: [{ task: 'Sediakan kertas', assignee: '', deadline: '2026-04-01', status: 'Belum Mula' }],
      raw_transcript: 'Mesyuarat bermula.',
      status: 'Draf',
    },
  },

  // HEAD:frontend/src/components/IngestView.jsx handleFileUpload → fetch('/api/transcribe',
  // { method: 'POST', body: FormData(file, model_size) }) — no explicit headers
  transcribe: {
    url: '/api/transcribe',
    method: 'POST',
    headers: {},
    body: [['file', { name: 'rakaman.mp3', type: 'audio/mpeg' }], ['model_size', 'base']],
  },

  // HEAD:frontend/src/components/IngestView.jsx mount effect →
  // fetch(`/api/transcript/${sessionStorage.getItem('mom_transcript_id')}`) (no init)
  transcriptRestore: { url: '/api/transcript/abc123', method: 'GET', headers: {}, body: undefined },

  // HEAD:frontend/src/components/HistoryView.jsx and EditorView.jsx
  // <a href={`/api/meetings/${id}/export`} download>
  docxHref: (id) => `/api/meetings/${id}/export`,
};

// ── Render helpers ───────────────────────────────────────────────────────────

function renderApp() {
  const container = document.createElement('div');
  container.id = 'root';
  document.body.appendChild(container);
  return render(<App />, { container });
}

const withToasts = (ui) => render(<ToastProvider>{ui}</ToastProvider>);

/** One SSE `complete` event, then end of stream. */
function completedSseBody() {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      const event = { type: 'complete', transcript: 'Transkrip penuh.', transcript_id: 'abc123' };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      controller.close();
    },
  });
}

const firstCard = async () => (await screen.findByText(LIST_MEETING.meeting_title)).closest('article');

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  // Unmount first: the editor flushes a save on unmount while fetch is still stubbed.
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  document.body.innerHTML = '';
});

// ── App actions ──────────────────────────────────────────────────────────────

describe('API contract: App', () => {
  const appRoutes = () => ({
    'GET /api/meetings': () => jsonResponse([LIST_MEETING]),
    [`GET /api/meetings/${LIST_MEETING.id}`]: () => jsonResponse(LIST_MEETING),
    [`DELETE /api/meetings/${LIST_MEETING.id}`]: () => jsonResponse({ status: 'success' }),
  });

  it('load list sends the pre-redesign GET /api/meetings', async () => {
    const calls = installFetch(appRoutes());
    renderApp();
    await firstCard();
    expect(calls[0]).toEqual(FIXTURES.loadList);
  });

  it.each([
    ['Lihat', T.actions.view],
    ['Sunting', T.actions.edit],
  ])('%s sends the pre-redesign GET /api/meetings/{id}', async (_name, label) => {
    const user = userEvent.setup();
    const calls = installFetch(appRoutes());
    renderApp();
    const card = await firstCard();
    const before = calls.length;

    await user.click(within(card).getAllByRole('button', { name: label })[0]);
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(T.views.editor.title));

    expect(calls.slice(before)[0]).toEqual(FIXTURES.openMeeting);
  });

  it('delete sends the pre-redesign DELETE /api/meetings/{id}', async () => {
    const user = userEvent.setup();
    const calls = installFetch(appRoutes());
    renderApp();
    const card = await firstCard();

    await user.click(within(card).getAllByRole('button', { name: T.actions.delete })[0]);
    const dialog = screen.getByRole('dialog');
    const before = calls.length;
    await user.click(within(dialog).getByRole('button', { name: T.actions.delete }));

    await waitFor(() => expect(calls.length).toBe(before + 1));
    expect(calls[before]).toEqual(FIXTURES.deleteMeeting);
  });

  it('History .docx link keeps the pre-redesign href and download attribute', async () => {
    installFetch(appRoutes());
    renderApp();
    const card = await firstCard();
    const link = within(card).getAllByRole('link', { name: T.history.downloadDocx })[0];
    expect(link).toHaveAttribute('href', FIXTURES.docxHref(LIST_MEETING.id));
    expect(link).toHaveAttribute('download');
  });
});

// ── Editor actions ───────────────────────────────────────────────────────────

describe('API contract: EditorView', () => {
  const routes = {
    'POST /api/meetings/save': (init) => jsonResponse({ status: 'success', id: JSON.parse(init.body).id }),
  };

  const renderEditor = () =>
    withToasts(
      <EditorView meeting={LEGACY_MEETING} previewMode={false} setPreviewMode={vi.fn()} onBack={vi.fn()} />,
    );

  const editLocation = () =>
    fireEvent.change(screen.getByLabelText(T.editor.fields.location), { target: { value: 'Bilik 2' } });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('auto-save sends the pre-redesign POST /api/meetings/save payload', async () => {
    const calls = installFetch(routes);
    renderEditor();
    editLocation();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    const saves = callsTo(calls, 'POST', '/api/meetings/save');
    expect(saves).toHaveLength(1);
    expect(saves[0]).toEqual(FIXTURES.autoSave);
  });

  it('Jana Minit sends the pre-redesign Selesai payload with the same untitled default', async () => {
    expect(T.editor.untitledMeeting).toBe('Mesyuarat Tanpa Tajuk');
    const calls = installFetch(routes);
    renderEditor();
    editLocation();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: T.actions.generate }));
    });

    const saves = callsTo(calls, 'POST', '/api/meetings/save');
    expect(saves).toHaveLength(1);
    expect(saves[0]).toEqual(FIXTURES.generate);
  });

  it('Editor .docx link keeps the pre-redesign href and download attribute', () => {
    installFetch(routes);
    renderEditor();
    const link = screen.getByRole('link', { name: T.history.downloadDocx });
    expect(link).toHaveAttribute('href', FIXTURES.docxHref(LEGACY_MEETING.id));
    expect(link).toHaveAttribute('download');
  });
});

// ── Tracker action ───────────────────────────────────────────────────────────

describe('API contract: TrackerView', () => {
  it('status change sends the pre-redesign full-meeting POST /api/meetings/save', async () => {
    const user = userEvent.setup();
    const calls = installFetch({
      'POST /api/meetings/save': () => jsonResponse({ status: 'success', id: TRACKER_MEETING.id }),
    });
    withToasts(<TrackerView meetings={[TRACKER_MEETING]} />);

    const table = within(screen.getByRole('table'));
    await user.selectOptions(table.getByRole('combobox', { name: T.tracker.updateStatusFor('Sediakan laporan') }), 'Selesai');

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual(FIXTURES.trackerStatus);
  });
});

// ── Ingest actions ───────────────────────────────────────────────────────────

describe('API contract: IngestView', () => {
  const S = T.ingest;

  const renderIngest = () => {
    const onExtracted = vi.fn();
    const utils = withToasts(<IngestView onExtracted={onExtracted} onBack={vi.fn()} />);
    return { ...utils, onExtracted };
  };

  beforeEach(() => {
    // Deterministic record id: meet_ + first 8 hex chars of the UUID.
    vi.stubGlobal('crypto', { randomUUID: () => 'abcdef12-3456-4789-8abc-def012345678' });
  });

  it('extract and Draf pre-save send the pre-redesign requests', async () => {
    const user = userEvent.setup();
    const calls = installFetch({
      'POST /api/extract': () => jsonResponse({ data: EXTRACT_DATA }),
      'POST /api/meetings/save': () => jsonResponse({ status: 'success', id: 'meet_abcdef12' }),
    });
    const { onExtracted } = renderIngest();

    await user.type(screen.getByLabelText(S.transcriptLabel), 'Mesyuarat bermula.');
    await user.click(screen.getByRole('button', { name: T.actions.extract }));
    await waitFor(() => expect(onExtracted).toHaveBeenCalledTimes(1));

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(FIXTURES.extract);
    expect(calls[1]).toEqual(FIXTURES.drafPreSave);
  });

  it('extract with a custom template sends template_text', async () => {
    const user = userEvent.setup();
    const calls = installFetch({
      'POST /api/extract': () => jsonResponse({ data: { title: 'X' } }),
      'POST /api/meetings/save': () => jsonResponse({ status: 'success' }),
    });
    const { container, onExtracted } = renderIngest();

    await user.selectOptions(screen.getByLabelText(S.templateLabel), 'custom');
    const templateInput = container.querySelector('input[type="file"][accept=".txt,.md,.docx"]');
    await user.upload(templateInput, new File(['TEMPLAT KHAS'], 'templat.txt', { type: 'text/plain' }));
    await screen.findByText(S.templateLoadedSuffix);

    await user.type(screen.getByLabelText(S.transcriptLabel), 'Teks.');
    await user.click(screen.getByRole('button', { name: T.actions.extract }));
    await waitFor(() => expect(onExtracted).toHaveBeenCalledTimes(1));

    expect(callsTo(calls, 'POST', '/api/extract')).toEqual([FIXTURES.extractCustom]);
  });

  it('transcribe sends the pre-redesign multipart POST /api/transcribe', async () => {
    const user = userEvent.setup();
    const calls = installFetch({
      'POST /api/transcribe': () => ({ ok: true, status: 200, body: completedSseBody() }),
    });
    const { container } = renderIngest();

    const audioInput = container.querySelector('input[type="file"][accept*=".mp3"]');
    await user.upload(audioInput, new File(['x'], 'rakaman.mp3', { type: 'audio/mpeg' }));
    await waitFor(() => expect(screen.getByLabelText(S.transcriptLabel)).toHaveValue('Transkrip penuh.'));

    expect(calls).toEqual([FIXTURES.transcribe]);
    expect(sessionStorage.getItem('mom_transcript_id')).toBe('abc123');
  });

  it('transcript restore sends the pre-redesign GET /api/transcript/{id}', async () => {
    sessionStorage.setItem('mom_transcript_id', 'abc123');
    const calls = installFetch({
      'GET /api/transcript/abc123': () => jsonResponse({ transcript: 'Transkrip lama.' }),
    });
    renderIngest();

    await waitFor(() => expect(screen.getByLabelText(S.transcriptLabel)).toHaveValue('Transkrip lama.'));
    expect(calls).toEqual([FIXTURES.transcriptRestore]);
  });
});
