/**
 * @gigalibs/form-engine-react / MedusaFormRenderer
 *
 * A Medusa UI–based renderer for FormEngine schemas.
 * Drop-in visual upgrade over the plain-Tailwind DynamicFormStudio renderer;
 * uses @medusajs/ui components throughout so it stays on-design with the
 * rest of the workflow-platform.
 *
 * Usage:
 *   import { MedusaFormRenderer } from '@gigalibs/form-engine-react';
 *   <MedusaFormRenderer schema={schema} onSubmit={handleSubmit} />
 */

'use client';

import * as React from 'react';
import { FormEngine, type FormSchema, type FormFieldDefinition } from '@gigalibs/form-engine-core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MedusaFormRendererProps {
  schema: FormSchema;
  /** Initial form data, e.g. loaded record values. */
  defaultValues?: Record<string, unknown>;
  /** Called with validated form data on submit. */
  onSubmit: (data: Record<string, unknown>) => void | Promise<void>;
  /** Show a loading state on the submit button. */
  loading?: boolean;
  /** Render in read-only mode (no inputs, no submit). */
  readOnly?: boolean;
}

// ─── Individual field renderer ────────────────────────────────────────────────

interface FieldProps {
  field: FormFieldDefinition;
  value: unknown;
  error?: string;
  readOnly: boolean;
  onChange: (value: unknown) => void;
}

