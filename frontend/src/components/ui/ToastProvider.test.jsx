import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ToastProvider from './ToastProvider';
import { useToast } from './toastContext';

// Harness: hands the toast API to the test via a callback.
function ApiProbe({ onApi }) {
  const api = useToast();
  useEffect(() => {
    onApi(api);
  }, [api, onApi]);
  return null;
}

function renderToasts() {
  let api;
  const utils = render(
    <ToastProvider>
      <ApiProbe onApi={(a) => { api = a; }} />
    </ToastProvider>,
  );
  return { ...utils, api: () => api };
}

// userEvent awaits internal timeouts; let fake time also follow real time so they resolve.
function setupUser() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  return userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
}

const statusRegion = () => screen.getByRole('status');
const alertRegion = () => screen.getByRole('alert');

describe('ToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Req 10.13: both live regions exist before any toast is shown.
  it('renders both live containers before the first toast', () => {
    renderToasts();
    const alert = alertRegion();
    const status = statusRegion();
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(alert).toBeEmptyDOMElement();
    expect(status).toBeEmptyDOMElement();
  });

  // Req 7.5: success/info auto-dismiss between 5000 and 6000 ms.
  it.each(['success', 'info'])('%s toast is dismissed between 5000 and 6000ms', (type) => {
    const { api } = renderToasts();
    act(() => {
      api()[type]('Mesyuarat disimpan.');
    });
    expect(within(statusRegion()).getByText('Mesyuarat disimpan.')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('Mesyuarat disimpan.')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByText('Mesyuarat disimpan.')).not.toBeInTheDocument();
  });

  // Req 7.6: error toasts persist until dismissed and go to the alert region.
  it('keeps error toasts visible until dismissed', () => {
    const { api } = renderToasts();
    act(() => {
      api().error('Gagal menyimpan.');
    });
    expect(within(alertRegion()).getByText('Gagal menyimpan.')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(60_000));
    expect(within(alertRegion()).getByText('Gagal menyimpan.')).toBeInTheDocument();
  });

  // Req 7.6, 10.13: the close button is keyboard operable.
  it('closes a toast via the close button with Enter and with Space', async () => {
    const user = setupUser();
    const { api } = renderToasts();
    act(() => {
      api().error('Ralat pertama.');
      api().error('Ralat kedua.');
    });

    const first = screen.getByText('Ralat pertama.').closest('div.flex.items-start');
    within(first).getByRole('button', { name: 'Tutup pemberitahuan' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.queryByText('Ralat pertama.')).not.toBeInTheDocument();

    const second = screen.getByText('Ralat kedua.').closest('div.flex.items-start');
    within(second).getByRole('button', { name: 'Tutup pemberitahuan' }).focus();
    await user.keyboard(' ');
    expect(screen.queryByText('Ralat kedua.')).not.toBeInTheDocument();
  });

  // Req 7.6: the action button invokes onAction (and closes the toast).
  it('invokes onAction when the action button is activated', async () => {
    const user = setupUser();
    const onAction = vi.fn();
    const { api } = renderToasts();
    act(() => {
      api().error('Pengekstrakan gagal.', { action: { label: 'Cuba Lagi', onAction } });
    });

    await user.click(screen.getByRole('button', { name: 'Cuba Lagi' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Pengekstrakan gagal.')).not.toBeInTheDocument();
  });

  // Req 7.3, 7.4, 7.11: max three visible; a fourth evicts the oldest success/info.
  it('evicts the oldest success/info toast when a fourth toast arrives', () => {
    const { api } = renderToasts();
    act(() => {
      api().error('Ralat A.');
      api().success('Berjaya B.');
      api().info('Makluman C.');
    });
    act(() => {
      api().success('Berjaya D.');
    });

    expect(screen.getByText('Ralat A.')).toBeInTheDocument();
    expect(screen.queryByText('Berjaya B.')).not.toBeInTheDocument();
    expect(screen.getByText('Makluman C.')).toBeInTheDocument();
    expect(screen.getByText('Berjaya D.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Tutup pemberitahuan' })).toHaveLength(3);
  });
});
