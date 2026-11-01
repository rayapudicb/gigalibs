-- Run on a disposable PostgreSQL 16 database after migration 10 with psql -v ON_ERROR_STOP=1.
-- All fixture data and the test role disappear at ROLLBACK. Never run against customer/UAT data.
BEGIN;
CREATE ROLE rounds_defect_probe NOLOGIN NOBYPASSRLS;
GRANT USAGE ON SCHEMA gigalibs_operator_rounds TO rounds_defect_probe;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA gigalibs_operator_rounds TO rounds_defect_probe;
SET LOCAL ROLE rounds_defect_probe;
SET LOCAL app.tenant_id = 'defect-proof-a';

INSERT INTO gigalibs_operator_rounds.route_templates
  (id,tenant_id,request_key,request_sha256,route_code,title,revision,state,schedule,created_by,approved_by,published_at)
VALUES ('30000000-0000-4000-8000-000000000001','defect-proof-a','30000000-0000-4000-8000-000000000101',
  repeat('a',64),'D1','Defect route',1,'PUBLISHED','{}','author','reviewer',now());
INSERT INTO gigalibs_operator_rounds.checkpoints
  (id,tenant_id,route_id,position,label,asset_ref,tag_code,proof_mode,reading_kind,unit_code,choices,branch_rule)
VALUES
  ('30000000-0000-4000-8000-000000000011','defect-proof-a','30000000-0000-4000-8000-000000000001',1,'One','asset','T1','NFC','CHOICE',NULL,'["PASS","FAIL"]','[]'),
  ('30000000-0000-4000-8000-000000000012','defect-proof-a','30000000-0000-4000-8000-000000000001',2,'Two','asset','T2','NFC','CHOICE',NULL,'["PASS","FAIL"]','[]'),
  ('30000000-0000-4000-8000-000000000013','defect-proof-a','30000000-0000-4000-8000-000000000001',3,'Three','asset','T3','NFC','CHOICE',NULL,'["PASS","FAIL"]','[]');
INSERT INTO gigalibs_operator_rounds.assignments
  (id,tenant_id,request_key,request_sha256,route_id,route_revision,workforce_resource_ref,operator_subject,
   scheduled_start,due_at,created_by)
VALUES ('30000000-0000-4000-8000-000000000021','defect-proof-a','30000000-0000-4000-8000-000000000121',repeat('a',64),
  '30000000-0000-4000-8000-000000000001',1,'resource','operator',now(),now()+interval '1 hour','author');
INSERT INTO gigalibs_operator_rounds.round_runs
  (id,tenant_id,request_key,request_sha256,assignment_id,route_id,route_revision,actor_subject)
VALUES ('30000000-0000-4000-8000-000000000031','defect-proof-a','30000000-0000-4000-8000-000000000131',repeat('a',64),
  '30000000-0000-4000-8000-000000000021','30000000-0000-4000-8000-000000000001',1,'operator');

-- The route path: a reading at 1, then a requested skip at 2, then a reading at 3, each received in turn.
INSERT INTO gigalibs_operator_rounds.readings
  (id,tenant_id,run_id,checkpoint_id,client_operation_id,captured_at,received_at,source,proof_method,scanned_tag,
   choice_value,status,actor_subject)
VALUES
  ('30000000-0000-4000-8000-000000000041','defect-proof-a','30000000-0000-4000-8000-000000000031',
   '30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000141',now(),now()-interval '3 minutes',
   'MANUAL','NFC','T1','PASS','NORMAL','operator'),
  ('30000000-0000-4000-8000-000000000043','defect-proof-a','30000000-0000-4000-8000-000000000031',
   '30000000-0000-4000-8000-000000000013','30000000-0000-4000-8000-000000000143',now(),now()-interval '1 minute',
   'MANUAL','NFC','T3','PASS','NORMAL','operator');
INSERT INTO gigalibs_operator_rounds.checkpoint_skips
  (id,tenant_id,run_id,checkpoint_id,client_operation_id,captured_at,received_at,reason_code,requested_by)
