import {
  ModuleAdapterDescriptorV1Schema,
  type ModuleAdapterDescriptorV1,
  type ModuleWindowBaselineV1,
} from '@gigalibs/contracts';
import type { ModuleConfigurationAdapterV1 } from './tenant-profile-configuration.adapter.js';

/**
 * WI-OI-120f (F0.2, ADR-0033 D1): one adapter per module window, built from the window file the module ships. The
 * window's records live in the module and are reached through its record dispatcher, so the adapter stores no
 * extension values; it registers the surface, serves its runtime manifest and checks tenant edits against the
 * baseline (locked fields, the module's resolvers and action handlers).
 */
/**
 * Maps a module dictionary's moduleKey (e.g. folder name 'physical-operations-cmms') to the canonical
 * platform catalog entitlement key ('asset-maintenance') stored in tenant_module_entitlements.
 */
export function resolveEntitlementModuleKey(moduleKey: string): string {
  if (moduleKey === 'physical-operations-cmms') {
    return 'asset-maintenance';
  }
  return moduleKey;
}

export class ModuleWindowConfigurationAdapterV1 implements ModuleConfigurationAdapterV1 {
  readonly descriptor: ModuleAdapterDescriptorV1;

  constructor(readonly baseline: ModuleWindowBaselineV1) {
    const { definition, window } = baseline;
    const dictionary = definition.dictionary;
    const modes = [...new Set(dictionary.views.map((view) => view.mode))];
    this.descriptor = ModuleAdapterDescriptorV1Schema.parse({
      contractVersion: '1.0',
      adapterKey: `${definition.surfaceKey}-window`,
      moduleKey: definition.moduleKey,
      entityKey: definition.entityKey,
      surfaceKey: definition.surfaceKey,
      entitlementModuleKey: resolveEntitlementModuleKey(definition.moduleKey),
      capabilities: ['SURFACE_DISCOVERY', 'RUNTIME_MANIFEST', 'ADMINISTRATIVE_PREVIEW'],
      storageStrategy: 'MODULE_RECORD_DISPATCHER',
      compatibility: { descriptorVersion: '1.0', manifestContractVersion: '1.0', minimumRuntimeVersion: '1.0' },
      limits: { maximumFields: 200, maximumExtensionSlots: 1, maximumFilterDepth: 5, maximumFilterPredicates: 20 },
      permissions: {
        discover: window.readPermission,
        runtimeRead: window.readPermission,
        extensionRead: window.readPermission,
        // Windows hold no extension values; writes go through the module's own commands and permissions.
        extensionWrite: 'configuration:write',
        administrativePreview: ['configuration-runtime:read', window.readPermission],
      },
      audit: { extensionMutationAudited: true, previewEventType: 'configuration.runtime.previewed.v1' },
      filterContract: { enabled: true, operators: ['EQUALS', 'IN', 'CONTAINS'], maximumDepth: 3, maximumPredicates: 10 },
      surface: {
        registrationKey: `${definition.surfaceKey}-window`,
        moduleKey: definition.moduleKey,
        entityKey: definition.entityKey,
        surfaceKey: definition.surfaceKey,
        route: window.route,
        label: window.label,
        description: window.description,
        ownership: 'MODULE_EXTENSION',
        authoringEnabled: true,
        entityKeyEditable: false,
        surfaceKeyEditable: false,
        modes: modes.length > 0 ? modes : ['READ'],
        coreFields: [],
        extensionSlots: [
          {
            key: 'window-fields',
            label: `${window.label} fields`,
            description: `Tenant fields added to the ${window.label} window.`,
            allowedFieldTypes: ['TEXT', 'TEXTAREA', 'NUMBER', 'INTEGER', 'BOOLEAN', 'DATE', 'SELECT'],
            maximumFields: 50,
          },
        ],
      },
      dictionaryContribution: dictionary,
      registeredResolvers: [
        ...new Set(dictionary.references.flatMap((reference) => (reference.resolverKey ? [reference.resolverKey] : []))),
      ],
      registeredActionHandlers: [...new Set(dictionary.actions.map((action) => action.handlerKey))],
    });
  }

  ownsExtensionOwner(): boolean {
    return false;
  }

  validatesExtensionOwner(): boolean {
    return false;
  }
}
