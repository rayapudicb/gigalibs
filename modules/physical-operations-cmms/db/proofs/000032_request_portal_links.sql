-- WI-OI-140 proof for CMMS migration 32 (request portal links). Disposable PostgreSQL 16 with CMMS manifest
-- migrations through 32, as a non-superuser, non-owner role with the CMMS runtime grants (portal submissions and
-- photos append-only). Rolled back.
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
  sealer constant uuid := 'a2000000-0000-4000-8000-000000000001';
  link constant uuid := 'a2000000-0000-4000-8000-000000000011';
  request constant uuid := 'a2000000-0000-4000-8000-000000000021';
  submission constant uuid := 'a2000000-0000-4000-8000-000000000031';
  operation constant uuid := 'a2000000-0000-4000-8000-000000000041';
  seen integer;
BEGIN
  PERFORM set_config('app.tenant_id', 'tenant-a', true);
  INSERT INTO gigalibs_cmms.assets (tenant_id, id, asset_tag, name, created_by, updated_by, correlation_id)
  VALUES ('tenant-a', sealer, 'HS-03', 'Heat sealer 3', 'a', 'a', 'proof');

  -- Links: only a secret hash; revocation is whole; expiry is after creation.
  INSERT INTO gigalibs_cmms.portal_links (tenant_id, id, asset_id, secret_sha256, created_by, correlation_id)
  VALUES ('tenant-a', link, sealer, repeat('a', 64), 'planner-1', 'proof');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.portal_links (tenant_id, asset_id, secret_sha256, created_by,
    correlation_id) VALUES ('tenant-a', %L, 'not-a-hash', 'p', 'p')$$, sealer), '23514');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.portal_links (tenant_id, asset_id, secret_sha256, created_by,
    correlation_id) VALUES ('tenant-a', %L, repeat('a', 64), 'p', 'p')$$, sealer), '23505');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.portal_links SET status = 'REVOKED' WHERE id = %L$$, link), '23514');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.portal_links (tenant_id, asset_id, secret_sha256, created_by,
    created_at, expires_at, correlation_id) VALUES ('tenant-a', %L, repeat('b', 64), 'p', now(), now() - interval '1 day', 'p')$$, sealer), '23514');

  -- Submissions: one per link operation, each with its own status hash; never changed or removed.
  INSERT INTO gigalibs_cmms.maintenance_requests (tenant_id, id, request_number, title, priority, asset_id,
    requester_subject, correlation_id)
  VALUES ('tenant-a', request, 'REQ-000001', 'Leaking: HS-03', 'MEDIUM', sealer, 'portal:' || link, 'proof');
  INSERT INTO gigalibs_cmms.portal_submissions (tenant_id, id, link_id, client_operation_id, client_key, issue_type,
    request_id, status_secret_sha256)
  VALUES ('tenant-a', submission, link, operation, repeat('c', 64), 'LEAK', request, repeat('d', 64));
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.portal_submissions (tenant_id, link_id, client_operation_id,
    client_key, issue_type, request_id, status_secret_sha256) VALUES ('tenant-a', %L, %L, repeat('c', 64), 'LEAK', %L,
    repeat('e', 64))$$, link, operation, request), '23505');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.portal_submissions (tenant_id, link_id, client_operation_id,
    client_key, issue_type, request_id, status_secret_sha256) VALUES ('tenant-a', %L, gen_random_uuid(), repeat('c', 64),
    'FIRE', %L, repeat('f', 64))$$, link, request), '23514');
  INSERT INTO gigalibs_cmms.portal_submission_photos (tenant_id, submission_id, content_type, bytes, sha256)
  VALUES ('tenant-a', submission, 'image/png', decode('89504e470d0a1a0a0000000d49484452', 'hex'), repeat('a', 64));
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.portal_submissions SET issue_type = 'OTHER' WHERE id = %L$$, submission), '42501');
  PERFORM pg_temp.refuses(format($$DELETE FROM gigalibs_cmms.portal_submissions WHERE id = %L$$, submission), '42501');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.portal_submission_photos SET sha256 = repeat('b', 64)
    WHERE submission_id = %L$$, submission), '42501');
  -- Signed-in reports: one per member and operation; never changed.
  INSERT INTO gigalibs_cmms.request_reports (tenant_id, client_operation_id, requester_subject, asset_id, issue_type,
    request_id, payload_sha256) VALUES ('tenant-a', operation, 'op-1', sealer, 'NOISE', request, repeat('a', 64));
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.request_reports (tenant_id, client_operation_id,
    requester_subject, asset_id, issue_type, request_id, payload_sha256) VALUES ('tenant-a', %L, 'op-1', %L, 'NOISE', %L,
    repeat('b', 64))$$, operation, sealer, request), '23505');
  INSERT INTO gigalibs_cmms.request_reports (tenant_id, client_operation_id, requester_subject, asset_id, issue_type,
    request_id, payload_sha256) VALUES ('tenant-a', operation, 'op-2', sealer, 'NOISE', request, repeat('a', 64));
  PERFORM pg_temp.refuses($$UPDATE gigalibs_cmms.request_reports SET issue_type = 'LEAK'$$, '42501');

  UPDATE gigalibs_cmms.portal_links SET status = 'REVOKED', revoked_by = 'planner-1', revoked_at = now(),
    revoke_reason = 'Sticker damaged', last_used_at = now(), version = 2 WHERE id = link;

  PERFORM set_config('app.tenant_id', 'tenant-b', true);
  SELECT (SELECT count(*) FROM gigalibs_cmms.portal_links) + (SELECT count(*) FROM gigalibs_cmms.portal_submissions)
       + (SELECT count(*) FROM gigalibs_cmms.portal_submission_photos) + (SELECT count(*) FROM gigalibs_cmms.request_reports) INTO seen;
  IF seen <> 0 THEN RAISE EXCEPTION 'tenant B sees % portal rows of tenant A', seen; END IF;
  RAISE NOTICE 'CMMS migration 32 request portal links proof passed';
END
$proof$;

ROLLBACK;
