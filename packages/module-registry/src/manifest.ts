import { z } from 'zod';

const DependencyMapSchema = z.record(z.string().min(1), z.string().min(1));

export const ModuleManifestSchema = z.object({
  id: z.string().regex(/^gigalibs\.[a-z0-9-]+$/),
  name: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
  description: z.string().min(1).max(500),
  capabilities: z.array(z.string().min(1)).default([]),
  requires: DependencyMapSchema.default({}),
  optional: DependencyMapSchema.default({}),
  permissions: z.array(z.string().min(1)).default([]),
  eventsProduced: z.array(z.string().min(1)).default([]),
  eventsConsumed: z.array(z.string().min(1)).default([]),
  configurationNamespace: z.string().min(1).optional(),
  healthChecks: z.array(z.string().min(1)).default([]),
});

export type ModuleManifest = z.infer<typeof ModuleManifestSchema>;

export interface RegisteredModule {
  manifest: ModuleManifest;
  status: 'READY' | 'BLOCKED' | 'DISABLED';
  problems: string[];
}
