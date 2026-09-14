import { decodeConfigurationSurfaces } from '@/lib/configuration-surface-registry';
import { describe, expect, it } from 'vitest';

const legacySurface = {
  registrationKey: 'tenant-profile-extension',
  moduleKey: 'tenant-settings',
  entityKey: 'tenant-profile',
  surfaceKey: 'profile-extension',
  label: 'Tenant profile',
  description: 'Tenant profile configuration',
  ownership: 'MODULE_EXTENSION',
  entityKeyEditable: false,
  surfaceKeyEditable: false,
  modes: ['EDIT'],
};

describe('configuration surface registry decoder', () => {
  it('keeps an older registry response safe during a rolling deployment', () => {
    expect(decodeConfigurationSurfaces([legacySurface])).toEqual([
      expect.objectContaining({
        registrationKey: 'tenant-profile-extension',
        route: '/modules',
        authoringEnabled: true,
        coreFields: [],
        extensionSlots: [],
      }),
    ]);
  });

  it('rejects a wrapped or otherwise invalid registry response', () => {
    expect(() => decodeConfigurationSurfaces({ items: [legacySurface] })).toThrow(
      'invalid response',
    );
  });

  it('rejects surfaces without a supported mode', () => {
    expect(() => decodeConfigurationSurfaces([{ ...legacySurface, modes: [] }])).toThrow(
      'has no supported modes',
    );
  });
});
