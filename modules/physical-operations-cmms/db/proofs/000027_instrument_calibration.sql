-- WI-OI-134 proof for CMMS migration 27 (instrument calibration). Run on a disposable PostgreSQL 16 with CMMS
-- migrations 1-27 applied, as a role that is neither superuser nor owner and holds the CMMS runtime grants
-- (calibration_points and calibration_record_standards without UPDATE/DELETE). One transaction, rolled back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE gigalibs_cmms_proof;

CREATE FUNCTION pg_temp.refuses(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $refuses$
BEGIN
  EXECUTE statement;
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'accepted';
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE <> expected THEN
    RAISE EXCEPTION 'expected SQLSTATE % but got % (%) for: %', expected, SQLSTATE, SQLERRM, statement
      USING ERRCODE = 'XX000';
  END IF;
END
$refuses$;

DO $proof$
DECLARE
  asset constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  standard constant uuid := 'aaaaaaaa-0000-4000-8000-000000000011';
  profile1 constant uuid := 'aaaaaaaa-0000-4000-8000-000000000021';
  profile2 constant uuid := 'aaaaaaaa-0000-4000-8000-000000000022';
  corrective constant uuid := 'aaaaaaaa-0000-4000-8000-000000000031';
  passed constant uuid := 'aaaaaaaa-0000-4000-8000-000000000041';
  failed constant uuid := 'aaaaaaaa-0000-4000-8000-000000000042';
  definition constant jsonb := '{"inputLrv":0,"inputUrv":100,"inputUnit":"psi","outputLrv":4,"outputUrv":20,"outputUnit":"mA","transfer":"LINEAR","toleranceMode":"PERCENT_SPAN","toleranceValue":0.5,"testPoints":[0,25,50,75,100],"intervalDays":365}';
  hash constant text := repeat('a', 64);
  seen integer;
  record_columns constant text := 'tenant_id,id,asset_id,profile_id,profile_revision,definition,technician,client_operation_id,'
    'request_sha256,started_at,completed_at,as_found_result,as_left_result,overall_result,impact_review_required,'
    'technician_statement,record_sha256,corrective_work_order_id,asset_taken_offline,correlation_id';
BEGIN
  PERFORM set_config('app.tenant_id', 'tenant-a', true);

  INSERT INTO gigalibs_cmms.assets (tenant_id, id, asset_tag, name, created_by, updated_by, correlation_id)
  VALUES ('tenant-a', asset, 'PT-101', 'Feed pressure transmitter', 'author-1', 'author-1', 'proof');

  -- Standards: validity window and unique code.
  INSERT INTO gigalibs_cmms.calibration_standards (tenant_id, id, code, name, certificate_number, issued_by,
    calibrated_on, valid_until, created_by, updated_by, correlation_id)
  VALUES ('tenant-a', standard, 'FLUKE-754-01', 'Fluke 754', 'CERT-1', 'Accredited lab', '2026-01-10', '2027-01-10',
    'author-1', 'author-1', 'proof');
  PERFORM pg_temp.refuses($$INSERT INTO gigalibs_cmms.calibration_standards (tenant_id, code, name, certificate_number,
    issued_by, calibrated_on, valid_until, created_by, updated_by, correlation_id) VALUES ('tenant-a', 'DWT-1', 'Dead weight',
    'C', 'Lab', '2026-02-01', '2026-01-01', 'a', 'a', 'p')$$, '23514');
  PERFORM pg_temp.refuses($$INSERT INTO gigalibs_cmms.calibration_standards (tenant_id, code, name, certificate_number,
    issued_by, calibrated_on, valid_until, created_by, updated_by, correlation_id) VALUES ('tenant-a', 'FLUKE-754-01', 'Dup',
    'C', 'Lab', '2026-01-01', '2027-01-01', 'a', 'a', 'p')$$, '23505');

  -- Profiles: ranges, points, one draft and one published per asset, four eyes on publication.
  INSERT INTO gigalibs_cmms.calibration_profiles (tenant_id, id, asset_id, revision, input_lrv, input_urv, input_unit,
    output_lrv, output_urv, output_unit, transfer, tolerance_mode, tolerance_value, test_points, interval_days,
    authored_by, last_edited_by, updated_by, correlation_id)
  VALUES ('tenant-a', profile1, asset, 1, 0, 100, 'psi', 4, 20, 'mA', 'LINEAR', 'PERCENT_SPAN', 0.5,
    ARRAY[0, 25, 50, 75, 100], 365, 'author-1', 'editor-1', 'editor-1', 'proof');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.calibration_profiles (tenant_id, asset_id, revision, input_lrv,
    input_urv, input_unit, output_lrv, output_urv, output_unit, transfer, tolerance_mode, tolerance_value, test_points,
    interval_days, authored_by, last_edited_by, updated_by, correlation_id) VALUES ('tenant-a', %L, 9, 0, 100, 'psi', 4, 20,
    'mA', 'LINEAR', 'PERCENT_SPAN', 0.5, ARRAY[0,100], 365, 'a', 'a', 'a', 'p')$$, asset), '23505');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.calibration_profiles (tenant_id, asset_id, revision, input_lrv,
    input_urv, input_unit, output_lrv, output_urv, output_unit, transfer, tolerance_mode, tolerance_value, test_points,
    interval_days, authored_by, last_edited_by, updated_by, correlation_id) VALUES ('tenant-a', %L, 9, 100, 100, 'psi', 4, 20,
    'mA', 'LINEAR', 'PERCENT_SPAN', 0.5, ARRAY[0,100], 365, 'a', 'a', 'a', 'p')$$, asset), '23514');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.calibration_profiles (tenant_id, asset_id, revision, input_lrv,
    input_urv, input_unit, output_lrv, output_urv, output_unit, transfer, tolerance_mode, tolerance_value, test_points,
    interval_days, authored_by, last_edited_by, updated_by, correlation_id) VALUES ('tenant-a', %L, 9, 0, 100, 'psi', 4, 20,
    'mA', 'LINEAR', 'PERCENT_SPAN', 0.5, ARRAY[0,101], 365, 'a', 'a', 'a', 'p')$$, asset), '23514');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.calibration_profiles SET status = 'PUBLISHED',
    published_by = 'author-1', published_at = now() WHERE id = %L$$, profile1), '23514');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.calibration_profiles SET status = 'PUBLISHED',
    published_by = 'editor-1', published_at = now() WHERE id = %L$$, profile1), '23514');
  UPDATE gigalibs_cmms.calibration_profiles SET status = 'PUBLISHED', published_by = 'lead-1', published_at = now(),
    version = 2 WHERE id = profile1;
  INSERT INTO gigalibs_cmms.calibration_profiles (tenant_id, id, asset_id, revision, input_lrv, input_urv, input_unit,
    output_lrv, output_urv, output_unit, transfer, tolerance_mode, tolerance_value, test_points, interval_days,
    authored_by, last_edited_by, updated_by, correlation_id)
  VALUES ('tenant-a', profile2, asset, 2, 0, 100, 'psi', 4, 20, 'mA', 'LINEAR', 'PERCENT_SPAN', 0.25,
    ARRAY[0, 50, 100], 180, 'author-1', 'author-1', 'author-1', 'proof');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.calibration_profiles SET status = 'PUBLISHED',
    published_by = 'lead-1', published_at = now() WHERE id = %L$$, profile2), '23505');

  -- A corrective work order may carry the new origin.
  INSERT INTO gigalibs_cmms.work_orders (tenant_id, id, wo_number, type, title, asset_id, trigger_source, created_by,
    updated_by, correlation_id)
  VALUES ('tenant-a', corrective, 'WO-000001', 'REACTIVE', 'Calibration failed: PT-101', asset, 'CALIBRATION', 'tech-1',
    'tech-1', 'proof');

  -- Records: result consistency, containment, unique client operation.
  EXECUTE format('INSERT INTO gigalibs_cmms.calibration_records (%s) VALUES (%L,%L,%L,%L,1,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)',
    record_columns, 'tenant-a', passed, asset, profile1, definition, 'tech-1', 'bbbbbbbb-0000-4000-8000-000000000001',
    hash, '2026-11-01T08:00:00Z', '2026-11-01T08:10:00Z', 'PASS', NULL, 'PASS', false, 'statement', hash, NULL, false, 'proof');
  EXECUTE format('INSERT INTO gigalibs_cmms.calibration_records (%s) VALUES (%L,%L,%L,%L,1,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)',
    record_columns, 'tenant-a', failed, asset, profile1, definition, 'tech-1', 'bbbbbbbb-0000-4000-8000-000000000002',
    hash, '2026-11-01T09:00:00Z', '2026-11-01T09:10:00Z', 'FAIL', 'FAIL', 'FAIL', true, 'statement', hash, corrective, true, 'proof');
  PERFORM pg_temp.refuses(format('INSERT INTO gigalibs_cmms.calibration_records (%s) VALUES (%L,%L,%L,%L,1,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)',
    record_columns, 'tenant-a', gen_random_uuid(), asset, profile1, definition, 'tech-1', gen_random_uuid(),
    hash, '2026-11-01T09:00:00Z', '2026-11-01T09:10:00Z', 'FAIL', NULL, 'FAIL', true, 'statement', hash, NULL, false, 'proof'), '23514');
  PERFORM pg_temp.refuses(format('INSERT INTO gigalibs_cmms.calibration_records (%s) VALUES (%L,%L,%L,%L,1,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)',
    record_columns, 'tenant-a', gen_random_uuid(), asset, profile1, definition, 'tech-1', gen_random_uuid(),
    hash, '2026-11-01T09:00:00Z', '2026-11-01T09:10:00Z', 'PASS', NULL, 'PASS', false, 'statement', hash, NULL, true, 'proof'), '23514');
  PERFORM pg_temp.refuses(format('INSERT INTO gigalibs_cmms.calibration_records (%s) VALUES (%L,%L,%L,%L,1,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)',
    record_columns, 'tenant-a', gen_random_uuid(), asset, profile1, definition, 'tech-1', gen_random_uuid(),
    hash, '2026-11-01T09:00:00Z', '2026-11-01T09:10:00Z', 'FAIL', NULL, 'PASS', true, 'statement', hash, NULL, false, 'proof'), '23514');
  PERFORM pg_temp.refuses(format('INSERT INTO gigalibs_cmms.calibration_records (%s) VALUES (%L,%L,%L,%L,1,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)',
    record_columns, 'tenant-a', gen_random_uuid(), asset, profile1, definition, 'tech-1', 'bbbbbbbb-0000-4000-8000-000000000001',
    hash, '2026-11-01T08:00:00Z', '2026-11-01T08:10:00Z', 'PASS', NULL, 'PASS', false, 'statement', hash, NULL, false, 'proof'), '23505');

  -- Points and standard snapshots are append-only for the runtime role.
  INSERT INTO gigalibs_cmms.calibration_points (tenant_id, record_id, phase, position, nominal_percent, applied_input,
    expected_output, measured_output, error_absolute, error_percent_span, within_tolerance)
  SELECT 'tenant-a', passed, 'AS_FOUND', p.position, p.percent, p.percent, 4 + p.percent * 0.16, 4 + p.percent * 0.16, 0, 0, true
    FROM (VALUES (0, 0), (1, 25), (2, 50), (3, 75), (4, 100)) AS p(position, percent);
  INSERT INTO gigalibs_cmms.calibration_record_standards (tenant_id, record_id, standard_id, code, name, certificate_number, valid_until)
  VALUES ('tenant-a', passed, standard, 'FLUKE-754-01', 'Fluke 754', 'CERT-1', '2027-01-10');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.calibration_points SET measured_output = 99 WHERE record_id = %L$$, passed), '42501');
  PERFORM pg_temp.refuses(format($$DELETE FROM gigalibs_cmms.calibration_points WHERE record_id = %L$$, passed), '42501');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.calibration_record_standards SET valid_until = '2030-01-01' WHERE record_id = %L$$, passed), '42501');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.calibration_points (tenant_id, record_id, phase, position,
    nominal_percent, applied_input, expected_output, measured_output, error_absolute, error_percent_span, within_tolerance)
    VALUES ('tenant-a', %L, 'AS_FOUND', 0, 0, 0, 4, 4, 0, 0, true)$$, passed), '23505');

  -- Decisions: never the technician, exactly once, rejection needs a note; content never changes; never deleted.
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.calibration_records SET status = 'APPROVED', decided_by = 'tech-1',
    decided_at = now(), decision_statement = 's', version = 2 WHERE id = %L$$, passed), '23514');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.calibration_records SET status = 'REJECTED', decided_by = 'lead-1',
    decided_at = now(), decision_statement = 's', version = 2 WHERE id = %L$$, passed), '23514');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.calibration_records SET notes = 'changed' WHERE id = %L$$, failed), '23514');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.calibration_records SET overall_result = 'PASS', as_found_result = 'PASS',
    as_left_result = NULL, impact_review_required = false, corrective_work_order_id = NULL, asset_taken_offline = false
    WHERE id = %L$$, failed), '23514');
  UPDATE gigalibs_cmms.calibration_records SET status = 'APPROVED', decided_by = 'lead-1', decided_at = now(),
    decision_statement = 'approved', version = 2 WHERE id = passed;
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.calibration_records SET status = 'REJECTED', decided_by = 'lead-2',
    decision_note = 'late', version = 3 WHERE id = %L$$, passed), '23514');
  PERFORM pg_temp.refuses(format($$DELETE FROM gigalibs_cmms.calibration_records WHERE id = %L$$, failed), '23514');
  SELECT count(*) INTO seen FROM gigalibs_cmms.calibration_records WHERE status = 'APPROVED' AND decided_by = 'lead-1';
  IF seen <> 1 THEN RAISE EXCEPTION 'expected one approved record, found %', seen; END IF;

  -- Tenant isolation.
  PERFORM set_config('app.tenant_id', 'tenant-b', true);
  SELECT (SELECT count(*) FROM gigalibs_cmms.calibration_standards) + (SELECT count(*) FROM gigalibs_cmms.calibration_profiles)
       + (SELECT count(*) FROM gigalibs_cmms.calibration_records) + (SELECT count(*) FROM gigalibs_cmms.calibration_points)
       + (SELECT count(*) FROM gigalibs_cmms.calibration_record_standards) INTO seen;
  IF seen <> 0 THEN RAISE EXCEPTION 'tenant B sees % calibration rows of tenant A', seen; END IF;
  PERFORM pg_temp.refuses($$INSERT INTO gigalibs_cmms.calibration_standards (tenant_id, code, name, certificate_number,
    issued_by, calibrated_on, valid_until, created_by, updated_by, correlation_id) VALUES ('tenant-a', 'X-1', 'X', 'C', 'L',
    '2026-01-01', '2027-01-01', 'a', 'a', 'p')$$, '42501');
  PERFORM set_config('app.tenant_id', '', true);
  SELECT count(*) INTO seen FROM gigalibs_cmms.calibration_records;
  IF seen <> 0 THEN RAISE EXCEPTION 'an unbound session sees % calibration records', seen; END IF;

  RAISE NOTICE 'CMMS migration 27 calibration proof passed';
END
$proof$;

ROLLBACK;