VALUES ('30000000-0000-4000-8000-000000000052','defect-proof-a','30000000-0000-4000-8000-000000000031',
  '30000000-0000-4000-8000-000000000012','30000000-0000-4000-8000-000000000152',now(),now()-interval '2 minutes',
  'INACCESSIBLE','operator');

-- The service's routeSteps query, verbatim apart from the bound parameters; a FOR loop keeps its ORDER BY.
DO $$ DECLARE step record; path text := ''; latest integer; BEGIN
  FOR step IN
    SELECT position,status,numeric_value,choice_value FROM (
      SELECT c.position,rd.status,rd.numeric_value::text AS numeric_value,rd.choice_value,rd.received_at,rd.id::text AS step_id
        FROM gigalibs_operator_rounds.readings rd JOIN gigalibs_operator_rounds.checkpoints c ON c.tenant_id=rd.tenant_id AND c.id=rd.checkpoint_id
       WHERE rd.tenant_id='defect-proof-a' AND rd.run_id='30000000-0000-4000-8000-000000000031'
      UNION ALL
      SELECT c.position,'SKIPPED',NULL,NULL,sk.received_at,sk.id::text
        FROM gigalibs_operator_rounds.checkpoint_skips sk JOIN gigalibs_operator_rounds.checkpoints c ON c.tenant_id=sk.tenant_id AND c.id=sk.checkpoint_id
       WHERE sk.tenant_id='defect-proof-a' AND sk.run_id='30000000-0000-4000-8000-000000000031'
    ) steps ORDER BY received_at ASC,step_id ASC
  LOOP
    path := path || CASE WHEN path = '' THEN '' ELSE ',' END || step.position || ':' || step.status;
  END LOOP;
  IF path <> '1:NORMAL,2:SKIPPED,3:NORMAL' THEN RAISE EXCEPTION 'route path order was %', path; END IF;
  SELECT position INTO latest FROM (
    SELECT c.position,rd.status,rd.numeric_value::text AS numeric_value,rd.choice_value,rd.received_at,rd.id::text AS step_id
      FROM gigalibs_operator_rounds.readings rd JOIN gigalibs_operator_rounds.checkpoints c ON c.tenant_id=rd.tenant_id AND c.id=rd.checkpoint_id
     WHERE rd.tenant_id='defect-proof-a' AND rd.run_id='30000000-0000-4000-8000-000000000031'
    UNION ALL
    SELECT c.position,'SKIPPED',NULL,NULL,sk.received_at,sk.id::text
      FROM gigalibs_operator_rounds.checkpoint_skips sk JOIN gigalibs_operator_rounds.checkpoints c ON c.tenant_id=sk.tenant_id AND c.id=sk.checkpoint_id
     WHERE sk.tenant_id='defect-proof-a' AND sk.run_id='30000000-0000-4000-8000-000000000031'
  ) steps ORDER BY received_at DESC,step_id DESC LIMIT 1;
  IF latest <> 3 THEN RAISE EXCEPTION 'latest step was %', latest; END IF;
END $$;

-- Skip rules: one per checkpoint and run; OTHER needs a note; a decision names its decider, never the requester.
DO $$ BEGIN
  BEGIN
    INSERT INTO gigalibs_operator_rounds.checkpoint_skips
      (id,tenant_id,run_id,checkpoint_id,client_operation_id,captured_at,reason_code,requested_by)
    VALUES ('30000000-0000-4000-8000-000000000053','defect-proof-a','30000000-0000-4000-8000-000000000031',
      '30000000-0000-4000-8000-000000000012','30000000-0000-4000-8000-000000000153',now(),'UNSAFE','operator');
    RAISE EXCEPTION 'a second skip of one checkpoint was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO gigalibs_operator_rounds.checkpoint_skips
      (id,tenant_id,run_id,checkpoint_id,client_operation_id,captured_at,reason_code,requested_by)
    VALUES ('30000000-0000-4000-8000-000000000054','defect-proof-a','30000000-0000-4000-8000-000000000031',
      '30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000154',now(),'OTHER','operator');
    RAISE EXCEPTION 'an OTHER skip without a note was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE gigalibs_operator_rounds.checkpoint_skips SET state='APPROVED',decided_by='operator',
      decision_note='self',decided_at=now() WHERE id='30000000-0000-4000-8000-000000000052';
    RAISE EXCEPTION 'the requester approved their own skip';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE gigalibs_operator_rounds.checkpoint_skips SET state='APPROVED' WHERE id='30000000-0000-4000-8000-000000000052';
    RAISE EXCEPTION 'a decision without a decider was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
