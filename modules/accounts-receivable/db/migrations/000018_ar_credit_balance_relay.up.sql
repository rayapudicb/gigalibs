-- WI-OI-123 S4. New invoice and settlement transactions queue ordered credit snapshots.
-- Historical invoices without an owner or canonical Party are deliberately not backfilled here.
BEGIN;

CREATE TABLE gigalibs_ar.credit_snapshot_positions (
  tenant_id uuid NOT NULL REFERENCES gigalibs_ar.module_tenants(id),
  invoice_id uuid NOT NULL,
  source_version integer NOT NULL DEFAULT 0 CHECK (source_version >= 0),
  balance_minor bigint NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, invoice_id),
  FOREIGN KEY (tenant_id, invoice_id) REFERENCES gigalibs_ar.invoices(tenant_id, id)
);

CREATE TABLE gigalibs_ar.credit_outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES gigalibs_ar.module_tenants(id),
  event_type varchar(128) NOT NULL DEFAULT 'ar.credit.invoice-balance.v1',
  aggregate_type varchar(32) NOT NULL DEFAULT 'invoice',
  aggregate_id uuid NOT NULL,
  aggregate_version integer NOT NULL CHECK (aggregate_version > 0),
  correlation_id varchar(128) NOT NULL,
  causation_id varchar(128),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'LEASED', 'PUBLISHED', 'FAILED')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  last_error_code varchar(128),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, aggregate_id, aggregate_version),
  CHECK (event_type = 'ar.credit.invoice-balance.v1' AND aggregate_type = 'invoice')
);
CREATE INDEX credit_outbox_pending ON gigalibs_ar.credit_outbox_events(status, available_at, created_at);

