import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Save } from 'lucide-react';
import Button from './Button';

const VARIANTS = ['primary', 'secondary', 'outline', 'ghost', 'danger'];

describe('Button', () => {
  // Req 1.5: each variant has its own class set.
  it('renders a distinct class set for every variant', () => {
    const classSets = VARIANTS.map((variant) => {
      const { unmount } = render(<Button variant={variant}>Simpan</Button>);
      const cls = screen.getByRole('button', { name: 'Simpan' }).className;
      unmount();
      return cls;
    });
    expect(new Set(classSets).size).toBe(VARIANTS.length);
    // Disabled-state tokens are present on every variant (Req 1.8).
    classSets.forEach((cls) => expect(cls).toContain('disabled:bg-neutral-100'));
  });

  it('calls onClick for click, Enter and Space when active', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Simpan</Button>);
    const button = screen.getByRole('button', { name: 'Simpan' });

    await user.click(button);
    button.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');

    expect(onClick).toHaveBeenCalledTimes(3);
  });

  // Req 1.8 / 8.6: disabled and busy buttons ignore click and keyboard activation.
  it.each([
    ['disabled', { disabled: true }],
    ['busy', { busy: true }],
  ])('%s button ignores click, Enter and Space', async (_label, props) => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick} {...props}>Simpan</Button>);
    const button = screen.getByRole('button', { name: 'Simpan' });

    await user.click(button);
    button.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');

    expect(onClick).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
  });

  it('exposes aria-busy only when busy is passed', () => {
    const { rerender } = render(<Button busy>Muat naik</Button>);
    const button = screen.getByRole('button', { name: 'Muat naik' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();

    rerender(<Button busy={false}>Muat naik</Button>);
    expect(button).toHaveAttribute('aria-busy', 'false');
    expect(button).toBeEnabled();

    rerender(<Button>Muat naik</Button>);
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('defaults to type="button"', () => {
    render(<Button>Simpan</Button>);
    expect(screen.getByRole('button', { name: 'Simpan' })).toHaveAttribute('type', 'button');
  });

  describe('as="a"', () => {
    it('marks an inactive link aria-disabled, removes it from tab order and prevents clicks', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(
        <Button as="a" href="/api/export/x" disabled onClick={onClick}>
          Muat turun
        </Button>,
      );
      const link = screen.getByRole('link', { name: 'Muat turun' });
      expect(link).toHaveAttribute('aria-disabled', 'true');
      expect(link).toHaveAttribute('tabindex', '-1');

      await user.click(link);
      link.focus();
      await user.keyboard('{Enter}');
      expect(onClick).not.toHaveBeenCalled();
    });

    it('busy link is also aria-disabled', () => {
      render(<Button as="a" href="/x" busy>Muat turun</Button>);
      const link = screen.getByRole('link', { name: 'Muat turun' });
      expect(link).toHaveAttribute('aria-disabled', 'true');
      expect(link).toHaveAttribute('aria-busy', 'true');
    });

    it('active link has no aria-disabled and handles clicks', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn((e) => e.preventDefault());
      render(<Button as="a" href="/x" onClick={onClick}>Muat turun</Button>);
      const link = screen.getByRole('link', { name: 'Muat turun' });
      expect(link).not.toHaveAttribute('aria-disabled');
      await user.click(link);
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  // Req 10.6: decorative icons are hidden from assistive technologies.
  it('marks the icon and the busy spinner aria-hidden', () => {
    const { container, rerender } = render(<Button icon={Save}>Simpan</Button>);
    let svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(1);
    expect(svgs[0]).toHaveAttribute('aria-hidden', 'true');

    rerender(<Button icon={Save} busy>Simpan</Button>);
    svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(1);
    expect(svgs[0]).toHaveAttribute('aria-hidden', 'true');
    expect(svgs[0].getAttribute('class')).toContain('animate-spin');
  });

  it('iconOnly button uses aria-label as its name and hides children', () => {
    render(<Button icon={Save} iconOnly aria-label="Simpan">Teks</Button>);
    const button = screen.getByRole('button', { name: 'Simpan' });
    expect(button).not.toHaveTextContent('Teks');
  });
});
