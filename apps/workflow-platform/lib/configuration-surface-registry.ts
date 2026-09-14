import type {
  ConfigurationDefinition,
  ConfigurationSurfaceRegistration,
} from '@gigalibs/contracts';

export type ConfigurationSurface = ConfigurationSurfaceRegistration & {
  versionSequence?: number;
};

const CONFIGURATION_MODES = new Set<ConfigurationDefinition['mode']>([
  'CREATE',
  'EDIT',
  'READ',
  'LIST',
]);

/**
 * Keeps the Studio usable while the web and control plane are rolling between
 * compatible releases. Missing registry metadata is treated as unavailable,
 * never as permission to edit a core field.
 */
export function decodeConfigurationSurfaces(payload: unknown): ConfigurationSurface[] {
  if (!Array.isArray(payload)) {
    throw new Error('The configuration surface registry returned an invalid response.');
  }

  return payload.map((value) => {
    if (!isRecord(value)) {
      throw new Error('The configuration surface registry contains an invalid surface.');
    }

    const registrationKey = requiredString(value.registrationKey, 'registrationKey');
    const moduleKey = requiredString(value.moduleKey, 'moduleKey');
    const entityKey = requiredString(value.entityKey, 'entityKey');
    const surfaceKey = requiredString(value.surfaceKey, 'surfaceKey');
    const modes = Array.isArray(value.modes)
      ? value.modes.filter(
          (mode): mode is ConfigurationDefinition['mode'] =>
            typeof mode === 'string' &&
            CONFIGURATION_MODES.has(mode as ConfigurationDefinition['mode']),
        )
      : [];

    if (modes.length === 0) {
      throw new Error(`Configuration surface ${registrationKey} has no supported modes.`);
    }

    return {
      ...value,
      registrationKey,
      moduleKey,
      entityKey,
      surfaceKey,
      route:
        typeof value.route === 'string' && value.route.startsWith('/') ? value.route : '/modules',
      label: requiredString(value.label, 'label'),
      description: requiredString(value.description, 'description'),
      ownership:
        value.ownership === 'TENANT_APPLICATION' ? 'TENANT_APPLICATION' : 'MODULE_EXTENSION',
      authoringEnabled: value.authoringEnabled !== false,
      ...(typeof value.authoringDisabledReason === 'string'
        ? { authoringDisabledReason: value.authoringDisabledReason }
        : {}),
      entityKeyEditable: value.entityKeyEditable === true,
      surfaceKeyEditable: value.surfaceKeyEditable === true,
      modes,
      coreFields: Array.isArray(value.coreFields) ? value.coreFields : [],
      extensionSlots: Array.isArray(value.extensionSlots) ? value.extensionSlots : [],
      ...(typeof value.versionSequence === 'number'
        ? { versionSequence: value.versionSequence }
        : {}),
    } as ConfigurationSurface;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`The configuration surface registry is missing ${field}.`);
  }
  return value;
}
