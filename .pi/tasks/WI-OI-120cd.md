# WI-OI-120cd: SPEED on UAT — release SPEED onto the running release

- **Status:** In progress: SPEED live on UAT (`a1765ce6`), its windows active and the organization delivered for
  "GigaLibs Global Enterprise"; the next release (`d039b970`, WI-OI-120ce) is being built; the independent Security
  review is still not recorded (the deploys went ahead before it).
  modules for a business use case then we can have the deployment process"); R1 completed at `fb21e5c8`. Earlier:
  owner, 2026-10-21, "start S9b it should be working on http://127.0.0.1:5180/speed", then chose "Release SPEED to UAT
  (5180)". Implementer: Claude Code.
- **Work item:** WI-OI-120bn (SPEED Stage 1).
- **Owner decision:** this reverses plan v1.4 D1 and D7 for UAT ("the pilot runs on a dedicated speed-lab instance; never
  tested on UAT"). SPEED stays PLANNED, so on UAT it opens only under the UAT preview, and its data goes only into a
  labelled TEST workspace (plan v3 rule 2). The `speed-lab` instance (WI-OI-120cc S9a) remains for the lab pilot.

## Release

- **Base:** the running release, `release/wi120u-workforce` at `9734dca9` (deployed 2026-10-21). The SPEED branch sits
  on main, which carries about 170 commits that are not on UAT (AR, P2P/O2C, Finance F1/F2, Table 2), so the release is
  built in a sibling worktree `gigalibs-release-speed` (branch `release/speed-uat`) from `9734dca9` with only SPEED's
  commits picked onto it (S1 engines and S7a, S2b metadata panels, S3 to S7, the sidebar section, S9a's kernel
  delivery and Debian pins; not the speed-lab files), generated files regenerated, the lockfile fixed until
  `pnpm install --frozen-lockfile` passes.
- **UAT settings (owner-run, never printed):** SPEED's runtime role and key pair (`.env.module.process-safety-screening`
  in the release worktree); the dossier bucket and a key that can use only it in UAT's object store
  (`SPEED_STORAGE_*`); without them generation answers 503 and everything else works.
- **Gates (plan v3 rule 2):** an independent Security review of the release (new schema and migrations, roles and
  permissions, gateway routes, the kernel's organization delivery, the dossier worker's definer function); a rehearsal
  of the migrations on a copy of UAT with a recovery plan; a verified backup; the owner runs the deploy; a read-only
  check follows.
- **On UAT afterwards (owner-run):** SPEED switched on for the owner's workspace "GigaLibs Global Enterprise" (owner,
  2026-10-21: "i loggedin with newuser@gigalibs.io ... it should be visible on left panel and i should be able to see
  the main name speed and its submodules on expandable"); its people given SPEED roles; the organization sent to SPEED.
  Only real data goes into that workspace (plan v3 rule 2): the TEST FIXTURE criteria and library packs go only into a
  labelled test workspace; real, reviewed packs are a data decision for the owner.

## Progress (2026-10-21)

