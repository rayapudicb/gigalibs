BEGIN;

-- WI-OI-107 fix (found by the live proof): Configuration Studio's published version ids are cuids, not UUIDs. The
-- table is new and empty everywhere, so the column type changes in place.
ALTER TABLE gigalibs_workforce.pack_sections ALTER COLUMN published_version_id TYPE VARCHAR(64);

INSERT INTO gigalibs_workforce.schema_migrations (version, name)
VALUES (16, '000016_workforce_pack_version_ids');

COMMIT;
