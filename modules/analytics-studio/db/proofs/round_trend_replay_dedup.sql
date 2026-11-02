-- WI-OI-133: a Rounds reading is counted once in the inspection trend, however often it reaches Analytics.
--
-- Run on a disposable PostgreSQL 16 with Analytics migrations 1-35 applied, as a non-superuser that does not own the
-- tables (FORCE ROW LEVEL SECURITY applies). Everything runs in one transaction that is rolled back.
--
-- pg_temp.deliver repeats ConnectorHubInboxService.receiveRoundsReading's three statements verbatim (receipt,
-- source connection, sync run, raw record). The trend query is InspectionTrendService.trend's verbatim.
--
-- Cases:
--   1. Message m1 (READING_ACCEPTED_V1, reading R1 = 10) is stored.
--   2. m1 delivered again is a duplicate: no second receipt, sync run or raw record.
--   3. m2 (EXCEPTION_RAISED_V1 for the same RED reading R1) is a new message, so a second raw version is stored.
--   4. m3 (READING_ACCEPTED_V1, reading R2 = 20) is stored.
--   The trend shows one day with 2 samples (average 15, min 10, max 20), not 3 (average 13.33).
--   Tenant B sees no facts and no trend.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE gigalibs_analytics_proof;

CREATE FUNCTION pg_temp.deliver(p_message_id text, p_tenant_id text, p_event_type text, p_reading_id text, p_projected jsonb,
                                p_occurred_at timestamptz) RETURNS text LANGUAGE plpgsql AS $deliver$
DECLARE
  inserted integer;
  source_id uuid;
  run_id uuid;
BEGIN
  INSERT INTO gigalibs_analytics.inbox_receipts(message_id,tenant_id,source,event_type)
  VALUES(p_message_id,p_tenant_id,'operator-rounds',p_event_type) ON CONFLICT(message_id) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted = 0 THEN RETURN 'duplicate'; END IF;
  INSERT INTO gigalibs_analytics.source_connections
  (tenant_id,display_name,source_type,status,created_by,module_source_key)
  VALUES(p_tenant_id,'Operator inspection readings','MODULE_EVENTS','ACTIVE','operator-rounds','operator-rounds:readings')
  ON CONFLICT(tenant_id,module_source_key) WHERE module_source_key IS NOT NULL
  DO UPDATE SET updated_at=now() RETURNING id INTO source_id;
  INSERT INTO gigalibs_analytics.source_sync_runs
  (connection_id,tenant_id,status,rows_fetched,hub_sync_job_id,started_at,completed_at)
  VALUES(source_id,p_tenant_id,'SUCCEEDED',1,p_message_id,p_occurred_at,p_occurred_at)
  ON CONFLICT(connection_id,hub_sync_job_id) WHERE hub_sync_job_id IS NOT NULL
  DO UPDATE SET completed_at=GREATEST(gigalibs_analytics.source_sync_runs.completed_at,EXCLUDED.completed_at)
  RETURNING id INTO run_id;
  INSERT INTO gigalibs_analytics.raw_record_versions
  (sync_run_id,connection_id,tenant_id,source_table_name,source_pk_hash,raw_payload,ingested_at)
  VALUES(run_id,source_id,p_tenant_id,'inspection_readings',encode(sha256(convert_to(p_reading_id,'UTF8')),'hex'),
         p_projected,p_occurred_at);
  RETURN 'stored';
END $deliver$;

-- The service's trend query, verbatim; parameters $1-$8 as the service binds them.
CREATE FUNCTION pg_temp.trend(tenant text, asset text, checkpoint text, unit text, units text[], places text[],
                              from_instant text, until_instant text)
