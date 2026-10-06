import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, act, cleanup } from '@testing-library/react';
import EditorView from './EditorView';
import ToastProvider from './ui/ToastProvider';
import { EDITOR_SECTIONS } from './editor/editorSections';
import { T } from '../lib/terminology';

const F = T.editor.fields;
const SAVE_URL = '/api/meetings/save';

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const okResponse = (data = {}) => ({ ok: true, status: 200, json: async () => data });
const failResponse = () => ({ ok: false, status: 500, json: async () => ({ detail: 'x' }) });

// fetch stub; `impl` decides the response per call (defaults to a successful save echoing the id).
function stubFetch(impl) {
  const fetchMock = vi.fn((url, init) => {
    if (impl) return impl(url, init);
    const body = init?.body ? JSON.parse(init.body) : {};
    return Promise.resolve(okResponse({ id: body.id }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const saveCalls = (fetchMock) => fetchMock.mock.calls.filter(([url]) => url === SAVE_URL);
const saveBodies = (fetchMock) => saveCalls(fetchMock).map(([, init]) => JSON.parse(init.body));

function renderEditor(meeting) {
  return render(
    <ToastProvider>
      <EditorView meeting={meeting} previewMode={false} setPreviewMode={vi.fn()} onBack={vi.fn()} />
    </ToastProvider>,
  );
}

// The Save_Indicator lives in the sticky action bar; the ToastProvider has its own role=status region.
const saveIndicator = () =>
  within(screen.getByRole('region', { name: T.editor.actionBarLabel })).getByRole('status');

const titleInput = () => screen.getByLabelText(new RegExp(`^${F.title}`));

const advance = (ms) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 2, 5, 9, 7));
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    vi.stubGlobal('crypto', { randomUUID: () => '1234abcd-0000-4000-8000-000000000000' });
  }
});

