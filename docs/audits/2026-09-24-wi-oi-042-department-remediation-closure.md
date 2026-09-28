# WI-OI-042 Department schema-contract remediation closure

Date: 2026-09-24  
Profile: `configuration-local-development-v1`  
Disposition: bounded technical remediation complete; independent Backend/Data review required

## Authorized change

The canonical `Department.updatedAt` field now declares
`@default(now()) @updatedAt @db.Timestamptz(3)`, matching the intentional
`DEFAULT CURRENT_TIMESTAMP` already deployed by migration 36. No applied migration was edited and the
live application database was not targeted.

The source-state-bound Prisma client regenerated successfully. Prisma schema validation and the
`@gigalibs/db` build pass. The package's generic `test` script reports no test files; the actual database
behavior is covered by the exact-image clean/upgrade and runtime certification below.

## Immutable replacement images

All three images carry source revision `5abfa667bb105143ba8c00bc07b1fb4e6d9ac7d6`, source-state SHA-256
`7185c069c64026c17fb58ed02636b3304ab48e56711a92d150f0969034517fc5`, run as `65532:65532`, and use the
reviewed distroless runtime:

| Component | Exact image ID |
| --- | --- |
| Migrations | `sha256:f59eb319beb1fbee31b63631b29f7077e538e10f11a275741d66e6d84e61ae18` |
| API | `sha256:7fee5a35ba72cd968ae6a5e967207d6a8a1f99fe1b05696938a8431d99f9d987` |
| Web | `sha256:ddec8e4cb4cb0effa8e45a7f89372e59a28fcfd67c71393315bb1652d413bd47` |

The current computed source-state hash exactly matches the value stamped on every image.

## Database and tenant-isolation certification

The exact migrations image passed:

- empty PostgreSQL 16 replay of all 37 migrations;
- representative 35→37 upgrade with pre-upgrade membership state preserved;
- empty physical schema diff against the canonical Prisma model after clean replay and upgrade;
- second-run idempotency;
- same-tenant Department relationship acceptance; and
- cross-tenant Department assignment denial.

Both disposable databases and the temporary migration directory were removed. The authoritative result is
[`2026-09-24-wi-oi-042-exact-migration-image-result.json`](2026-09-24-wi-oi-042-exact-migration-image-result.json).

Migration integrity was independently compared with the previously certified migrations image:

| Applied migration | Previous image SHA-256 | Current file SHA-256 | Result |
| --- | --- | --- | --- |
| `20260920000000_canonical_departments_and_workforce_memberships` | `9d0a382397e7c3bf7e8eebac8850b9ed94c6680631d6d6daf5d5df8f9af9f727` | same | Unchanged |
| `20260921000000_tenant_safe_department_relationships` | `09d92c59bff2d419484c3e72c26905260e549beea20f111a337c11a38ecafd5b` | same | Unchanged |

## Disposable runtime and restore certification

The replacement images ran in an isolated Compose project against an empty disposable database. The F2
runtime verifier passed 13 outcomes, including maker/checker separation, cross-tenant list/mutation/runtime
denial, live role/member/user/tenant revocation, session revocation, 250-field bounded validation and 100
concurrent surface reads. The measured read latency was p95 29.797 ms and p99 40.717 ms with zero failures.

A custom-format backup of that disposable runtime database restored into a second disposable database.
All 37 migrations, semantic counts/checksums and the zero-drift physical schema were preserved. Generated
test identities and memberships had zero active rows before teardown. Independent cleanup found zero
matching WI-OI-042/WI-OI-047 disposable databases and no retained certification containers or network.

Evidence:

- [`runtime.json`](2026-09-24-wi-oi-042-replacement-evidence/runtime.json)
- [`restore.json`](2026-09-24-wi-oi-042-replacement-evidence/restore.json)
- [`disposable-runtime-closure.json`](2026-09-24-wi-oi-042-replacement-evidence/disposable-runtime-closure.json)

The live `gigalibs` database was not modified by this certification.

## Supply-chain result

Trivy 0.74.0 generated replacement CycloneDX SBOMs and vulnerability/secret reports for the exact image
IDs. Every image has zero Critical, zero High and zero secret findings. Lower-severity findings remain in
the raw reports and are not represented as zero-vulnerability claims. See
[`supply-chain-summary.json`](2026-09-24-wi-oi-042-replacement-evidence/supply-chain-summary.json).

## Mandatory repository gates

| Gate | Result | Routed outcome |
| --- | --- | --- |
| `pnpm build` | FAIL | Existing Analytics API test-runner/type configuration; 91/97 tasks succeeded |
| `pnpm test` | FAIL | Existing Analytics and frozen CMMS suites; 132 files/1,171 tests passed, 14 files/11 tests failed |
| `audit:production-data` | FAIL | Seven existing quarantined CMMS import/export and local Redis-default findings |
| `audit:all-runtime-data` | FAIL | Same seven existing routed findings |
| `audit:package-dependencies` | PASS | 89 active manifests verified |
| `audit:api-boundary` | PASS | 12 controllers and 36 providers verified |
| `audit:navigation` | PASS | 89 routes and 109 static internal links verified |
| `audit:sdlc` | PASS | WIP limit held with WI-OI-042 as the sole bounded Build item |

The failing global gates do not arise from the one-line Department schema correction and were not changed
under this authorization. They remain release blockers owned by their routed work items; this closure does
not waive or accept them.

## Decision

The measured P1 `departments.updatedAt` schema mismatch is resolved for the bounded Local Development
profile. WI-OI-042 may return to `Review`, but it cannot become Accepted without the named independent
Backend/Data decision and other applicable human review. WI-OI-047 remains `Review`; WI-OI-046 remains
`Proposed`. Production, cloud, external release and WI-OI-046 G4 remain unauthorized.
