-- WI-OI-142 proof for CMMS migration 33 (lockout and permits). Disposable PostgreSQL 16 with CMMS manifest migrations
-- through 33, as a non-superuser, non-owner role with the CMMS runtime grants (lock photos, lock events and gas tests
-- append-only). Rolled back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE gigalibs_cmms_proof;

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
  pump constant uuid := 'c4000000-0000-4000-8000-000000000001';
  procedure constant uuid := 'c4000000-0000-4000-8000-000000000011';
  permit constant uuid := 'c4000000-0000-4000-8000-000000000021';
  points constant jsonb := '[{"key":"breaker","label":"Breaker","energy":"ELECTRICAL","isolationTag":"MCC-04-12","method":"Off and lock"}]';
  seen integer;
BEGIN
  PERFORM set_config('app.tenant_id', 'tenant-a', true);
  INSERT INTO gigalibs_cmms.assets (tenant_id, id, asset_tag, name, created_by, updated_by, correlation_id)
  VALUES ('tenant-a', pump, 'P-101', 'Feed pump', 'a', 'a', 'proof');

  -- Procedures: published by someone who wrote none of it.
  INSERT INTO gigalibs_cmms.isolation_procedures (tenant_id, id, code, title, revision, asset_id, points, authored_by,
    last_edited_by, updated_by, correlation_id)
  VALUES ('tenant-a', procedure, 'P-101-LOTO', 'Feed pump isolation', 1, pump, points, 'eng-1', 'eng-1', 'eng-1', 'proof');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.isolation_procedures SET status = 'PUBLISHED', published_by = 'eng-1',
    published_at = now() WHERE id = %L$$, procedure), '23514');
  UPDATE gigalibs_cmms.isolation_procedures SET status = 'PUBLISHED', published_by = 'issuer-1', published_at = now() WHERE id = procedure;

  -- Permits: at most 12 hours; live needs authorize and countersign by three different people.
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.permits (tenant_id, permit_number, client_operation_id, type, title,
    procedure_id, valid_from, valid_until, requested_by, updated_by, correlation_id) VALUES ('tenant-a', 'PTW-000009',
    gen_random_uuid(), 'LOTO', 'Long', %L, now(), now() + interval '13 hours', 'tech-1', 'tech-1', 'p')$$, procedure), '23514');
  INSERT INTO gigalibs_cmms.permits (tenant_id, id, permit_number, client_operation_id, type, title, procedure_id, asset_id,
    valid_from, valid_until, requested_by, updated_by, correlation_id)
  VALUES ('tenant-a', permit, 'PTW-000001', gen_random_uuid(), 'CONFINED_SPACE', 'Replace seal', procedure, pump, now(),
    now() + interval '8 hours', 'tech-1', 'tech-1', 'proof');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.permits SET status = 'LIVE', live_at = now() WHERE id = %L$$, permit), '23514');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.permits SET authorized_by = 'tech-1', authorized_at = now() WHERE id = %L$$, permit), '23514');
  UPDATE gigalibs_cmms.permits SET authorized_by = 'issuer-1', authorized_at = now() WHERE id = permit;
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.permits SET countersigned_by = 'issuer-1', countersigned_at = now() WHERE id = %L$$, permit), '23514');
  UPDATE gigalibs_cmms.permits SET countersigned_by = 'lead-1', countersigned_at = now(), status = 'LIVE', live_at = now() WHERE id = permit;

  -- Isolations: each state carries its evidence; a witness is a second person.
  INSERT INTO gigalibs_cmms.permit_isolations (tenant_id, permit_id, point_key, sequence, label, energy, isolation_tag, method)
  VALUES ('tenant-a', permit, 'breaker', 0, 'Breaker', 'ELECTRICAL', 'MCC-04-12', 'Off and lock');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.permit_isolations SET status = 'LOCKED' WHERE permit_id = %L$$, permit), '23514');
  UPDATE gigalibs_cmms.permit_isolations SET status = 'LOCKED', lock_serial = 'L-22', locked_by = 'tech-1', locked_at = now() WHERE permit_id = permit;
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.permit_isolations SET status = 'VERIFIED', verified_by = 'tech-1',
    verified_at = now(), witnessed_by = 'tech-1' WHERE permit_id = %L$$, permit), '23514');
  UPDATE gigalibs_cmms.permit_isolations SET status = 'VERIFIED', verified_by = 'tech-1', verified_at = now(), witnessed_by = 'issuer-1'
   WHERE permit_id = permit;
  INSERT INTO gigalibs_cmms.permit_lock_photos (tenant_id, permit_id, point_key, content_type, bytes, sha256)
  VALUES ('tenant-a', permit, 'breaker', 'image/png', decode('89504e470d0a1a0a0000000d49484452', 'hex'), repeat('a', 64));
  PERFORM pg_temp.refuses(format($$DELETE FROM gigalibs_cmms.permit_lock_photos WHERE permit_id = %L$$, permit), '42501');

  -- Gas tests: the flag follows the limits; events and tests never change.
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.permit_gas_tests (tenant_id, permit_id, client_operation_id,
    oxygen_percent, lel_percent, co_ppm, h2s_ppm, within_limits, tested_by, tested_at) VALUES ('tenant-a', %L, gen_random_uuid(),
    18.0, 0, 0, 0, true, 'tech-1', now())$$, permit), '23514');
  INSERT INTO gigalibs_cmms.permit_gas_tests (tenant_id, permit_id, client_operation_id, oxygen_percent, lel_percent, co_ppm,
    h2s_ppm, within_limits, tested_by, tested_at) VALUES ('tenant-a', permit, gen_random_uuid(), 20.9, 0, 2, 0, true, 'tech-1', now());
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.permit_gas_tests SET co_ppm = 0 WHERE permit_id = %L$$, permit), '42501');
  INSERT INTO gigalibs_cmms.permit_lock_events (tenant_id, permit_id, subject, kind) VALUES ('tenant-a', permit, 'tech-2', 'ON');
  PERFORM pg_temp.refuses(format($$DELETE FROM gigalibs_cmms.permit_lock_events WHERE permit_id = %L$$, permit), '42501');

  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.permits SET status = 'CLOSED' WHERE id = %L$$, permit), '23514');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.permits SET status = 'CANCELLED' WHERE id = %L$$, permit), '23514');

  PERFORM set_config('app.tenant_id', 'tenant-b', true);
  SELECT (SELECT count(*) FROM gigalibs_cmms.isolation_procedures) + (SELECT count(*) FROM gigalibs_cmms.permits)
       + (SELECT count(*) FROM gigalibs_cmms.permit_isolations) + (SELECT count(*) FROM gigalibs_cmms.permit_gas_tests)
       + (SELECT count(*) FROM gigalibs_cmms.permit_lock_events) + (SELECT count(*) FROM gigalibs_cmms.permit_lock_photos) INTO seen;
  IF seen <> 0 THEN RAISE EXCEPTION 'tenant B sees % permit rows of tenant A', seen; END IF;
  RAISE NOTICE 'CMMS migration 33 lockout permits proof passed';
END
$proof$;

ROLLBACK;
