# WI-OI-047 Backend/Data technical pre-review

Date: 2026-09-24

Status: Agent technical recommendation only; named human Backend/Data decision pending

Scope: PostgreSQL migration authority, outage semantics, backup integrity and clean-target restore for
`configuration-local-development-v1`

## Decision boundary

This record does not constitute a human Backend/Data decision and does not authorize a schema change,
production recovery claim, destructive restore, WI-OI-046 implementation or any G4 Build item.

The original WI-OI-047 replacement evidence is
`infra/compose/evidence/phase-a-20260923T180053Z/`. The superseding Department schema-contract evidence is
`docs/audits/2026-09-24-wi-oi-042-replacement-evidence/` and is bound to the exact images listed below.
Historical PostgreSQL 16, Configuration upgrade and database-restart evidence remains supporting design
evidence only.

## Evidence identity

| Property | Exact value |
| --- | --- |
| Migration source | `packages/db/migrations`, 37 checked-in `migration.sql` files |
| Exact migrations image | `sha256:0ef0a1e9bbfc6d5294c9856c4252bf876967aac74cd5e47415c4c30246636e48` |
| Backup | `infra/compose/backups/gigalibs_backup_20260923_180843Z.dump` |
| Backup size | 1,451,445 bytes |
| Backup SHA-256 | `92d2715f5cfdcd9f3232374328632381c84e2cb6c84d961694df408a2d23a801` |
| Backup profile/release | `configuration-local-development-v1` / `local-20260923T174159Z-5abfa667bb10-3e04668a1212` |
| Backend/Data evidence summary | `docs/audits/2026-09-24-wi-oi-047-backend-data-evidence-summary.json` |
| Evidence-summary SHA-256 | `145f2cb203be1b7bd6d99c0dd35273422edf70156b20f62fa65291e4ff237f08` |
| Exact-image diagnostic result | `docs/audits/2026-09-24-wi-oi-047-exact-migration-image-result-v4.json` |
| Diagnostic-result SHA-256 | `a99a64c5f4f52065c29f8cc77af9d624c42c47b768645564a011352abffb91dc` |
| Routed schema-drift audit | `docs/audits/2026-09-24-wi-oi-047-department-schema-drift.md` |
| Superseding migrations image | `sha256:f59eb319beb1fbee31b63631b29f7077e538e10f11a275741d66e6d84e61ae18` |
| Superseding API image | `sha256:7fee5a35ba72cd968ae6a5e967207d6a8a1f99fe1b05696938a8431d99f9d987` |
| Superseding web image | `sha256:ddec8e4cb4cb0effa8e45a7f89372e59a28fcfd67c71393315bb1652d413bd47` |
| Superseding exact-image result | `docs/audits/2026-09-24-wi-oi-042-exact-migration-image-result.json` |
| Bounded remediation closure | `docs/audits/2026-09-24-wi-oi-042-department-remediation-closure.md` |

The dump, checksum file and metadata all contain the same SHA-256. The dump and sidecars are mode `0600`.
The backup is a PostgreSQL 16 custom-format local dump. It is compressed but not encrypted and has no
independent off-host copy.

## Backend/Data control disposition

