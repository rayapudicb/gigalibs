-- WI-OI-123: vendor bill OPEN_AP snapshots for Business Partner netting.
BEGIN;

CREATE TABLE gigalibs_procurement.credit_snapshot_positions (
  tenant_id varchar(64) NOT NULL,
  vendor_bill_id uuid NOT NULL REFERENCES gigalibs_procurement.vendor_bills (id),
  source_version integer NOT NULL DEFAULT 0 CHECK (source_version >= 0),
  balance_minor bigint NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, vendor_bill_id)
);

CREATE TABLE gigalibs_procurement.credit_outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  event_type varchar(128) NOT NULL DEFAULT 'procurement.credit.vendor-bill-balance.v1',
  aggregate_type varchar(32) NOT NULL DEFAULT 'vendor_bill',
  aggregate_id uuid NOT NULL,
  aggregate_version integer NOT NULL CHECK (aggregate_version > 0),
  correlation_id varchar(128) NOT NULL,
  causation_id varchar(128),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status varchar(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'LEASED', 'PUBLISHED', 'FAILED')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  last_error_code varchar(128),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, aggregate_id, aggregate_version),
  CHECK (event_type = 'procurement.credit.vendor-bill-balance.v1' AND aggregate_type = 'vendor_bill')
);
CREATE INDEX procurement_credit_outbox_pending ON gigalibs_procurement.credit_outbox_events (status, available_at, created_at);

ALTER TABLE gigalibs_procurement.credit_snapshot_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_procurement.credit_snapshot_positions FORCE ROW LEVEL SECURITY;
CREATE POLICY procurement_credit_snapshot_positions_tenant ON gigalibs_procurement.credit_snapshot_positions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_procurement.credit_outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_procurement.credit_outbox_events FORCE ROW LEVEL SECURITY;
CREATE POLICY procurement_credit_outbox_events_tenant ON gigalibs_procurement.credit_outbox_events
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

CREATE FUNCTION gigalibs_procurement.queue_credit_vendor_bill_open_balance(
  p_tenant_id varchar, p_vendor_bill_id uuid, p_causation_id text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_bill gigalibs_procurement.vendor_bills%ROWTYPE;
  v_org_unit varchar(64);
  v_balance bigint;
  v_version integer;
BEGIN
  SELECT * INTO v_bill FROM gigalibs_procurement.vendor_bills
    WHERE tenant_id = p_tenant_id AND id = p_vendor_bill_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT po.org_unit_id INTO v_org_unit FROM gigalibs_procurement.purchase_orders po
    WHERE po.tenant_id = p_tenant_id AND po.id = v_bill.purchase_order_id;
  IF v_org_unit IS NULL OR btrim(v_org_unit) = '' THEN RETURN; END IF;
  IF v_bill.status = 'APPROVED' THEN
    v_balance := v_bill.total_amount_minor::bigint;
  ELSE
    v_balance := 0;
  END IF;
  INSERT INTO gigalibs_procurement.credit_snapshot_positions (tenant_id, vendor_bill_id)
    VALUES (p_tenant_id, p_vendor_bill_id) ON CONFLICT DO NOTHING;
  UPDATE gigalibs_procurement.credit_snapshot_positions
    SET source_version = source_version + 1, balance_minor = v_balance, updated_at = now()
    WHERE tenant_id = p_tenant_id AND vendor_bill_id = p_vendor_bill_id
    RETURNING source_version INTO v_version;
  INSERT INTO gigalibs_procurement.credit_outbox_events
    (tenant_id, aggregate_id, aggregate_version, correlation_id, causation_id, payload)
  VALUES (p_tenant_id, p_vendor_bill_id, v_version, p_causation_id, p_causation_id,
    jsonb_build_object('vendorBillId', p_vendor_bill_id, 'vendorPartyId', v_bill.vendor_party_id,
      'orgUnitId', v_org_unit, 'currencyCode', v_bill.currency_code,
      'openAmountMinor', v_balance::text, 'sourceVersion', v_version));
END;
$$;

CREATE FUNCTION gigalibs_procurement.queue_credit_after_vendor_bill_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  PERFORM gigalibs_procurement.queue_credit_vendor_bill_open_balance(NEW.tenant_id, NEW.id, NEW.id::text);
  RETURN NEW;
END;
$$;
CREATE TRIGGER vendor_bill_credit_balance_queued
  AFTER INSERT OR UPDATE OF status, total_amount_minor ON gigalibs_procurement.vendor_bills
  FOR EACH ROW EXECUTE FUNCTION gigalibs_procurement.queue_credit_after_vendor_bill_change();

CREATE FUNCTION gigalibs_procurement.relay_lease_credit_vendor_bills(p_limit integer, p_lease_seconds integer)
RETURNS SETOF gigalibs_procurement.credit_outbox_events
LANGUAGE sql SECURITY DEFINER SET search_path = gigalibs_procurement, pg_temp AS $$
  UPDATE gigalibs_procurement.credit_outbox_events o
    SET status = 'LEASED',
        available_at = now() + make_interval(secs => GREATEST(LEAST(p_lease_seconds, 300), 5)),
        attempt_count = o.attempt_count + 1
  WHERE o.id IN (
    SELECT e.id FROM gigalibs_procurement.credit_outbox_events e
    WHERE (e.status = 'PENDING' OR (e.status = 'LEASED' AND e.available_at <= now()))
      AND e.available_at <= now()
      AND NOT EXISTS (
        SELECT 1 FROM gigalibs_procurement.credit_outbox_events earlier
        WHERE earlier.tenant_id = e.tenant_id AND earlier.aggregate_id = e.aggregate_id
          AND earlier.aggregate_version < e.aggregate_version AND earlier.status <> 'PUBLISHED')
    ORDER BY e.created_at, e.id LIMIT GREATEST(LEAST(p_limit, 100), 1)
    FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

CREATE FUNCTION gigalibs_procurement.relay_settle_credit_vendor_bill(
  p_id uuid, p_published boolean, p_error_code text, p_retry_seconds integer, p_max_attempts integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = gigalibs_procurement, pg_temp AS $$
  UPDATE gigalibs_procurement.credit_outbox_events
  SET status = CASE WHEN p_published THEN 'PUBLISHED'
                    WHEN p_retry_seconds IS NULL OR attempt_count >= p_max_attempts THEN 'FAILED'
                    ELSE 'PENDING' END,
      published_at = CASE WHEN p_published THEN now() ELSE published_at END,
      available_at = CASE WHEN p_published OR p_retry_seconds IS NULL THEN available_at
                          ELSE now() + make_interval(secs => LEAST(GREATEST(p_retry_seconds, 1), 900)) END,
      last_error_code = CASE WHEN p_published THEN NULL ELSE left(p_error_code, 128) END
  WHERE id = p_id
$$;

REVOKE ALL ON FUNCTION gigalibs_procurement.relay_lease_credit_vendor_bills(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION gigalibs_procurement.relay_settle_credit_vendor_bill(uuid, boolean, text, integer, integer) FROM PUBLIC;

INSERT INTO gigalibs_procurement.schema_migrations (version, name)
VALUES (5, '000005_procurement_vendor_bill_credit_relay')
ON CONFLICT (version) DO NOTHING;

COMMIT;
