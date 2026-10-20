# WI-OI-120bo: UAT module-host replaced by a main-branch build: restore, then isolate test stacks

- **Status:** Built 2026-10-20. UAT restored and cleaned (owner); guard, isolated test stack and green P2P/O2C proven. Done needs the owner's recorded acceptance; the migration and guard changes need an independent review before they reach a release.
- **Work item:** WI-OI-120 (operations; incident).
- **Severity:** production (UAT is production, plan v3 decision 0.7a).

## What happened (verified read-only, 2026-10-20)

- On 2026-10-19 at 10:39 UTC, `gigalibs-configuration-local-module-host-1` was recreated from the **main worktree**:
  - compose working directory `/Users/rayapudi/dev/gigalibs/infra/compose`;
  - image `gigalibs/module-host:cab1dc5abe52-a0222fd1c8fd`;
  - release label `local-20261019T100300Z-cab1dc5abe52-…`.
- **Cause.** `infra/compose/scripts/up-table1-module-host.sh` (untracked, from the Table 1 / P2P-O2C test work) runs
  `up -d --no-deps --force-recreate module-host` and `kernel-worker` on compose project `gigalibs-configuration-local`,
  which is UAT's own project.
- **Effect.** The main-branch module-host carries unreleased Table 1 and Table 2 code. It exits with code 1 about
  7 seconds after each start, because it expects migrations UAT does not have (Finance 10–11, Inventory 5). It had
  restarted **713 times**, so the modules module-host serves (Product Catalogue, Inventory, Procurement, Orders,
  Finance) were **down on UAT for about 16.7 hours**.
- **Kernel-worker** was not recreated: it is still on release `1d8d2634`.
- **The database is unaffected.** Every module's migration ledger is at its released version (Finance 9, Inventory
  4, Product Catalogue 2, Procurement 3, Orders 3, CMMS 22), with nothing applied since 2026-10-18. No down
  migration is needed.
- **The P2P/O2C test** (`pnpm test:minimal-p2p-o2c`) timed out waiting for Product Catalogue's organization replica.
  It could never pass: module-host was crash-looping, and the organization projection it waits for is unreleased
  Table 1 code.

## Restore (owner runs)

1. Backup `gigalibs_backup_20261020_032227Z` was taken first. The deploy tool's `--check` verified every release image.
2. The tool's own per-service step, for module-host only, from the release worktree with the release's settings and a
   clean environment (`config --images` resolves `gigalibs/module-host:1d8d2634b8f2-c6148e918ff0`):

```
cd /Users/rayapudi/dev/gigalibs-release-wf120u/infra/compose && env -i PATH="$PATH" HOME="$HOME" docker compose --env-file .env --env-file .env.modules --env-file .env.workforce --env-file .env.geospatial --env-file .env.module.host --env-file .env.module.product-catalogue --env-file .env.module.universal-inventory --env-file .env.module.universal-procurement --env-file .env.module.universal-orders --env-file .env.module.financial-operations --env-file .env.database -f compose.yaml -f compose.modules.local.yaml -f compose.workforce.local.yaml -f compose.geospatial.local.yaml -f generated/compose.module-host.yaml -f compose.database.yaml up -d --no-deps --no-build --pull never module-host
```

3. Verify read-only:
   - module-host is healthy, on tag `1d8d2634b8f2-c6148e918ff0`, with release label `local-20261018T102534Z-…`;
   - its restart count stops rising;
   - the migration ledgers are unchanged.

## Restore verified (read-only, 2026-10-20 03:27 UTC)

- **module-host** is running and healthy with 0 restarts:
  - image `gigalibs/module-host:1d8d2634b8f2-c6148e918ff0`, release label `local-20261018T102534Z-1d8d2634b8f2-c6148e918ff0`;
  - compose working directory is the release worktree.
- **`/health/ready` returns 200** with all five modules ready. Each reports its released migration: Financial
  Operations 9, Product Catalogue 2, Universal Inventory 4, Universal Orders 3, Universal Procurement 3.
