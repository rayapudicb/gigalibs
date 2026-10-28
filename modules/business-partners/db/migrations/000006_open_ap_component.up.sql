-- WI-OI-123 S6: OPEN_AP ledger component for vendor-side netting (bill feed consumes later).
BEGIN;

ALTER TABLE gigalibs_business_partners.credit_status
  DROP CONSTRAINT IF EXISTS credit_status_component_check;
ALTER TABLE gigalibs_business_partners.credit_status
  ADD CONSTRAINT credit_status_component_check
  CHECK (component IN ('OPEN_AR', 'UNINVOICED_ORDER', 'PREPAYMENT', 'OPEN_AP'));

ALTER TABLE gigalibs_business_partners.credit_feed_marks
  DROP CONSTRAINT IF EXISTS credit_feed_marks_component_check;
ALTER TABLE gigalibs_business_partners.credit_feed_marks
  ADD CONSTRAINT credit_feed_marks_component_check
  CHECK (component IN ('OPEN_AR', 'UNINVOICED_ORDER', 'PREPAYMENT', 'OPEN_AP'));

ALTER TABLE gigalibs_business_partners.credit_source_positions
  DROP CONSTRAINT IF EXISTS credit_source_positions_component_check;
ALTER TABLE gigalibs_business_partners.credit_source_positions
  ADD CONSTRAINT credit_source_positions_component_check
  CHECK (component IN ('OPEN_AR', 'UNINVOICED_ORDER', 'PREPAYMENT', 'OPEN_AP'));

INSERT INTO gigalibs_business_partners.schema_migrations (version, name)
VALUES (6, '000006_open_ap_component');
COMMIT;
