-- WI-OI-136 M-BOM: exploded asset diagrams with part hotspots, and work-order part reservations (CMMS extension).
-- Additive: three new tenant-isolated tables. Images are bounded rasters (PNG/JPEG/WebP, at most 700 KB) checked by the
-- service's magic-byte sniff; no SVG. Recovery: the down migration drops the tables while empty; otherwise roll forward.
BEGIN;

CREATE TABLE gigalibs_cmms.asset_diagrams (
  tenant_id          gigalibs_cmms.tenant_ref NOT NULL,
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  asset_id           uuid NOT NULL,
  diagram_code       text NOT NULL CHECK (diagram_code ~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$'),
  title              text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  revision           integer NOT NULL CHECK (revision > 0),
  status             text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'SUPERSEDED')),
  image_content_type text NOT NULL CHECK (image_content_type IN ('image/png', 'image/jpeg', 'image/webp')),
  image_bytes        bytea NOT NULL CHECK (octet_length(image_bytes) BETWEEN 16 AND 716800),
  image_sha256       text NOT NULL CHECK (image_sha256 ~ '^[0-9a-f]{64}$'),
  width_px           integer NOT NULL CHECK (width_px BETWEEN 16 AND 20000),
  height_px          integer NOT NULL CHECK (height_px BETWEEN 16 AND 20000),
  authored_by        gigalibs_cmms.principal_ref NOT NULL,
  last_edited_by     gigalibs_cmms.principal_ref NOT NULL,
  published_by       gigalibs_cmms.principal_ref,
  published_at       timestamptz,
  version            integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by         gigalibs_cmms.principal_ref NOT NULL,
  correlation_id     text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT asset_diagrams_revision_unique UNIQUE (tenant_id, asset_id, diagram_code, revision),
  CONSTRAINT asset_diagrams_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT asset_diagrams_publication
    CHECK ((status = 'DRAFT') = (published_by IS NULL) AND (published_by IS NULL) = (published_at IS NULL)),
  CONSTRAINT asset_diagrams_four_eyes
    CHECK (published_by IS NULL OR (published_by <> authored_by AND published_by <> last_edited_by))
);
CREATE UNIQUE INDEX asset_diagrams_one_published
  ON gigalibs_cmms.asset_diagrams (tenant_id, asset_id, diagram_code) WHERE status = 'PUBLISHED';
CREATE UNIQUE INDEX asset_diagrams_one_draft
  ON gigalibs_cmms.asset_diagrams (tenant_id, asset_id, diagram_code) WHERE status = 'DRAFT';

CREATE TABLE gigalibs_cmms.asset_diagram_hotspots (
  tenant_id  gigalibs_cmms.tenant_ref NOT NULL,
  diagram_id uuid NOT NULL,
  callout    text NOT NULL CHECK (callout ~ '^[A-Z0-9.-]{1,16}$'),
  part_id    uuid NOT NULL,
  quantity   numeric(14, 3) NOT NULL CHECK (quantity > 0),
  x          numeric(7, 6) NOT NULL CHECK (x BETWEEN 0 AND 1),
  y          numeric(7, 6) NOT NULL CHECK (y BETWEEN 0 AND 1),
  radius     numeric(7, 6) NOT NULL CHECK (radius BETWEEN 0.005 AND 0.5),
  label      text CHECK (char_length(label) <= 200),
  PRIMARY KEY (tenant_id, diagram_id, callout),
  CONSTRAINT asset_diagram_hotspots_diagram_fk FOREIGN KEY (tenant_id, diagram_id)
    REFERENCES gigalibs_cmms.asset_diagrams (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT asset_diagram_hotspots_part_fk FOREIGN KEY (tenant_id, part_id)
    REFERENCES gigalibs_cmms.parts (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE gigalibs_cmms.part_reservations (
  tenant_id           gigalibs_cmms.tenant_ref NOT NULL,
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  client_operation_id uuid NOT NULL,
  part_id             uuid NOT NULL,
  work_order_id       uuid NOT NULL,
  diagram_id          uuid,
  quantity            numeric(14, 3) NOT NULL CHECK (quantity > 0),
  status              text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ISSUED', 'RELEASED')),
  reserved_by         gigalibs_cmms.principal_ref NOT NULL,
  reserved_at         timestamptz NOT NULL DEFAULT now(),
  closed_by           gigalibs_cmms.principal_ref,
  closed_at           timestamptz,
  close_reason        text CHECK (char_length(close_reason) BETWEEN 1 AND 500),
  site_ref            uuid,
  department_id       text CHECK (char_length(department_id) BETWEEN 1 AND 64),
  correlation_id      text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT part_reservations_operation_unique UNIQUE (tenant_id, client_operation_id),
  CONSTRAINT part_reservations_part_fk FOREIGN KEY (tenant_id, part_id)
    REFERENCES gigalibs_cmms.parts (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT part_reservations_work_order_fk FOREIGN KEY (tenant_id, work_order_id)
    REFERENCES gigalibs_cmms.work_orders (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT part_reservations_diagram_fk FOREIGN KEY (tenant_id, diagram_id)
    REFERENCES gigalibs_cmms.asset_diagrams (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT part_reservations_close CHECK (
    (status = 'OPEN') = (closed_at IS NULL) AND (closed_at IS NULL) = (closed_by IS NULL)
    AND (status <> 'RELEASED' OR close_reason IS NOT NULL))
);
CREATE INDEX part_reservations_open_by_part
  ON gigalibs_cmms.part_reservations (tenant_id, part_id) WHERE status = 'OPEN';
CREATE INDEX part_reservations_by_work_order ON gigalibs_cmms.part_reservations (tenant_id, work_order_id);

DO $rls$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['asset_diagrams', 'asset_diagram_hotspots', 'part_reservations'] LOOP
    EXECUTE format('ALTER TABLE gigalibs_cmms.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE gigalibs_cmms.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_cmms.%I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')) '
      'WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), ''''))',
      'cmms_' || table_name || '_tenant_isolation', table_name);
  END LOOP;
END
$rls$;

INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (29, '000029_asset_diagrams_part_reservations');

COMMIT;
