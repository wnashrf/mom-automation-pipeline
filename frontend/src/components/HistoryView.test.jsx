import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HistoryView from './HistoryView';

const MEETINGS = [
  {
    id: 'meet_aaaa0001',
    meeting_title: 'Mesyuarat Jawatankuasa Teknikal',
    chairperson_name: 'Dato Ahmad',
    location: 'Bilik Gerakan',
    date: '2026-03-05',
    status: 'Draf',
  },
  {
    id: 'meet_aaaa0002',
    meeting_title: 'Mesyuarat Pengurusan',
    chairperson_name: 'Puan Siti',
    location: '',
    date: '',
    status: 'Selesai',
  },
  {
    id: 'meet_aaaa0003',
    meeting_title: 'Taklimat Bajet',
    chairperson_name: 'Encik Lim',
    location: 'Dewan Utama',
    date: '15/12/2025',
    // Not an exact "Draf" match: excluded from the Draf stat and filter.
    status: 'draf',
  },
];

function renderHistory(props = {}) {
  const handlers = {
    onSelectMeeting: vi.fn(),
    onEditMeeting: vi.fn(),
    onDeleteRequest: vi.fn(),
    onNewMeeting: vi.fn(),
    onOpenIngest: vi.fn(),
  };
  render(<HistoryView meetings={MEETINGS} {...handlers} {...props} />);
  return handlers;
}

const visibleTitles = () =>
  screen.queryAllByRole('article').map((a) => within(a).getByRole('heading').textContent);

const articleFor = (title) =>
  screen.getAllByRole('article').find((a) => within(a).queryByRole('heading', { name: title }));

const filterGroup = () => screen.getByRole('group', { name: 'Tapis Mengikut Status' });
const filterButton = (label) => within(filterGroup()).getByRole('button', { name: new RegExp(`^${label}`) });
const searchBox = () => screen.getByLabelText('Cari mesyuarat');

