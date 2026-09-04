/**
 * @gigalibs/tickets-core
 *
 * Universal support ticket lifecycle, priorities, assignments, conversation timeline,
 * repository ports, and domain invariants.
 *
 * @module
 */

// ─── DOMAIN TYPES ─────────────────────────────────────────────────────────────

export type TicketStatus =
  | 'NEW'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'WAITING_ON_CUSTOMER'
  | 'RESOLVED'
  | 'CLOSED';

export type TicketPriority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface Ticket {
  id: string;
  tenantId: string;
  ticketNumber: string; // e.g. "TICK-1001"
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  requesterId: string;
  requesterEmail: string;
  requesterName?: string | undefined;
  assignedAgentId?: string | null | undefined;
  assignedAgentName?: string | null | undefined;
  tags: string[];
  customFields?: Record<string, unknown> | undefined;
  createdAt: Date;
  updatedAt: Date;
  firstResponseAt?: Date | null | undefined;
  resolvedAt?: Date | null | undefined;
  closedAt?: Date | null | undefined;
}

export interface TicketComment {
  id: string;
  tenantId: string;
  ticketId: string;
  authorId: string;
  authorName: string;
  authorRole: 'AGENT' | 'CUSTOMER' | 'SYSTEM';
  body: string;
  isInternal: boolean;
  createdAt: Date;
}