UPDATE gigalibs_operator_rounds.checkpoint_skips SET state='APPROVED',decided_by='supervisor',
  decision_note='Flooded pit',decided_at=now(),version=version+1 WHERE id='30000000-0000-4000-8000-000000000052';

-- Defects: shape per origin, and one photo per record.
INSERT INTO gigalibs_operator_rounds.media_evidence
  (id,tenant_id,actor_subject,storage_key,sha256,mime_type,byte_size,state,committed_at,assignment_id,checkpoint_id)
VALUES ('30000000-0000-4000-8000-000000000061','defect-proof-a','operator','defect-proof-a/leak',repeat('a',64),
  'image/jpeg',1024,'COMMITTED',now(),'30000000-0000-4000-8000-000000000021','30000000-0000-4000-8000-000000000012');
INSERT INTO gigalibs_operator_rounds.exceptions
  (id,tenant_id,origin,severity,state,run_id,checkpoint_id,description,evidence_id,client_operation_id,reported_by,observed_at)
VALUES ('30000000-0000-4000-8000-000000000071','defect-proof-a','DEFECT','RED','OPEN',
  '30000000-0000-4000-8000-000000000031','30000000-0000-4000-8000-000000000012','Oil leak',
  '30000000-0000-4000-8000-000000000061','30000000-0000-4000-8000-000000000171','operator',now());
DO $$ BEGIN
  BEGIN
    INSERT INTO gigalibs_operator_rounds.exceptions
      (id,tenant_id,origin,severity,state,run_id,checkpoint_id,description,evidence_id,client_operation_id,reported_by,observed_at)
    VALUES ('30000000-0000-4000-8000-000000000072','defect-proof-a','DEFECT','AMBER','OPEN',
      '30000000-0000-4000-8000-000000000031','30000000-0000-4000-8000-000000000012','Same photo again',
      '30000000-0000-4000-8000-000000000061','30000000-0000-4000-8000-000000000172','operator',now());
    RAISE EXCEPTION 'one photo supported two defects';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO gigalibs_operator_rounds.exceptions
      (id,tenant_id,origin,severity,state,run_id,checkpoint_id,client_operation_id,reported_by,observed_at)
    VALUES ('30000000-0000-4000-8000-000000000073','defect-proof-a','DEFECT','AMBER','OPEN',
      '30000000-0000-4000-8000-000000000031','30000000-0000-4000-8000-000000000012',
      '30000000-0000-4000-8000-000000000173','operator',now());
    RAISE EXCEPTION 'a defect without a description was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO gigalibs_operator_rounds.exceptions (id,tenant_id,severity,state)
    VALUES ('30000000-0000-4000-8000-000000000074','defect-proof-a','RED','OPEN');
    RAISE EXCEPTION 'a threshold exception without a reading was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- Tenant B sees none of tenant A's skips or defects; an unbound session sees nothing.
SET LOCAL app.tenant_id = 'defect-proof-b';
DO $$ DECLARE n integer; BEGIN
  SELECT (SELECT count(*) FROM gigalibs_operator_rounds.checkpoint_skips)
       + (SELECT count(*) FROM gigalibs_operator_rounds.exceptions) INTO n;
  IF n <> 0 THEN RAISE EXCEPTION 'tenant B could read tenant A skips or defects'; END IF;
END $$;
RESET app.tenant_id;
DO $$ DECLARE n integer; BEGIN
  SELECT count(*) INTO n FROM gigalibs_operator_rounds.checkpoint_skips;
  IF n <> 0 THEN RAISE EXCEPTION 'an unbound session could read skips'; END IF;
END $$;
ROLLBACK;
