You are continuing GigaLibs in ~/dev/gigalibs, branch feat/gigaops-convergence-core (local only, never pushed).
I am the product owner. The full brief, with exact paths, acceptance checks and pitfalls, is
.pi/handoff/HANDOFF-2026-09-29.md. Read it completely, then follow the mandatory reading order in AGENTS.md.
This prompt is the summary. Where they differ, the brief wins; where the brief and my vision documents differ,
the vision wins and you ask me.

WHAT WE ARE BUILDING
- GigaLibs sells one shared core plus the business modules each client picks. Manufacturing is the first
  industry. Release 1 = core + CMMS + Workforce + Geospatial.
- I approved "core first": Wave 0 (WI-OI-080 to 085) makes the core and the module factory before Release 1
  features.
- Vision: docs/GIGALIBS_PRODUCT_VISION.md (layers §3, module contract §4, maturity §5, 13 certification gates §6,
  runtime §8, isolation §9, horizons §12) and the mobile vision at
  ~/.gemini/antigravity/brain/29edddb1-7cd5-4683-914b-4862d1a02808/MOBILE_STRATEGY_VISION.md.
  Plan: docs/plans/manufacturing-package-solution-plan.md. Layers: docs/architecture/ADR-0013-core-modules-and-solutions.md.

ARCHITECTURE (keep it this way)
- Core API (kernel): apps/playground-api, NestJS, port 3333, core database packages/db/schema.prisma. It holds
  accounts, sessions, tenants, entitlements, RBAC, settings, audit and the module registry.
- Web shell and BFF: apps/workflow-platform, Next.js, port 5180. It verifies the session with the core API. For
  each module call it signs a PlatformContextV1 with that module's own Ed25519 key (audience
  gigalibs-<name>-api, lifetime at most 300 s) and forwards through one generic gateway route,
  app/api/[gateway]/[...path]. The sidebar, pages, gateway routes and upstreams are generated from manifests.
- Modules: modules/<name>/ with module.yaml, a NestJS API on @gigalibs/module-sdk (guard, tenant database,
  audit and outbox), and their own PostgreSQL schema with forced row-level security and a least-privilege role.
  Modules never import each other; they cooperate only through contracts and outbox/inbox events (ADR-0007).
- Modular monolith by default (my decision, vision §8):
  - new modules run inside the shared module host, apps/module-host, port 4790, under /<name>;
  - a module gets its own service only when justified;
  - CMMS, Workforce and Geospatial stay services.
- Manifests are the single source. `pnpm modules:catalog` regenerates everything, and generated files are never
  hand-edited.
- `pnpm module:new` generates a module. `pnpm module:conformance` (35 checks) plus the listing gate decide
  whether it may be listed.
- Layers: core → module → solution (config/package-layers.json, `pnpm audit:layers`). A solution is
  configuration only.
- Execution plane: apps/workflow-api (Python) exists, but it is not in the local profile. Do not wire it in
  without me.

MODULE SEPARATION TODAY (brief §3.4)
- Only 5 of the 19 modules run separated behind the gateway: CMMS, Workforce, Geospatial, Analytics and
  Connector Hub.
- The other 14 have manifests and code but no running API, and most are frozen.
- Business logic still in the core: AP matching and actions (hosted for Procurement), and 31 business tables in
  the core database. Procurement moves in WI-OI-092; Inventory leaves CMMS in WI-OI-091 (Wave 2).
- 8 module packages sit in packages/, and 104 packages are outside the workspace.
- Do not start any of these moves unless I assign them.

INDUSTRY PACKAGING (manufacturing, agriculture, any industry; brief §3.5)
- Target (vision §3.4): an industry is a pack of metadata only, never code. A solution
  (solutions/<name>.yaml) selects modules, one industry pack and one country pack.
- My approved design is in .pi/work/WI-OI-074.md (paused until the second industry):
  - four axes: words, data, choices, rules/objects;
  - seven pack layers: vocabulary, fields and forms, lists and types, screens and personas, workflows, KPIs, and
    core rules (in code);
  - canonical concepts mapped across manufacturing, agriculture, hospitality and logistics. Known gaps:
    piece-rate pay, lots and expiry, mileage pay.
- Today:
  - packs are 9 JSON files inside the Workforce module (modules/gigaops/config/industry-packs), with Workforce
    wording only;
  - there is no agriculture pack;
  - CMMS types and codes are enums in code (WI-OI-076).
- Do not create or move packs before I decide (Task 2d).

