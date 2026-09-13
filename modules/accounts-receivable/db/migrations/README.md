# Forward migrations

Migrations are immutable after release and run in lexical order through a dedicated migration job. The
first migration creates only the standalone AR foundation. It does not read, alter, or adopt the legacy
platform `Invoice`, `PaymentTransaction`, or supplier/AP tables.

| Migration | Purpose | Status |
| --- | --- | --- |
| `000001_ar_foundation.up.sql` | Tenant mapping, billing identity/numbering, customers, drafts, immutable issued invoices, idempotency, audit, outbox, indexes and RLS | In implementation review; not deployed |
| `000002_ar_outbox_delivery.up.sql` | Leased claims, dead-letter state, index, and narrowly scoped cross-tenant outbox worker role | In implementation review; not deployed |

The release process must record the file checksum, PostgreSQL version, execution identity, start/end time,
and verification result. Released migrations are never edited; corrections use a new forward migration.
Worker login roles are provisioned separately, granted membership in `gigalibs_ar_outbox_worker`, and may
never be superuser or `BYPASSRLS`. Apply migrations in numeric order and follow `RECOVERY.md`.
