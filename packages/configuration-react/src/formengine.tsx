import type { ConfigurationDefinition, ConfigurationField } from '@gigalibs/contracts';
import { evaluateConfigurationCondition } from '@gigalibs/configuration-core/condition';
import {
  array,
  boolean,
  createView,
  define,
  disabled as disabledAnnotation,
  event,
  FormViewerLite,
  node,
  number,
  readOnly as readOnlyAnnotation,
  required as requiredAnnotation,
  string,
  useAriaAttributes,
  useAriaErrorMessage,
  useComponentData,
  type ErrorWrapperProps,
  type IFormData,
} from '@react-form-builder/core';
import type { ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import type { ConfigurationValue, ConfigurationValues } from './index.js';

type FormEngineProperty = { value: unknown };

export type GigaFormEngineComponent = {
  key: string;
  type: string;
  props: Record<string, FormEngineProperty>;
  children?: GigaFormEngineComponent[];
  schema?: { autoValidate?: boolean; validations?: Array<{ key: string; args?: unknown }> };
};

export type GigaFormEngineDocument = {
  version: '1';
  errorType: 'GigaErrorMessage';
  form: GigaFormEngineComponent;
};

export interface FormEngineConfigurationFormProps {
  definition: ConfigurationDefinition;
  values: ConfigurationValues;
  errors?: Record<string, string> | undefined;
  disabled?: boolean | undefined;
  onChange: (values: ConfigurationValues) => void;
}

/**
 * Converts only the already compiled GigaLibs manifest to a FormEngine presentation document.
 * The result deliberately contains no actions, events, functions, expressions, URLs or code.
 */
export function toGigaFormEngineDocument(
  definition: ConfigurationDefinition,
  values: ConfigurationValues,
  formDisabled = false,
): GigaFormEngineDocument {
  const fields = new Map(definition.fields.map((field) => [field.key, field]));
  const sections: GigaFormEngineComponent[] = definition.sections.map((section) => ({
    key: `section-${section.key}`,
    type: 'GigaSection',
    props: properties({
      title: section.title,
      description: section.description ?? '',
      columns: section.columns,
    }),
    children: section.fieldKeys.flatMap((key) => {
      const field = fields.get(key);
      if (!field) return [];
      if (field.visibleWhen && !evaluateConfigurationCondition(field.visibleWhen, values)) return [];
      const required =
        field.required ||
        Boolean(field.requiredWhen && evaluateConfigurationCondition(field.requiredWhen, values));
      return [toFormEngineField(field, required, formDisabled)];
    }),
  }));

  return {
    version: '1',
    errorType: 'GigaErrorMessage',
    form: {
      key: 'Screen',
      type: 'GigaScreen',
      props: properties({}),
      children: sections,
    },
  };
}

/** Runtime adapter for the MIT FormEngine Core. Business validation and persistence remain server-owned. */
export function FormEngineConfigurationForm({
  definition,
  values,
  errors = {},
  disabled = false,
  onChange,
}: FormEngineConfigurationFormProps) {
  const document = useMemo(
    () => toGigaFormEngineDocument(definition, values, disabled),
    [definition, values, disabled],
  );
  const documentJson = useMemo(() => JSON.stringify(document), [document]);
  const conditionSignature = useMemo(
    () =>
      definition.fields
        .map((field) => {
          const visible = field.visibleWhen
            ? evaluateConfigurationCondition(field.visibleWhen, values)
            : true;
          const required =
            field.required ||
            Boolean(field.requiredWhen && evaluateConfigurationCondition(field.requiredWhen, values));
          return `${field.key}:${visible ? 1 : 0}:${required ? 1 : 0}`;
        })
        .join('|'),
    [definition.fields, values],
  );

  const handleDataChange = useCallback(
    (data: IFormData) => {
      const nextValues = normalizeFormEngineValues(definition, data.data);
      if (configurationValuesEqual(values, nextValues)) return;
      onChange(nextValues);
    },
    [definition, onChange, values],
  );

  return (
    <div
      data-configuration-engine="formengine-core"
      data-configuration-surface={`${definition.moduleKey}/${definition.entityKey}/${definition.surfaceKey}`}
    >
      <FormViewerLite
        view={gigaFormEngineView}
        formName={`${definition.moduleKey}/${definition.entityKey}/${definition.surfaceKey}/${conditionSignature}`}
        getForm={() => documentJson}
        initialData={values}
        errors={errors}
        disabled={disabled}
        onFormDataChange={handleDataChange}
        showAllValidationErrors={Object.keys(errors).length > 0}
      />
    </div>
  );
}

function toFormEngineField(
  field: ConfigurationField,
  required: boolean,
  formDisabled: boolean,
): GigaFormEngineComponent {
  const componentType =
    field.component === 'checkbox'
      ? 'GigaCheckbox'
      : field.component === 'select'
        ? 'GigaSelect'
        : field.component === 'multi-select'
          ? 'GigaMultiSelect'
          : field.component === 'textarea'
            ? 'GigaTextArea'
            : field.type === 'NUMBER' || field.type === 'INTEGER' || field.type === 'CURRENCY'
              ? 'GigaNumberInput'
              : 'GigaTextInput';

  return {
    key: field.key,
    type: componentType,
    props: properties({
      label: field.label,
      helpText: field.helpText ?? '',
      placeholder: '',
      required,
      disabled: formDisabled,
      readOnly: field.readOnly,
      inputType: inputType(field),
      minimum: field.minimum,
      maximum: field.maximum,
      minLength: field.minLength,
      maxLength: field.maxLength,
      options: field.options ?? [],
    }),
    ...(required
      ? { schema: { autoValidate: true, validations: [{ key: 'required' }] } }
      : {}),
  };
}

function properties(values: Record<string, unknown>): Record<string, FormEngineProperty> {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, { value }]),
  );
}

