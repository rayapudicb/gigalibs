# Configuration deployment contract v1

Status: LOCAL-1 machine-readable profile implemented under WI-OI-047; runtime certification pending

## 1. Contract purpose

This contract binds the current Local Development Configuration Profile to the settings, secrets, images,
dependencies and probes consumed by the control-plane API, workflow web and migration job. The implemented
profile must be validated automatically against a machine-readable form of this contract.

Contract version is `1`. Unknown keys in the profile document are rejected unless explicitly located in a
versioned extension map. Environment values remain strings at the process boundary and are parsed strictly
by the owning application.

## 2. Profile identity

Every rendered profile records:

| Field | Rule |
| --- | --- |
| `contractVersion` | exactly `1` |
| `profileKey` | exactly `configuration-local-development-v1` for the current local milestone |
| `executionClass` | exactly `LOCAL_DEVELOPMENT`; release profiles require a future contract amendment |
| `environmentKey` | stable non-secret deployment key; F3 contract adds runtime use |
| `releaseId` | immutable release-manifest identifier |
| `sourceRevision` | full source commit |
| `apiImage`, `webImage`, `migrationImage` | revision-qualified local tag plus recorded immutable local image ID |
| `databaseProfile` | Existing local PostgreSQL 16 endpoint/secret reference and local restore-policy ID |
| `storageProfile` | Existing local MinIO endpoint/bucket/secret reference; loopback HTTP explicitly test-classified |
| `publicOrigin` | exact loopback HTTP(S) browser origin for this profile |
| `evidenceId` | immutable certification bundle identifier after G5 |

## 3. Control-plane API required configuration

### Process and origins

- `NODE_ENV=production`
- `API_HOST`
- `API_PORT`
- `CORS_ORIGINS`
- `DATABASE_URL` through a secret reference

`PORT` is not an API alias. `CORS_ORIGINS` contains exact HTTP(S) origins with no path, wildcard or embedded
credential.

### Authentication and tenant control

- `JWT_ACCESS_SECRET` (secret, at least 32 characters)
- `JWT_ACCESS_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`
- `CONTROL_PAYLOAD_KEY_VERSION`
- `CONTROL_PAYLOAD_ENCRYPTION_KEY` (secret, canonical base64 32 bytes)
- `CONTROL_PAYLOAD_PREVIOUS_KEYS_JSON` (optional secret JSON key ring)
- `OIDC_REDIRECT_URI` (required when tenant OIDC is supported by the profile)
- `PLATFORM_TENANT_BASE_DOMAIN` (required when subdomain provisioning is supported)

`JWT_REFRESH_SECRET` is not credited as a runtime requirement until an accepted implementation consumes
it. Profiles must not imply a security control merely by injecting an unused variable.

### Workflow and execution-event compatibility

- `WORKFLOW_SCHEMA_VERSION`
- `WORKFLOW_COMPILER_VERSION`
- `WORKFLOW_PUBLISH_MAX_RETRIES`
- `EXECUTION_EVENT_SOURCE_ID`
- `EXECUTION_EVENT_SIGNING_SECRET` (secret, at least 32 characters)
- `EXECUTION_EVENT_MAX_SKEW_SECONDS`

These are required by the current API startup even though F2 does not certify the execution plane.

### Connector policy

- `CONNECTOR_HTTP_ALLOWED_HOSTS`
- `CONNECTOR_HTTP_ALLOWED_PORTS`
- `CONNECTOR_HTTP_ALLOW_INSECURE=false`
- `CONNECTOR_HTTP_ALLOW_PRIVATE_NETWORKS=false` unless separately accepted
- `CONNECTOR_HTTP_TIMEOUT_SECONDS`
- `CONNECTOR_HTTP_MAX_RESPONSE_BYTES`
- `CONNECTOR_DATABASE_ALLOWED_HOSTS`
- `CONNECTOR_DATABASE_ALLOWED_PORTS`
- `CONNECTOR_DATABASE_ALLOW_PRIVATE_NETWORKS=false` unless separately accepted
- `CONNECTOR_FAILURE_THRESHOLD`
- `CONNECTOR_CIRCUIT_COOLDOWN_SECONDS`

