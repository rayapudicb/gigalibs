# AR migration recovery

Migrations are forward-only. Never remove an applied AR column, policy, or constraint during an incident.

For `000001`, restore PostgreSQL from the deployment snapshot or point the application back to the
pre-migration database. No production application version exists before this foundation migration.

For `000002`, stop all AR outbox workers first. If delivery must be disabled, revoke the
`gigalibs_ar_outbox_worker` membership from worker login roles; this preserves pending events and all
business data. Correct schema or policy defects with a new forward migration. After recovery, reconcile
each event by its immutable event ID before restarting delivery because a worker crash can cause an
at-least-once duplicate.

For `000018`, pause `ArCreditBalanceRelay` if credit snapshots cannot be delivered safely. Keep
`credit_outbox_events` and `credit_snapshot_positions` intact; the Business Partner inbox rejects
out-of-order versions and duplicate bodies. Correct the defect with a forward migration, then replay
each pending or failed invoice version in order and compare the final AR balance with the Business
Partner source position. Historical invoices with no organization or canonical Party need an explicit
reconciliation and backfill before any credit approval can rely on AR exposure. Do not treat an idle
relay or a zero-row backfill as evidence that historical balances were reconciled.

Every environment must take and validate a recoverable snapshot before migration. The release owner must
record migration start/end time, schema version, row counts, lock duration, verification output, and the
reconciliation decision in release evidence.