function normalizeFormEngineValues(
  definition: ConfigurationDefinition,
  rawValues: Record<string, unknown>,
): ConfigurationValues {
  const normalized: ConfigurationValues = {};
  for (const field of definition.fields) {
    const raw = rawValues[field.key];
    if (field.component === 'checkbox' || field.type === 'BOOLEAN') {
      normalized[field.key] = raw === true;
    } else if (field.component === 'multi-select') {
      normalized[field.key] = Array.isArray(raw)
        ? raw.filter((item): item is string => typeof item === 'string')
        : [];
    } else if (field.type === 'NUMBER' || field.type === 'CURRENCY') {
      normalized[field.key] = numericValue(raw, false);
    } else if (field.type === 'INTEGER') {
      normalized[field.key] = numericValue(raw, true);
    } else if (raw === null) {
      normalized[field.key] = null;
    } else {
      normalized[field.key] = typeof raw === 'string' ? raw : '';
    }
  }
  return normalized;
}

function numericValue(value: unknown, integer: boolean): ConfigurationValue {
  if (value === '' || value === null || value === undefined) return '';
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return '';
  return integer ? Math.trunc(parsed) : parsed;
}

function configurationValuesEqual(left: ConfigurationValues, right: ConfigurationValues): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => {
    const leftValue = left[key];
    const rightValue = right[key];
    if (Array.isArray(leftValue) && Array.isArray(rightValue)) {
      return leftValue.length === rightValue.length && leftValue.every((value, index) => value === rightValue[index]);
    }
    return leftValue === rightValue;
  });
}

type FieldFrameProps = {
  label: string;
  helpText?: string | undefined;
  required?: boolean | undefined;
  children: (input: { id: string; name: string; aria: ReturnType<typeof useAriaAttributes> }) => ReactNode;
};

function FieldFrame({ label, helpText, required, children }: FieldFrameProps) {
  const component = useComponentData();
  const id = component.id;
  const aria = useAriaAttributes({ labeled: true });
  return (
    <div className="space-y-1.5">
      <label id={aria['aria-labelledby']} htmlFor={id} className="block text-xs font-medium text-ui-fg-base">
        {label}
        {required ? <span aria-hidden="true" className="ml-1 text-ui-fg-error">*</span> : null}
      </label>
      {helpText ? <p className="text-xs text-ui-fg-muted">{helpText}</p> : null}
      {children({ id, name: String(component.store.key), aria })}
    </div>
  );
}

type TextInputProps = {
  label: string;
  helpText?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  inputType?: string;
  minLength?: number;
  maxLength?: number;
  value?: string;
  onChange?: (value: string) => void;
};

function GigaTextInput({ label, helpText, inputType = 'text', value = '', onChange, ...props }: TextInputProps) {
  return (
    <FieldFrame label={label} helpText={helpText} required={props.required}>
      {({ id, name, aria }) => (
        <input
          id={id}
          name={name}
          {...aria}
          type={inputType}
          value={value}
          onChange={(change) => onChange?.(change.target.value)}
          className="w-full rounded-lg border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm outline-none transition focus:border-ui-border-interactive focus:ring-2 focus:ring-ui-border-interactive"
          placeholder={props.placeholder}
          minLength={props.minLength}
          maxLength={props.maxLength}
          required={props.required}
          disabled={props.disabled}
          readOnly={props.readOnly}
        />
      )}
    </FieldFrame>
  );
}

