import { Injectable, Inject } from '@nestjs/common';
import {
  type Ticket,
  type TicketComment,
  type TicketFilter,
  TicketLifecycle,
  type TicketPriority,
  type TicketStatus,
  type ITicketRepository,
  MemoryTicketRepository,
  type PaginatedTickets,
} from '@gigalibs/tickets-core';
import { SlaEngine, type SlaEvaluation } from '@gigalibs/sla-engine';

export const TICKET_REPOSITORY_TOKEN = 'TICKET_REPOSITORY';

export interface CreateTicketDto {
  title: string;
  description: string;
  priority?: TicketPriority | undefined;
  requesterId: string;
  requesterEmail: string;
  requesterName?: string | undefined;
  assignedAgentId?: string | undefined;
  tags?: string[] | undefined;
  customFields?: Record<string, unknown> | undefined;
}

export interface TicketWithSla extends Ticket {
  sla: SlaEvaluation;
}

@Injectable()
export class TicketsService {
  constructor(
    @Inject(TICKET_REPOSITORY_TOKEN)
    private readonly repository: ITicketRepository,
  ) {}

  async create(tenantId: string, dto: CreateTicketDto): Promise<Ticket> {
    const seq = this.repository instanceof MemoryTicketRepository
      ? this.repository.getNextSequence()
      : 1001;

    const ticket = TicketLifecycle.create({
      tenantId,
      ...dto,
    }, seq);

    return this.repository.create(ticket);
  }

  async findById(tenantId: string, id: string): Promise<TicketWithSla | null> {
    const ticket = await this.repository.findById(tenantId, id);
    if (!ticket) return null;

    const sla = SlaEngine.evaluate(
      ticket.createdAt,
      ticket.priority,
      undefined,
      ticket.firstResponseAt,
      ticket.resolvedAt,
    );

    return {
      ...ticket,
      sla,
    };
  }

  async list(tenantId: string, filter?: TicketFilter): Promise<PaginatedTickets> {
    return this.repository.list(tenantId, filter);
  }

  async updateStatus(
    tenantId: string,
    id: string,
    nextStatus: TicketStatus,
    actorId: string,
  ): Promise<TicketWithSla | null> {
    const current = await this.repository.findById(tenantId, id);
    if (!current) return null;

    const updated = TicketLifecycle.transition(current, nextStatus, actorId);
    const saved = await this.repository.update(updated);

    const sla = SlaEngine.evaluate(
      saved.createdAt,
      saved.priority,
      undefined,
      saved.firstResponseAt,
      saved.resolvedAt,
    );

    return {
      ...saved,
      sla,
    };
  }

  async assignAgent(
    tenantId: string,
    id: string,
    agentId: string,
    agentName?: string,
  ): Promise<Ticket | null> {
    const current = await this.repository.findById(tenantId, id);
    if (!current) return null;

    const updated: Ticket = {
      ...current,
      assignedAgentId: agentId,
      assignedAgentName: agentName || current.assignedAgentName,
      status: current.status === 'NEW' ? 'ASSIGNED' : current.status,
      updatedAt: new Date(),
    };

    return this.repository.update(updated);
  }

  async addComment(
    tenantId: string,
    ticketId: string,
    input: {
      authorId: string;
      authorName: string;
      authorRole: 'AGENT' | 'CUSTOMER' | 'SYSTEM';
      body: string;
      isInternal?: boolean | undefined;
    },
  ): Promise<TicketComment> {
    const ticket = await this.repository.findById(tenantId, ticketId);
    if (!ticket) {
      throw new Error(`Ticket '${ticketId}' not found.`);
    }

    // Record first response if this is an agent commenting on a ticket without first response
    if (input.authorRole === 'AGENT' && !ticket.firstResponseAt) {
      ticket.firstResponseAt = new Date();
      if (ticket.status === 'ASSIGNED' || ticket.status === 'NEW') {
        ticket.status = 'IN_PROGRESS';
      }
      ticket.updatedAt = new Date();
      await this.repository.update(ticket);
    }

    const comment: TicketComment = {
      id: `comm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenantId,
      ticketId,
      authorId: input.authorId,
      authorName: input.authorName,
      authorRole: input.authorRole,
      body: input.body.trim(),
      isInternal: !!input.isInternal,
      createdAt: new Date(),
    };

    return this.repository.addComment(comment);
  }

  async listComments(tenantId: string, ticketId: string): Promise<TicketComment[]> {
    return this.repository.listComments(tenantId, ticketId);
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    return this.repository.delete(tenantId, id);
  }
}
