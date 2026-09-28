# Configuration deployment-profile acceptance test plan

Status: Proposed G3 test design for WI-OI-047; independent QA/operator acceptance required

Current profile: `configuration-local-development-v1`

Deferred release profiles: `configuration-customer-managed-local-v1` and Managed Cloud. They are not
current claims and must rerun the applicable matrix after their production infrastructure is selected.

## 1. Evidence rules

- Tests use immutable artifacts built from the reviewed source revision.
- Real PostgreSQL 16 and real S3-compatible storage are required; isolated test records are attributable
  and cleaned according to evidence policy.
- No repository `.env`, developer credential or production customer record enters an image or evidence.
- A blocked real-infrastructure test is recorded as blocked, never replaced with a mock pass.
- Each result records profile, release ID, image digests, contract hash, timestamps, operator, dependency
  versions, aggregate outcomes and cleanup.
- Producer tests do not replace independent QA, operator, Security, Accessibility, Product or Release
  decisions.

### 1.1 Local versus external evidence

The local milestone executes every row that can be proven with the existing Docker/PostgreSQL/MinIO and
real local application processes. Rows requiring a provider, public origin, external authority or second
host are recorded `DEFERRED_EXTERNAL`; they are not failures for the local milestone and never count as
passes for G5/G6 production release. The authoritative classification is in
`docs/plans/configuration-local-execution-plan.md`.

## 2. Contract and static gates

| ID | Scenario | Expected result |
| --- | --- | --- |
| DEP-CFG-001 | Compare API/web schemas to the current profile render | Every required key mapped under canonical name |
| DEP-CFG-002 | Missing/blank/malformed required key | Container exits non-zero before readiness; safe setting-name error |
| DEP-CFG-003 | Obsolete aliases (`PORT` for API, `CONTROL_PLANE_URL`, old signing key) | Static gate fails |
| DEP-CFG-004 | Secret in ConfigMap/value/public web variable | Static gate fails without printing value |
| DEP-CFG-005 | Empty connector host allowlist | Parses as deny-all, not wildcard |
| DEP-CFG-006 | HTTP storage in local profile | Allowed only for the exact loopback/local-Docker MinIO endpoint with `LOCAL_DEVELOPMENT`; any broader endpoint is denied |
| DEP-CFG-007 | Signing pair partially supplied or wrong key format | Capability/startup behavior fails explicitly as designed |
| DEP-CFG-008 | F3 environment key added to runtime only | Claimed-profile drift gate fails |
| DEP-API-001 | OpenAPI/controller/schema convergence | Exact routes/statuses and strict responses match |
| DEP-PROBE-001 | Rendered API/web probes | Every route exists and matches liveness/readiness semantics |

## 3. Image and supply-chain gates

| ID | Scenario | Expected result |
| --- | --- | --- |
| DEP-IMG-001 | Clean build from locked source twice | Functionally identical declared content; reproducibility variance explained |
| DEP-IMG-002 | Inspect final filesystem/history | No `.env`, Git data, test evidence, package cache or secret |
| DEP-IMG-003 | Run with random non-root UID/read-only root | Starts with only documented writable mounts |
| DEP-IMG-004 | Start wrong command/package | Image health fails; no unrelated service starts |
| DEP-IMG-005 | Migration/app release mismatch | Promotion gate blocks |
| DEP-IMG-006 | Mutable tag without accepted digest | Production render/promotion blocks |
| DEP-IMG-007 | Local artifact identity | Revision-qualified image and local immutable image ID recorded; remote registry signature/provenance is `DEFERRED_EXTERNAL` |
| DEP-IMG-008 | Local dependency/security gates | Repository dependency audits pass; provider/registry container scanning is `DEFERRED_EXTERNAL` |

## 4. Clean deployment journey

Run in the Local Development profile. A later customer-managed release or cloud profile reruns every
applicable row and may not reuse the local result as production evidence.

| ID | Scenario | Expected result |
| --- | --- | --- |
| DEP-E2E-001 | Empty supported environment installation | Migrations complete once; API/web become Ready |
| DEP-E2E-002 | Invalid/unavailable database at startup | Migration/API fail safely; web not Ready; no fake success |
| DEP-E2E-003 | Invalid/unavailable object storage | Exact designed capability/readiness result; no local fallback |
| DEP-E2E-004 | Login and tenant selection | Real session/tenant authority established |
| DEP-E2E-005 | Maker/checker Configuration lifecycle | Draft→submit→independent approval→publish→activate persists |
| DEP-E2E-006 | Configuration manifest lifecycle | Activated manifest is returned by explicit accepted scope and persists across refresh/restart; no `local-uat`/`all-users` default is credited |
| DEP-E2E-007 | Tenant-negative access | Second tenant cannot read/infer manifest, cache, audit or artifact |
| DEP-E2E-008 | Revocation/suspension | Current database authority removes access without image restart |
| DEP-E2E-009 | Configuration package signing/import | Correct Ed25519 signature succeeds; tamper/untrusted signer denied |
| DEP-E2E-010 | Java manifest client against local origin | Loopback-cleartext exception plus body/media/redirect controls pass; public TLS is `DEFERRED_EXTERNAL` |

