# AR verification matrix

No test suite exists yet because runtime Build is not authorized. The eventual module cannot be certified
from unit tests alone.

| Layer | Required proof |
| --- | --- |
| Unit/property | Money/rounding, state transitions, dates/aging, policy boundaries, allocation invariants |
| Contract | OpenAPI/AsyncAPI validation, generated client/runtime match, backward compatibility |
| PostgreSQL integration | Real constraints/indexes/transactions, tenant-safe FKs, restart persistence |
| Migration | Empty install, supported upgrade, compatibility/backfill, checksum, roll-forward and restore |
| Auth/security | OIDC failure, permission denial, object scope, tenant isolation, injection, secret/log redaction |
| Idempotency/concurrency | Duplicate create/issue/webhook/event; parallel numbering/update/allocation |
| Worker/provider | Timeout, backoff, circuit, DLQ/poison, replay, receipt, reconciliation, outage recovery |
| E2E | Setup → customer → draft → approve/issue → deliver → partial/full payment → credit → aging/audit |
| UI/accessibility | All states, keyboard, focus, screen reader, contrast, responsive and first-time use |
| Performance/resilience | 10k allowance plus retained volume, bursts, noisy tenant, backlog, DB/worker/provider loss |
| Recovery | Backup/restore, PITR, key rotation, event resync, deployment halt/roll-forward |
| Standalone packaging | Build/start with no other module or platform database in every supported deployment mode |

Certification data must be generated in isolated non-production tenants and excluded from customer usage
and business-value reporting.
