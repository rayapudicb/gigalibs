# WI-OI-047 local technical closure

Date: 2026-09-23  
Status: Local implementation complete; Review with open conditions  
Profile: `configuration-local-development-v1`  
Production release: Not authorized

## Decision

WI-OI-047 has completed its bounded local implementation, authorized supply-chain remediation and affected
agent-executable recertification. It returns to `Review`, leaving no active G4 Build item. This decision
does not mean `Accepted`, production-ready or released. Named independent reviews, credential-owner
rotation confirmation, manual accessibility testing and routed repository-wide failures remain open.

The authoritative replacement evidence is
`infra/compose/evidence/phase-a-20260923T180053Z/`. `phase-a-closure.json` is the machine-readable closure
record, `images.json` binds the build identity and `gates.log` records both passing and routed repository
gates. The earlier `phase-a-20260923T103641Z` bundle remains historical evidence of the vulnerability
baseline; it is not the remediated image authority.

## Immutable build identity

| Item | Identity |
| --- | --- |
| Source revision | `5abfa667bb105143ba8c00bc07b1fb4e6d9ac7d6` |
| Image-build source-state SHA-256 | `3e04668a12128ac56234549152789e034a61b60b56085055d9db58b74b53f614` |
| Migrations image | `sha256:0ef0a1e9bbfc6d5294c9856c4252bf876967aac74cd5e47415c4c30246636e48` |
| API image | `sha256:0a9b4a9160dd9a840af630617bec7ec02af0b4923459b9312e6e29017a26b3ac` |
| Web image | `sha256:8541a74ac83305ae2f155a08a9a924fc9aab2118c670454331671d7e95c47301` |

The image labels match the recorded revision and image-build source state. All three final images use the
pinned distroless Node.js 24 Debian 13 runtime and run as `65532:65532`. Filesystem inspection found none
of the scanned `.env`, `.env.*`, `.git`, private-key, global npm or shell paths. Certification evidence is
generated after image creation, so `images.json` and the image labels—not the later evidence-writing hash—
are authoritative for the image input.

An earlier, subsequently deleted image generation included nested `.env` files, including nonempty
ACS/Twilio settings. The build exclusions were corrected, affected images and cache were removed, and the
clean final images pass the filesystem scan. This does not prove external credential rotation. The
credential owner must rotate the affected ACS/Twilio credentials and record confirmation before external
use.

## Local certification result

| Area | Result | Evidence |
| --- | --- | --- |
| Real F2 lifecycle and isolation | PASS, 13 outcomes | `f2-runtime.json` |
| Performance | PASS; 100 reads, concurrency 10, p95 26.791 ms, p99 38.235 ms, zero failures | `f2-runtime.json` |
| PostgreSQL outage/recovery | PASS; live 200, ready 503 during outage, recovery 200 | `postgres-outage.json` |
| MinIO outage | PASS; F2 remains live/ready because MinIO is not an F2 dependency | `minio-outage.json` |
| Backup/restore | PASS; fresh checksum-bound backup, 37 migrations, canonical tables, 35 activations and checksum set preserved | `restore.json` |
| Exact-image restart | PASS; authoritative checksum preserved through API/web restart | `restart-checksum.json` |
| Automated accessibility | PASS; seven Chromium/axe scans, zero violations | `accessibility-automated.json` |
| Live observability | PASS for authenticated scrape, redaction/cardinality and tenant non-disclosure | `observability-live-current-stack.json` |
| Focused automated tests | PASS; 21 files, 357 tests | historical bundle `gates-summary.json`; replacement `gates.log` records the affected rerun |
| Java client conformance | PASS; 11 outcomes on Java 11 | historical bundle `gates-summary.json` |

Generated certification users, tenants and memberships were inactive after the runtime tests. The
disposable restore database was removed. The master verifier now always creates a fresh backup immediately
before clean-target comparison, preventing a stale historical dump from being compared with current test
state; `restore.json` is authoritative for this run.

All seven protected CMMS/import-export hashes still match the checkpoint in `.pi/work/WI-OI-044.md`; no
frozen Phase 4 file was changed to obtain this result.

## Supply-chain evidence

CycloneDX SBOMs were generated for migrations (52 components), API (243) and web (304). Trivy 0.74.0
scanned the three exact local image IDs with telemetry disabled and `ignoreUnfixed=false`. Each policy file
records `critical: 0`, `high: 0`, so the authorized remediation policy passes. The replacement runtime is
distroless Debian 13; the migrations runtime no longer inherits the application workspace or optional
build/test tooling; and the scoped dependency overrides remove the identified Multer, PostCSS and Prisma
deep-merge vulnerable paths. Raw reports, report hashes and policy records are under the replacement
bundle's `sbom/` and `vulnerability/` directories. This local policy pass does not authorize production or
external release and still requires named Security/Supply-chain review.

## Repository gates that remain failed

| Gate | Result and routing |
| --- | --- |
| `pnpm build` | FAIL in Analytics Jest globals/types and `AnalyticsPrincipal` fixtures after 66 successful tasks; route to Analytics |
| `pnpm test` | FAIL with 132 files/1,171 tests passing and 14 files/11 tests failing in Analytics and frozen CMMS inventory; route without editing frozen paths |
| `pnpm audit:production-data` | FAIL on active use of quarantined `data-import-export-react` and frozen CMMS Redis fallback |
| `pnpm audit:all-runtime-data` | Same quarantine/frozen-scope failures; no waiver inferred |

The focused WI-OI-047 suite and the package-dependency, API-boundary, navigation, SDLC,
Configuration-contract, deployment-profile and static observability audits pass. This distinction is
deliberate: a bounded slice may enter Review while the repository is still not releaseable.

## Human review still required

- Security & Privacy: inspect image/SBOM/secret/tenant evidence and the zero Critical/High policy result;
  verify the credential owner's ACS/Twilio rotation record.
- Backend/Data: inspect migrations, outage behavior, backup and semantic restore evidence.
- Web/Accessibility: manually test keyboard-only use, screen reader, 200%/400% zoom and high contrast.
- QA/SDET: independently witness the negative, revocation, failure and recovery matrix.
- Product: review the exact local behavior and limitations, not the invalid 2026-09-22 mock screenshot.

The Product Owner/Solution Architecture/local operator's Build-entry authority remains recorded. It is not
a substitute for these independent exit decisions.

## Explicit deferrals

Customer-managed production, Managed Cloud, provider selection, public TLS/DNS, HA, PITR, remote registry
signing/provenance and real external alert notification are `DEFERRED_EXTERNAL`. They require separately
authorized work and cannot inherit credit from this local result.

## Next authorized action

Reviewers use `docs/reviews/WI-OI-047-human-review-guide.md` and record named decisions against this exact
bundle. The SDLC Orchestrator routes the four repository failures to their owning work items. Only after
conditions and required decisions are resolved may the next sole G4 Build item be named. WI-OI-046 remains
`Proposed` and is not authorized to start.
