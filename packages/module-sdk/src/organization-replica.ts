// WI-OI-109e2 (ADR-0018 §3): a module's own copy of the organization versions the control plane activates, received
// page by page through kernel `module.call` jobs, checked (count, parents, checksum) and expanded locally, so a signed
// context carries only grant roots and a version. A version is immutable once held; a module refuses a context naming
// a version it does not hold yet.

/** A `pg` client or pool inside the module's tenant transaction (`app.tenant_id` set, forced RLS). */
export interface ReplicaClient {
  query<R extends Record<string, unknown> = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: R[] }>;
}

export interface ReplicaUnit {
  readonly unit_id: string;
  readonly parent_unit_id: string | null;
  readonly code: string;
  readonly name: string;
  readonly sort_order: number;
  readonly status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  readonly holds_records: boolean;
  readonly type_code: string;
}

export interface ReplicaHeader {
  readonly tree_id: string;
  readonly tree_kind: 'PRIMARY' | 'ALTERNATE';
  readonly version_number: number;
  readonly checksum: string;
}

export interface ReplicaResult {
  readonly version_id: string;
  readonly status: 'RECEIVING' | 'READY';
  readonly received_units: number;
}

/** A page or completion that contradicts what the module holds; the job fails visibly instead of storing it. */
export class OrganizationReplicaConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrganizationReplicaConflictError';
  }
}

const SCHEMA = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * The replica tables in a module schema. Each module's migration holds this exact text for its schema (a test keeps
 * them equal), so the tables are the same everywhere.
 */
export function organizationReplicaDdl(schema: string): string {
  if (!SCHEMA.test(schema)) throw new Error(`Unsafe schema name: ${schema}`);
  const tenantPolicy = (table: string) => `ALTER TABLE ${schema}.${table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${schema}.${table} FORCE ROW LEVEL SECURITY;
CREATE POLICY ${table}_tenant_isolation ON ${schema}.${table}
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));`;
  return `CREATE TABLE ${schema}.org_replica_versions (
  tenant_id VARCHAR(64) NOT NULL,
  version_id VARCHAR(64) NOT NULL,
  tree_id VARCHAR(64) NOT NULL,
  tree_kind VARCHAR(16) NOT NULL CHECK (tree_kind IN ('PRIMARY', 'ALTERNATE')),
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  checksum CHAR(71) NOT NULL CHECK (checksum ~ '^sha256:[0-9a-f]{64}$'),
  status VARCHAR(16) NOT NULL DEFAULT 'RECEIVING' CHECK (status IN ('RECEIVING', 'READY')),
  unit_count INTEGER CHECK (unit_count >= 0),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ready_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, version_id),
  CHECK ((status = 'READY') = (ready_at IS NOT NULL AND unit_count IS NOT NULL))
);

CREATE TABLE ${schema}.org_replica_units (
  tenant_id VARCHAR(64) NOT NULL,
  version_id VARCHAR(64) NOT NULL,
  unit_id VARCHAR(64) NOT NULL,
  parent_unit_id VARCHAR(64),
  code VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  status VARCHAR(16) NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  holds_records BOOLEAN NOT NULL,
  type_code VARCHAR(40) NOT NULL,
  PRIMARY KEY (tenant_id, version_id, unit_id),
  FOREIGN KEY (tenant_id, version_id) REFERENCES ${schema}.org_replica_versions (tenant_id, version_id) ON DELETE CASCADE,
  CHECK (parent_unit_id IS NULL OR parent_unit_id <> unit_id)
);

CREATE TABLE ${schema}.org_replica_closure (
  tenant_id VARCHAR(64) NOT NULL,
  version_id VARCHAR(64) NOT NULL,
  ancestor_unit_id VARCHAR(64) NOT NULL,
  descendant_unit_id VARCHAR(64) NOT NULL,
  depth SMALLINT NOT NULL CHECK (depth BETWEEN 0 AND 16),
  PRIMARY KEY (tenant_id, version_id, ancestor_unit_id, descendant_unit_id),
  FOREIGN KEY (tenant_id, version_id) REFERENCES ${schema}.org_replica_versions (tenant_id, version_id) ON DELETE CASCADE
);
CREATE INDEX org_replica_closure_descendant ON ${schema}.org_replica_closure (tenant_id, version_id, descendant_unit_id);

${tenantPolicy('org_replica_versions')}
${tenantPolicy('org_replica_units')}
${tenantPolicy('org_replica_closure')}`;
}

export class OrganizationReplica {
  readonly #schema: string;

  constructor(schema: string) {
    if (!SCHEMA.test(schema)) throw new Error(`Unsafe schema name: ${schema}`);
    this.#schema = schema;
  }

