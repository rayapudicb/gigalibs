import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ConnectorProfileService } from './connector-profile.service.js';
import { JsonSchemaService } from './json-schema.service.js';

const invoiceSchema = {
  type: 'object',
  properties: {
    invoiceId: { type: 'string', minLength: 1 },
    amountMinor: { type: 'integer', minimum: 0 },
    currency: { type: 'string', pattern: '^[A-Z]{3}$' },
  },
  required: ['invoiceId', 'amountMinor', 'currency'],
  additionalProperties: false,
};

describe('JsonSchemaService', () => {
  const service = new JsonSchemaService();

  it('accepts its supported production subset and validates payloads', () => {
    expect(() => service.validateDefinition(invoiceSchema)).not.toThrow();
    expect(
      service.validatePayload(invoiceSchema, {
        invoiceId: 'invoice-1',
        amountMinor: 100,
        currency: 'USD',
      }),
    ).toEqual([]);
    expect(
      service
        .validatePayload(invoiceSchema, {
          invoiceId: '',
          amountMinor: -1,
          currency: 'usd',
          uncontracted: true,
        })
        .map((issue) => issue.code),
    ).toEqual(['MIN_LENGTH', 'MINIMUM', 'PATTERN', 'ADDITIONAL_PROPERTY']);
  });

  it('fails closed for unsupported schema behavior', () => {
    expect(() =>
      service.validateDefinition({
        type: 'object',
        properties: { supplier: { $ref: '#/$defs/supplier' } },
        required: [],
        additionalProperties: false,
      }),
    ).toThrow(BadRequestException);
  });

  it('blocks a backward-incompatible required field', () => {
    const next = {
      ...invoiceSchema,
      properties: { ...invoiceSchema.properties, purchaseOrderId: { type: 'string' } },
      required: [...invoiceSchema.required, 'purchaseOrderId'],
    };
    const report = service.compatibility(invoiceSchema, next, 'BACKWARD');
    expect(report.compatible).toBe(false);
    expect(report.issues[0]?.code).toBe('BACKWARD_REQUIRED_ADDED');
  });
});

describe('ConnectorProfileService', () => {
  it('infers a deterministic schema while masking classified sample fields', () => {
    const service = new ConnectorProfileService(new JsonSchemaService());
    const profile = service.profile(
      [
        { invoiceId: 'invoice-1', supplierEmail: 'person@example.test', amountMinor: 100 },
        { invoiceId: 'invoice-2', supplierEmail: 'other@example.test', amountMinor: 200 },
      ],
      100,
    );
    expect(profile.schema).toMatchObject({
      type: 'object',
      required: ['amountMinor', 'invoiceId', 'supplierEmail'],
    });
    expect(profile.maskedSample).toEqual([
      { invoiceId: 'invoice-1', supplierEmail: '[REDACTED]', amountMinor: 100 },
      { invoiceId: 'invoice-2', supplierEmail: '[REDACTED]', amountMinor: 200 },
    ]);
    expect(profile.classification.maskedFieldCount).toBe(1);
  });
});