afterEach(() => {
  // Unmount (which flushes a save) while fetch is still stubbed.
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('EditorView auto-save', () => {
  it('saves 3 s after the last change and restarts the timer on further changes', async () => {
    const fetchMock = stubFetch();
    renderEditor({ id: 'meet_abcdef12', meeting_title: 'Mesyuarat A', status: 'Draf' });

    fireEvent.change(titleInput(), { target: { value: 'Mesyuarat B' } });
    await advance(2000);
    fireEvent.change(titleInput(), { target: { value: 'Mesyuarat C' } });
    await advance(2000);
    expect(saveCalls(fetchMock)).toHaveLength(0);

    await advance(1000);
    expect(saveCalls(fetchMock)).toHaveLength(1);
    const [, init] = saveCalls(fetchMock)[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).meeting_title).toBe('Mesyuarat C');
  });

  it('reuses the same id for repeated saves (minted id and provided id)', async () => {
    const fetchMock = stubFetch();
    renderEditor({ meeting_title: 'Tanpa ID', status: 'Draf' });

    fireEvent.change(titleInput(), { target: { value: 'Satu' } });
    await advance(3000);
    fireEvent.change(titleInput(), { target: { value: 'Dua' } });
    await advance(3000);

    const ids = saveBodies(fetchMock).map((b) => b.id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toMatch(/^meet_[0-9a-f]{8}$/);
    expect(ids[1]).toBe(ids[0]);

    cleanup();
    fetchMock.mockClear();
    renderEditor({ id: 'meet_0badf00d', meeting_title: 'Ada ID', status: 'Draf' });
    fireEvent.change(titleInput(), { target: { value: 'Tiga' } });
    await advance(3000);
    fireEvent.change(titleInput(), { target: { value: 'Empat' } });
    await advance(3000);
    expect(saveBodies(fetchMock).map((b) => b.id)).toEqual(['meet_0badf00d', 'meet_0badf00d']);
  });

  it('shows Menyimpan... while saving, then Disimpan pada HH:MM', async () => {
    const pending = deferred();
    stubFetch(() => pending.promise);
    renderEditor({ id: 'meet_abcdef12', meeting_title: 'Mesyuarat A', status: 'Draf' });

    expect(saveIndicator()).toHaveTextContent(T.messages.autosaveIdle);
    fireEvent.change(titleInput(), { target: { value: 'Mesyuarat B' } });
    await advance(3000);
    expect(saveIndicator()).toHaveTextContent('Menyimpan...');

    await act(async () => {
      pending.resolve(okResponse({ id: 'meet_abcdef12' }));
    });
    expect(saveIndicator()).toHaveTextContent('Disimpan pada 09:07');
  });

  it('shows Gagal disimpan and an error toast whose Cuba Lagi triggers another save', async () => {
    let call = 0;
    const retry = deferred();
    const fetchMock = stubFetch(() => {
      call += 1;
      return call === 1 ? Promise.resolve(failResponse()) : retry.promise;
    });
    renderEditor({ id: 'meet_abcdef12', meeting_title: 'Mesyuarat A', status: 'Draf' });

    fireEvent.change(titleInput(), { target: { value: 'Mesyuarat B' } });
    await advance(3000);
    expect(saveIndicator()).toHaveTextContent('Gagal disimpan');
    expect(saveCalls(fetchMock)).toHaveLength(1);

    const alert = screen.getByRole('alert');
    const retryButton = within(alert).getByRole('button', { name: T.actions.retry });
    await act(async () => {
      fireEvent.click(retryButton);
    });
    expect(saveCalls(fetchMock)).toHaveLength(2);
    expect(saveIndicator()).toHaveTextContent('Gagal disimpan · Menyimpan...');

    await act(async () => {
      retry.resolve(okResponse({ id: 'meet_abcdef12' }));
    });
    expect(saveIndicator()).toHaveTextContent('Disimpan pada 09:07');
  });
});

describe('EditorView AI_Draft_Notice', () => {
  const notice = () => screen.queryByText(T.messages.aiDraftNotice);

  it('is shown for a Draf record with a transcript', () => {
    stubFetch();
    renderEditor({ id: 'meet_abcdef12', meeting_title: 'A', status: 'Draf', raw_transcript: 'Pengerusi: Selamat pagi.' });
    expect(notice()).toBeInTheDocument();
    expect(notice().closest('[role="note"]')).not.toBeNull();
  });

  it('is hidden for a Selesai record', () => {
    stubFetch();
    renderEditor({ id: 'meet_abcdef12', meeting_title: 'A', status: 'Selesai', raw_transcript: 'Ada transkrip' });
    expect(notice()).not.toBeInTheDocument();
  });

  it('is hidden when the transcript is blank', () => {
    stubFetch();
    renderEditor({ id: 'meet_abcdef12', meeting_title: 'A', status: 'Draf', raw_transcript: '   \n ' });
    expect(notice()).not.toBeInTheDocument();
  });
});

describe('EditorView section navigation', () => {
  it('lists sections in card order and focuses the heading on activation', () => {
    stubFetch();
    const { container } = renderEditor({ id: 'meet_abcdef12', meeting_title: 'A', status: 'Draf' });

    const nav = screen.getByRole('navigation', { name: 'Bahagian minit' });
    const navTitles = within(nav).getAllByRole('button').map((b) => b.textContent);
    const headings = EDITOR_SECTIONS.map((s) => container.querySelector(`#${s.headingId}`));
    headings.forEach((h) => expect(h).not.toBeNull());

    // Card headings appear in the DOM in the same order as the nav entries.
    const domOrder = [...container.querySelectorAll('[id^="section-"]')].map((el) => el.textContent);
    expect(navTitles).toEqual(EDITOR_SECTIONS.map((s) => s.title));
    expect(domOrder).toEqual(navTitles);

    EDITOR_SECTIONS.forEach((section) => {
      fireEvent.click(within(nav).getByRole('button', { name: section.title }));
      expect(document.activeElement).toBe(container.querySelector(`#${section.headingId}`));
    });
  });
});

describe('EditorView legacy records', () => {
  it('maps nested chairperson/secretary and label/jawatan/department participants', () => {
    stubFetch();
    renderEditor({
      id: 'meet_abcdef12',
      title: 'Mesyuarat Lama',
      venue: 'Bilik 1',
      chairperson: { name: 'Dato Ali', role: 'Ketua Setiausaha' },
      secretary: { name: 'Puan Siti', role: 'Penolong Setiausaha' },
      participants: [{ label: 'Encik Abu', jawatan: 'Pegawai Tadbir', department: 'Bahagian IT' }],
      status: 'Draf',
    });

    expect(titleInput()).toHaveValue('Mesyuarat Lama');
    expect(screen.getByLabelText(F.location)).toHaveValue('Bilik 1');
    expect(screen.getByLabelText(F.chairName)).toHaveValue('Dato Ali');
    expect(screen.getByLabelText(F.chairRole)).toHaveValue('Ketua Setiausaha');
    expect(screen.getByLabelText(F.secretaryName)).toHaveValue('Puan Siti');
    expect(screen.getByLabelText(F.secretaryRole)).toHaveValue('Penolong Setiausaha');
    expect(screen.getByLabelText(F.participantName)).toHaveValue('Encik Abu');
    expect(screen.getByLabelText(F.participantPosition)).toHaveValue('Pegawai Tadbir');
    expect(screen.getByLabelText(F.participantOrg)).toHaveValue('Bahagian IT');
    expect(screen.getByLabelText(F.participantStatus)).toHaveValue('Hadir');
  });

  it('maps flat pengerusi_/pencatat_ keys and nama/role/organisasi participants', () => {
    stubFetch();
    renderEditor({
      id: 'meet_abcdef12',
      meeting_title: 'Mesyuarat Rata',
      pengerusi_nama: 'Tan Sri Ahmad',
      pengerusi_jawatan: 'Ketua Pengarah',
      pencatat_nama: 'Cik Mei',
      pencatat_jawatan: 'Setiausaha',
      participants: [{ nama: 'Encik Raju', role: 'Jurutera', organisasi: 'JKR', status: 'Turut Hadir' }],
      status: 'Draf',
    });

    expect(screen.getByLabelText(F.chairName)).toHaveValue('Tan Sri Ahmad');
    expect(screen.getByLabelText(F.chairRole)).toHaveValue('Ketua Pengarah');
    expect(screen.getByLabelText(F.secretaryName)).toHaveValue('Cik Mei');
    expect(screen.getByLabelText(F.secretaryRole)).toHaveValue('Setiausaha');
    expect(screen.getByLabelText(F.participantName)).toHaveValue('Encik Raju');
    expect(screen.getByLabelText(F.participantPosition)).toHaveValue('Jurutera');
    expect(screen.getByLabelText(F.participantOrg)).toHaveValue('JKR');
    expect(screen.getByLabelText(F.participantStatus)).toHaveValue('Turut Hadir');
  });
});
