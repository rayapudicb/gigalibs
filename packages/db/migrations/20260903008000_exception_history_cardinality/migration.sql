-- Business matching may produce a sequence of immutable exceptions as new
-- evidence arrives. Only infrastructure processing failure is one-per-source.
DROP INDEX "operational_exceptions_tenantId_kind_sourceEventId_key";

CREATE INDEX "operational_exceptions_tenantId_kind_sourceEventId_idx"
  ON "operational_exceptions"("tenantId", "kind", "sourceEventId");

CREATE UNIQUE INDEX "operational_exceptions_processing_failure_event_key"
  ON "operational_exceptions"("tenantId", "sourceEventId")
  WHERE "kind" = 'PROCESSING_FAILURE' AND "sourceEventId" IS NOT NULL;
