-- WI-OI-109b (ADR-0018): the universal organization hierarchy. Additive only: new tables beside `departments`, which
-- stay untouched until the Department bridge (109c/e). Every table is tenant-bound (composite keys) and runs under
-- forced row-level security for the `gigalibs_org_tenant` role, which the control plane assumes with
-- `SET LOCAL ROLE` inside each transaction (the ADR-0017 pattern). Published versions are immutable (triggers);
-- maker-checker is enforced in the database (an approver is never the author).

CREATE TYPE "OrgRecordStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "OrgUnitStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "OrgTreeKind" AS ENUM ('PRIMARY', 'ALTERNATE');
CREATE TYPE "OrgTreePurpose" AS ENUM ('AUTHORITY', 'REPORTING', 'COST', 'LEGAL', 'OTHER');
CREATE TYPE "OrgHierarchyVersionStatus" AS ENUM ('DRAFT', 'VALIDATED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PUBLISHED');
CREATE TYPE "OrgPlaceRelation" AS ENUM ('OPERATES', 'OWNS');
CREATE TYPE "OrgScopeAccess" AS ENUM ('READ', 'READ_WRITE');

CREATE TABLE "org_unit_types" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" VARCHAR(40) NOT NULL,
  "labelOne" VARCHAR(120) NOT NULL,
  "labelOther" VARCHAR(120) NOT NULL,
  "holdsRecords" BOOLEAN NOT NULL,
  "capabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "allowedParentTypeCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "allowAsRoot" BOOLEAN NOT NULL DEFAULT false,
  "description" VARCHAR(500),
  "status" "OrgRecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "org_unit_types_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "org_unit_types_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "org_unit_types_capabilities_check" CHECK (
    "capabilities" <@ ARRAY['LEGAL_ENTITY', 'OPERATIONAL', 'REPORTING', 'WORKFORCE', 'COST_ACCOUNTING', 'PLACE_OPERATING']::TEXT[]),
  CONSTRAINT "org_unit_types_placement_check" CHECK ("allowAsRoot" OR cardinality("allowedParentTypeCodes") > 0)
);
CREATE UNIQUE INDEX "org_unit_types_tenantId_code_key" ON "org_unit_types"("tenantId", "code");
CREATE UNIQUE INDEX "org_unit_types_tenantId_id_key" ON "org_unit_types"("tenantId", "id");

CREATE TABLE "org_units" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "typeId" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "status" "OrgUnitStatus" NOT NULL DEFAULT 'ACTIVE',
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "timeZone" VARCHAR(64),
  "contact" JSONB,
  "managerUserId" TEXT,
  "address" JSONB,
  "legal" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "org_units_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "org_units_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "org_units_type_fkey" FOREIGN KEY ("tenantId", "typeId") REFERENCES "org_unit_types"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "org_units_manager_fkey" FOREIGN KEY ("managerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "org_units_dates_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom")
);
CREATE UNIQUE INDEX "org_units_tenantId_code_key" ON "org_units"("tenantId", "code");
CREATE UNIQUE INDEX "org_units_tenantId_id_key" ON "org_units"("tenantId", "id");
CREATE INDEX "org_units_tenantId_typeId_idx" ON "org_units"("tenantId", "typeId");

CREATE TABLE "org_trees" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" VARCHAR(40) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "kind" "OrgTreeKind" NOT NULL,
  "purpose" "OrgTreePurpose" NOT NULL,
  "status" "OrgRecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "org_trees_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "org_trees_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- Only the primary tree carries authority (ADR-0018 D1).
  CONSTRAINT "org_trees_authority_check" CHECK (("kind" = 'PRIMARY') = ("purpose" = 'AUTHORITY'))
);
CREATE UNIQUE INDEX "org_trees_tenantId_code_key" ON "org_trees"("tenantId", "code");
CREATE UNIQUE INDEX "org_trees_tenantId_id_key" ON "org_trees"("tenantId", "id");
CREATE UNIQUE INDEX "org_trees_one_primary_per_tenant" ON "org_trees"("tenantId") WHERE "kind" = 'PRIMARY';