type NumberInputProps = Omit<TextInputProps, 'value' | 'onChange'> & {
  minimum?: number;
  maximum?: number;
  value?: number | string;
  onChange?: (value: number | string) => void;
};

function GigaNumberInput({ label, helpText, value = '', onChange, minimum, maximum, ...props }: NumberInputProps) {
  return (
    <FieldFrame label={label} helpText={helpText} required={props.required}>
      {({ id, name, aria }) => (
        <input
          id={id}
          name={name}
          {...aria}
          type="number"
          value={value}
          onChange={(change) => onChange?.(change.target.value === '' ? '' : Number(change.target.value))}
          className="w-full rounded-lg border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm outline-none transition focus:border-ui-border-interactive focus:ring-2 focus:ring-ui-border-interactive"
          placeholder={props.placeholder}
          min={minimum}
          max={maximum}
          required={props.required}
          disabled={props.disabled}
          readOnly={props.readOnly}
        />
      )}
    </FieldFrame>
  );
}

type TextAreaProps = Omit<TextInputProps, 'inputType'>;

function GigaTextArea({ label, helpText, value = '', onChange, ...props }: TextAreaProps) {
  return (
    <FieldFrame label={label} helpText={helpText} required={props.required}>
      {({ id, name, aria }) => (
        <textarea
          id={id}
          name={name}
          {...aria}
          rows={4}
          value={value}
          onChange={(change) => onChange?.(change.target.value)}
          className="w-full rounded-lg border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm outline-none transition focus:border-ui-border-interactive focus:ring-2 focus:ring-ui-border-interactive"
          placeholder={props.placeholder}
          minLength={props.minLength}
          maxLength={props.maxLength}
          required={props.required}
          disabled={props.disabled}
          readOnly={props.readOnly}
        />
      )}
    </FieldFrame>
  );
}

type Option = { label: string; value: string };
type SelectProps = Omit<TextInputProps, 'inputType' | 'minLength' | 'maxLength'> & { options?: Option[] };

function GigaSelect({ label, helpText, value = '', onChange, options = [], ...props }: SelectProps) {
  return (
    <FieldFrame label={label} helpText={helpText} required={props.required}>
      {({ id, name, aria }) => (
        <select
          id={id}
          name={name}
          {...aria}
          value={value}
          onChange={(change) => onChange?.(change.target.value)}
          className="w-full rounded-lg border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm outline-none transition focus:border-ui-border-interactive focus:ring-2 focus:ring-ui-border-interactive"
          required={props.required}
          disabled={props.disabled || props.readOnly}
        >
          <option value="">Select…</option>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      )}
    </FieldFrame>
  );
}

type MultiSelectProps = Omit<SelectProps, 'value' | 'onChange'> & {
  value?: string[];
  onChange?: (value: string[]) => void;
};

function GigaMultiSelect({ label, helpText, value = [], onChange, options = [], ...props }: MultiSelectProps) {
  return (
    <FieldFrame label={label} helpText={helpText} required={props.required}>
      {({ id, name, aria }) => (
        <select
          id={id}
          name={name}
          {...aria}
          multiple
          value={value}
          onChange={(change) => onChange?.(Array.from(change.target.selectedOptions, (option) => option.value))}
          className="min-h-24 w-full rounded-lg border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm outline-none transition focus:border-ui-border-interactive focus:ring-2 focus:ring-ui-border-interactive"
          required={props.required}
          disabled={props.disabled || props.readOnly}
        >
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      )}
    </FieldFrame>
  );
}

type CheckboxProps = {
  label: string;
  helpText?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
};

function GigaCheckbox({ label, helpText, checked = false, onChange, required, disabled, readOnly }: CheckboxProps) {
  const component = useComponentData();
  const aria = useAriaAttributes({ labeled: true });
  return (
    <div className="flex items-start gap-3">
      <input
        id={component.id}
        name={String(component.store.key)}
        {...aria}
        className="mt-0.5 h-4 w-4 rounded border-ui-border-base"
        type="checkbox"
        checked={checked}
        onChange={(change) => onChange?.(change.target.checked)}
        required={required}
        disabled={disabled || readOnly}
      />
      <div className="space-y-1">
        <label id={aria['aria-labelledby']} htmlFor={component.id} className="block text-xs font-medium text-ui-fg-base">
          {label}{required ? <span aria-hidden="true" className="ml-1 text-ui-fg-error">*</span> : null}
        </label>
        {helpText ? <p className="text-xs text-ui-fg-muted">{helpText}</p> : null}
      </div>
    </div>
  );
}

