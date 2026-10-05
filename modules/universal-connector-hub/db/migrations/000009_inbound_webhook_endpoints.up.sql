-- WI-OI-120e (U3.2, P0-08): an inbound webhook names its connection only by an unguessable endpoint ID in the URL.
-- The tenant comes from that connection, never from a header the sender chooses. The definer function below is the
-- webhook receiver's only cross-tenant access: it returns the tenant and connection of one endpoint ID and nothing
-- else. Existing connections get an endpoint ID here. Forward-only; additive.

BEGIN;

ALTER TABLE gigalibs_connectors.tenant_connections
    ADD COLUMN IF NOT EXISTS webhook_endpoint_id UUID;

UPDATE gigalibs_connectors.tenant_connections
   SET webhook_endpoint_id = gen_random_uuid()
 WHERE webhook_endpoint_id IS NULL;

ALTER TABLE gigalibs_connectors.tenant_connections
    ALTER COLUMN webhook_endpoint_id SET DEFAULT gen_random_uuid(),
    ALTER COLUMN webhook_endpoint_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_connections_webhook_endpoint
    ON gigalibs_connectors.tenant_connections (webhook_endpoint_id);

CREATE FUNCTION gigalibs_connectors.resolve_webhook_endpoint(p_endpoint_id uuid)
RETURNS TABLE (tenant_id varchar, connection_id varchar)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = gigalibs_connectors, pg_temp
AS $$
  SELECT c.tenant_id, c.id
    FROM gigalibs_connectors.tenant_connections c
   WHERE c.webhook_endpoint_id = p_endpoint_id
$$;

REVOKE ALL ON FUNCTION gigalibs_connectors.resolve_webhook_endpoint(uuid) FROM PUBLIC;

INSERT INTO gigalibs_connectors.schema_migrations (version, name, applied_at)
VALUES (9, '000009_inbound_webhook_endpoints', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