- **All 21 schema ledgers are unchanged**, plus the Prisma control-plane ledger.
  - The newest entry anywhere is CMMS 22 on 2026-10-18, which is part of release `1d8d2634`.
  - Prisma's newest is 2026-10-08.
  - AR (14), currency (2) and tax (2) date from September and early October, before this incident.
- **Every running UAT service is on release `1d8d2634` with 0 restarts.** That covers web, api, kernel-worker,
  module-host, CMMS, workforce, geospatial, analytics, connector-hub and postgres.

## Also found

- **The project name is the root cause.** `infra/compose/compose.yaml` sets `name: gigalibs-configuration-local`, so
  every compose command run from the main worktree acts on UAT.
  - That includes the committed `infra/compose/scripts/up-ar-api.sh` (WI-OI-120he). It runs `up -d ar-api`
    *with* dependencies.
  - On 2026-10-19 at 03:58 UTC it recreated the control-plane `migrations-1` from main build `a49137e01e5e`, and
    created `ar-migrations-1` and `ar-api-1`.
- **Two main-branch migration runners started on UAT. Both failed before touching data.**
  - `migrations-1` (control plane, 2026-10-19 03:58 UTC) exited 1 with "Connection terminated unexpectedly".
  - `financial-operations-migrations-1` (main build `cab1dc5a`, 10:37 UTC) exited 1 with a PostgreSQL `auth_failed`.
  - The ledgers above confirm that neither applied anything.
- **Six more main-branch containers sit in UAT's project, created but never started:** the `ar-api`,
  `ar-migrations`, product-catalogue, universal-orders and universal-procurement migration containers, plus
  `db1d7f40352d_…-universal-inventory-migrations-1`, which a recreate abandoned partway.
  - All eight stopped containers carry main-branch code.
  - Anyone running `docker start` on one, or running compose from the main worktree, would aim unreleased migrations
    at UAT.
- **Redis was recreated from the main worktree** on 2026-10-19 at 10:37 UTC.
  - Its effective definition matches the release: same image digest, command, password, health check and network.
    Release services log no Redis errors since then.
  - Only its provenance labels name `cab1dc5a`. The next release deploy will reset them, so no action is needed now.
  - Redis is non-persistent by design (no volume, saving off), so any BullMQ jobs queued at 10:37 were dropped.

## Cleanup (owner runs, after approval)

This removes the eight stopped main-branch containers. Plain `docker rm` refuses any running container. The next
release deploy recreates every release migration container from release images.

```
docker rm db1d7f40352d_gigalibs-configuration-local-universal-inventory-migrations-1 gigalibs-configuration-local-ar-api-1 gigalibs-configuration-local-ar-migrations-1 gigalibs-configuration-local-financial-operations-migrations-1 gigalibs-configuration-local-migrations-1 gigalibs-configuration-local-product-catalogue-migrations-1 gigalibs-configuration-local-universal-orders-migrations-1 gigalibs-configuration-local-universal-procurement-migrations-1
```

## Prevention (done 2026-10-20)

Cursor built the first version; review found five defects (below), which were fixed in this session.

1. **One rule for UAT.** `infra/compose/scripts/release-worktree.sh`: only a checkout on a `release/*` branch may act on
   UAT. It reads the checkout's own branch; there is no override and no hard-coded path. 29 scripts that act on the
   database or containers named in `.env` (`restore.sh`, `run-phase-a-certification.sh`, every `verify-*.sh` that
   stops, restarts or `exec`s into a container) call `gigalibs_require_release_worktree` before anything else.
   `backup.sh` (read-only `pg_dump`) and `build-*.sh` (remove only their own build containers) are exempt.
2. **The compose wrapper.** `compose-modules-local.sh` (used by `up-ar-api.sh`, `up-table1-module-host.sh`,
   `up-test-stack.sh`) passes `-p` explicitly. Outside the release worktree it allows only project `gigalibs-test`
   and forces the `.env.test*` files, so it cannot reach UAT's project or UAT's credentials. Sourcing from zsh works again.
