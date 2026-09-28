# Saga, governor and tenant column-alignment recovery

Work item: WI-OI-039 containment and clean-migration prerequisite

## Reason

Migration `20260914000000_add_saga_governor_parenttenant` created snake_case physical columns while the
canonical Prisma schema and generated client expect camelCase physical names. Prisma therefore selected a
missing `tenants.parentTenantId` column during ordinary tenant operations. The same mismatch affected every
Saga and Governor field introduced by that migration.

This forward migration renames the existing columns, foreign-key constraints and indexes. It does not copy,
coerce or delete row values. Saga and Governor remain runtime-contained and receive no release authority
from this repair.

## Compatibility and rollout

- Apply this migration before starting any application artifact generated from the current Prisma schema.
- The migration takes PostgreSQL metadata locks while each rename executes. Run it through the deployment
  migration job with the normal lock/statement timeout and halt criteria.
- No previously released GigaLibs artifact owns these Saga, Governor or tenant-hierarchy fields. Any
  prototype that directly queried the predecessor's snake_case columns is incompatible and must remain
  quarantined.
- Verify the pre/post row counts for `tenants`, `saga_instances`, `saga_steps` and `tenant_rate_buckets`.
  Verify parent, Saga-step and rate-bucket foreign keys and run `prisma migrate diff` against the canonical
  datamodel.
- Deploy the compatible application only after the migration succeeds. Do not serve mixed schema
  expectations from replicas.

## Recovery

There is no approved destructive down migration. Before applying in a persistent environment, take and
verify a same-major backup. If the migration fails before the application starts, restore that backup into
an isolated database or correct the failed rename with a reviewed forward migration. After the new
application has started, roll forward; do not rename populated fields back because that would make the
canonical client unusable and could disconnect newly written hierarchy/Saga/Governor data.