An explicitly empty host list denies all hosts. It is not omitted and does not mean wildcard access.

### Object storage

- `STORAGE_ENDPOINT` (HTTPS in production; no embedded credential)
- `STORAGE_REGION`
- `STORAGE_BUCKET`
- `STORAGE_ACCESS_KEY` (secret)
- `STORAGE_SECRET_KEY` (secret)
- `STORAGE_FORCE_PATH_STYLE`
- `STORAGE_ALLOW_INSECURE=true` only when `STORAGE_ENDPOINT` resolves to loopback/local Docker networking
  in `LOCAL_DEVELOPMENT`; release profiles require `false`
- `STORAGE_PRESIGN_SECONDS`
- `STORAGE_MAX_FILE_BYTES`
- `STORAGE_CLEANUP_INTERVAL_SECONDS`
- `STORAGE_CLEANUP_BATCH_SIZE`

### Retention and control outbox

- `RETENTION_WORKER_INTERVAL_SECONDS`
- `RETENTION_ENVIRONMENT_BATCH_SIZE`
- `RETENTION_EVENT_BATCH_SIZE`
- `CONTROL_OUTBOX_POLL_INTERVAL_SECONDS`
- `CONTROL_OUTBOX_BATCH_SIZE`
- `CONTROL_OUTBOX_CLAIM_TIMEOUT_SECONDS`
- `CONTROL_OUTBOX_MAX_ATTEMPTS`
- `CONTROL_OUTBOX_RETRY_BASE_SECONDS`
- `CONTROL_OUTBOX_RETRY_MAX_SECONDS`

### Observability

- `OBSERVABILITY_METRICS_TOKEN` (secret, at least 32 characters)

The token is mounted only into the API and authorized scraper. It is not placed in browser/web public
configuration.

## 4. Capability-gated API configuration

These pairs are both present or both absent. Absence causes the capability to return its existing explicit
unavailable response; it does not prevent unrelated API startup:

- Configuration package signing:
  `CONFIGURATION_PACKAGE_SIGNING_KEY_ID`,
  `CONFIGURATION_PACKAGE_SIGNING_PRIVATE_KEY_BASE64` and optional
  `CONFIGURATION_PACKAGE_TRUSTED_PUBLIC_KEYS_JSON`.
- Tenant export signing:
  `TENANT_EXPORT_SIGNING_KEY_ID`, `TENANT_EXPORT_SIGNING_PRIVATE_KEY_BASE64`.

When Tenant Export is enabled, its poll/batch/claim/retry/expiry settings are rendered explicitly even if
the current implementation has code defaults. Production policy is visible in the profile:

- `TENANT_EXPORT_POLL_INTERVAL_SECONDS`
- `TENANT_EXPORT_BATCH_SIZE`
- `TENANT_EXPORT_CLAIM_TIMEOUT_SECONDS`
- `TENANT_EXPORT_MAX_ATTEMPTS`
- `TENANT_EXPORT_RETRY_BASE_SECONDS`
- `TENANT_EXPORT_RETRY_MAX_SECONDS`
- `TENANT_EXPORT_EXPIRY_HOURS`

`CONFIGURATION_PACKAGE_SIGNING_KEY` is an invalid obsolete alias and must fail drift validation.

## 5. Workflow web contract

Required for the Local Development Configuration Profile:

- `NODE_ENV=production`
- `PORT`
- `CONTROL_PLANE_API_URL` using the internal API origin
- `BFF_MAX_REQUEST_BYTES`
- `COOKIE_SECURE=false` only for the exact loopback HTTP origin in `LOCAL_DEVELOPMENT`; release profiles
  require `true`

Conditional capabilities:

