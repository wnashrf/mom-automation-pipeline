import { EDITOR_SECTIONS } from './editorSections.js';
import { cx } from '../../lib/cx.js';

/**
 * Scroll the section heading into view and move keyboard focus to it (Req 9.10).
 * Uses the default (instant) scroll behaviour so reduced-motion preferences are
 * respected; `scroll-mt-*` on the heading keeps it clear of the sticky bar.
 */
function goToSection(headingId) {
  const heading = document.getElementById(headingId);
  if (!heading) return;
  if (typeof heading.scrollIntoView === 'function') {
    heading.scrollIntoView({ block: 'start' });
  }
  heading.focus({ preventScroll: true });
}

/** Section navigation list for Editor_View, one entry per form card (Req 9.9). */
export default function SectionNav({ sections = EDITOR_SECTIONS, className }) {
  return (
    <nav aria-label="Bahagian minit" className={className}>
      <ol className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {sections.map((section) => (
          <li key={section.id} className="shrink-0">
            <button
              type="button"
              onClick={() => goToSection(section.headingId)}
              className={cx(
                'inline-flex items-center w-full min-h-10 px-3 py-2 rounded-md',
                'text-sm font-medium text-left text-neutral-700 whitespace-nowrap lg:whitespace-normal',
                'hover:bg-neutral-100 hover:text-neutral-900',
              )}
            >
              {section.title}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
