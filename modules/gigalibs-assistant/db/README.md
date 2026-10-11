# Assistant private-data migration boundary (WI-OI-121g)

`000001_assistant_private_threads.up.sql` is additive. It creates only the
`gigalibs_assistant` schema and does not read, copy, change or delete legacy
`ChatChannel` data, tenant entitlements, or member grants. It has not been
applied to UAT. The API and migration are source-only until the module is
registered in an independently reviewed runtime and release profile.

## Compatibility and access

- Existing preview routes remain separate and fictional. They do not read these
  tables. Older application images ignore the new schema.
- Use a dedicated non-superuser, non-`BYPASSRLS` runtime role, distinct from
  the migration owner. Grant it schema usage and only the table operations the
  reviewed service needs. It must not be able to change `tenant_policies`, the
  migration ledger or database policies. Never run the HTTP service as the
  migration/superuser role.
- The Configuration Studio publisher is the only intended writer of reviewed
  tenant policy versions. No publisher or published customer policy is in this
  slice. Without one, private-history requests return unavailable; do not seed
  a permissive default. The isolated proof inserts synthetic policies only in
  its disposable database.
- RLS requires transaction-local tenant and actor settings on the same
  connection. A shared runtime role without this binding is not acceptable.
  History and audit access must receive independent Security/Privacy review.

## Forward verification and recovery

The isolated `apps/api/scripts/real-database-proof.mjs` creates its own
PostgreSQL 16 container, applies migration 1, verifies the ledger and forced
RLS, then tests signed direct-port HTTP, cross-tenant and cross-user denial,
revocation, idempotency, conflicts and service restart. It does not certify a
Next/BFF or deployed journey. A future release must additionally prove both a
clean install and an upgrade from the exact previous artifact, with migration
checksums, role grants, backup/restore, and a documented rollback/roll-forward
decision. Do not delete this schema as a routine rollback after customer data
exists; revert application routing and roll forward with a reviewed corrective
migration. Restore requires a tested backup that includes this schema and its
policy/audit data.

Thread reads now deny after the earlier of the thread's recorded `expires_at`
and the current published policy's retention window measured from creation;
new writes also refuse an old policy version/checksum. These are application
read/write boundaries, **not physical deletion**. Before any real customer conversation, Privacy must
approve retention/hold/export/deletion rules and an observable purge job for
threads, messages, runs and audit events. Legacy chat ownership and retention
are unproven and need a separate exact-target disposition; this migration
intentionally does not backfill them.
