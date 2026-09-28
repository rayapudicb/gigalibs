import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RowValidatorService } from '../row-validator.js';
import { FkResolverService } from '../fk-resolver.js';
import { classifyHeaders } from '../column-classifier.js';

const mockDb = { queryWithTenant: vi.fn() };

describe('RowValidatorService', () => {
  let fkResolver: FkResolverService;
  let service: RowValidatorService;

  beforeEach(() => {
    fkResolver = new FkResolverService(mockDb as never);
    service = new RowValidatorService(fkResolver);
  });

  it('validates a valid asset row', () => {
    const headers = ['name', 'asset_tag', 'status'];
    const { classifications } = classifyHeaders(headers, 'assets', new Map());
    const raw = { name: 'Pump Alpha', asset_tag: 'PUMP-001', status: 'ACTIVE' };

    const result = service.validateRow(1, raw, 'assets', classifications, headers, {});
    expect(result.error).toBeNull();
    expect(result.valid).not.toBeNull();
    expect(result.valid?.dbValues['name']).toBe('Pump Alpha');
  });

  it('rejects missing required field', () => {
    const headers = ['asset_tag'];
    const { classifications } = classifyHeaders(headers, 'assets', new Map());
    const raw = { asset_tag: 'PUMP-001' }; // name is required but missing

    const result = service.validateRow(1, raw, 'assets', classifications, headers, {});
    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBe('VALIDATION_FAILED');
  });

  it('strips formula injection and warns', () => {
    const headers = ['name', 'asset_tag'];
    const { classifications } = classifyHeaders(headers, 'assets', new Map());
    const raw = { name: '=HYPERLINK("evil.com","click")', asset_tag: 'X-001' };

    const result = service.validateRow(1, raw, 'assets', classifications, headers, {});
    expect(result.warnings.some((w) => w.reason === 'FORMULA_STRIPPED')).toBe(true);
    // name should be cleaned
    if (result.valid) {
      expect(result.valid.dbValues['name']).not.toMatch(/^=/);
    }
  });

  it('segregates spec_ and custom_ columns', () => {
    const headers = ['name', 'spec_voltage', 'custom_warranty_tier'];
    const { classifications } = classifyHeaders(headers, 'assets', new Map());
    const raw = { name: 'Motor B', spec_voltage: '480V', custom_warranty_tier: 'Gold' };

    const result = service.validateRow(1, raw, 'assets', classifications, headers, {});
    expect(result.valid?.specValues['voltage']).toBe('480V');
    expect(result.valid?.customValues['warranty_tier']).toBe('Gold');
  });

  it('validates a workforce row', () => {
    const headers = ['first_name', 'last_name', 'email'];
    const { classifications } = classifyHeaders(headers, 'workforce_resources', new Map());
    const raw = { first_name: 'Jane', last_name: 'Doe', email: 'jane@example.com' };

    const result = service.validateRow(1, raw, 'workforce_resources', classifications, headers, {});
    expect(result.error).toBeNull();
    expect(result.valid?.dbValues['first_name']).toBe('Jane');
  });

  it('rejects invalid enum value', () => {
    const headers = ['name', 'status'];
    const { classifications } = classifyHeaders(headers, 'assets', new Map());
    const raw = { name: 'Widget', status: 'BROKEN' }; // not in enum

    const result = service.validateRow(1, raw, 'assets', classifications, headers, {});
    expect(result.error?.code).toBe('VALIDATION_FAILED');
  });
});