- **Release tree:** worktree `gigalibs-release-speed`, branch `release/speed-uat` at `9734dca9`. SPEED's combined change
  (`b85a4244..feat/speed-s3-module`, which holds only SPEED commits) applied as one uncommitted patch, without `.pi`,
  generated files, the lockfile and the speed-lab files; one conflict (the Docker workspace list: kept SPEED's
  `process-safety-engines`, not main's `document-lifecycle` and `posting-rules`); `docs/pharma` copied from the SPEED
  tip; windows and manifests regenerated; lockfile updated offline (`pnpm install --frozen-lockfile` passes; the only
  removals are Prisma's peer labels, no version changed).
- **Release-base defect, not SPEED:** `pnpm build` fails at `@gigalibs/ar-api` on a clean checkout of `9734dca9` too:
  `forms-engine-nest` and `custom-fields-nest` have no build script, so AR cannot typecheck. AR is not deployed on UAT.
- **Dossier store on UAT:** the generator now passes a module's `spec.runtime.optionalEnvironment` to the module host
  (`${NAME:-}`, unset means off); SPEED lists `SPEED_STORAGE_*` and its worker switches. `create-speed-storage.sh`
  (owner-run, release worktree only) creates the bucket `gigalibs-speed-dossiers` in UAT's MinIO (`docker-minio-1`,
  the platform's store), a policy for that bucket only and a key holding it, and appends `SPEED_STORAGE_*` to
  `.env.module.process-safety-screening`; nothing printed.
- **Committed (owner "commit"):** SPEED branch `ec693cf0` (optional module settings, SPEED's dossier store,
  `create-speed-storage.sh`) and `40aa4af8` (the script checks the release branch itself: `9734dca9` has no
  `release-worktree.sh`); release commit `23ab3916` on `release/speed-uat` (177 files).
- **CMMS kept as UAT runs it:** `cmms-work-orders.window.json` (120bu) names `technician-ref` without declaring it, and
  `9734dca9`'s generated window baselines were never regenerated for it, so UAT still runs the earlier CMMS window.
  Regenerating would publish a broken CMMS window; the release keeps CMMS's baseline exactly as `9734dca9` (so
  `module-manifests --check` reports that file out of date, as on `9734dca9`). The fix belongs to CMMS.
- **Release checks:** build passes except `@gigalibs/ar-api` (fails the same way on a clean `9734dca9`); tests pass
  except the two Playground files (`CONTROL_PAYLOAD_KEY_VERSION`) and a pay-rule test that times out under load and
  passes alone (13/13); conversions pass for 6 modules; SPEED conformance 15/15; the two data audits fail only because
  `communications-textfly` is not tracked on this release (`QUARANTINED_PACKAGE_MISSING`).
- **UAT facts read (read-only):** `GIGALIBS_UAT_PREVIEW=enabled` on the web, so PLANNED SPEED opens under the preview;
  the platform's store is `http://host.docker.internal:9010`, bucket `gigalibs-dev`.

## R1 release (2026-10-21)

- **Release commit `76780730`** on `release/speed-uat` (42 files): SPEED's R1 completion (`fb21e5c8`: outcomes, the
  write-up parser, the audit trail) on top of `23ab3916`. Review range `9734dca9..76780730`. CMMS's window baseline
  stays as `9734dca9` ships it (above).
- **Checks:** build passes except `@gigalibs/ar-api` (base defect, above); tests pass except the two Playground files
  and the pay-rule timeout (passes alone); conversions pass for 6 modules; SPEED conformance 15/15.
- **Images:** all 9 built at `767807308cbb-aa1f6d1820e4` from the clean release tree. The running release's images
  (`9734dca94a87-b3ea98d2c20c`, 9) are still on the machine.
- **Backup:** `gigalibs_backup_20261021_072508Z` (17 MB, `infra/compose/backups/` in the release worktree), taken from
  the running release `9734dca94a87`; checksum verified. The deploy refuses it after 24 hours (2026-10-22 07:25Z).
- **Migration rehearsal on a copy of UAT (passed):** a throwaway PostgreSQL 16 on its own network; UAT's role names
  pre-created without login (names only, read from UAT read-only); the backup restored with `--exit-on-error` (so the
  backup restores); the release images ran the platform and every hosted module's migrations. Results: platform "No
  pending migrations"; SPEED 1 to 5 applied, 21 tables, all with forced row-level security except the
  `schema_migrations` ledger; `list_dossier_tenants` is SECURITY DEFINER; `gigalibs_speed_runtime` is not superuser and
  does not bypass RLS; Finance (9), Product Catalogue (2), Inventory (4), Orders (3) and Procurement (3) ledgers
  unchanged. Script: the session's `rehearse-release.sh <tag> <backup>`; nothing touched UAT.
