-- WI-OI-142 M-LOTO: lockout/tagout and permit-to-work (CMMS M-CM2). Additive: seven new tenant-isolated tables.
-- Approval needs three different people; every isolation point is locked and verified before it; lock photos, personal
-- lock events and gas tests are append-only for the runtime role. Recovery: the down migration drops the tables while
-- empty; otherwise roll forward.
BEGIN;

CREATE TABLE gigalibs_cmms.isolation_procedures (
  tenant_id      gigalibs_cmms.tenant_ref NOT NULL,
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  code           text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$'),
  title          text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  revision       integer NOT NULL CHECK (revision > 0),
  status         text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'RETIRED')),
  asset_id       uuid,
  points         jsonb NOT NULL CHECK (jsonb_typeof(points) = 'array' AND jsonb_array_length(points) BETWEEN 1 AND 60),
  authored_by    gigalibs_cmms.principal_ref NOT NULL,
  last_edited_by gigalibs_cmms.principal_ref NOT NULL,
  published_by   gigalibs_cmms.principal_ref,
  published_at   timestamptz,
  version        integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by     gigalibs_cmms.principal_ref NOT NULL,
  correlation_id text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT isolation_procedures_revision_unique UNIQUE (tenant_id, code, revision),
  CONSTRAINT isolation_procedures_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT isolation_procedures_publication
    CHECK ((status = 'DRAFT') = (published_by IS NULL) AND (published_by IS NULL) = (published_at IS NULL)),
  -- Four eyes: an isolation procedure is published by someone who wrote none of it.
  CONSTRAINT isolation_procedures_four_eyes
    CHECK (published_by IS NULL OR (published_by <> authored_by AND published_by <> last_edited_by))
);
CREATE UNIQUE INDEX isolation_procedures_one_draft ON gigalibs_cmms.isolation_procedures (tenant_id, code) WHERE status = 'DRAFT';
CREATE UNIQUE INDEX isolation_procedures_one_published ON gigalibs_cmms.isolation_procedures (tenant_id, code) WHERE status = 'PUBLISHED';

CREATE TABLE gigalibs_cmms.permit_counters (
  tenant_id  gigalibs_cmms.tenant_ref PRIMARY KEY,
  last_value bigint NOT NULL CHECK (last_value > 0)
);

CREATE TABLE gigalibs_cmms.permits (
  tenant_id           gigalibs_cmms.tenant_ref NOT NULL,
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  permit_number       text NOT NULL CHECK (permit_number ~ '^PTW-[0-9]{6,}$'),
  client_operation_id uuid NOT NULL,
  type                text NOT NULL CHECK (type IN ('LOTO', 'HOT_WORK', 'CONFINED_SPACE', 'LINE_BREAK', 'HIGH_VOLTAGE')),
  status              text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'ISOLATING', 'AWAITING_APPROVAL', 'LIVE', 'DE_ISOLATING', 'CLOSED', 'CANCELLED')),
  title               text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description         text CHECK (char_length(description) <= 2000),
  procedure_id        uuid NOT NULL,
  work_order_id       uuid,
  asset_id            uuid,
  site_ref            uuid,
  department_id       text CHECK (char_length(department_id) BETWEEN 1 AND 64),
  valid_from          timestamptz NOT NULL,
  valid_until         timestamptz NOT NULL,
  requested_by        gigalibs_cmms.principal_ref NOT NULL,
  authorized_by       gigalibs_cmms.principal_ref,
  authorized_at       timestamptz,
  countersigned_by    gigalibs_cmms.principal_ref,
  countersigned_at    timestamptz,
  live_at             timestamptz,
  closed_by           gigalibs_cmms.principal_ref,
  closed_at           timestamptz,
  cancel_reason       text CHECK (char_length(cancel_reason) BETWEEN 1 AND 1000),
  version             integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by          gigalibs_cmms.principal_ref NOT NULL,
  correlation_id      text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT permits_number_unique UNIQUE (tenant_id, permit_number),
  CONSTRAINT permits_operation_unique UNIQUE (tenant_id, requested_by, client_operation_id),
  CONSTRAINT permits_procedure_fk FOREIGN KEY (tenant_id, procedure_id)
    REFERENCES gigalibs_cmms.isolation_procedures (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT permits_work_order_fk FOREIGN KEY (tenant_id, work_order_id)
    REFERENCES gigalibs_cmms.work_orders (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT permits_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT permits_validity CHECK (valid_until > valid_from AND valid_until <= valid_from + interval '12 hours'),
  CONSTRAINT permits_authorization CHECK ((authorized_by IS NULL) = (authorized_at IS NULL)),
  CONSTRAINT permits_countersign CHECK ((countersigned_by IS NULL) = (countersigned_at IS NULL)),
  -- Live means authorized and countersigned; three different people request, authorize and countersign.
  CONSTRAINT permits_live CHECK (
    (status IN ('LIVE', 'DE_ISOLATING', 'CLOSED') AND authorized_by IS NOT NULL AND countersigned_by IS NOT NULL AND live_at IS NOT NULL)
    OR (status NOT IN ('LIVE', 'DE_ISOLATING', 'CLOSED') AND live_at IS NULL)),
  CONSTRAINT permits_three_people CHECK (
    (authorized_by IS NULL OR authorized_by <> requested_by)
    AND (countersigned_by IS NULL OR (countersigned_by <> requested_by AND countersigned_by <> authorized_by))),
  CONSTRAINT permits_closing CHECK ((status = 'CLOSED') = (closed_by IS NOT NULL) AND (closed_by IS NULL) = (closed_at IS NULL)),
  CONSTRAINT permits_cancelling CHECK ((status = 'CANCELLED') = (cancel_reason IS NOT NULL))
);
CREATE INDEX permits_work_order ON gigalibs_cmms.permits (tenant_id, work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX permits_active ON gigalibs_cmms.permits (tenant_id, status) WHERE status NOT IN ('CLOSED', 'CANCELLED');

CREATE TABLE gigalibs_cmms.permit_isolations (
  tenant_id     gigalibs_cmms.tenant_ref NOT NULL,
  permit_id     uuid NOT NULL,
  point_key     text NOT NULL CHECK (point_key ~ '^[a-z][a-z0-9-]{0,31}$'),
  sequence      integer NOT NULL CHECK (sequence >= 0),
  label         text NOT NULL,
  energy        text NOT NULL CHECK (energy IN ('ELECTRICAL', 'PNEUMATIC', 'HYDRAULIC', 'THERMAL', 'CHEMICAL', 'MECHANICAL', 'GRAVITY')),
  isolation_tag text NOT NULL CHECK (isolation_tag ~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$'),
  method        text NOT NULL,
  status        text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'LOCKED', 'VERIFIED', 'REMOVED')),
  lock_serial   text CHECK (char_length(lock_serial) BETWEEN 1 AND 64),
  locked_by     gigalibs_cmms.principal_ref,
  locked_at     timestamptz,
  verified_by   gigalibs_cmms.principal_ref,
  witnessed_by  gigalibs_cmms.principal_ref,
  verified_at   timestamptz,
  removed_by    gigalibs_cmms.principal_ref,
  removed_at    timestamptz,
  version       integer NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (tenant_id, permit_id, point_key),
  CONSTRAINT permit_isolations_permit_fk FOREIGN KEY (tenant_id, permit_id)
    REFERENCES gigalibs_cmms.permits (tenant_id, id) ON DELETE RESTRICT,
  -- Each state carries what it needs: a lock (serial, who, when), a verification, a removal.
  CONSTRAINT permit_isolations_lock CHECK (
    (status = 'PENDING') = (locked_by IS NULL) AND (locked_by IS NULL) = (locked_at IS NULL) AND (locked_by IS NULL) = (lock_serial IS NULL)),
  CONSTRAINT permit_isolations_verification CHECK (
    (status IN ('VERIFIED', 'REMOVED') OR verified_by IS NULL) AND (verified_by IS NULL) = (verified_at IS NULL)
    AND (status <> 'VERIFIED' OR verified_by IS NOT NULL) AND (witnessed_by IS NULL OR verified_by IS NOT NULL)),
  CONSTRAINT permit_isolations_removal CHECK ((status = 'REMOVED') = (removed_by IS NOT NULL) AND (removed_by IS NULL) = (removed_at IS NULL)),
  -- A witness is a second person.
  CONSTRAINT permit_isolations_witness CHECK (witnessed_by IS NULL OR witnessed_by <> verified_by)
);
CREATE INDEX permit_isolations_tag ON gigalibs_cmms.permit_isolations (tenant_id, isolation_tag);

CREATE TABLE gigalibs_cmms.permit_lock_photos (
  tenant_id    gigalibs_cmms.tenant_ref NOT NULL,
  permit_id    uuid NOT NULL,
  point_key    text NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp')),
  bytes        bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 16 AND 307200),
  sha256       text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (tenant_id, permit_id, point_key),
  CONSTRAINT permit_lock_photos_isolation_fk FOREIGN KEY (tenant_id, permit_id, point_key)
    REFERENCES gigalibs_cmms.permit_isolations (tenant_id, permit_id, point_key) ON DELETE RESTRICT
);

