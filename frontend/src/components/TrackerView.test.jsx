import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TrackerView from './TrackerView';
import ToastProvider from './ui/ToastProvider';

// Fixed "today": 5 Mac 2026. Today = 2026-03-05.
const MEETING_A = {
  id: 'meet_aaaa1111',
  meeting_title: 'Mesyuarat Pengurusan',
  status: 'Selesai',
  date: '2026-02-15',
  action_items: [
    { task: 'Sediakan laporan', assignee: 'En. Ali', deadline: '2026-03-10', status: 'Belum Mula' },
    { task: 'Kemas kini portal', assignee: 'Pn. Siti', deadline: '2026-03-01', status: 'Sedang Berjalan' }, // overdue
    { task: 'Hantar surat', assignee: 'En. Raju', deadline: '2026-02-01', status: 'Selesai' }, // done, past date
  ],
};

const MEETING_B = {
  id: 'meet_bbbb2222',
  meeting_title: 'Mesyuarat Teknikal',
  status: 'Draf',
  legacy_field: { keep: true },
  action_items: [
    { task: 'Semak bajet', assignee: 'En. Abu', deadline: '', status: 'Belum Mula' }, // no deadline
    { task: 'Audit sistem', assignee: 'Cik Mei', deadline: '2026-02-20', status: 'Belum Mula' }, // overdue
  ],
};

const MEETINGS = [MEETING_A, MEETING_B];

function renderTracker(props = {}) {
  return render(
    <ToastProvider>
      <TrackerView meetings={MEETINGS} {...props} />
    </ToastProvider>,
  );
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const table = () => within(screen.getByRole('table'));

// The card list is the <ul> whose items carry <dt> terms.
function cardList() {
  const list = screen.getAllByRole('list').find((l) => within(l).queryAllByRole('term').length > 0);
  return within(list);
}

function statValue(label) {
  const region = screen.getByRole('region', { name: 'Ringkasan status tindakan susulan' });
  return within(region).getByText(label).nextElementSibling.textContent;
}

describe('TrackerView', () => {
  let fetchMock;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 2, 5, 10, 0));
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // Req 12.6
  it('renders the five table column headers', () => {
    renderTracker();
    const headers = table().getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Tindakan', 'Tanggungjawab', 'Tarikh Akhir', 'Mesyuarat', 'Status']);
  });

  // Req 6.5, 6.6, 12.3
  it('shows Tertunggak badge and formatted, emphasised deadline for overdue rows', () => {
    renderTracker();
    const row = table().getByText('Kemas kini portal').closest('tr');
    expect(within(row).getByText('Tertunggak')).toBeInTheDocument();
    const deadline = within(row).getByText('01 Mac 2026');
    expect(deadline).toHaveClass('text-danger-fg');

    // Non-overdue row keeps its stored status and normal date styling.
    const okRow = table().getByText('Sediakan laporan').closest('tr');
    expect(within(okRow).queryByText('Tertunggak')).not.toBeInTheDocument();
    expect(within(okRow).getByText('10 Mac 2026')).not.toHaveClass('text-danger-fg');

    // Selesai with a past deadline is never overdue.
    const doneRow = table().getByText('Hantar surat').closest('tr');
    expect(within(doneRow).queryByText('Tertunggak')).not.toBeInTheDocument();
  });

  // Req 12.8
  it('sorts overdue first, then by deadline ascending, missing deadlines last', () => {
    renderTracker();
    const tasks = table()
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(tasks).toEqual(['Audit sistem', 'Kemas kini portal', 'Hantar surat', 'Sediakan laporan', 'Semak bajet']);
  });

  // Req 12.2, 12.4
  it('shows stat counts and completion rate', () => {
    renderTracker();
    expect(statValue('Jumlah')).toBe('5');
    expect(statValue('Belum Mula')).toBe('2');
    expect(statValue('Sedang Berjalan')).toBe('0');
    expect(statValue('Tertunggak')).toBe('2');
    expect(statValue('Selesai')).toBe('1');

    expect(screen.getByText('Kadar Penyelesaian')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20');
    expect(screen.getByText('1 daripada 5 tindakan selesai')).toBeInTheDocument();
  });

  // Req 12.5, 13.1
  it('shows 0% with an empty bar and the EmptyState when there are no action items', () => {
    renderTracker({ meetings: [{ id: 'meet_cccc3333', meeting_title: 'Kosong', action_items: [] }] });
    expect(statValue('Jumlah')).toBe('0');
    expect(screen.getByText('0%')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar.firstElementChild).toHaveStyle({ width: '0%' });
    expect(screen.getByText('0 daripada 0 tindakan selesai')).toBeInTheDocument();
    expect(screen.getByText('Tiada tindakan susulan')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  // Req 7.12, 12.8 (pre-redesign payload)
  it('saves a status change with the pre-redesign request shape', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { status: 'success', id: MEETING_A.id }));
    const user = userEvent.setup();
    renderTracker();

    const select = table().getByRole('combobox', { name: 'Kemas kini status: Sediakan laporan' });
    await user.selectOptions(select, 'Selesai');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/meetings/save');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });

    const expected = {
      ...MEETING_A,
      action_items: MEETING_A.action_items.map((it, i) => (i === 0 ? { ...it, status: 'Selesai' } : it)),
    };
    expect(JSON.parse(options.body)).toEqual(expected);

    await waitFor(() => expect(select).not.toBeDisabled());
    expect(select).toHaveValue('Selesai');
    expect(statValue('Selesai')).toBe('2');
    // Props are never mutated.
    expect(MEETING_A.action_items[0].status).toBe('Belum Mula');
  });

  // Req 7.12
  it('rolls back the status and shows an error toast when the save fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { detail: 'x' }));
    const user = userEvent.setup();
    renderTracker();

    const select = table().getByRole('combobox', { name: 'Kemas kini status: Sediakan laporan' });
    await user.selectOptions(select, 'Sedang Berjalan');

    const alert = screen.getByRole('alert');
    await waitFor(() => expect(within(alert).getByText(/Mengemas kini status tindakan gagal: x/)).toBeInTheDocument());
    expect(select).toHaveValue('Belum Mula');
    expect(select).not.toBeDisabled();
    expect(statValue('Sedang Berjalan')).toBe('0');
  });

  // Req 12.7
  it('renders mobile cards with all five fields', () => {
    renderTracker();
    const cards = cardList().getAllByRole('listitem');
    expect(cards).toHaveLength(5);

    const first = within(cards[0]);
    expect(first.getAllByRole('term').map((t) => t.textContent)).toEqual([
      'Tindakan', 'Tanggungjawab', 'Tarikh Akhir', 'Mesyuarat', 'Status',
    ]);
    expect(first.getByText('Audit sistem')).toBeInTheDocument();
    expect(first.getByText('Cik Mei')).toBeInTheDocument();
    expect(first.getByText('20 Februari 2026')).toBeInTheDocument();
    expect(first.getByText('Mesyuarat Teknikal')).toBeInTheDocument();
    expect(first.getByText('Tertunggak')).toBeInTheDocument();
    expect(first.getByRole('combobox', { name: 'Kemas kini status: Audit sistem' })).toBeInTheDocument();
  });
});
