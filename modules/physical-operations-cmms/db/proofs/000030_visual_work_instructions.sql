-- WI-OI-138 proof for CMMS migration 30 (visual work instructions). Disposable PostgreSQL 16 with CMMS manifest
-- migrations through 30, as a non-superuser, non-owner role with the CMMS runtime grants. Rolled back.
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
  sop constant uuid := 'eeeeeeee-0000-4000-8000-000000000001';
  run constant uuid := 'eeeeeeee-0000-4000-8000-000000000011';
  steps constant jsonb := '[{"key":"isolate","title":"Isolate","instruction":"Lock out.","gate":{"type":"CONFIRM"},"dualSignoff":true}]';
  seen integer;
BEGIN
  PERFORM set_config('app.tenant_id', 'tenant-a', true);
  INSERT INTO gigalibs_cmms.sop_procedures (tenant_id, id, code, title, revision, steps, authored_by, last_edited_by, updated_by, correlation_id)
  VALUES ('tenant-a', sop, 'SEAL-01', 'Seal replacement', 1, steps, 'eng-1', 'eng-1', 'eng-1', 'proof');
  PERFORM pg_temp.refuses($$INSERT INTO gigalibs_cmms.sop_procedures (tenant_id, code, title, revision, steps, authored_by,
    last_edited_by, updated_by, correlation_id) VALUES ('tenant-a', 'SEAL-01', 'Second draft', 2, '[{}]', 'e', 'e', 'e', 'p')$$, '23505');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.sop_procedures SET status = 'IN_REVIEW' WHERE id = %L$$, sop), '23514');
  UPDATE gigalibs_cmms.sop_procedures SET status = 'IN_REVIEW', submitted_by = 'eng-1' WHERE id = sop;
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.sop_procedures SET status = 'PUBLISHED', approved_by = 'eng-1',
    approved_at = now() WHERE id = %L$$, sop), '23514');
  UPDATE gigalibs_cmms.sop_procedures SET status = 'PUBLISHED', approved_by = 'qa-1', approved_at = now(), version = 2 WHERE id = sop;

  INSERT INTO gigalibs_cmms.sop_executions (tenant_id, id, procedure_id, client_operation_id, executed_by, correlation_id)
  VALUES ('tenant-a', run, sop, gen_random_uuid(), 'tech-1', 'proof');
  INSERT INTO gigalibs_cmms.sop_step_results (tenant_id, execution_id, sequence, client_operation_id, step_key, outcome,
    recorded_by, recorded_at, cosign_required)
  VALUES ('tenant-a', run, 1, gen_random_uuid(), 'isolate', 'CONFIRMED', 'tech-1', now(), true);
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.sop_step_results (tenant_id, execution_id, sequence,
    client_operation_id, step_key, outcome, recorded_by, recorded_at, cosign_required) VALUES ('tenant-a', %L, 2,
    gen_random_uuid(), 'slide', 'READING', 'tech-1', now(), false)$$, run), '23514');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.sop_step_results SET cosigned_by = 'tech-1', cosigned_at = now()
    WHERE execution_id = %L$$, run), '23514');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.sop_step_results SET outcome = 'DONE' WHERE execution_id = %L$$, run), '23514');
  UPDATE gigalibs_cmms.sop_step_results SET cosigned_by = 'tech-2', cosigned_at = now() WHERE execution_id = run;
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.sop_step_results SET cosigned_by = 'tech-3' WHERE execution_id = %L$$, run), '23514');
  PERFORM pg_temp.refuses(format($$DELETE FROM gigalibs_cmms.sop_step_results WHERE execution_id = %L$$, run), '23514');
  INSERT INTO gigalibs_cmms.sop_result_photos (tenant_id, execution_id, sequence, content_type, bytes, sha256)
  VALUES ('tenant-a', run, 1, 'image/png', decode('89504e470d0a1a0a0000000d49484452', 'hex'), repeat('a', 64));
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.sop_result_photos SET sha256 = repeat('b', 64) WHERE execution_id = %L$$, run), '42501');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.sop_feedback (tenant_id, procedure_id, step_key, text, status,
    raised_by, correlation_id) VALUES ('tenant-a', %L, 'isolate', 'Unclear', 'RESOLVED', 't', 'p')$$, sop), '23514');

  PERFORM set_config('app.tenant_id', 'tenant-b', true);
  SELECT (SELECT count(*) FROM gigalibs_cmms.sop_procedures) + (SELECT count(*) FROM gigalibs_cmms.sop_executions)
       + (SELECT count(*) FROM gigalibs_cmms.sop_step_results) + (SELECT count(*) FROM gigalibs_cmms.sop_result_photos) INTO seen;
  IF seen <> 0 THEN RAISE EXCEPTION 'tenant B sees % work-instruction rows of tenant A', seen; END IF;
  RAISE NOTICE 'CMMS migration 30 visual work instructions proof passed';
END
$proof$;

ROLLBACK;
