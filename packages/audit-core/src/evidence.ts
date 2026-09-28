import type { AuditCryptographicProof } from './hash-chain.js';

export interface AuditEvidenceV1 {
  envelopeVersion: '1.0';
  tenantId: string;
  chainScope: string;
  sequence: number;
  action: string;
  resource: string;
  resourceId?: string | undefined;
  actorUserId?: string | undefined;
  correlationId?: string | undefined;
  before?: Record<string, unknown> | undefined;
  after?: Record<string, unknown> | undefined;
  redactedFields: string[];
  proof: AuditCryptographicProof;
  recordedAt: string;
}

export function createAuditEvidenceV1(params: {
  tenantId: string;
  chainScope?: string | undefined;
  action: string;
  resource: string;
  resourceId?: string | undefined;
  actorUserId?: string | undefined;
  correlationId?: string | undefined;
  before?: Record<string, unknown> | undefined;
  after?: Record<string, unknown> | undefined;
  redactedFields: string[];
  proof: AuditCryptographicProof;
}): AuditEvidenceV1 {
  return {
    envelopeVersion: '1.0',
    tenantId: params.tenantId,
    chainScope: params.chainScope ?? 'default',
    sequence: params.proof.sequence,
    action: params.action,
    resource: params.resource,
    resourceId: params.resourceId,
    actorUserId: params.actorUserId,
    correlationId: params.correlationId,
    before: params.before,
    after: params.after,
    redactedFields: params.redactedFields,
    proof: params.proof,
    recordedAt: new Date().toISOString(),
  };
}
