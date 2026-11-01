-- WI-OI-136 proof for CMMS migration 29 (diagrams, hotspots, part reservations). Disposable PostgreSQL 16 with CMMS
-- manifest migrations through 29, as a non-superuser, non-owner role with the CMMS runtime grants. Rolled back.
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
  pump constant uuid := 'cccccccc-0000-4000-8000-000000000001';
  seal constant uuid := 'cccccccc-0000-4000-8000-000000000002';
  wo constant uuid := 'cccccccc-0000-4000-8000-000000000003';
  draft constant uuid := 'cccccccc-0000-4000-8000-000000000011';
  png constant bytea := decode('89504e470d0a1a0a0000000d49484452', 'hex');
  seen integer;
BEGIN
  PERFORM set_config('app.tenant_id', 'tenant-a', true);
  INSERT INTO gigalibs_cmms.assets (tenant_id, id, asset_tag, name, created_by, updated_by, correlation_id)
  VALUES ('tenant-a', pump, 'P-101', 'Feed pump', 'p', 'p', 'proof');
  INSERT INTO gigalibs_cmms.parts (tenant_id, id, part_number, name, currency_code, quantity_on_hand, created_by, updated_by, correlation_id)
  VALUES ('tenant-a', seal, 'SEAL-75', 'Mechanical seal', 'USD', 4, 'p', 'p', 'proof');
  INSERT INTO gigalibs_cmms.work_orders (tenant_id, id, wo_number, type, title, asset_id, created_by, updated_by, correlation_id)
  VALUES ('tenant-a', wo, 'WO-000001', 'REACTIVE', 'Replace seal', pump, 't', 't', 'proof');

  INSERT INTO gigalibs_cmms.asset_diagrams (tenant_id, id, asset_id, diagram_code, title, revision, image_content_type,
    image_bytes, image_sha256, width_px, height_px, authored_by, last_edited_by, updated_by, correlation_id)
  VALUES ('tenant-a', draft, pump, 'WET-END', 'Wet end', 1, 'image/png', png, repeat('a', 64), 800, 600, 'planner-1',
    'planner-1', 'planner-1', 'proof');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.asset_diagrams (tenant_id, asset_id, diagram_code, title,
    revision, image_content_type, image_bytes, image_sha256, width_px, height_px, authored_by, last_edited_by, updated_by,
    correlation_id) VALUES ('tenant-a', %L, 'WET-END', 'Second draft', 2, 'image/png', %L, repeat('b', 64), 800, 600,
    'p', 'p', 'p', 'p')$$, pump, png), '23505');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.asset_diagrams (tenant_id, asset_id, diagram_code, title,
    revision, image_content_type, image_bytes, image_sha256, width_px, height_px, authored_by, last_edited_by, updated_by,
    correlation_id) VALUES ('tenant-a', %L, 'SVG', 'Svg', 1, 'image/svg+xml', %L, repeat('b', 64), 800, 600,
    'p', 'p', 'p', 'p')$$, pump, png), '23514');
  PERFORM pg_temp.refuses(format($$UPDATE gigalibs_cmms.asset_diagrams SET status = 'PUBLISHED', published_by = 'planner-1',
    published_at = now() WHERE id = %L$$, draft), '23514');
  INSERT INTO gigalibs_cmms.asset_diagram_hotspots (tenant_id, diagram_id, callout, part_id, quantity, x, y, radius)
  VALUES ('tenant-a', draft, '24', seal, 1, 0.5, 0.25, 0.03);
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.asset_diagram_hotspots (tenant_id, diagram_id, callout,
    part_id, quantity, x, y, radius) VALUES ('tenant-a', %L, '25', %L, 1, 1.5, 0.2, 0.03)$$, draft, seal), '23514');
  UPDATE gigalibs_cmms.asset_diagrams SET status = 'PUBLISHED', published_by = 'planner-2', published_at = now(),
    version = 2 WHERE id = draft;

  INSERT INTO gigalibs_cmms.part_reservations (tenant_id, client_operation_id, part_id, work_order_id, diagram_id,
    quantity, reserved_by, correlation_id)
  VALUES ('tenant-a', 'cccccccc-0000-4000-8000-0000000000a1', seal, wo, draft, 1, 'tech-1', 'proof');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.part_reservations (tenant_id, client_operation_id, part_id,
    work_order_id, quantity, reserved_by, correlation_id) VALUES ('tenant-a', 'cccccccc-0000-4000-8000-0000000000a1', %L,
    %L, 1, 't', 'p')$$, seal, wo), '23505');
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.part_reservations (tenant_id, client_operation_id, part_id,
    work_order_id, quantity, reserved_by, correlation_id) VALUES ('tenant-a', gen_random_uuid(), %L, %L, 0, 't', 'p')$$, seal, wo), '23514');
  PERFORM pg_temp.refuses($$UPDATE gigalibs_cmms.part_reservations SET status = 'RELEASED', closed_by = 'x', closed_at = now()$$, '23514');
  UPDATE gigalibs_cmms.part_reservations SET status = 'ISSUED', closed_by = 'clerk-1', closed_at = now();
  PERFORM pg_temp.refuses(format($$DELETE FROM gigalibs_cmms.parts WHERE id = %L$$, seal), '23503');

  PERFORM set_config('app.tenant_id', 'tenant-b', true);
  SELECT (SELECT count(*) FROM gigalibs_cmms.asset_diagrams) + (SELECT count(*) FROM gigalibs_cmms.asset_diagram_hotspots)
       + (SELECT count(*) FROM gigalibs_cmms.part_reservations) INTO seen;
  IF seen <> 0 THEN RAISE EXCEPTION 'tenant B sees % diagram rows of tenant A', seen; END IF;
  PERFORM pg_temp.refuses(format($$INSERT INTO gigalibs_cmms.part_reservations (tenant_id, client_operation_id, part_id,
    work_order_id, quantity, reserved_by, correlation_id) VALUES ('tenant-a', gen_random_uuid(), %L, %L, 1, 't', 'p')$$, seal, wo), '42501');

  RAISE NOTICE 'CMMS migration 29 diagrams and reservations proof passed';
END
$proof$;

ROLLBACK;
