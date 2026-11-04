import {
  MASTER_DATA_GROUPS,
  MASTER_DATA_LOOKUP_CAP,
  MASTER_DATA_REGISTRY,
  type MasterDataEntryV1,
  type MasterDataGroup,
  type PlatformContextPersona,
  platformModuleCatalog,
} from '@gigalibs/contracts';
import { canOpenPlatformModule, hasPermission, type ModuleAccessContext } from './module-access';

export type { ModuleAccessContext };

// WI-OI-152 (ADR-0037 §3): the Master data area. The registry is generated from the module manifests; a person sees a
// master when its module is open to them (entitlement, readiness) and they hold the master's read permission — the
// same permission the master's own screen asks for. Counts come from the module's own APIs, as the person.

/** The sidebar offers the area to administrators; everyone else reaches each master from its module. */
export const MASTER_DATA_PERSONAS: readonly PlatformContextPersona[] = [
  'PLATFORM_OPERATOR',
  'TENANT_ADMIN',
  'OPERATIONS_SUPERVISOR',
];

export function readableMasters(
  context: ModuleAccessContext,
  registry: readonly MasterDataEntryV1[] = MASTER_DATA_REGISTRY,
): readonly MasterDataEntryV1[] {
  return registry.filter((entry) => {
    if (!hasPermission(context.permissions, entry.readPermission)) return false;
    // WI-OI-176 (ADR-0038): platform reference sets are read-only standards for every workspace member.
    if (entry.level === 'PLATFORM_REFERENCE') return true;
    const module = platformModuleCatalog.find((candidate) => candidate.key === entry.catalogKey);
    return module !== undefined && canOpenPlatformModule(module, context);
  });
}

/** The groups that hold at least one of these masters, in the area's order. */
export function masterGroups(masters: readonly MasterDataEntryV1[]): readonly MasterDataGroup[] {
  return MASTER_DATA_GROUPS.filter((group) => masters.some((entry) => entry.group === group));
}

export function isMasterDataGroup(value: string): value is MasterDataGroup {
  return (MASTER_DATA_GROUPS as readonly string[]).includes(value);
}

export type MasterCount =
  | { readonly state: 'ready'; readonly count: number; readonly capped: boolean }
  | {
      readonly state: 'unavailable';
      readonly reason: 'no-access' | 'not-answering' | 'module-not-open';
    };

/** The request that counts a master: a one-row page of its record list, or its platform lookup. */
export function masterCountUrl(entry: MasterDataEntryV1): string {
  return entry.count.kind === 'records'
    ? `${entry.count.basePath}/v1/records/${encodeURIComponent(entry.count.entity)}?page=1&pageSize=1`
    : `${entry.count.basePath}/v1/lookups/${encodeURIComponent(entry.count.resolver)}`;
}

/**
 * Counts one master within `timeoutMs`; a module that is stopped or slow is "not answering", never an error page.
 * The answer is always read, refusals included, so no request is left open (QA-013).
 */
export function masterUnavailableReason(entry: MasterDataEntryV1, count: MasterCount): string {
  if (count.state === 'ready') return count.count === 0 ? 'Empty' : 'In use';
  if (count.reason === 'module-not-open') return 'Module not enabled';
  if (count.reason === 'no-access') return 'No access';
  return 'Unavailable';
}

/** Counts one master; skips the network call when the module is not open (WI-OI-176). */
export async function countMaster(
  entry: MasterDataEntryV1,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 2_000,
  context?: ModuleAccessContext,
): Promise<MasterCount> {
  if (entry.level !== 'PLATFORM_REFERENCE' && context) {
    const module = platformModuleCatalog.find((candidate) => candidate.key === entry.catalogKey);
    if (!module || !canOpenPlatformModule(module, context))
      return { state: 'unavailable', reason: 'module-not-open' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(masterCountUrl(entry), { cache: 'no-store', signal: controller.signal });
    const body: unknown = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) return { state: 'unavailable', reason: 'no-access' };
    if (!response.ok) return { state: 'unavailable', reason: 'not-answering' };
    if (entry.count.kind === 'records') {
      const total = (body as { total?: unknown } | null)?.total;
      return typeof total === 'number' ? { state: 'ready', count: total, capped: false } : { state: 'unavailable', reason: 'not-answering' };
    }
    const options = Array.isArray(body) ? body.length : 0;
    return { state: 'ready', count: options, capped: options >= MASTER_DATA_LOOKUP_CAP };
  } catch {
    return { state: 'unavailable', reason: 'not-answering' };
  } finally {
    clearTimeout(timer);
  }
}