TASKS, IN ORDER
0. Run `git log --oneline -3` and `git status`. The 085e work (the shared module host) and this handover are
   committed. Only the old untracked items listed in the brief should remain. Trace anything else before
   touching it.
1. WI-OI-085f, the navigation and web-gateway proof. It closes WI-OI-085 and the last Wave 0 exit criterion.
   - In a throwaway copy outside the repository, generate
     `pnpm module:new field-inspections --title "Field Inspections" --group "Workforce & Operations" --icon scale`.
   - Prove that no shell file changed: only the module folder, generated files, the module-host dependency line
     and the lockfile.
   - Promote it to REVIEW through the conformance promotion order. A PLANNED module cannot be opened.
   - Build the module host and a web image, and run that web on 127.0.0.1:5190. Never touch 5180.
   - Prove with real sessions:
     - an entitled user sees it in the sidebar and the page works;
     - a user without the permission or entitlement does not;
     - through the web gateway: create 201, replay, list and read, stale update 409, no cross-tenant access,
       401 without a session;
     - with the host stopped, a controlled unavailable response;
     - Playwright with axe (WCAG 2.2 AA).
   - Clean up everything, run the full chain, and record the evidence in .pi/work/WI-OI-085.md.
   - Update ADR-0013 to "shared module host by default", then move WI-OI-085 to Review.
2. Ask me these four questions and wait:
   a. Order: Horizon 1 first (session revocation reaching the modules, needed before mobile device sessions), or
      mobile (WI-OI-084) first as the plan says?
   b. Should the vision-derived items in Task 4 be registered as Proposed?
   c. The mobile divergences:
      - offline technique: the vision's SQLite with CRDT, or the plan's command queue with idempotency keys;
      - app store: the vision's Phase A GigaLibs app, or the plan's "no store for Release 1";
      - plan §5.1 must be updated to the Capacitor shell I chose;
      - Geospatial already has a mobile/sync endpoint from the other agent (not in any certified image): should
        it be replaced or adopted?
   d. Industry packs: move them from inside Workforce to the solution layer across all modules? And when does
      the second industry (agriculture or another) start?
3. WI-OI-084, mobile, only after my answers. Write ADR-0014 first, then build the slices:
   - device sessions and revocation on the gateway;
   - the SDK change feed and command inbox;
   - the /m shell and PWA;
   - CMMS technician screens;
   - the Capacitor shell;
   - the offline proof.

   The rules for it:
   - one codebase, with a Capacitor shell around the same web components;
   - the same gateway routes, no mobile BFF, only sync endpoints added;
   - tier-1 offline (vision §8), WCAG 2.2 AA at 360 px.
4. Vision-derived items, only if I agree:
   a. session revocation fan-out to every module;
   b. the catalogue on the six maturity states (9 entries claim AVAILABLE, none is Certified, and some
      descriptions over-claim);
   c. core package inventory: 56 of the 82 core packages are used by nothing that runs; decide finish, merge or
      delete, starting with what Release 1 needs;
   d. a clean whole-workspace build, and backup/restore drills;
   e. E-Signature gets tokens from a development endpoint (/oidc/dev/token) while it is marked AVAILABLE. Fix it
      or mark it unavailable; ask me which.
   Waves 1–3 (Release 1 features and later) are listed in section 6 of the brief for orientation only. Do not
   start them.

RULES YOU MUST NEVER BREAK
- My vision documents decide. If the vision, the plan and the code disagree, show me the divergence and ask.
  Never pick the convenient option, and never add scope I did not ask for.
- Commit only when I type the word "commit". Never push or rewrite history.
- One active work item at a time; I choose the next one. One agent in the repository at a time: if another
  agent is active, stop and ask me.
- Module APIs trust only the web-signed PlatformContextV1. Never add development or bypass token paths.
- Never print secret values.
- Never run docker volume prune, docker system prune --volumes or Docker Desktop purge. The PostgreSQL volume
  holds my data. After each build cycle, run infra/compose/scripts/docker-disk-guard.sh prune.
- Never run a full `docker compose up`; deploy one service with `up -d --no-deps`. Do not rebuild Geospatial.
- Never edit the CMMS import/export files. Never change another agent's work without telling me.
- Web screens use @medusajs/ui and the ui-* tokens.
- Nothing is production-ready. Report local evidence only.
- Verify with the mandatory chain in AGENTS.md plus `pnpm audit:layers` and
  `node scripts/module-manifests.mjs --check`. The known pitfalls are in section 7 of the brief (zsh loops,
  source identity, pnpm links in images, psql output order).

HOW TO REPORT TO ME
Plain language, short bullets: what changed, the evidence, what's next, and what I must decide.