  /** Stores one page. A held version ignores it; a header that differs from the first page's is refused. */
  async receivePage(client: ReplicaClient, tenantId: string, versionId: string, header: ReplicaHeader, units: readonly ReplicaUnit[]): Promise<ReplicaResult> {
    const held = await this.lockVersion(client, tenantId, versionId, header);
    if (held.status === 'READY') return this.result(client, tenantId, versionId, 'READY');
    await client.query(
      `INSERT INTO ${this.#schema}.org_replica_units
         (tenant_id, version_id, unit_id, parent_unit_id, code, name, sort_order, status, holds_records, type_code)
       SELECT $1, $2, u.unit_id, u.parent_unit_id, u.code, u.name, u.sort_order, u.status, u.holds_records, u.type_code
         FROM unnest($3::text[], $4::text[], $5::text[], $6::text[], $7::int[], $8::text[], $9::boolean[], $10::text[])
           AS u(unit_id, parent_unit_id, code, name, sort_order, status, holds_records, type_code)
       ON CONFLICT (tenant_id, version_id, unit_id) DO UPDATE
         SET parent_unit_id = EXCLUDED.parent_unit_id, code = EXCLUDED.code, name = EXCLUDED.name, sort_order = EXCLUDED.sort_order,
             status = EXCLUDED.status, holds_records = EXCLUDED.holds_records, type_code = EXCLUDED.type_code`,
      [
        tenantId,
        versionId,
        units.map((unit) => unit.unit_id),
        units.map((unit) => unit.parent_unit_id),
        units.map((unit) => unit.code),
        units.map((unit) => unit.name),
        units.map((unit) => unit.sort_order),
        units.map((unit) => unit.status),
        units.map((unit) => unit.holds_records),
        units.map((unit) => unit.type_code),
      ],
    );
    return this.result(client, tenantId, versionId, 'RECEIVING');
  }

  /**
   * Checks the received units against the control plane's count and checksum (the same canonical text, ordered by
   * byte value), builds the closure and holds the version. A version already held stays as it is.
   */
  async complete(client: ReplicaClient, tenantId: string, versionId: string, header: ReplicaHeader, unitCount: number): Promise<ReplicaResult> {
    const held = await this.lockVersion(client, tenantId, versionId, header);
    if (held.status === 'READY') return this.result(client, tenantId, versionId, 'READY');
    const check = await client.query<{ units: number; orphans: number; checksum: string }>(
      `SELECT count(*)::int AS units,
              count(*) FILTER (WHERE u.parent_unit_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM ${this.#schema}.org_replica_units p
                 WHERE p.tenant_id = u.tenant_id AND p.version_id = u.version_id AND p.unit_id = u.parent_unit_id))::int AS orphans,
              'sha256:' || encode(sha256(convert_to(coalesce(string_agg(
                u.unit_id || '>' || coalesce(u.parent_unit_id, '') || '#' || u.sort_order, E'\\n' ORDER BY u.unit_id COLLATE "C"), ''), 'UTF8')), 'hex') AS checksum
         FROM ${this.#schema}.org_replica_units u WHERE u.tenant_id = $1 AND u.version_id = $2`,
      [tenantId, versionId],
    );
    const row = check.rows[0];
    if (!row || row.units !== unitCount) throw new OrganizationReplicaConflictError(`Expected ${unitCount} units, received ${row?.units ?? 0}.`);
    if (row.orphans > 0) throw new OrganizationReplicaConflictError(`${row.orphans} units name a parent that was not sent.`);
    if (row.checksum !== header.checksum) throw new OrganizationReplicaConflictError('The received units do not match the version checksum.');
    await client.query(
      `WITH RECURSIVE up AS (
         SELECT u.unit_id AS descendant, u.unit_id AS ancestor, 0 AS depth
           FROM ${this.#schema}.org_replica_units u WHERE u.tenant_id = $1 AND u.version_id = $2
         UNION ALL
         SELECT up.descendant, u.parent_unit_id, up.depth + 1
           FROM up JOIN ${this.#schema}.org_replica_units u ON u.tenant_id = $1 AND u.version_id = $2 AND u.unit_id = up.ancestor
          WHERE u.parent_unit_id IS NOT NULL AND up.depth < 16
       )
       INSERT INTO ${this.#schema}.org_replica_closure (tenant_id, version_id, ancestor_unit_id, descendant_unit_id, depth)
       SELECT $1, $2, ancestor, descendant, depth FROM up
       ON CONFLICT DO NOTHING`,
      [tenantId, versionId],
    );
    await client.query(
      `UPDATE ${this.#schema}.org_replica_versions SET status = 'READY', unit_count = $3, ready_at = now()
        WHERE tenant_id = $1 AND version_id = $2`,
      [tenantId, versionId, unitCount],
    );
    return this.result(client, tenantId, versionId, 'READY');
  }

