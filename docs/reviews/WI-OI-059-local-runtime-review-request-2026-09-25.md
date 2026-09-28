# WI-OI-059 Local Module Runtime review request

Date: 2026-09-25  
Profile: `module-runtime-local-development-v1`  
Decision requested: bounded Local Development G4 review only

## Implemented outcome

Connector Hub and Analytics now run as internal exact-image services behind the GigaLibs web BFF, using
ordered migrations, dedicated least-privilege PostgreSQL roles, database-backed readiness and exact
internal-service origins. Reports remains contained.

## Exact evidence identity

| Artifact | Identity |
| --- | --- |
| Source revision | `5abfa667bb105143ba8c00bc07b1fb4e6d9ac7d6` |
| Source-state SHA-256 | `b1d090c83fe39dbc5ae4b3a841249311ce847fef266aeb79a38e3fa771f9714f` |
| Connector Hub image | `sha256:ad5ac3698550ae8c99f8c584bd5fc808448e7d2afc2bb683a6b96d6d4a2b5726` |
| Analytics image | `sha256:16723b9a85de99981662fcf91238f3c96922fd749303ecca7ddc2072660463e8` |
| Runtime user | `65532:65532` in both images |

## Measured result

- Base local-profile contract and prerequisite checks: PASS.
- Connector Hub and Analytics exact-image builds: PASS.
- Connector Hub migrations 1-4 and Analytics migrations 1-11 on a clean isolated database: PASS.
- Dedicated runtime-role and two-tenant RLS isolation: PASS.
- Live readiness: HTTP 200 with Connector Hub migration 4 and Analytics migration 11: PASS.
- Persistence-unavailable startup rejection for both images: PASS.
- Read-only/non-root/non-privileged runtime inspection: PASS.
- Connector Hub/Analytics typechecks and affected runtime tests: PASS.
- Trivy 0.74.0 Critical/High policy: PASS, zero findings in both exact images.

The live check initially discovered an Analytics NestJS provider-visibility defect. The correction introduces
a single global `AnalyticsRuntimeModule` for configuration, persistence and authorization and includes a
regression test. The exact images above were rebuilt after that correction.

## Decision boundaries

Reviewers should decide only whether this bounded Local Development runtime foundation is acceptable.
This packet does not authorize production, cloud, public ingress, external-provider use, Universal Reports
uncontainment or Analytics business-completeness claims. Older Analytics business suites still require
test-runner convergence under `WI-OI-043`.
