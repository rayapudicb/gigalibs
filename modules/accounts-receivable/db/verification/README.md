# Database verification

`000001_ar_foundation.verify.sql` performs non-mutating catalogue checks after the migration.
`000001_ar_foundation.integration.sql` creates visibly attributed certification records inside a rolled
back transaction to prove the first tenant-RLS, cross-tenant-write denial, relationship, and immutable
issued-invoice controls.

After applying `000002`, run `000002_ar_outbox_delivery.verify.sql` and its integration script. They prove
that a non-superuser, non-`BYPASSRLS` member can claim outbox events across tenants but has no customer-table
access. All test data and the temporary test role are rolled back.

G5 must additionally run duplicate, concurrent numbering/allocation, supported upgrade, backup/restore,
and roll-forward tests against supported PostgreSQL—not an in-memory substitute.
