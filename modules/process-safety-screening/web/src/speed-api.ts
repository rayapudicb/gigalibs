import type {
  AddSpeedThermalDataInputV1,
  ImportSpeedCriteriaSetInputV1,
  ImportSpeedLibrarySetInputV1,
  SpeedCriteriaSetV1,
  SpeedDossierFormat,
  SpeedDossierV1,
  SpeedEnthalpySource,
  SpeedLibrarySetV1,
  SpeedMaterialRole,
  SpeedMessageV1,
  SpeedOutcomesV1,
  SpeedAuditPageV1,
  SpeedRouteDetailV1,
  SpeedRouteV1,
  SpeedStepChangeV1,
  SpeedSubstanceV1,
} from '@gigalibs/contracts';
import type { DossierModelV1 } from '@gigalibs/process-safety-screening-domain';

// WI-OI-120bx (SPEED S4): the module API the workbench panels call as the signed-in user, through the web gateway
// `/api/speed` (the BFF signs a fresh platform context for each call). Adds carry a request key in the body, so a retry
// cannot add twice; every change carries the version it read and a reason.

export const SPEED_API = '/api/speed/v1';

/** A refusal with the server's code and the issues it named. */
export class SpeedApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues: readonly SpeedMessageV1[] = [],
  ) {
    super(message);
    this.name = 'SpeedApiError';
  }
}

export interface SpeedApi {
  route(routeId: string): Promise<SpeedRouteDetailV1>;
  addStep(routeId: string, name: string, reason: string): Promise<SpeedStepChangeV1>;
  renameStep(
    stepId: string,
    version: number,
    name: string,
    reason: string,
  ): Promise<SpeedStepChangeV1>;
  moveStep(
    stepId: string,
    version: number,
    position: number,
    reason: string,
  ): Promise<SpeedRouteDetailV1>;
  removeStep(stepId: string, version: number, reason: string): Promise<SpeedRouteDetailV1>;
  addMaterial(
    stepId: string,
    material: {
      substanceId: string;
      role: SpeedMaterialRole;
      coefficient?: number;
      massG?: number;
    },
    reason: string,
  ): Promise<SpeedStepChangeV1>;
  updateMaterial(
    materialId: string,
    version: number,
    change: { role?: SpeedMaterialRole; coefficient?: number | null; massG?: number | null },
    reason: string,
  ): Promise<SpeedStepChangeV1>;
  removeMaterial(materialId: string, version: number, reason: string): Promise<SpeedStepChangeV1>;
  replaceConditions(
    stepId: string,
    version: number,
    values: {
      processTemperatureC: number | null;
      maximumTechnicalTemperatureC: number | null;
      heatCapacityJPerGK: number | null;
      accumulationPercent: number | null;
      reactionEnthalpySource?: SpeedEnthalpySource | null;
      reactionClassId?: string | null;
    },
    reason: string,
  ): Promise<SpeedStepChangeV1>;
  addThermalData(
    stepId: string,
    data: DistributiveOmit<AddSpeedThermalDataInputV1, 'requestKey' | 'reason'>,
    reason: string,
  ): Promise<SpeedStepChangeV1>;
  setEnergeticGroups(
    materialId: string,
    version: number,
    groups: readonly string[],
    reason: string,
  ): Promise<SpeedStepChangeV1>;
  replaceMitigation(
    stepId: string,
    version: number,
    text: string,
    reason: string,
  ): Promise<SpeedStepChangeV1>;
  documentControl(
    stepId: string,
    version: number,
    materialAId: string,
    materialBId: string,
    text: string,
    reason: string,
  ): Promise<SpeedStepChangeV1>;
  /** Links a substance to a library material (its reactivity classes come from there). */
  linkSubstance(substanceId: string, libraryMaterialId: string, reason: string): Promise<unknown>;
  librarySet(id: string): Promise<SpeedLibrarySetV1>;
  /** WI-OI-120ce: imports a cited criteria or library pack as unreviewed (an administrator then puts it in force). */
  importPack(
    kind: 'criteria' | 'library',
    pack: SpeedPackBody,
  ): Promise<{ id: string; versionLabel: string }>;
  /** The criteria and library sets in force, or null where a workspace has none. */
  setsInForce(): Promise<{
    criteria: SpeedCriteriaSetV1 | null;
    library: SpeedLibrarySetV1 | null;
  }>;
  /** WI-OI-120ca: the dossier model of the route as it is now (the JSON export). */
  dossierPreview(routeId: string): Promise<{ model: DossierModelV1; route: SpeedRouteDetailV1 }>;
  dossiers(routeId: string): Promise<{ items: SpeedDossierV1[] }>;
  requestDossier(routeId: string): Promise<SpeedDossierV1>;
  /** WI-OI-120cc: the business outcomes over the routes the member reads. */
  outcomes(): Promise<SpeedOutcomesV1>;
  /** WI-OI-120cc (S8): the workspace's active substances, every page, for the write-up parser's reagents. */
  activeSubstances(): Promise<SpeedSubstanceV1[]>;
  /** WI-OI-120cc: the audit trail, filtered (screen spec §3.3). */
  auditEvents(filters: AuditFilters, page: number, pageSize: number): Promise<SpeedAuditPageV1>;
  /** The routes the member reads, for the audit trail's route filter. */
  routeOptions(): Promise<SpeedRouteV1[]>;
}