describe('HistoryView', () => {
  // Req 8.1: skeletons while loading, never an EmptyState.
  it('shows skeleton blocks while loading and no empty state', () => {
    renderHistory({ meetings: [], loading: true });
    const status = screen.getByRole('status');
    expect(status.querySelectorAll('[data-skeleton-block]').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText('Belum ada minit mesyuarat')).toBeNull();
    expect(screen.queryByText('Tiada rekod sepadan dengan carian')).toBeNull();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  // Req 8.7: empty list state with its actions.
  it('shows the empty state with new-meeting and ingest actions when there are no meetings', async () => {
    const user = userEvent.setup();
    const { onNewMeeting, onOpenIngest } = renderHistory({ meetings: [] });
    expect(screen.getByRole('heading', { name: 'Belum ada minit mesyuarat' })).toBeInTheDocument();
    expect(screen.queryByText('Tiada rekod sepadan dengan carian')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Minit Baharu' }));
    await user.click(screen.getByRole('button', { name: 'Ekstrak AI' }));
    expect(onNewMeeting).toHaveBeenCalledTimes(1);
    expect(onOpenIngest).toHaveBeenCalledTimes(1);
  });

  // Req 8.8: no-match state is distinct from empty, and clearing restores the list.
  it('shows the no-match state and clears search and filter', async () => {
    const user = userEvent.setup();
    renderHistory();
    await user.click(filterButton('Draf'));
    await user.type(searchBox(), 'bajet');

    expect(screen.getByRole('heading', { name: 'Tiada rekod sepadan dengan carian' })).toBeInTheDocument();
    expect(screen.queryByText('Belum ada minit mesyuarat')).toBeNull();
    expect(visibleTitles()).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Kosongkan Carian' }));
    expect(searchBox()).toHaveValue('');
    expect(filterButton('Semua')).toHaveAttribute('aria-pressed', 'true');
    expect(visibleTitles()).toEqual(MEETINGS.map((m) => m.meeting_title));
  });

  // Req 12.1: stats use exact status matches.
  it('shows summary and filter counts using exact status matches', () => {
    renderHistory();
    const summary = screen.getByText('Ringkasan').closest('section');
    const statValue = (label) => within(summary).getByText(label).nextElementSibling.textContent;
    expect(statValue('Jumlah Mesyuarat')).toBe('3');
    expect(statValue('Draf')).toBe('1');
    expect(statValue('Selesai')).toBe('1');

    expect(filterButton('Semua')).toHaveTextContent('3');
    expect(filterButton('Draf')).toHaveTextContent('1');
    expect(filterButton('Selesai')).toHaveTextContent('1');
  });

  // Req 5.4, 5.5: Display_Date_Format and BM fallbacks.
  it('formats dates and shows fallbacks for missing date and location', () => {
    renderHistory();
    expect(within(articleFor('Mesyuarat Jawatankuasa Teknikal')).getByText('05 Mac 2026')).toBeInTheDocument();
    expect(within(articleFor('Taklimat Bajet')).getByText('15 Disember 2025')).toBeInTheDocument();
    const missing = articleFor('Mesyuarat Pengurusan');
    expect(within(missing).getByText('Tiada tarikh')).toBeInTheDocument();
    expect(within(missing).getByText('Tiada tempat')).toBeInTheDocument();
  });

  // Req 13.7: search keeps pre-redesign semantics.
  it.each([
    ['ahmad', ['Mesyuarat Jawatankuasa Teknikal']], // chairperson, case-insensitive
    ['DEWAN', ['Taklimat Bajet']], // location
    ['2026-03', ['Mesyuarat Jawatankuasa Teknikal']], // raw stored date
    ['mesyuarat', ['Mesyuarat Jawatankuasa Teknikal', 'Mesyuarat Pengurusan']], // title
    [' bajet', ['Taklimat Bajet']], // leading space kept, still a substring
    ['bajet ', []], // trailing space kept, no longer matches
    ['Mac', []], // display date is not searched
  ])('search %j matches %j', async (term, expected) => {
    const user = userEvent.setup();
    renderHistory();
    await user.type(searchBox(), term);
    expect(visibleTitles()).toEqual(expected);
  });

  // Req 13.7: status filter is an exact match, exposed through aria-pressed.
  it('filters by exact status with aria-pressed buttons', async () => {
    const user = userEvent.setup();
    renderHistory();
    expect(filterButton('Semua')).toHaveAttribute('aria-pressed', 'true');

    await user.click(filterButton('Draf'));
    expect(filterButton('Draf')).toHaveAttribute('aria-pressed', 'true');
    expect(filterButton('Semua')).toHaveAttribute('aria-pressed', 'false');
    expect(visibleTitles()).toEqual(['Mesyuarat Jawatankuasa Teknikal']);

    await user.click(filterButton('Selesai'));
    expect(visibleTitles()).toEqual(['Mesyuarat Pengurusan']);

    await user.click(filterButton('Semua'));
    expect(visibleTitles()).toEqual(MEETINGS.map((m) => m.meeting_title));
  });

  // Req 5.2: no English UI terms remain.
  it('renders no English terms', () => {
    renderHistory();
    const text = document.body.textContent;
    ['Overview', 'No date', 'No location'].forEach((term) => expect(text).not.toContain(term));
    expect(text).not.toMatch(/\bEdit\b/);
  });

  it('wires Lihat and Sunting to the meeting id', async () => {
    const user = userEvent.setup();
    const { onSelectMeeting, onEditMeeting } = renderHistory();
    const article = articleFor('Mesyuarat Pengurusan');
    await user.click(within(article).getAllByRole('button', { name: 'Lihat' })[0]);
    await user.click(within(article).getAllByRole('button', { name: 'Sunting' })[0]);
    expect(onSelectMeeting).toHaveBeenCalledWith('meet_aaaa0002');
    expect(onEditMeeting).toHaveBeenCalledWith('meet_aaaa0002');
  });

  it('calls the delete handler with the meeting from the Padam button', async () => {
    const user = userEvent.setup();
    const { onDeleteRequest } = renderHistory();
    const button = within(articleFor('Mesyuarat Jawatankuasa Teknikal')).getByRole('button', { name: 'Padam' });
    await user.click(button);
    expect(onDeleteRequest).toHaveBeenCalledTimes(1);
    expect(onDeleteRequest).toHaveBeenCalledWith('meet_aaaa0001', button);
  });

  it('calls the delete handler from the mobile overflow menu', async () => {
    const user = userEvent.setup();
    const { onDeleteRequest } = renderHistory();
    const article = articleFor('Taklimat Bajet');
    const trigger = within(article).getByRole('button', { name: 'Tindakan lain: Taklimat Bajet' });
    await user.click(trigger);
    const padam = within(article).getAllByRole('button', { name: 'Padam' });
    await user.click(padam[padam.length - 1]);
    expect(onDeleteRequest).toHaveBeenCalledWith('meet_aaaa0003', trigger);
  });

  it('falls back to onDeleteMeeting when onDeleteRequest is not given', async () => {
    const user = userEvent.setup();
    const onDeleteMeeting = vi.fn();
    renderHistory({ onDeleteRequest: undefined, onDeleteMeeting });
    await user.click(within(articleFor('Mesyuarat Pengurusan')).getByRole('button', { name: 'Padam' }));
    expect(onDeleteMeeting).toHaveBeenCalledWith('meet_aaaa0002', expect.any(HTMLElement));
  });
});