function GigaScreen({ children }: { children?: ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}

function GigaSection({ children, title, description, columns = 1 }: { children?: ReactNode; title: string; description?: string; columns?: number }) {
  const gridClass = columns === 3 ? 'md:grid-cols-3' : columns === 2 ? 'md:grid-cols-2' : 'grid-cols-1';
  return (
    <section className="rounded-xl border border-ui-border-base bg-ui-bg-base p-5 shadow-xs">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-ui-fg-base">{title}</h3>
        {description ? <p className="mt-1 text-xs text-ui-fg-subtle">{description}</p> : null}
      </div>
      <div className={`grid gap-4 ${gridClass}`}>{children}</div>
    </section>
  );
}

function GigaErrorMessage({ error, children }: ErrorWrapperProps) {
  const aria = useAriaErrorMessage();
  return (
    <div>
      {children}
      {error ? <p id={aria['aria-errormessage']} role="alert" className="mt-1 text-xs text-ui-fg-error">{error}</p> : null}
    </div>
  );
}

const commonTextProperties = {
  label: string.default('Field'),
  helpText: string.default(''),
  placeholder: string.default(''),
  required: requiredAnnotation.default(false),
  disabled: disabledAnnotation.default(false),
  readOnly: readOnlyAnnotation.default(false),
};

const screenModel = define(GigaScreen, 'GigaScreen')
  .kind('container')
  .props({ children: node })
  .hideActionEditors()
  .build().model;
const sectionModel = define(GigaSection, 'GigaSection')
  .kind('container')
  .props({ children: node, title: string, description: string, columns: number })
  .hideActionEditors()
  .build().model;
const textInputModel = define(GigaTextInput, 'GigaTextInput')
  .props({ ...commonTextProperties, inputType: string.default('text'), minLength: number, maxLength: number, value: string.valued.uncontrolledValue(''), onChange: event })
  .hideActionEditors()
  .build().model;
const numberInputModel = define(GigaNumberInput, 'GigaNumberInput')
  .props({ ...commonTextProperties, inputType: string.default('number'), minimum: number, maximum: number, value: number.valued, onChange: event })
  .hideActionEditors()
  .build().model;
const textAreaModel = define(GigaTextArea, 'GigaTextArea')
  .props({ ...commonTextProperties, minLength: number, maxLength: number, value: string.valued.uncontrolledValue(''), onChange: event })
  .hideActionEditors()
  .build().model;
const selectModel = define(GigaSelect, 'GigaSelect')
  .props({ ...commonTextProperties, options: array.default([]), value: string.valued.uncontrolledValue(''), onChange: event })
  .hideActionEditors()
  .build().model;
const multiSelectModel = define(GigaMultiSelect, 'GigaMultiSelect')
  .props({ ...commonTextProperties, options: array.default([]), value: array.valued.ofString, onChange: event })
  .hideActionEditors()
  .build().model;
const checkboxModel = define(GigaCheckbox, 'GigaCheckbox')
  .props({ label: string.default('Field'), helpText: string.default(''), required: requiredAnnotation.default(false), disabled: disabledAnnotation.default(false), readOnly: readOnlyAnnotation.default(false), checked: boolean.valued.uncontrolledValue(false), onChange: event })
  .hideActionEditors()
  .build().model;
const errorModel = define(GigaErrorMessage, 'GigaErrorMessage')
  .componentRole('error-message')
  .hideFromComponentPalette()
  .hideActionEditors()
  .build().model;

const gigaFormEngineView = createView([
  screenModel,
  sectionModel,
  textInputModel,
  numberInputModel,
  textAreaModel,
  selectModel,
  multiSelectModel,
  checkboxModel,
  errorModel,
]);

function inputType(field: ConfigurationField): string {
  if (field.type === 'DATE') return 'date';
  if (field.type === 'DATETIME') return 'datetime-local';
  if (field.type === 'EMAIL') return 'email';
  if (field.type === 'PHONE') return 'tel';
  if (field.type === 'URL') return 'url';
  return 'text';
}
