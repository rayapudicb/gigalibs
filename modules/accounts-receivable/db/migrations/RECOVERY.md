# AR migration recovery

Migrations are forward-only. Never remove an applied AR column, policy, or constraint during an incident.

For `000001`, restore PostgreSQL from the deployment snapshot or point the application back to the
pre-migration database. No production application version exists before this foundation migration.

For `000002`, stop all AR outbox workers first. If delivery must be disabled, revoke the
`gigalibs_ar_outbox_worker` membership from worker login roles; this preserves pending events and all
business data. Correct schema or policy defects with a new forward migration. After recovery, reconcile
each event by its immutable event ID before restarting delivery because a worker crash can cause an
at-least-once duplicate.

Every environment must take and validate a recoverable snapshot before migration. The release owner must
record migration start/end time, schema version, row counts, lock duration, verification output, and the
reconciliation decision in release evidence.
