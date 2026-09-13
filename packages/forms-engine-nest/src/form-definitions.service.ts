import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { FormDefinitionBody, FormDefinitionRecord, MergeOptions } from './types.js';
import { mergeDefinitions } from './types.js';

export const FORMS_ENGINE_POOL = 'FORMS_ENGINE_POOL';
export const FORMS_ENGINE_SCHEMA = 'FORMS_ENGINE_SCHEMA';

// ─── DB row shape ─────────────────────────────────────────────────────────────

interface DbRow {
  id: string;
  form_key: string;
  tenant_id: string | null;
  definition: FormDefinitionBody;
  version: number;
  status: 'DRAFT' | 'PUBLISHED';
  published_at: Date | null;
  published_by: string | null;
  created_at: Date;
  updated_at: Date;
}

function toRecord(row: DbRow): FormDefinitionRecord {
  return {
    id: row.id,
    formKey: row.form_key,
    tenantId: row.tenant_id,
    definition: row.definition,
    version: row.version,
    status: row.status,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class FormDefinitionsService {
  constructor(
    @Inject(FORMS_ENGINE_POOL) private readonly pool: Pool,
    @Inject(FORMS_ENGINE_SCHEMA) private readonly schema: string,
  ) {}

  // ── Queries ────────────────────────────────────────────────────────────────

  /**
   * Returns the PUBLISHED definition for a given form key.
   * Pass `tenantId` to scope by tenant; omit for platform layer only.
   */
  async getPublished(
    formKey: string,
    tenantId: string | null,
  ): Promise<FormDefinitionRecord | null> {
    const result = await this.pool.query<DbRow>(
      `SELECT * FROM ${this.schema}.form_definitions
       WHERE form_key = $1
         AND status = 'PUBLISHED'
         AND (tenant_id = $2 OR ($2::uuid IS NULL AND tenant_id IS NULL))
       LIMIT 1`,
      [formKey, tenantId],
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  /**
   * Returns the merged effective definition a tenant's users see at runtime.
   *
   * Resolution order:
   *  1. Fetch platform base (tenant_id IS NULL, PUBLISHED)
   *  2. Fetch tenant extension (tenant_id = tenantId, PUBLISHED)
   *  3. mergeDefinitions(base, tenantLayer, { lockedKeys })
   *
   * If no platform base is published, returns the tenant layer alone.
   * If no tenant extension exists, returns the platform base unchanged.
   */
  async getEffectiveDefinition(
    formKey: string,
    tenantId: string,
    mergeOptions: MergeOptions = {},
  ): Promise<FormDefinitionBody | null> {
    const client = await this.pool.connect();
    try {
      // Set RLS tenant context so the policy lets us read both platform (tenant_id IS NULL)
      // and tenant rows in one query.
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

      const result = await client.query<DbRow>(
        `SELECT * FROM ${this.schema}.form_definitions
         WHERE form_key = $1
           AND status = 'PUBLISHED'
           AND (tenant_id IS NULL OR tenant_id = $2::uuid)
         ORDER BY tenant_id NULLS FIRST`,
        [formKey, tenantId],
      );

      const platform = result.rows.find((r) => r.tenant_id === null) ?? null;
      const tenant = result.rows.find((r) => r.tenant_id === tenantId) ?? null;

      if (!platform && !tenant) return null;
      if (!platform && tenant) return tenant.definition;
      if (platform && !tenant) return platform.definition;

      return mergeDefinitions(platform!.definition, tenant!.definition, mergeOptions);
    } finally {
      client.release();
    }
  }

  /** Returns the current DRAFT for editing in the Form Builder UI. */
  async getDraft(formKey: string, tenantId: string | null): Promise<FormDefinitionRecord | null> {
    const result = await this.pool.query<DbRow>(
      `SELECT * FROM ${this.schema}.form_definitions
       WHERE form_key = $1
         AND status = 'DRAFT'
         AND (tenant_id = $2 OR ($2::uuid IS NULL AND tenant_id IS NULL))
       ORDER BY updated_at DESC
       LIMIT 1`,
      [formKey, tenantId],
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  // ── Writes ─────────────────────────────────────────────────────────────────

  /**
   * Upserts a draft for a form key + tenant pair.
   * Tenant Form Builder UI calls this on every save.
   */
  async saveDraft(
    formKey: string,
    tenantId: string | null,
    definition: FormDefinitionBody,
  ): Promise<FormDefinitionRecord> {
    const result = await this.pool.query<DbRow>(
      `INSERT INTO ${this.schema}.form_definitions
         (form_key, tenant_id, definition, status)
       VALUES ($1, $2, $3, 'DRAFT')
       ON CONFLICT ON CONSTRAINT form_definitions_draft_key
       DO UPDATE SET
         definition = EXCLUDED.definition,
         version    = ${this.schema}.form_definitions.version + 1,
         updated_at = transaction_timestamp()
       RETURNING *`,
      [formKey, tenantId, JSON.stringify(definition)],
    );

    // Fallback: no partial unique index for drafts in the ON CONFLICT clause;
    // use a manual upsert via explicit SELECT + INSERT/UPDATE.
    if (!result.rows[0]) {
      return this._manualUpsertDraft(formKey, tenantId, definition);
    }

    return toRecord(result.rows[0]);
  }

  private async _manualUpsertDraft(
    formKey: string,
    tenantId: string | null,
    definition: FormDefinitionBody,
  ): Promise<FormDefinitionRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (tenantId) {
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      }

      const existing = await client.query<DbRow>(
        `SELECT * FROM ${this.schema}.form_definitions
         WHERE form_key = $1 AND status = 'DRAFT'
           AND (tenant_id = $2 OR ($2::uuid IS NULL AND tenant_id IS NULL))
         LIMIT 1`,
        [formKey, tenantId],
      );

      let row: DbRow;
      if (existing.rows[0]) {
        const upd = await client.query<DbRow>(
          `UPDATE ${this.schema}.form_definitions
           SET definition = $3, version = version + 1, updated_at = transaction_timestamp()
           WHERE id = $1 AND tenant_id IS NOT DISTINCT FROM $2
           RETURNING *`,
          [existing.rows[0].id, tenantId, JSON.stringify(definition)],
        );
        row = upd.rows[0]!;
      } else {
        const ins = await client.query<DbRow>(
          `INSERT INTO ${this.schema}.form_definitions
             (form_key, tenant_id, definition, status)
           VALUES ($1, $2, $3, 'DRAFT')
           RETURNING *`,
          [formKey, tenantId, JSON.stringify(definition)],
        );
        row = ins.rows[0]!;
      }

      await client.query('COMMIT');
      return toRecord(row);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Publishes the current draft for a form key.
   * Atomically: demotes existing PUBLISHED → DRAFT (archived), promotes DRAFT → PUBLISHED.
   */
  async publish(
    formKey: string,
    tenantId: string | null,
    publishedBy: string,
  ): Promise<FormDefinitionRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (tenantId) {
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      }

      const draft = await this._getDraftForUpdate(client, formKey, tenantId);
      if (!draft) {
        throw new NotFoundException(`No draft found for form "${formKey}"`);
      }

      // Archive current published version (rename status to avoid unique index conflict)
      await client.query(
        `UPDATE ${this.schema}.form_definitions
         SET status = 'ARCHIVED', updated_at = transaction_timestamp()
         WHERE form_key = $1
           AND status = 'PUBLISHED'
           AND (tenant_id = $2 OR ($2::uuid IS NULL AND tenant_id IS NULL))`,
        [formKey, tenantId],
      );

      // Promote draft to published
      const result = await client.query<DbRow>(
        `UPDATE ${this.schema}.form_definitions
         SET status = 'PUBLISHED',
             published_at = transaction_timestamp(),
             published_by = $3,
             updated_at = transaction_timestamp()
         WHERE id = $1
           AND tenant_id IS NOT DISTINCT FROM $2
         RETURNING *`,
        [draft.id, tenantId, publishedBy],
      );

      await client.query('COMMIT');
      return toRecord(result.rows[0]!);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async _getDraftForUpdate(
    client: PoolClient,
    formKey: string,
    tenantId: string | null,
  ): Promise<FormDefinitionRecord | null> {
    const result = await client.query<DbRow>(
      `SELECT * FROM ${this.schema}.form_definitions
       WHERE form_key = $1
         AND status = 'DRAFT'
         AND (tenant_id = $2 OR ($2::uuid IS NULL AND tenant_id IS NULL))
       ORDER BY updated_at DESC
       LIMIT 1
       FOR UPDATE`,
      [formKey, tenantId],
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  // ── Registry ───────────────────────────────────────────────────────────────

  /** Lists all distinct form_keys that have at least one published platform definition. */
  async listFormKeys(): Promise<string[]> {
    const result = await this.pool.query<{ form_key: string }>(
      `SELECT DISTINCT form_key FROM ${this.schema}.form_definitions
       WHERE status = 'PUBLISHED' AND tenant_id IS NULL
       ORDER BY form_key`,
    );
    return result.rows.map((r) => r.form_key);
  }
}
