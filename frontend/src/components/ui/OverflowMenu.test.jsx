import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OverflowMenu from './OverflowMenu';

function renderMenu(props = {}) {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const items = [
    { label: 'Sunting', onSelect: onEdit },
    { label: 'Padam', onSelect: onDelete, tone: 'danger' },
  ];
  render(
    <div>
      <OverflowMenu items={items} {...props} />
      <p>Kawasan luar</p>
      <button type="button">Di luar</button>
    </div>,
  );
  const trigger = screen.getByRole('button', { name: props.label ?? 'Tindakan lain' });
  return { trigger, onEdit, onDelete };
}

describe('OverflowMenu', () => {
  // Req 10.3: trigger exposes expanded state and controls the list.
  it('toggles aria-expanded and renders the list only while open', async () => {
    const user = userEvent.setup();
    const { trigger } = renderMenu();

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('list');
    expect(trigger).toHaveAttribute('aria-controls', list.id);

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  // Req 10.3 / 11.4: fully keyboard operable.
  it('opens, selects an item by keyboard, closes and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const { trigger, onEdit, onDelete } = renderMenu();

    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.tab();
    expect(screen.getByRole('button', { name: 'Sunting' })).toHaveFocus();
    await user.tab();
    const deleteItem = screen.getByRole('button', { name: 'Padam' });
    expect(deleteItem).toHaveFocus();
    await user.keyboard(' ');

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete.mock.calls[0][1]).toEqual({ trigger });
    expect(onEdit).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('renders link items that are keyboard operable', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn((event) => event.preventDefault());
    render(
      <OverflowMenu
        items={[{ label: 'Muat turun', href: '/api/export/x', download: 'x.docx', onSelect }]}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Tindakan lain' });
    await user.click(trigger);

    const link = screen.getByRole('link', { name: 'Muat turun' });
    expect(link).toHaveAttribute('href', '/api/export/x');
    expect(link).toHaveAttribute('download', 'x.docx');
    link.focus();
    await user.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('Escape closes the menu and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const { trigger } = renderMenu();

    await user.click(trigger);
    screen.getByRole('button', { name: 'Sunting' }).focus();
    await user.keyboard('{Escape}');

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('outside click closes the menu and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const { trigger, onEdit } = renderMenu();

    await user.click(trigger);
    await user.click(screen.getByText('Kawasan luar'));

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('outside click on another control closes the menu without stealing its focus', async () => {
    const user = userEvent.setup();
    const { trigger } = renderMenu();

    await user.click(trigger);
    const other = screen.getByRole('button', { name: 'Di luar' });
    await user.click(other);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(other).toHaveFocus();
  });

  it('uses a custom label and attaches a caller-supplied triggerRef', () => {
    const triggerRef = createRef();
    renderMenu({ label: 'Tindakan mesyuarat', triggerRef });
    expect(triggerRef.current).toBe(
      screen.getByRole('button', { name: 'Tindakan mesyuarat' }),
    );
  });
});
