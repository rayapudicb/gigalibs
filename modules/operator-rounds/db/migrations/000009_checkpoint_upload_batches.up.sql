-- WI-OI-133: bounded checkpoint batches for large draft routes. Each request stays under the module host's body limit;
-- finalize replaces the draft's checkpoints from one complete upload in one transaction. Staged rows are transient:
-- finalize deletes its upload, and staging prunes stale versions and uploads older than a day. Additive.
BEGIN;

CREATE TABLE gigalibs_operator_rounds.checkpoint_upload_batches (
  tenant_id varchar(64) NOT NULL,
  route_id uuid NOT NULL,
  upload_id uuid NOT NULL,
  route_version integer NOT NULL CHECK (route_version > 0),
  batch_index integer NOT NULL CHECK (batch_index >= 0),
  batch_count integer NOT NULL CHECK (batch_count BETWEEN 1 AND 1000 AND batch_index < batch_count),
  checkpoints jsonb NOT NULL
    CHECK (jsonb_typeof(checkpoints)='array' AND jsonb_array_length(checkpoints) BETWEEN 1 AND 1000),
  payload_sha256 char(64) NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,route_id,upload_id,batch_index),
  FOREIGN KEY (tenant_id,route_id)
    REFERENCES gigalibs_operator_rounds.route_templates(tenant_id,id)
);
CREATE INDEX checkpoint_upload_batches_age
  ON gigalibs_operator_rounds.checkpoint_upload_batches(tenant_id,route_id,created_at);
ALTER TABLE gigalibs_operator_rounds.checkpoint_upload_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_operator_rounds.checkpoint_upload_batches FORCE ROW LEVEL SECURITY;
CREATE POLICY checkpoint_upload_batches_tenant_isolation ON gigalibs_operator_rounds.checkpoint_upload_batches
  FOR ALL USING (tenant_id=NULLIF(current_setting('app.tenant_id',true),''))
  WITH CHECK (tenant_id=NULLIF(current_setting('app.tenant_id',true),''));

INSERT INTO gigalibs_operator_rounds.schema_migrations(version,name)
VALUES(9,'000009_checkpoint_upload_batches');
COMMIT;
