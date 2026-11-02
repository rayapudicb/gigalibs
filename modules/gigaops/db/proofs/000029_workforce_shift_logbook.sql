-- WI-OI-137 proof for Workforce migration 29 (shift logbook). Disposable PostgreSQL 16 with Workforce runtime migrations
-- 1-29, as a non-superuser, non-owner role with the runtime grants (logbook_entries without UPDATE/DELETE). Rolled back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE gigalibs_workforce_proof;

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
  book constant uuid := 'dddddddd-0000-4000-8000-000000000001';
  entry constant uuid := 'dddddddd-0000-4000-8000-000000000011';
  bypass constant uuid := 'dddddddd-0000-4000-8000-000000000021';
  handover constant uuid := 'dddddddd-0000-4000-8000-000000000031';
  hash constant char(64) := repeat('a', 64);
  seen integer;
BEGIN
  PERFORM set_config('app.tenant_id', 'tenant-a', true);
  INSERT INTO gigalibs_workforce.logbooks (tenant_id, id, code, name, time_zone, shift_windows, created_by, updated_by, correlation_id)
  VALUES ('tenant-a', book, 'UNIT-3', 'Unit 3', 'Europe/London', '[{"name":"Day","start":"06:00","end":"18:00"}]', 'sup-1', 'sup-1', 'proof');
  PERFORM pg_temp.refuses($$INSERT INTO gigalibs_workforce.logbooks (tenant_id, code, name, time_zone, shift_windows,
    created_by, updated_by, correlation_id) VALUES ('tenant-a', 'UNIT-3', 'Dup', 'UTC', '[{}]', 's', 's', 'p')$$, '23505');

  -- Entries: immutable for the runtime role, unique operation, corrections point at an existing entry.
  INSERT INTO gigalibs_workforce.logbook_entries (tenant_id, id, logbook_id, client_operation_id, request_sha256, shift_date,
    shift_name, category, text, priority, occurred_at, author)
  VALUES ('tenant-a', entry, book, gen_random_uuid(), hash, '2026-11-02', 'Day', 'TRIP', 'P-101 tripped', 'HIGH', now(), 'op-1');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_workforce.logbook_entries SET text = 'edited' WHERE id = %L$$, entry), '42501');
  PERFORM pg_temp.refuses(format($$DELETE FROM gigalibs_workforce.logbook_entries WHERE id = %L$$, entry), '42501');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_workforce.logbook_entries (tenant_id, logbook_id, client_operation_id,
    request_sha256, shift_date, shift_name, category, text, priority, occurred_at, author, corrects_entry_id)
    VALUES ('tenant-a', %L, gen_random_uuid(), %L, '2026-11-02', 'Day', 'NOTE', 'x', 'LOW', now(), 'op-1', gen_random_uuid())$$, book, hash), '23503');
  INSERT INTO gigalibs_workforce.logbook_entries (tenant_id, logbook_id, client_operation_id, request_sha256, shift_date,
    shift_name, category, text, priority, occurred_at, author, corrects_entry_id)
  VALUES ('tenant-a', book, gen_random_uuid(), hash, '2026-11-02', 'Day', 'TRIP', 'P-101 tripped on low suction', 'HIGH', now(), 'op-1', entry);

  -- Bypasses: lifecycle shape and four eyes.
  INSERT INTO gigalibs_workforce.logbook_bypasses (tenant_id, id, logbook_id, client_operation_id, request_sha256, description,
    reason, mitigation, requested_by, planned_removal_at, correlation_id)
  VALUES ('tenant-a', bypass, book, gen_random_uuid(), hash, 'LSHH-12 bypassed', 'Sensor fault', 'Operator watch', 'op-1',
    now() + interval '1 day', 'proof');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_workforce.logbook_bypasses SET status = 'AUTHORIZED', authorized_by = 'op-1',
    authorized_at = now() WHERE id = %L$$, bypass), '23514');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_workforce.logbook_bypasses SET status = 'REJECTED', authorized_by = 'sup-1',
    authorized_at = now() WHERE id = %L$$, bypass), '23514');
  UPDATE gigalibs_workforce.logbook_bypasses SET status = 'AUTHORIZED', authorized_by = 'sup-1', authorized_at = now(), version = 2 WHERE id = bypass;
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_workforce.logbook_bypasses SET status = 'CLEARED' WHERE id = %L$$, bypass), '23514');

  -- Handovers: one per shift, two people, countersign by a third; content frozen once accepted; never deleted.
  INSERT INTO gigalibs_workforce.logbook_handovers (tenant_id, id, logbook_id, client_operation_id, request_sha256, shift_date,
    shift_name, outgoing_by, outgoing_statement, notes, package, correlation_id)
  VALUES ('tenant-a', handover, book, gen_random_uuid(), hash, '2026-11-02', 'Day', 'op-1', 'statement', 'All quiet', '{}', 'proof');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_workforce.logbook_handovers (tenant_id, logbook_id, client_operation_id,
    request_sha256, shift_date, shift_name, outgoing_by, outgoing_statement, notes, package, correlation_id) VALUES ('tenant-a',
    %L, gen_random_uuid(), %L, '2026-11-02', 'Day', 'op-2', 's', 'n', '{}', 'p')$$, book, hash), '23505');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_workforce.logbook_handovers SET status = 'ACCEPTED', incoming_by = 'op-1',
    accepted_at = now(), incoming_statement = 's' WHERE id = %L$$, handover), '23514');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_workforce.logbook_handovers SET notes = 'rewritten' WHERE id = %L$$, handover), '23514');
  UPDATE gigalibs_workforce.logbook_handovers SET status = 'ACCEPTED', incoming_by = 'op-2', accepted_at = now(),
    incoming_statement = 'accepted', version = 2 WHERE id = handover;
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_workforce.logbook_handovers SET package = '{"x":1}' WHERE id = %L$$, handover), '23514');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_workforce.logbook_handovers SET status = 'COUNTERSIGNED', supervisor_by = 'op-2',
    countersigned_at = now(), supervisor_statement = 's' WHERE id = %L$$, handover), '23514');
  UPDATE gigalibs_workforce.logbook_handovers SET status = 'COUNTERSIGNED', supervisor_by = 'sup-1', countersigned_at = now(),
    supervisor_statement = 'countersigned', version = 3 WHERE id = handover;
  PERFORM pg_temp.refuses(format($$DELETE FROM gigalibs_workforce.logbook_handovers WHERE id = %L$$, handover), '23514');

  PERFORM set_config('app.tenant_id', 'tenant-b', true);
  SELECT (SELECT count(*) FROM gigalibs_workforce.logbooks) + (SELECT count(*) FROM gigalibs_workforce.logbook_entries)
       + (SELECT count(*) FROM gigalibs_workforce.logbook_bypasses) + (SELECT count(*) FROM gigalibs_workforce.logbook_handovers) INTO seen;
  IF seen <> 0 THEN RAISE EXCEPTION 'tenant B sees % logbook rows of tenant A', seen; END IF;
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_workforce.logbook_entries (tenant_id, logbook_id, client_operation_id,
    request_sha256, shift_date, shift_name, category, text, priority, occurred_at, author) VALUES ('tenant-a', %L,
    gen_random_uuid(), %L, '2026-11-02', 'Day', 'NOTE', 'x', 'LOW', now(), 'x')$$, book, hash), '42501');

  RAISE NOTICE 'Workforce migration 29 shift logbook proof passed';
END
$proof$;

ROLLBACK;
