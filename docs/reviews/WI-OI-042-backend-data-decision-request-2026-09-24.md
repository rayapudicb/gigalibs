# WI-OI-042 independent Backend/Data decision request

Date: 2026-09-24  
Profile: `configuration-local-development-v1`  
Status: bounded technical remediation complete; independent human decision pending

## Decision boundary

This packet asks a qualified Backend/Data reviewer who is independent from the implementation producer to
decide whether the bounded WI-OI-042 Department schema-contract remediation is acceptable for Local
Development. It does not request or authorize production, cloud, customer-managed recovery, external
release, WI-OI-047 acceptance or WI-OI-046 G4 implementation.

## Exact evidence identity

| Evidence | SHA-256 |
| --- | --- |
| `docs/audits/2026-09-24-wi-oi-042-department-remediation-closure.md` | `92c48a09cc70d2ed2b0c41f5830ede66d6f63d1d6c0b553ea819a3e8db386a0b` |
| `docs/audits/2026-09-24-wi-oi-042-exact-migration-image-result.json` | `b59849b4820bdbbbc9bc1738041bd6c7485949dd6fa81b60d1a9f1e30d5de837` |
| `docs/audits/2026-09-24-wi-oi-042-replacement-evidence/runtime.json` | `d4c28802241791fd6d373c2c7f4b0d322358c0aabb39ef6b259cf42b71b1d154` |
| `docs/audits/2026-09-24-wi-oi-042-replacement-evidence/restore.json` | `daf98dd720541aaab83e46ac961cf7e7da35f582d6cb8c79cfcd003b0abfb484` |
| `docs/audits/2026-09-24-wi-oi-042-replacement-evidence/supply-chain-summary.json` | `53e9c8ebe0d00f78e4205953345f39e853f138f215219cb169015242fd88a52a` |
| `docs/audits/2026-09-24-wi-oi-042-replacement-evidence/disposable-runtime-closure.json` | `ecf0c76f066550942b411fb58a29c59af7072a29d44964634830ac72393cfb59` |

Replacement images:

| Component | Exact image ID |
| --- | --- |
| Migrations | `sha256:f59eb319beb1fbee31b63631b29f7077e538e10f11a275741d66e6d84e61ae18` |
| API | `sha256:7fee5a35ba72cd968ae6a5e967207d6a8a1f99fe1b05696938a8431d99f9d987` |
| Web | `sha256:ddec8e4cb4cb0effa8e45a7f89372e59a28fcfd67c71393315bb1652d413bd47` |

The images are bound to source-state SHA-256
`7185c069c64026c17fb58ed02636b3304ab48e56711a92d150f0969034517fc5`.

## Reviewer checklist

The reviewer should verify and explicitly disposition each item:

1. `Department.updatedAt` declares
   `@default(now()) @updatedAt @db.Timestamptz(3)` and matches the intentional deployed
   `DEFAULT CURRENT_TIMESTAMP` contract.
2. Applied migrations 36 and 37 were not edited; their hashes match the previously certified migrations
   image.
3. The exact replacement migrations image replays all 37 migrations on an empty PostgreSQL 16 database.
4. The same image upgrades representative 35-migration state, preserves the membership checksum and is
   idempotent on a second run.
5. Clean and upgraded databases both have an empty physical-schema diff against the canonical Prisma
   model.
6. Same-tenant Department assignment succeeds and cross-tenant assignment is rejected.
7. The disposable runtime and clean-target restore preserve the recorded semantic state and remove all
   generated identities, databases, containers and networks.
8. The live `gigalibs` database was not targeted by the certification.
9. The evidence is Local Development only. WAL/PITR, encrypted off-host backup, failover, cross-host
   restore and production RPO/RTO remain unproven and unauthorized.
10. Repository-wide Analytics, frozen CMMS and quarantine failures remain routed and are not waived by
    this bounded decision.

## Decision to record

Copy, complete and return the following statement:

```text
I, [full human name], reviewed WI-OI-042 as the independent Backend/Data reviewer against
docs/reviews/WI-OI-042-backend-data-decision-request-2026-09-24.md and the exact evidence identities it
records. My decision for the bounded configuration-local-development-v1 Department schema-contract
remediation is [Accept / Conditional / Reject]. I am independent from the implementation producer.
Conditions/findings: [exact conditions or "none"]. This decision does not authorize production, cloud,
customer-managed recovery, external release, WI-OI-047 acceptance or WI-OI-046 G4 implementation.
Date: [YYYY-MM-DD].
```

## Orchestrator action after the decision

- `Accept`: record the named human decision in WI-OI-042 and the integrated review; WI-OI-042 may be
  accepted only if every applicable work-item gate is satisfied. Do not automatically accept WI-OI-047 or
  activate WI-OI-046.
- `Conditional`: keep WI-OI-042 in Review and route each exact condition to an owner and evidence method.
- `Reject`: keep WI-OI-042 in Review, record the finding and require new bounded authority before any
  product or migration change.

