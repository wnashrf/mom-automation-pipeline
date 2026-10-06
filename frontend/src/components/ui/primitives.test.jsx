import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Inbox, Plus } from 'lucide-react';
import FormField from './FormField';
import StatusBadge from './StatusBadge';
import EmptyState from './EmptyState';
import Skeleton from './Skeleton';
import ProgressBar from './ProgressBar';
import { STATUS_KEYS } from '../../lib/status';
import { T } from '../../lib/terminology';

/** Returns the lucide-<name> class of an svg so icons can be compared by identity. */
function lucideName(svg) {
  return [...svg.classList].find((c) => c.startsWith('lucide-')) ?? null;
}

describe('FormField', () => {
  // Req 10.4: every control has a programmatically associated label.
  it('associates the label with an as-mode control and a render-prop control', () => {
    render(
      <>
        <FormField label="Tajuk Mesyuarat" value="" onChange={() => {}} />
        <FormField label="Catatan">
          {({ id, describedBy, invalid, className }) => (
            <textarea id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} className={className} />
          )}
        </FormField>
      </>,
    );
    expect(screen.getByLabelText('Tajuk Mesyuarat').tagName).toBe('INPUT');
    expect(screen.getByLabelText('Catatan').tagName).toBe('TEXTAREA');
  });

  it('generates unique ids across many fields without an explicit id', () => {
    const labels = Array.from({ length: 25 }, (_, i) => `Medan ${i}`);
    render(
      <>
        {labels.map((label) => (
          <FormField key={label} label={label} value="" onChange={() => {}} />
        ))}
      </>,
    );
    const ids = labels.map((label) => screen.getByLabelText(label).id);
    ids.forEach((id) => expect(id).toBeTruthy());
    expect(new Set(ids).size).toBe(labels.length);
  });

  it('marks required fields with required attribute and screen-reader text', () => {
    render(<FormField label="Tarikh" required value="" onChange={() => {}} />);
    const input = screen.getByLabelText(/Tarikh/);
    expect(input).toBeRequired();
    expect(screen.getByText('(wajib)')).toHaveClass('sr-only');
  });

  it('links helper text through aria-describedby', () => {
    render(<FormField id="tempat" label="Tempat" helper="Contoh: Bilik Gerakan" value="" onChange={() => {}} />);
    const input = screen.getByLabelText('Tempat');
    expect(input).toHaveAttribute('aria-describedby', 'tempat-helper');
    expect(input).toHaveAccessibleDescription('Contoh: Bilik Gerakan');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  // Req 10.4, 10.14: error is associated, aria-invalid is set, and the value is kept.
  it('associates the error, sets aria-invalid and keeps the entered value', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState('');
      const error = value.length > 3 ? 'Terlalu panjang' : undefined;
      return (
        <FormField
          id="nama"
          label="Nama"
          helper="Maksimum 3 aksara"
          error={error}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      );
    }
    render(<Harness />);
    const input = screen.getByLabelText('Nama');
    await user.type(input, 'Ahmad');

    expect(input).toHaveValue('Ahmad');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby').split(' ')).toEqual(['nama-helper', 'nama-error']);
    expect(document.getElementById('nama-error')).toHaveTextContent('Terlalu panjang');
    expect(input).toHaveAccessibleDescription(/Terlalu panjang/);

    // Clearing the error leaves the value alone and drops aria-invalid.
    await user.clear(input);
    await user.type(input, 'Ali');
    expect(input).toHaveValue('Ali');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(document.getElementById('nama-error')).toBeNull();
  });

  it('passes invalid and describedBy to render-prop children', () => {
    render(
      <FormField id="ulasan" label="Ulasan" error="Wajib diisi">
        {({ id, describedBy, invalid, className }) => (
          <input id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} className={className} />
        )}
      </FormField>,
    );
    const input = screen.getByLabelText('Ulasan');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'ulasan-error');
  });

  it('renders select options when as="select"', () => {
    render(
      <FormField as="select" label="Status" value="b" onChange={() => {}}>
        <option value="a">A</option>
        <option value="b">B</option>
      </FormField>,
    );
    const select = screen.getByLabelText('Status');
    expect(select.tagName).toBe('SELECT');
    expect(select).toHaveValue('b');
  });
});

describe('StatusBadge', () => {
  // Req 6.3, 6.7: label text + decorative icon, distinct icon per status.
  it('renders the label and an aria-hidden icon for all five statuses', () => {
    const icons = STATUS_KEYS.map((status) => {
      const { container, unmount } = render(<StatusBadge status={status} />);
      expect(screen.getByText(status)).toBeInTheDocument();
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      const name = lucideName(svg);
      unmount();
      return name;
    });
    expect(STATUS_KEYS).toHaveLength(5);
    icons.forEach((name) => expect(name).toBeTruthy());
    expect(new Set(icons).size).toBe(5);
  });

  it.each([['Entah'], [''], [undefined], [null], [42], ['toString']])(
    'renders "Tidak Diketahui" for unknown value %p without showing it',
    (status) => {
      const { container } = render(<StatusBadge status={status} />);
      expect(screen.getByText(T.status.unknown)).toBeInTheDocument();
      expect(T.status.unknown).toBe('Tidak Diketahui');
      if (typeof status === 'string' && status) {
        expect(container).not.toHaveTextContent(status);
      }
      expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    },
  );
});

describe('EmptyState', () => {
  // Req 8.7: title, description and a working primary action.
  it('renders title as h3, description and calls action.onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <EmptyState
        icon={Inbox}
        title="Tiada mesyuarat"
        description="Muat naik rakaman untuk bermula."
        action={{ label: 'Mesyuarat Baharu', onClick, icon: Plus }}
      />,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Tiada mesyuarat' })).toBeInTheDocument();
    expect(screen.getByText('Muat naik rakaman untuk bermula.')).toBeInTheDocument();
    container.querySelectorAll('svg').forEach((svg) => expect(svg).toHaveAttribute('aria-hidden', 'true'));

    await user.click(screen.getByRole('button', { name: 'Mesyuarat Baharu' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders no button when no action is given', () => {
    render(<EmptyState title="Kosong" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Skeleton', () => {
  // Req 8.1: 3–6 placeholder blocks.
  it.each([
    [0, 3], [-5, 3], [2, 3], [3, 3], [4, 4], [5, 5], [6, 6], [7, 6], [100, 6], [4.6, 5], ['abc', 3], [NaN, 3],
  ])('count %p renders %i blocks', (count, expected) => {
    const { container } = render(<Skeleton count={count} />);
    const blocks = container.querySelectorAll('[data-skeleton-block]');
    expect(blocks).toHaveLength(expected);
    blocks.forEach((b) => expect(b).toHaveAttribute('aria-hidden', 'true'));
  });

  it('defaults to 4 blocks and announces loading via role="status"', () => {
    const { container } = render(<Skeleton variant="row" />);
    expect(container.querySelectorAll('[data-skeleton-block]')).toHaveLength(4);
    const status = screen.getByRole('status');
    expect(within(status).getByText(T.messages.loading)).toHaveClass('sr-only');
  });
});

describe('ProgressBar', () => {
  // Req 8.2: determinate progress exposes clamped ARIA values.
  it.each([
    [0, '0'], [42, '42'], [100, '100'], [-10, '0'], [150, '100'],
  ])('value %p sets aria-valuenow=%s', (value, expected) => {
    render(<ProgressBar value={value} label="Kemajuan transkripsi" />);
    const bar = screen.getByRole('progressbar', { name: 'Kemajuan transkripsi' });
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuenow', expected);
    expect(bar.firstChild.style.width).toBe(`${expected}%`);
  });
});
