import { describe, it, expect } from 'vitest';
import { redactSensitiveData } from './data-redaction.js';

describe('data-redaction (Workflow Sensitive Data Masking)', () => {
  it('returns primitives and null/undefined unchanged', () => {
    expect(redactSensitiveData(null).sanitized).toBeNull();
    expect(redactSensitiveData(undefined).sanitized).toBeUndefined();
    expect(redactSensitiveData(12345).sanitized).toBe(12345);
    expect(redactSensitiveData('clean payload').sanitized).toBe('clean payload');
    expect(redactSensitiveData(false).sanitized).toBe(false);
  });

  it('leaves safe workflow state objects untouched', () => {
    const safeData = {
      order_id: 'ord-999',
      customer_id: 'cust-101',
      status: 'APPROVED',
      items_count: 5,
    };

    const { sanitized, redactedFields } = redactSensitiveData(safeData);
    expect(sanitized).toEqual(safeData);
    expect(redactedFields).toHaveLength(0);
  });

  it('redacts sensitive credentials, tokens, secrets, and auth headers', () => {
    const sensitiveData = {
      user: 'operator_1',
      password: 'mypassword',
      api_key: 'key_live_test_123',
      token: 'jwt.token.val',
      authorization: 'Bearer secret_auth',
      credit_card: '4111222233334444',
      cvv: '999',
      iban: 'GB29NWBK60161331926819',
      ssn: '123-45-6789',
    };

    const { sanitized, redactedFields } = redactSensitiveData(sensitiveData);

    expect(sanitized.user).toBe('operator_1');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.api_key).toBe('[REDACTED]');
    expect(sanitized.token).toBe('[REDACTED]');
    expect(sanitized.authorization).toBe('[REDACTED]');
    expect(sanitized.credit_card).toBe('[REDACTED]');
    expect(sanitized.cvv).toBe('[REDACTED]');
    expect(sanitized.iban).toBe('[REDACTED]');
    expect(sanitized.ssn).toBe('[REDACTED]');

    expect(redactedFields).toEqual(
      expect.arrayContaining([
        'password',
        'api_key',
        'token',
        'authorization',
        'credit_card',
        'cvv',
        'iban',
        'ssn',
      ]),
    );
  });

  it('recursively scrubs nested steps and arrays in pipeline execution state', () => {
    const pipelineData = {
      workflow_id: 'wf-100',
      nodes: [
        {
          id: 'step-1',
          config: {
            auth_token: 'step-token',
          },
        },
      ],
      output: {
        payment_gateway: {
          client_secret: 'shh_secret',
          amount: 500,
        },
      },
    };

    const { sanitized, redactedFields } = redactSensitiveData(pipelineData);

    expect(sanitized.workflow_id).toBe('wf-100');
    expect(sanitized.nodes[0].config.auth_token).toBe('[REDACTED]');
    expect(sanitized.output.payment_gateway.client_secret).toBe('[REDACTED]');
    expect(sanitized.output.payment_gateway.amount).toBe(500);

    expect(redactedFields).toContain('nodes[0].config.auth_token');
    expect(redactedFields).toContain('output.payment_gateway.client_secret');
  });
});
