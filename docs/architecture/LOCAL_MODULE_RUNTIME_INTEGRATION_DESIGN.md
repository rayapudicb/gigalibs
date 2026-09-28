# Local Module Runtime Integration Design

Work item: WI-OI-059  
Status: Build baseline  
Deployment boundary: bounded Local Development only

## Decision

Extend the certified Configuration local stack with an additive module-runtime profile. The first profile
contains only Connector Hub and Analytics because together they form the entry boundary for the product
vision: tenant-authorized external data becomes governed analytical data. The profile does not make AR or
any other business domain a dependency.

Each API remains a separately built deployable. Each module owns its schema and ordered migration job.
The workflow web BFF reaches APIs through exact Compose DNS names. Module ports are not published to the
host. PostgreSQL remains the authoritative store; the existing local PostgreSQL instance is reached through
the established local infrastructure boundary.

## Runtime flow

```text
Browser :5180
  -> workflow-platform BFF (verified user, active tenant, entitlement, permission, same-origin)
    -> connector-hub-api:4100
    -> analytics-api:4400
      -> PostgreSQL module schemas
```

The BFF forwards the server-resolved tenant identity. It never accepts a tenant identifier from a browser
body as authority. Analytics additionally uses its bounded local OIDC development issuer; that issuer is
unavailable when insecure local OIDC is disabled and is not a production identity design.

## Trust and failure boundaries

- Upstream URLs are parsed and matched against exact scheme/host/port/path tuples. Configuration cannot
  turn either BFF into an arbitrary server-side request proxy.
- Credentials are environment-injected and are never committed, logged or returned through health APIs.
- Startup is fail-closed for invalid configuration, unavailable persistence and incomplete migrations.
- Liveness and readiness are distinct. Readiness includes PostgreSQL and migration-ledger checks.
- Migration jobs complete before application services start. Previously applied migration files are not
  edited; corrections use a new forward migration.
- All tenant-scoped SQL uses `app.tenant_id`. A non-superuser, non-BYPASSRLS runtime role is required for
  tenant-isolation certification.
- The services return explicit unavailable/error states. No empty-success or fabricated business payload
  is used when an upstream or database is unavailable.

## Image and container contract

- Digest-pinned builder and distroless runtime bases inherited from the existing local profile.
- Dedicated final images for Connector Hub and Analytics.
- Numeric non-root user, read-only root filesystem, `no-new-privileges`, all Linux capabilities dropped.
- Health checks execute inside the service container.
- No module API host-port publication; browser access remains through the authenticated web BFF.

## Data ownership

- `gigalibs_connectors`: connector catalogue, tenant connection registrations, encrypted credential
  envelopes, ingestion journal, sync jobs and connector audit records.
- `gigalibs_analytics`: external source metadata, raw ingested versions, discovered schemas, mappings,
  datasets, semantic definitions, charts, dashboards, report records and lineage/audit records.
- This runtime slice does not authorize direct cross-domain reads. Analytics may consume external data
  registered through its source boundary or later versioned domain fact contracts.

## Deferred decisions

- Managed-cloud and customer-managed topology, secret manager/KMS, public ingress, TLS and DNS.
- Production identity-provider integration and key rotation.
- External PostgreSQL egress allowlists and customer credential onboarding.
- Worker scaling, durable schedule execution, object-store report artifacts and production SLOs.
- WI-OI-043 business-completeness and Universal Reports containment removal.

## Rollback

Stop and remove only the module-runtime overlay services. Do not roll back applied forward migrations.
If application behavior must be reverted, redeploy the preceding web/module images while preserving module
data, then remediate with another forward migration.
