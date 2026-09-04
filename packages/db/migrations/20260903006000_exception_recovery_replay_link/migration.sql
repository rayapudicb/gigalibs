-- A replay source event is an execution result, not mutable request input. Allow
-- the worker/API to attach it once while retaining the immutable recovery request.
CREATE OR REPLACE FUNCTION enforce_exception_recovery_integrity() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'exception recovery history is immutable'; END IF;
  IF (to_jsonb(NEW) - ARRAY['status', 'result', 'errorCode', 'completedAt', 'replaySourceEventId'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'result', 'errorCode', 'completedAt', 'replaySourceEventId']) THEN
    RAISE EXCEPTION 'exception recovery request is immutable';
  END IF;
  IF NEW."replaySourceEventId" IS DISTINCT FROM OLD."replaySourceEventId"
     AND (OLD."replaySourceEventId" IS NOT NULL OR NEW."replaySourceEventId" IS NULL) THEN
    RAISE EXCEPTION 'replay source event can only be linked once';
  END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status"
     AND (OLD."status" <> 'REQUESTED' OR NEW."status" NOT IN ('SUCCEEDED', 'FAILED')) THEN
    RAISE EXCEPTION 'invalid exception recovery state transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
