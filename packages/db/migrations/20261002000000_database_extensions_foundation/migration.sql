-- Database-wide extensions are infrastructure shared by capability modules. Install them in
-- public before any module migration job starts, so module start order cannot decide extension
-- ownership or type visibility. Existing installations are converged without dropping objects.
DO $$
DECLARE
  extension_name TEXT;
  installed_schema TEXT;
BEGIN
  FOREACH extension_name IN ARRAY ARRAY['pgcrypto', 'ltree', 'btree_gist']
  LOOP
    SELECT n.nspname
      INTO installed_schema
      FROM pg_extension e
      JOIN pg_namespace n ON n.oid = e.extnamespace
     WHERE e.extname = extension_name;

    IF installed_schema IS NULL THEN
      EXECUTE format('CREATE EXTENSION %I WITH SCHEMA public', extension_name);
    ELSIF installed_schema <> 'public' THEN
      EXECUTE format('ALTER EXTENSION %I SET SCHEMA public', extension_name);
    END IF;
  END LOOP;
END
$$;
