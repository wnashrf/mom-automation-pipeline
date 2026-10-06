import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Navigation from './Navigation';

const LABELS = ['Sejarah', 'Penjejak', 'Ekstrak AI', 'Minit Baharu'];
const VIEW_TO_LABEL = {
  history: 'Sejarah',
  tracker: 'Penjejak',
  ingest: 'Ekstrak AI',
  editor: 'Minit Baharu',
};
const EMOJI = /\p{Extended_Pictographic}/u;

function renderNav(props = {}) {
  const setView = vi.fn();
  const onNewMeeting = vi.fn();
  render(
    <Navigation currentView="history" setView={setView} onNewMeeting={onNewMeeting} {...props} />,
  );
  const nav = screen.getByRole('navigation', { name: 'Navigasi utama' });
  const buttons = within(nav).getAllByRole('button');
  return { nav, buttons, setView, onNewMeeting };
}

describe('Navigation', () => {
  // Req 4.1: four items, in order, with icon + BM label and no emoji.
  it('renders four labelled items in order with icons and no emoji', () => {
    const { nav, buttons } = renderNav();
    expect(buttons.map((b) => b.textContent.trim())).toEqual(LABELS);
    buttons.forEach((b) => {
      expect(b.querySelector('svg')).not.toBeNull();
    });
    expect(EMOJI.test(nav.textContent)).toBe(false);
  });

  // Req 4.3, 4.4, 4.5: exactly one item carries aria-current="page".
  it.each(Object.entries(VIEW_TO_LABEL))(
    'marks only %s item as current',
    (view, label) => {
      const { buttons } = renderNav({ currentView: view });
      const current = buttons.filter((b) => b.getAttribute('aria-current') === 'page');
      expect(current).toHaveLength(1);
      expect(current[0]).toHaveTextContent(label);
      buttons
        .filter((b) => b !== current[0])
        .forEach((b) => expect(b).not.toHaveAttribute('aria-current'));
    },
  );

  // Req 4.7: Tab order follows visual order.
  it('follows visual order with the Tab key', async () => {
    const user = userEvent.setup();
    const { buttons } = renderNav();
    for (const button of buttons) {
      await user.tab();
      expect(button).toHaveFocus();
    }
  });

  // Req 4.7: Enter and Space activate each item.
  it('activates items with Enter and Space', async () => {
    const user = userEvent.setup();
    const { buttons, setView, onNewMeeting } = renderNav();
    const [history, tracker, ingest, newMeeting] = buttons;

    history.focus();
    await user.keyboard('{Enter}');
    tracker.focus();
    await user.keyboard(' ');
    ingest.focus();
    await user.keyboard('{Enter}');
    expect(setView.mock.calls).toEqual([['history'], ['tracker'], ['ingest']]);

    newMeeting.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onNewMeeting).toHaveBeenCalledTimes(2);
  });

  // Req 4.10: activations are ignored while a navigation change is in progress.
  it('ignores click, Enter and Space while navBusy, but keeps items focusable', async () => {
    const user = userEvent.setup();
    const { buttons, setView, onNewMeeting } = renderNav({ navBusy: true });

    for (const button of buttons) {
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).not.toBeDisabled();
      await user.click(button);
      button.focus();
      expect(button).toHaveFocus();
      await user.keyboard('{Enter}');
      await user.keyboard(' ');
    }

    expect(setView).not.toHaveBeenCalled();
    expect(onNewMeeting).not.toHaveBeenCalled();
  });
});
