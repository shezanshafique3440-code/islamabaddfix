'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * Form primitives.
 *
 * Every input is wired to its label and error message by id, and errors are
 * announced via aria-describedby + role="alert" rather than only shown in red.
 */

const CONTROL =
  'w-full rounded-xl border bg-surface px-3.5 text-[0.9375rem] text-ink-900 ' +
  'placeholder:text-ink-500 transition-colors ' +
  'disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500';

const CONTROL_OK = 'border-ink-300 hover:border-ink-400 focus:border-brand-600';
const CONTROL_ERROR = 'border-alert-400 hover:border-alert-500 focus:border-alert-600';

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
}

export function Field({ label, hint, error, required, className, children }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
        {required ? (
          <span className="ml-0.5 text-alert-600" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-alert-600">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  label,
  hint,
  error,
  required,
  className,
  ...rest
}: {
  label: string;
  hint?: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          required={required}
          className={cn(CONTROL, 'h-11', invalid ? CONTROL_ERROR : CONTROL_OK)}
          {...rest}
        />
      )}
    </Field>
  );
}

export function Textarea({
  label,
  hint,
  error,
  required,
  className,
  rows = 4,
  ...rest
}: {
  label: string;
  hint?: string;
  error?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          rows={rows}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          required={required}
          className={cn(CONTROL, 'py-2.5 leading-relaxed', invalid ? CONTROL_ERROR : CONTROL_OK)}
          {...rest}
        />
      )}
    </Field>
  );
}

export function Select({
  label,
  hint,
  error,
  required,
  className,
  children,
  ...rest
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          required={required}
          className={cn(
            CONTROL,
            'h-11 appearance-none bg-[length:18px] bg-[right_0.75rem_center] bg-no-repeat pr-10',
            invalid ? CONTROL_ERROR : CONTROL_OK,
          )}
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%236e7c84'%3E%3Cpath d='M5.2 7.5 10 12.3l4.8-4.8'/%3E%3C/svg%3E\")",
          }}
          {...rest}
        >
          {children}
        </select>
      )}
    </Field>
  );
}

export function Checkbox({
  label,
  hint,
  error,
  className,
  ...rest
}: {
  label: React.ReactNode;
  hint?: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-start gap-2.5">
        <input
          id={id}
          type="checkbox"
          aria-describedby={errorId}
          aria-invalid={Boolean(error) || undefined}
          className="mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0 rounded border-ink-300 text-brand-700 focus:ring-brand-600"
          {...rest}
        />
        <label htmlFor={id} className="text-sm leading-relaxed text-ink-700">
          {label}
        </label>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="ml-7 text-sm text-alert-600">
          {error}
        </p>
      ) : hint ? (
        <p className="ml-7 text-sm text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

/** Card-style radio used for service, provider and payment selection. */
export function RadioCard({
  checked,
  disabled,
  onSelect,
  children,
  className,
}: {
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={checked}
      className={cn(
        'w-full rounded-2xl border p-4 text-left transition-all duration-150',
        checked
          ? 'border-brand-600 bg-brand-50/50 ring-1 ring-brand-600'
          : 'border-ink-200 bg-surface hover:border-ink-300 hover:bg-ink-50/50',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      {children}
    </button>
  );
}
