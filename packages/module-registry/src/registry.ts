import { satisfies } from 'semver';
import {
  ModuleManifestSchema,
  type ModuleManifest,
  type RegisteredModule,
} from './manifest.js';

export class ModuleRegistryError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'DUPLICATE_MODULE'
      | 'MISSING_DEPENDENCY'
      | 'INCOMPATIBLE_DEPENDENCY'
      | 'DEPENDENCY_CYCLE',
  ) {
    super(message);
    this.name = 'ModuleRegistryError';
  }
}

export class ModuleRegistry {
  private readonly manifests = new Map<string, ModuleManifest>();
  private readonly disabled = new Set<string>();

  constructor(manifests: ModuleManifest[] = []) {
    for (const manifest of manifests) {
      this.register(manifest);
    }
  }

  register(input: ModuleManifest): ModuleManifest {
    const manifest = ModuleManifestSchema.parse(input);
    if (this.manifests.has(manifest.id)) {
      throw new ModuleRegistryError(
        `Module '${manifest.id}' is already registered.`,
        'DUPLICATE_MODULE',
      );
    }
    this.manifests.set(manifest.id, manifest);
    return manifest;
  }

  disable(moduleId: string): void {
    if (this.manifests.has(moduleId)) {
      this.disabled.add(moduleId);
    }
  }

  enable(moduleId: string): void {
    this.disabled.delete(moduleId);
  }

  get(moduleId: string): RegisteredModule | null {
    const manifest = this.manifests.get(moduleId);
    if (!manifest) return null;
    return this.describe(manifest);
  }

  list(): RegisteredModule[] {
    return this.resolveOrder().map((manifest) => this.describe(manifest));
  }

  assertReady(): void {
    for (const manifest of this.manifests.values()) {
      for (const [dependencyId, range] of Object.entries(manifest.requires)) {
        const dependency = this.manifests.get(dependencyId);
        if (!dependency) {
          throw new ModuleRegistryError(
            `Module '${manifest.id}' requires missing module '${dependencyId}' (${range}).`,
            'MISSING_DEPENDENCY',
          );
        }
        if (!satisfies(dependency.version, range)) {
          throw new ModuleRegistryError(
            `Module '${manifest.id}' requires '${dependencyId}' ${range}, but ${dependency.version} is registered.`,
            'INCOMPATIBLE_DEPENDENCY',
          );
        }
      }
    }
    this.resolveOrder();
  }

  private describe(manifest: ModuleManifest): RegisteredModule {
    if (this.disabled.has(manifest.id)) {
      return { manifest, status: 'DISABLED', problems: [] };
    }

    const problems: string[] = [];
    for (const [dependencyId, range] of Object.entries(manifest.requires)) {
      const dependency = this.manifests.get(dependencyId);
      if (!dependency) {
        problems.push(`Missing ${dependencyId} (${range})`);
      } else if (!satisfies(dependency.version, range)) {
        problems.push(`Incompatible ${dependencyId}: expected ${range}, received ${dependency.version}`);
      } else if (this.disabled.has(dependencyId)) {
        problems.push(`Required module ${dependencyId} is disabled`);
      }
    }

    return {
      manifest,
      status: problems.length === 0 ? 'READY' : 'BLOCKED',
      problems,
    };
  }

  private resolveOrder(): ModuleManifest[] {
    const ordered: ModuleManifest[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (manifest: ModuleManifest): void => {
      if (visited.has(manifest.id)) return;
      if (visiting.has(manifest.id)) {
        throw new ModuleRegistryError(
          `Dependency cycle detected at '${manifest.id}'.`,
          'DEPENDENCY_CYCLE',
        );
      }

      visiting.add(manifest.id);
      for (const dependencyId of Object.keys(manifest.requires)) {
        const dependency = this.manifests.get(dependencyId);
        if (dependency) visit(dependency);
      }
      visiting.delete(manifest.id);
      visited.add(manifest.id);
      ordered.push(manifest);
    };

    for (const manifest of this.manifests.values()) visit(manifest);
    return ordered;
  }
}
