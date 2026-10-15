# WI-OI-120ar: The owner decisions of plan v3 step 0.7, and their follow-through

- **Status:** Decided (owner, 2026-10-15: "0.7 as recommended"), except (b), which waits for names. S1 and S2 done; S4 package removal done locally.
- **Plan v3:** step 0.7 (no product code).
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.

## The decisions (owner, 2026-10-15)

- **a. UAT is production.** Plan v3's Done checklist (§2) on UAT replaces the separate G5–G7 gates. Statuses: Built,
  On UAT, Done (with the owner's recorded acceptance), Replaced.
- **b. Named reviewers (D8): open.** The recommendation was to name a person for Security on every deploy and an
  Accounting reviewer for posting; no names were given. Until they are, each deploy keeps the independent AI review
  in use today, recorded as interim.
- **c. Assistant ownership.** WI-OI-121 is taken over from the other session. Its real parts are kept (thread
  tables, the module API, the signed CMMS call) and the rest removed, starting at GU1 (step 1.4). The other session's
  uncommitted and untracked files stay untouched until then.
- **d. The CopilotKit copy in `vendor/`.** Not adopted. The chat is drawn with GigaLibs' own components. The
  untracked `vendor/` folder and its test belong to the other session; the owner, or that session, removes them.
- **e. Local model.**
  - A small open-weights instruction model (7–8B class) runs as a service in compose, on CPU for UAT first.
  - Outside model providers are off by default, and allowed only per workspace by an owner decision.
  - The exact model is chosen in the GU card that adds it.
- **f. Stage 0.**
  - ADR-0016 is Accepted.
  - ADR-0003 and the Stage 0 decisions D2 (support access), D3 (approval policies), D6 (registers), D7 (first-value
    scenarios) and D9 (migration template) get a one-page brief each, for the owner to decide (S3).
- **g. Other open items:**
  - **980 place-fact dead letters:** investigate read-only, then propose replay or discard (S2).
  - **TextFly:** adopt, by porting its engine (WI-OI-120ap, in the bucket).
  - **`platform-rbac`** (untracked, 36 files): review read-only, then recommend keep or remove (S2).
  - **Master Data Hub:** retire it (S4).
  - **S14 import and export on Universal Data Studio:** decided when S14 is planned.
  - **The 12 empty package folders:** removed.
  - **The 20 unused packages:** each kept only for a named card (S2 lists them; S4 removes the rest).
  - **Old test sessions:** removed by an owner-run script (S2 counts them; S4 writes the script).
  - **ADR-0017:** Accepted for production.
- **h. Module tiers (§8).** The rows once "Proposed" are confirmed as written; enforcement is step 1.11.

## Slices

1. **S1, record the decisions:**
   - (a) in `AGENTS.md`, `.pi/PLAN.md`, plan v2 (`platform-implementation-plan.md`) §1 and §6, and `CLAUDE.md`;
   - (f, g) the ADR-0016 and ADR-0017 status lines;
   - (h) plan v3 §8 and its header.
2. **S2, read-only findings:** the 980 dead letters, `platform-rbac`, the empty and unused packages, and the old test
   sessions, each with a recommendation.
3. **S3, briefs:** ADR-0003, D2, D3, D6, D7 and D9, one page each.
4. **S4, removals the owner approves from S2:** Master Data Hub, empty folders, unused packages, old test sessions
   (owner-run), and `platform-rbac` (owner, since it is untracked).

## S1 (2026-10-15): done locally

- `AGENTS.md`: the status rule and "UAT is production".
- `.pi/PLAN.md`: a note under "Lifecycle and gates"; the old "Current gate" text is kept as history and points to
  `NOW.md`.
- Plan v2 §1 and §6: dated "superseded" notes on Built, Verified and Accepted.
- `CLAUDE.md`: one line, "UAT is production".
- ADR-0016: Accepted. ADR-0017: Accepted for production.
- Plan v3 §8: the four foundation rows and the two tier-3 rows read "Confirmed (0.7h)", and the plan header says step
  0.7 is decided except (b).
- The governance check passes.

## S2, read-only findings (2026-10-15)

- **Dead letters, and a bigger problem.** The relays have delivered nothing since 2026-10-01 02:25Z:
  - Workforce has 5,025 pending events, CMMS 789 and Geospatial 59;
  - the module host has no relay settings, and 33 of its rows are held LEASED since 2026-10-04;
  - the 980 Geospatial dead letters are `SpatialNodeChangedV1` refused with HTTP 401 on 2026-09-26, and none is
    superseded;
  - Workforce has 122 position events refused with 400;
  - the control plane has 13 old failures.

  Carded as **[WI-OI-120as](WI-OI-120as.md)** for step 0.8. Replaying or discarding the dead letters waits for its
  cause.
- **`platform-rbac`** (untracked):
  - no source and no `package.json`, only build output (`dist/`, `.turbo`, `tsbuildinfo`, 2026-09-29) and an
    `apps/api/.env`, which was not opened;
  - the package's source was removed and its leftovers stayed.
  - **Recommendation:** the owner deletes the folder, since it is untracked and holds a `.env`.
- **The 20 unused packages:**
  - **in use:** `db-migrations-runtime` (the images), `queue` (CMMS import and export);
  - **named by a card:**
    - `email-templates`, `notifications-core` and `notifications-react` for N1, step 1.12;
    - `multi-currency` for M-CUR;
    - `spend-core` for M-SPEND;
    - `invoices-core` for M-AR;
    - `embed-sdk` and `host-kit`, which wait for WI-OI-120ap's embedding decision;
  - **no use and no card (10), recommended for removal in S4:** `cache`, `charts-react`, `event-bus`,
    `geofence-engine`, `gigalibs-controls`, `kpi-widgets-react`, `maps-react`, `realtime`, `redis`, `storage-core`.

    Their only references are the Docker workspace list (`charts-react`, `maps-react`) and a web tsconfig alias
    (`maps-react`), which are removed with them.
- **The 12 folders with no package:**
  - 10 hold 1–4 loose `.ts` files that nothing imports (only the 2026-09-09 audit inventories name them): to remove
    in S4;
  - `integrations` is also listed in `config/package-layers.json`, so that entry goes with it;
  - **`industry-packs` stays:** its 21 JSON pack files are read by Workforce's pack service
    (`modules/gigaops/apps/api/src/packs/wfo-packs.service.ts`).
- **Old test sessions:** UAT has 828 ACTIVE sessions.
  - 306 are already past `expiresAt` (unusable, but never marked ended);
  - 319 belong to test-, journey- or proof-looking users.
  - **Recommendation:** an owner-run, backed-up step that marks the 306 expired sessions REVOKED, and a small product
    fix (a session sweep) so it stays clean. Test users' sessions end on their own expiry.

## S4, part 1: package removal (2026-10-15, decision 0.7g)

- **Removed:**
  - the 10 unused packages with no card: `cache`, `charts-react`, `event-bus`, `geofence-engine`,
    `gigalibs-controls`, `kpi-widgets-react`, `maps-react`, `realtime`, `redis`, `storage-core`;
  - the 10 folders with no package: `activity-feed`, `api-keys`, `comments`, `data-import-export`, `feature-flags`,
    `presence`, `scheduler`, `search`, `tags-taxonomy`, `webhooks-outbound`;
  - `packages/integrations`. Plan v3 counted it as a folder with no package, but it holds two private packages,
    `@gigalibs/integration-aws-s3` and `@gigalibs/integration-minio`. Nothing uses them (only the September audit
    inventories name them) and no card names them, so the rule decided in 0.7g applies.

  88 tracked files in all; their ignored build output is cleared too.
- **Kept:**
  - `industry-packs`, which Workforce's pack service reads;
  - the 8 packages named by cards and the 2 in use (S2).
- **References updated:**
  - `config/package-layers.json`;
  - `config/design-token-baseline.json`;
  - the web `tsconfig.json` and root `vitest.config.ts` aliases for `maps-react`;
  - the image build's `infra/compose/docker/pnpm-workspace.yaml`;
  - the root `pnpm-workspace.yaml` glob;
  - `scripts/verify-configuration-local-profile.mjs`.
- **Left as is:** the deployed CMMS migration 000001 still mentions `@gigalibs/event-bus` in a comment. Deployed
  migrations are never edited.
- **Lockfile:**
  - the 12 removed importers are gone;
  - the only other change: `@nestjs/core`'s peer key no longer carries `@nestjs/websockets`, which only `realtime`
    brought (versions unchanged at 11.2.3 and 11.2.6);
  - `pnpm install --frozen-lockfile` accepts it.
- **Checks:**
  - layers, package-dependencies, production-data, SDLC, API-boundary and navigation audits pass;
  - migration pins pass;
  - web type-check clean;
  - `audit:design-tokens` fails only on the three files other sessions own (`maps/page.tsx`, `AuthAtmosphere.tsx`,
    `PlantSpatial3DViewer.tsx`), as before;
  - the local-profile check fails only on the known `WORKFORCE_API_URL` drift;
  - whole repository: 2,966 tests passed, 234 skipped, none failed (379 files).
- **Still to do in S4:**
  - Master Data Hub retirement, its own slice;
  - the owner-run session clean-up (306 expired sessions);
  - the owner deletes `modules/platform-rbac`.
- **Session clean-up, prepared for the owner:**
  - backup `gigalibs_backup_20261015_134343Z` (running `d17db37`);
  - the guarded `UPDATE` marks the 306 ACTIVE sessions past `expiresAt` as REVOKED, and changes no other row.

