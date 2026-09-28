# WI-OI-047 exact-image migration verification and Department schema drift

Date: 2026-09-24

Status: resolved by bounded WI-OI-042 replacement certification; historical diagnostic retained

## Superseding disposition — 2026-09-24

The Product Owner/Solution Architecture reviewer subsequently authorized the bounded WI-OI-042
canonical-schema correction. `Department.updatedAt` now declares
`@default(now()) @updatedAt @db.Timestamptz(3)`, which matches the intentional
`DEFAULT CURRENT_TIMESTAMP` contract already deployed by migration 36. No applied migration was edited
and the live application database was not targeted.

The source-state-bound replacement migrations image replayed all 37 migrations on an empty PostgreSQL 16
database, upgraded representative 35-migration state, preserved that state, reran idempotently, enforced
the tenant-safe Department relationship and produced no physical-schema diff on either path. The exact
result is
[`2026-09-24-wi-oi-042-exact-migration-image-result.json`](2026-09-24-wi-oi-042-exact-migration-image-result.json);
the complete bounded closure is
[`2026-09-24-wi-oi-042-department-remediation-closure.md`](2026-09-24-wi-oi-042-department-remediation-closure.md).

The sections below preserve the original detection and routing record. They are superseded for current
gate evaluation but remain valid historical evidence of why WI-OI-042 was returned to Build.

## Scope and authority

At the time of detection, the Product Owner directed the next controlled Backend/Data verification after
the WI-OI-047 pre-review.
The verifier created only uniquely prefixed disposable databases on the existing local PostgreSQL 16
container, ran the exact migrations image, and removed every disposable database and temporary migration
directory. It did not modify the live `gigalibs` database or product code.

Exact image:
`sha256:0ef0a1e9bbfc6d5294c9856c4252bf876967aac74cd5e47415c4c30246636e48`.

Authoritative diagnostic result:
`docs/audits/2026-09-24-wi-oi-047-exact-migration-image-result-v4.json`, SHA-256
`a99a64c5f4f52065c29f8cc77af9d624c42c47b768645564a011352abffb91dc`.

Earlier harness attempts are retained rather than overwritten:

- `exact-migration-image-result.json` — workspace-aware Prisma invocation failed closed; SHA-256
  `1a3e5b511e370a405fc76356fbb0562175b1f547c24cd02c832554ef495f92e8`;
- `exact-migration-image-result-v2.json` — relative schema-path resolution failed closed; SHA-256
  `acab508f0da0b484e3020b5110cf2dc1aed3e6002da56dc9cd67ed4f8cb652f7`; and
- `exact-migration-image-result-v3.json` — first exact detection of the same physical-schema drift;
  SHA-256 `d3fcaa4bb105ef2381fb619050cbde494c67d2a010177bc7a373549a76a83bcf`.

## Passing outcomes

- PostgreSQL 16 server and exact migration image ID verified.
- Exact image replayed all 37 migrations on an empty database in 2,188 ms.
- Exact image upgraded a representative 35-migration database to 37 in the recorded 2,142 ms upgrade and
  idempotency window.
- Pre-upgrade tenant membership state remained checksum-equivalent.
- The new tenant-safe Department relationship accepted same-tenant assignment.
- A cross-tenant Department assignment was rejected by the composite foreign key.
- A second exact-image migration run was idempotent at 37 completed migrations.
- Both disposable databases and the temporary 35-migration directory were removed. An independent
  PostgreSQL query returned zero matching disposable databases.

## Historical failing outcome

Both the empty replay and representative upgrade produced the same Prisma physical-schema diff:

```sql
ALTER TABLE "departments" ALTER COLUMN "updatedAt" DROP DEFAULT;
```

The cause is a mismatch between:

- `packages/db/migrations/20260920000000_canonical_departments_and_workforce_memberships/migration.sql`,
  which creates `departments.updatedAt` with `DEFAULT CURRENT_TIMESTAMP`; and
- `packages/db/schema.prisma`, where `Department.updatedAt` is `DateTime @updatedAt` without a database
  default.

The tenant-safe follow-up migration
`20260921000000_tenant_safe_department_relationships` behaved correctly and its cross-tenant constraint
passed. No cross-tenant exposure was observed in this verification.

## Historical ownership and required remediation

WI-OI-042 introduced the canonical Department model and the first migration, so the defect is routed to
WI-OI-042 rather than silently changed under WI-OI-047 or WI-OI-046.

Do not edit either applied migration in place. The Backend/Data and Solution Architecture reviewers must
choose and authorize one forward-compatible resolution. Repository evidence favors aligning
`Department.updatedAt` to the intentional deployed contract with
`@default(now()) @updatedAt @db.Timestamptz(3)`: the originating migration already supplies
`DEFAULT CURRENT_TIMESTAMP`, and the newer canonical configuration models use the same Prisma/default
combination. This avoids unnecessary physical DDL and preserves raw-SQL insert compatibility. The
alternative—removing the database default—would require a new forward migration plus an explicit
compatibility justification. This document is a technical recommendation, not the human design decision
or Build authority.

The subsequently authorized fix completed these required actions:

1. apply the accepted canonical-schema correction; if the accepted design changes physical database
   state, add a new forward migration and never rewrite migration 36 or 37;
2. rebuild source-state-bound migration/API/web images as required by the deployment contract;
3. rerun exact-image clean replay, 35-to-current upgrade, schema diff, tenant-safe relationship tests,
   vulnerability/SBOM checks and affected runtime/restore certification; and
4. obtain the named Backend/Data decision against the new immutable evidence.

## Current gate effect

- WI-OI-047 remains `Review` and cannot receive unconditional Backend/Data acceptance.
- WI-OI-042 returned to `Review` after bounded technical completion; named independent Backend/Data review
  remains required before acceptance.
- The Department schema-contract blocker no longer blocks a human Backend/Data decision, but WI-OI-046
  remains `Proposed` until all other entry conditions and an explicit sole-Build handoff are satisfied.
- Production, cloud, customer-managed and external release remain No-Go.
