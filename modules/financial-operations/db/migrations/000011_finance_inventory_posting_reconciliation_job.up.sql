-- WI-OI-120fu (F2.6): Tenant list for the daily Inventory receipt posting reconciliation sweep (ADR-0033 D3).
CREATE OR REPLACE FUNCTION gigalibs_finance.list_inventory_receipt_posting_reconciliation_tenants(
  p_consumer_name text,
  p_event_type text
)
RETURNS TABLE(tenant_id character varying)
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_finance, pg_temp
AS $$
  SELECT DISTINCT i.tenant_id
    FROM gigalibs_finance.inbox_receipts i
   WHERE i.consumer_name = p_consumer_name AND i.event_type = p_event_type
  UNION
  SELECT DISTINCT r.tenant_id
    FROM gigalibs_finance.subledger_posting_register r
   WHERE r.consumer_name = p_consumer_name AND r.event_type = p_event_type
$$;
