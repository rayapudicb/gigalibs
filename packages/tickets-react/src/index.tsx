import * as React from 'react';
import {
  type Ticket,
  type TicketStatus,
  type TicketPriority,
  type TicketComment,
  type TicketFilter,
  TicketLifecycle,
} from '@gigalibs/tickets-core';
import { SlaEngine, type SlaEvaluation } from '@gigalibs/sla-engine';
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Input,
  StatusBadge,
  Modal,
} from '@gigalibs/ui';

// ─── HEADLESS HOOK: useTickets ────────────────────────────────────────────────

export interface UseTicketsOptions {
  initialTickets?: Ticket[];
  tenantId: string;
  pollIntervalMs?: number;
}

export function useTickets(options: UseTicketsOptions) {
  if (!options.tenantId.trim()) throw new Error('A tenant ID is required to use tickets.');
  const [tickets, setTickets] = React.useState<Ticket[]>(options.initialTickets || []);
  const [filter, setFilter] = React.useState<TicketFilter>({});
  const [selectedTicketId, setSelectedTicketId] = React.useState<string | null>(null);
  const [commentsMap, setCommentsMap] = React.useState<Record<string, TicketComment[]>>({});
  const [now, setNow] = React.useState<Date>(new Date());

  // Tick clock every 30s to update SLA countdowns reactively
  React.useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const createTicket = React.useCallback(
    (input: {
      title: string;
      description: string;
      priority?: TicketPriority;
      requesterId: string;
      requesterEmail: string;
      requesterName?: string;
      assignedAgentId?: string | null;
      tags?: string[];
    }) => {
      const created = TicketLifecycle.create(
        {
          tenantId: options.tenantId,
          ...input,
        },
        1000 + tickets.length + 1,
      );
      setTickets((prev) => [created, ...prev]);
      return created;
    },
    [tickets.length, options.tenantId],
  );

  const transitionStatus = React.useCallback(
    (ticketId: string, nextStatus: TicketStatus, actorId: string) => {
      if (!actorId.trim()) throw new Error('An actor ID is required for ticket transitions.');
      setTickets((prev) =>
        prev.map((t) => {
          if (t.id !== ticketId) return t;
          return TicketLifecycle.transition(t, nextStatus, actorId);
        }),
      );
    },
    [],
  );

  const assignAgent = React.useCallback(
    (ticketId: string, agentId: string, agentName?: string) => {
      setTickets((prev) =>
        prev.map((t) => {
          if (t.id !== ticketId) return t;
          return {
            ...t,
            assignedAgentId: agentId,
            assignedAgentName: agentName || t.assignedAgentName,
            status: t.status === 'NEW' ? 'ASSIGNED' : t.status,
            updatedAt: new Date(),
          };
        }),
      );
    },
    [],
  );

  const addComment = React.useCallback(
    (ticketId: string, body: string, author: { id: string; name: string; role: 'AGENT' | 'CUSTOMER' | 'SYSTEM'; isInternal?: boolean }) => {
      const newComment: TicketComment = {
        id: `comm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tenantId: options.tenantId,
        ticketId,
        authorId: author.id,
        authorName: author.name,
        authorRole: author.role,
        body,
        isInternal: !!author.isInternal,
        createdAt: new Date(),
      };

      setCommentsMap((prev) => ({
        ...prev,
        [ticketId]: [...(prev[ticketId] || []), newComment],
      }));

      // Record First Response if agent responds
      if (author.role === 'AGENT') {
        setTickets((prev) =>
          prev.map((t) => {
            if (t.id !== ticketId) return t;
            if (!t.firstResponseAt) {
              return {
                ...t,
                firstResponseAt: new Date(),
                status: t.status === 'ASSIGNED' || t.status === 'NEW' ? 'IN_PROGRESS' : t.status,
                updatedAt: new Date(),
              };
            }
            return t;
          }),
        );
      }

      return newComment;
    },
    [options.tenantId],
  );

  const deleteTicket = React.useCallback((ticketId: string) => {
    setTickets((prev) => prev.filter((t) => t.id !== ticketId));
    if (selectedTicketId === ticketId) setSelectedTicketId(null);
  }, [selectedTicketId]);

  const filteredTickets = React.useMemo(() => {
    return tickets.filter((t) => {
      if (filter.status) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
        if (!statuses.includes(t.status)) return false;
      }
      if (filter.priority) {
        const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
        if (!priorities.includes(t.priority)) return false;
      }
      if (filter.search) {
        const q = filter.search.toLowerCase();
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchNo = t.ticketNumber.toLowerCase().includes(q);
        const matchCustomer = t.requesterEmail.toLowerCase().includes(q) || (t.requesterName || '').toLowerCase().includes(q);
        if (!matchTitle && !matchNo && !matchCustomer) return false;
      }
      return true;
    });
  }, [tickets, filter]);

  const selectedTicket = React.useMemo(
    () => tickets.find((t) => t.id === selectedTicketId) || null,
    [tickets, selectedTicketId],
  );

  const getTicketSla = React.useCallback(
    (ticket: Ticket): SlaEvaluation => {
      return SlaEngine.evaluate(
        ticket.createdAt,
        ticket.priority,
        undefined,
        ticket.firstResponseAt,
        ticket.resolvedAt,
        now,
      );
    },
    [now],
  );

  return {
    tickets: filteredTickets,
    rawTickets: tickets,
    selectedTicket,
    selectedTicketId,
    setSelectedTicketId,
    filter,
    setFilter,
    createTicket,
    transitionStatus,
    assignAgent,
    addComment,
    deleteTicket,
    getTicketSla,
    comments: selectedTicketId ? (commentsMap[selectedTicketId] || []) : [],
  };
}

// ─── SLA BADGE COMPONENT ─────────────────────────────────────────────────────

export const SlaBadge: React.FC<{ sla: SlaEvaluation }> = ({ sla }) => {
  if (sla.overallStatus === 'BREACHED') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
        ⚠️ SLA Breached ({SlaEngine.formatRemaining(sla.resolutionMinutesRemaining)})
      </span>
    );
  }
  if (sla.overallStatus === 'AT_RISK') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
        ⏳ SLA Warning ({SlaEngine.formatRemaining(sla.resolutionMinutesRemaining)})
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
      ✓ On Track ({SlaEngine.formatRemaining(sla.resolutionMinutesRemaining)})
    </span>
  );
};

// ─── PRODUCTION UI: TicketQueueTable ─────────────────────────────────────────

export interface TicketQueueTableProps {
  tickets: Ticket[];
  getTicketSla: (t: Ticket) => SlaEvaluation;
  onSelectTicket: (t: Ticket) => void;
  onTransitionStatus: (id: string, status: TicketStatus) => void;
  onDeleteTicket: (id: string) => void;
}

export const TicketQueueTable: React.FC<TicketQueueTableProps> = ({
  tickets,
  getTicketSla,
  onSelectTicket,
  onTransitionStatus,
  onDeleteTicket,
}) => {
  return (
    <div className="overflow-x-auto border border-slate-200 rounded-2xl bg-white shadow-xs">
      <table className="w-full text-xs text-left">
        <thead className="bg-slate-50 border-b text-slate-500 font-bold">
          <tr>
            <th className="p-3">Ticket #</th>
            <th className="p-3">Subject & Requester</th>
            <th className="p-3">Priority</th>
            <th className="p-3">SLA Status</th>
            <th className="p-3">Assigned Agent</th>
            <th className="p-3">Status</th>
            <th className="p-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {tickets.length === 0 ? (
            <tr>
              <td colSpan={7} className="p-8 text-center text-slate-400 font-medium">
                No tickets matching current filters.
              </td>
            </tr>
          ) : (
            tickets.map((t) => {
              const sla = getTicketSla(t);
              return (
                <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="p-3 font-mono font-bold text-blue-600">
                    <button
                      onClick={() => onSelectTicket(t)}
                      className="hover:underline font-mono"
                    >
                      {t.ticketNumber}
                    </button>
                  </td>
                  <td className="p-3">
                    <div className="font-bold text-slate-900">{t.title}</div>
                    <div className="text-[10px] text-slate-400">
                      {t.requesterName || t.requesterEmail}
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge variant={t.priority === 'URGENT' ? 'danger' : t.priority === 'HIGH' ? 'warning' : 'info'}>
                      {t.priority}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <SlaBadge sla={sla} />
                  </td>
                  <td className="p-3">
                    {t.assignedAgentName || t.assignedAgentId || (
                      <span className="text-slate-400 italic">Unassigned</span>
                    )}
                  </td>
                  <td className="p-3">
                    <StatusBadge
                      variant={
                        t.status === 'RESOLVED'
                          ? 'success'
                          : t.status === 'CLOSED'
                          ? 'neutral'
                          : t.status === 'IN_PROGRESS'
                          ? 'info'
                          : 'warning'
                      }
                    >
                      {t.status}
                    </StatusBadge>
                  </td>
                  <td className="p-3 text-right space-x-2">
                    <button
                      onClick={() => onSelectTicket(t)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-bold"
                    >
                      View
                    </button>
                    {t.status !== 'RESOLVED' && t.status !== 'CLOSED' && (
                      <button
                        onClick={() => onTransitionStatus(t.id, 'RESOLVED')}
                        className="text-xs text-emerald-600 hover:text-emerald-800 font-bold"
                      >
                        Resolve ✓
                      </button>
                    )}
                    <button
                      onClick={() => onDeleteTicket(t.id)}
                      className="text-xs text-rose-600 hover:text-rose-800 font-bold"
                    >
                      🗑️ Delete
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};