ALTER TABLE gigalibs_ar.credit_snapshot_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.credit_snapshot_positions FORCE ROW LEVEL SECURITY;
CREATE POLICY credit_snapshot_positions_tenant ON gigalibs_ar.credit_snapshot_positions
  USING (tenant_id::text = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.tenant_id', true), ''));
ALTER TABLE gigalibs_ar.credit_outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.credit_outbox_events FORCE ROW LEVEL SECURITY;
CREATE POLICY credit_outbox_events_tenant ON gigalibs_ar.credit_outbox_events
  USING (tenant_id::text = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id::text = NULLIF(current_setting('app.tenant_id', true), ''));

CREATE FUNCTION gigalibs_ar.queue_credit_invoice_balance(
  p_tenant_id uuid, p_invoice_id uuid, p_causation_id text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_invoice gigalibs_ar.invoices%ROWTYPE;
  v_party text;
  v_paid bigint;
  v_voided boolean;
  v_balance bigint;
  v_version integer;
BEGIN
  -- NO KEY UPDATE serializes concurrent settlements without conflicting with their FK KEY SHARE locks.
  SELECT * INTO v_invoice FROM gigalibs_ar.invoices
    WHERE tenant_id = p_tenant_id AND id = p_invoice_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice % is missing', p_invoice_id; END IF;
  v_party := v_invoice.buyer_snapshot->>'externalReference';
  IF v_invoice.org_unit_id IS NULL OR v_party IS NULL OR
     v_party !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN; -- historical unmapped invoice: credit approval remains closed until reconciliation
  END IF;
  SELECT amount_paid_minor, is_voided INTO v_paid, v_voided
    FROM gigalibs_ar.invoice_balance(p_tenant_id, p_invoice_id);
  v_balance := CASE WHEN v_voided THEN 0 ELSE GREATEST(v_invoice.total_minor - v_paid, 0) END;
  INSERT INTO gigalibs_ar.credit_snapshot_positions (tenant_id, invoice_id)
    VALUES (p_tenant_id, p_invoice_id) ON CONFLICT DO NOTHING;
  UPDATE gigalibs_ar.credit_snapshot_positions
    SET source_version = source_version + 1, balance_minor = v_balance, updated_at = now()
    WHERE tenant_id = p_tenant_id AND invoice_id = p_invoice_id
    RETURNING source_version INTO v_version;
  INSERT INTO gigalibs_ar.credit_outbox_events
    (tenant_id, aggregate_id, aggregate_version, correlation_id, causation_id, payload)
  VALUES (p_tenant_id, p_invoice_id, v_version, p_causation_id, p_causation_id,
    jsonb_build_object('invoiceId', p_invoice_id, 'customerPartyId', v_party,
      'orgUnitId', v_invoice.org_unit_id, 'currencyCode', v_invoice.currency,
      'openAmountMinor', v_balance::text, 'sourceVersion', v_version));
END;
$$;

CREATE FUNCTION gigalibs_ar.queue_credit_after_invoice_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  PERFORM gigalibs_ar.queue_credit_invoice_balance(NEW.tenant_id, NEW.id, NEW.id::text);
  RETURN NEW;
END;
$$;
CREATE TRIGGER invoice_credit_balance_queued AFTER INSERT ON gigalibs_ar.invoices
  FOR EACH ROW EXECUTE FUNCTION gigalibs_ar.queue_credit_after_invoice_insert();

CREATE FUNCTION gigalibs_ar.queue_credit_after_settlement_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  PERFORM gigalibs_ar.queue_credit_invoice_balance(NEW.tenant_id, NEW.invoice_id, NEW.id::text);
  RETURN NEW;
END;
$$;
CREATE TRIGGER payment_credit_balance_queued AFTER INSERT ON gigalibs_ar.payment_records
  FOR EACH ROW EXECUTE FUNCTION gigalibs_ar.queue_credit_after_settlement_insert();
CREATE TRIGGER void_credit_balance_queued AFTER INSERT ON gigalibs_ar.void_records
  FOR EACH ROW EXECUTE FUNCTION gigalibs_ar.queue_credit_after_settlement_insert();

CREATE FUNCTION gigalibs_ar.relay_lease_credit_balances(p_limit integer, p_lease_seconds integer)
RETURNS SETOF gigalibs_ar.credit_outbox_events
LANGUAGE sql SECURITY DEFINER SET search_path = gigalibs_ar, pg_temp AS $$
  UPDATE gigalibs_ar.credit_outbox_events o
    SET status = 'LEASED',
        available_at = now() + make_interval(secs => GREATEST(LEAST(p_lease_seconds, 300), 5)),
        attempt_count = o.attempt_count + 1
  WHERE o.id IN (
    SELECT e.id FROM gigalibs_ar.credit_outbox_events e
    WHERE (e.status = 'PENDING' OR (e.status = 'LEASED' AND e.available_at <= now()))
      AND e.available_at <= now()
      AND NOT EXISTS (
        SELECT 1 FROM gigalibs_ar.credit_outbox_events earlier
        WHERE earlier.tenant_id = e.tenant_id AND earlier.aggregate_id = e.aggregate_id
          AND earlier.aggregate_version < e.aggregate_version AND earlier.status <> 'PUBLISHED')
    ORDER BY e.created_at, e.id LIMIT GREATEST(LEAST(p_limit, 100), 1)
    FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

CREATE FUNCTION gigalibs_ar.relay_settle_credit_balance(
  p_id uuid, p_published boolean, p_error_code text, p_retry_seconds integer, p_max_attempts integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = gigalibs_ar, pg_temp AS $$
  UPDATE gigalibs_ar.credit_outbox_events
  SET status = CASE WHEN p_published THEN 'PUBLISHED'
                    WHEN p_retry_seconds IS NULL OR attempt_count >= p_max_attempts THEN 'FAILED'
                    ELSE 'PENDING' END,
      published_at = CASE WHEN p_published THEN now() ELSE published_at END,
      available_at = CASE WHEN p_published OR p_retry_seconds IS NULL THEN available_at
                          ELSE now() + make_interval(secs => LEAST(GREATEST(p_retry_seconds, 1), 900)) END,
      last_error_code = CASE WHEN p_published THEN NULL ELSE left(p_error_code, 128) END
  WHERE id = p_id
$$;

REVOKE ALL ON FUNCTION gigalibs_ar.relay_lease_credit_balances(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION gigalibs_ar.relay_settle_credit_balance(uuid, boolean, text, integer, integer) FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON gigalibs_ar.credit_snapshot_positions TO gigalibs_ar_api_runtime;
GRANT SELECT, INSERT ON gigalibs_ar.credit_outbox_events TO gigalibs_ar_api_runtime;
GRANT EXECUTE ON FUNCTION gigalibs_ar.relay_lease_credit_balances(integer, integer) TO gigalibs_ar_api_runtime;
GRANT EXECUTE ON FUNCTION gigalibs_ar.relay_settle_credit_balance(uuid, boolean, text, integer, integer) TO gigalibs_ar_api_runtime;

INSERT INTO gigalibs_ar.schema_migrations(version, name) VALUES (18, '000018_ar_credit_balance_relay');
COMMIT;
