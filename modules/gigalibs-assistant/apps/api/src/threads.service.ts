import { createHash, randomUUID } from 'node:crypto';
import type { ModuleCommandContext, ModulePrincipal } from '@gigalibs/module-sdk';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type pg from 'pg';
import { DatabaseService } from './database.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/;
const READ = 'assistant:thread:read';
const WRITE = 'assistant:thread:write';

type ThreadRow = {
  id: string; tenant_id: string; owner_user_id: string; title: string; version: number;
  policy_version: string; policy_checksum: string; expires_at: Date;
  created_at: Date; updated_at: Date; request_sha256: string;
};
type MessageRow = {
  id: string; thread_id: string; role: 'USER' | 'ASSISTANT'; content: string;
  created_at: Date; request_sha256: string;
};
type PolicyRow = { source_manifest_version: string; source_checksum: string; retention_days: number };
type PageCursor = { createdAt: string; id: string };

function exactPermission(principal: ModulePrincipal, permission: string): void {
  // The gateway and generic guard may accept '*' or 'assistant:*'. Neither authorizes private history.
  if (!principal.permissions.includes(permission)) throw new ForbiddenException('Exact Assistant thread permission required.');
}
function id(value: string): string {
  if (!UUID.test(value)) throw new BadRequestException('Invalid record identifier.');
  return value;
}
function key(value: string | undefined): string {
  if (!value || !IDEMPOTENCY_KEY.test(value)) throw new BadRequestException('A valid Idempotency-Key is required.');
  return value;
}
function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function limit(value: string | undefined): number {
  if (value === undefined) return 20;
  if (!/^\d{1,2}$/.test(value)) throw new BadRequestException('Invalid page limit.');
  const parsed = Number(value);
  if (parsed < 1 || parsed > 50) throw new BadRequestException('Page limit must be 1–50.');
  return parsed;
}
function cursor(value: string | undefined): PageCursor | null {
  if (!value) return null;
  if (value.length > 256) throw new BadRequestException('Invalid page cursor.');
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 2 ||
      typeof parsed[0] !== 'string' || !Number.isFinite(Date.parse(parsed[0])) ||
      typeof parsed[1] !== 'string' || !UUID.test(parsed[1])) throw new Error('bad cursor');
    return { createdAt: new Date(parsed[0]).toISOString(), id: parsed[1] };
  } catch {
    throw new BadRequestException('Invalid page cursor.');
  }
}
function nextCursor(row: { created_at: Date; id: string } | undefined): string | null {
  return row ? Buffer.from(JSON.stringify([row.created_at.toISOString(), row.id])).toString('base64url') : null;
}
function threadView(row: ThreadRow, currentRetentionDays: number) {
  const currentPolicyExpiry = row.created_at.getTime() + currentRetentionDays * 86_400_000;
  const effectiveExpiry = new Date(Math.min(row.expires_at.getTime(), currentPolicyExpiry));
  return {
    id: row.id, title: row.title, version: row.version, policyVersion: row.policy_version,
    expiresAt: effectiveExpiry.toISOString(), createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  };
}
function messageView(row: MessageRow) {
  return { id: row.id, threadId: row.thread_id, role: row.role, content: row.content, createdAt: row.created_at.toISOString() };
}

@Injectable()
export class ThreadsService {
  constructor(private readonly database: DatabaseService) {}

