import { describe, expect, it } from 'vitest';
import { AssistantPolicyV1Schema, GovernedCatalogueDefinitionSchema } from './catalogue.js';

const policy = {
  formatVersion: 1,
  enabled: false,
  retentionDays: 30,
  model: { mode: 'DISABLED' },
  allowedToolKeys: [],
  credentialReference: null,
  displayName: 'GigaLibs Assistant',
  locale: 'en',
} as const;

describe('Assistant A3 governed policy contract', () => {
  it('accepts only the Assistant module and its fixed policy surface', () => {
    const definition = {
      contractVersion: '1.0', kind: 'ASSISTANT_POLICY', moduleKey: 'gigalibs-assistant',
      entityKey: 'tenant-policy', surfaceKey: 'assistant-default', title: 'Assistant tenant policy',
      catalogue: policy,
    };
    expect(GovernedCatalogueDefinitionSchema.safeParse(definition).success).toBe(true);
    expect(GovernedCatalogueDefinitionSchema.safeParse({ ...definition, moduleKey: 'tenant-settings' }).success).toBe(false);
    expect(GovernedCatalogueDefinitionSchema.safeParse({ ...definition, surfaceKey: 'other' }).success).toBe(false);
  });

  it('rejects tools, provider activation, credential values and out-of-range retention in A3', () => {
    for (const unsafe of [
      { ...policy, allowedToolKeys: ['cmms.work-order.read'] },
      { ...policy, model: { mode: 'LOCAL', modelKey: 'llama3.2' } },
      { ...policy, credentialReference: 'secret-value' },
      { ...policy, retentionDays: 0 },
      { ...policy, retentionDays: 366 },
      { ...policy, tenantId: 'tenant-b' },
    ]) expect(AssistantPolicyV1Schema.safeParse(unsafe).success).toBe(false);
  });
});
