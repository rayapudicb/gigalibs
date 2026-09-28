# Configuration foundation F2 closure audit

Status: No-Go for F2 exit; bounded remediation required

Date: 2026-09-22

Work items: WI-OI-039 review, WI-OI-047 proposed remediation

## 1. Conclusion

The existing Configuration Studio implementation remains a strong local PostgreSQL-backed foundation, but
Delta 5 Phase/F2 cannot close. Current-source contract, compiler, cache, outbox, renderer and service tests
pass. The claimed Managed Cloud and Customer-Managed deployment packets do not conform to the checked-in
API/web startup contracts and have no checked-in container build/provenance path. Therefore CS-10 is file
inventory, not a runnable or certifiable deployment profile.

This finding blocks F3/TP-1 Build entry because F3 introduces another required runtime-scope setting and
must not build on deployment manifests that already cannot start the current application.

## 2. Current-source evidence that passed

Executed from the dirty working tree on 2026-09-22:

- `node scripts/verify-configuration-contracts.mjs`: 11/11 outcomes passed; all 32 controller operations
  have named v1 responses and match OpenAPI.
- `node scripts/verify-configuration-observability.mjs`: 8/8 static outcomes passed; 13 metrics, six alerts
  and 16 dashboard panels remain wired consistently.
- Direct Vitest execution of the focused Configuration packages, API services and web boundary: 11 test
  files and 61 tests passed.
- `node scripts/verify-sdlc-governance.mjs`: passed with 46 work items and no active G4 Build item before
  WI-OI-047 was proposed.

These are source/local checks. They do not prove either deployment profile.

## 3. P0 deployment findings

### F2-DEP-001 — API environment contract is not rendered

`apps/playground-api/src/config/runtime-config.ts` fails startup when required settings are absent. A static
comparison found 41 directly named required settings for which neither API deployment supplies the
required name. Examples include:

- `API_HOST` and `API_PORT` (both profiles provide unused `PORT` instead);
- workflow schema/compiler/retry settings;
- execution event identity/signing/skew settings;
- connector allowlists, network policy, timeout, response limit and circuit-breaker settings;
- control-payload key/version and outbox retry/claim/batch settings;
- object-store endpoint, region, bucket, access keys, TLS/path-style, size, presign and cleanup settings;
- retention worker intervals/batches; and
- the authenticated observability metrics token.

`CORS_ORIGINS`, `DATABASE_URL`, auth/module variables and optional feature-specific configuration must also
be included in the complete startup contract. A production image may not rely on a baked repository `.env`
or silent defaults to fill these gaps.

### F2-DEP-002 — Health probes target routes that do not exist

The control-plane API sets the global prefix `api/v1` and implements:

- liveness: `GET /api/v1/health`;
- database readiness: `GET /api/v1/ready`.

Compose probes `/health/readiness`; Helm probes `/health/liveness` and `/health/readiness`. None exists.
The web deployments probe `/api/health`, but no corresponding Next.js route exists.

### F2-DEP-003 — Web upstream contract uses the wrong names

The web runtime requires `CONTROL_PLANE_API_URL`; the profiles provide `CONTROL_PLANE_URL`. BFF mutation
handling also requires positive `BFF_MAX_REQUEST_BYTES`, and supported workflow execution paths require
`EXECUTION_PLANE_API_URL`. These are absent. A healthy container process would still fail normal BFF
requests.

### F2-DEP-004 — Configuration signing inputs are incompatible

The API reads `CONFIGURATION_PACKAGE_SIGNING_KEY_ID` and
`CONFIGURATION_PACKAGE_SIGNING_PRIVATE_KEY_BASE64` for an Ed25519 PKCS#8 key. The deployment profiles and
credential generator instead provide `CONFIGURATION_PACKAGE_SIGNING_KEY`, which the implementation does
not read. The generator creates a random text secret, not the required Ed25519 key plus key identifier and
trusted-public-key policy.

### F2-DEP-005 — Credential generator cannot produce its own declared profile

The Compose file requires platform-context private/public keys and `CMMS_API_URL`, but
`generate-credentials.sh` emits none of them. Running Compose interpolation with `.env.example` fails before
container creation because required values are empty. The object-storage and full API startup inputs are
also absent.

### F2-DEP-006 — Referenced application images are not reproducible from this repository

The profiles reference `ghcr.io/gigalibs/control-plane-api:1.0.0`,
`control-plane-migrations:1.0.0` and `workflow-platform-web:1.0.0`. No Dockerfile/Containerfile or CI image
build/push definition for those images exists in the inspected repository. No accepted digest, SBOM,
signature, provenance or source-to-image mapping is recorded. Tags alone are mutable and are not release
evidence.

### F2-DEP-007 — Required object-storage topology is unspecified

