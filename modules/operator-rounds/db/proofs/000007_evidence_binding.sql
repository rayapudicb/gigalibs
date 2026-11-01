-- Run on a disposable PostgreSQL 16 database after migration 7 with psql -v ON_ERROR_STOP=1.
-- All fixture data and the test role disappear at ROLLBACK. Never run against customer/UAT data.
BEGIN;
CREATE ROLE rounds_evidence_probe NOLOGIN;
GRANT USAGE ON SCHEMA gigalibs_operator_rounds TO rounds_evidence_probe;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA gigalibs_operator_rounds TO rounds_evidence_probe;
SET LOCAL ROLE rounds_evidence_probe;
SET LOCAL app.tenant_id = 'evidence-proof-a';

INSERT INTO gigalibs_operator_rounds.route_templates
  (id,tenant_id,request_key,request_sha256,route_code,title,revision,state,
   schedule,created_by,approved_by,published_at)
VALUES ('10000000-0000-4000-8000-000000000001','evidence-proof-a',
  '10000000-0000-4000-8000-000000000101',repeat('a',64),'P1','Pump route',1,
  'PUBLISHED','{}','author','reviewer',now());
INSERT INTO gigalibs_operator_rounds.checkpoints
  (id,tenant_id,route_id,position,label,asset_ref,tag_code,proof_mode,reading_kind,unit_code)
VALUES
  ('10000000-0000-4000-8000-000000000002','evidence-proof-a',
   '10000000-0000-4000-8000-000000000001',1,'Pressure','asset','TAG-1','NFC','NUMERIC','bar'),
  ('10000000-0000-4000-8000-000000000003','evidence-proof-a',
   '10000000-0000-4000-8000-000000000001',2,'Pressure 2','asset','TAG-2','NFC','NUMERIC','bar');
INSERT INTO gigalibs_operator_rounds.assignments
  (id,tenant_id,request_key,request_sha256,route_id,route_revision,workforce_resource_ref,
   operator_subject,scheduled_start,due_at,created_by)
VALUES ('10000000-0000-4000-8000-000000000004','evidence-proof-a',
  '10000000-0000-4000-8000-000000000104',repeat('a',64),
  '10000000-0000-4000-8000-000000000001',1,'resource','operator',now(),now()+interval '1 hour','author');
INSERT INTO gigalibs_operator_rounds.round_runs
  (id,tenant_id,request_key,request_sha256,assignment_id,route_id,route_revision,actor_subject)
VALUES ('10000000-0000-4000-8000-000000000005','evidence-proof-a',
  '10000000-0000-4000-8000-000000000105',repeat('a',64),
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000001',1,'operator');
INSERT INTO gigalibs_operator_rounds.media_evidence
  (id,tenant_id,actor_subject,storage_key,sha256,mime_type,byte_size,state,committed_at,
   assignment_id,checkpoint_id)
VALUES ('10000000-0000-4000-8000-000000000006','evidence-proof-a','operator','evidence-proof-a/one',
  repeat('a',64),'image/jpeg',1024,'COMMITTED',now(),
  '10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002');

DO $$ BEGIN
  BEGIN
    INSERT INTO gigalibs_operator_rounds.media_evidence
      (id,tenant_id,actor_subject,storage_key,sha256,mime_type,byte_size,state,assignment_id)
    VALUES ('10000000-0000-4000-8000-000000000009','evidence-proof-a','operator',
      'evidence-proof-a/incomplete',repeat('a',64),'image/jpeg',1024,'STAGED',
      '10000000-0000-4000-8000-000000000004');
    RAISE EXCEPTION 'unpaired evidence binding was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

INSERT INTO gigalibs_operator_rounds.readings
  (id,tenant_id,run_id,checkpoint_id,client_operation_id,captured_at,source,proof_method,
   scanned_tag,numeric_value,status,evidence_id,actor_subject)
VALUES ('10000000-0000-4000-8000-000000000007','evidence-proof-a',
  '10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000107',now(),'MANUAL','NFC','TAG-1',4,'NORMAL',
  '10000000-0000-4000-8000-000000000006','operator');
DO $$ BEGIN
  BEGIN
    INSERT INTO gigalibs_operator_rounds.readings
      (id,tenant_id,run_id,checkpoint_id,client_operation_id,captured_at,source,proof_method,
       scanned_tag,numeric_value,status,evidence_id,actor_subject)
    VALUES ('10000000-0000-4000-8000-000000000008','evidence-proof-a',
      '10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000108',now(),'MANUAL','NFC','TAG-2',4,'NORMAL',
      '10000000-0000-4000-8000-000000000006','operator');
    RAISE EXCEPTION 'reused photo was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;

SET LOCAL app.tenant_id = 'evidence-proof-b';
DO $$ DECLARE n integer; BEGIN
  SELECT count(*) INTO n FROM gigalibs_operator_rounds.media_evidence;
  IF n <> 0 THEN RAISE EXCEPTION 'tenant B could read tenant A evidence'; END IF;
END $$;
ROLLBACK;
