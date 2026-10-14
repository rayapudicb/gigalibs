# WI-OI-120am: UAT gets its own database; the old one stays for development

- **Status:** Approved (owner, 2026-10-14: "approved 120am, D2a, D3a, D4a"; then "commit, D5a"). D1, the window, is
  not chosen yet: the owner names it after the review.
  - Built and rehearsed: `compose.database.yaml`; `scripts/uat/wi-oi-120am/` (prepare, cutover with preflight, run and
    rollback; lib, 6 tests); the deploy tool copy (31 tests); passwords removed from tracked code.
  - Next: the release build, the deploy check, the Security review, then the owner's window.
- **Plan step:** execution plan v3 step 0.3c. It is the owner's decision Q2a in WI-OI-120al and the first slice of O1,
  brought forward.
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** M. An independent Security review comes before the cutover. The owner runs every deploy and the cutover.

## Why (read-only facts, 2026-10-14)

- **No file in the repository defines the UAT database.**
  - It is the container `gigalibs-postgres`, created 2026-08-30 from an older version of
    `docker/docker-compose.dev.yml` (project `gigalibs-dev`, service `postgres`).
  - Its data volume is `gigalibs_dev_postgres_data`.
  - The current dev compose file has a different service (`control-postgres`, behind a profile).
  - A `docker compose … down -v` on the dev project could delete production.
- **It is published on `0.0.0.0:5440`, every network interface.**
  - The UAT services reach it through the Mac: `host.docker.internal:5440`, in `.env`, `.env.modules`,
    `.env.workforce`, `.env.geospatial` and the module host's env.
  - Local development `.env` files point at it too. That is how development servers wrote to production (WI-OI-120al).
- **Its credentials are exposed.**
  - The superuser `gigalibs`'s password was in tracked scripts and is in git history (from 993730b).
  - The control plane and every migration runner connect as `gigalibs`, a superuser that bypasses row security.
  - A test role, `rls_test_user`, can log in.
- **Contents:** one database, `gigalibs`: 1.17 GB, 21 schemas, the extensions pgcrypto, ltree and btree_gist, and 22
  roles (14 can log in).

## Design (to be confirmed with the owner)

1. **A database service in the UAT stack** (`infra/compose/compose.database.yaml`, service `uat-postgres`):
   - `postgres:16-alpine` pinned by digest, with its own named volume;
   - **no published host port**: only the UAT compose network reaches it, as `uat-postgres:5432`, and admin work goes
     through `docker exec`;
   - a health check, resource limits and SCRAM passwords;
   - the deploy tool's file list includes it.
2. **New passwords and roles.**
   - Every role that logs in gets a new random password. The passwords are written only into the UAT env files (mode
     600) and never printed.
   - A script copies the role list (names, attributes, memberships; never passwords) from the old cluster.
3. **Rehearsal on an isolated copy:**
   - create the service from the new compose file, create the roles, and restore the latest backup;
   - restore with 0 errors (unlike the earlier rehearsals, every row-security policy now has its roles);
   - row counts per table and every migration ledger equal to the source;
   - the UAT migration jobs run against it as a no-op.
4. **Cutover** (owner-run, a maintenance window of about 15 minutes):
   - a. stop the UAT services, so no writes happen;
   - b. take a final verified backup of the old database;
   - c. create the roles in `uat-postgres` and restore;
   - d. verify: 0 errors, row counts and migration ledgers equal;
   - e. point every UAT database URL at `uat-postgres:5432` with the new passwords;
   - f. start UAT, then the deploy check, a smoke test and the journey.

   **Rollback:** keep the old env values (mode 600), switch back and start. The old database is untouched by the
   cutover.
5. **The old database becomes development-only.**
   - The dev compose file describes it again, bound to `127.0.0.1`.
   - Its `gigalibs` password is rotated.
   - After the rollback window it is reset, so production data does not sit in development (decision D3).
6. **Tracked code holds no database password.** Remove the connection strings and `5440` fallbacks from:
   - `scripts/migrate-communications-db.mjs`;
   - `scripts/verify-local-tp2-runtime.mjs` and `infra/compose/scripts/verify-local-tp2-runtime.mjs`;
   - the `database.service.ts` of Data Studio, Rule Pro and Workflow Studio.

   `.env.example` points at the development database, with a placeholder password.
7. **The deploy tool** (the copy in the release worktree) adds the database service and its image pin. It refuses to
   deploy while any UAT env file still names `host.docker.internal:5440`.

## Owner decisions

- **D1, the maintenance window:** when (about 15 minutes of downtime).
- **D2, `rls_test_user`:**
  - **a (recommended):** not created in the new database.
  - **b:** keep it.
- **D3, the old database after a 7-day rollback window:**
  - **a (recommended):** reset it to empty for development.
  - **b:** keep the copy.
- **D5, the host bridge** (`gigalibs-host-bridge`, made by another session on 2026-10-09): a TCP proxy that opens the UAT
  CMMS, Workforce and Analytics APIs (and port 4720) to processes on the Mac. **D5a (owner, 2026-10-14):** remove it
  after the cutover.
- **D4, least privilege:** the control plane and migrations still connect as the superuser.
  - **a (recommended):** a separate follow-up card, with its own review.
  - **b:** in this card.

## Proof

- The rehearsal: 0 restore errors; counts and ledgers equal; migrations are a no-op.
- After the cutover:
  - UAT services healthy on `uat-postgres`, and the deploy check passes;
  - `nc -z 127.0.0.1 5440` reaches only the development database;
  - no UAT env file names `host.docker.internal`;
  - the journey passes.
- `git grep` finds no database connection string with a password in tracked files.
- The independent Security review is recorded before the cutover. A restore drill of the new database runs within the
  phase.

## Scope

- **May change:**
  - the new compose file and the deploy tool's copy in the release worktree;
  - the six tracked files above, `.env.example` and `docker/docker-compose.dev.yml`;
  - owner-run cutover and role scripts, with tests;
  - the evidence and status files.
- **Must not change:**
  - any migration or schema;
  - application code beyond the connection fallbacks;
  - other sessions' work.
- **UAT data** changes only through the owner-run cutover.

## Done when

- [ ] D1–D4 decided, the design approved and the rehearsal passed.
- [ ] The Security review is recorded.
- [ ] The owner has cut over; UAT runs on its own database with no host port and new passwords; the journey passes.
- [ ] The old database is development-only, bound to `127.0.0.1`, with a new password.
- [ ] No tracked file holds a database password.
- [ ] Evidence recorded, and everything committed on "commit".