- **Deploy script:** `.pi/handoff/proof-scripts/deploy-uat.{mjs,sh}` in the release worktree (from the running
  release's, release values updated; SPEED's migrations image and `.env.module.process-safety-screening` added); its
  tests 33/33; `deploy-uat.sh --check` answered "CHECK PASSED: 767807308cbb-aa1f6d1820e4; nothing deployed".
- **CMMS follows on the same branch:** Cursor's CMMS WI-OI-120gd release stacks on `release/speed-uat` at `76780730`
  after this deploy (`.pi/handoff/CMMS-DEV-THEN-DEPLOY.md`), so neither release removes the other.
- **Deploy, first attempt (owner, 2026-10-21):** `create-speed-storage.sh` succeeded (bucket `gigalibs-speed-dossiers`,
  settings added, nothing printed). `deploy-uat.sh --deploy` verified the 9 images and the backup, then stopped before
  any change: "No cutover record (backups/wi-oi-120am/cutover.json)". The record (UAT's 2026-10-14 cutover, 546 tables)
  lives in the running release's worktree `gigalibs-release-wf120u` and was not copied to this one; `--check` returns
  before that test, so it did not catch it (follow-up: `--check` should load the record too). Read-only after the
  stop: all 9 services still run `9734dca94a87-b3ea98d2c20c`, no `gigalibs_speed` schema; the deploy's later gates
  pre-checked read-only (web labels match the predecessor, 549 tables held, no failed kernel ticks in 2 hours). The
  Security review was not yet recorded when the owner ran the deploy.

- **Deployed (owner, 2026-10-21, second run after copying the cutover record):** all 9 services run
  `767807308cbb-aa1f6d1820e4` and are healthy. Read-only check by Claude: every migration container exited 0 (platform,
  6 module-host modules including `process-safety-screening`, CMMS, Workforce, Geospatial, Connector Hub, Analytics);
  SPEED ledger 1 to 5, 21 tables, forced RLS on all but the ledger, `gigalibs_speed_runtime` neither superuser nor
  RLS-bypassing; Finance 9, Product Catalogue 2, Inventory 4, Orders 3, Procurement 3 unchanged; no failed kernel ticks;
  `/api/health/ready` and `/login` 200, `/speed` 307 to sign-in; `GIGALIBS_UAT_PREVIEW=enabled` on the web. SPEED shows
  on the Modules page as "Not available" until the switch-on: "GigaLibs Global Enterprise" has no SPEED entitlement
  and no `process-safety-screening` feature yet.

- **Defect found after the switch-on (owner saw "This window has not been published for your organization yet"):**
  at start-up the API failed to activate module windows for all 134 tenants with SPEED or CMMS switched on
  ("Module windows could not be activated ... BadRequestException"), and nothing was activated. Cause, mine: when the
  generated window baselines were regenerated for `76780730`, CMMS's `cmms-work-orders` baseline came back in its
  120bu form (`assigned-to` as a `technician-ref` reference, which no CMMS window declares); `23ab3916` had it right.
  Activation compiles a tenant's baselines in order and stops at the first failure, so CMMS's broken window kept
  SPEED's windows from activating anywhere. Proven offline in the deployed image (no database): 40 baselines, only
  `cmms-work-orders` fails; the previous release's 35 all compile. No harm beyond that: the failure comes before any
  write, so every tenant keeps the windows it had (CMMS included). My read-only check had looked at the kernel worker's
  logs, not the API's; from now on the check includes the API's window activation lines.
- **Fix (release commit `19048071` on the owner's "commit", 2026-10-21):** the two CMMS hunks reverted in `window-baselines.generated.ts` (no removed
  line against `9734dca9` now; only SPEED's windows are added); new test
  `apps/playground-api/src/module-window-baselines.compile.spec.ts` compiles every shipped window exactly as activation
  does: 40/40 pass, and it fails on `cmms-work-orders` with the CMMS hunks put back. Contracts and configuration-core
  tests 107/107; API typecheck and lint clean. Images build as `190480718a16-39cbe470ecf7`; then a backup of the
  running `76780730`, the deploy check and the owner's deploy; the API activates SPEED's windows 15 seconds after it
  starts.
- **Fix release ready:** 9 images `190480718a16-39cbe470ecf7` built from the clean tree; in the new API image all 40
  shipped windows compile (offline probe). Backup `gigalibs_backup_20261021_094357Z` of the running `767807308cbb`,
  checksum OK. Deploy script values set (previous release `76780730`); its tests 33/33; `--check` passed. The deploy's
  later gates pre-checked read-only: web on `767807308cbb`/`aa1f6d1820e4`, cutover record present (546), 570 tables
  held, no failed kernel ticks. Rollback for this step: redeploy `767807308cbb-aa1f6d1820e4` (no migration changes).
- **Fix release deployed (owner, 2026-10-21):** "DEPLOY SMOKE PASSED: 190480718a16-39cbe470ecf7"; every migration
  passed, every service healthy. Read-only check: the API's window activation logged no failure and activated
  `speed-criteria`, `speed-library`, `speed-projects`, `speed-routes` and `speed-substances` for "GigaLibs Global
  Enterprise" only; no other module's activation changed (CMMS 1072 active, none new); no failed kernel ticks. newuser
  holds SPEED Administrator and SPEED Chemist. SPEED has no copy of the workspace's organization yet ("Send to modules
  again" not yet pressed).

- **Second defect (platform, found through SPEED):** Projects, Routes and Outcomes answered 503
  (`OrganizationVersionPendingError`: SPEED has no copy of the workspace's organization). Every "Send to modules again"
  and every activation of "GigaLibs Global Enterprise" since 2026-10-19 is QUARANTINED in `platform_outbox_events`
  after 5 attempts with "The tenant is not active": `AuthService.getSubjectContext` (the kernel's context for work run
  as a member) accepts only ACTIVE tenants, while a login session also accepts an unexpired TRIAL. UAT has no ACTIVE
  tenant (34 TRIAL, 225 SUSPENDED, 101 CANCELLED), so organization delivery has never worked on UAT for any module; 23
  deliveries of trial workspaces are quarantined (11 activations, 12 resends). No kernel schedules exist, so nothing
  else starts. Fix (release commit `a1765ce6`, SPEED branch `c47a5c1e`, on the owner's "commit"): the session's rule (ACTIVE, or TRIAL with
  `trialEndsAt` in the future); test: unexpired trial accepted, expired and open-ended trials refused; it fails
  without the fix; auth and kernel tests 97 passed (13 skipped, database tests); typecheck clean; my lines lint-clean
  (both files carry earlier format findings). The quarantined events stay quarantined; the owner presses "Send to
  modules again" after the deploy. Needs the Security review (tenancy and access).
- **Trial-delivery release ready:** 9 images `a1765ce6c275-87aae3c19242` (labels checked; the fix is in the API
  image's `auth-nest`; all 40 windows compile); backup `gigalibs_backup_20261021_110105Z` of the running
  `190480718a16`, checksum OK; deploy values set, tests 33/33, `--check` passed; later gates pre-checked read-only (web
  on `190480718a16`/`39cbe470ecf7`, 570 tables, no failed ticks, no window activation failures). No migration changes;
  rollback: redeploy `190480718a16-39cbe470ecf7`.
- **Trial-delivery release deployed (owner, 2026-10-21):** "DEPLOY SMOKE PASSED: a1765ce6c275-87aae3c19242". After the
  owner's "Send to modules again" the sync jobs succeeded for SPEED, Workforce, Analytics and Product Catalogue (the
  workspace's first successful organization delivery on UAT); SPEED holds the organization (1 version, 2 units), so
  Projects, Routes and Outcomes load. Data and the prototype's look continue in WI-OI-120ce.
- **Rollback image lost (mine, 2026-10-21, WI-OI-120ce's lab build):** the disk guard keeps the newest 2 tags of each
  `gigalibs/*` repository; building the speed-lab images from the SPEED branch on the same machine counted as a third
  version and removed `gigalibs/control-plane-migrations:190480718a16-39cbe470ecf7` (UAT's rollback release; its other
  8 images remain). UAT is unaffected (`a1765ce6c275-87aae3c19242`, all 9 images present). A rollback to `190480718a16`
  first rebuilds that image from `release/speed-uat` at `19048071` (no migration differs between the two releases).
  Lab builds now run with `GIGALIBS_KEEP_IMAGE_VERSIONS=3`; space was freed only from the build cache (older than 6 h).
- **Empty lists are by design:** SPEED ships no data (plan v3 rule 3). Criteria and library sets are loaded only as
  whole packs through the API (`POST v1/criteria-sets`, `v1/library-sets`, then put in force); SPEED has no screen for
  it yet, so the Criteria and Library windows offer no "New". The BRD reference packs are TEST FIXTURE and may go only
  into a labelled test workspace (rule 2); "GigaLibs Global Enterprise" is newuser's only working workspace.

## Recovery plan

- **The change is additive.** SPEED adds the schema `gigalibs_speed`, its runtime role and its routes; no platform
  migration is pending, and no other module's table, ledger or grant changes (rehearsal above).
- **Deploy halts before migrations:** nothing changed; fix the cause and run the deploy again.
- **Deploy halts after migrations, or SPEED misbehaves on UAT:** redeploy the running release's images
  `9734dca94a87-b3ea98d2c20c` with its deploy script (`gigalibs-release-wf120u`). The SPEED schema stays in place and
  inert (no service reads it); it is never dropped by hand. Switching SPEED off for the workspace hides it at once.
- **Platform data damaged (not expected: the release changes no platform table):** restore
  `gigalibs_backup_20261021_072508Z`, which the rehearsal restored cleanly; owner-run, after the owner stops the
  services.

## Owner steps (in order)

1. Independent Security review of `9734dca9..76780730` (`.pi/handoff/REVIEW-REQUEST-WI-OI-120cd.md`); reviewer named
   here.
2. Dossier store: `cd /Users/rayapudi/dev/gigalibs-release-speed && bash infra/compose/scripts/create-speed-storage.sh`.
3. Deploy: `bash .pi/handoff/proof-scripts/deploy-uat.sh --deploy --backup gigalibs_backup_20261021_072508Z` (a fresh
   backup if the deploy runs after 2026-10-22 07:25Z).
4. Read-only check by Claude.
5. Switch-on, signed in as newuser@gigalibs.io (an active Platform Owner and the workspace's Tenant Admin, read-only
   check 2026-10-21): Platform administration (`/platform-admin`), "GigaLibs Global Enterprise", tick SPEED in its
   licensed modules, save with a reason (this sets the workspace's features and activates SPEED's windows); Settings,
   Team: give yourself SPEED Administrator and Chemist; Organization: "Send to modules again". SPEED then shows in the
   left panel with its sections.

## Done when

- [x] The release builds, tests and passes S16 in its worktree (base failures aside, above); release commit
      `23ab3916` made on the owner's "commit".
- [x] R1 release commit `76780730`, images built, backup verified, migration rehearsal passed and recovery plan
      recorded (above); check-only deploy passed.
- [ ] Security review recorded with the reviewer named.
- [x] The owner deploys; read-only check: the other modules are unchanged and SPEED's service is healthy.
- [ ] After the owner's switch-on, SPEED shows in the left panel with its sections and `/speed` opens on 5180.
- [ ] Card, `.pi/NOW.md` and `.pi/WORK_ITEMS.md` updated.

## Stop and ask if

- a SPEED commit needs main-only platform work that is not on UAT (that work would need its own review and release);
- anything would touch UAT data, settings or containers outside the owner-run steps.
