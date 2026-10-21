import type {
  AddSpeedThermalDataInputV1,
  SpeedCriteriaSetV1,
  SpeedEnthalpySource,
  SpeedLibrarySetV1,
  SpeedMaterialRole,
  SpeedMessageV1,
  SpeedRouteDetailV1,
  SpeedStepChangeV1,
} from '@gigalibs/contracts';

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
  /** The criteria and library sets in force, or null where a workspace has none. */
  setsInForce(): Promise<{
    criteria: SpeedCriteriaSetV1 | null;
    library: SpeedLibrarySetV1 | null;
  }>;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

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
  };
}
