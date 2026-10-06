import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef, useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmDialog from './ConfirmDialog';

const TITLE = 'Padam mesyuarat?';

// Harness with a real opener: closing via onCancel sets open=false, so focus return and
// `inert` removal are exercised exactly as in the app.
function Harness({ onConfirm = () => {}, onCancelSpy = () => {} }) {
  const [open, setOpen] = useState(false);
  const openerRef = useRef(null);
  return (
    <>
      <button type="button" ref={openerRef} onClick={() => setOpen(true)}>
        Buka dialog
      </button>
      <ConfirmDialog
        open={open}
        title={TITLE}
        message="Tindakan ini tidak boleh dibatalkan."
        onConfirm={onConfirm}
        onCancel={() => {
          onCancelSpy();
          setOpen(false);
        }}
        returnFocusRef={openerRef}
      />
    </>
  );
}

let root;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
});

afterEach(() => {
  cleanup();
  root?.remove();
  root = undefined;
});

async function openDialog(props) {
  const user = userEvent.setup();
  render(<Harness {...props} />, { container: root });
  const opener = screen.getByRole('button', { name: 'Buka dialog' });
  await user.click(opener);
  const dialog = screen.getByRole('dialog');
  return { user, opener, dialog };
}

describe('ConfirmDialog', () => {
  // Req 7.7, 10.7: focus on "Batal"; title is the accessible name; background is inert.
  it('focuses "Batal" on open, is named by its title and makes #root inert', async () => {
    const { dialog } = await openDialog();
    expect(screen.getByRole('dialog', { name: TITLE })).toBe(dialog);
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Batal' })).toHaveFocus();
    expect(root).toHaveAttribute('inert');
    // Portalled outside #root.
    expect(root.contains(dialog)).toBe(false);
  });

  // Req 7.9, 10.8: Tab / Shift+Tab wrap within the dialog.
  it('traps focus: Tab from last wraps to first, Shift+Tab from first wraps to last', async () => {
    const { user } = await openDialog();
    const batal = screen.getByRole('button', { name: 'Batal' });
    const padam = screen.getByRole('button', { name: 'Padam' });

    await user.tab();
    expect(padam).toHaveFocus();
    await user.tab();
    expect(batal).toHaveFocus();
    await user.tab({ shift: true });
    expect(padam).toHaveFocus();
    await user.tab({ shift: true });
    expect(batal).toHaveFocus();
  });

  // Req 7.8, 10.9: every cancel path closes without the destructive action and restores focus.
  it.each([
    ['Escape', async (user) => user.keyboard('{Escape}')],
    ['Batal', async (user) => user.click(screen.getByRole('button', { name: 'Batal' }))],
    ['backdrop click', async (user, dialog) => user.click(dialog.parentElement)],
  ])('closes via %s without calling onConfirm and returns focus to the opener', async (_label, act) => {
    const onConfirm = vi.fn();
    const onCancelSpy = vi.fn();
    const { user, opener, dialog } = await openDialog({ onConfirm, onCancelSpy });

    await act(user, dialog);

    expect(onCancelSpy).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(root).not.toHaveAttribute('inert');
    expect(opener).toHaveFocus();
  });

  it('does not close when a press starts inside the panel', async () => {
    const onCancelSpy = vi.fn();
    const { user } = await openDialog({ onCancelSpy });
    await user.click(screen.getByText('Tindakan ini tidak boleh dibatalkan.'));
    expect(onCancelSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  // Req 7.7: "Padam" performs the destructive action.
  it('calls onConfirm when "Padam" is activated', async () => {
    const onConfirm = vi.fn();
    const onCancelSpy = vi.fn();
    const { user } = await openDialog({ onConfirm, onCancelSpy });
    await user.click(screen.getByRole('button', { name: 'Padam' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancelSpy).not.toHaveBeenCalled();
  });
});