RETURNS TABLE(day text, unit_code text, average text, minimum text, maximum text, sample_count integer)
LANGUAGE plpgsql AS $trend$
BEGIN
  RETURN QUERY EXECUTE
      $q$WITH facts AS (
         SELECT DISTINCT ON (r.source_pk_hash) r.raw_payload
           FROM gigalibs_analytics.raw_record_versions r
           JOIN gigalibs_analytics.source_connections s
             ON s.id=r.connection_id AND s.tenant_id=r.tenant_id
          WHERE r.tenant_id=$1 AND s.module_source_key='operator-rounds:readings'
            AND r.source_table_name='inspection_readings'
            AND r.raw_payload->>'scopeKnown'='true'
            AND r.raw_payload->>'source'='MANUAL'
            AND r.raw_payload->>'assetId'=$2
            AND r.raw_payload->>'checkpointId'=$3
            AND r.raw_payload->>'unitCode'=$4
            AND r.raw_payload->>'numericValue' IS NOT NULL
            AND ($5::text[] IS NULL OR r.raw_payload->>'owningUnitId' IS NULL
                 OR r.raw_payload->>'owningUnitId'=ANY($5::text[]))
            AND ($6::text[] IS NULL OR r.raw_payload->>'placeRef'=ANY($6::text[]))
            AND (r.raw_payload->>'capturedAt')::timestamptz >= $7::timestamptz
            AND (r.raw_payload->>'capturedAt')::timestamptz < $8::timestamptz
          ORDER BY r.source_pk_hash,r.ingested_at DESC,r.id DESC
       )
       SELECT to_char(((f.raw_payload->>'capturedAt')::timestamptz AT TIME ZONE 'UTC')::date,'YYYY-MM-DD') AS day,
              f.raw_payload->>'unitCode' AS unit_code,
              round(avg((f.raw_payload->>'numericValue')::numeric),6)::text AS average,
              min((f.raw_payload->>'numericValue')::numeric)::text AS minimum,
              max((f.raw_payload->>'numericValue')::numeric)::text AS maximum,
              count(*)::int AS sample_count
         FROM facts f
        GROUP BY 1,2 ORDER BY 1 LIMIT 91$q$
    USING tenant, asset, checkpoint, unit, units, places, from_instant, until_instant;
END $trend$;

DO $proof$
DECLARE
  asset constant text := '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';
  checkpoint constant text := '0b1c2d3e-4f50-4617-8899-aabbccddeeff';
  r1 constant text := '11111111-1111-4111-8111-111111111111';
  r2 constant text := '22222222-2222-4222-8222-222222222222';
  outcome text;
  row record;
  total integer;
  fact jsonb;
