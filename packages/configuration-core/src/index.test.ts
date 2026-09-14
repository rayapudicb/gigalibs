import { describe, expect, it } from 'vitest';
import {
  compileConfiguration,
  evaluateConfigurationCondition,
  validateConfigurationValues,
} from './index.js';

const definition = {
  contractVersion: '1.0',
  moduleKey: 'tenant-settings',
  entityKey: 'tenant-profile',
  surfaceKey: 'profile-extension',
  mode: 'EDIT',
  title: 'Profile extensions',
  fields: [
    {
      key: 'industry-code',
      label: 'Industry code',
      type: 'TEXT',
      component: 'text-input',
      required: true,
      readOnly: false,
      classification: 'INTERNAL',
      maxLength: 20,
    },
  ],
  sections: [{ key: 'business', title: 'Business', columns: 1, fieldKeys: ['industry-code'] }],
};

describe('configuration compiler', () => {
  it('produces a deterministic checksum', () => {
    const first = compileConfiguration(definition);
    const second = compileConfiguration(JSON.parse(JSON.stringify(definition)));
    expect(first.valid).toBe(true);
    expect(first.manifest?.checksum).toBe(second.manifest?.checksum);
  });

  it('rejects locked, duplicate and unplaced fields', () => {
    const result = compileConfiguration({
      ...definition,
      fields: [{ ...definition.fields[0], key: 'status' }],
      sections: [],
    });
    expect(result.valid).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(['LOCKED_FIELD_KEY', 'UNPLACED_FIELD']),
    );
  });

  it('keeps domain reservations outside the universal compiler', () => {
    const portable = compileConfiguration({
      ...definition,
      fields: [{ ...definition.fields[0], key: 'currency' }],
      sections: [{ ...definition.sections[0], fieldKeys: ['currency'] }],
    });
    expect(portable.valid).toBe(true);
    const domainOwned = compileConfiguration(definition, { reservedFieldKeys: ['industry-code'] });
    expect(domainOwned.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'LOCKED_FIELD_KEY' })]),
    );
  });

  it('rejects unknown values and validates required values', () => {
    const compiled = compileConfiguration(definition).manifest!;
    expect(validateConfigurationValues(compiled, {})).toEqual({
      'industry-code': 'Field is required.',
    });
    expect(
      validateConfigurationValues(compiled, { 'industry-code': 'MFG', injected: true }),
    ).toEqual({ injected: 'Unknown field.' });
  });

  it('rejects contradictory read-only field authority', () => {
    const result = compileConfiguration({
      ...definition,
      fields: [
        { ...definition.fields[0], readOnly: true, writePermission: 'configuration-apps:write' },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'READ_ONLY_WRITE_PERMISSION' })]),
    );
  });

  it('requires explicit field authority for sensitive values', () => {
    const result = compileConfiguration({
      ...definition,
      fields: [{ ...definition.fields[0], classification: 'RESTRICTED' }],
    });
    expect(result.valid).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        'SENSITIVE_READ_PERMISSION_REQUIRED',
        'SENSITIVE_WRITE_PERMISSION_REQUIRED',
      ]),
    );
  });

  it('rejects credential-like fields and sensitive metadata defaults', () => {
    const secret = compileConfiguration({
      ...definition,
      fields: [{ ...definition.fields[0], key: 'api-token' }],
      sections: [{ ...definition.sections[0], fieldKeys: ['api-token'] }],
    });
    expect(secret.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'SECRET_FIELD_PROHIBITED' })]),
    );
    const sensitiveDefault = compileConfiguration({
      ...definition,
      fields: [
        {
          ...definition.fields[0],
          classification: 'CONFIDENTIAL',
          readPermission: 'configuration-sensitive:read',
          writePermission: 'configuration-sensitive:write',
          defaultValue: 'do-not-store',
        },
      ],
    });
    expect(sensitiveDefault.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'SENSITIVE_DEFAULT_PROHIBITED' })]),
    );
  });

  it('fails closed for unknown properties and oversized definitions', () => {
    const unknown = compileConfiguration({
      ...definition,
      executableScript: 'fetch("https://example.test")',
    });
    expect(unknown.valid).toBe(false);
    expect(unknown.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'SCHEMA_INVALID' })]),
    );
    const fields = Array.from({ length: 201 }, (_, index) => ({
      ...definition.fields[0],
      key: `field-${index}`,
    }));
    const oversized = compileConfiguration({
      ...definition,
      fields,
      sections: [
        { ...definition.sections[0], fieldKeys: fields.slice(0, 100).map((field) => field.key) },
      ],
    });
    expect(oversized.valid).toBe(false);
    expect(oversized.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'SCHEMA_INVALID' })]),
    );
  });

  it('enforces conditional visibility and requiredness with the same evaluator', () => {
    const conditional = {
      ...definition,
      fields: [
        { ...definition.fields[0], required: false },
        {
          ...definition.fields[0],
          key: 'registration-number',
          label: 'Registration number',
          required: false,
          visibleWhen: {
            kind: 'PREDICATE',
            fieldKey: 'industry-code',
            operator: 'EQUALS',
            value: 'MFG',
          },
          requiredWhen: {
            kind: 'PREDICATE',
            fieldKey: 'industry-code',
            operator: 'EQUALS',
            value: 'MFG',
          },
        },
      ],
      sections: [
        { ...definition.sections[0], fieldKeys: ['industry-code', 'registration-number'] },
      ],
    };
    const compiled = compileConfiguration(conditional).manifest!;
    expect(
      evaluateConfigurationCondition(compiled.fields[1]!.visibleWhen!, { 'industry-code': 'MFG' }),
    ).toBe(true);
    expect(validateConfigurationValues(compiled, { 'industry-code': 'SERVICES' })).toEqual({});
    expect(validateConfigurationValues(compiled, { 'industry-code': 'MFG' })).toEqual({
      'registration-number': 'Field is required.',
    });
  });

  it('rejects unknown, self-referential, cyclic, incompatible and oversized conditions', () => {
    const conditioned = {
      ...definition,
      fields: [
        {
          ...definition.fields[0],
          visibleWhen: {
            kind: 'PREDICATE',
            fieldKey: 'second-field',
            operator: 'GREATER_THAN',
            value: 'wrong',
          },
        },
        {
          ...definition.fields[0],
          key: 'second-field',
          visibleWhen: {
            kind: 'PREDICATE',
            fieldKey: 'industry-code',
            operator: 'EQUALS',
            value: 'MFG',
          },
        },
        {
          ...definition.fields[0],
          key: 'third-field',
          visibleWhen: {
            kind: 'PREDICATE',
            fieldKey: 'missing-field',
            operator: 'EQUALS',
            value: 'x',
          },
        },
        {
          ...definition.fields[0],
          key: 'self-field',
          visibleWhen: {
            kind: 'PREDICATE',
            fieldKey: 'self-field',
            operator: 'EQUALS',
            value: 'x',
          },
        },
      ],
      sections: [
        {
          ...definition.sections[0],
          fieldKeys: ['industry-code', 'second-field', 'third-field', 'self-field'],
        },
      ],
    };
    const result = compileConfiguration(conditioned);
    expect(result.valid).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        'CONDITION_TYPE_MISMATCH',
        'CONDITION_CYCLE',
        'UNKNOWN_CONDITION_FIELD',
        'SELF_REFERENTIAL_CONDITION',
      ]),
    );
  });

  it('correctly masks and formats values according to classification and options', async () => {
    const { maskConfigurationValue } = await import('./index.js');
    const textField = {
      key: 'tax-id',
      label: 'Taxpayer ID',
      type: 'TEXT' as const,
      component: 'text-input' as const,
      required: true,
      readOnly: false,
      classification: 'RESTRICTED' as const,
    };
    expect(maskConfigurationValue(textField, '12-3456789')).toBe('•••• 6789');
    expect(maskConfigurationValue(textField, '12-3456789', { maskPolicy: 'REDACTED' })).toBe(
      '••••••••',
    );
    expect(maskConfigurationValue(textField, '12-3456789', { maskPolicy: 'NONE' })).toBe(
      '12-3456789',
    );

    const currField = {
      key: 'revenue',
      label: 'Annual Revenue',
      type: 'CURRENCY' as const,
      component: 'number-input' as const,
      required: false,
      readOnly: false,
      classification: 'CONFIDENTIAL' as const,
    };
    expect(
      maskConfigurationValue(currField, 1500000, { currency: 'USD', locale: 'en-US' }),
    ).toContain('00');

    const boolField = {
      key: 'is-active',
      label: 'Active status',
      type: 'BOOLEAN' as const,
      component: 'checkbox' as const,
      required: false,
      readOnly: false,
      classification: 'PUBLIC' as const,
    };
    expect(maskConfigurationValue(boolField, true)).toBe('Yes');
    expect(maskConfigurationValue(boolField, false)).toBe('No');
    expect(maskConfigurationValue(boolField, null)).toBe('—');
  });
});
