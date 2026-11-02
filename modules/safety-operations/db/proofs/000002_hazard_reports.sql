-- WI-OI-141 proof for Safety Operations migration 2 (hazard reports). Disposable PostgreSQL 16 with migrations 1–2, as
-- a non-superuser, non-owner role with the runtime grants (audit, photos and acknowledgements append-only). Rolled back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE gigalibs_safety_proof;

CREATE FUNCTION pg_temp.refuses(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $refuses$
BEGIN
  EXECUTE statement;
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'accepted';
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE <> expected THEN
    RAISE EXCEPTION 'expected SQLSTATE % but got % (%) for: %', expected, SQLSTATE, SQLERRM, statement USING ERRCODE = 'XX000';
  END IF;
END
$refuses$;

DO $proof$
DECLARE
  leak constant uuid := 'b3000000-0000-4000-8000-000000000001';
  alert constant uuid := 'b3000000-0000-4000-8000-000000000011';
  seen integer;
BEGIN
  PERFORM set_config('app.tenant_id', 'tenant-a', true);
  INSERT INTO gigalibs_safety_operations.hazard_reports (id, tenant_id, reference, client_operation_id, payload_sha256,
    severity, category, description, area, reported_by, observed_at, triage_due_at, correlation_id)
  VALUES (leak, 'tenant-a', 'HZ-000001', gen_random_uuid(), repeat('a', 64), 'STOP_WORK', 'LEAK_SPILL',
    'Hydraulic oil on the ladder rung', 'Catwalk B2', 'op-1', now(), now(), 'proof');
  PERFORM pg_temp.refuses($$INSERT INTO gigalibs_safety_operations.hazard_reports (id, tenant_id, reference,
    client_operation_id, payload_sha256, severity, category, description, area, reported_by, observed_at, triage_due_at,
    correlation_id) VALUES (gen_random_uuid(), 'tenant-a', 'HZ-000002', gen_random_uuid(), repeat('a', 64), 'GOOD_CATCH',
    'OTHER', 'Future', 'Yard', 'op-1', now() + interval '1 hour', now() + interval '2 days', 'p')$$, '23514');
  -- Triage is whole, independent of the reporter, and before closing.
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_safety_operations.hazard_reports SET status = 'TRIAGED' WHERE id = %L$$, leak), '23514');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_safety_operations.hazard_reports SET status = 'TRIAGED', triaged_by = 'op-1',
    triaged_at = now(), likelihood = 3, consequence = 5, route = 'MAINTENANCE' WHERE id = %L$$, leak), '23514');
  UPDATE gigalibs_safety_operations.hazard_reports SET status = 'TRIAGED', triaged_by = 'champion-1', triaged_at = now(),
    likelihood = 3, consequence = 5, route = 'INVESTIGATION' WHERE id = leak;
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_safety_operations.hazard_reports SET status = 'CLOSED' WHERE id = %L$$, leak), '23514');

  -- Stop work: one alert per report, acknowledged once per person (never changed), lifted with a reason by someone else.
  INSERT INTO gigalibs_safety_operations.stop_work_alerts (id, tenant_id, report_id, area, raised_by, correlation_id)
  VALUES (alert, 'tenant-a', leak, 'Catwalk B2', 'op-1', 'proof');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_safety_operations.stop_work_alerts (id, tenant_id, report_id, area,
    raised_by, correlation_id) VALUES (gen_random_uuid(), 'tenant-a', %L, 'Again', 'op-1', 'p')$$, leak), '23505');
  INSERT INTO gigalibs_safety_operations.stop_work_acknowledgements (alert_id, tenant_id, subject) VALUES (alert, 'tenant-a', 'sup-1');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_safety_operations.stop_work_acknowledgements (alert_id, tenant_id,
    subject) VALUES (%L, 'tenant-a', 'sup-1')$$, alert), '23505');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_safety_operations.stop_work_acknowledgements SET subject = 'x'
    WHERE alert_id = %L$$, alert), '42501');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_safety_operations.stop_work_alerts SET status = 'LIFTED', lifted_by = 'op-1',
    lifted_at = now(), lift_reason = 'Wiped' WHERE id = %L$$, alert), '23514');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_safety_operations.stop_work_alerts SET status = 'LIFTED', lifted_by = 'ehs-1',
    lifted_at = now() WHERE id = %L$$, alert), '23514');
  UPDATE gigalibs_safety_operations.stop_work_alerts SET status = 'LIFTED', lifted_by = 'ehs-1', lifted_at = now(),
    lift_reason = 'Leak isolated and rung cleaned' WHERE id = alert;

  INSERT INTO gigalibs_safety_operations.hazard_photos (report_id, tenant_id, content_type, bytes, sha256)
  VALUES (leak, 'tenant-a', 'image/png', decode('89504e470d0a1a0a0000000d49484452', 'hex'), repeat('b', 64));
  PERFORM pg_temp.refuses(format($$DELETE FROM gigalibs_safety_operations.hazard_photos WHERE report_id = %L$$, leak), '42501');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_safety_operations.hazard_investigations (report_id, tenant_id, whys,
    root_cause, investigator, correlation_id) VALUES (%L, 'tenant-a', '[]', 'x', 'ehs-1', 'p')$$, leak), '23514');
  INSERT INTO gigalibs_safety_operations.hazard_investigations (report_id, tenant_id, whys, root_cause, investigator, correlation_id)
  VALUES (leak, 'tenant-a', '["Hose burst", "Hose past life"]', 'Hose not on the PM list', 'ehs-1', 'proof');

  PERFORM set_config('app.tenant_id', 'tenant-b', true);
  SELECT (SELECT count(*) FROM gigalibs_safety_operations.hazard_reports) + (SELECT count(*) FROM gigalibs_safety_operations.stop_work_alerts)
       + (SELECT count(*) FROM gigalibs_safety_operations.stop_work_acknowledgements) + (SELECT count(*) FROM gigalibs_safety_operations.hazard_photos)
       + (SELECT count(*) FROM gigalibs_safety_operations.hazard_investigations) INTO seen;
  IF seen <> 0 THEN RAISE EXCEPTION 'tenant B sees % safety rows of tenant A', seen; END IF;
  RAISE NOTICE 'Safety Operations migration 2 hazard reports proof passed';
END
$proof$;

ROLLBACK;
