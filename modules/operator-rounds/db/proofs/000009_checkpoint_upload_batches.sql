-- Run on a disposable PostgreSQL 16 database after migration 9 with psql -v ON_ERROR_STOP=1.
-- All fixture data and the test role disappear at ROLLBACK. Never run against customer/UAT data.
BEGIN;
CREATE ROLE rounds_upload_probe NOLOGIN NOBYPASSRLS;
GRANT USAGE ON SCHEMA gigalibs_operator_rounds TO rounds_upload_probe;
GRANT SELECT, INSERT, DELETE ON ALL TABLES IN SCHEMA gigalibs_operator_rounds TO rounds_upload_probe;
SET LOCAL ROLE rounds_upload_probe;
SET LOCAL app.tenant_id = 'upload-proof-a';

INSERT INTO gigalibs_operator_rounds.route_templates
  (id,tenant_id,request_key,request_sha256,route_code,title,revision,state,schedule,created_by)
VALUES ('20000000-0000-4000-8000-000000000001','upload-proof-a',
  '20000000-0000-4000-8000-000000000101',repeat('a',64),'U1','Upload route',1,'DRAFT','{}','author');

-- Two batches of one upload are accepted.
INSERT INTO gigalibs_operator_rounds.checkpoint_upload_batches
  (tenant_id,route_id,upload_id,route_version,batch_index,batch_count,checkpoints,payload_sha256,uploaded_by)
VALUES
  ('upload-proof-a','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000201',
   1,0,2,'[{"position":1}]',repeat('b',64),'author'),
  ('upload-proof-a','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000201',
   1,1,2,'[{"position":2}]',repeat('c',64),'author');

-- The same batch twice, an index outside the count, a non-array, an empty array and a malformed digest are refused.
DO $$ BEGIN
  BEGIN
    INSERT INTO gigalibs_operator_rounds.checkpoint_upload_batches
      (tenant_id,route_id,upload_id,route_version,batch_index,batch_count,checkpoints,payload_sha256,uploaded_by)
    VALUES ('upload-proof-a','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000201',
      1,1,2,'[{"position":2}]',repeat('d',64),'author');
    RAISE EXCEPTION 'a second copy of one batch was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO gigalibs_operator_rounds.checkpoint_upload_batches
      (tenant_id,route_id,upload_id,route_version,batch_index,batch_count,checkpoints,payload_sha256,uploaded_by)
    VALUES ('upload-proof-a','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000202',
      1,2,2,'[{"position":3}]',repeat('e',64),'author');
    RAISE EXCEPTION 'a batch index outside its count was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO gigalibs_operator_rounds.checkpoint_upload_batches
      (tenant_id,route_id,upload_id,route_version,batch_index,batch_count,checkpoints,payload_sha256,uploaded_by)
    VALUES ('upload-proof-a','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000203',
      1,0,1,'{"position":1}',repeat('f',64),'author');
    RAISE EXCEPTION 'a non-array batch was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO gigalibs_operator_rounds.checkpoint_upload_batches
      (tenant_id,route_id,upload_id,route_version,batch_index,batch_count,checkpoints,payload_sha256,uploaded_by)
    VALUES ('upload-proof-a','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000204',
      1,0,1,'[]',repeat('f',64),'author');
    RAISE EXCEPTION 'an empty batch was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO gigalibs_operator_rounds.checkpoint_upload_batches
      (tenant_id,route_id,upload_id,route_version,batch_index,batch_count,checkpoints,payload_sha256,uploaded_by)
    VALUES ('upload-proof-a','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000205',
      1,0,1,'[{"position":1}]','not-a-digest-not-a-digest-not-a-digest-not-a-digest-not-a-digest',
      'author');
    RAISE EXCEPTION 'a malformed digest was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- A batch claiming another tenant is refused by forced RLS.
  BEGIN
    INSERT INTO gigalibs_operator_rounds.checkpoint_upload_batches
      (tenant_id,route_id,upload_id,route_version,batch_index,batch_count,checkpoints,payload_sha256,uploaded_by)
    VALUES ('upload-proof-b','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000206',
      1,0,1,'[{"position":1}]',repeat('a',64),'author');
    RAISE EXCEPTION 'a batch for another tenant was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

DO $$ DECLARE n integer; BEGIN
  SELECT count(*) INTO n FROM gigalibs_operator_rounds.checkpoint_upload_batches;
  IF n <> 2 THEN RAISE EXCEPTION 'tenant A should see its two batches, saw %', n; END IF;
END $$;

-- Tenant B sees and deletes nothing of tenant A's upload.
SET LOCAL app.tenant_id = 'upload-proof-b';
DO $$ DECLARE n integer; BEGIN
  SELECT count(*) INTO n FROM gigalibs_operator_rounds.checkpoint_upload_batches;
  IF n <> 0 THEN RAISE EXCEPTION 'tenant B could read tenant A batches'; END IF;
  DELETE FROM gigalibs_operator_rounds.checkpoint_upload_batches;
END $$;
SET LOCAL app.tenant_id = 'upload-proof-a';
DO $$ DECLARE n integer; BEGIN
  SELECT count(*) INTO n FROM gigalibs_operator_rounds.checkpoint_upload_batches;
  IF n <> 2 THEN RAISE EXCEPTION 'tenant B removed tenant A batches'; END IF;
END $$;

-- Without a tenant binding nothing is visible.
RESET app.tenant_id;
DO $$ DECLARE n integer; BEGIN
  SELECT count(*) INTO n FROM gigalibs_operator_rounds.checkpoint_upload_batches;
  IF n <> 0 THEN RAISE EXCEPTION 'an unbound session could read batches'; END IF;
END $$;
ROLLBACK;