  private async withActor<T>(principal: ModulePrincipal, permission: string, operation: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    exactPermission(principal, permission);
    if (!principal.subject || principal.subject.length > 128) throw new ForbiddenException('Invalid actor.');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await client.query("SELECT set_config('app.actor_id', $1, true)", [principal.subject]);
      return operation(client);
    });
  }

  private async policy(client: pg.PoolClient, tenantId: string): Promise<PolicyRow> {
    const result = await client.query<PolicyRow>(
      "SELECT source_manifest_version, source_checksum, retention_days FROM tenant_policies WHERE tenant_id = $1 AND status = 'PUBLISHED'",
      [tenantId],
    );
    if (!result.rows[0]) throw new ServiceUnavailableException('Assistant private history requires a published tenant policy.');
    return result.rows[0];
  }

  private async ownedThread(client: pg.PoolClient, principal: ModulePrincipal, threadId: string,
    retentionDays: number, lock = false): Promise<ThreadRow> {
    const result = await client.query<ThreadRow>(
      `SELECT id, tenant_id, owner_user_id, title, version, policy_version, policy_checksum, expires_at, created_at, updated_at, request_sha256
         FROM assistant_threads WHERE tenant_id = $1 AND owner_user_id = $2 AND id = $3
           AND expires_at > now() AND created_at > now() - ($4::int * interval '1 day') ${lock ? 'FOR UPDATE' : ''}`,
      [principal.tenantId, principal.subject, id(threadId), retentionDays],
    );
    if (!result.rows[0]) throw new NotFoundException('Assistant thread not found.');
    return result.rows[0];
  }

  async list(context: ModuleCommandContext, rawLimit?: string, rawCursor?: string) {
    const pageSize = limit(rawLimit);
    const pageCursor = cursor(rawCursor);
    return this.withActor(context.principal, READ, async (client) => {
      const policy = await this.policy(client, context.principal.tenantId);
      const result = await client.query<ThreadRow>(
        `SELECT id, tenant_id, owner_user_id, title, version, policy_version, policy_checksum, expires_at, created_at, updated_at, request_sha256
           FROM assistant_threads
          WHERE tenant_id = $1 AND owner_user_id = $2 AND expires_at > now()
            AND created_at > now() - ($3::int * interval '1 day')
            AND ($4::timestamptz IS NULL OR (created_at, id) < ($4::timestamptz, $5::uuid))
          ORDER BY created_at DESC, id DESC LIMIT $6`,
        [context.principal.tenantId, context.principal.subject, policy.retention_days,
          pageCursor?.createdAt ?? null, pageCursor?.id ?? null, pageSize + 1],
      );
      const rows = result.rows.slice(0, pageSize);
      return { items: rows.map((row) => threadView(row, policy.retention_days)),
        nextCursor: result.rows.length > pageSize ? nextCursor(rows.at(-1)) : null };
    });
  }

  async get(context: ModuleCommandContext, threadId: string) {
    return this.withActor(context.principal, READ, async (client) => {
      const policy = await this.policy(client, context.principal.tenantId);
      const row = await this.ownedThread(client, context.principal, threadId, policy.retention_days);
      await this.audit(client, context, row.id, 'THREAD_READ');
      return threadView(row, policy.retention_days);
    });
  }

  async create(context: ModuleCommandContext, titleValue: unknown, rawKey?: string) {
    if (typeof titleValue !== 'string' || titleValue.trim().length < 1 || titleValue.trim().length > 120)
      throw new BadRequestException('Title must be 1–120 characters.');
    const title = titleValue.trim();
    const idempotencyKey = key(rawKey);
    const requestHash = hash({ title });
    return this.withActor(context.principal, WRITE, async (client) => {
      const policy = await this.policy(client, context.principal.tenantId);
      const result = await client.query<ThreadRow>(
        `INSERT INTO assistant_threads
           (id, tenant_id, owner_user_id, title, idempotency_key, request_sha256, policy_version, policy_checksum, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now() + ($9::int * interval '1 day'))
         ON CONFLICT (tenant_id, owner_user_id, idempotency_key) DO NOTHING
         RETURNING id, tenant_id, owner_user_id, title, version, policy_version, policy_checksum, expires_at, created_at, updated_at, request_sha256`,
        [randomUUID(), context.principal.tenantId, context.principal.subject, title, idempotencyKey,
          requestHash, policy.source_manifest_version, policy.source_checksum, policy.retention_days],
      );
      if (result.rows[0]) {
        await this.audit(client, context, result.rows[0].id, 'THREAD_CREATED');
        return threadView(result.rows[0], policy.retention_days);
      }
      const previous = await client.query<ThreadRow>(
        `SELECT id, tenant_id, owner_user_id, title, version, policy_version, policy_checksum, expires_at, created_at, updated_at, request_sha256
           FROM assistant_threads WHERE tenant_id=$1 AND owner_user_id=$2 AND idempotency_key=$3
             AND expires_at > now() AND created_at > now() - ($4::int * interval '1 day')`,
        [context.principal.tenantId, context.principal.subject, idempotencyKey, policy.retention_days],
      );
      if (!previous.rows[0] || previous.rows[0].request_sha256 !== requestHash)
        throw new ConflictException('Idempotency key was already used for a different request.');
      return threadView(previous.rows[0], policy.retention_days);
    });
  }

  async messages(context: ModuleCommandContext, threadId: string, rawLimit?: string, rawCursor?: string) {
    const pageSize = limit(rawLimit);
    const pageCursor = cursor(rawCursor);
    return this.withActor(context.principal, READ, async (client) => {
      const policy = await this.policy(client, context.principal.tenantId);
      const thread = await this.ownedThread(client, context.principal, threadId, policy.retention_days);
      const result = await client.query<MessageRow>(
        `SELECT id, thread_id, role, content, created_at, request_sha256 FROM assistant_messages
          WHERE tenant_id=$1 AND owner_user_id=$2 AND thread_id=$3
            AND ($4::timestamptz IS NULL OR (created_at, id) < ($4::timestamptz, $5::uuid))
          ORDER BY created_at DESC, id DESC LIMIT $6`,
        [context.principal.tenantId, context.principal.subject, thread.id, pageCursor?.createdAt ?? null,
          pageCursor?.id ?? null, pageSize + 1],
      );
      await this.audit(client, context, thread.id, 'MESSAGES_READ');
      const rows = result.rows.slice(0, pageSize);
      return { items: rows.map(messageView), nextCursor: result.rows.length > pageSize ? nextCursor(rows.at(-1)) : null };
    });
  }

  async appendUserMessage(context: ModuleCommandContext, threadId: string, body: unknown, rawKey?: string) {
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).sort().join(',') !== 'content,expectedVersion')
      throw new BadRequestException('Only content and expectedVersion are accepted.');
    const { content, expectedVersion } = body as Record<string, unknown>;
    if (typeof content !== 'string' || content.trim().length < 1 || content.length > 8192 ||
      !Number.isSafeInteger(expectedVersion) || Number(expectedVersion) < 1)
      throw new BadRequestException('Invalid message content or expectedVersion.');
    const idempotencyKey = key(rawKey);
    const requestHash = hash({ threadId, content, expectedVersion });
    return this.withActor(context.principal, WRITE, async (client) => {
      const policy = await this.policy(client, context.principal.tenantId);
      const thread = await this.ownedThread(client, context.principal, threadId, policy.retention_days, true);
      const previous = await client.query<MessageRow>(
        'SELECT id, thread_id, role, content, created_at, request_sha256 FROM assistant_messages WHERE tenant_id=$1 AND owner_user_id=$2 AND thread_id=$3 AND idempotency_key=$4',
        [context.principal.tenantId, context.principal.subject, thread.id, idempotencyKey],
      );
      if (previous.rows[0]) {
        if (previous.rows[0].request_sha256 !== requestHash)
          throw new ConflictException('Idempotency key was already used for a different request.');
        return messageView(previous.rows[0]);
      }
      // Existing messages remain readable under their original retention window, but a new
      // write cannot silently inherit a changed published policy. Start a new thread instead.
      if (thread.policy_version !== policy.source_manifest_version || thread.policy_checksum !== policy.source_checksum)
        throw new ConflictException('Assistant policy changed; start a new thread under the current policy.');
      if (thread.version !== expectedVersion) throw new ConflictException('Assistant thread version changed; reload before retrying.');
      const inserted = await client.query<MessageRow>(
        `INSERT INTO assistant_messages
           (id, tenant_id, thread_id, owner_user_id, actor_user_id, role, content, idempotency_key, request_sha256)
         VALUES ($1,$2,$3,$4,$4,'USER',$5,$6,$7)
         RETURNING id, thread_id, role, content, created_at, request_sha256`,
        [randomUUID(), context.principal.tenantId, thread.id, context.principal.subject, content, idempotencyKey, requestHash],
      );
      await client.query('UPDATE assistant_threads SET version=version+1, updated_at=now() WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3',
        [context.principal.tenantId, context.principal.subject, thread.id]);
      await this.audit(client, context, thread.id, 'MESSAGE_CREATED');
      return messageView(inserted.rows[0]);
    });
  }

  private async audit(client: pg.PoolClient, context: ModuleCommandContext, threadId: string, action: string) {
    await client.query(
      'INSERT INTO audit_events (id, tenant_id, actor_user_id, thread_id, action, correlation_id) VALUES ($1,$2,$3,$4,$5,$6)',
      [randomUUID(), context.principal.tenantId, context.principal.subject, threadId, action, context.correlationId],
    );
  }
}
