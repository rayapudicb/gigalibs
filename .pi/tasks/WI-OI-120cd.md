# WI-OI-120cd: SPEED on UAT — release SPEED onto the running release

- **Status:** In progress (owner, 2026-10-21: "start S9b it should be working on http://127.0.0.1:5180/speed"; then,
  asked where SPEED should run, chose "Release SPEED to UAT (5180)"). Implementer: Claude Code. Comes before S9b.
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
- **On UAT afterwards (owner-run):** SPEED switched on for one labelled TEST workspace; its people given SPEED roles;
  criteria and library imported (TEST FIXTURE packs, labelled) or real ones once reviewed.

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

## Done when

- [x] The release builds, tests and passes S16 in its worktree (base failures aside, above); release commit
      `23ab3916` made on the owner's "commit".
- [ ] Security review recorded with the reviewer named; migration rehearsal and recovery plan recorded.
- [ ] Backup verified; the owner deploys; read-only check: `/speed` opens under the UAT preview in the TEST workspace,
      and the other modules are unchanged.
- [ ] Card, `.pi/NOW.md` and `.pi/WORK_ITEMS.md` updated.

## Stop and ask if

- a SPEED commit needs main-only platform work that is not on UAT (that work would need its own review and release);
- anything would touch UAT data, settings or containers outside the owner-run steps.