export interface TicketFilter {
  status?: TicketStatus | TicketStatus[] | undefined;
  priority?: TicketPriority | TicketPriority[] | undefined;
  assignedAgentId?: string | undefined;
  requesterId?: string | undefined;
  search?: string | undefined;
  tags?: string[] | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

export interface PaginatedTickets {
  data: Ticket[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── DOMAIN INVARIANTS & LIFECYCLE ───────────────────────────────────────────

export class TicketLifecycleError extends Error {
  constructor(message: string, readonly code: 'INVALID_TRANSITION' | 'IMMUTABLE_CLOSED' | 'UNASSIGNED_RESOLUTION') {
    super(message);
    this.name = 'TicketLifecycleError';
  }
}

export class TicketLifecycle {
  private static readonly VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
    NEW: ['ASSIGNED', 'IN_PROGRESS', 'CLOSED'],
    ASSIGNED: ['IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED'],
    IN_PROGRESS: ['WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED'],
    WAITING_ON_CUSTOMER: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
    RESOLVED: ['IN_PROGRESS', 'CLOSED'],
    CLOSED: [], // Terminal state
  };

  /**
   * Evaluates whether a status transition is permitted by domain invariants.
   */
  static isValidTransition(current: TicketStatus, next: TicketStatus): boolean {
    if (current === 'CLOSED') return false;
    if (current === next) return true;
    return this.VALID_TRANSITIONS[current]?.includes(next) ?? false;
  }

  /**
   * Applies status transition with strict invariant assertion.
   */
  static transition(ticket: Ticket, nextStatus: TicketStatus, _actorId?: string): Ticket {
    if (ticket.status === 'CLOSED') {
      throw new TicketLifecycleError(
        `Ticket '${ticket.ticketNumber}' is CLOSED and cannot be transitioned to '${nextStatus}'.`,
        'IMMUTABLE_CLOSED',
      );
    }

    if (!this.isValidTransition(ticket.status, nextStatus)) {
      throw new TicketLifecycleError(
        `Cannot transition ticket '${ticket.ticketNumber}' from '${ticket.status}' to '${nextStatus}'.`,
        'INVALID_TRANSITION',
      );
    }

    const now = new Date();
    const updated: Ticket = {
      ...ticket,
      status: nextStatus,
      updatedAt: now,
    };

    if (nextStatus === 'RESOLVED' && !updated.resolvedAt) {
      updated.resolvedAt = now;
    }
    if (nextStatus === 'CLOSED' && !updated.closedAt) {
      updated.closedAt = now;
    }

    return updated;
  }

  /**
   * Factory to construct a new valid Ticket domain entity.
   */
  static create(input: {
    tenantId: string;
    title: string;
    description: string;
    priority?: TicketPriority | undefined;
    requesterId: string;
    requesterEmail: string;
    requesterName?: string | undefined;
    assignedAgentId?: string | null | undefined;
    tags?: string[] | undefined;
    customFields?: Record<string, unknown> | undefined;
  }, sequenceNumber = 1001): Ticket {
    const now = new Date();
    return {
      id: `tick_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      tenantId: input.tenantId,
      ticketNumber: `TICK-${sequenceNumber}`,
      title: input.title.trim(),
      description: input.description.trim(),
      status: input.assignedAgentId ? 'ASSIGNED' : 'NEW',
      priority: input.priority || 'MEDIUM',
      requesterId: input.requesterId,
      requesterEmail: input.requesterEmail,
      requesterName: input.requesterName,
      assignedAgentId: input.assignedAgentId || null,
      assignedAgentName: null,
      tags: input.tags || [],
      customFields: input.customFields || {},
      createdAt: now,
      updatedAt: now,
      firstResponseAt: null,
      resolvedAt: null,
      closedAt: null,
    };
  }
}

// ─── REPOSITORY PORT ABSTRACTION ──────────────────────────────────────────────

export interface ITicketRepository {
  findById(tenantId: string, id: string): Promise<Ticket | null>;
  findByNumber(tenantId: string, ticketNumber: string): Promise<Ticket | null>;
  list(tenantId: string, filter?: TicketFilter): Promise<PaginatedTickets>;
  create(ticket: Ticket): Promise<Ticket>;
  update(ticket: Ticket): Promise<Ticket>;
  delete(tenantId: string, id: string): Promise<boolean>;
  addComment(comment: TicketComment): Promise<TicketComment>;
  listComments(tenantId: string, ticketId: string): Promise<TicketComment[]>;
}

// ─── IN-MEMORY ADAPTER (Zero-Dependency Test & Development) ───────────────────

export class MemoryTicketRepository implements ITicketRepository {
  private tickets = new Map<string, Ticket>();
  private comments = new Map<string, TicketComment[]>();
  private sequence = 1000;

  async findById(tenantId: string, id: string): Promise<Ticket | null> {
    const ticket = this.tickets.get(id);
    if (!ticket || ticket.tenantId !== tenantId) return null;
    return JSON.parse(JSON.stringify(ticket));
  }

  async findByNumber(tenantId: string, ticketNumber: string): Promise<Ticket | null> {
    for (const t of this.tickets.values()) {
      if (t.tenantId === tenantId && t.ticketNumber === ticketNumber) {
        return JSON.parse(JSON.stringify(t));
      }
    }
    return null;
  }

  async list(tenantId: string, filter: TicketFilter = {}): Promise<PaginatedTickets> {
    let results = Array.from(this.tickets.values()).filter((t) => t.tenantId === tenantId);

    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      results = results.filter((t) => statuses.includes(t.status));
    }
    if (filter.priority) {
      const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
      results = results.filter((t) => priorities.includes(t.priority));
    }
    if (filter.assignedAgentId) {
      results = results.filter((t) => t.assignedAgentId === filter.assignedAgentId);
    }
    if (filter.requesterId) {
      results = results.filter((t) => t.requesterId === filter.requesterId);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      results = results.filter((t) => t.title.toLowerCase().includes(q) || t.ticketNumber.toLowerCase().includes(q));
    }

    // Sort descending by creation date
    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const total = results.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const start = (page - 1) * limit;
    const data = results.slice(start, start + limit).map((t) => JSON.parse(JSON.stringify(t)));

    return { data, total, page, limit, totalPages };
  }

  async create(ticket: Ticket): Promise<Ticket> {
    const clone = JSON.parse(JSON.stringify(ticket));
    this.tickets.set(ticket.id, clone);
    return clone;
  }

  async update(ticket: Ticket): Promise<Ticket> {
    const clone = JSON.parse(JSON.stringify(ticket));
    this.tickets.set(ticket.id, clone);
    return clone;
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const t = this.tickets.get(id);
    if (!t || t.tenantId !== tenantId) return false;
    this.tickets.delete(id);
    this.comments.delete(id);
    return true;
  }

  async addComment(comment: TicketComment): Promise<TicketComment> {
    const clone = JSON.parse(JSON.stringify(comment));
    const list = this.comments.get(comment.ticketId) || [];
    list.push(clone);
    this.comments.set(comment.ticketId, list);
    return clone;
  }

  async listComments(tenantId: string, ticketId: string): Promise<TicketComment[]> {
    const list = this.comments.get(ticketId) || [];
    return list.filter((c) => c.tenantId === tenantId).map((c) => JSON.parse(JSON.stringify(c)));
  }

  getNextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }
}
