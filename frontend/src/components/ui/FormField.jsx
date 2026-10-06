import { useId } from 'react';
import { AlertCircle } from 'lucide-react';
import { cx } from '../../lib/cx';

// All class strings are complete literals so Tailwind's scanner sees every class (Req 1.6).
const CONTROL_BASE = 'w-full rounded-md bg-white text-sm text-neutral-900 px-3 py-2 min-h-10 border transition-colors duration-150 ease-standard';
const CONTROL_NORMAL = 'border-neutral-500 hover:border-neutral-700';
// Error state swaps the border for danger; colour is not the only cue (icon + text below).
const CONTROL_INVALID = 'border-danger hover:border-danger';
const CONTROL_DISABLED = 'disabled:bg-neutral-100 disabled:text-neutral-600 disabled:cursor-not-allowed';

const LABEL_CLASS = 'block text-sm font-medium text-neutral-900';
const HELPER_CLASS = 'text-xs text-neutral-600';
const ERROR_CLASS = 'flex items-start gap-1 text-xs text-danger-fg';

const CONTROL_TAGS = new Set(['input', 'select', 'textarea']);

/**
 * Labelled form control with helper and error text wired up for assistive tech.
 *
 * Two usage modes:
 *
 * 1. Render prop: `children` is a function receiving
 *    `{ id, describedBy, invalid, className }`. Spread these onto your own control:
 *      <FormField label="Cari mesyuarat">
 *        {({ id, describedBy, invalid, className }) => (
 *          <input id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} className={className} />
 *        )}
 *      </FormField>
 *
 * 2. `as` mode: `as="input" | "select" | "textarea"` (default "input" when children is
 *    not a function). Every remaining prop (value, onChange, rows, placeholder, ...) is
 *    passed to the control. For `as="select"`, non-function `children` are rendered as the
 *    `<option>` elements inside the select.
 *
 * The value is always owned by the caller, so showing an `error` never clears it
 * (Req 10.4, 10.14). `error` text should be Bahasa Melayu.
 */
export default function FormField({
  label,
  id: idProp,
  required = false,
  helper,
  error,
  as,
  className,
  controlClassName,
  children,
  ...controlProps
}) {
  const generatedId = useId();
  const id = idProp || `field-${generatedId}`;
  const helperId = helper ? `${id}-helper` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const invalid = Boolean(error);

  const describedBy =
    [controlProps['aria-describedby'], helperId, errorId].filter(Boolean).join(' ') || undefined;

  const controlClass = cx(
    CONTROL_BASE,
    invalid ? CONTROL_INVALID : CONTROL_NORMAL,
    CONTROL_DISABLED,
    controlClassName,
  );

  let control;
  if (typeof children === 'function') {
    control = children({ id, describedBy, invalid, className: controlClass });
  } else {
    const Tag = CONTROL_TAGS.has(as) ? as : 'input';
    const tagProps = {
      ...controlProps,
      id,
      required: required || undefined,
      'aria-describedby': describedBy,
      'aria-invalid': invalid ? 'true' : undefined,
      className: controlClass,
    };
    // Only <select> takes children (its <option>s); <input> is a void element.
    control = Tag === 'select' ? <Tag {...tagProps}>{children}</Tag> : <Tag {...tagProps} />;
  }

  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
        {required ? (
          <>
            <span className="text-danger-fg" aria-hidden="true"> *</span>
            <span className="sr-only"> (wajib)</span>
          </>
        ) : null}
      </label>
      {control}
      {helper ? (
        <p id={helperId} className={HELPER_CLASS}>
          {helper}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={ERROR_CLASS}>
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
