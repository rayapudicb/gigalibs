import type { ConfigurationDefinition, ConfigurationField } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import {
  classifyConfigurationImpact,
  compareConfigurationDefinitions,
  compileConfiguration,
  validateConfigurationValues,
} from './index.js';

const textField: ConfigurationField = {
  key: 'reference-code',
  label: 'Reference code',
  type: 'TEXT',
  component: 'text-input',
  required: false,
  readOnly: false,
  classification: 'INTERNAL',
  minLength: 2,
  maxLength: 20,
};

const baselineSection: ConfigurationDefinition['sections'][number] = {
  key: 'record-details',
  title: 'Record details',
  columns: 1,
  fieldKeys: [textField.key],
};

const baseline: ConfigurationDefinition = {
  contractVersion: '1.0',
  moduleKey: 'tenant-apps',
  entityKey: 'compatibility-record',
  surfaceKey: 'custom-form',
  mode: 'EDIT',
  title: 'Compatibility record',
  fields: [textField],
  sections: [baselineSection],
  listView: {
    columnKeys: [textField.key],
    defaultSortKey: textField.key,
    defaultSortDirection: 'ASC',
    searchableFieldKeys: [textField.key],
  },
};

function replaceField(patch: Partial<ConfigurationField>): ConfigurationDefinition {
  return { ...baseline, fields: [{ ...textField, ...patch }] };
}

function classify(target: ConfigurationDefinition) {
  const changes = compareConfigurationDefinitions(baseline, target);
  return { changes, classification: classifyConfigurationImpact(changes) };
}

