import { createHash } from 'node:crypto';
import type { CmmsPrincipal } from '../auth/authorization.js';

/**
 * A workspace-wide principal for follow-up work CMMS raises itself (a corrective work order after a failed
 * calibration, WI-OI-134, or after a critical fleet defect, WI-OI-139), so the follow-up does not depend on the
 * caller's own work-order rights or scope. Audit records name it by `subject`.
 */
export function systemPrincipal(tenantId: string, subject: string, sessionId: string): CmmsPrincipal {
  return Object.freeze({
    tenantId,
    subject,
    sessionId,
    authVersion: 0,
    permissions: Object.freeze(['cmms:*']),
    roles: Object.freeze([]),
    persona: 'OPERATIONS_SUPERVISOR' as const,
    departmentScope: Object.freeze({ mode: 'ALL' as const }),
    placeScope: Object.freeze({ mode: 'ALL' as const }),
  });
}

/** Deterministic UUID-shaped request key, so a replayed command never raises a second follow-up. */
export function derivedRequestKey(namespace: string, tenantId: string, operationId: string): string {
  const hex = createHash('sha256').update(`${namespace}:${tenantId}:${operationId}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
