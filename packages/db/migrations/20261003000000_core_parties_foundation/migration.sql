-- WI-OI-111 (ADR-0020): Core Parties Reference Adoption & Foundation
-- Canonical entities for organizations, persons, roles, addresses, contacts,
-- identifiers, relationships, org assignments, and extension snapshots.
-- Enforces tenant isolation via composite foreign keys and forced Row-Level Security (RLS).

-- ─── Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE "parties" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "legalName" VARCHAR(255) NOT NULL,
  "displayName" VARCHAR(255) NOT NULL,
  "partyType" VARCHAR(32) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  "classification" VARCHAR(100),
  "survivorPartyId" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMPTZ(3),
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "parties_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "parties_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "parties_tenantId_id_key" ON "parties"("tenantId", "id");
CREATE UNIQUE INDEX "parties_tenantId_code_key" ON "parties"("tenantId", "code");
CREATE INDEX "parties_tenantId_status_idx" ON "parties"("tenantId", "status");
CREATE INDEX "parties_tenantId_partyType_idx" ON "parties"("tenantId", "partyType");

CREATE TABLE "party_roles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" TEXT NOT NULL,
  "partyId" UUID NOT NULL,
  "roleType" VARCHAR(32) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  "effectiveFrom" TIMESTAMPTZ(3),
  "effectiveTo" TIMESTAMPTZ(3),
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "party_roles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "party_roles_party_fkey" FOREIGN KEY ("tenantId", "partyId") REFERENCES "parties"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "party_roles_tenantId_id_key" ON "party_roles"("tenantId", "id");
CREATE UNIQUE INDEX "party_roles_tenantId_partyId_roleType_key" ON "party_roles"("tenantId", "partyId", "roleType");
CREATE INDEX "party_roles_tenantId_roleType_idx" ON "party_roles"("tenantId", "roleType");

CREATE TABLE "party_identifiers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" TEXT NOT NULL,
  "partyId" UUID NOT NULL,
  "identifierType" VARCHAR(32) NOT NULL,
  "value" VARCHAR(128) NOT NULL,
  "issuerCountry" VARCHAR(2),
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "isRestricted" BOOLEAN NOT NULL DEFAULT false,
  "validFrom" TIMESTAMPTZ(3),
  "validTo" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "party_identifiers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "party_identifiers_party_fkey" FOREIGN KEY ("tenantId", "partyId") REFERENCES "parties"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "party_identifiers_tenantId_id_key" ON "party_identifiers"("tenantId", "id");
CREATE INDEX "party_identifiers_tenantId_partyId_idx" ON "party_identifiers"("tenantId", "partyId");
CREATE INDEX "party_identifiers_tenantId_type_val_idx" ON "party_identifiers"("tenantId", "identifierType", "value");

CREATE TABLE "party_contact_points" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" TEXT NOT NULL,
  "partyId" UUID NOT NULL,
  "channel" VARCHAR(32) NOT NULL,
  "value" VARCHAR(255) NOT NULL,
  "label" VARCHAR(100),
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "isVerified" BOOLEAN NOT NULL DEFAULT false,
  "validFrom" TIMESTAMPTZ(3),
  "validTo" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "party_contact_points_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "party_contacts_party_fkey" FOREIGN KEY ("tenantId", "partyId") REFERENCES "parties"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "party_contact_points_tenantId_id_key" ON "party_contact_points"("tenantId", "id");
CREATE INDEX "party_contact_points_tenantId_partyId_idx" ON "party_contact_points"("tenantId", "partyId");

CREATE TABLE "party_addresses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" TEXT NOT NULL,
  "partyId" UUID NOT NULL,
  "addressType" VARCHAR(32) NOT NULL,
  "street1" VARCHAR(255) NOT NULL,
  "street2" VARCHAR(255),
  "city" VARCHAR(100) NOT NULL,
  "stateOrProvince" VARCHAR(100),
  "postalCode" VARCHAR(32),
  "countryCode" VARCHAR(2) NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "isVerified" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "party_addresses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "party_addresses_party_fkey" FOREIGN KEY ("tenantId", "partyId") REFERENCES "parties"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "party_addresses_tenantId_id_key" ON "party_addresses"("tenantId", "id");
