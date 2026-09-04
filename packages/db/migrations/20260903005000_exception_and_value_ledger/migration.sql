CREATE TYPE "OperationalExceptionKind" AS ENUM ('PROCESSING_FAILURE', 'BUSINESS_MISMATCH', 'MISSING_EVIDENCE', 'ACTION_FAILURE', 'RECONCILIATION');
CREATE TYPE "OperationalExceptionStatus" AS ENUM ('OPEN', 'ASSIGNED', 'RETRY_SCHEDULED', 'RESOLVED', 'RECONCILIATION_REQUIRED');
CREATE TYPE "RecoveryOperation" AS ENUM ('ASSIGN', 'RETRY', 'REPLAY', 'EDIT_AND_REPLAY', 'RESOLVE', 'RECONCILE');
CREATE TYPE "RecoveryStatus" AS ENUM ('REQUESTED', 'SUCCEEDED', 'FAILED');
CREATE TYPE "ValueDefinitionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "ValueEventStatus" AS ENUM ('CALCULATED', 'VERIFIED', 'REJECTED');
CREATE TYPE "BenefitDecision" AS ENUM ('VERIFIED', 'REJECTED');

CREATE TABLE "operational_exceptions" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "environmentId" TEXT NOT NULL,
  "sourceEventId" TEXT,
  "supplierInvoiceId" TEXT,
  "matchEvaluationId" TEXT,
  "businessActionId" TEXT,
  "kind" "OperationalExceptionKind" NOT NULL,
  "status" "OperationalExceptionStatus" NOT NULL DEFAULT 'OPEN',
  "severity" "FindingSeverity" NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "businessImpact" JSONB NOT NULL,
  "rootCauseCode" TEXT NOT NULL,
  "retryable" BOOLEAN NOT NULL DEFAULT false,
  "assignedToId" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "operational_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exception_recoveries" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "exceptionId" TEXT NOT NULL,
  "replaySourceEventId" TEXT,
  "operation" "RecoveryOperation" NOT NULL,
  "status" "RecoveryStatus" NOT NULL DEFAULT 'REQUESTED',
  "requestedById" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "errorCode" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "exception_recoveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "value_definitions" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "environmentId" TEXT NOT NULL,
  "outcomeKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "currency" TEXT NOT NULL,
  "status" "ValueDefinitionStatus" NOT NULL DEFAULT 'DRAFT',
  "currentVersion" INTEGER,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "value_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "value_definition_versions" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "valueDefinitionId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "formulaKind" TEXT NOT NULL,
  "assumptions" JSONB NOT NULL,
  "baseline" JSONB NOT NULL,
  "target" JSONB NOT NULL,
  "checksum" TEXT NOT NULL,
  "publishedById" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "value_definition_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "value_events" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "environmentId" TEXT NOT NULL,
  "valueDefinitionVersionId" TEXT NOT NULL,
  "sourceEventId" TEXT,
  "businessActionId" TEXT,
  "eventType" TEXT NOT NULL,
  "quantity" DECIMAL(20,6) NOT NULL,
  "currency" TEXT NOT NULL,
  "grossValueMinor" BIGINT NOT NULL,
  "allocatedCostMinor" BIGINT NOT NULL,
  "netValueMinor" BIGINT NOT NULL,
  "calculation" JSONB NOT NULL,
  "evidence" JSONB NOT NULL,
  "status" "ValueEventStatus" NOT NULL DEFAULT 'CALCULATED',
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "value_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "benefit_approvals" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "valueEventId" TEXT NOT NULL,
  "approverId" TEXT NOT NULL,
  "decision" "BenefitDecision" NOT NULL,
  "reason" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "benefit_approvals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operational_exceptions_matchEvaluationId_key" ON "operational_exceptions"("matchEvaluationId");
CREATE INDEX "operational_exceptions_tenantId_environmentId_status_severi_idx" ON "operational_exceptions"("tenantId", "environmentId", "status", "severity", "openedAt" DESC);
CREATE INDEX "operational_exceptions_tenantId_supplierInvoiceId_idx" ON "operational_exceptions"("tenantId", "supplierInvoiceId");
CREATE UNIQUE INDEX "operational_exceptions_tenantId_kind_sourceEventId_key" ON "operational_exceptions"("tenantId", "kind", "sourceEventId");
CREATE INDEX "exception_recoveries_tenantId_requestedAt_idx" ON "exception_recoveries"("tenantId", "requestedAt" DESC);
CREATE UNIQUE INDEX "exception_recoveries_exceptionId_idempotencyKey_key" ON "exception_recoveries"("exceptionId", "idempotencyKey");
CREATE INDEX "value_definitions_tenantId_status_idx" ON "value_definitions"("tenantId", "status");
CREATE UNIQUE INDEX "value_definitions_tenantId_environmentId_outcomeKey_key" ON "value_definitions"("tenantId", "environmentId", "outcomeKey");
CREATE INDEX "value_definition_versions_tenantId_publishedAt_idx" ON "value_definition_versions"("tenantId", "publishedAt" DESC);
CREATE UNIQUE INDEX "value_definition_versions_valueDefinitionId_version_key" ON "value_definition_versions"("valueDefinitionId", "version");
CREATE UNIQUE INDEX "value_definition_versions_valueDefinitionId_checksum_key" ON "value_definition_versions"("valueDefinitionId", "checksum");
CREATE UNIQUE INDEX "value_events_businessActionId_key" ON "value_events"("businessActionId");
CREATE INDEX "value_events_tenantId_environmentId_status_occurredAt_idx" ON "value_events"("tenantId", "environmentId", "status", "occurredAt" DESC);
CREATE INDEX "benefit_approvals_tenantId_decidedAt_idx" ON "benefit_approvals"("tenantId", "decidedAt" DESC);
CREATE UNIQUE INDEX "benefit_approvals_valueEventId_approverId_key" ON "benefit_approvals"("valueEventId", "approverId");

