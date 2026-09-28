# WI-OI-060 Workforce runtime foundation review request

Date: 2026-09-25  
Profile: `workforce-runtime-local-development-v1`  
Decision requested: bounded Local Development G4 review only

## Implemented outcome

GigaOps now has one canonical, source-neutral Workforce runtime identity for future use by CMMS and other
GigaLibs modules. The local runtime uses signed `PlatformContextV1`, exact audience/module/scope checks,
dedicated least-privilege PostgreSQL access, transaction-bound tenant RLS, ordered migrations, separate
liveness/readiness and an exact hardened image. Production-reachable prototype data and duplicate CMMS
workforce navigation remain contained.

This is the runtime foundation, not the worker, scheduling, time, pay or CMMS business implementation.

## Exact evidence identity

| Artifact | Identity |
| --- | --- |
| Source revision | `5abfa667bb105143ba8c00bc07b1fb4e6d9ac7d6` |
| Source-state SHA-256 | `b72b93229d87a1493e597aa179a76fa1e9d35823844b1747e57a9909a13d78a6` |
| Image tag | `gigalibs/workforce-api:5abfa667bb10-b72b93229d87` |
| Image ID | `sha256:12981f56db3a6490a9d4efc962b53abb320729645a749c25d80679e9b5f730f2` |
| Runtime user | `65532:65532` |
| Vulnerability report SHA-256 | `275aa7626b7651a90f7617ad99e35cf060e236679dae4d58c6413348bbaf5650` |
| CycloneDX SBOM SHA-256 | `78ebc3e5f6bc60ea8fe153327a382d71d3fe43dc26dd5fe09723b0b914829d63` |

Evidence files:

- `docs/audits/2026-09-25-wi-oi-060-runtime-foundation/vulnerability/workforce-api-trivy.json`
- `docs/audits/2026-09-25-wi-oi-060-runtime-foundation/sbom/workforce-api-sbom.json`

## Measured result

- Repository build: PASS, 106/106 tasks.
- Repository tests: PASS, 188 files and 1,707 tests; execution-plane tests: 4/4 PASS.
- Production/all-runtime data, package dependency, API boundary, navigation and SDLC audits: PASS.
- Focused GigaOps authorization/runtime and web containment tests: PASS.
- Clean isolated migration replay through Workforce migration 2: PASS.
- Runtime role is non-superuser/non-BYPASSRLS and cannot modify the migration ledger: PASS.
- Two-tenant RLS, unscoped zero-row behavior and append-only audit enforcement: PASS.
- Signed-context matrix: missing token 401, wrong audience 401, wrong module 403, missing scope 403 and
  valid tenant-bound context 200: PASS.
- Exact migration container exit: 0. Exact API container: healthy, zero restarts, read-only root filesystem,
  non-root user, all Linux capabilities dropped, `no-new-privileges`, and no host-published port: PASS.
- Trivy 0.74.0 cached-database scan: 0 Critical, 0 High, 17 Medium, 7 Low: PASS for the bounded local gate.
- CycloneDX SBOM: 129 components. Nine components have no reported license field and remain a distribution
  disposition requirement; no distribution approval is requested.

## Review decisions required

The named humans should record `Accept`, `Conditional` or `Reject` against the exact identities above:

1. Solution Architecture / Product: ownership boundary and truthful business containment.
2. Security & Privacy / Supply-chain: signed context, runtime hardening, scan and SBOM disposition.
3. IAM/Tenancy: audience, entitlement, scopes, revocation and tenant-binding behavior.
4. Backend/Data: ordered migrations, dedicated role, forced RLS and append-only evidence.
5. API Contracts: health and tenant-scope response contracts and fail-closed errors.
6. Web/Accessibility: truthful contained UI and navigation behavior.
7. QA/SDET: requirement trace and complete measured verification.

## Decision boundaries

This packet does not authorize production, cloud, public ingress, customer distribution, external-provider
use, GigaOps business enablement, CMMS People/Dispatch enablement, payroll/tax claims or later Workforce
verticals. The nine missing SBOM license declarations require disposition before distribution. Each future
business vertical requires its own stable work item, migrations, tenant/security evidence, UX states,
tests and human acceptance.