3. **The isolated test stack** is project `gigalibs-test`: its own PostgreSQL (`test-postgres`, volume
   `gigalibs-test-database`, `127.0.0.1:5441`), network `gigalibs-test`, Redis, web `127.0.0.1:5181`, api `127.0.0.1:3334`.
   - Credentials: `generate-test-stack-credentials.sh` writes `infra/compose/.env.test*` and `e2e/test.env` (mode 0600,
     gitignored, refuses to overwrite, refuses unless gitignored). Every password is random; none is in the repository.
   - Accounts are test-only (`e2e.admin@gigalibs-test.invalid`, `e2e.approver@gigalibs-test.invalid`, tenant
     "GigaLibs Test Stack"); `seed-test-e2e-principals.mjs` reads them from `e2e/test.env` and has no defaults.
   - Order: `generate-test-stack-credentials.sh`, `build-test-stack-images.sh`, `up-test-stack.sh`, then
     `cd e2e && pnpm test:minimal-p2p-o2c`.
4. **The E2E cannot write to UAT by accident.** `pnpm test:minimal-p2p-o2c` loads `e2e/test.env` and stops if it is
   missing (no fallback to UAT's address). The spec skips itself unless `GIGALIBS_E2E_TARGET=test-stack`, or
   `GIGALIBS_ALLOW_UAT_WRITE_E2E=1` for an owner-approved UAT run.
5. **Secrets stay out of git and images.** `.gitignore` covers `e2e/*.env`; `.dockerignore` covers `*.env` and
   `**/*.env`. A scan of UAT's four release images (`1d8d2634b8f2-c6148e918ff0`) found no env file inside.
6. **Migrations.** Five unreleased migrations were corrected in place (none is in the release or applied on UAT):
   Finance 10 and 11 and Inventory 5 now record their own ledger rows like every other migration; Procurement 4 and
   Orders 4 check `"tenantId"` / `"archivedAt"`, the real Prisma columns of `parties`.

### Review findings on Cursor's first version (all fixed)

| Finding | Fix |
| --- | --- |
| `e2e/dev.env` (credentials) was not gitignored | `e2e/*.env` ignored; generator refuses to write secrets unless ignored |
| Project `gigalibs-dev` already belonged to `pnpm docker:dev` (`gigalibs-postgres`, port 5440, volume `gigalibs_dev_postgres_data`); the suggested "orphan" cleanup would have removed it | Project renamed `gigalibs-test`; `gigalibs-postgres` verified unchanged (same id, started 2026-10-14T09:52:58Z) |
| The green run depended on a hand-applied `CREATE OR REPLACE` on the test database | Images rebuilt with the fixed migrations; fresh database; no manual SQL |
| `restore.sh`, `run-phase-a-certification.sh` and 27 verify scripts could still act on UAT from the main worktree | Release-worktree rule above, with a static test that fails on any new unguarded script |
| Default `pnpm test:minimal-p2p-o2c` targeted UAT and wrote business records there | Defaults to the test stack; spec refuses UAT without explicit approval |
| A fixed password for accounts reusing UAT's admin and approver emails was in two seed scripts and `dev.env.example` | Random per-stack passwords in `e2e/test.env`; test-only `.invalid` accounts; the broken duplicate `seed-dev-e2e-principals-in-api.sh` (no `-i`, heredoc never reached node) removed |
| `up-table1-module-host.sh` read `MODULE_HOST_IMAGE` from `.env.module.host` whatever the project | Reads the wrapper's `MODULE_HOST_ENV` |
| Release worktree identified by a hard-coded path | Identified by its `release/*` branch |

Cursor's `gigalibs-dev` containers, network `gigalibs-dev` and volume `gigalibs-dev-database` were removed by exact
name, with its `infra/compose/.env.dev*` files and `e2e/dev.env`. **Disclosure:** a search during the review printed
the superuser password of that throwaway `gigalibs-dev` database into the session; the database and its volume no
longer exist, so the credential is dead.

## Done when

- [x] module-host is healthy on release `1d8d2634`, and the restarts have stopped (2026-10-20 03:27 UTC).
- [x] The eight stopped main-branch containers are removed from UAT's project (owner, 2026-10-20; verified: every UAT container is on release `1d8d2634` except Redis, whose definition matches the release and whose labels the next deploy resets).
- [x] The guard is in place, with a test that it refuses UAT outside the release worktree.
- [x] The isolated stack runs on its own database, network and credentials.
- [x] The P2P/O2C test runs green on the isolated stack, on a fresh database with no manual SQL.

## Evidence (2026-10-20, main worktree)

**Guard tests** (`pnpm test:compose-modules-local-guard`):

```text
PASS: feature checkout refuses gigalibs-configuration-local
PASS: feature checkout refuses any project other than gigalibs-test
PASS: feature checkout defaults to gigalibs-test with .env.test* files
PASS: feature checkout cannot point gigalibs-test at the UAT .env files
PASS: release checkout keeps UAT's project from compose.yaml
PASS: 29 UAT-only scripts refuse outside the release worktree without calling docker
PASS: a release/* checkout is recognised as the release worktree
PASS: every script that acts on containers is guarded
All compose guard tests passed.
```

**Images** `cab1dc5abe52-1883ed4fa12d` (control-plane-migrations, playground-api, workflow-platform, module-host),
built by `build-test-stack-images.sh`. The module-host image's `000004_procurement_party_reference_guard.up.sql`
checks `"tenantId"` / `"archivedAt"`.

**Fresh database** (`gigalibs-test-test-postgres-1`, read-only): ledgers Finance 11, Inventory 5, Product Catalogue 2,
Procurement 4, Orders 4; `gigalibs_procurement.require_active_party` and `gigalibs_orders.require_active_party`
installed by the migrations with the Prisma columns. All twelve containers carry project label `gigalibs-test`;
every migration container exited 0; api, web, module-host, kernel-worker, redis and postgres are healthy.

**P2P/O2C** (`cd e2e && GIGALIBS_E2E_NONINTERACTIVE=1 pnpm test:minimal-p2p-o2c`):

```text
  ✓  1 [chromium] › specs/minimal-p2p-o2c-compose-flow.spec.ts:129:7 › Minimal P2P and O2C on local compose › P2P: requisition through approved vendor bill via module API (1.0m)
  ✓  2 [chromium] › specs/minimal-p2p-o2c-compose-flow.spec.ts:247:7 › Minimal P2P and O2C on local compose › O2C: quote through customer invoice via module API (13.2s)

  2 passed (1.3m)
```

**UAT write guard:** without `GIGALIBS_E2E_TARGET=test-stack` (dummy credentials, dead port) the spec reports
`2 skipped`; a missing `e2e/test.env` stops the run with an error.

**UAT unchanged** after all of the above: every running service on `1d8d2634b8f2-c6148e918ff0`; module-host
restarts 0, created 2026-10-20T03:25:02Z; ledgers Finance 9, Inventory 4, Product Catalogue 2, Procurement 3,
Orders 3, CMMS 22.

## Remaining risk and follow-up

- **A hand-typed `docker compose` in the main worktree's `infra/compose` still defaults to UAT's project**, because
  `compose.yaml` keeps `name: gigalibs-configuration-local`. Closing it needs `name:` changed on main and the deploy
  tool passing `-p gigalibs-configuration-local` explicitly: a release-worktree change for a separate card.
- **Storage is not isolated:** the test stack's `STORAGE_ENDPOINT` is the local MinIO, with a random key that cannot
  authenticate. The P2P/O2C flow does not use storage.
- **The next release deploy recreates the one-shot migration containers** removed in the cleanup (control-plane
  `migrations` and the five module-host module migrations) from release images; nothing runs them before then.
