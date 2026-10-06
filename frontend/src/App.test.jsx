// App flow tests: navigation flush/refresh, delete dialog, navigation guard, heading outline.
// Validates: Requirements 3.5, 4.8, 4.9, 4.10, 4.11, 7.1, 7.7, 7.8, 13.5
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { T } from './lib/terminology';

const MEETING = {
  id: 'meet_abcd1234',
  meeting_title: 'Mesyuarat Jawatankuasa Ujian',
  status: 'Draf',
  date: '2026-01-10',
  location: 'Bilik A',
  action_items: [],
};

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

/**
 * Installs a routed fetch mock. `opts.save` decides the POST /api/meetings/save
 * response; `opts.listGate` (a deferred) holds GET /api/meetings when set.
 */
function installFetch(opts = {}) {
  const calls = [];
  const state = { meetings: [MEETING], save: opts.save ?? (() => jsonResponse(200, { id: 'x' })), listGate: null };
  const fetchMock = vi.fn(async (input, init = {}) => {
    const url = String(input);
    const method = (init.method || 'GET').toUpperCase();
    calls.push({ url, method });
    if (url === '/api/meetings' && method === 'GET') {
      if (state.listGate) await state.listGate.promise;
      return jsonResponse(200, state.meetings);
    }
    if (url === '/api/meetings/save' && method === 'POST') return state.save(init);
    const del = url.match(/^\/api\/meetings\/([^/]+)$/);
    if (del && method === 'DELETE') return jsonResponse(200, { ok: true });
    return jsonResponse(404, { detail: 'Tidak dijumpai' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, state };
}

function renderApp() {
  const container = document.createElement('div');
  container.id = 'root';
  document.body.appendChild(container);
  return render(<App />, { container });
}

const navButton = (name) =>
  within(screen.getByRole('navigation', { name: T.nav.label })).getByRole('button', { name });

const pageHeading = () => screen.getByRole('heading', { level: 2 });

async function openBlankEditorWithTitle(user, title = 'Mesyuarat Draf Baharu') {
  await user.click(navButton(T.nav.newMeeting));
  expect(pageHeading()).toHaveTextContent(T.views.editor.title);
  await user.type(screen.getByLabelText(new RegExp(T.editor.fields.title)), title);
}

beforeEach(() => {
  sessionStorage.clear();
  if (!globalThis.crypto?.randomUUID) {
    vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000000' });
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App navigation', () => {
  it('leaving the editor flushes the draft, then refreshes /api/meetings', async () => {
    const user = userEvent.setup();
    const { calls } = installFetch();
    renderApp();
    await screen.findByText(MEETING.meeting_title);

    await openBlankEditorWithTitle(user);
    const before = calls.length;
    await user.click(navButton(T.nav.history));

    await waitFor(() => expect(pageHeading()).toHaveTextContent(T.views.history.title));
    const after = calls.slice(before);
    const saveIdx = after.findIndex((c) => c.url === '/api/meetings/save' && c.method === 'POST');
    const listIdx = after.findIndex((c) => c.url === '/api/meetings' && c.method === 'GET');
    expect(saveIdx).toBeGreaterThanOrEqual(0);
    expect(listIdx).toBeGreaterThan(saveIdx);
  });

  it('flush failure shows an error toast and keeps the editor open', async () => {
    const user = userEvent.setup();
    const { calls } = installFetch({ save: () => jsonResponse(500, { detail: 'Cakera penuh' }) });
    renderApp();
    await screen.findByText(MEETING.meeting_title);

    await openBlankEditorWithTitle(user, 'Mesyuarat Gagal Simpan');
    const before = calls.length;
    await user.click(navButton(T.nav.tracker));

    const alert = screen.getByRole('alert');
    expect(await within(alert).findByText(`${T.ops.navigateFlush} Cakera penuh`)).toBeInTheDocument();
    expect(pageHeading()).toHaveTextContent(T.views.editor.title);
    expect(screen.getByLabelText(new RegExp(T.editor.fields.title))).toHaveValue('Mesyuarat Gagal Simpan');
    // No list refresh happened: the navigation was aborted.
    expect(calls.slice(before).some((c) => c.url === '/api/meetings')).toBe(false);
  });

  it('Minit Baharu opens a blank editor', async () => {
    const user = userEvent.setup();
    installFetch();
    renderApp();
    await screen.findByText(MEETING.meeting_title);

    await user.click(navButton(T.nav.newMeeting));
    expect(pageHeading()).toHaveTextContent(T.views.editor.title);
    expect(screen.getByLabelText(new RegExp(T.editor.fields.title))).toHaveValue('');
    expect(navButton(T.nav.newMeeting)).toHaveAttribute('aria-current', 'page');
  });

  it('concurrent navigation attempts run only once and items are aria-disabled while busy', async () => {
    const { calls, state } = installFetch();
    renderApp();
    await screen.findByText(MEETING.meeting_title);

    const gate = deferred();
    state.listGate = gate;
    const listCallsBefore = calls.filter((c) => c.url === '/api/meetings').length;

    fireEvent.click(navButton(T.nav.tracker));
    fireEvent.click(navButton(T.nav.ingest));
    await waitFor(() => expect(navButton(T.nav.history)).toHaveAttribute('aria-disabled', 'true'));
    expect(navButton(T.nav.newMeeting)).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(navButton(T.nav.ingest));
    fireEvent.click(navButton(T.nav.newMeeting));

    gate.resolve();
    await waitFor(() => expect(pageHeading()).toHaveTextContent(T.views.tracker.title));
    await waitFor(() => expect(navButton(T.nav.history)).not.toHaveAttribute('aria-disabled'));

    const listCalls = calls.filter((c) => c.url === '/api/meetings').length;
    expect(listCalls - listCallsBefore).toBe(1);
    expect(pageHeading()).toHaveTextContent(T.views.tracker.title);
  });

  it('renders exactly one h1 and one h2 in every view', async () => {
    const user = userEvent.setup();
    installFetch();
    renderApp();
    await screen.findByText(MEETING.meeting_title);

    const expectOutline = (title) => {
      expect(document.querySelectorAll('h1')).toHaveLength(1);
      expect(document.querySelectorAll('h2')).toHaveLength(1);
      expect(pageHeading()).toHaveTextContent(title);
    };

    expectOutline(T.views.history.title);
    await user.click(navButton(T.nav.tracker));
    await waitFor(() => expectOutline(T.views.tracker.title));
    await user.click(navButton(T.nav.ingest));
    await waitFor(() => expectOutline(T.views.ingest.title));
    await user.click(navButton(T.nav.newMeeting));
    await waitFor(() => expectOutline(T.views.editor.title));
    // Preview mode (DocumentPreview) must not add page-level headings.
    await user.click(screen.getByRole('button', { name: T.actions.preview }));
    expectOutline(T.views.editor.title);
  });
});

describe('App delete flow', () => {
  async function openDeleteDialog(user) {
    const title = await screen.findByText(MEETING.meeting_title);
    const article = title.closest('article');
    const [desktopDelete] = within(article).getAllByRole('button', { name: T.actions.delete });
    await user.click(desktopDelete);
    return screen.getByRole('dialog', { name: 'Padam minit mesyuarat?' });
  }

  it('Padam sends DELETE /api/meetings/{id} and shows a success toast', async () => {
    const user = userEvent.setup();
    const { calls } = installFetch();
    renderApp();

    const dialog = await openDeleteDialog(user);
    expect(document.getElementById('root')).toHaveAttribute('inert');
    expect(within(dialog).getByRole('button', { name: T.actions.cancel })).toHaveFocus();

    await user.click(within(dialog).getByRole('button', { name: T.actions.delete }));

    const status = screen.getByRole('status');
    expect(await within(status).findByText(T.success.delete)).toBeInTheDocument();
    expect(calls).toContainEqual({ url: `/api/meetings/${MEETING.id}`, method: 'DELETE' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText(MEETING.meeting_title)).not.toBeInTheDocument();
    expect(document.getElementById('root')).not.toHaveAttribute('inert');
  });

  it('Batal closes the dialog without sending a request', async () => {
    const user = userEvent.setup();
    const { calls } = installFetch();
    renderApp();

    const dialog = await openDeleteDialog(user);
    const before = calls.length;
    await user.click(within(dialog).getByRole('button', { name: T.actions.cancel }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls.length).toBe(before);
    expect(screen.getByText(MEETING.meeting_title)).toBeInTheDocument();
  });
});