ALTER TABLE "operational_exceptions" ADD CONSTRAINT "operational_exceptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "operational_exceptions" ADD CONSTRAINT "operational_exceptions_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "tenant_environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_exceptions" ADD CONSTRAINT "operational_exceptions_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "source_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_exceptions" ADD CONSTRAINT "operational_exceptions_supplierInvoiceId_fkey" FOREIGN KEY ("supplierInvoiceId") REFERENCES "supplier_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_exceptions" ADD CONSTRAINT "operational_exceptions_matchEvaluationId_fkey" FOREIGN KEY ("matchEvaluationId") REFERENCES "ap_match_evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_exceptions" ADD CONSTRAINT "operational_exceptions_businessActionId_fkey" FOREIGN KEY ("businessActionId") REFERENCES "business_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exception_recoveries" ADD CONSTRAINT "exception_recoveries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exception_recoveries" ADD CONSTRAINT "exception_recoveries_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "operational_exceptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exception_recoveries" ADD CONSTRAINT "exception_recoveries_replaySourceEventId_fkey" FOREIGN KEY ("replaySourceEventId") REFERENCES "source_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "value_definitions" ADD CONSTRAINT "value_definitions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "value_definitions" ADD CONSTRAINT "value_definitions_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "tenant_environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "value_definition_versions" ADD CONSTRAINT "value_definition_versions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "value_definition_versions" ADD CONSTRAINT "value_definition_versions_valueDefinitionId_fkey" FOREIGN KEY ("valueDefinitionId") REFERENCES "value_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "value_events" ADD CONSTRAINT "value_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "value_events" ADD CONSTRAINT "value_events_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "tenant_environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "value_events" ADD CONSTRAINT "value_events_valueDefinitionVersionId_fkey" FOREIGN KEY ("valueDefinitionVersionId") REFERENCES "value_definition_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "value_events" ADD CONSTRAINT "value_events_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "source_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "value_events" ADD CONSTRAINT "value_events_businessActionId_fkey" FOREIGN KEY ("businessActionId") REFERENCES "business_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "benefit_approvals" ADD CONSTRAINT "benefit_approvals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "benefit_approvals" ADD CONSTRAINT "benefit_approvals_valueEventId_fkey" FOREIGN KEY ("valueEventId") REFERENCES "value_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "value_definitions" ADD CONSTRAINT "value_definitions_currency_iso" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "value_definition_versions" ADD CONSTRAINT "value_definition_versions_version_positive" CHECK ("version" > 0);
ALTER TABLE "value_events" ADD CONSTRAINT "value_events_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "value_events" ADD CONSTRAINT "value_events_currency_iso" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "value_events" ADD CONSTRAINT "value_events_values_valid" CHECK ("grossValueMinor" >= 0 AND "allocatedCostMinor" >= 0 AND "netValueMinor" = "grossValueMinor" - "allocatedCostMinor");

CREATE TRIGGER "value_definition_versions_immutable"
  BEFORE UPDATE OR DELETE ON "value_definition_versions"
  FOR EACH ROW EXECUTE FUNCTION prevent_ap_immutable_record_update();
CREATE TRIGGER "benefit_approvals_immutable"
  BEFORE UPDATE OR DELETE ON "benefit_approvals"
  FOR EACH ROW EXECUTE FUNCTION prevent_ap_immutable_record_update();

CREATE FUNCTION enforce_value_event_integrity() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'value event history is immutable'; END IF;
  IF (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
    RAISE EXCEPTION 'value event calculation and evidence are immutable';
  END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
    OLD."status" = 'CALCULATED' AND NEW."status" IN ('VERIFIED', 'REJECTED')
  ) THEN
    RAISE EXCEPTION 'invalid value event state transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "value_events_integrity"
  BEFORE UPDATE OR DELETE ON "value_events"
  FOR EACH ROW EXECUTE FUNCTION enforce_value_event_integrity();

CREATE FUNCTION enforce_exception_recovery_integrity() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'exception recovery history is immutable'; END IF;
  IF (to_jsonb(NEW) - ARRAY['status', 'result', 'errorCode', 'completedAt'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'result', 'errorCode', 'completedAt']) THEN
    RAISE EXCEPTION 'exception recovery request is immutable';
  END IF;
  IF OLD."status" <> 'REQUESTED' OR NEW."status" NOT IN ('SUCCEEDED', 'FAILED') THEN
    RAISE EXCEPTION 'invalid exception recovery state transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "exception_recoveries_integrity"
  BEFORE UPDATE OR DELETE ON "exception_recoveries"
  FOR EACH ROW EXECUTE FUNCTION enforce_exception_recovery_integrity();

CREATE FUNCTION enforce_operational_exception_integrity() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'operational exception history is immutable'; END IF;
  IF (to_jsonb(NEW) - ARRAY['status', 'assignedToId', 'resolvedAt', 'updatedAt'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'assignedToId', 'resolvedAt', 'updatedAt']) THEN
    RAISE EXCEPTION 'operational exception evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "operational_exceptions_integrity"
  BEFORE UPDATE OR DELETE ON "operational_exceptions"
  FOR EACH ROW EXECUTE FUNCTION enforce_operational_exception_integrity();
