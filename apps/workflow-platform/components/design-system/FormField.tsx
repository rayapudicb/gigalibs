import React, { type ReactNode } from "react";
import { AlertCircle } from "lucide-react";

export function Label({
  htmlFor,
  children,
  required,
}: {
  htmlFor?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-ui-fg-muted">
      {children}
      {required && (
        <span className="ml-0.5 text-red-500" aria-hidden="true">
          *
        </span>
      )}
      {required && <span className="sr-only"> (required)</span>}
    </label>
  );
}

export function Input({
  id,
  value,
  onChange,
  placeholder,
  required,
  type = "text",
  disabled,
  error,
  min,
  max,
  step,
  className = "",
}: {
  id?: string;
  value?: string | number;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  required?: boolean;
  type?: string;
  disabled?: boolean;
  error?: string;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      required={required}
      disabled={disabled}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      onChange={onChange}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      className={[
        "h-9 w-full rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-1 text-xs text-ui-fg-base placeholder:text-ui-fg-muted focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-ui-bg-disabled disabled:text-ui-fg-disabled",
        error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

export function TextArea({
  id,
  value,
  onChange,
  placeholder,
  required,
  rows = 4,
  disabled,
  error,
  className = "",
}: {
  id?: string;
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
  placeholder?: string;
  required?: boolean;
  rows?: number;
  disabled?: boolean;
  error?: string;
  className?: string;
}) {
  return (
    <textarea
      id={id}
      value={value}
      required={required}
      rows={rows}
      disabled={disabled}
      placeholder={placeholder}
      onChange={onChange}
      aria-invalid={error ? true : undefined}
      className={[
        "w-full rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-xs text-ui-fg-base placeholder:text-ui-fg-muted focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-ui-bg-disabled disabled:text-ui-fg-disabled resize-y",
        error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

export function Select({
  id,
  value,
  onChange,
  children,
  required,
  disabled,
  error,
  className = "",
}: {
  id?: string;
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
  children: ReactNode;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  className?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      required={required}
      disabled={disabled}
      onChange={onChange}
      aria-invalid={error ? true : undefined}
      className={[
        "h-9 w-full rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-1 text-xs text-ui-fg-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-ui-bg-disabled disabled:text-ui-fg-disabled",
        error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </select>
  );
}

export function FormField({
  children,
  label,
  required,
  id,
  helper,
  error,
}: {
  children: ReactNode;
  label?: string;
  required?: boolean;
  id?: string;
  helper?: string;
  error?: string;
}) {
  return (
    <div className="mb-3 min-w-0">
      {label && (
        <Label htmlFor={id} required={required}>
          {label}
        </Label>
      )}
      {children}
      {helper && !error && <p className="mt-1 text-xs text-ui-fg-muted">{helper}</p>}
      {error && (
        <p className="mt-1 flex items-center gap-1 text-xs text-red-500" role="alert">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

export function FormRow({ children }: { children: ReactNode }) {
  return <div className="mb-3 min-w-0 space-y-1">{children}</div>;
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="mb-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 [&>div]:mb-0">{children}</div>;
}

export function FormActions({
  children,
  error,
}: {
  children: ReactNode;
  error?: string;
}) {
  return (
    <div className="pt-2">
      {error && (
        <div className="mb-2 flex items-center gap-1.5 text-xs text-red-500" role="alert">
          <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {children}
      </div>
    </div>
  );
}
