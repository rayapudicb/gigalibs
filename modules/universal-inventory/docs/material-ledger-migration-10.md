# Material Ledger migration 10: verification and recovery

WI-OI-124 adds exact reservation allocations, immutable cost records and organization valuation settings. The migration is additive. It locks reservation and balance tables while it maps legacy active reservations whose entire demand group reconciles to one reserved balance row. Ambiguous locator, lot or quantity mappings remain unmapped; issue and release refuse them with a reconciliation error.

## Before applying

Take the normal database backup and record migration version 9, the count of active reservations, and the count and total of reserved balances by tenant, warehouse, product and unit. Quiesce writers for this module for the migration window. Verify every warehouse has a reviewed owning organization or an explicit shared classification; migration 10 does not infer owners.

Migration 10 also adds a nullable Finance cost-profile reference to existing organization valuation settings. Before completing new receipts, an inventory controller must map each operating organization to an active Finance cost profile with the same method. Inventory refuses receipt completion without this mapping. Finance rejects signed legacy receipt facts that lack an organization/profile snapshot. After correcting the mapping, the receipt's **Retry Finance posting** action emits a new signed fact for rejection codes that occur before any posting (`FINANCE_PERIOD_LOCKED`, `FINANCE_COST_PROFILE_MISSING`, `FINANCE_ORG_COST_PROFILE_MISSING`, `FINANCE_COST_METHOD_MISMATCH`). Other rejection codes require manual reconciliation. Never silently choose the tenant-wide Finance default for an organization-owned receipt.

## After applying

Run these read-only checks against the Inventory database with the deployment's approved access path:

```sql
SELECT version, name FROM gigalibs_inventory.schema_migrations WHERE version = 10;

SELECT r.tenant_id, r.id AS reservation_id, r.warehouse_id, r.product_id,
       r.location_id, r.quantity - r.fulfilled_quantity AS outstanding_quantity
  FROM gigalibs_inventory.inventory_reservations r
 WHERE r.status = 'ACTIVE' AND r.quantity > r.fulfilled_quantity
   AND NOT EXISTS (
     SELECT 1 FROM gigalibs_inventory.inventory_reservation_allocations a
      WHERE a.tenant_id = r.tenant_id AND a.reservation_id = r.id
   );

SELECT r.tenant_id, r.id AS reservation_id,
       r.quantity - r.fulfilled_quantity AS outstanding_quantity,
       COALESCE(SUM(a.allocated_quantity - a.fulfilled_quantity - a.released_quantity), 0) AS allocated_remaining
  FROM gigalibs_inventory.inventory_reservations r
  LEFT JOIN gigalibs_inventory.inventory_reservation_allocations a
    ON a.tenant_id = r.tenant_id AND a.reservation_id = r.id
 WHERE r.status = 'ACTIVE' AND r.quantity > r.fulfilled_quantity
 GROUP BY r.tenant_id, r.id, r.quantity, r.fulfilled_quantity
HAVING r.quantity - r.fulfilled_quantity <> COALESCE(SUM(a.allocated_quantity - a.fulfilled_quantity - a.released_quantity), 0);

SELECT r.tenant_id, r.id AS receipt_id, r.finance_posting_status,
       COUNT(rl.id) FILTER (WHERE rl.received_quantity > 0) AS receipt_lines,
       COUNT(c.receipt_line_id) AS cost_lines
  FROM gigalibs_inventory.receipts r
  JOIN gigalibs_inventory.receipt_lines rl ON rl.tenant_id = r.tenant_id AND rl.receipt_id = r.id
  LEFT JOIN gigalibs_inventory.inventory_receipt_cost_records c
    ON c.tenant_id = rl.tenant_id AND c.receipt_line_id = rl.id
 WHERE r.status = 'COMPLETED' AND r.finance_posting_status = 'POSTED'
 GROUP BY r.tenant_id, r.id, r.finance_posting_status
HAVING COUNT(rl.id) FILTER (WHERE rl.received_quantity > 0) <> COUNT(c.receipt_line_id);
```

The first two queries must be reviewed before normal issue and release work resumes. The third finds older Finance posting outcomes that did not carry cost lines and any relay gaps. A zero result from these queries is required for an unqualified migration proof. Preserve the results as release evidence.

## Roll forward

For an unmapped active reservation, reconstruct the exact balance rows and quantities from the immutable stock ledger, reservation audit/outbox history and physical count. Have an independent inventory controller approve the mapping. Apply an additive repair migration that inserts allocation rows in one transaction while locking the reservation and candidate balances, checking the sum of outstanding allocations against each balance's reserved quantity. Refuse any record whose source proof is incomplete. Retry the original issue or release command with its original idempotency key.

For a posted receipt missing cost records, reconcile the Inventory receipt lines to the Finance cost layers and journal register. Replay or publish a signed Finance posting outcome with the complete authoritative cost-line set. Do not synthesize costs from Inventory's movement mirror.

Do not run the destructive down migration on customer data. Stop writes and restore from the approved backup only if migration 10 fails before commit; after commit, repair forward and keep the immutable ledger and Finance posting history intact.