## 5. Failure, recovery and rollout

| ID | Scenario | Expected result |
| --- | --- | --- |
| DEP-REL-001 | Stop/restart API process | Single-host downtime is reported truthfully; state is preserved after restart |
| DEP-REL-002 | Disconnect invalidation listener | Cache bypasses safely; authoritative DB read; reconnection reconciles |
| DEP-REL-003 | Activate while API process is offline/unavailable | After restart/resync the process returns the current authoritative checksum |
| DEP-REL-004 | PostgreSQL interruption | readiness drops; retryable sanitized failures; recovery converges |
| DEP-REL-005 | Object-storage interruption | dependent operations unavailable; unrelated Configuration state remains truthful |
| DEP-REL-006 | Sequential API/web upgrade | documented downtime and old/new compatibility pass; no lost committed state |
| DEP-REL-007 | Migration failure | rollout blocks; recovery checkpoint remains usable |
| DEP-REL-008 | Backup/restore to clean target | migration history and semantic checksums match |
| DEP-REL-009 | Representative WAL/PITR/external backup | `DEFERRED_EXTERNAL`; local dump/restore remains mandatory under DEP-REL-008 |
| DEP-REL-010 | Secret/key rotation | bounded dual-key window works; old key retirement verified |
| DEP-REL-011 | Resource saturation | admission/readiness/alerts act before unsafe exhaustion |
| DEP-REL-012 | Cross-host/customer-managed host loss | `DEFERRED_EXTERNAL`; no local single-workstation availability claim |

## 6. Observability and operations

| ID | Scenario | Expected result |
| --- | --- | --- |
| DEP-OBS-001 | Authenticated metrics scrape | Required families present; unauthorized scrape denied |
| DEP-OBS-002 | Dashboard import | Queries resolve against emitted bounded labels |
| DEP-OBS-003 | Fire/resolve six Configuration alerts | Local alert rules evaluate; external notification delivery is `DEFERRED_EXTERNAL` |
| DEP-OBS-004 | Correlated failure journey | Request/log/audit/outbox correlation reconstructs outcome without secret/value leakage |
| DEP-OBS-005 | Cardinality/secret scan | No tenant/user/record/credential labels or leaked values |
| DEP-OBS-006 | Independent operator runbook | Outage, backlog, rollback and recovery executed without manual DB edits |

## 7. Security, performance and accessibility

| ID | Scenario | Expected result |
| --- | --- | --- |
| DEP-SEC-001 | Local origin boundary | Only explicit loopback HTTP exceptions are accepted; public TLS/hostname trust is `DEFERRED_EXTERNAL` |
| DEP-SEC-002 | Local binding/firewall | Services bind only documented local ports; provider network policy is `DEFERRED_EXTERNAL` |
| DEP-SEC-003 | Container hardening | Non-root, capabilities, writable paths and secret mounts match policy |
| DEP-SEC-004 | Cross-tenant/object-ID tampering | No read, write, timing/status inference or download succeeds |
| DEP-PERF-001 | 250-field/two-tenant profile | Accepted latency/error/resource budgets pass |
| DEP-PERF-002 | Concurrent activation/manifest reads | One deterministic winner; the restarted process returns the authoritative checksum |
| DEP-PERF-003 | Noisy-neighbor load | Tenant isolation and database capacity stay within threshold |
| DEP-A11Y-001 | Automated WCAG matrix | Supported browsers/viewports/states pass accepted rules |
| DEP-A11Y-002 | Manual assistive review | Keyboard, screen reader, zoom, high contrast and contextual overlay accepted |

## 8. Mandatory repository gates

Run the commands in `AGENTS.md` from the frozen candidate plus focused Configuration contract,
observability, Java, HTTP, performance, restart, recovery and accessibility certifications.
Rendered Compose validation, local image-identity checks and applicable repository dependency/security
audits are additional mandatory gates. Registry/IaC/provider scanning, signed provenance and external SBOM
attestation are `DEFERRED_EXTERNAL`.

## 9. Exit recommendation

QA may recommend **Local Foundation Ready** only when every locally applicable P0/P1 row has passing real
evidence in `configuration-local-development-v1`, every external row is explicitly
`DEFERRED_EXTERNAL`, no local deployment-contract contradiction remains, the CMMS frozen hashes are
unchanged, and named independent humans accept the exact artifacts. This permits a separately authorized
F3/TP-1 development slice; it is not F2 production closure or G5/G6 release. Tenant Profile runtime values
remain F3/TP-1 scope.
