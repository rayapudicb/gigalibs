# GigaLibs Configuration local profile

This directory implements `configuration-local-development-v1` for local development and demos. It is
not a customer-managed production bundle, a cloud deployment, an air-gap package or release evidence.

## Boundary

The profile runs only three application artifacts:

- one-shot PostgreSQL migrations;
- the NestJS control-plane API; and
- the Next.js workflow web application.

It reuses the real PostgreSQL 16 and digest-pinned MinIO services owned by
`docker/docker-compose.dev.yml`. It deliberately does not duplicate PostgreSQL or MinIO and does not make
Redis a Configuration dependency. The API and web ports bind to loopback only.

WI-OI-059 adds the optional `module-runtime-local-development-v1` overlay for Connector Hub and Analytics.
It uses exact Compose service DNS, separate ordered migration jobs, non-superuser runtime roles and no
host-published module ports. It does not remove Reports containment or authorize production/cloud use.

WI-OI-060 adds a separate `workforce-runtime-local-development-v1` overlay. It installs the empty
canonical `gigalibs_workforce` security/delivery foundation and runs a hidden health/auth runtime. The
GigaOps business UI, business APIs, CMMS People/Dispatch and payroll claims remain contained.

The machine-readable source of truth is
`config/deployment-profiles/configuration-local-development-v1.json`. Static drift is checked by
`node scripts/verify-configuration-local-profile.mjs`.

## Current implementation state

LOCAL-1 provides the runtime contract, corrected Compose render and operator bootstrap. Application
containers are not runnable until LOCAL-2 adds and builds the checked-in API, web and migration image
definitions. Do not substitute registry images or change `pull_policy: never` to make startup appear to
work.

## Prerequisites

- Docker 24+ with Compose v2.20+;
- Node.js 22+ and the repository's pinned pnpm version;
- the repository root `.env` containing the credentials already used by local PostgreSQL and MinIO; and
- the observed `gigalibs-postgres` and `docker-minio-1` dependency containers running.

From the repository root:

```bash
infra/compose/scripts/check-prerequisites.sh
```

If the observed dependency containers exist but are stopped, restart those exact containers:

```bash
docker start gigalibs-postgres docker-minio-1
```

The running PostgreSQL container was created by Compose project `gigalibs-dev` under the historical service
name `postgres`, while the current source file names that service `control-postgres`. Do not run `compose
up` to replace it until a separately verified volume migration/reconciliation proves the target. MinIO is
owned by Compose project `docker` and service `minio`.

## Generate the local profile environment

The bootstrap reads the existing dependency connection values from the repository root `.env`, generates
new local-only application secrets and an Ed25519 Configuration-package signing key, and writes
`infra/compose/.env` with mode `0600`. It never prints secret values.

```bash
infra/compose/scripts/generate-credentials.sh
```

The command fails instead of overwriting an existing local profile. Re-run it only after intentionally
moving the old file to a protected backup. The generated source-state fingerprint covers tracked and
untracked, non-ignored source files so dirty local builds are not represented by the Git commit alone.
After an intentional source-only change, run `infra/compose/scripts/refresh-source-identity.sh`; it updates
the revision, source-state hash and local image tags atomically without rotating or printing secrets.

For the optional module runtime, generate a separate secret file and build the two module images:

```bash
infra/compose/scripts/generate-module-runtime-credentials.sh
infra/compose/scripts/refresh-source-identity.sh
infra/compose/scripts/build-module-images.sh
```

Start or reconcile the base stack plus the module overlay together:

```bash
docker compose \
  --env-file infra/compose/.env \
  --env-file infra/compose/.env.modules \
  -f infra/compose/compose.yaml \
  -f infra/compose/compose.modules.local.yaml \
  up -d
```

The one-shot module migration containers provision dedicated non-superuser, non-BYPASSRLS runtime roles.
The application images never receive the migration/admin database URL.

For the bounded Workforce foundation, generate its isolated local credentials, refresh source identity,
build and verify the exact image:

