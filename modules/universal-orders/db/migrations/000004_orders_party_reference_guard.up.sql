-- WI-OI-120gi (Table 1 row 3): refuse orders documents that reference a missing or inactive kernel party.
BEGIN;

CREATE OR REPLACE FUNCTION gigalibs_orders.require_active_party(
  p_tenant_id varchar(64),
  p_party_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM parties
    WHERE tenant_id = p_tenant_id
      AND id = p_party_id
      AND status = 'ACTIVE'
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Customer party % is not an active workspace party for tenant %.', p_party_id, p_tenant_id
      USING ERRCODE = '23503';
  END IF;
END;
$$;

INSERT INTO gigalibs_orders.schema_migrations (version, name)
VALUES (4, '000004_orders_party_reference_guard')
ON CONFLICT (version) DO NOTHING;

COMMIT;