CREATE INDEX "party_addresses_tenantId_partyId_idx" ON "party_addresses"("tenantId", "partyId");

CREATE TABLE "party_relationships" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" TEXT NOT NULL,
  "fromPartyId" UUID NOT NULL,
  "toPartyId" UUID NOT NULL,
  "relationshipType" VARCHAR(64) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  "validFrom" TIMESTAMPTZ(3),
  "validTo" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "party_relationships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "party_rel_from_fkey" FOREIGN KEY ("tenantId", "fromPartyId") REFERENCES "parties"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "party_rel_to_fkey" FOREIGN KEY ("tenantId", "toPartyId") REFERENCES "parties"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "party_relationships_tenantId_id_key" ON "party_relationships"("tenantId", "id");
CREATE INDEX "party_relationships_tenantId_from_idx" ON "party_relationships"("tenantId", "fromPartyId");
CREATE INDEX "party_relationships_tenantId_to_idx" ON "party_relationships"("tenantId", "toPartyId");

CREATE TABLE "party_org_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" TEXT NOT NULL,
  "partyId" UUID NOT NULL,
  "orgUnitId" TEXT NOT NULL,
  "assignmentPurpose" VARCHAR(100) NOT NULL DEFAULT 'OPERATIONAL',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "party_org_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "party_org_party_fkey" FOREIGN KEY ("tenantId", "partyId") REFERENCES "parties"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "party_org_assignments_tenantId_id_key" ON "party_org_assignments"("tenantId", "id");
CREATE UNIQUE INDEX "party_org_assignments_unique" ON "party_org_assignments"("tenantId", "partyId", "orgUnitId", "assignmentPurpose");
CREATE INDEX "party_org_assignments_tenantId_unit_idx" ON "party_org_assignments"("tenantId", "orgUnitId");

CREATE TABLE "party_extension_snapshots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" TEXT NOT NULL,
  "partyId" UUID NOT NULL,
  "manifestChecksum" CHAR(64) NOT NULL,
  "snapshotPayload" JSONB NOT NULL,
  "capturedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "party_extension_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "party_ext_snap_party_fkey" FOREIGN KEY ("tenantId", "partyId") REFERENCES "parties"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "party_extension_snapshots_tenantId_id_key" ON "party_extension_snapshots"("tenantId", "id");
CREATE INDEX "party_ext_snapshots_tenantId_partyId_idx" ON "party_extension_snapshots"("tenantId", "partyId");

CREATE TABLE "party_idempotency_records" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "operation" VARCHAR(80) NOT NULL,
  "idempotencyKey" VARCHAR(200) NOT NULL,
  "requestSha256" CHAR(64) NOT NULL,
  "response" JSONB NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "party_idempotency_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "party_idempotency_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "party_idempotency_records_key" ON "party_idempotency_records"("tenantId", "actorId", "operation", "idempotencyKey");

-- ─── Row-Level Security ─────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gigalibs_party_tenant') THEN
    CREATE ROLE gigalibs_party_tenant NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

GRANT gigalibs_party_tenant TO CURRENT_USER;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'parties', 'party_roles', 'party_identifiers', 'party_contact_points',
    'party_addresses', 'party_relationships', 'party_org_assignments',
    'party_extension_snapshots', 'party_idempotency_records'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I TO gigalibs_party_tenant USING ("tenantId" = nullif(current_setting(''app.tenant_id'', true), '''')) WITH CHECK ("tenantId" = nullif(current_setting(''app.tenant_id'', true), ''''))',
      tbl || '_tenant_policy', tbl);
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON "parties", "party_roles", "party_identifiers", "party_contact_points", "party_addresses", "party_relationships", "party_org_assignments", "party_extension_snapshots", "party_idempotency_records" TO gigalibs_party_tenant;
