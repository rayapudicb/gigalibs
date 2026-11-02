-- WI-OI-139 proof for CMMS migration 31 (fleet equipment inspection). Disposable PostgreSQL 16 with CMMS manifest
-- migrations through 31, as a non-superuser, non-owner role with the CMMS runtime grants (fleet inspections, results
-- and photos append-only). Rolled back.
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
  forklift constant uuid := 'f1000000-0000-4000-8000-000000000001';
  template constant uuid := 'f1000000-0000-4000-8000-000000000011';
  request constant uuid := 'f1000000-0000-4000-8000-000000000021';
  passed constant uuid := 'f1000000-0000-4000-8000-000000000031';
  failed constant uuid := 'f1000000-0000-4000-8000-000000000032';
  red_tag constant uuid := 'f1000000-0000-4000-8000-000000000041';
  zones constant jsonb := '[{"key":"front","title":"Front","items":[{"key":"forks","label":"Forks"}]}]';
  seen integer;
BEGIN
  PERFORM set_config('app.tenant_id', 'tenant-a', true);
  INSERT INTO gigalibs_cmms.assets (tenant_id, id, asset_tag, name, created_by, updated_by, correlation_id)
  VALUES ('tenant-a', forklift, 'FL-09', 'Forklift 9', 'a', 'a', 'proof');

  -- Templates: one draft per code; a draft carries no publication, a published revision does.
  INSERT INTO gigalibs_cmms.fleet_check_templates (tenant_id, id, code, name, revision, zones, authored_by, updated_by, correlation_id)
  VALUES ('tenant-a', template, 'FORKLIFT', 'Forklift circle check', 1, zones, 'sup-1', 'sup-1', 'proof');
  PERFORM pg_temp.refuses($$INSERT INTO gigalibs_cmms.fleet_check_templates (tenant_id, code, name, revision, zones,
    authored_by, updated_by, correlation_id) VALUES ('tenant-a', 'FORKLIFT', 'Again', 2, '[{}]', 's', 's', 'p')$$, '23505');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.fleet_check_templates SET status = 'PUBLISHED' WHERE id = %L$$, template), '23514');
  UPDATE gigalibs_cmms.fleet_check_templates SET status = 'PUBLISHED', published_by = 'sup-1', published_at = now() WHERE id = template;
  INSERT INTO gigalibs_cmms.fleet_enrollments (tenant_id, asset_id, template_code, enrolled_by, updated_by, correlation_id)
  VALUES ('tenant-a', forklift, 'FORKLIFT', 'sup-1', 'sup-1', 'proof');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.fleet_enrollments (tenant_id, asset_id, template_code,
    interval_hours, enrolled_by, updated_by, correlation_id) VALUES ('tenant-b', %L, 'FORKLIFT', 24, 's', 's', 'p')$$, forklift), '42501');

  -- Inspections: the result follows the defects, minor defects carry their request, and the rows never change.
  INSERT INTO gigalibs_cmms.fleet_inspections (tenant_id, id, client_operation_id, payload_sha256, asset_id, template_id,
    kind, inspected_by, started_at, submitted_at, result, minor_count, critical_count, certified, correlation_id)
  VALUES ('tenant-a', passed, gen_random_uuid(), repeat('a', 64), forklift, template, 'PRE_TRIP', 'op-1', now(), now(),
    'PASS', 0, 0, true, 'proof');
  INSERT INTO gigalibs_cmms.fleet_inspection_results (tenant_id, inspection_id, item_key, zone_key, position, outcome)
  VALUES ('tenant-a', passed, 'forks', 'front', 0, 'PASS');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.fleet_inspections (tenant_id, client_operation_id,
    payload_sha256, asset_id, template_id, kind, inspected_by, started_at, submitted_at, result, minor_count,
    critical_count, certified, correlation_id) VALUES ('tenant-a', gen_random_uuid(), repeat('a', 64), %L, %L,
    'PRE_TRIP', 'op-1', now(), now(), 'PASS', 0, 1, true, 'p')$$, forklift, template), '23514');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.fleet_inspections (tenant_id, client_operation_id,
    payload_sha256, asset_id, template_id, kind, inspected_by, started_at, submitted_at, result, minor_count,
    critical_count, certified, correlation_id) VALUES ('tenant-a', gen_random_uuid(), repeat('a', 64), %L, %L,
    'PRE_TRIP', 'op-1', now(), now(), 'DEFECTS', 1, 0, true, 'p')$$, forklift, template), '23514');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.fleet_inspections (tenant_id, client_operation_id,
    payload_sha256, asset_id, template_id, kind, inspected_by, started_at, submitted_at, result, minor_count,
    critical_count, certified, correlation_id) VALUES ('tenant-a', gen_random_uuid(), repeat('a', 64), %L, %L,
    'PRE_TRIP', 'op-1', now(), now(), 'PASS', 0, 0, false, 'p')$$, forklift, template), '23514');
  INSERT INTO gigalibs_cmms.maintenance_requests (tenant_id, id, request_number, title, priority, asset_id,
    requester_subject, correlation_id)
  VALUES ('tenant-a', request, 'REQ-000001', 'Fleet defects: FL-09', 'MEDIUM', forklift, 'op-1', 'proof');
  INSERT INTO gigalibs_cmms.fleet_inspections (tenant_id, id, client_operation_id, payload_sha256, asset_id, template_id,
    kind, inspected_by, started_at, submitted_at, result, minor_count, critical_count, request_id, certified, correlation_id)
  VALUES ('tenant-a', failed, gen_random_uuid(), repeat('b', 64), forklift, template, 'PRE_TRIP', 'op-1', now(), now(),
    'GROUNDED', 1, 1, request, true, 'proof');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.fleet_inspection_results (tenant_id, inspection_id,
    item_key, zone_key, position, outcome) VALUES ('tenant-a', %L, 'forks', 'front', 0, 'CRITICAL')$$, failed), '23514');
  INSERT INTO gigalibs_cmms.fleet_inspection_results (tenant_id, inspection_id, item_key, zone_key, position, outcome, note)
  VALUES ('tenant-a', failed, 'forks', 'front', 0, 'CRITICAL', 'Mast chain frayed');
  INSERT INTO gigalibs_cmms.fleet_inspection_photos (tenant_id, inspection_id, item_key, content_type, bytes, sha256)
  VALUES ('tenant-a', failed, 'forks', 'image/png', decode('89504e470d0a1a0a0000000d49484452', 'hex'), repeat('c', 64));
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.fleet_inspections SET result = 'PASS' WHERE id = %L$$, failed), '42501');
  PERFORM pg_temp.refuses(format($$DELETE FROM gigalibs_cmms.fleet_inspection_results WHERE inspection_id = %L$$, failed), '42501');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.fleet_inspection_photos SET sha256 = repeat('d', 64) WHERE inspection_id = %L$$, failed), '42501');

  -- Groundings: one open per asset; a repair certificate is whole; whoever clears did not certify; an override says why.
  INSERT INTO gigalibs_cmms.fleet_groundings (tenant_id, id, asset_id, source, inspection_id, reason, grounded_by, updated_by, correlation_id)
  VALUES ('tenant-a', red_tag, forklift, 'INSPECTION', failed, 'Mast chain frayed', 'op-1', 'op-1', 'proof');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.fleet_groundings (tenant_id, asset_id, source,
    client_operation_id, reason, grounded_by, updated_by, correlation_id) VALUES ('tenant-a', %L, 'MANUAL',
    gen_random_uuid(), 'Brakes', 'op-2', 'op-2', 'p')$$, forklift), '23505');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.fleet_groundings (tenant_id, asset_id, source, reason,
    grounded_by, updated_by, correlation_id) VALUES ('tenant-a', %L, 'MANUAL', 'No operation', 'op-2', 'op-2', 'p')$$, forklift), '23514');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.fleet_groundings SET status = 'REPAIRED', certified_by = 'mech-1',
    certified_at = now() WHERE id = %L$$, red_tag), '23514');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.fleet_groundings SET status = 'CLEARED', cleared_by = 'sup-1',
    cleared_at = now() WHERE id = %L$$, red_tag), '23514');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.fleet_groundings SET status = 'CLEARED', cleared_by = 'sup-1',
    cleared_at = now(), override = true WHERE id = %L$$, red_tag), '23514');
  UPDATE gigalibs_cmms.fleet_groundings SET status = 'REPAIRED', certified_by = 'mech-1', certified_at = now(),
    corrective_action = 'Replaced the left mast chain' WHERE id = red_tag;
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.fleet_groundings SET status = 'CLEARED', cleared_by = 'mech-1',
    cleared_at = now() WHERE id = %L$$, red_tag), '23514');
  UPDATE gigalibs_cmms.fleet_groundings SET status = 'CLEARED', cleared_by = 'sup-1', cleared_at = now() WHERE id = red_tag;
  INSERT INTO gigalibs_cmms.fleet_groundings (tenant_id, asset_id, source, client_operation_id, reason, grounded_by, updated_by, correlation_id)
  VALUES ('tenant-a', forklift, 'MANUAL', gen_random_uuid(), 'Horn silent', 'op-2', 'op-2', 'proof');

  -- The new work-order origin is accepted.
  SELECT count(*) INTO seen FROM pg_constraint WHERE conname = 'work_orders_trigger_source_check'
     AND pg_get_constraintdef(oid) LIKE '%FLEET_DEFECT%';
  IF seen <> 1 THEN RAISE EXCEPTION 'the FLEET_DEFECT work-order origin is missing'; END IF;

  PERFORM set_config('app.tenant_id', 'tenant-b', true);
  SELECT (SELECT count(*) FROM gigalibs_cmms.fleet_check_templates) + (SELECT count(*) FROM gigalibs_cmms.fleet_enrollments)
       + (SELECT count(*) FROM gigalibs_cmms.fleet_inspections) + (SELECT count(*) FROM gigalibs_cmms.fleet_inspection_results)
       + (SELECT count(*) FROM gigalibs_cmms.fleet_inspection_photos) + (SELECT count(*) FROM gigalibs_cmms.fleet_groundings) INTO seen;
  IF seen <> 0 THEN RAISE EXCEPTION 'tenant B sees % fleet rows of tenant A', seen; END IF;
  RAISE NOTICE 'CMMS migration 31 fleet equipment inspection proof passed';
END
$proof$;

ROLLBACK;