```bash
infra/compose/scripts/generate-workforce-runtime-credentials.sh
infra/compose/scripts/refresh-source-identity.sh
infra/compose/scripts/build-workforce-image.sh
infra/compose/scripts/verify-workforce-runtime.sh
```

Start the hidden runtime with the base profile when needed:

```bash
docker compose \
  --env-file infra/compose/.env \
  --env-file infra/compose/.env.workforce \
  -f infra/compose/compose.yaml \
  -f infra/compose/compose.workforce.local.yaml \
  up -d
```

No Workforce service port is published to the host and the web BFF stays on its authenticated `503`
containment response until a later real business vertical is certified.

## Validate without starting containers

```bash
node scripts/verify-configuration-local-profile.mjs
docker compose --env-file infra/compose/.env -f infra/compose/compose.yaml config --quiet
```

The verifier rejects obsolete aliases, missing source-required API settings, uncontracted environment
keys, duplicate dependency services, a Redis dependency, remote pulls and incorrect probe paths.

## Start and inspect

After LOCAL-2 builds the exact image names recorded in `infra/compose/.env`:

```bash
infra/compose/scripts/build-images.sh
docker compose --env-file infra/compose/.env -f infra/compose/compose.yaml up -d
docker compose --env-file infra/compose/.env -f infra/compose/compose.yaml ps
curl --fail http://localhost:3333/api/v1/health
curl --fail http://localhost:3333/api/v1/ready
curl --fail http://localhost:5180/api/health/live
curl --fail http://localhost:5180/api/health/ready
```

API liveness proves only that the API process serves HTTP. API readiness includes PostgreSQL. Web
liveness proves the Next.js process serves HTTP; web readiness depends on control-plane readiness. These
routes must return an unavailable status when their declared dependency is unavailable.

## Solution builds

A solution (`solutions/<name>.yaml`) selects the modules one client gets. Build its web image with:

```bash
infra/compose/scripts/build-solution-web-image.sh manufacturing
```

The script copies the working tree and regenerates the catalogue, gateways, navigation and pages for that solution
in the copy (`module-manifests.mjs --solution <name> --root <copy>`). It then builds the `web` target as
`gigalibs/workflow-platform:<source identity>-<solution>`. The repository itself always holds the full build.

## Disk space

Every build creates a new image tag and more build cache, and Docker keeps both until they are removed.
Each build script first runs `scripts/docker-disk-guard.sh check`. It stops the build when the disk has
less than 60 GB free (`GIGALIBS_MIN_FREE_GB`), after first trying a cleanup. Run the cleanup yourself once
a deploy is healthy:

```bash
infra/compose/scripts/docker-disk-guard.sh prune --dry-run   # list what would be removed
infra/compose/scripts/docker-disk-guard.sh prune
```

The cleanup keeps every image a container uses, the newest two tags of each `gigalibs/*` repository (the
current build and one rollback; `GIGALIBS_KEEP_IMAGE_VERSIONS`), the pinned base images and all images of
other projects. It trims the build cache to 20 GB (`GIGALIBS_BUILD_CACHE_MAX`) and never touches volumes.
Never use `docker system prune --volumes`, `docker volume prune` or Docker Desktop "Clean / Purge data":
they delete the local PostgreSQL volume.

## Local database backup and restore

Create a PostgreSQL custom-format dump plus checksum and non-secret metadata:

```bash
infra/compose/scripts/backup.sh
```

Restore is destructive to the named local database. The script verifies the checksum when present, stops
the local application services, requires the operator to type the database name, and fails on any
`pg_restore` error:

```bash
infra/compose/scripts/restore.sh infra/compose/backups/gigalibs_backup_<timestamp>.dump
```

This is a local database recovery control only. It is not WAL/PITR, cross-host recovery, an external
backup vault or a MinIO backup. Those controls remain `DEFERRED_EXTERNAL`.

## Explicitly deferred

Cloud selection, public DNS/TLS, Kubernetes/HA, external KMS, external object storage, remote image
registry/signature/provenance, external alert delivery, cross-host recovery and G7 production observation
are not provided by this profile and must never be reported as passing because the local stack runs.
