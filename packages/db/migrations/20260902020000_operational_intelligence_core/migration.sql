-- CreateEnum
CREATE TYPE "DeploymentEnvironmentKind" AS ENUM ('DEVELOPMENT', 'TEST', 'STAGING', 'PRODUCTION', 'DEMO');

-- CreateEnum
CREATE TYPE "EnvironmentStatus" AS ENUM ('ACTIVE', 'LOCKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ConnectionInterface" AS ENUM ('REST', 'CSV_HTTP', 'WEBHOOK', 'POSTGRESQL');

-- CreateEnum
CREATE TYPE "ConnectionMode" AS ENUM ('READ_ONLY', 'READ_WRITE');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('UNTESTED', 'READY', 'READY_WITH_LIMITS', 'NOT_READY', 'DISABLED');

-- CreateEnum
CREATE TYPE "CredentialProvider" AS ENUM ('DEPLOYMENT_SECRET', 'EXTERNAL_VAULT');

-- CreateEnum
CREATE TYPE "CredentialAuthType" AS ENUM ('NONE', 'BEARER_TOKEN', 'API_KEY_HEADER');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('ACTIVE', 'INVALID', 'REVOKED');

-- CreateEnum
CREATE TYPE "DataContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "DataClassification" AS ENUM ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "ConnectorOperation" AS ENUM ('TEST', 'PROFILE', 'INGEST');

-- CreateEnum
CREATE TYPE "ConnectorAttemptStatus" AS ENUM ('SUCCEEDED', 'FAILED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "IngestedEventStatus" AS ENUM ('RECEIVED', 'VALIDATED', 'REJECTED', 'PROCESSING', 'PROCESSED', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "ControlOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "tenant_environments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "kind" "DeploymentEnvironmentKind" NOT NULL,
    "status" "EnvironmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "region" TEXT NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "configuration" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_environments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_references" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "provider" "CredentialProvider" NOT NULL,
    "reference" TEXT NOT NULL,
    "authType" "CredentialAuthType" NOT NULL,
    "headerName" TEXT,
    "status" "CredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "lastValidatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credential_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_connections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "credentialReferenceId" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "interfaceType" "ConnectionInterface" NOT NULL,
    "mode" "ConnectionMode" NOT NULL DEFAULT 'READ_ONLY',
    "endpoint" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'UNTESTED',
    "statusReasonCode" TEXT,
    "lastTestedAt" TIMESTAMP(3),
    "lastSuccessfulAt" TIMESTAMP(3),
    "lastLatencyMs" INTEGER,
    "responseContentType" TEXT,
    "observedSchemaVersion" INTEGER,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "circuitOpenUntil" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_schema_versions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "schema" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "maskedSample" JSONB,
    "classification" JSONB NOT NULL,
    "compatibility" JSONB NOT NULL,
    "breakingChange" BOOLEAN NOT NULL DEFAULT false,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "source_schema_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_contracts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" "DataContractStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_contract_versions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "jsonSchema" JSONB NOT NULL,
    "mapping" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "compatibilityReport" JSONB NOT NULL,
    "publishedById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_contract_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_events" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "sourceConnectionId" TEXT NOT NULL,
    "dataContractVersionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventVersion" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "entityRefs" JSONB NOT NULL,
    "classification" "DataClassification" NOT NULL,
    "payloadCiphertext" BYTEA NOT NULL,
    "payloadIv" BYTEA NOT NULL,
    "payloadAuthTag" BYTEA NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payloadKeyVersion" TEXT NOT NULL,
    "status" "IngestedEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "rejectionCode" TEXT,
    "rejectionDetail" JSONB,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "source_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connector_attempts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "operation" "ConnectorOperation" NOT NULL,
    "status" "ConnectorAttemptStatus" NOT NULL,
    "traceId" TEXT NOT NULL,
    "responseCode" INTEGER,
    "latencyMs" INTEGER,
    "bytesReceived" INTEGER,
    "result" JSONB NOT NULL,
    "errorCode" TEXT,
    "errorDetail" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "connector_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connector_checkpoints" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "consumer" TEXT NOT NULL,
    "cursor" TEXT NOT NULL,
    "cursorHash" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connector_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_outbox_events" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "ControlOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "control_outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_environments_tenantId_status_idx" ON "tenant_environments"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_environments_tenantId_slug_key" ON "tenant_environments"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "credential_references_tenantId_environmentId_status_idx" ON "credential_references"("tenantId", "environmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "credential_references_tenantId_environmentId_provider_refer_key" ON "credential_references"("tenantId", "environmentId", "provider", "reference");

-- CreateIndex
CREATE INDEX "source_connections_tenantId_environmentId_status_idx" ON "source_connections"("tenantId", "environmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "source_connections_tenantId_environmentId_slug_key" ON "source_connections"("tenantId", "environmentId", "slug");

-- CreateIndex
CREATE INDEX "source_schema_versions_tenantId_observedAt_idx" ON "source_schema_versions"("tenantId", "observedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "source_schema_versions_connectionId_version_key" ON "source_schema_versions"("connectionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "source_schema_versions_connectionId_checksum_key" ON "source_schema_versions"("connectionId", "checksum");

-- CreateIndex
CREATE INDEX "data_contracts_tenantId_connectionId_status_idx" ON "data_contracts"("tenantId", "connectionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "data_contracts_tenantId_environmentId_eventType_key" ON "data_contracts"("tenantId", "environmentId", "eventType");

-- CreateIndex
CREATE INDEX "data_contract_versions_tenantId_publishedAt_idx" ON "data_contract_versions"("tenantId", "publishedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "data_contract_versions_contractId_version_key" ON "data_contract_versions"("contractId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "data_contract_versions_contractId_checksum_key" ON "data_contract_versions"("contractId", "checksum");

-- CreateIndex
CREATE INDEX "source_events_tenantId_environmentId_status_receivedAt_idx" ON "source_events"("tenantId", "environmentId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "source_events_tenantId_correlationId_idx" ON "source_events"("tenantId", "correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "source_events_tenantId_eventId_key" ON "source_events"("tenantId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "source_events_tenantId_sourceConnectionId_idempotencyKey_key" ON "source_events"("tenantId", "sourceConnectionId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "connector_attempts_tenantId_connectionId_startedAt_idx" ON "connector_attempts"("tenantId", "connectionId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "connector_attempts_tenantId_traceId_idx" ON "connector_attempts"("tenantId", "traceId");

-- CreateIndex
CREATE INDEX "connector_checkpoints_tenantId_environmentId_idx" ON "connector_checkpoints"("tenantId", "environmentId");

-- CreateIndex
CREATE UNIQUE INDEX "connector_checkpoints_connectionId_consumer_key" ON "connector_checkpoints"("connectionId", "consumer");

-- CreateIndex
CREATE UNIQUE INDEX "control_outbox_events_eventId_key" ON "control_outbox_events"("eventId");

-- CreateIndex
CREATE INDEX "control_outbox_events_status_availableAt_idx" ON "control_outbox_events"("status", "availableAt");

-- CreateIndex
CREATE INDEX "control_outbox_events_tenantId_aggregateType_aggregateId_idx" ON "control_outbox_events"("tenantId", "aggregateType", "aggregateId");

-- AddForeignKey
ALTER TABLE "tenant_environments" ADD CONSTRAINT "tenant_environments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_references" ADD CONSTRAINT "credential_references_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_references" ADD CONSTRAINT "credential_references_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "tenant_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_connections" ADD CONSTRAINT "source_connections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_connections" ADD CONSTRAINT "source_connections_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "tenant_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_connections" ADD CONSTRAINT "source_connections_credentialReferenceId_fkey" FOREIGN KEY ("credentialReferenceId") REFERENCES "credential_references"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_schema_versions" ADD CONSTRAINT "source_schema_versions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_schema_versions" ADD CONSTRAINT "source_schema_versions_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "source_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_contracts" ADD CONSTRAINT "data_contracts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_contracts" ADD CONSTRAINT "data_contracts_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "tenant_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_contracts" ADD CONSTRAINT "data_contracts_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "source_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_contract_versions" ADD CONSTRAINT "data_contract_versions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_contract_versions" ADD CONSTRAINT "data_contract_versions_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "data_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_events" ADD CONSTRAINT "source_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_events" ADD CONSTRAINT "source_events_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "tenant_environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_events" ADD CONSTRAINT "source_events_sourceConnectionId_fkey" FOREIGN KEY ("sourceConnectionId") REFERENCES "source_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_events" ADD CONSTRAINT "source_events_dataContractVersionId_fkey" FOREIGN KEY ("dataContractVersionId") REFERENCES "data_contract_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_attempts" ADD CONSTRAINT "connector_attempts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_attempts" ADD CONSTRAINT "connector_attempts_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "tenant_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_attempts" ADD CONSTRAINT "connector_attempts_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "source_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_checkpoints" ADD CONSTRAINT "connector_checkpoints_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_checkpoints" ADD CONSTRAINT "connector_checkpoints_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "tenant_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_checkpoints" ADD CONSTRAINT "connector_checkpoints_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "source_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_outbox_events" ADD CONSTRAINT "control_outbox_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain invariants that Prisma cannot express in the datamodel.
ALTER TABLE "tenant_environments"
  ADD CONSTRAINT "tenant_environments_retention_positive" CHECK ("retentionDays" > 0);
ALTER TABLE "data_contract_versions"
  ADD CONSTRAINT "data_contract_versions_version_positive" CHECK ("version" > 0);
ALTER TABLE "source_schema_versions"
  ADD CONSTRAINT "source_schema_versions_version_positive" CHECK ("version" > 0);
ALTER TABLE "source_events"
  ADD CONSTRAINT "source_events_version_positive" CHECK ("eventVersion" > 0);

CREATE FUNCTION prevent_operational_version_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'published operational intelligence versions are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "data_contract_versions_immutable"
  BEFORE UPDATE OR DELETE ON "data_contract_versions"
  FOR EACH ROW EXECUTE FUNCTION prevent_operational_version_mutation();

CREATE TRIGGER "source_schema_versions_immutable"
  BEFORE UPDATE OR DELETE ON "source_schema_versions"
  FOR EACH ROW EXECUTE FUNCTION prevent_operational_version_mutation();

CREATE FUNCTION prevent_source_event_evidence_mutation() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."eventId" IS DISTINCT FROM OLD."eventId"
     OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
     OR NEW."environmentId" IS DISTINCT FROM OLD."environmentId"
     OR NEW."sourceConnectionId" IS DISTINCT FROM OLD."sourceConnectionId"
     OR NEW."dataContractVersionId" IS DISTINCT FROM OLD."dataContractVersionId"
     OR NEW."eventType" IS DISTINCT FROM OLD."eventType"
     OR NEW."eventVersion" IS DISTINCT FROM OLD."eventVersion"
     OR NEW."occurredAt" IS DISTINCT FROM OLD."occurredAt"
     OR NEW."receivedAt" IS DISTINCT FROM OLD."receivedAt"
     OR NEW."correlationId" IS DISTINCT FROM OLD."correlationId"
     OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
     OR NEW."actorType" IS DISTINCT FROM OLD."actorType"
     OR NEW."actorId" IS DISTINCT FROM OLD."actorId"
     OR NEW."entityRefs" IS DISTINCT FROM OLD."entityRefs"
     OR NEW."classification" IS DISTINCT FROM OLD."classification"
     OR NEW."payloadCiphertext" IS DISTINCT FROM OLD."payloadCiphertext"
     OR NEW."payloadIv" IS DISTINCT FROM OLD."payloadIv"
     OR NEW."payloadAuthTag" IS DISTINCT FROM OLD."payloadAuthTag"
     OR NEW."payloadHash" IS DISTINCT FROM OLD."payloadHash"
     OR NEW."payloadKeyVersion" IS DISTINCT FROM OLD."payloadKeyVersion" THEN
    RAISE EXCEPTION 'source event evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "source_event_evidence_immutable"
  BEFORE UPDATE ON "source_events"
  FOR EACH ROW EXECUTE FUNCTION prevent_source_event_evidence_mutation();
