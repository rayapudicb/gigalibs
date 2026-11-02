-- WI-OI-143: mobile enroll replays on clientOperationId (same tenant), not only platform_user_id.
BEGIN;

ALTER TABLE gigalibs_safety_operations.contractor_workers
  ADD COLUMN enroll_client_operation_id UUID;

CREATE UNIQUE INDEX contractor_workers_enroll_operation
  ON gigalibs_safety_operations.contractor_workers (tenant_id, enroll_client_operation_id)
  WHERE enroll_client_operation_id IS NOT NULL;

INSERT INTO gigalibs_safety_operations.schema_migrations (version, name)
VALUES (4, '000004_contractor_enroll_idempotency');

COMMIT;