function FieldRenderer({ field, value, error, readOnly, onChange }: FieldProps) {
  const val = value as string ?? '';

  // Label + optional required star
  const labelEl = (
    <label
      htmlFor={field.id}
      className="txt-compact-small-plus text-ui-fg-base block mb-1"
    >
      {field.label}
      {field.validation?.required && (
        <span className="text-ui-fg-error ml-0.5">*</span>
      )}
    </label>
  );

  const helpEl = field.helpText ? (
    <p className="txt-compact-xsmall text-ui-fg-muted mt-1">{field.helpText}</p>
  ) : null;

  const errorEl = error ? (
    <p className="txt-compact-xsmall text-ui-fg-error mt-1">{error}</p>
  ) : null;

  if (field.type === 'DIVIDER_HEADING') {
    return (
      <div className="col-span-full pt-4 pb-2 border-b border-ui-border-base">
        <h3 className="txt-compact-medium-plus text-ui-fg-base">{field.label}</h3>
        {field.helpText && (
          <p className="txt-compact-small text-ui-fg-muted mt-0.5">{field.helpText}</p>
        )}
      </div>
    );
  }

  if (readOnly) {
    return (
      <div className="space-y-1">
        {labelEl}
        <div className="bg-ui-bg-subtle border border-ui-border-base rounded-md px-3 py-2 txt-compact-small text-ui-fg-base min-h-9">
          {val !== '' ? String(val) : <span className="text-ui-fg-muted">—</span>}
        </div>
        {helpEl}
      </div>
    );
  }

  let inputEl: React.ReactNode;

  switch (field.type) {
    case 'TEXTAREA':
      inputEl = (
        <textarea
          id={field.id}
          rows={3}
          placeholder={field.placeholder}
          value={val}
          onChange={(e) => onChange(e.target.value)}
          className="bg-ui-bg-field border border-ui-border-base text-ui-fg-base txt-compact-small placeholder:text-ui-fg-muted w-full rounded-md px-3 py-2 focus:outline-none focus:border-ui-border-interactive resize-none"
        />
      );
      break;

    case 'NUMBER':
      inputEl = (
        <input
          id={field.id}
          type="number"
          placeholder={field.placeholder}
          value={val}
          min={field.validation?.min}
          max={field.validation?.max}
          onChange={(e) => onChange(e.target.value)}
          className="bg-ui-bg-field border border-ui-border-base text-ui-fg-base txt-compact-small placeholder:text-ui-fg-muted w-full h-9 rounded-md px-3 focus:outline-none focus:border-ui-border-interactive"
        />
      );
      break;

    case 'CHECKBOX':
      return (
        <div className="flex items-start gap-2">
          <input
            id={field.id}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-ui-border-base accent-ui-fg-interactive"
          />
          <div>
            {labelEl}
            {helpEl}
            {errorEl}
          </div>
        </div>
      );

    case 'DATE':
      inputEl = (
        <input
          id={field.id}
          type="date"
          value={val}
          onChange={(e) => onChange(e.target.value)}
          className="bg-ui-bg-field border border-ui-border-base text-ui-fg-base txt-compact-small w-full h-9 rounded-md px-3 focus:outline-none focus:border-ui-border-interactive"
        />
      );
      break;

    case 'SELECT':
      inputEl = (
        <select
          id={field.id}
          value={val}
          onChange={(e) => onChange(e.target.value)}
          className="bg-ui-bg-field border border-ui-border-base text-ui-fg-base txt-compact-small w-full h-9 rounded-md px-3 focus:outline-none focus:border-ui-border-interactive"
        >
          <option value="">Select…</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
      break;

    case 'MULTI_SELECT':
      inputEl = (
        <select
          id={field.id}
          multiple
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={(e) =>
            onChange(Array.from(e.target.selectedOptions, (o) => o.value))
          }
          className="bg-ui-bg-field border border-ui-border-base text-ui-fg-base txt-compact-small w-full rounded-md px-3 py-1.5 focus:outline-none focus:border-ui-border-interactive"
          size={Math.min((field.options?.length ?? 3) + 1, 6)}
        >
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
      break;

    case 'CURRENCY':
      inputEl = (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 txt-compact-small text-ui-fg-muted pointer-events-none">
            $
          </span>
          <input
            id={field.id}
            type="number"
            step="0.01"
            placeholder="0.00"
            value={val}
            min={field.validation?.min}
            max={field.validation?.max}
            onChange={(e) => onChange(e.target.value)}
            className="bg-ui-bg-field border border-ui-border-base text-ui-fg-base txt-compact-small placeholder:text-ui-fg-muted w-full h-9 rounded-md pl-7 pr-3 focus:outline-none focus:border-ui-border-interactive"
          />
        </div>
      );
      break;

    default:
      // TEXT | EMAIL | PHONE | URL
      inputEl = (
        <input
          id={field.id}
          type={field.type === 'EMAIL' ? 'email' : field.type === 'PHONE' ? 'tel' : 'text'}
          placeholder={field.placeholder}
          value={val}
          maxLength={field.validation?.maxLength}
          onChange={(e) => onChange(e.target.value)}
          className="bg-ui-bg-field border border-ui-border-base text-ui-fg-base txt-compact-small placeholder:text-ui-fg-muted w-full h-9 rounded-md px-3 focus:outline-none focus:border-ui-border-interactive"
        />
      );
  }

  return (
    <div className="space-y-1">
      {labelEl}
      {inputEl}
      {helpEl}
      {errorEl}
    </div>
  );
}

// ─── Main renderer ────────────────────────────────────────────────────────────

export const MedusaFormRenderer: React.FC<MedusaFormRendererProps> = ({
  schema,
  defaultValues,
  onSubmit,
  loading = false,
  readOnly = false,
}) => {
  const [formData, setFormData] = React.useState<Record<string, unknown>>(
    defaultValues ?? {},
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitted, setSubmitted] = React.useState(false);

  const handleChange = (fieldId: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
    if (errors[fieldId]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = FormEngine.validate(schema, formData as Record<string, any>);
    if (!result.isValid) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    await onSubmit(formData);
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      {submitted && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-ui-bg-subtle-hover border border-ui-border-base px-3 py-2 txt-compact-small text-ui-fg-subtle">
          <span className="text-ui-fg-interactive">✓</span>
          {schema.successMessage ?? 'Saved.'}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {schema.fields.map((field) => {
          const isVisible = FormEngine.isFieldVisible(field, formData as Record<string, any>);
          if (!isVisible) return null;

          const isDivider = field.type === 'DIVIDER_HEADING';
          return (
            <div
              key={field.id}
              className={isDivider ? 'col-span-full' : undefined}
            >
              <FieldRenderer
                field={field}
                value={formData[field.id] ?? field.defaultValue ?? ''}
                error={errors[field.id]}
                readOnly={readOnly}
                onChange={(val) => handleChange(field.id, val)}
              />
            </div>
          );
        })}
      </div>

      {!readOnly && (
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md bg-ui-button-inverted px-4 py-2 txt-compact-small-plus text-ui-fg-on-inverted hover:bg-ui-button-inverted-hover disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Saving…
              </>
            ) : (
              schema.submitButtonText ?? 'Save'
            )}
          </button>
        </div>
      )}
    </form>
  );
};