| ID | Control | Result | Evidence or limitation |
| --- | --- | --- | --- |
| DATA-047-01 | Canonical migration authority | PASS for inspected local profile | Compose gives the one-shot migration image only `DATABASE_URL`; API waits for successful completion; image is read-only, non-root, no-new-privileges and drops all capabilities |
| DATA-047-02 | Existing-database migration execution | PASS | The exact replacement migration container exited 0 before API readiness against the current local database |
| DATA-047-03 | Clean empty-database replay using exact replacement image | PASS | Superseding exact image replayed all 37 migrations on an empty PostgreSQL 16 database in 2,186 ms and matched the canonical physical schema |
| DATA-047-04 | Upgrade compatibility using exact replacement image | PASS | Superseding exact image upgraded representative tenant/member state from 35 to 37 migrations, preserved its semantic checksum, matched the canonical physical schema and was idempotent on a second run |
| DATA-047-05 | Backup checksum and access mode | PASS for local evidence | Fresh dump metadata, sidecar and recomputed SHA-256 match; files are mode `0600` |
| DATA-047-06 | Clean-target restore | PASS with bounded semantic checks | `pg_restore --exit-on-error --single-transaction` restored to a disposable database; 37 migrations, three Configuration tables, 35 active activations and the active checksum set were preserved; target was removed |
| DATA-047-07 | Canonical physical-schema equivalence | PASS for bounded Local Development profile | After the authorized canonical Prisma annotation correction, both clean replay and representative upgrade produce an empty physical-schema diff; migrations 36 and 37 remain byte-identical to the previously certified image |
| DATA-047-08 | PostgreSQL outage readiness | PASS | Liveness remained 200, readiness changed 200→503→200 and the service recovered |
| DATA-047-09 | Replacement-image transactional failure recovery | NOT EVIDENCED in final bundle | The final outage check does not perform a concurrent write, prove rollback or prove a post-recovery write; stronger 2026-09-16 evidence exists only for the earlier 35-migration runtime |
| DATA-047-10 | Recovery duration and accepted RTO | NOT MEASURED | The final restore record has no start/end duration. Historical timings cannot be promoted to the exact replacement profile |
| DATA-047-11 | Local backup protection | CONDITIONAL | Mode `0600` limits host access, but the dump is plaintext on the same workstation and is not independent recovery media |
| DATA-047-12 | WAL/PITR, encrypted off-host backup, failover and cross-host restore | `DEFERRED_EXTERNAL` | These are required for a production/customer-managed/cloud claim and receive no PASS from local evidence |
| DATA-047-13 | Tenant-safe Department relationship | PASS | Same-tenant assignment succeeded and cross-tenant assignment was rejected by the composite foreign key after the 35-to-37 upgrade |
| DATA-047-14 | Disposable verification cleanup | PASS | Both prefixed databases and the temporary baseline migration directory were removed; independent database count was zero |

## Technical recommendation

The evidence now proves that the superseding exact migration image can bootstrap an empty database,
upgrade representative 35-migration state to 37, preserve that state, enforce the tenant-safe Department
relationship, rerun idempotently and match the canonical physical schema. The bounded
`departments.updatedAt` blocker is technically resolved without modifying an applied migration or the live
application database. Production disaster recovery remains unproven.

Agent recommendation:

- **Go for a named Backend/Data reviewer to decide the bounded Local Development data controls.** The
  former Department schema-drift blocker is cleared by immutable replacement evidence.
- WI-OI-042 and WI-OI-047 must remain in `Review` until the required human decisions are recorded; this
  technical recommendation is not acceptance and does not activate WI-OI-046.
- **No-Go for production, customer-managed, cloud, RPO/RTO, PITR or failover claims.**

The authorized verifier created and removed two strictly prefixed disposable local databases. It did not
modify the live application database; independent cleanup verification found zero retained test databases.

## Human Backend/Data decision request

An actual qualified human reviewer completes this statement and the corresponding integrated-review row:

```text
I, [full human name], reviewed WI-OI-047 and the bounded WI-OI-042 Department remediation as the
Backend/Data reviewer against replacement bundle phase-a-20260923T180053Z,
docs/audits/2026-09-24-wi-oi-042-department-remediation-closure.md and the 2026-09-24 Backend/Data technical
pre-review. My decision for the bounded configuration-local-development-v1 profile is
[Accept / Conditional / Reject]. I am [independent / not independent] from the implementation producer.
Conditions/findings: [exact conditions, including clean replay, representative upgrade, schema
equivalence, restore and deferred production-recovery controls]. I do not authorize production, cloud,
customer-managed recovery or WI-OI-046 G4 implementation. Date: [YYYY-MM-DD].
```