CREATE TABLE "org_hierarchy_versions" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "treeId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "status" "OrgHierarchyVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "basedOnVersionId" TEXT,
  "checksum" CHAR(71),
  "reason" VARCHAR(500),
  "lockVersion" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "submittedById" TEXT,
  "approvedById" TEXT,
  "rejectedById" TEXT,
  "publishedById" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" TIMESTAMPTZ(3),
  "approvedAt" TIMESTAMPTZ(3),
  "publishedAt" TIMESTAMPTZ(3),
  CONSTRAINT "org_hierarchy_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "org_hierarchy_versions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "org_hierarchy_versions_tree_fkey" FOREIGN KEY ("tenantId", "treeId") REFERENCES "org_trees"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- Maker-checker in the database: the approver is never the author.
  CONSTRAINT "org_hierarchy_versions_checker_check" CHECK ("approvedById" IS NULL OR "approvedById" <> "createdById"),
  CONSTRAINT "org_hierarchy_versions_published_check" CHECK (("status" = 'PUBLISHED') = ("publishedAt" IS NOT NULL AND "checksum" IS NOT NULL)),
  CONSTRAINT "org_hierarchy_versions_checksum_check" CHECK ("checksum" IS NULL OR "checksum" ~ '^sha256:[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "org_hierarchy_versions_tenantId_treeId_versionNumber_key" ON "org_hierarchy_versions"("tenantId", "treeId", "versionNumber");
CREATE UNIQUE INDEX "org_hierarchy_versions_tenantId_id_key" ON "org_hierarchy_versions"("tenantId", "id");
-- Lineage stays inside the tenant; added after the (tenantId, id) key it references.
ALTER TABLE "org_hierarchy_versions" ADD CONSTRAINT "org_hierarchy_versions_based_on_fkey"
  FOREIGN KEY ("tenantId", "basedOnVersionId") REFERENCES "org_hierarchy_versions"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- One open draft per tree at a time.
CREATE UNIQUE INDEX "org_hierarchy_versions_one_open_draft" ON "org_hierarchy_versions"("tenantId", "treeId")
  WHERE "status" IN ('DRAFT', 'VALIDATED', 'SUBMITTED', 'APPROVED');

-- Activation history: the active version of a tree at time T is the latest activation whose effectiveFrom <= T.
CREATE TABLE "org_hierarchy_activations" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "treeId" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "activatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "org_hierarchy_activations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "org_hierarchy_activations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "org_hierarchy_activations_tree_fkey" FOREIGN KEY ("tenantId", "treeId") REFERENCES "org_trees"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "org_hierarchy_activations_version_fkey" FOREIGN KEY ("tenantId", "versionId") REFERENCES "org_hierarchy_versions"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "org_hierarchy_activations_tenantId_treeId_effectiveFrom_key" ON "org_hierarchy_activations"("tenantId", "treeId", "effectiveFrom");

CREATE TABLE "org_hierarchy_edges" (
  "tenantId" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "parentUnitId" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "org_hierarchy_edges_pkey" PRIMARY KEY ("tenantId", "versionId", "unitId"),
  CONSTRAINT "org_hierarchy_edges_version_fkey" FOREIGN KEY ("tenantId", "versionId") REFERENCES "org_hierarchy_versions"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "org_hierarchy_edges_unit_fkey" FOREIGN KEY ("tenantId", "unitId") REFERENCES "org_units"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- The parent is a unit of the same version (never another tenant's or another version's).
  CONSTRAINT "org_hierarchy_edges_parent_fkey" FOREIGN KEY ("tenantId", "versionId", "parentUnitId")
    REFERENCES "org_hierarchy_edges"("tenantId", "versionId", "unitId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT "org_hierarchy_edges_self_check" CHECK ("parentUnitId" IS NULL OR "parentUnitId" <> "unitId")
);
CREATE INDEX "org_hierarchy_edges_parent_idx" ON "org_hierarchy_edges"("tenantId", "versionId", "parentUnitId");

-- Built once when a version is published: every ancestor of every unit, the unit itself at depth 0.
CREATE TABLE "org_hierarchy_closure" (
  "tenantId" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "ancestorUnitId" TEXT NOT NULL,
  "descendantUnitId" TEXT NOT NULL,
  "depth" SMALLINT NOT NULL,
  CONSTRAINT "org_hierarchy_closure_pkey" PRIMARY KEY ("tenantId", "versionId", "ancestorUnitId", "descendantUnitId"),
  CONSTRAINT "org_hierarchy_closure_version_fkey" FOREIGN KEY ("tenantId", "versionId") REFERENCES "org_hierarchy_versions"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- Both ends are units placed in the same version.
  CONSTRAINT "org_hierarchy_closure_ancestor_fkey" FOREIGN KEY ("tenantId", "versionId", "ancestorUnitId")
    REFERENCES "org_hierarchy_edges"("tenantId", "versionId", "unitId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "org_hierarchy_closure_descendant_fkey" FOREIGN KEY ("tenantId", "versionId", "descendantUnitId")
    REFERENCES "org_hierarchy_edges"("tenantId", "versionId", "unitId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "org_hierarchy_closure_depth_check" CHECK ("depth" BETWEEN 0 AND 16),
  CONSTRAINT "org_hierarchy_closure_self_check" CHECK (("depth" = 0) = ("ancestorUnitId" = "descendantUnitId"))
);
CREATE INDEX "org_hierarchy_closure_descendant_idx" ON "org_hierarchy_closure"("tenantId", "versionId", "descendantUnitId");

CREATE TABLE "org_unit_place_links" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "placeId" UUID NOT NULL,
  "relation" "OrgPlaceRelation" NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedById" TEXT,
  CONSTRAINT "org_unit_place_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "org_unit_place_links_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "org_unit_place_links_unit_fkey" FOREIGN KEY ("tenantId", "unitId") REFERENCES "org_units"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "org_unit_place_links_dates_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom")
);
CREATE UNIQUE INDEX "org_unit_place_links_unique_start" ON "org_unit_place_links"("tenantId", "unitId", "placeId", "relation", "effectiveFrom");

CREATE TABLE "org_scope_grants" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "access" "OrgScopeAccess" NOT NULL,
  "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
  "effectiveTo" TIMESTAMPTZ(3),
  "reason" VARCHAR(500) NOT NULL,
  "grantedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMPTZ(3),
  "revokedById" TEXT,
  "revokeReason" VARCHAR(500),
  CONSTRAINT "org_scope_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "org_scope_grants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- A grant belongs to a member of the same tenant, on a unit of the same tenant.
  CONSTRAINT "org_scope_grants_member_fkey" FOREIGN KEY ("userId", "tenantId") REFERENCES "tenant_members"("userId", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "org_scope_grants_unit_fkey" FOREIGN KEY ("tenantId", "unitId") REFERENCES "org_units"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "org_scope_grants_dates_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"),
  CONSTRAINT "org_scope_grants_revocation_check" CHECK (("revokedAt" IS NULL) = ("revokedById" IS NULL))
);
CREATE INDEX "org_scope_grants_member_idx" ON "org_scope_grants"("tenantId", "userId") WHERE "revokedAt" IS NULL;
CREATE INDEX "org_scope_grants_unit_idx" ON "org_scope_grants"("tenantId", "unitId");

CREATE TABLE "org_idempotency_records" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "operation" VARCHAR(80) NOT NULL,
  "idempotencyKey" VARCHAR(200) NOT NULL,
  "requestSha256" CHAR(64) NOT NULL,
  "response" JSONB NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "org_idempotency_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "org_idempotency_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "org_idempotency_records_key" ON "org_idempotency_records"("tenantId", "actorId", "operation", "idempotencyKey");

-- ─── Immutability of published structure ────────────────────────────────────

-- Edges change only while their version is an open draft; closure rows are written only while publishing.
CREATE FUNCTION org_guard_version_structure() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_version TEXT := COALESCE(NEW."versionId", OLD."versionId");
  target_tenant TEXT := COALESCE(NEW."tenantId", OLD."tenantId");
  version_status "OrgHierarchyVersionStatus";
BEGIN
  SELECT "status" INTO version_status FROM "org_hierarchy_versions" WHERE "tenantId" = target_tenant AND "id" = target_version;
  IF TG_TABLE_NAME = 'org_hierarchy_edges' AND version_status NOT IN ('DRAFT', 'VALIDATED') THEN
    RAISE EXCEPTION 'org hierarchy version % is % and its edges cannot change', target_version, version_status USING ERRCODE = '55000';
  END IF;
  IF TG_TABLE_NAME = 'org_hierarchy_closure' AND (TG_OP <> 'INSERT' OR version_status <> 'APPROVED') THEN
    RAISE EXCEPTION 'org hierarchy closure is written once, while version % is published', target_version USING ERRCODE = '55000';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$$;
CREATE TRIGGER "org_hierarchy_edges_guard" BEFORE INSERT OR UPDATE OR DELETE ON "org_hierarchy_edges"
  FOR EACH ROW EXECUTE FUNCTION org_guard_version_structure();
CREATE TRIGGER "org_hierarchy_closure_guard" BEFORE INSERT OR UPDATE OR DELETE ON "org_hierarchy_closure"
  FOR EACH ROW EXECUTE FUNCTION org_guard_version_structure();

-- A published version never changes again; versions move only forward through the lifecycle.
CREATE FUNCTION org_guard_version_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'PUBLISHED' THEN
      RAISE EXCEPTION 'published org hierarchy version % cannot be deleted', OLD."id" USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" = 'PUBLISHED' THEN
    RAISE EXCEPTION 'published org hierarchy version % is immutable', OLD."id" USING ERRCODE = '55000';
  END IF;
  IF OLD."status" = 'REJECTED' AND NEW."status" <> 'REJECTED' THEN
    RAISE EXCEPTION 'rejected org hierarchy version % cannot reopen; start a new draft', OLD."id" USING ERRCODE = '55000';
  END IF;
  IF NOT (
    NEW."status" = OLD."status"
    OR (OLD."status" = 'DRAFT' AND NEW."status" IN ('VALIDATED', 'REJECTED'))
    OR (OLD."status" = 'VALIDATED' AND NEW."status" IN ('DRAFT', 'SUBMITTED', 'REJECTED'))
    OR (OLD."status" = 'SUBMITTED' AND NEW."status" IN ('APPROVED', 'REJECTED'))
    OR (OLD."status" = 'APPROVED' AND NEW."status" IN ('PUBLISHED', 'REJECTED'))
  ) THEN
    RAISE EXCEPTION 'org hierarchy version % cannot move from % to %', OLD."id", OLD."status", NEW."status" USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "org_hierarchy_versions_lifecycle" BEFORE UPDATE OR DELETE ON "org_hierarchy_versions"
  FOR EACH ROW EXECUTE FUNCTION org_guard_version_lifecycle();

-- Only published versions can be activated; activations are history and never change.
CREATE FUNCTION org_guard_activation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  version_status "OrgHierarchyVersionStatus";
  version_tree TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'org hierarchy activations are append-only' USING ERRCODE = '55000';
  END IF;
  SELECT "status", "treeId" INTO version_status, version_tree FROM "org_hierarchy_versions"
   WHERE "tenantId" = NEW."tenantId" AND "id" = NEW."versionId";
  IF version_status IS DISTINCT FROM 'PUBLISHED' OR version_tree IS DISTINCT FROM NEW."treeId" THEN
    RAISE EXCEPTION 'only a published version of tree % can be activated', NEW."treeId" USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "org_hierarchy_activations_guard" BEFORE INSERT OR UPDATE OR DELETE ON "org_hierarchy_activations"
  FOR EACH ROW EXECUTE FUNCTION org_guard_activation();

-- ─── Validation of a version's structure ────────────────────────────────────

-- Every problem that blocks publishing: cycles, depth beyond 16, parents of a type the child's type does not allow,
-- roots of a type not allowed at the top, inactive or archived units. Empty means valid. Runs under the caller's RLS.
CREATE FUNCTION org_validate_hierarchy_version(p_tenant TEXT, p_version TEXT)
RETURNS TABLE ("code" TEXT, "unitId" TEXT, "detail" TEXT)
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE edges AS (
    SELECT e."unitId", e."parentUnitId" FROM "org_hierarchy_edges" e WHERE e."tenantId" = p_tenant AND e."versionId" = p_version
  ),
  walk AS (
    SELECT e."unitId" AS start_id, e."parentUnitId" AS current_id, 1 AS depth, ARRAY[e."unitId"] AS path, false AS cycle
      FROM edges e WHERE e."parentUnitId" IS NOT NULL
    UNION ALL
    SELECT w.start_id, e."parentUnitId", w.depth + 1, w.path || w.current_id, w.current_id = ANY(w.path)
      FROM walk w JOIN edges e ON e."unitId" = w.current_id
     WHERE NOT w.cycle AND e."parentUnitId" IS NOT NULL AND w.depth <= 17
  ),
  units AS (
    SELECT e."unitId", e."parentUnitId", u."status", t."code" AS type_code, t."allowAsRoot", t."allowedParentTypeCodes", pt."code" AS parent_type_code
      FROM edges e
      JOIN "org_units" u ON u."tenantId" = p_tenant AND u."id" = e."unitId"
      JOIN "org_unit_types" t ON t."tenantId" = p_tenant AND t."id" = u."typeId"
      LEFT JOIN "org_units" pu ON pu."tenantId" = p_tenant AND pu."id" = e."parentUnitId"
      LEFT JOIN "org_unit_types" pt ON pt."tenantId" = p_tenant AND pt."id" = pu."typeId"
  )
  SELECT DISTINCT 'CYCLE', start_id, 'The chain of parents above this unit loops back on itself.' FROM walk WHERE cycle OR current_id = start_id
  UNION ALL
  SELECT DISTINCT 'TOO_DEEP', start_id, 'The unit is more than 16 levels below the top.' FROM walk WHERE depth > 16
  UNION ALL
  SELECT 'ROOT_NOT_ALLOWED', "unitId", format('A %s cannot be at the top.', type_code) FROM units WHERE "parentUnitId" IS NULL AND NOT "allowAsRoot"
  UNION ALL
  SELECT 'PARENT_NOT_ALLOWED', "unitId", format('A %s cannot sit under a %s.', type_code, parent_type_code)
    FROM units WHERE "parentUnitId" IS NOT NULL AND NOT (parent_type_code = ANY("allowedParentTypeCodes"))
  UNION ALL
  SELECT 'UNIT_NOT_ACTIVE', "unitId", 'An archived unit cannot be placed in a new version.' FROM units WHERE "status" = 'ARCHIVED'
$$;

-- ─── Row-level security ─────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gigalibs_org_tenant') THEN
    CREATE ROLE gigalibs_org_tenant NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;
-- The migration principal (and the control plane's connection role) may assume it; it stays NOLOGIN and NOBYPASSRLS.
GRANT gigalibs_org_tenant TO CURRENT_USER;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'org_unit_types', 'org_units', 'org_trees', 'org_hierarchy_versions', 'org_hierarchy_activations',
    'org_hierarchy_edges', 'org_hierarchy_closure', 'org_unit_place_links', 'org_scope_grants', 'org_idempotency_records'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I TO gigalibs_org_tenant USING ("tenantId" = nullif(current_setting(''app.tenant_id'', true), '''')) WITH CHECK ("tenantId" = nullif(current_setting(''app.tenant_id'', true), ''''))',
      table_name || '_tenant_policy', table_name);
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE ON "org_unit_types", "org_units", "org_trees", "org_hierarchy_versions", "org_unit_place_links", "org_scope_grants" TO gigalibs_org_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON "org_hierarchy_edges" TO gigalibs_org_tenant;
GRANT SELECT, INSERT ON "org_hierarchy_activations", "org_hierarchy_closure", "org_idempotency_records" TO gigalibs_org_tenant;
GRANT EXECUTE ON FUNCTION org_validate_hierarchy_version(TEXT, TEXT) TO gigalibs_org_tenant;
-- The guards read the version row whatever the caller's policy.
ALTER FUNCTION org_guard_version_structure() SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION org_guard_activation() SECURITY DEFINER SET search_path = public, pg_temp;
