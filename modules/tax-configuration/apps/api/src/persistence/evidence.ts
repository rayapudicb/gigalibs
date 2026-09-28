import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

export async function recordEvidence(
  client: PoolClient,
  input: {
    tenantId: string;
    entityType: string;
    entityId: string;
    action: string;
    actorSubject: string;
    payload: Record<string, unknown>;
    eventType: string;
  },
): Promise<void> {
  const auditId = randomUUID();
  const eventId = randomUUID();
  await client.query(
    `INSERT INTO gigalibs_tax.audit_events
       (id, tenant_id, entity_type, entity_id, action, actor_id, actor_email, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $6, $7::jsonb)`,
    [auditId, input.tenantId, input.entityType, input.entityId, input.action,
      input.actorSubject, JSON.stringify(input.payload)],
  );
  await client.query(
    `INSERT INTO gigalibs_tax.outbox_events (id, tenant_id, event_type, payload)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [eventId, input.tenantId, input.eventType, JSON.stringify({
      eventId,
      tenantId: input.tenantId,
      entityId: input.entityId,
      actorSubject: input.actorSubject,
      ...input.payload,
    })],
  );
}