CREATE TABLE gigalibs_cmms.permit_lock_events (
  tenant_id   gigalibs_cmms.tenant_ref NOT NULL,
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  permit_id   uuid NOT NULL,
  subject     gigalibs_cmms.principal_ref NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('ON', 'OFF')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT permit_lock_events_permit_fk FOREIGN KEY (tenant_id, permit_id)
    REFERENCES gigalibs_cmms.permits (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX permit_lock_events_permit ON gigalibs_cmms.permit_lock_events (tenant_id, permit_id, subject, occurred_at);

CREATE TABLE gigalibs_cmms.permit_gas_tests (
  tenant_id           gigalibs_cmms.tenant_ref NOT NULL,
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  permit_id           uuid NOT NULL,
  client_operation_id uuid NOT NULL,
  oxygen_percent      numeric NOT NULL CHECK (oxygen_percent BETWEEN 0 AND 100),
  lel_percent         numeric NOT NULL CHECK (lel_percent BETWEEN 0 AND 100),
  co_ppm              numeric NOT NULL CHECK (co_ppm BETWEEN 0 AND 10000),
  h2s_ppm             numeric NOT NULL CHECK (h2s_ppm BETWEEN 0 AND 10000),
  within_limits       boolean NOT NULL,
  tested_by           gigalibs_cmms.principal_ref NOT NULL,
  tested_at           timestamptz NOT NULL,
  received_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT permit_gas_tests_operation_unique UNIQUE (tenant_id, permit_id, client_operation_id),
  CONSTRAINT permit_gas_tests_permit_fk FOREIGN KEY (tenant_id, permit_id)
    REFERENCES gigalibs_cmms.permits (tenant_id, id) ON DELETE RESTRICT,
  -- The flag follows the safe-entry limits, so no row can claim a bad atmosphere is safe.
  CONSTRAINT permit_gas_tests_limits CHECK (within_limits = (oxygen_percent BETWEEN 19.5 AND 23.5 AND lel_percent <= 10
    AND co_ppm <= 25 AND h2s_ppm <= 5))
);

DO $rls$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['isolation_procedures', 'permit_counters', 'permits', 'permit_isolations',
    'permit_lock_photos', 'permit_lock_events', 'permit_gas_tests'] LOOP
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
VALUES (33, '000033_lockout_permits');

COMMIT;
