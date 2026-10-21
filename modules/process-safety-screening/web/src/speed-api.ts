import type {
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
    },
    reason: string,
  ): Promise<SpeedStepChangeV1>;
}

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
  };
}
