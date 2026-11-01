-- WI-OI-135 proof for CMMS migration 28 (asset tagging, commissioning, floor walks). Run on a disposable PostgreSQL 16
-- with CMMS manifest migrations through 28, as a non-superuser, non-owner role with the CMMS runtime grants
-- (asset_audit_sightings without UPDATE/DELETE). One transaction, rolled back.
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
  pump constant uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
  motor constant uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  request constant uuid := 'bbbbbbbb-0000-4000-8000-000000000011';
  walk constant uuid := 'bbbbbbbb-0000-4000-8000-000000000021';
  seen integer;
BEGIN
  PERFORM set_config('app.tenant_id', 'tenant-a', true);
  INSERT INTO gigalibs_cmms.assets (tenant_id, id, asset_tag, name, created_by, updated_by, correlation_id) VALUES
    ('tenant-a', pump, 'P-101', 'Feed pump', 'tech-1', 'tech-1', 'proof'),
    ('tenant-a', motor, 'M-101', 'Drive motor', 'tech-1', 'tech-1', 'proof');

  -- Tags: one active binding per physical tag; NFC identifiers are hexadecimal; retirement is complete or absent.
  INSERT INTO gigalibs_cmms.asset_physical_tags (tenant_id, asset_id, kind, value, bound_by, correlation_id)
  VALUES ('tenant-a', pump, 'NFC', '04A2B3C4D5', 'tech-1', 'proof');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.asset_physical_tags (tenant_id, asset_id, kind, value,
    bound_by, correlation_id) VALUES ('tenant-a', %L, 'NFC', '04A2B3C4D5', 't', 'p')$$, motor), '23505');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.asset_physical_tags (tenant_id, asset_id, kind, value,
    bound_by, correlation_id) VALUES ('tenant-a', %L, 'NFC', '04:a2', 't', 'p')$$, motor), '23514');
  PERFORM pg_temp.refuses($$UPDATE gigalibs_cmms.asset_physical_tags SET status = 'RETIRED' WHERE value = '04A2B3C4D5'$$, '23514');
  UPDATE gigalibs_cmms.asset_physical_tags SET status = 'RETIRED', retired_by = 'lead-1', retired_at = now(),
    retire_reason = 'Tag damaged' WHERE value = '04A2B3C4D5';
  INSERT INTO gigalibs_cmms.asset_physical_tags (tenant_id, asset_id, kind, value, bound_by, correlation_id)
  VALUES ('tenant-a', motor, 'NFC', '04A2B3C4D5', 'tech-1', 'proof');
  INSERT INTO gigalibs_cmms.asset_physical_tags (tenant_id, asset_id, kind, value, bound_by, correlation_id)
  VALUES ('tenant-a', motor, 'DATAMATRIX', 'M-101/DM', 'tech-1', 'proof');

  -- Commissioning: pairs, unique operation, decision shape and four eyes.
  INSERT INTO gigalibs_cmms.asset_commissioning_requests (tenant_id, id, client_operation_id, request_sha256,
    proposed_asset_tag, name, serial_number, tag_kind, tag_value, submitted_by, correlation_id)
  VALUES ('tenant-a', request, 'bbbbbbbb-0000-4000-8000-0000000000a1', repeat('a', 64), 'P-102', 'New pump', 'SN-1',
    'QR', 'P-102-QR', 'tech-1', 'proof');
  PERFORM pg_temp.refuses($$INSERT INTO gigalibs_cmms.asset_commissioning_requests (tenant_id, client_operation_id,
    request_sha256, proposed_asset_tag, name, submitted_by, correlation_id) VALUES ('tenant-a',
    'bbbbbbbb-0000-4000-8000-0000000000a1', repeat('b', 64), 'P-103', 'Dup', 't', 'p')$$, '23505');
  PERFORM pg_temp.refuses($$INSERT INTO gigalibs_cmms.asset_commissioning_requests (tenant_id, client_operation_id,
    request_sha256, proposed_asset_tag, name, tag_kind, submitted_by, correlation_id) VALUES ('tenant-a',
    gen_random_uuid(), repeat('b', 64), 'P-103', 'Half tag', 'QR', 't', 'p')$$, '23514');
  PERFORM pg_temp.refuses($$INSERT INTO gigalibs_cmms.asset_commissioning_requests (tenant_id, client_operation_id,
    request_sha256, proposed_asset_tag, name, latitude, submitted_by, correlation_id) VALUES ('tenant-a',
    gen_random_uuid(), repeat('b', 64), 'P-103', 'Half location', 12.5, 't', 'p')$$, '23514');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.asset_commissioning_requests SET status = 'APPROVED',
    decision = 'CREATED', reviewed_by = 'tech-1', reviewed_at = now(), asset_id = %L WHERE id = %L$$, motor, request), '23514');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.asset_commissioning_requests SET status = 'APPROVED',
    decision = 'CREATED', reviewed_by = 'lead-1', reviewed_at = now() WHERE id = %L$$, request), '23514');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.asset_commissioning_requests SET status = 'REJECTED',
    decision = 'REJECTED', reviewed_by = 'lead-1', reviewed_at = now() WHERE id = %L$$, request), '23514');
  UPDATE gigalibs_cmms.asset_commissioning_requests SET status = 'APPROVED', decision = 'LINKED', reviewed_by = 'lead-1',
    reviewed_at = now(), asset_id = motor, version = 2 WHERE id = request;

  -- Walks and append-only sightings.
  PERFORM pg_temp.refuses($$INSERT INTO gigalibs_cmms.asset_audit_walks (tenant_id, client_operation_id, label,
    started_by, correlation_id) VALUES ('tenant-a', gen_random_uuid(), 'Nowhere', 't', 'p')$$, '23514');
  INSERT INTO gigalibs_cmms.asset_audit_walks (tenant_id, id, client_operation_id, label, site_ref, started_by, correlation_id)
  VALUES ('tenant-a', walk, gen_random_uuid(), 'Pump house', gen_random_uuid(), 'tech-1', 'proof');
  INSERT INTO gigalibs_cmms.asset_audit_sightings (tenant_id, walk_id, client_operation_id, kind, value, asset_id, seen_at, seen_by)
  VALUES ('tenant-a', walk, 'bbbbbbbb-0000-4000-8000-0000000000b1', 'NFC', '04A2B3C4D5', motor, now(), 'tech-1');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.asset_audit_sightings (tenant_id, walk_id, client_operation_id,
    kind, value, seen_at, seen_by) VALUES ('tenant-a', %L, 'bbbbbbbb-0000-4000-8000-0000000000b1', 'QR', 'X', now(), 't')$$, walk), '23505');
  PERFORM pg_temp.refuses($$UPDATE gigalibs_cmms.asset_audit_sightings SET asset_id = NULL$$, '42501');
  PERFORM pg_temp.refuses($$DELETE FROM gigalibs_cmms.asset_audit_sightings$$, '42501');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.asset_audit_walks SET status = 'FINISHED' WHERE id = %L$$, walk), '23514');
  UPDATE gigalibs_cmms.asset_audit_walks SET status = 'FINISHED', finished_at = now() WHERE id = walk;

  -- Tenant isolation.
  PERFORM set_config('app.tenant_id', 'tenant-b', true);
  SELECT (SELECT count(*) FROM gigalibs_cmms.asset_physical_tags) + (SELECT count(*) FROM gigalibs_cmms.asset_commissioning_requests)
       + (SELECT count(*) FROM gigalibs_cmms.asset_audit_walks) + (SELECT count(*) FROM gigalibs_cmms.asset_audit_sightings) INTO seen;
  IF seen <> 0 THEN RAISE EXCEPTION 'tenant B sees % tagging rows of tenant A', seen; END IF;
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.asset_physical_tags (tenant_id, asset_id, kind, value,
    bound_by, correlation_id) VALUES ('tenant-a', %L, 'QR', 'cross', 't', 'p')$$, pump), '42501');
  PERFORM set_config('app.tenant_id', '', true);
  SELECT count(*) INTO seen FROM gigalibs_cmms.asset_physical_tags;
  IF seen <> 0 THEN RAISE EXCEPTION 'an unbound session sees % tags', seen; END IF;

  RAISE NOTICE 'CMMS migration 28 tagging and commissioning proof passed';
END
$proof$;

ROLLBACK;
