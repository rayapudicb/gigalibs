# Security review request: WI-OI-120cd, SPEED on UAT

- **Release:** `release/speed-uat` at `23ab3916` (worktree `gigalibs-release-speed`), on top of the running UAT release
  `9734dca9`. Review the range `9734dca9..23ab3916` (one commit, 177 files).
- **Why a review:** plan v3 rule 2. The release adds a module schema and migrations, roles and permissions, gateway
  routes, a kernel job that signs a context for a module, and a SECURITY DEFINER function.
- **Author:** Claude Code (this session). The reviewer must be someone else; record the reviewer's name in
  `.pi/tasks/WI-OI-120cd.md`.
- **Owner decision behind it:** SPEED on UAT (2026-10-21), reversing plan v1.4 D1 and D7 for UAT. SPEED stays PLANNED:
  it opens only under the UAT preview and only for a workspace that has it switched on.

## What to look at

1. **New schema `gigalibs_speed`** (`modules/process-safety-screening/db/migrations/000001` to `000005`):
   - every table carries `tenant_id` with forced row-level security and a tenant policy;
   - `audit_events` and `results` are append-only for the runtime role; finished dossiers can neither change nor be
     deleted (trigger);
   - `list_dossier_tenants(p_limit)` is SECURITY DEFINER with a fixed `search_path`, returns tenant ids only, and is
     revoked from PUBLIC; it is the dossier worker's only cross-tenant read, as the relays' definer functions are.
2. **Organization delivery** (`apps/playground-api/src/kernel-worker/module-call.job.ts`):
   `process-safety-screening.organization-sync`, a copy of Product Catalogue's: the kernel signs a context for SPEED's
   audience only, as the member who activated the version, requiring `organization:activate`.
3. **Access** (`modules/process-safety-screening/module.yaml`, `apps/api/src/module.spec.ts`): every route names a
   permission; the five SPEED roles; members read only the sites their organization access covers (other sites answer
   "not found"). Plan v1.4 §4.4 lets `speed.routes.read` generate dossiers and export; please confirm that is acceptable.
4. **Dossiers** (`apps/api/src/dossiers/`): requests are idempotent; files are stored under per-attempt keys; a
   download recomputes the SHA-256 and refuses a mismatch (409, audited); the store key can use only SPEED's bucket
   (`infra/compose/scripts/create-speed-storage.sh`, owner-run; the secret goes on standard input, never printed).
5. **Metadata panels (S2b)** (`packages/configuration-core`, `packages/configuration-react`, `packages/contracts/src/
   configuration/panels.ts`): a window may place only components from a closed, generated catalogue with typed,
   validated props; an unknown component or wrong prop is refused at publish.
6. **Generator** (`scripts/module-manifests.mjs`): `spec.runtime.optionalEnvironment` passes only the module's own
   prefixed settings, never a generated one, as `${NAME:-}`.
7. **Build** (`infra/compose/docker/Dockerfile`, deployment profile): Debian pins moved to `ca-certificates
   20250419~deb12u2` and `openssl 3.0.22-1~deb12u1`, the versions Debian serves now.
8. **Kept as running:** CMMS's `cmms-work-orders` window baseline is the one `9734dca9` ships (its 120bu window file names
   an undeclared `technician-ref`); no other module changes.

## Evidence

- SPEED tests: 143 (60 unit, 53 PostgreSQL of which 11 against MinIO, 30 panel renders); conformance 15/15; the
  speed-lab instance ran the whole journey through the real gateway (WI-OI-120cc).
- Release checks and their known base failures: `.pi/tasks/WI-OI-120cd.md`.
- Migration rehearsal on a copy of UAT: recorded on the card before the deploy.
