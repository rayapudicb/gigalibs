import { type FormEvent, useState } from 'react';
import { FormEngine } from '@gigalibs/form-engine-core';
import type { FormFieldRow } from '@gigalibs/forms-engine-nest';
import type { FormDefinitionBody } from '@gigalibs/forms-engine-nest';

// ─── Field renderer ───────────────────────────────────────────────────────────

interface FieldRendererProps {
  field: FormFieldRow;
  value: unknown;
  onChange: (id: string, value: unknown) => void;
}

function FieldRenderer({ field, value, onChange }: FieldRendererProps) {
  const id = `form-field-${field.id}`;

  const handleChange = (val: unknown) => onChange(field.id, val);

  switch (field.type) {
    case 'TEXTAREA':
      return (
        <div className="form-field">
          <label htmlFor={id}>{field.label}{field.required && ' *'}</label>
          {field.helpText && <p className="help-text">{field.helpText}</p>}
          <textarea
            id={id}
            placeholder={field.placeholder}
            value={String(value ?? '')}
            required={field.required}
            onChange={(e) => handleChange(e.target.value)}
          />
        </div>
      );

    case 'NUMBER':
    case 'CURRENCY':
      return (
        <div className="form-field">
          <label htmlFor={id}>{field.label}{field.required && ' *'}</label>
          {field.helpText && <p className="help-text">{field.helpText}</p>}
          <input
            id={id}
            type="number"
            placeholder={field.placeholder}
            value={String(value ?? '')}
            required={field.required}
            min={field.validation?.min}
            max={field.validation?.max}
            onChange={(e) => handleChange(e.target.valueAsNumber)}
          />
        </div>
      );

    case 'CHECKBOX':
      return (
        <div className="form-field form-field--checkbox">
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            required={field.required}
            onChange={(e) => handleChange(e.target.checked)}
          />
          <label htmlFor={id}>{field.label}</label>
        </div>
      );

    case 'SELECT':
    case 'RADIO':
      return (
        <div className="form-field">
          <label htmlFor={id}>{field.label}{field.required && ' *'}</label>
          {field.helpText && <p className="help-text">{field.helpText}</p>}
          <select
            id={id}
            value={String(value ?? '')}
            required={field.required}
            onChange={(e) => handleChange(e.target.value)}
          >
            <option value="">Select…</option>
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      );

    case 'DATE':
      return (
        <div className="form-field">
          <label htmlFor={id}>{field.label}{field.required && ' *'}</label>
          {field.helpText && <p className="help-text">{field.helpText}</p>}
          <input
            id={id}
            type="date"
            value={String(value ?? '')}
            required={field.required}
            onChange={(e) => handleChange(e.target.value)}
          />
        </div>
      );

    case 'DIVIDER_HEADING':
      return <h3 className="form-divider">{field.label}</h3>;

    case 'TEXT':
    case 'EMAIL':
    case 'PHONE':
    default:
      return (
        <div className="form-field">
          <label htmlFor={id}>{field.label}{field.required && ' *'}</label>
          {field.helpText && <p className="help-text">{field.helpText}</p>}
          <input
            id={id}
            type={field.type === 'EMAIL' ? 'email' : field.type === 'PHONE' ? 'tel' : 'text'}
            placeholder={field.placeholder}
            value={String(value ?? '')}
            required={field.required}
            pattern={field.validation?.pattern}
            onChange={(e) => handleChange(e.target.value)}
          />
        </div>
      );
  }
}

// ─── Runtime form ─────────────────────────────────────────────────────────────

export interface RuntimeFormProps {
  definition: FormDefinitionBody;
  initialValues?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => void | Promise<void>;
  submitting?: boolean;
}

/**
 * Universal form renderer driven entirely by a FormDefinitionBody.
 * No hand-written fields. Add a field in the Form Builder → it appears here.
 */
export function RuntimeForm({ definition, initialValues = {}, onSubmit, submitting }: RuntimeFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>(initialValues);

  const handleChange = (id: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void onSubmit(values);
  };

  const visibleFields = definition.fields.filter((field) => {
    if (!field.conditions || field.conditions.length === 0) return true;
    return FormEngine.isFieldVisible(
      { ...field, conditions: field.conditions } as Parameters<typeof FormEngine.isFieldVisible>[0],
      values,
    );
  });

  return (
    <form onSubmit={handleSubmit} className="runtime-form">
      {definition.description && (
        <p className="form-description">{definition.description}</p>
      )}

      {visibleFields.map((field) => (
        <FieldRenderer
          key={field.id}
          field={field}
          value={values[field.id]}
          onChange={handleChange}
        />
      ))}

      <button type="submit" disabled={submitting} className="form-submit">
        {submitting ? 'Saving…' : (definition.submitButtonText ?? 'Submit')}
      </button>
    </form>
  );
}
