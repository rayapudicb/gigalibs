-- WI-OI-123: ordered uninvoiced sales-order snapshots for Business Partner credit exposure.
BEGIN;

CREATE TABLE gigalibs_orders.credit_snapshot_positions (
  tenant_id varchar(64) NOT NULL,
  order_id uuid NOT NULL,
  source_version integer NOT NULL DEFAULT 0 CHECK (source_version >= 0),
  balance_minor bigint NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, order_id),
  FOREIGN KEY (order_id) REFERENCES gigalibs_orders.sales_orders (id)
);

CREATE TABLE gigalibs_orders.credit_outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  event_type varchar(128) NOT NULL DEFAULT 'orders.credit.uninvoiced-balance.v1',
  aggregate_type varchar(32) NOT NULL DEFAULT 'sales_order',
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
  CHECK (event_type = 'orders.credit.uninvoiced-balance.v1' AND aggregate_type = 'sales_order')
);
CREATE INDEX orders_credit_outbox_pending ON gigalibs_orders.credit_outbox_events (status, available_at, created_at);

ALTER TABLE gigalibs_orders.credit_snapshot_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_orders.credit_snapshot_positions FORCE ROW LEVEL SECURITY;
CREATE POLICY orders_credit_snapshot_positions_tenant ON gigalibs_orders.credit_snapshot_positions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_orders.credit_outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_orders.credit_outbox_events FORCE ROW LEVEL SECURITY;
CREATE POLICY orders_credit_outbox_events_tenant ON gigalibs_orders.credit_outbox_events
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

CREATE FUNCTION gigalibs_orders.compute_order_uninvoiced_minor(p_tenant_id varchar, p_order_id uuid)
RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(
    CASE
      WHEN l.ordered_quantity <= 0 THEN 0
      WHEN l.invoiced_quantity >= l.ordered_quantity THEN 0
      ELSE (
        (l.line_total_minor * GREATEST(l.ordered_quantity - l.invoiced_quantity, 0) / l.ordered_quantity)
      )::bigint
    END
  ), 0)::bigint
  FROM gigalibs_orders.sales_order_lines l
  WHERE l.tenant_id = p_tenant_id AND l.order_id = p_order_id
$$;

CREATE FUNCTION gigalibs_orders.queue_credit_uninvoiced_balance(
  p_tenant_id varchar, p_order_id uuid, p_causation_id text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_order gigalibs_orders.sales_orders%ROWTYPE;
  v_balance bigint;
  v_version integer;
BEGIN
  SELECT * INTO v_order FROM gigalibs_orders.sales_orders
    WHERE tenant_id = p_tenant_id AND id = p_order_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_order.status NOT IN ('CONFIRMED', 'ALLOCATED', 'PARTIALLY_SHIPPED', 'SHIPPED', 'PARTIALLY_INVOICED') THEN
    v_balance := 0;
  ELSE
    v_balance := gigalibs_orders.compute_order_uninvoiced_minor(p_tenant_id, p_order_id);
  END IF;
  INSERT INTO gigalibs_orders.credit_snapshot_positions (tenant_id, order_id)
    VALUES (p_tenant_id, p_order_id) ON CONFLICT DO NOTHING;
  UPDATE gigalibs_orders.credit_snapshot_positions
    SET source_version = source_version + 1, balance_minor = v_balance, updated_at = now()
    WHERE tenant_id = p_tenant_id AND order_id = p_order_id
    RETURNING source_version INTO v_version;
  INSERT INTO gigalibs_orders.credit_outbox_events
    (tenant_id, aggregate_id, aggregate_version, correlation_id, causation_id, payload)
  VALUES (p_tenant_id, p_order_id, v_version, p_causation_id, p_causation_id,
    jsonb_build_object('orderId', p_order_id, 'customerPartyId', v_order.customer_party_id,
      'orgUnitId', v_order.org_unit_id, 'currencyCode', v_order.currency_code,
      'uninvoicedAmountMinor', v_balance::text, 'sourceVersion', v_version));
END;
$$;

CREATE FUNCTION gigalibs_orders.queue_credit_after_order_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  PERFORM gigalibs_orders.queue_credit_uninvoiced_balance(NEW.tenant_id, NEW.id, NEW.id::text);
  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_order_credit_balance_queued
  AFTER INSERT OR UPDATE OF status, total_amount_minor ON gigalibs_orders.sales_orders
  FOR EACH ROW EXECUTE FUNCTION gigalibs_orders.queue_credit_after_order_change();

CREATE FUNCTION gigalibs_orders.queue_credit_after_order_line_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  PERFORM gigalibs_orders.queue_credit_uninvoiced_balance(NEW.tenant_id, NEW.order_id, NEW.id::text);
  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_order_line_credit_balance_queued
  AFTER INSERT OR UPDATE OF invoiced_quantity, line_total_minor, ordered_quantity
  ON gigalibs_orders.sales_order_lines
  FOR EACH ROW EXECUTE FUNCTION gigalibs_orders.queue_credit_after_order_line_change();

CREATE FUNCTION gigalibs_orders.relay_lease_credit_uninvoiced(p_limit integer, p_lease_seconds integer)
RETURNS SETOF gigalibs_orders.credit_outbox_events
LANGUAGE sql SECURITY DEFINER SET search_path = gigalibs_orders, pg_temp AS $$
  UPDATE gigalibs_orders.credit_outbox_events o
    SET status = 'LEASED',
        available_at = now() + make_interval(secs => GREATEST(LEAST(p_lease_seconds, 300), 5)),
        attempt_count = o.attempt_count + 1
  WHERE o.id IN (
    SELECT e.id FROM gigalibs_orders.credit_outbox_events e
    WHERE (e.status = 'PENDING' OR (e.status = 'LEASED' AND e.available_at <= now()))
      AND e.available_at <= now()
      AND NOT EXISTS (
        SELECT 1 FROM gigalibs_orders.credit_outbox_events earlier
        WHERE earlier.tenant_id = e.tenant_id AND earlier.aggregate_id = e.aggregate_id
          AND earlier.aggregate_version < e.aggregate_version AND earlier.status <> 'PUBLISHED')
    ORDER BY e.created_at, e.id LIMIT GREATEST(LEAST(p_limit, 100), 1)
    FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

CREATE FUNCTION gigalibs_orders.relay_settle_credit_uninvoiced(
  p_id uuid, p_published boolean, p_error_code text, p_retry_seconds integer, p_max_attempts integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = gigalibs_orders, pg_temp AS $$
  UPDATE gigalibs_orders.credit_outbox_events
  SET status = CASE WHEN p_published THEN 'PUBLISHED'
                    WHEN p_retry_seconds IS NULL OR attempt_count >= p_max_attempts THEN 'FAILED'
                    ELSE 'PENDING' END,
      published_at = CASE WHEN p_published THEN now() ELSE published_at END,
      available_at = CASE WHEN p_published OR p_retry_seconds IS NULL THEN available_at
                          ELSE now() + make_interval(secs => LEAST(GREATEST(p_retry_seconds, 1), 900)) END,
      last_error_code = CASE WHEN p_published THEN NULL ELSE left(p_error_code, 128) END
  WHERE id = p_id
$$;

REVOKE ALL ON FUNCTION gigalibs_orders.relay_lease_credit_uninvoiced(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION gigalibs_orders.relay_settle_credit_uninvoiced(uuid, boolean, text, integer, integer) FROM PUBLIC;

INSERT INTO gigalibs_orders.schema_migrations (version) VALUES (6);
COMMIT;
