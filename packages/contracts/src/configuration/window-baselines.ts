import { z } from 'zod';
import { DictionaryChangeSetDefinitionSchema, MODULE_BASELINE_PACKAGE_SUFFIX } from './dictionary.js';
import { ConfigurationPermissionSchema } from './index.js';
import { MODULE_WINDOW_BASELINE_SOURCES, MODULE_WINDOW_ENTITLEMENT_KEYS } from './window-baselines.generated.js';

/**
 * WI-OI-120f (F0.2, ADR-0033 D1): a module ships each of its windows as an Application Dictionary package in
 * `modules/<module>/dictionary/<surface>.window.json`. `pnpm modules:catalog` copies them into
 * `window-baselines.generated.ts`; the control plane registers each as a surface and publishes and activates it for a
 * tenant when the module is enabled. A tenant's own published version of the surface stays in force.
 */
export const ModuleWindowBaselineV1Schema = z
  .object({
    contractVersion: z.literal('1.0'),
    definition: DictionaryChangeSetDefinitionSchema,
    window: z
      .object({
        route: z.string().startsWith('/').max(300),
        label: z.string().trim().min(1).max(160),
        description: z.string().trim().min(1).max(500),
        // Lazy: this file and ./index.js import each other, so the schema is read when parsing, not when loading.
        readPermission: z.lazy(() => ConfigurationPermissionSchema),
      })
      .strict(),
  })
  .strict()
  .superRefine((baseline, context) => {
    const { definition } = baseline;
    if (!definition.dictionary.packageKey.endsWith(MODULE_BASELINE_PACKAGE_SUFFIX)) {
      context.addIssue({
        code: 'custom',
        path: ['definition', 'dictionary', 'packageKey'],
        message: `A module baseline package key ends in ${MODULE_BASELINE_PACKAGE_SUFFIX}.`,
      });
    }
    if (definition.dictionary.moduleKey !== definition.moduleKey) {
      context.addIssue({
        code: 'custom',
        path: ['definition', 'dictionary', 'moduleKey'],
        message: 'The dictionary belongs to the module that ships it.',
      });
    }
  });
export type ModuleWindowBaselineV1 = z.infer<typeof ModuleWindowBaselineV1Schema>;

let parsed: readonly ModuleWindowBaselineV1[] | undefined;

/** Every module window baseline, parsed once. An invalid generated file throws here and in the contracts tests. */
export function moduleWindowBaselines(): readonly ModuleWindowBaselineV1[] {
  parsed ??= Object.freeze(MODULE_WINDOW_BASELINE_SOURCES.map((source) => ModuleWindowBaselineV1Schema.parse(source)));
  return parsed;
}

/**
 * WI-OI-120bh: the entitlement that brings a module's windows to a tenant: the key of the module's catalogue entry,
 * generated from its manifest (CMMS: `physical-operations-cmms` → `asset-maintenance`). A module that ships no window
 * has none, and asking for it is a programming error.
 */
export function moduleWindowEntitlementKey(moduleKey: string): string {
  const key = Object.hasOwn(MODULE_WINDOW_ENTITLEMENT_KEYS, moduleKey) ? MODULE_WINDOW_ENTITLEMENT_KEYS[moduleKey] : undefined;
  if (!key) throw new Error(`Module ${moduleKey} ships no window with a catalogue entitlement.`);
  return key;
}