describe('configuration compatibility policy', () => {
  it('keeps optional additions and label/layout-only edits compatible', () => {
    const optionalField: ConfigurationField = {
      ...textField,
      key: 'optional-note',
      label: 'Optional note',
    };
    const target: ConfigurationDefinition = {
      ...baseline,
      title: 'Renamed compatibility record',
      fields: [{ ...textField, label: 'Customer reference' }, optionalField],
      sections: [
        {
          ...baselineSection,
          title: 'Rearranged record details',
          columns: 2,
          fieldKeys: [optionalField.key, textField.key],
        },
      ],
    };

    const result = classify(target);
    expect(result.classification).toBe('COMPATIBLE');
    expect(result.changes).toEqual([
      expect.objectContaining({
        fieldKey: optionalField.key,
        kind: 'FIELD_ADDED',
        severity: 'SAFE',
      }),
    ]);
  });

  it('keeps required additions conditional even when a default exists', () => {
    const requiredField: ConfigurationField = {
      ...textField,
      key: 'required-code',
      label: 'Required code',
      required: true,
      defaultValue: 'pending-backfill',
    };
    const target: ConfigurationDefinition = {
      ...baseline,
      fields: [...baseline.fields, requiredField],
      sections: [
        {
          ...baselineSection,
          fieldKeys: [...baselineSection.fieldKeys, requiredField.key],
        },
      ],
    };

    const result = classify(target);
    expect(result.classification).toBe('CONDITIONAL');
    expect(result.changes).toContainEqual(
      expect.objectContaining({ kind: 'FIELD_ADDED', severity: 'CONDITIONAL' }),
    );
  });

  it('does not treat JSON object key ordering as a projection change', () => {
    const target: ConfigurationDefinition = {
      ...baseline,
      listView: {
        searchableFieldKeys: [textField.key],
        defaultSortDirection: 'ASC',
        defaultSortKey: textField.key,
        columnKeys: [textField.key],
      },
    };

    const result = classify(target);
    expect(result.classification).toBe('COMPATIBLE');
    expect(result.changes).toEqual([]);
  });

  it.each([
    {
      name: 'requiredness is added',
      target: replaceField({ required: true }),
      kind: 'REQUIRED_ADDED',
    },
    {
      name: 'validation is tightened',
      target: replaceField({ minLength: 4, maxLength: 10 }),
      kind: 'CONSTRAINT_TIGHTENED',
    },
    {
      name: 'field access is reduced',
      target: replaceField({ readPermission: 'configuration-apps:read' }),
      kind: 'PERMISSION_REDUCED',
    },
    {
      name: 'the list projection changes',
      target: { ...baseline, listView: undefined },
      kind: 'PROJECTION_CHANGED',
    },
  ])('classifies $name as conditional', ({ target, kind }) => {
    const result = classify(target);
    expect(result.classification).toBe('CONDITIONAL');
    expect(result.changes).toContainEqual(
      expect.objectContaining({ kind, severity: 'CONDITIONAL' }),
    );
  });

  it.each([
    {
      name: 'field type changes',
      target: replaceField({ type: 'INTEGER', component: 'number-input' }),
      kind: 'TYPE_CHANGED',
    },
    {
      name: 'requiredness is relaxed',
      target: replaceField({ required: false }),
      comparisonBaseline: replaceField({ required: true }),
      kind: 'REQUIRED_REMOVED',
    },
    {
      name: 'validation is relaxed',
      target: replaceField({ minLength: 1, maxLength: 30 }),
      kind: 'CONSTRAINT_RELAXED',
    },
    {
      name: 'field access is broadened',
      target: replaceField({ readPermission: undefined }),
      comparisonBaseline: replaceField({ readPermission: 'configuration-apps:read' }),
      kind: 'PERMISSION_BROADENED',
    },
  ])('classifies $name as breaking', ({ target, comparisonBaseline, kind }) => {
    const changes = compareConfigurationDefinitions(comparisonBaseline ?? baseline, target);
    expect(classifyConfigurationImpact(changes)).toBe('BREAKING');
    expect(changes).toContainEqual(expect.objectContaining({ kind, severity: 'BREAKING' }));
  });

  it('treats a key change as a breaking removal plus a new field', () => {
    const replacement = { ...textField, key: 'replacement-code' };
    const target: ConfigurationDefinition = {
      ...baseline,
      fields: [replacement],
      sections: [{ ...baselineSection, fieldKeys: [replacement.key] }],
      listView: undefined,
    };
    const changes = compareConfigurationDefinitions(baseline, target);

    expect(classifyConfigurationImpact(changes)).toBe('BREAKING');
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'FIELD_REMOVED', severity: 'BREAKING' }),
        expect.objectContaining({ kind: 'FIELD_ADDED', severity: 'SAFE' }),
      ]),
    );
  });

  it('requires a record-aware checkpoint for option removal and rejects a used value', () => {
    const optionField: ConfigurationField = {
      ...textField,
      key: 'record-status',
      label: 'Record status',
      type: 'SELECT',
      component: 'select',
      minLength: undefined,
      maxLength: undefined,
      options: [
        { value: 'open', label: 'Open' },
        { value: 'closed', label: 'Closed' },
      ],
    };
    const optionBaseline: ConfigurationDefinition = {
      ...baseline,
      fields: [optionField],
      sections: [{ ...baselineSection, fieldKeys: [optionField.key] }],
      listView: undefined,
    };
    const target: ConfigurationDefinition = {
      ...optionBaseline,
      fields: [
        {
          ...optionField,
          options: [{ value: 'closed', label: 'Closed' }],
        },
      ],
    };
    const changes = compareConfigurationDefinitions(optionBaseline, target);
    const compiledTarget = compileConfiguration(target).manifest;
    expect(compiledTarget).toBeDefined();
    if (!compiledTarget) throw new Error('Expected the option-removal target to compile.');

    expect(classifyConfigurationImpact(changes)).toBe('CONDITIONAL');
    expect(changes).toContainEqual(
      expect.objectContaining({ kind: 'OPTIONS_REMOVED', severity: 'CONDITIONAL' }),
    );
    expect(validateConfigurationValues(compiledTarget, { 'record-status': 'open' })).toEqual({
      'record-status': 'Must be a supported option.',
    });
  });
});
