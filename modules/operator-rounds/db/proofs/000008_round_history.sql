-- Disposable PostgreSQL 16 only, after migration 8. Fixture and role disappear at ROLLBACK.
BEGIN;
CREATE ROLE rounds_history_probe NOLOGIN;
GRANT USAGE ON SCHEMA gigalibs_operator_rounds TO rounds_history_probe;
GRANT SELECT,INSERT ON ALL TABLES IN SCHEMA gigalibs_operator_rounds TO rounds_history_probe;
SET LOCAL ROLE rounds_history_probe;
SET LOCAL app.tenant_id='round-history-a';

INSERT INTO gigalibs_operator_rounds.route_templates
  (id,tenant_id,request_key,request_sha256,route_code,title,revision,state,
   schedule,created_by,approved_by,published_at)
VALUES ('10000000-0000-4000-8000-000000000001','round-history-a',
  '10000000-0000-4000-8000-000000000101',repeat('a',64),'HISTORY_A','History route',1,
  'PUBLISHED','{}','author','reviewer',now());
INSERT INTO gigalibs_operator_rounds.checkpoints
  (id,tenant_id,route_id,position,label,asset_ref,tag_code,proof_mode,reading_kind,unit_code)
VALUES ('10000000-0000-4000-8000-000000000002','round-history-a',
  '10000000-0000-4000-8000-000000000001',1,'Pressure',
  '10000000-0000-4000-8000-000000000003','TAG-H','BARCODE','NUMERIC','bar');

DO $$ DECLARE n integer; suffix text; aid uuid; rid uuid; oid uuid; BEGIN
  FOR n IN 1..7 LOOP
    suffix:=lpad(n::text,12,'0');
    aid:=('20000000-0000-4000-8000-'||suffix)::uuid;
    rid:=('30000000-0000-4000-8000-'||suffix)::uuid;
    oid:=('40000000-0000-4000-8000-'||suffix)::uuid;
    INSERT INTO gigalibs_operator_rounds.assignments
      (id,tenant_id,request_key,request_sha256,route_id,route_revision,workforce_resource_ref,
       operator_subject,scheduled_start,due_at,created_by)
    VALUES (aid,'round-history-a',('50000000-0000-4000-8000-'||suffix)::uuid,
      repeat('a',64),'10000000-0000-4000-8000-000000000001',1,
      '10000000-0000-4000-8000-000000000004','operator',now()-n*interval '1 hour',
      now()-(n-1)*interval '1 hour','author');
    INSERT INTO gigalibs_operator_rounds.round_runs
      (id,tenant_id,request_key,request_sha256,assignment_id,route_id,route_revision,actor_subject)
    VALUES (rid,'round-history-a',('60000000-0000-4000-8000-'||suffix)::uuid,
      repeat('a',64),aid,'10000000-0000-4000-8000-000000000001',1,'operator');
    INSERT INTO gigalibs_operator_rounds.readings
      (id,tenant_id,run_id,checkpoint_id,client_operation_id,captured_at,source,proof_method,
       scanned_tag,numeric_value,status,actor_subject)
    VALUES (oid,'round-history-a',rid,'10000000-0000-4000-8000-000000000002',
      ('70000000-0000-4000-8000-'||suffix)::uuid,now()-n*interval '1 hour',
      'MANUAL','BARCODE','TAG-H',n,'NORMAL','operator');
  END LOOP;
END $$;

-- The current assignment must never contribute its own readings to its baseline.
INSERT INTO gigalibs_operator_rounds.assignments
  (id,tenant_id,request_key,request_sha256,route_id,route_revision,workforce_resource_ref,
   operator_subject,scheduled_start,due_at,created_by)
VALUES ('20000000-0000-4000-8000-000000000008','round-history-a',
  '50000000-0000-4000-8000-000000000008',repeat('a',64),
  '10000000-0000-4000-8000-000000000001',1,
  '10000000-0000-4000-8000-000000000004','operator',now(),now()+interval '1 hour','author');
INSERT INTO gigalibs_operator_rounds.round_runs
  (id,tenant_id,request_key,request_sha256,assignment_id,route_id,route_revision,actor_subject)
VALUES ('30000000-0000-4000-8000-000000000008','round-history-a',
  '60000000-0000-4000-8000-000000000008',repeat('a',64),
  '20000000-0000-4000-8000-000000000008',
  '10000000-0000-4000-8000-000000000001',1,'operator');
INSERT INTO gigalibs_operator_rounds.readings
  (id,tenant_id,run_id,checkpoint_id,client_operation_id,captured_at,source,proof_method,
   scanned_tag,numeric_value,status,actor_subject)
VALUES ('40000000-0000-4000-8000-000000000008','round-history-a',
  '30000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000002',
  '70000000-0000-4000-8000-000000000008',now(),'MANUAL','BARCODE','TAG-H',99,'RED','operator');

DO $$ DECLARE values numeric[]; BEGIN
  SELECT array_agg(recent.numeric_value ORDER BY recent.captured_at DESC,recent.id DESC)
    INTO values
  FROM (
    SELECT rd.id,rd.captured_at,rd.numeric_value
    FROM gigalibs_operator_rounds.readings rd
    JOIN gigalibs_operator_rounds.round_runs rr
      ON rr.tenant_id=rd.tenant_id AND rr.id=rd.run_id
    WHERE rd.tenant_id='round-history-a'
      AND rd.checkpoint_id='10000000-0000-4000-8000-000000000002'
      AND rr.assignment_id<>'20000000-0000-4000-8000-000000000008'
    ORDER BY rd.captured_at DESC,rd.id DESC LIMIT 5
  ) recent;
  IF values<>ARRAY[1,2,3,4,5]::numeric[] THEN
    RAISE EXCEPTION 'Expected five prior readings, got %',values;
  END IF;
END $$;

SET LOCAL app.tenant_id='round-history-b';
DO $$ DECLARE n integer; BEGIN
  SELECT count(*) INTO n FROM gigalibs_operator_rounds.readings;
  IF n<>0 THEN RAISE EXCEPTION 'History leaked across tenants'; END IF;
END $$;
ROLLBACK;