/** WI-OI-120cc: the audit trail's filters; empty values are left out. */
export interface AuditFilters {
  readonly routeId?: string;
  readonly actor?: string;
  readonly action?: string;
  readonly from?: string;
  readonly to?: string;
}

const auditQuery = (filters: AuditFilters) =>
  Object.entries(filters)
    .filter(([, value]) => typeof value === 'string' && value.trim() !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value).trim())}`)
    .join('&');

/** WI-OI-120cc: the audit trail as CSV (`speed.audit.read`), with the same filters. */
export function auditCsvUrl(filters: AuditFilters): string {
  const query = auditQuery(filters);
  return `${SPEED_API}/audit-events/export/csv${query ? `?${query}` : ''}`;
}

/** WI-OI-120ca: a dossier file, served by the module after its hash is checked. */
export function dossierFileUrl(dossierId: string, format: SpeedDossierFormat): string {
  return `${SPEED_API}/dossiers/${dossierId}/files/${format}`;
}

/** WI-OI-120ca: the route's export as JSON (the dossier model) or CSV. */
export function routeExportUrl(routeId: string, format: 'json' | 'csv'): string {
  return `${SPEED_API}/routes/${routeId}/export/${format}`;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A pack as a file holds it: everything the import takes except the request key. */
export type SpeedPackBody =
  | Omit<ImportSpeedCriteriaSetInputV1, 'requestKey'>
  | Omit<ImportSpeedLibrarySetInputV1, 'requestKey'>;

export function createSpeedApi(send: typeof fetch = (input, init) => fetch(input, init)): SpeedApi {
  const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const response = await send(`${SPEED_API}${path}`, {
      method,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const record =
        payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
      const nested =
        record['message'] && typeof record['message'] === 'object'
          ? (record['message'] as Record<string, unknown>)
          : record;
      const code = typeof nested['code'] === 'string' ? nested['code'] : 'SPEED_REQUEST_FAILED';
      const message = typeof nested['message'] === 'string' ? nested['message'] : '';
      const issues = Array.isArray(nested['issues']) ? (nested['issues'] as SpeedMessageV1[]) : [];
      throw new SpeedApiError(response.status, code, message, issues);
    }
    return payload as T;
  };
  const key = () => crypto.randomUUID();
  return {
    route: (routeId) => call('GET', `/routes/${routeId}`),
    addStep: (routeId, name, reason) =>
      call('POST', `/routes/${routeId}/steps`, { requestKey: key(), name, reason }),
    renameStep: (stepId, version, name, reason) =>
      call('PATCH', `/steps/${stepId}`, { version, name, reason }),
    moveStep: (stepId, version, position, reason) =>
      call('POST', `/steps/${stepId}/move`, { version, position, reason }),
    removeStep: (stepId, version, reason) =>
      call('POST', `/steps/${stepId}/remove`, { version, reason }),
    addMaterial: (stepId, material, reason) =>
      call('POST', `/steps/${stepId}/materials`, { requestKey: key(), reason, ...material }),
    updateMaterial: (materialId, version, change, reason) =>
      call('PATCH', `/materials/${materialId}`, { version, reason, ...change }),
    removeMaterial: (materialId, version, reason) =>
      call('POST', `/materials/${materialId}/remove`, { version, reason }),
    replaceConditions: (stepId, version, values, reason) =>
      call('PUT', `/steps/${stepId}/conditions`, { version, reason, ...values }),
    addThermalData: (stepId, data, reason) =>
      call('POST', `/steps/${stepId}/thermal-data`, { requestKey: key(), reason, ...data }),
    setEnergeticGroups: (materialId, version, groups, reason) =>
      call('PUT', `/materials/${materialId}/energetic-groups`, { version, reason, groups }),
    replaceMitigation: (stepId, version, text, reason) =>
      call('PUT', `/steps/${stepId}/mitigation`, { version, reason, text }),
    documentControl: (stepId, version, materialAId, materialBId, text, reason) =>
      call('PUT', `/steps/${stepId}/controls`, { version, reason, materialAId, materialBId, text }),
    linkSubstance: async (substanceId, libraryMaterialId, reason) => {
      const substance = await call<{ version: number }>('GET', `/substances/${substanceId}`);
      return call('PATCH', `/substances/${substanceId}`, {
        version: substance.version,
        reason,
        libraryMaterialId,
      });
    },
    librarySet: (id) => call('GET', `/library-sets/${id}`),
    importPack: (kind, pack) =>
      call('POST', kind === 'criteria' ? '/criteria-sets' : '/library-sets', {
        requestKey: key(),
        ...pack,
      }),
    setsInForce: async () => {
      const [criteria, library] = await Promise.all([
        call<{ items: SpeedCriteriaSetV1[] }>('GET', '/criteria-sets'),
        call<{ items: SpeedLibrarySetV1[] }>('GET', '/library-sets'),
      ]);
      return {
        criteria: criteria.items.find((set) => set.inForce) ?? null,
        library: library.items.find((set) => set.inForce) ?? null,
      };
    },
    dossierPreview: (routeId) => call('GET', `/routes/${routeId}/export/json`),
    dossiers: (routeId) => call('GET', `/routes/${routeId}/dossiers`),
    requestDossier: (routeId) => call('POST', `/routes/${routeId}/dossiers`, { requestKey: key() }),
    outcomes: () => call('GET', '/outcomes'),
    auditEvents: (filters, page, pageSize) => {
      const query = auditQuery(filters);
      return call(
        'GET',
        `/audit-events?page=${page}&pageSize=${pageSize}${query ? `&${query}` : ''}`,
      );
    },
    routeOptions: async () => {
      const all: SpeedRouteV1[] = [];
      for (let page = 1; ; page += 1) {
        const loaded = await call<{ items: SpeedRouteV1[] }>(
          'GET',
          `/routes?pageSize=100&page=${page}`,
        );
        all.push(...loaded.items);
        if (loaded.items.length < 100) return all;
      }
    },
    activeSubstances: async () => {
      const all: SpeedSubstanceV1[] = [];
      for (let page = 1; ; page += 1) {
        const loaded = await call<{ items: SpeedSubstanceV1[] }>(
          'GET',
          `/substances?status=ACTIVE&pageSize=100&page=${page}`,
        );
        all.push(...loaded.items);
        if (loaded.items.length < 100) return all;
      }
    },
  };
}
