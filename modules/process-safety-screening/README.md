# SPEED Process Safety Screening

SPEED Stage 1 desk screening (WI-OI-120bn; plan `docs/pharma/speed/SPEED-Stage1-Implementation-Plan.md`), a business
module on the core module SDK (ADR-0013), created by `pnpm module:new` (WI-OI-085). It has its own schema
(`gigalibs_speed`) and least-privilege role, runs inside the shared module host, and is reached by the web only through
its manifest-declared gateway `/api/speed`, with a platform context the BFF signs for `gigalibs-process-safety-screening-api`.
Its calculations come from the module-owned engine package `packages/process-safety-engines`.

What it has so far (slice S3, WI-OI-120bw):

- **Projects** at `/api/speed/v1/projects`: list, get, create (idempotent by request key), change (row version and a
  reason) and archive (a reason; never deleted). Each project belongs to one site from the module's organization
  replica, and a member reads and changes only the projects of the units their access covers.
- **The `speed-projects` metadata window** (`dictionary/windows.mjs`) over the module's record dispatcher, at `/speed`.
- **Roles** (plan §3.2, R1): SPEED Chemist, Process Engineer, Safety Reviewer, Quality Assurance and Administrator.

Every route sits behind `AuthorizationGuard` with a `speed.*` permission; every statement runs in
`DatabaseService.withTenantTransaction`; every change writes the audit row (changed fields and the reason) and the
outbox fact in the same transaction; migrations are forward-only, listed in `db/runtime-manifest.txt`, with forced RLS
on `app.tenant_id` for every table.

Database tests (opt-in; a throwaway local PostgreSQL named `speed_proof`, never UAT):

```bash
SPEED_TEST_DATABASE_URL=postgresql://postgres:<password>@127.0.0.1:<port>/speed_proof \
  npx vitest run --config vitest.config.ts modules/process-safety-screening
```

Run it (see `infra/compose/README.md`, "Generated modules"):

```bash
pnpm install && pnpm modules:catalog
infra/compose/scripts/generate-generated-module-credentials.sh process-safety-screening
infra/compose/scripts/build-module-host-image.sh
pnpm module:conformance process-safety-screening --live
```

It stays `readiness: PLANNED` until the R1 slices pass live conformance and independent review, and its schema does not
go live before the platform audit (S2).
