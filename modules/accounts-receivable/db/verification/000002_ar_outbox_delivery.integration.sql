BEGIN;

CREATE ROLE gigalibs_ar_outbox_test_login NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT gigalibs_ar_outbox_worker TO gigalibs_ar_outbox_test_login;

INSERT INTO gigalibs_ar.module_tenants (id, oidc_issuer, external_tenant_subject)
VALUES ('30000000-0000-4000-8000-000000000003', 'https://test.invalid', 'outbox-test');
INSERT INTO gigalibs_ar.outbox_events (
  tenant_id, id, event_type, aggregate_type, aggregate_id, subject,
  correlation_id, payload
) VALUES (
  '30000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000004',
  'ar.test-only.v1',
  'test',
  '30000000-0000-4000-8000-000000000005',
  'test-only',
  'test-only-correlation',
  '{"testData":true}'::jsonb
);

SET LOCAL ROLE gigalibs_ar_outbox_test_login;

DO $$
BEGIN
  IF (SELECT count(*) FROM gigalibs_ar.outbox_events) <> 1 THEN
    RAISE EXCEPTION 'worker role cannot read the pending outbox event';
  END IF;
  IF has_table_privilege(current_user, 'gigalibs_ar.customers', 'SELECT') THEN
    RAISE EXCEPTION 'worker role unexpectedly has customer-table access';
  END IF;
END;
$$;

UPDATE gigalibs_ar.outbox_events
SET claim_id = '30000000-0000-4000-8000-000000000006',
  claimed_by = 'test-only-worker', claimed_at = transaction_timestamp()
WHERE id = '30000000-0000-4000-8000-000000000004';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM gigalibs_ar.outbox_events
    WHERE id = '30000000-0000-4000-8000-000000000004' AND claim_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'worker role cannot claim the outbox event';
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;
