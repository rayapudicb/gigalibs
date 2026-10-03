import type { ConfigurationDefinition, ConfigurationField } from '@gigalibs/contracts';
import { evaluateConfigurationCondition } from '@gigalibs/configuration-core/condition';
import { maskConfigurationValue, type MaskingPolicy } from '@gigalibs/configuration-core/format';
import type { ChangeEvent, ReactNode } from 'react';
import { FormEngineConfigurationForm } from './formengine.js';


export type ConfigurationValue = string | number | boolean | null | string[];
export type ConfigurationValues = Record<string, ConfigurationValue>;

export interface ConfigurationFormProps {
  definition: ConfigurationDefinition;
  values: ConfigurationValues;
  errors?: Record<string, string> | undefined;
  disabled?: boolean | undefined;
  onChange: (values: ConfigurationValues) => void;
}


export function ConfigurationForm({
  definition,
  values,
  errors = {},
  disabled = false,
  onChange,
}: ConfigurationFormProps) {
  const fields = new Map(definition.fields.map((field) => [field.key, field]));
  const setValue = (key: string, value: ConfigurationValue) =>
    onChange({ ...values, [key]: value });

  return (
    <div
      className="space-y-6"
      data-configuration-surface={`${definition.moduleKey}/${definition.entityKey}/${definition.surfaceKey}`}
    >
      {definition.sections.map((section) => (
        <section
          key={section.key}
          className="rounded-xl border border-ui-border-base bg-ui-bg-base p-5 shadow-xs"
        >
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-ui-fg-base">{section.title}</h3>
            {section.description ? (
              <p className="mt-1 text-xs text-ui-fg-subtle">{section.description}</p>
            ) : null}
          </div>
          <div
            className={`grid gap-4 ${section.columns === 3 ? 'md:grid-cols-3' : section.columns === 2 ? 'md:grid-cols-2' : 'grid-cols-1'}`}
          >
            {section.fieldKeys.map((key) => {
              const field = fields.get(key);
              if (!field) return null;
              if (field.visibleWhen && !evaluateConfigurationCondition(field.visibleWhen, values))
                return null;
              const required =
                field.required ||
                Boolean(
                  field.requiredWhen && evaluateConfigurationCondition(field.requiredWhen, values),
                );
              return (
                <FieldControl
                  key={field.key}
                  field={field}
                  value={values[field.key] ?? defaultValue(field)}
                  {...(errors[field.key] ? { error: errors[field.key] } : {})}
                  disabled={disabled || field.readOnly}
                  required={required}
                  onChange={(value) => setValue(field.key, value)}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function FieldControl({
  field,
  value,
  error,
  disabled,
  required,
  onChange,
}: {
  field: ConfigurationField;
  value: ConfigurationValue;
  error?: string;
  disabled: boolean;
  required: boolean;
  onChange: (value: ConfigurationValue) => void;
}) {
  const id = `configuration-${field.key}`;
  const describedBy =
    [field.helpText ? `${id}-help` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') ||
    undefined;
  const shared = {
    id,
    name: field.key,
    disabled,
    required,
    'aria-invalid': Boolean(error),
    'aria-describedby': describedBy,
    className: `w-full rounded-lg border px-3 py-2 text-sm outline-none transition ${error ? 'border-ui-tag-red-border focus:ring-2 focus:ring-ui-tag-red-border' : 'border-ui-border-base focus:border-ui-border-interactive focus:ring-2 focus:ring-ui-border-interactive'}`,
  };

  let control: ReactNode;
  if (field.component === 'textarea') {
    control = (
      <textarea
        {...shared}
        rows={4}
        minLength={field.minLength}
        maxLength={field.maxLength}
        value={stringValue(value)}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  } else if (field.component === 'checkbox') {
    control = (
      <input
        {...shared}
        className="h-4 w-4 rounded border-ui-border-base"
        type="checkbox"
        checked={value === true}
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  } else if (field.component === 'select') {
    control = (
      <select
        {...shared}
        value={stringValue(value)}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select…</option>
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  } else if (field.component === 'multi-select') {
    const selected = Array.isArray(value) ? value : [];
    control = (
      <select
        {...shared}
        multiple
        value={selected}
        onChange={(event) =>
          onChange(Array.from(event.target.selectedOptions, (option) => option.value))
        }
      >
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  } else {
    const type = inputType(field);
    control = (
      <input
        {...shared}
        type={type}
        min={field.minimum}
        max={field.maximum}
        minLength={field.minLength}
        maxLength={field.maxLength}
        value={scalarValue(value)}
        onChange={(event) => onChange(parseInput(field, event))}
      />
    );
  }

  return (
    <div className={field.component === 'checkbox' ? 'flex items-start gap-3' : 'space-y-1.5'}>
      {field.component === 'checkbox' ? control : null}
      <div className={field.component === 'checkbox' ? 'space-y-1' : ''}>
        <label htmlFor={id} className="block text-xs font-medium text-ui-fg-base">
          {field.label}
          {required ? (
            <span aria-hidden="true" className="ml-1 text-ui-fg-error">
              *
            </span>
          ) : null}
        </label>
        {field.helpText ? (
          <p id={`${id}-help`} className="text-xs text-ui-fg-muted">
            {field.helpText}
          </p>
        ) : null}
      </div>
      {field.component !== 'checkbox' ? control : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-ui-fg-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function defaultValue(field: ConfigurationField): ConfigurationValue {
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.component === 'checkbox') return false;
  if (field.component === 'multi-select') return [];
  return '';
}

function inputType(field: ConfigurationField): string {
  if (field.type === 'NUMBER' || field.type === 'INTEGER' || field.type === 'CURRENCY')
    return 'number';
  if (field.type === 'DATE') return 'date';
  if (field.type === 'DATETIME') return 'datetime-local';
  if (field.type === 'EMAIL') return 'email';
  if (field.type === 'PHONE') return 'tel';
  if (field.type === 'URL') return 'url';
  return 'text';
}

function parseInput(
  field: ConfigurationField,
  event: ChangeEvent<HTMLInputElement>,
): ConfigurationValue {
  if (field.type === 'NUMBER' || field.type === 'CURRENCY')
    return event.target.value === '' ? '' : Number(event.target.value);
  if (field.type === 'INTEGER')
    return event.target.value === '' ? '' : Number.parseInt(event.target.value, 10);
  return event.target.value;
}

function scalarValue(value: ConfigurationValue): string | number {
  return typeof value === 'number' || typeof value === 'string' ? value : '';
}

function stringValue(value: ConfigurationValue): string {
  return typeof value === 'string' ? value : '';
}

export interface ConfigurationDetailViewProps {
  definition: ConfigurationDefinition;
  values: ConfigurationValues;
  maskPolicy?: MaskingPolicy | undefined;
  locale?: string | undefined;
  currency?: string | undefined;
}

/**
 * Always pass `locale` and `currency` from the active tenant context.
 * The 'en-US' / 'USD' defaults are provided for development convenience only
 * and will produce incorrect output for non-US tenants.
 */
export function ConfigurationDetailView({
  definition,
  values,
  maskPolicy,
  locale = 'en-US', // pass tenant locale
  currency = 'USD', // pass tenant currency
}: ConfigurationDetailViewProps) {
  const fields = new Map(definition.fields.map((field) => [field.key, field]));

  return (
    <div
      className="space-y-6"
      data-configuration-surface={`${definition.moduleKey}/${definition.entityKey}/${definition.surfaceKey}`}
      data-configuration-mode="READ"
    >
      {definition.sections.map((section) => (
        <section
          key={section.key}
          className="rounded-xl border border-ui-border-base bg-ui-bg-base p-5 shadow-xs"
        >
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-ui-fg-base">{section.title}</h3>
            {section.description ? (
              <p className="mt-1 text-xs text-ui-fg-subtle">{section.description}</p>
            ) : null}
          </div>
          <dl
            className={`grid gap-5 ${
              section.columns === 3
                ? 'md:grid-cols-3'
                : section.columns === 2
                ? 'md:grid-cols-2'
                : 'grid-cols-1'
            }`}
          >
            {section.fieldKeys.map((key) => {
              const field = fields.get(key);
              if (!field) return null;
              if (
                field.visibleWhen &&
                !evaluateConfigurationCondition(field.visibleWhen, values)
              )
                return null;
              const rawValue = values[field.key];
              const formatted = maskConfigurationValue(field, rawValue, {
                maskPolicy,
                locale,
                currency,
              });

              return (
                <div key={field.key} className="space-y-1">
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-ui-fg-muted">
                    <span>{field.label}</span>
                    {field.classification && field.classification !== 'INTERNAL' && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          field.classification === 'RESTRICTED'
                            ? 'bg-ui-tag-red-bg text-ui-tag-red-text border border-ui-tag-red-border'
                            : field.classification === 'CONFIDENTIAL'
                            ? 'bg-ui-tag-orange-bg text-ui-tag-orange-text border border-ui-tag-orange-border'
                            : 'bg-ui-bg-subtle text-ui-fg-muted border border-ui-border-base'
                        }`}
                      >
                        {field.classification}
                      </span>
                    )}
                  </dt>
                  <dd className="text-sm font-medium text-ui-fg-base break-words">
                    {field.type === 'BOOLEAN' ? (
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                          rawValue
                            ? 'bg-ui-tag-green-bg text-ui-tag-green-text border border-ui-tag-green-border'
                            : 'bg-ui-bg-subtle text-ui-fg-muted border border-ui-border-base'
                        }`}
                      >
                        {formatted}
                      </span>
                    ) : (
                      formatted
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}

export interface ConfigurationListViewProps {
  definition: ConfigurationDefinition;
  records: Array<ConfigurationValues & { id?: string; key?: string }>;
  selectedKey?: string | undefined;
  onSelect?: ((record: ConfigurationValues) => void) | undefined;
  maskPolicy?: MaskingPolicy | undefined;
  locale?: string | undefined;
  currency?: string | undefined;
  emptyMessage?: string | undefined;
}

/**
 * Always pass `locale` and `currency` from the active tenant context.
 * The 'en-US' / 'USD' defaults are provided for development convenience only
 * and will produce incorrect output for non-US tenants.
 */
export function ConfigurationListView({
  definition,
  records,
  selectedKey,
  onSelect,
  maskPolicy,
  locale = 'en-US', // pass tenant locale
  currency = 'USD', // pass tenant currency
  emptyMessage = 'No records found.',
}: ConfigurationListViewProps) {
  const placedFieldKeys = new Set(definition.sections.flatMap((s) => s.fieldKeys));
  const columns = definition.fields.filter((f) => placedFieldKeys.has(f.key));

  return (
    <div
      className="overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-base shadow-xs"
      data-configuration-surface={`${definition.moduleKey}/${definition.entityKey}/${definition.surfaceKey}`}
      data-configuration-mode="LIST"
    >
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-ui-border-base text-left text-sm">
          <thead className="bg-ui-bg-subtle text-xs font-semibold uppercase tracking-wider text-ui-fg-muted">
            <tr>
              {columns.map((col) => (
                <th key={col.key} scope="col" className="px-4 py-3 font-medium">
                  <div className="flex items-center gap-1.5">
                    <span>{col.label}</span>
                    {col.classification && col.classification !== 'INTERNAL' && (
                      <span className="text-[9px] text-ui-fg-subtle">({col.classification})</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ui-border-base text-ui-fg-base">
            {records.map((record, index) => {
              const rowKey = record.id || record.key || `row-${index}`;
              const isSelected = selectedKey === rowKey;
              return (
                <tr
                  key={rowKey}
                  onClick={() => onSelect?.(record)}
                  className={`transition-colors ${
                    onSelect ? 'cursor-pointer hover:bg-ui-bg-subtle' : ''
                  } ${isSelected ? 'bg-ui-bg-interactive text-ui-fg-interactive' : ''}`}
                >
                  {columns.map((col) => {
                    const rawValue = record[col.key];
                    const formatted = maskConfigurationValue(col, rawValue, {
                      maskPolicy,
                      locale,
                      currency,
                    });
                    return (
                      <td key={col.key} className="px-4 py-3 whitespace-nowrap text-sm">
                        {formatted}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {records.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length || 1}
                  className="px-6 py-8 text-center text-sm text-ui-fg-muted"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export interface ConfigurationRendererProps {
  definition: ConfigurationDefinition;
  values?: ConfigurationValues | undefined;
  records?: Array<ConfigurationValues & { id?: string; key?: string }> | undefined;
  errors?: Record<string, string> | undefined;
  disabled?: boolean | undefined;
  onChange?: ((values: ConfigurationValues) => void) | undefined;
  onSelect?: ((record: ConfigurationValues) => void) | undefined;
  selectedKey?: string | undefined;
  maskPolicy?: MaskingPolicy | undefined;
  locale?: string | undefined;
  currency?: string | undefined;
  formEngine?: boolean | undefined;
}


export function ConfigurationRenderer(props: ConfigurationRendererProps) {
  const {
    definition,
    values = {},
    records = [],
    errors,
    disabled,
    onChange,
    onSelect,
    selectedKey,
    maskPolicy,
    locale,
    currency,
    formEngine = false,
  } = props;

  if (definition.mode === 'READ') {
    return (
      <ConfigurationDetailView
        definition={definition}
        values={values}
        maskPolicy={maskPolicy}
        locale={locale}
        currency={currency}
      />
    );
  }

  if (definition.mode === 'LIST') {
    return (
      <ConfigurationListView
        definition={definition}
        records={records}
        selectedKey={selectedKey}
        onSelect={onSelect}
        maskPolicy={maskPolicy}
        locale={locale}
        currency={currency}
      />
    );
  }

  if (formEngine) {
    return (
      <FormEngineConfigurationForm
        definition={definition}
        values={values}
        errors={errors}
        disabled={disabled}
        onChange={onChange ?? (() => {})}
      />
    );
  }

  return (
    <ConfigurationForm
      definition={definition}
      values={values}
      errors={errors}
      disabled={disabled}
      onChange={onChange ?? (() => {})}
    />
  );
}

export {
  FormEngineConfigurationForm,
  toGigaFormEngineDocument,
  type FormEngineConfigurationFormProps,
  type GigaFormEngineComponent,
  type GigaFormEngineDocument,
} from './formengine.js';

export {
  DictionaryRenderer,
  evaluateDictionaryCondition,
  validateDictionaryRules,
  type DictionaryRendererProps,
} from './DictionaryRenderer.js';