  async isReady(client: ReplicaClient, tenantId: string, versionId: string): Promise<boolean> {
    const rows = await client.query<{ ready: boolean }>(
      `SELECT status = 'READY' AS ready FROM ${this.#schema}.org_replica_versions WHERE tenant_id = $1 AND version_id = $2`,
      [tenantId, versionId],
    );
    return rows.rows[0]?.ready === true;
  }

  /** Every active unit at or below the roots in a held version (inactive and archived grants are paused). */
  async expand(client: ReplicaClient, tenantId: string, versionId: string, roots: readonly string[]): Promise<string[]> {
    if (roots.length === 0) return [];
    if (!(await this.isReady(client, tenantId, versionId))) throw new OrganizationReplicaConflictError(`Organization version ${versionId} is not held yet.`);
    const rows = await client.query<{ unit_id: string }>(
      `SELECT DISTINCT c.descendant_unit_id AS unit_id
         FROM ${this.#schema}.org_replica_closure c
         JOIN ${this.#schema}.org_replica_units u
           ON u.tenant_id = c.tenant_id AND u.version_id = c.version_id AND u.unit_id = c.descendant_unit_id
        WHERE c.tenant_id = $1 AND c.version_id = $2 AND c.ancestor_unit_id = ANY($3::text[])
          AND u.status = 'ACTIVE'
        ORDER BY 1`,
      [tenantId, versionId, [...roots]],
    );
    return rows.rows.map((row) => row.unit_id);
  }

  /** One unit of a held version, or null. */
  async unit(client: ReplicaClient, tenantId: string, versionId: string, unitId: string): Promise<ReplicaUnit | null> {
    const rows = await client.query<ReplicaUnit & Record<string, unknown>>(
      `SELECT u.unit_id, u.parent_unit_id, u.code, u.name, u.sort_order, u.status, u.holds_records, u.type_code
         FROM ${this.#schema}.org_replica_units u
         JOIN ${this.#schema}.org_replica_versions v ON v.tenant_id = u.tenant_id AND v.version_id = u.version_id AND v.status = 'READY'
        WHERE u.tenant_id = $1 AND u.version_id = $2 AND u.unit_id = $3
          AND u.status = 'ACTIVE'`,
      [tenantId, versionId, unitId],
    );
    return rows.rows[0] ?? null;
  }

  /**
   * Units by code from the newest held version of the primary tree (codes and ids do not depend on a version's
   * shape), for matching records that name their unit. Empty when nothing is held yet.
   */
  async unitsByCode(client: ReplicaClient, tenantId: string): Promise<Map<string, { id: string; name: string }>> {
    const rows = await client.query<{ code: string; unit_id: string; name: string }>(
      `SELECT u.code, u.unit_id, u.name FROM ${this.#schema}.org_replica_units u
        WHERE u.tenant_id = $1 AND u.version_id = (
          SELECT v.version_id FROM ${this.#schema}.org_replica_versions v
           WHERE v.tenant_id = $1 AND v.status = 'READY' AND v.tree_kind = 'PRIMARY'
           ORDER BY v.version_number DESC LIMIT 1)
          AND u.status = 'ACTIVE'`,
      [tenantId],
    );
    return new Map(rows.rows.map((row) => [row.code, { id: row.unit_id, name: row.name }]));
  }

  private async lockVersion(client: ReplicaClient, tenantId: string, versionId: string, header: ReplicaHeader) {
    await client.query(
      `INSERT INTO ${this.#schema}.org_replica_versions (tenant_id, version_id, tree_id, tree_kind, version_number, checksum)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (tenant_id, version_id) DO NOTHING`,
      [tenantId, versionId, header.tree_id, header.tree_kind, header.version_number, header.checksum],
    );
    const held = await client.query<{ status: string; tree_id: string; version_number: number; checksum: string }>(
      `SELECT status, tree_id, version_number, checksum FROM ${this.#schema}.org_replica_versions
        WHERE tenant_id = $1 AND version_id = $2 FOR UPDATE`,
      [tenantId, versionId],
    );
    const row = held.rows[0];
    if (!row) throw new OrganizationReplicaConflictError(`Organization version ${versionId} could not be stored.`);
    if (row.checksum !== header.checksum || row.tree_id !== header.tree_id || row.version_number !== header.version_number)
      throw new OrganizationReplicaConflictError(`Organization version ${versionId} was already received with different content.`);
    return row;
  }

  private async result(client: ReplicaClient, tenantId: string, versionId: string, status: 'RECEIVING' | 'READY'): Promise<ReplicaResult> {
    const count = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${this.#schema}.org_replica_units WHERE tenant_id = $1 AND version_id = $2`,
      [tenantId, versionId],
    );
    return { version_id: versionId, status, received_units: count.rows[0]?.n ?? 0 };
  }
}