- `EXECUTION_PLANE_API_URL` only when workflow/execution routes are enabled and certified.
- `PLATFORM_CONTEXT_PRIVATE_KEY` and the corresponding API public key/audience only for signed
  cross-service module calls.
- Module-specific service URLs only for modules enabled in the profile.

`CONTROL_PLANE_URL` is an invalid obsolete alias. `NEXTAUTH_URL`/`NEXTAUTH_SECRET` are not evidence because
the inspected web authentication path does not consume them.

No secret may use a `NEXT_PUBLIC_` name. Public environment labels are non-authoritative presentation only.

## 6. Migration contract

- Image contains the exact `packages/db` Prisma schema, configuration and migrations associated with the
  release.
- Entrypoint runs `pnpm --dir packages/db db:migrate` or an equivalent reviewed immutable command from the
  correct workspace context.
- Only `DATABASE_URL` and required TLS/CA references are exposed to the migration job.
- Migration job has no web/API signing keys, connector credentials or object-store credentials.
- Deadline, retries and logs are bounded. Failure blocks rollout.
- Release evidence records migration history before/after and physical/semantic verification.

## 7. Probe contract

| Component | Kind | Route/command | Dependency meaning |
| --- | --- | --- | --- |
| API | startup | process exits non-zero on invalid config | config parsed and server initialized |
| API | liveness | `GET /api/v1/health` | process serves HTTP |
| API | readiness | `GET /api/v1/ready` | mandatory ready dependencies accepted by design |
| Web | liveness | new exact versioned health route | web process serves HTTP |
| Web | readiness | new exact versioned readiness route | control-plane readiness reachable |
| Migration | completion | exit code and migration verification | schema ready for artifact |

Probe timeout, initial delay, period and thresholds are profile parameters with accepted bounds. Probes
never authenticate with a human token and never return credentials or topology details.

## 8. Image contract

Every local image record contains local image ID, source revision, build invocation, base-image identity,
runtime UID/GID, entrypoint, exposed port, included workspace packages and known exceptions. Available
local SBOM/dependency scan output is retained. Registry digest, signature identity, external provenance and
provider container scanning are `DEFERRED_EXTERNAL` and remain mandatory before production release.

## 9. Static drift invariants

CI fails when:

- a required runtime key has no profile mapping;
- a profile injects an obsolete or unknown key without an accepted extension;
- a probe route is absent from the owning application contract;
- a secret is stored in a ConfigMap/value/default or exposed to web public variables;
- an application image lacks a checked-in build definition;
- a locally built application artifact lacks a revision-qualified tag and recorded local image ID;
- migration and application artifacts come from different local source revisions;
- profile documentation claims a component not present in the contract; or
- F3 adds runtime scope configuration without updating every claimed profile and its tests.

## 10. Compatibility and ownership

Adding optional metadata is compatible. Adding a required process setting is conditional and requires the
current profile to update before the consuming application. Renaming/removing a setting, probe or component
is breaking. Infrastructure/SRE owns the profile schema; application owners own their settings and health
semantics; Security owns secret classification; Release Operations owns artifact identity.

`configuration-customer-managed-local-v1` and `configuration-managed-cloud-v1` are reserved release
profiles. HostingRaja and DigitalOcean are unselected candidates, not supported current profile values.
Adding either release profile requires a contract amendment, provider/operator-specific dependency and
responsibility decisions, immutable evidence and a complete acceptance rerun; it cannot inherit the local
development result.

## 11. Artifact media and scan disposition

F2 accepts only the versioned, size-bounded JSON Configuration package handled by the existing import
contract and platform-generated exports. Package import fails closed on unknown media/type, schema,
checksum, signature or signer. Arbitrary files and binary uploads remain unavailable.

No malware-scanner runtime is required or credited in F2. A platform-generated export records
`NOT_APPLICABLE_PLATFORM_GENERATED`; a strict Configuration package records the applicable signature and
schema-verification result without fabricating a malware-scan success. Any future arbitrary-upload or
binary format requires its own accepted scanner/dependency design before it becomes reachable.