The API startup contract requires S3-compatible storage configuration, but the supposedly turnkey Compose
profile contains no object store and no complete external-object-store contract. The selected
customer-managed topology, image/license if bundled, TLS, credentials, backup, retention and recovery must
be accepted before implementation.

## 4. Evidence limitations

- Docker daemon inspection was denied by the current sandbox, and no relevant local ports were listening.
- That limitation prevents a live deployment rehearsal but does not weaken the static No-Go: the variable
  and route mismatches are direct source-to-manifest contradictions.
- Helm is not installed in the current environment, so lint/template validation was not run.
- No external registry lookup was performed; an unpublished or externally maintained image cannot be
  credited without repository provenance and an accepted immutable digest.

## 5. Required remediation order

1. Accept WI-OI-047 scope, named reviewers, supported deployment profiles and object-storage decision.
2. Define one machine-verifiable startup/deployment contract sourced from checked-in application code.
3. Add reproducible multi-stage application/migration images, non-root/read-only runtime behavior and
   immutable-digest/SBOM/provenance production flow.
4. Correct Helm and Compose configuration names, secret/config separation, probes, dependencies and web
   upstreams.
5. Make the credential/bootstrap flow generate or require every necessary key/reference without printing
   or committing secrets.
6. Add static drift tests that fail when runtime requirements, routes, manifests or profile examples
   diverge.
7. Run real clean-start, readiness, Configuration journey, restart, rolling upgrade, backup/restore,
   alert, TLS and accessibility rehearsals for each claimed profile.
8. Obtain independent operator, Architecture, Security, QA, Accessibility and Product acceptance.

Only then may WI-OI-039/F2 close or be explicitly narrowed to a local reference implementation.

### 5.1 Owner scope decision after audit

On 2026-09-22 the Product Owner/Solution Architecture reviewer selected the narrowing option and then
limited current execution to `configuration-local-development-v1` using the existing Docker/PostgreSQL/
MinIO stack. Customer-managed production and cloud infrastructure are `DEFERRED_EXTERNAL`. This does not
erase the audit findings: the local profile must still repair startup, probe, signing, local image-build,
object-storage-boundary and evidence contradictions before Local Foundation Ready. F3/TP-1 proves Tenant
Profile values with authoritative runtime scope; production remains uncertified.

## 6. Protected work

The paused CMMS import/export/metadata paths and hashes recorded in WI-OI-044 were not read for
implementation or modified by this audit. WI-OI-047 must not use them as deployment evidence or alter them.

## 7. Inspected artifact fingerprints

| Artifact | SHA-256 |
| --- | --- |
| `infra/compose/compose.yaml` | `26c610e983219e3571a797fb043c91aa36513d1d640bf61d326f8eaf41ddc001` |
| `infra/compose/.env.example` | `8f91172cc6f007f5a509f9cb0fcd764c59dcdde5412b9703d590b1d170c40226` |
| `infra/compose/README.md` | `fbbc38226bbad7db78c84f563092dac4d19554b3710d75b343f4e0730426b223` |
| `infra/compose/scripts/generate-credentials.sh` | `325b92f1bec325f50054d49120e2c47ba4380e4e9f0d51c9f168d5621765282f` |
| `infra/helm/workflow-platform/templates/api.yaml` | `3f214598198090022032b4d4e0325d2ef4b9dc915846ed83ede7d7392b93f148` |
| `infra/helm/workflow-platform/templates/web.yaml` | `ee08ac4892cbdf1d8e38ef1ce4f59349c9921871ca6c0d03f25e8563ab0bcd92` |
| `infra/helm/workflow-platform/templates/migrations.yaml` | `283b0f0784f262e93cfd0d4d17efe1726cffd4691c508a5a4a22120beceaf30d` |
| `infra/helm/workflow-platform/values.yaml` | `57c0efeeaafc5df571b660ae66698f31c09f7fc7bd8d390454ae67570d0ed615` |
| `apps/playground-api/src/config/runtime-config.ts` | `cb386a944c064705dff28b07066ab9fb7e3570e20801b302ee9c6dec77223e76` |
| `apps/playground-api/src/main.ts` | `7febaf5fdfb17fdd1ba7d6e61a3a94396bcafe9fe8ff5e0ccdf60bf800c0acde` |
| `apps/playground-api/src/platform.controller.ts` | `ede0c9c7797c6a3d23b393e0eb61dba411358cddc40e0ec7d23ab24f46e443fc` |
| `apps/workflow-platform/lib/control-plane.ts` | `cf5cd1ad780e4dc0c150c40a438b0760be22845c4e179ca4073b582f7d2e7305` |
| `apps/workflow-platform/lib/authenticated-upstream.ts` | `1dc1fd1cb4d92a53a480c872b67042236e53534135b52c985627b7097960ed4e` |