BEGIN
  PERFORM set_config('app.tenant_id','tenant-a',true);
  fact := jsonb_build_object('assetId',asset,'checkpointId',checkpoint,'unitCode','bar','source','MANUAL',
    'scopeKnown',true,'owningUnitId','unit-north','placeRef','place-1','choiceValue',null,'status','RED',
    'capturedAt','2026-11-01T08:00:00.000Z','acceptedAt','2026-11-01T08:00:05.000Z');

  outcome := pg_temp.deliver('m1','tenant-a','READING_ACCEPTED_V1',r1,
    fact || jsonb_build_object('readingId',r1,'numericValue',10,'exceptionId',null,'eventType','READING_ACCEPTED_V1'),
    '2026-11-01T08:00:05Z');
  IF outcome <> 'stored' THEN RAISE EXCEPTION 'case 1: m1 was %, expected stored', outcome; END IF;

  outcome := pg_temp.deliver('m1','tenant-a','READING_ACCEPTED_V1',r1,
    fact || jsonb_build_object('readingId',r1,'numericValue',10,'exceptionId',null,'eventType','READING_ACCEPTED_V1'),
    '2026-11-01T08:00:06Z');
  IF outcome <> 'duplicate' THEN RAISE EXCEPTION 'case 2: m1 again was %, expected duplicate', outcome; END IF;
  SELECT count(*) INTO total FROM gigalibs_analytics.source_sync_runs WHERE hub_sync_job_id='m1';
  IF total <> 1 THEN RAISE EXCEPTION 'case 2: % sync runs for m1, expected 1', total; END IF;

  outcome := pg_temp.deliver('m2','tenant-a','EXCEPTION_RAISED_V1',r1,
    fact || jsonb_build_object('readingId',r1,'numericValue',10,'exceptionId','33333333-3333-4333-8333-333333333333',
      'eventType','EXCEPTION_RAISED_V1'),
    '2026-11-01T08:00:07Z');
  IF outcome <> 'stored' THEN RAISE EXCEPTION 'case 3: m2 was %, expected stored', outcome; END IF;

  outcome := pg_temp.deliver('m3','tenant-a','READING_ACCEPTED_V1',r2,
    (fact || jsonb_build_object('readingId',r2,'numericValue',20,'exceptionId',null,'eventType','READING_ACCEPTED_V1',
      'status','GREEN','capturedAt','2026-11-01T09:00:00.000Z')),
    '2026-11-01T09:00:05Z');
  IF outcome <> 'stored' THEN RAISE EXCEPTION 'case 4: m3 was %, expected stored', outcome; END IF;

  SELECT count(*) INTO total FROM gigalibs_analytics.raw_record_versions WHERE source_table_name='inspection_readings';
  IF total <> 3 THEN RAISE EXCEPTION 'raw versions: %, expected 3 (append-only evidence keeps both R1 versions)', total;
  END IF;

  SELECT count(*) INTO total FROM pg_temp.trend('tenant-a',asset,checkpoint,'bar',NULL,NULL,
    '2026-10-04T00:00:00.000Z','2026-11-02T00:00:00.000Z');
  IF total <> 1 THEN RAISE EXCEPTION 'trend: % days, expected 1', total; END IF;
  SELECT * INTO row FROM pg_temp.trend('tenant-a',asset,checkpoint,'bar',NULL,NULL,
    '2026-10-04T00:00:00.000Z','2026-11-02T00:00:00.000Z');
  IF row.day <> '2026-11-01' OR row.sample_count <> 2 OR row.average <> '15.000000' OR row.minimum <> '10'
     OR row.maximum <> '20' THEN
    RAISE EXCEPTION 'trend: day % count % avg % min % max %, expected 2026-11-01 2 15.000000 10 20',
      row.day, row.sample_count, row.average, row.minimum, row.maximum;
  END IF;

  -- The owning-unit and place filters still apply to the deduplicated facts.
  SELECT count(*) INTO total FROM pg_temp.trend('tenant-a',asset,checkpoint,'bar',ARRAY['unit-south'],NULL,
    '2026-10-04T00:00:00.000Z','2026-11-02T00:00:00.000Z');
  IF total <> 0 THEN RAISE EXCEPTION 'unit filter: % days for another unit, expected 0', total; END IF;
  SELECT count(*) INTO total FROM pg_temp.trend('tenant-a',asset,checkpoint,'bar',NULL,ARRAY['place-2'],
    '2026-10-04T00:00:00.000Z','2026-11-02T00:00:00.000Z');
  IF total <> 0 THEN RAISE EXCEPTION 'place filter: % days for another place, expected 0', total; END IF;

  PERFORM set_config('app.tenant_id','tenant-b',true);
  SELECT count(*) INTO total FROM gigalibs_analytics.raw_record_versions;
  IF total <> 0 THEN RAISE EXCEPTION 'tenant B sees % raw records, expected 0', total; END IF;
  SELECT count(*) INTO total FROM pg_temp.trend('tenant-a',asset,checkpoint,'bar',NULL,NULL,
    '2026-10-04T00:00:00.000Z','2026-11-02T00:00:00.000Z');
  IF total <> 0 THEN RAISE EXCEPTION 'tenant B session sees % trend days of tenant A, expected 0', total; END IF;

  RAISE NOTICE 'round trend replay dedup proof passed: duplicate message refused, two R1 versions stored, trend counts 2 samples';
END $proof$;

ROLLBACK;
