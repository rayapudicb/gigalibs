import type { CompiledConfigurationManifest } from '@gigalibs/configuration-core';
import { Injectable } from '@nestjs/common';

const MAX_ENTRIES = 1_000;
const MAX_AGE_MS = 30_000;

export interface ConfigurationManifestScope {
  tenantId: string;
  moduleKey: string;
  entityKey: string;
  surfaceKey: string;
  environmentKey: string;
  cohortKey: string;
}

export interface ConfigurationManifestProjection {
  activationId: string;
  publishedVersionId: string;
  activatedAt: Date;
  manifest: CompiledConfigurationManifest;
  checksum: string;
}

interface CacheEntry {
  scope: ConfigurationManifestScope;
  projection: ConfigurationManifestProjection;
  loadedAt: number;
}

interface CacheCounters {
  hit: number;
  miss: number;
  bypass: number;
  notificationApplied: number;
  notificationDeduplicated: number;
  notificationIgnored: number;
  notificationInvalid: number;
  notificationFailed: number;
  resynchronizationSucceeded: number;
  resynchronizationFailed: number;
  reconnects: number;
}

@Injectable()
export class ConfigurationManifestCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly revisions = new Map<string, number>();
  private readonly inFlight = new Map<string, Promise<ConfigurationManifestProjection>>();
  private listenerConnected = false;
  private readonly counters: CacheCounters = {
    hit: 0,
    miss: 0,
    bypass: 0,
    notificationApplied: 0,
    notificationDeduplicated: 0,
    notificationIgnored: 0,
    notificationInvalid: 0,
    notificationFailed: 0,
    resynchronizationSucceeded: 0,
    resynchronizationFailed: 0,
    reconnects: 0,
  };

  async read(
    scope: ConfigurationManifestScope,
    load: () => Promise<ConfigurationManifestProjection>,
  ): Promise<ConfigurationManifestProjection> {
    const key = scopeKey(scope);
    const current = this.entries.get(key);
    if (this.listenerConnected && current && Date.now() - current.loadedAt <= MAX_AGE_MS) {
      this.counters.hit += 1;
      this.entries.delete(key);
      this.entries.set(key, current);
      return current.projection;
    }
    if (this.listenerConnected) this.counters.miss += 1;
    else this.counters.bypass += 1;

    const existingLoad = this.inFlight.get(key);
    if (existingLoad) return existingLoad;
    const revision = this.revisions.get(key) ?? 0;
    const pending = load()
      .then((projection) => {
        if ((this.revisions.get(key) ?? 0) === revision) {
          this.store(scope, projection);
        }
        return projection;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, pending);
    return pending;
  }

  invalidate(scope: ConfigurationManifestScope) {
    const key = scopeKey(scope);
    this.revisions.set(key, (this.revisions.get(key) ?? 0) + 1);
    this.entries.delete(key);
  }

  invalidateTenant(tenantId: string) {
    for (const entry of [...this.entries.values()]) {
      if (entry.scope.tenantId === tenantId) this.invalidate(entry.scope);
    }
  }

  async resynchronize(
    scope: ConfigurationManifestScope,
    load: () => Promise<ConfigurationManifestProjection | null>,
  ) {
    const key = scopeKey(scope);
    const revision = (this.revisions.get(key) ?? 0) + 1;
    this.revisions.set(key, revision);
    this.entries.delete(key);
    try {
      const projection = await load();
      if ((this.revisions.get(key) ?? 0) === revision && projection) {
        this.store(scope, projection);
      }
      this.counters.resynchronizationSucceeded += 1;
    } catch (error) {
      this.counters.resynchronizationFailed += 1;
      throw error;
    }
  }

  async resynchronizeAll(
    load: (scope: ConfigurationManifestScope) => Promise<ConfigurationManifestProjection | null>,
  ) {
    const scopes = [...this.entries.values()].map(({ scope }) => scope);
    for (const scope of scopes) await this.resynchronize(scope, () => load(scope));
  }

  markListenerConnected() {
    this.listenerConnected = true;
  }

  markListenerDisconnected() {
    this.listenerConnected = false;
  }

  recordReconnect() {
    this.counters.reconnects += 1;
  }

  recordNotification(result: 'applied' | 'deduplicated' | 'ignored' | 'invalid' | 'failed') {
    if (result === 'applied') this.counters.notificationApplied += 1;
    else if (result === 'deduplicated') this.counters.notificationDeduplicated += 1;
    else if (result === 'ignored') this.counters.notificationIgnored += 1;
    else if (result === 'invalid') this.counters.notificationInvalid += 1;
    else this.counters.notificationFailed += 1;
  }

  snapshot() {
    return {
      listenerConnected: this.listenerConnected,
      entries: this.entries.size,
      ...this.counters,
    };
  }

  scopes(): ConfigurationManifestScope[] {
    return [...this.entries.values()].map(({ scope }) => ({ ...scope }));
  }

  private store(scope: ConfigurationManifestScope, projection: ConfigurationManifestProjection) {
    const key = scopeKey(scope);
    this.entries.delete(key);
    this.entries.set(key, { scope: { ...scope }, projection, loadedAt: Date.now() });
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.entries.delete(oldest);
      this.revisions.delete(oldest);
    }
  }
}

function scopeKey(scope: ConfigurationManifestScope): string {
  return JSON.stringify([
    scope.tenantId,
    scope.moduleKey,
    scope.entityKey,
    scope.surfaceKey,
    scope.environmentKey,
    scope.cohortKey,
  ]);
}
