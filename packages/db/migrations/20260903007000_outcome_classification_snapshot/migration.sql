-- Snapshot effective classifications on derived operational outcomes so access,
-- retention and export policy do not depend on a mutable join at read time.
ALTER TABLE "operational_exceptions" ADD COLUMN "classification" "DataClassification";
ALTER TABLE "value_definitions" ADD COLUMN "classification" "DataClassification";
ALTER TABLE "value_events" ADD COLUMN "classification" "DataClassification";

-- Permit only the one-time null-to-value backfill through existing immutability triggers.
CREATE OR REPLACE FUNCTION enforce_operational_exception_integrity() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'operational exception history is immutable'; END IF;
  IF (to_jsonb(NEW) - ARRAY['status', 'assignedToId', 'resolvedAt', 'updatedAt', 'classification'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'assignedToId', 'resolvedAt', 'updatedAt', 'classification']) THEN
    RAISE EXCEPTION 'operational exception evidence is immutable';
  END IF;
  IF NEW."classification" IS DISTINCT FROM OLD."classification"
     AND (OLD."classification" IS NOT NULL OR NEW."classification" IS NULL) THEN
    RAISE EXCEPTION 'operational exception classification is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_value_event_integrity() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'value event history is immutable'; END IF;
  IF (to_jsonb(NEW) - ARRAY['status', 'classification'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'classification']) THEN
    RAISE EXCEPTION 'value event calculation and evidence are immutable';
  END IF;
  IF NEW."classification" IS DISTINCT FROM OLD."classification"
     AND (OLD."classification" IS NOT NULL OR NEW."classification" IS NULL) THEN
    RAISE EXCEPTION 'value event classification is immutable';
  END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
    OLD."status" = 'CALCULATED' AND NEW."status" IN ('VERIFIED', 'REJECTED')
  ) THEN
    RAISE EXCEPTION 'invalid value event state transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

UPDATE "operational_exceptions" AS exception
SET "classification" = COALESCE(source."classification", 'CONFIDENTIAL'::"DataClassification")
FROM "source_events" AS source
WHERE source."id" = exception."sourceEventId";

UPDATE "operational_exceptions"
SET "classification" = 'CONFIDENTIAL'::"DataClassification"
WHERE "classification" IS NULL;

-- Existing value definitions predate explicit classification. Financial
-- assumptions are conservatively backfilled as confidential; all new writes
-- must provide an explicit tenant-owned classification.
UPDATE "value_definitions"
SET "classification" = 'CONFIDENTIAL'::"DataClassification";

WITH effective_classification AS (
  SELECT
    event."id" AS "eventId",
    source."classification" AS "sourceClassification",
    definition."classification" AS "definitionClassification"
  FROM "value_events" AS event
  JOIN "value_definition_versions" AS version
    ON version."id" = event."valueDefinitionVersionId"
  JOIN "value_definitions" AS definition
    ON definition."id" = version."valueDefinitionId"
  LEFT JOIN "source_events" AS source
    ON source."id" = event."sourceEventId"
)
UPDATE "value_events" AS event
SET "classification" = CASE
  WHEN effective."sourceClassification" = 'RESTRICTED'
    OR effective."definitionClassification" = 'RESTRICTED'
    THEN 'RESTRICTED'::"DataClassification"
  WHEN effective."sourceClassification" = 'CONFIDENTIAL'
    OR effective."definitionClassification" = 'CONFIDENTIAL'
    THEN 'CONFIDENTIAL'::"DataClassification"
  WHEN effective."sourceClassification" = 'INTERNAL'
    OR effective."definitionClassification" = 'INTERNAL'
    THEN 'INTERNAL'::"DataClassification"
  ELSE 'PUBLIC'::"DataClassification"
END
FROM effective_classification AS effective
WHERE effective."eventId" = event."id";

ALTER TABLE "operational_exceptions" ALTER COLUMN "classification" SET NOT NULL;
ALTER TABLE "value_definitions" ALTER COLUMN "classification" SET NOT NULL;
ALTER TABLE "value_events" ALTER COLUMN "classification" SET NOT NULL;

CREATE INDEX "operational_exceptions_tenantId_classification_status_idx"
  ON "operational_exceptions"("tenantId", "classification", "status");
CREATE INDEX "value_definitions_tenantId_classification_status_idx"
  ON "value_definitions"("tenantId", "classification", "status");
CREATE INDEX "value_events_tenantId_classification_status_idx"
  ON "value_events"("tenantId", "classification", "status");
