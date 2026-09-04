import type { ExecutionAuditEventDto } from '@gigalibs/contracts';
import { type Prisma, prisma } from '@gigalibs/db';
import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class ExecutionEventsService {
  async ingest(event: ExecutionAuditEventDto) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: event.tenantId },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Audit event tenant was not found.');

    const actor = event.actorId
      ? await prisma.user.findUnique({ where: { id: event.actorId }, select: { id: true } })
      : null;
    const action = event.eventType === 'execution.run.requested.v1' ? 'CREATE' : 'STATUS_CHANGE';

    const inserted = await prisma.auditLog.createMany({
      data: {
        action,
        resource: 'workflow-run',
        resourceId: event.runId,
        correlationId: event.correlationId,
        sourceEventId: event.eventId,
        tenantId: event.tenantId,
        userId: actor?.id ?? null,
        after: {
          eventType: event.eventType,
          workflowId: event.workflowId,
          occurredAt: event.occurredAt,
          evidence: event.evidence,
        } as Prisma.InputJsonValue,
        metadata: {
          source: 'execution-plane',
          actorId: event.actorId ?? null,
        } as Prisma.InputJsonValue,
      },
      skipDuplicates: true,
    });
    const audit = await prisma.auditLog.findUnique({
      where: { sourceEventId: event.eventId },
      select: { id: true },
    });
    if (!audit) throw new Error('Accepted audit event could not be read after persistence.');
    return {
      accepted: true,
      duplicate: inserted.count === 0,
      auditId: audit.id,
      eventId: event.eventId,
    };
  }
}
