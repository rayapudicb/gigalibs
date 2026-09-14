import { describe, expect, it } from 'vitest';
import { ConfigurationStudioService } from './configuration-studio.service.js';

describe('ConfigurationStudioService surface registry', () => {
  const service = new ConfigurationStudioService();

  it('publishes code-owned core fields and extension slots for registered surfaces', () => {
    const surfaces = service.listBaseSurfaces();
    const tenantProfile = surfaces.find(
      (surface) => surface.registrationKey === 'tenant-profile-extension',
    );

    expect(tenantProfile?.route).toBe('/settings');
    expect(tenantProfile?.coreFields.map((field) => field.key)).toEqual([
      'name',
      'slug',
      'status',
      'region',
    ]);
    expect(tenantProfile?.coreFields.every((field) => field.lockReason.length > 0)).toBe(true);
    expect(tenantProfile?.extensionSlots.map((slot) => slot.key)).toEqual(['profile-details']);
    const arInvoice = surfaces.find((surface) => surface.registrationKey === 'ar-invoice-draft');
    expect(arInvoice?.authoringEnabled).toBe(false);
    expect(arInvoice?.coreFields.map((field) => field.key)).toContain('totalMinor');
    expect(arInvoice?.coreFields.map((field) => field.key)).toContain('invoiceNumber');
  });

  it('rejects a tenant field that shadows a module-owned core field before persistence', async () => {
    await expect(
      service.createChangeSet('tenant-1', 'actor-1', {
        definition: {
          contractVersion: '1.0',
          moduleKey: 'tenant-settings',
          entityKey: 'tenant-profile',
          surfaceKey: 'profile-extension',
          mode: 'EDIT',
          title: 'Unsafe shadow',
          fields: [
            {
              key: 'status',
              label: 'Replacement status',
              type: 'TEXT',
              component: 'text-input',
              required: false,
              readOnly: false,
              classification: 'INTERNAL',
            },
          ],
          sections: [{ key: 'details', title: 'Details', columns: 1, fieldKeys: ['status'] }],
        },
        reason: 'Attempt to replace a core field',
        idempotencyKey: 'shadow-status-001',
      }),
    ).rejects.toThrow('module-owned core');
  });

  it('keeps an inspection-only AR surface out of the authoring write path', async () => {
    await expect(
      service.createChangeSet('tenant-1', 'actor-1', {
        definition: {
          contractVersion: '1.0',
          moduleKey: 'accounts-receivable',
          entityKey: 'invoice',
          surfaceKey: 'invoice-draft',
          mode: 'EDIT',
          title: 'AR invoice extension',
          fields: [
            {
              key: 'project-code',
              label: 'Project code',
              type: 'TEXT',
              component: 'text-input',
              required: false,
              readOnly: false,
              classification: 'INTERNAL',
            },
          ],
          sections: [{ key: 'details', title: 'Details', columns: 1, fieldKeys: ['project-code'] }],
        },
        reason: 'Attempt AR authoring before adapter certification',
        idempotencyKey: 'ar-adapter-pending-001',
      }),
    ).rejects.toThrow('Custom-field authoring remains disabled');
  });
});
