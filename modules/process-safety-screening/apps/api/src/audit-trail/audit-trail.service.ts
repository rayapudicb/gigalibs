import {
  type ListSpeedAuditQueryV1,
  type SpeedAuditEntryV1,
  type SpeedAuditPageV1,
  holdsPermission,
} from '@gigalibs/contracts';
import type { ModulePrincipal } from '@gigalibs/module-sdk';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';

// WI-OI-120cc (SPEED; screen spec §3.3; FR-AUD-01, 02): the audit trail, read from SPEED's append-only audit table.
// `speed.audit.read` reads every entry of the workspace; `speed.audit.read-own` only the member's own; anyone else is
// refused. Filters: a route (the route's own entries, entries naming it and those of its current steps), a person, an
// action and a time range.

const EXPORT_LIMIT = 10_000;

interface Row {
  id: string;
  occurred_at: Date;
  actor_subject: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
}

function toEntry(row: Row): SpeedAuditEntryV1 {
  const payload = row.payload ?? {};
  const changes = payload['changes'];
  return {
    id: row.id,
    occurredAt: new Date(row.occurred_at).toISOString(),
    actor: row.actor_subject,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    changes:
      changes && typeof changes === 'object'
        ? Object.entries(changes as Record<string, { from?: unknown; to?: unknown }>).map(
            ([field, change]) => ({
              field,
              from: change?.from ?? null,
              to: change?.to ?? null,
            }),
          )
        : [],
    reason: typeof payload['reason'] === 'string' ? payload['reason'] : null,
  };
}

@Injectable()
export class AuditTrailService {
  constructor(private readonly database: DatabaseService) {}

  /** Whether the member reads everything, only their own entries, or nothing (refused). */
  private scope(principal: ModulePrincipal): 'ALL' | 'OWN' {
    if (holdsPermission(principal.permissions, 'speed.audit.read')) return 'ALL';
    if (holdsPermission(principal.permissions, 'speed.audit.read-own')) return 'OWN';
    throw new ForbiddenException({
      code: 'SPEED_AUDIT_FORBIDDEN',
      message: 'The audit trail needs speed.audit.read or speed.audit.read-own.',
    });
  }

  private where(principal: ModulePrincipal, query: ListSpeedAuditQueryV1, scope: 'ALL' | 'OWN') {
    const values: unknown[] = [principal.tenantId];
    const clauses = ['a.tenant_id = $1'];
    const add = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (scope === 'OWN') clauses.push(`a.actor_subject = ${add(principal.subject)}`);
    if (query.actor) clauses.push(`a.actor_subject = ${add(query.actor)}`);
    if (query.action) clauses.push(`a.action = ${add(query.action)}`);
    if (query.from) clauses.push(`a.occurred_at >= ${add(query.from)}::timestamptz`);
    if (query.to) clauses.push(`a.occurred_at <= ${add(query.to)}::timestamptz`);
    if (query.routeId) {
      const route = add(query.routeId);
      clauses.push(`(a.entity_id = ${route}::text OR a.payload ->> 'routeId' = ${route}::text
        OR a.entity_id IN (SELECT s.id::text FROM ${SCHEMA}.steps s WHERE s.tenant_id = $1 AND s.route_id = ${route}::uuid)
        OR a.payload ->> 'stepId' IN (SELECT s.id::text FROM ${SCHEMA}.steps s WHERE s.tenant_id = $1 AND s.route_id = ${route}::uuid))`);
    }
    return { sql: clauses.join(' AND '), values };
  }

  async list(principal: ModulePrincipal, query: ListSpeedAuditQueryV1): Promise<SpeedAuditPageV1> {
    const scope = this.scope(principal);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const { sql, values } = this.where(principal, query, scope);
      const total = await client.query<{ count: string }>(
        `SELECT count(*) FROM ${SCHEMA}.audit_events a WHERE ${sql}`,
        values,
      );
      const rows = await client.query<Row>(
        `SELECT a.id, a.occurred_at, a.actor_subject, a.action, a.entity_type, a.entity_id, a.payload
           FROM ${SCHEMA}.audit_events a WHERE ${sql}
          ORDER BY a.occurred_at DESC, a.id DESC
          LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
        values,
      );
      return {
        items: rows.rows.map(toEntry),
        total: Number(total.rows[0]?.count ?? 0),
        page: query.page,
        pageSize: query.pageSize,
        ownOnly: scope === 'OWN',
      };
    });
  }

  /** The filtered entries as CSV (RFC 4180), newest first, up to EXPORT_LIMIT rows; `speed.audit.read` only. */
  async csv(principal: ModulePrincipal, query: ListSpeedAuditQueryV1): Promise<string> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const { sql, values } = this.where(principal, query, 'ALL');
      const rows = await client.query<Row>(
        `SELECT a.id, a.occurred_at, a.actor_subject, a.action, a.entity_type, a.entity_id, a.payload
           FROM ${SCHEMA}.audit_events a WHERE ${sql}
          ORDER BY a.occurred_at DESC, a.id DESC LIMIT ${EXPORT_LIMIT}`,
        values,
      );
      const quote = (value: string) =>
        /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
      const text = (value: string) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);
      const shown = (value: unknown) =>
        value === null || value === undefined
          ? ''
          : typeof value === 'string'
            ? value
            : JSON.stringify(value);
      const lines = [
        ['time_utc', 'user', 'action', 'record_type', 'record_id', 'field', 'old', 'new', 'reason'],
      ];
      for (const entry of rows.rows.map(toEntry)) {
        const changes = entry.changes.length
          ? entry.changes
          : [{ field: '', from: null, to: null }];
        for (const change of changes)
          lines.push([
            entry.occurredAt,
            entry.actor,
            entry.action,
            entry.entityType,
            entry.entityId ?? '',
            change.field,
            text(shown(change.from)),
            text(shown(change.to)),
            text(entry.reason ?? ''),
          ]);
      }
      return `${lines.map((line) => line.map(quote).join(',')).join('\r\n')}\r\n`;
    });
  }
}
