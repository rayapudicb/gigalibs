-- Recovery only before a route roster is configured. Forward correction is preferred after use.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM gigalibs_operator_rounds.route_rosters) THEN
    RAISE EXCEPTION 'Cannot remove a configured Rounds roster';
  END IF;
END $$;
DROP TABLE gigalibs_operator_rounds.route_rosters;
DELETE FROM gigalibs_operator_rounds.schema_migrations WHERE version=6;
COMMIT;
