# GigaLibs execution plan (version 3): one ordered list

Date: 2026-10-13. Programme: WI-OI-120. **Status: Approved by the owner, 2026-10-13 ("approve v3"). It replaces the
order in `platform-implementation-plan.md` §4.** Decisions marked "Proposed" inside it (§8 and step 0.7) still wait for
the owner.

Version 2 (`platform-implementation-plan.md`) keeps the card definitions (what each card builds). This version sets:

- the **order** of every pending card, in phases;
- each card's **status today**, from the repository and UAT;
- the **new cards** for the zero-mock clean-up, generative UI, SaaS and production operations;
- a **Done checklist** that every card passes, replacing the separate G5–G7 gates at the end.

No timelines. Work goes top to bottom.

## 1. Rules (owner, 2026-10-13)

1. **One list, one order.** One card at a time, one writer. Nothing new starts while a card is open, except fixes
   that the open card's own review finds. A new idea becomes a card at the right place in this list.
2. **UAT is production.** There is no separate G5, G6 or G7 at the end. Every card passes the full Done checklist
   (§2) before it is called done. Consequences:
   - test data goes only into labelled test workspaces;
   - a verified backup comes before every deploy;
   - an independent Security review comes before every deploy that touches access, money, migrations, tenancy,
     AI or external actions.
3. **Zero hard-coding, zero mock.** Nothing on a screen, in an API answer or in an Assistant card that does not come
   from real data. Demo screens are removed or connected to their real service. They are never just hidden.
4. **Metadata first.** Every business screen is a published metadata window (ADR-0033, ADR-0019). The named
   exceptions (maps, kiosk, dispatch boards, clock-in panel, chart builders, sign-in) are components inside metadata
   screens.
5. **Generative UI comes from metadata.** The Assistant has no hand-written tool and no hand-written card for any
   module:
   - its **tools** are generated from the published dictionary;
   - its **cards** are drawn by the metadata renderer;
   - its **actions** go through the same API, permissions, scopes and approvals as the screen, after the person
     confirms.

   A module converted to metadata gets the Assistant automatically. A future module gets it from the conversion kit.
6. **One access check everywhere.** Screens, APIs, reports, exports, jobs and Assistant tools all use the same
   permission and scope check (R1, R2, R5).
7. **CMMS first, then every module,** one at a time, each to the full Done checklist.
8. **Status from evidence only.** *Built*: the code exists. *On UAT*: deployed and verified there. *Done*: the
   Done checklist is complete. A chat message does not change a status.

## 2. Done checklist (every card)

**Code**
- [ ] `pnpm build`, `pnpm test` and `pnpm verify` (all audits) pass.
- [ ] The zero-mock audit passes, including the in-memory fixture check added in Phase 0.

**Security and data**
- [ ] Permission tests go through the real session path: allowed, denied, other unit, other site.
- [ ] A two-workspace isolation test passes.
- [ ] Any migration is forward-only and rehearsed on a copy of UAT, with a recovery plan.
- [ ] An independent Security review is recorded, with the reviewer named, wherever rule 2 requires one.

**Generative UI**
- [ ] The Assistant can find and show the card's records, and act on them after the person confirms.
- [ ] It is refused exactly where the screen is refused.

**Release**
- [ ] A backup is taken and verified, the owner deploys to UAT, and a read-only check follows.
- [ ] The card's journey steps are added and pass on UAT.
- [ ] Logs, metrics and alerts cover the new paths (from step 1.19 on).
- [ ] Evidence is in `.pi/work/`; the card, `NOW.md` and `WORK_ITEMS.md` are updated; committed on "commit".

**Once per phase**
- [ ] A restore drill from that phase's backup.
- [ ] A keyboard and screen-reader pass on the phase's windows.
- [ ] A load test where the phase adds a high-volume path (punches, imports, postings).

## 3. Where we stand (2026-10-13)

| Milestone (v2) | State |
| --- | --- |
| M0 Decisions | Partly done. D1, D4 (places) and D5 (ADR-0006) are decided. D2, D3, D6, D7, D8 and D9 are open. ADR-0003 and ADR-0016 are still Proposed. |
| M1a Minimum maintenance | 5 of 8 cards are on UAT: R0, R1, S1, S16, and R2 (its unit and site scope switched off). 3 are built but not reviewed or released: R5 CMMS (120z, 120aa, 120ab, 120ac), T3 (120ad) and M-CM1 (120t, 4 slices). |
| M1b Workforce and departments | M-WF1 Slices 1–3 are on UAT (Slice 3 deployed today); the Jobs window is held back. Not started: T1a, M-WF2, T1b reconciliation, T1c, T2, R5 Workforce and Geospatial, R3, R4. |
| M1c Enterprise onboarding | Not started (WI-OI-120p is Proposed). |
| M2–M7 | Not started under version 2. Code from WI-OI-091 to 118 exists but is unreviewed. Only Inventory, Catalogue and Finance GL have metadata windows; several of those modules have static screens. |
| Assistant (WI-OI-121) | A preview, not a product. Text chat and one real CMMS lookup work locally. All 22 cards are hard-coded; the drawer's chat is refused by its own route; the tool registry is unused; several routes have no permission check. It is not deployed. |

## 4. Phases, in order

### Phase 0. Finish what is open, and clean up (no new features)

Goal: a branch that builds, true statuses, no demo data, and the open decisions made.

| # | Step | Cards | Status now |
| --- | --- | --- | --- |
| 0.1 | Workforce Slice 3: read-only check on UAT, rerun the Workforce journey, record the evidence | WI-OI-120u | Done 2026-10-14 (journey `7i0v43`) |
| 0.2 | Commit the trial-extension card | WI-OI-120ai (card only) | Done (`4b33173`) |
| 0.3 | **Branch repair.** Decide each of the 12 unreviewed commits from other sessions: keep after review, fix, or revert. Fix the `0d4585e` build break and the `0e2f119` CMMS migration 20 vs contract 19 mismatch. Revert `507e7fa` (`assistant:*` granted to every member). HEAD then builds from a clean checkout. Owner chose option A (2026-10-14): revert the Assistant preview from the branch. | WI-OI-120aj; WI-OI-120a closes here | Part 1 done 2026-10-14 (`9b0c477`) |
| 0.3b | **Undo the development script's writes on the UAT database:** modules switched on in 288 workspaces, and `*` and `assistant:` codes on members. A reconciliation report against the 2026-10-08 backup, then an owner-run script after a Security review. | WI-OI-120al (absorbs 120aj D1a, D2a) | Applied on UAT 2026-10-14; Q2a → WI-OI-120am |
| 0.3c | **UAT gets its own database** (Q2a): `uat-postgres` with no published port, new passwords, the data moved and verified; the old database is development-only, bound to `127.0.0.1` with rotated logins | WI-OI-120am | Done 2026-10-14 (journey `7xqjy6`); C7, the D3a reset and the `.prev` deletion from 2026-10-21 |
| 0.4 | **Zero-mock sweep** (details below) | WI-OI-120ah first, then new card WI-OI-120ak | 120ah carded |
| 0.5 | **Security fixes the reviews found** (details below) | WI-OI-120ag, 120ae, 120af, 120ai | Carded |
| 0.6 | **Status truth.** Re-label every Review item by evidence (Built, On UAT, Done). Correct WI-OI-121a–j, which claim G6/G7 for a preview. Close each item that §5 replaces, with a pointer to its replacement. Shorten `NOW.md` back to one page. | WI-OI-119 follow-up | Not started |
| 0.7 | **Owner decisions** (details below; no code) | — | Open |
| 0.8 | **Journey `7i0v43` follow-ups** (details below) | new cards as needed | Found 2026-10-14 |

Step 0.3, the 12 commits to decide: Assistant `e0ec197`, `507e7fa`, `7c15655`, `0d4585e`, `eee6276`; CMMS
`f7cfa7b`, `e1246f8`, `c80ea2b`, `0e2f119`, `54d33bc`, `e723ba1`, `21e13da`.

Step 0.4, the zero-mock sweep:
- **Inventory first.** List every production-reachable hard-coded or mock screen, API and card.
- **Extend the runtime-data audit** so these patterns fail the build: `INITIAL_`, `MOCK_`, `SAMPLE_` and `DEMO_`
  constants; timers that fake success; pages that never fetch.
- **Fix each item:** remove it, or connect it to its real service.
- **Known items:**
  - `/gigaops/time` (`PlantOperationsHub`): this is 120ah;
  - `connectors/[slug]` waits 800 ms and fetches nothing;
  - the 22 Assistant cards, the Assistant tools and configuration pages, its in-memory rollout and "halt", and the
    drawer's suggestions;
  - Assistant routes with no permission check: any signed-in user can publish the workspace's Assistant policy or
    halt the Assistant;
  - sample payloads on the connections and rules-studio pages (are they test inputs, or mock?).

Step 0.5, the security fixes:
- **120ag:** the CMMS guard enforces the record routes' baseline permission.
- **120ae:** an idempotency answer is returned only to its own caller, and old answers are swept.
- **120af:** the conversion check compares record permissions with the module's REST routes.
- **120ai:** extending a trial keeps the modules the administrator switched off.

Step 0.7, the owner decisions:
- a. **UAT is production**, replacing G5–G7. This updates `AGENTS.md`, `.pi/PLAN.md`, version 2 §1 and §6, and the
  pointer in `CLAUDE.md`.
- b. **Named reviewers (D8):** one Security reviewer for every deploy, and an Accounting reviewer for posting.
- c. **Assistant ownership.** Take WI-OI-121 over from the other session. Keep its real parts (thread tables, module
  API, the signed CMMS call) and remove the rest.
- d. **CopilotKit copy in `vendor/`.** Either keep it (licence and security review, then commit it) or draw the chat
  with GigaLibs components.
- e. **Local model.** Which model, run where (a service in compose, on GPU or CPU), and whether external models are
  ever allowed, per workspace or never.
- f. **Stage 0 decisions:** D2 support access, D3 approval policies, D6 registers, D7 first-value scenarios, D9
  migration template. Accept ADR-0003 and ADR-0016. The D6 action register and access-path matrix also become the
  Assistant's list of tools.
- g. **Other open items:**
  - 980 place-fact dead letters;
  - the `communications-textfly` and `platform-rbac` folders: adopt or remove;
  - Master Data Hub (a contained prototype): retire it, since Parties, Catalogue and Organization windows replace it;
  - whether S14 import and export runs on Universal Data Studio (if it does, Data Studio moves to Phase 4);
  - 12 package folders that hold no package, and 20 packages that no app or module uses (§7 F): keep each one for a
    named card, or remove it;
  - old test sessions;
  - ADR-0017.
- h. **Module tiers (§8).** Confirm the "Proposed" rows: core for every workspace, foundations switched on
  automatically, and optional modules by plan.

Step 0.8, the journey `7i0v43` follow-ups, routed by where they belong:
- **Core bug now:** saving the organization structure draft answers 400 (`…/organization/versions/{id}/submit`).
- **Core UX now:** the invitation link does not fill in its token; a reload loses the Settings tab.
- **Tooling now:**
  - the `--journey` wrapper should not ask for an administrator sign-in;
  - an owner-run password reset for `uat.admin@gigalibs.io` (active, never signed in, password unknown).
- **With 120ah (0.4):** `/gigaops/attendance` calls the timesheet preview for an administrator with no linked person
  (403).
- **With R5 CMMS (1.1):** the CMMS viewer is offered "New work order", and its page calls `/api/maps/nodes` without
  Geospatial access (403).
- **With X1 (3.9):** internal codes such as `TENANT_ADMIN` are shown; 37 layout and 17 accessibility findings.

**Exit:** HEAD builds; the zero-mock audit passes on HEAD; every card has a true status; decisions a–f are recorded.

### Phase 1. The foundation, proven on CMMS

This phase covers metadata, access control, generative UI, SaaS and production operations.

Goal: the first production-ready product. A CMMS-only customer:
- signs up and sets up;
- runs maintenance with roles held per unit and site;
- uses the Assistant on its own CMMS data.

**1A. Access control and places for CMMS**

| # | Step | Cards | Status now |
| --- | --- | --- | --- |
| 1.1 | R5 CMMS: Security review, deploy, switch on CMMS unit and site scope. Journey: a technician in North cannot see South's work. | WI-OI-120z, 120aa, 120ab, 120ac | Built, not reviewed |
| 1.2 | T3 one place identity: review and deploy; move CMMS spaces onto Geospatial places | WI-OI-120ad, then the rest of T3 | Projection built; migration not started |

**1B. CMMS on metadata (M1a)**

| # | Step | Cards | Status now |
| --- | --- | --- | --- |
| 1.3 | M-CM1: Security review, release, then the M1a journey: administrator, supervisor and technician raise, assign, execute and close work orders | WI-OI-120t | 4 slices built, not reviewed |

**1C. Generative UI foundation.** New cards GU1–GU7 replace the WI-OI-121 preview.

| # | Card | What is built |
| --- | --- | --- |
| 1.4 | GU1 Assistant service | The module API owns threads, messages, runs and audit; the web app runs no SQL of its own. Every route checks Assistant permissions. The model is a service in compose, configured rather than hard-coded. Replies stream with tool events. The retention policy is published through Configuration Studio. |
| 1.5 | GU2 Tools from the dictionary | For every published window: search, list, open a record, draft a create or update, run an action. All generated, none hand-written. A person sees only the tools they hold permission for. Calls go through the gateway as that person, so roles, scope, field rules and column rules all apply. |
| 1.6 | GU3 Cards from the renderer | Record, list, draft-form and confirm cards are drawn by the same renderer as the windows. Maps and charts come through declared component contracts. No hand-written cards. |
| 1.7 | GU4 Confirm before change | Every create, update or action shows a confirm card first. It runs once (idempotency key), follows approval policies, and is audited as "by <person> via Assistant". |
| 1.8 | GU5 Grounded answers | Every fact comes from a tool result and links to its record. A record the person cannot see is "not found", with nothing leaked. No data means the answer says so. |
| 1.9 | GU6 Adoption kit | The S16 conversion kit and `module:new` (WI-OI-085) add an Assistant contribution: descriptions, examples, exposed actions. The S16 checker fails a module without it. The journey template gains an Assistant section. |
| 1.10 | GU7 Proven on CMMS | Examples: "my open work orders"; "raise a work order for pump P-1 at Site A" (confirmed); "close this work order"; "what is due this week". Refused for another unit, site or workspace. Security and Privacy review, deploy, journey. |

**1D. SaaS foundation for the first customer**

| # | Card | What is built | Status now |
| --- | --- | --- | --- |
| 1.11 | T8a Workspace lifecycle | Sign-up, trial, plan and modules, trial end, paid or read-only suspension, reactivation (120ai's fix belongs here). Module tiers (§8): core always on, foundations switched on by dependency, optional modules by plan. | Partly built; no suspension; tiers not enforced |
| 1.12 | N1 Email delivery (new) | Communications' email channel only: invitations, address verification, password reset and alerts. The provider sits behind an adapter with retries, bounce handling and audit. | `notifications-core` and `email-templates` exist; no app uses them |
| 1.13 | T11a Set-up wizard for CMMS | Company, units, sites, people, roles, CMMS set-up; reaches the M1a outcome without help | Not started |
| 1.14 | R17 Sign-in security (new) | MFA enforced for administrators, password reset by email (N1), sessions revoked on role change | TOTP code exists in `auth-core`, not verified on UAT |
| 1.15 | R11 Platform support access | D2: consented, time-limited, audited support sessions | Not started |
| 1.16 | T9a Export and deletion | A workspace can export its data and be deleted with proof | Not started |

**1E. Production operations (UAT is production)**

| # | Card | What is built |
| --- | --- | --- |
| 1.17 | O1 Environment hardening | Domain and TLS, secrets management, no default credentials, review of what the network exposes |
| 1.18 | O2 Recovery | Automatic backups, a restore drill, rollback per migration, agreed RPO and RTO |
| 1.19 | O3 Observability | Logs, metrics and alerts per journey; alerts reach a person |
| 1.20 | O5 Security operations | Dependency, secret and image scanning on every build; incident response |
| 1.21 | O6 and O7 Runbooks and guides | Runbook per service; administrator and user guide for CMMS |

**Exit:** the first customer can go live on CMMS. The Phase 1 journeys pass on UAT, the restore drill passes, there
are no Critical or High findings, and every card has its Security review.

### Phase 2. Workforce and departments (M1b), on the same foundation

| # | Step | Cards | Status now |
| --- | --- | --- | --- |
| 2.1 | Finish M-WF1: the Jobs & positions window (held back). Workforce in the Assistant, checked with the kit: "who can work at Site A tomorrow", "request my day off" (confirmed). | WI-OI-120u | People, availability, absences and bookings on UAT |
| 2.2 | T1a Automatic worker link when an invitation is accepted | WI-OI-120o (no card yet) | Not started |
| 2.3 | M-WF2 Time and timesheet approval on metadata (the clock-in panel stays a component) | new | Not started |
| 2.4 | T1b One worker record: reconciliation proves no WFO worker is left unmapped | new | WFO screens retired today |
| 2.5 | T1c CMMS workers become a projection of Workforce | new | Not started |
| 2.6 | T2 Departments become organization units | new | Not started |
| 2.7 | R5 Workforce, then R5 Geospatial | new | Not started |
| 2.8 | R3 Segregation of duties | new | Not started |
| 2.9 | R4 Delegation and revocation | new | Not started |

**Exit:** linked technicians punch time and a supervisor approves the week. Two departments cannot see each other's
work. The Assistant can do the same on Workforce, within the same limits.

### Phase 3. Enterprise onboarding and SaaS completion (M1c)

| # | Step | Cards | Status now |
| --- | --- | --- | --- |
| 3.1 | S17 Platform screens on metadata: settings, team, organization, access, plan, parties, administration | new | Not started |
| 3.2 | R13 Delegated people administration | WI-OI-120p | Proposed |
| 3.3 | R14 Bulk people: import, invitations, grants, offboarding | WI-OI-120p | Proposed |
| 3.4 | R15 Directory groups mapped to scoped roles, plus single sign-on (OIDC and SAML) | WI-OI-120p, WI-OI-013 | SCIM exists; SSO not built |
| 3.5 | R16 Personas from roles | WI-OI-120p | Proposed |
| 3.6 | T11b Full set-up wizard: all chosen modules and solution packs | new | Not started |
| 3.7 | T8b Metering, quotas and billing hand-off | WI-OI-015 | Not built |
| 3.8 | T9b Retention classes and legal hold | new | Not started |
| 3.9 | X1 UX standard version 2 | WI-OI-120b closes here | 120b in progress |
| 3.10 | X2 Task benchmark (a measurement, not a gate) | new | Not started |

**Exit:** a department head adds 200 people in one import, within allowances. Single sign-on, directory groups and
the set-up wizard work. Usage is metered. Administrators can invite, grant and offboard through the Assistant, with
confirmation.

### Phase 4. The engine every module needs (M2, with shared capabilities brought forward)

Every module conversion in Phases 5 and 6 uses these capabilities. Building them first means each module is
converted once. Version 2 left S7–S14, R8, R9, R12, X4 and X5 for M7, which would have meant converting every
module twice.

Order:

1. **Engine and fields:** E1 document lifecycle → S2 accessibility → S3 money fields → S4 quantity fields.
2. **Customization and routing:** S5 workspace customization → S6 dictionary menus → S15 gateway from declared
   routes.
3. **Approvals and rights:** R10 export rights → R6 approval policies → R7 document-action access.
4. **Shared capabilities:** S7 processes → S9 record history → S8 reports and info windows → S10 attachments →
   S11 translations → S12 document templates → S13 numbering → S14 import and export.
5. **Finer access:** R8 record sharing → R9 column rules → R12 explainable access.
6. **Working surfaces:** X4 my-work inbox → X5 search everywhere.

Each capability is visible to the Assistant: processes, reports and imports become tools, and inbox items become
cards.

**Last step:** apply them to CMMS and Workforce, so the first two modules are complete.

### Phase 5. Money flows, one module at a time (M3–M6)

Every module goes through the S16 kit (metadata, access rows, Assistant) and the Done checklist. Posting also needs
the Accounting reviewer.

| # | Flow | Order |
| --- | --- | --- |
| 5A | First posting | M-CUR Multi-Currency (real rates; the fabricated figure removed) → E2 → M-INV1 Inventory → E3 → E5 → M-FIN1 GL completion (WI-OI-120l closes here) |
| 5B | Procure to pay | T4 parties everywhere → T5 one stock authority → R5 Inventory, Procurement, Finance → M-PROC, with 3-way match → M-SPEND Spend into AP → E6 budget control → E4 relays |
| 5C | Quote to cash | M-TAX Tax (tax on order and invoice lines) → T7 invoice owners → M-ORD → M-AR0 → M-AR, with FR-17 event billing (WI-OI-040) → M-TRE treasury → R5 Orders, AR → E4 relays |
| 5D | Record to report | M-COST → M-BUD → T6 asset link → M-FA → M-CLOSE → T12 legal entities → M-CONS |

### Phase 6. Every remaining module, one at a time (M7)

1. **M-CM2 CMMS complete:** reliability, kiosk, EAM, permits (WI-OI-108).
2. **M-WF3 Workforce complete:** scheduling, pay readiness, compliance, handovers; reuses the WI-OI-067 to 071 code.
3. **M-GEO Geospatial.**
4. **M-ANA Analytics:** WI-OI-103d and 103f, live intelligence (WI-OI-072).
5. **M-U21:** Communications (every channel beyond N1's email), Connector Hub with Connections (WI-OI-104), Rule
   Studio.
6. **M-U29, one card per module, in this order:** Workflow Studio, Data Studio, eSignature, Document Scanner,
   Ontology, Saga, Autonomous Recovery. (Tax, Multi-Currency and Spend moved to Phase 5, where the money flows need
   them.)
7. **Remaining capabilities:** T10 legacy-data onboarding → X6 embedded analytics → X7 mobile and offline → X3 manual
   accessibility audit.
8. **Industry packs:** WI-OI-107, 074; the manufacturing release, WI-OI-079.
9. **M-NEW:** manufacturing, projects, returns.

### Future modules (a standing rule, not a phase)

A new module:
- is created with `module:new` and the S16 kit;
- enters the catalogue as available only after the S16 checker passes (dictionary, access rows, Assistant
  contribution, journey section) and the Done checklist is complete.

## 5. Older work items: where each one goes

Nothing is dropped. Each older item either closes on its existing evidence (step 0.6) or continues as the card named
here.

| Older items | Goes to |
| --- | --- |
| 001, 004, 036, 037, 041, 062, 119 (programmes and audits) | Replaced by this plan; close in 0.6 |
| 003, 005–010 (Release 1 verification, threat model, recovery, metrics, CI security, accessibility, performance) | Done checklist and O1–O7 (1.16–1.20) |
| 011 Demo Lab | Labelled test workspaces (rule 2); no demo data in customer workspaces |
| 012 governed AI documents, 121 and 121a–j Assistant | GU1–GU7 (1.4–1.10); document questions are a later GU card |
| 013 SSO and MFA | R17 (1.13), R15 (3.4) |
| 014 external actions, 032 OAuth studio, 104 Connector Hub | M-U21 |
| 015 metering and billing, 028 control panel and marketplace | T8a, T8b; R-cards |
| 016, 018, 031, 074, 079, 107 packs and vocabulary | Phase 6 step 8 |
| 017, 025, 056 workflow; 024, 034, 054 rules | M-U29 Workflow Studio; M-U21 Rule Studio |
| 019, 035, 053 AR; 040 event billing | M-AR0, M-AR (5C) |
| 020 Spend, 021 and 057 tax and currency, 022 treasury foundation | M-SPEND (5B), M-TAX (5C), M-CUR (5A), M-TRE (5C) |
| 023 and 055 Data Studio, 027 Recovery | M-U29 per module (Phase 6) |
| 026, 059 Connector Hub and local module runtime | M-U21; 059 closes on its evidence |
| 029, 063, 105 geospatial and places | T3 (1.2), M-GEO |
| 030 infrastructure broker | O1; parked unless a named need appears |
| 033 Day-1 experience | T11a, T11b |
| 038 CMMS | M-CM1 (1.3), M-CM2 |
| 039, 042, 044–052, 080–083, 085, 102, 109, 110 (configuration, hierarchy, Delta 5, module SDK, kernel, dictionary) | Foundation already built; close on evidence in 0.6; 085 is extended by GU6 |
| 043, 103, 106 Analytics and reports | M-ANA; S8 and S12 |
| 058, 101 (gutter, disk guard) | Close on evidence |
| 060, 061, 065–071 Workforce | M-WF1, M-WF2, M-WF3 |
| 064 configurability proof, 072 live intelligence | M-ANA (Phase 6) |
| 091 Inventory, 092 Procurement, 093 Orders, 094 Finance, 095 Treasury | M-INV1, M-PROC, M-ORD, M-FIN1, M-TRE |
| 111 Parties, 112 Catalogue, 113 handshake | T4; 112 closes (on UAT); E3, E4 |
| 114 fixed assets, 115 consolidation, 116 costing, 117 budgets, 118 close | M-FA, M-CONS, M-COST, M-BUD, M-CLOSE |
| 108 contained handovers and permits | M-CM2 (permits), M-WF3 (handovers) |
| WI-EAM-001 to 005 (CAFM spaces and CAD, asset taxonomy, manuals and failure modes, telemetry and meter triggers, storerooms; CMMS migrations 15–19) | M-CM1 (spaces and assets windows, 1.3) and M-CM2 (the rest); statuses re-labelled in 0.6 |
| WI-WFO-001 to 006 (workforce operations: registry, staffing and bulk invitations, contracts, payroll admin and expenses, demand forecast and shift swaps, compliance and vendors) | Screens retired in WI-OI-120u Slice 3 (2026-10-13); the 13 `wfo_*` tables are empty. Capabilities re-homed: bulk invitations in R14; contracts with eSignature; expenses in M-SPEND; vendors in T4; forecast, shifts, compliance and pay in M-WF3. Cards close in 0.6. |
| `FOUNDATION-CLOSE.md` (owner decision 2026-09-30) | Close on evidence in 0.6 |
| 120a U1, 120b U1b, 120l U12, 120m journey, 120p people, 120y deploy tool | 0.3; 3.9; 5A; the standing journey; 3.2–3.5; close on its review |

## 6. How each session uses this plan

1. `NOW.md` names the one open step of this list.
2. The session writes or opens that step's card, shows it, and waits for the owner's OK.
3. The card runs the Done checklist (§2) and reports which boxes are ticked, with evidence.
4. Only then does `NOW.md` move to the next step.

## 7. Module inventory: everything this plan covers

Sources, as of 2026-10-13:
- the 37 entries of the generated catalogue (`packages/contracts/src/modules/catalog.generated.ts`);
- the 25 module manifests in `modules/`;
- the 60 folders in `packages/`;
- `solutions/packs/`;
- the product vision (`docs/GIGALIBS_PRODUCT_VISION.md` §3).

"Runs on UAT" means the module's service is running there. It does not mean the module is done.

### A. Platform (the kernel): built once, used by every module

The status is the catalogue's own label.

| # | Catalogue entry | What it is | Catalogue status | Phase |
| --- | --- | --- | --- | --- |
| 1 | Tenant & Access Administration | Members, roles, invitations | Review | 1.1, 1.14; 3.1–3.5 |
| 2 | Personal Security | Own password, MFA, sessions | Review | 1.14 R17 |
| 3 | Platform Control Tower | Workspaces, trials, entitlements | Review | 1.11 T8a, 1.15 R11 |
| 4 | Modules & Plan | Choosing modules and a plan | Review | 1.11 T8a, 3.7 T8b |
| 5 | Organization (in Settings) | Units and sites (ADR-0018) | — | 2.6 T2, 3.1 S17 |
| 6 | Parties (core) | Customers, vendors, contacts | — | 5B T4 |
| 7 | Dynamic Form Studio (Configuration Studio) | Edits the metadata itself | Review | Phase 4 (S5) |
| 8 | Approval Queue | Approvals waiting for a person | Review | Phase 4 (X4 my-work inbox) |
| 9 | Execution Runs | Runs of workflows and jobs | Review | Phase 4 (S7 processes) |
| 10 | Exceptions & Recovery | Failed runs to retry | Review | Phase 4 (S7), 1.19 (O3) |
| 11 | Business Value Ledger | Value delivered, traced to evidence | Review | Phase 6 (M-ANA) |
| 12 | Master Data Hub | Contained prototype | Contained | 0.7g: retire |
| 13 | Solution Packs | Industry packs | Concept | Phase 6 step 8 |
| 14 | GigaLibs Assistant | Generative UI over every module | Preview (development only) | 1.4–1.10 (GU1–GU7) |

### B. Business modules in the application today

There are 25 module manifests. Communications and TextFly share one row below.

**Physical operations and workforce**

| # | Folder | Catalogue name | Runs on UAT | Metadata windows | Phase |
| --- | --- | --- | --- | --- | --- |
| 1 | `physical-operations-cmms` | Asset & Maintenance (CMMS) | Yes | 8, built, not released | 1 (M-CM1); 6 (M-CM2) |
| 2 | `gigaops` | GigaOps Universal Workforce | Yes | 8 on UAT (Jobs held back) | 2; 6 (M-WF3) |
| 3 | `geospatial` | Geospatial Studio | Yes | None | 1 (T3); 6 (M-GEO) |

**Supply chain and commercial**

| # | Folder | Catalogue name | Runs on UAT | Metadata windows | Phase |
| --- | --- | --- | --- | --- | --- |
| 4 | `universal-inventory` | Universal Inventory & Warehouses | Yes | 6 | 5A (M-INV1) |
| 5 | `product-catalogue` | Product & Catalogue Studio | Yes | 8 (U7) | On metadata; completed with Phase 4 (S3, S4) |
| 6 | `universal-procurement` | Universal Procurement & Payables, plus 3-Way Match Invoices | Yes | None (hard-coded screen) | 5B (M-PROC) |
| 7 | `universal-orders` | Universal Order Management & Fulfillment | Yes | None (hard-coded screen) | 5C (M-ORD) |

**Finance**

| # | Folder | Catalogue name | Runs on UAT | Metadata windows | Phase |
| --- | --- | --- | --- | --- | --- |
| 8 | `financial-operations` | Financial Operations & General Ledger. Seven sub-domains in one module: GL, treasury, fixed assets, costing, budgeting, close, consolidation. | Yes | 5 (GL) | 5A (M-FIN1); 5C (M-TRE); 5D (M-COST, M-BUD, M-FA, M-CLOSE, M-CONS) |
| 9 | `multi-currency` | Multi-Currency Treasury | No | None | 5A (M-CUR) |
| 10 | `accounts-receivable` | Accounts Receivable | No | None | 5C (M-AR0, M-AR) |
| 11 | `spend-management` | Spend Management & AP | No | None | 5B (M-SPEND) |
| 12 | `tax-configuration` | Tax Configuration | No | None | 5C (M-TAX) |
| 13 | `autonomous-recovery-studio` | Autonomous Recovery Studio | No | None | 6 |

**Documents**

| # | Folder | Catalogue name | Runs on UAT | Metadata windows | Phase |
| --- | --- | --- | --- | --- | --- |
| 14 | `esignature` | E-Signature | No | None | 6 |
| 15 | `document-scanner` | Document Scanner | No | None | 6 |

**Data, intelligence and integration**

| # | Folder | Catalogue name | Runs on UAT | Metadata windows | Phase |
| --- | --- | --- | --- | --- | --- |
| 16 | `analytics-studio` | Analytics Studio | Yes | None | 6 (M-ANA) |
| 17 | `universal-connector-hub` | Connector Hub, plus Connections | Yes | None | 6 (M-U21) |
| 18 | `universal-data-studio` | Data Contracts | No | None | 6, or 4 (decision 0.7g) |
| 19 | `ontology` | Operational Ontology | No | None | 6 |

**Orchestration, decisions, communication and AI**

| # | Folder | Catalogue name | Runs on UAT | Metadata windows | Phase |
| --- | --- | --- | --- | --- | --- |
| 20 | `workflow-studio` | Workflow Definitions | No service of its own | None | 6 |
| 21 | `universal-rule-pro` | Universal Rule Studio | No service of its own | None | 6 (M-U21) |
| 22 | `saga-orchestrator` | Saga Orchestrator | No | None | 6 |
| 23 | `communications`, plus `communications-textfly` (the owner's separate TextFly app) | Omnichannel Communications | No | None | 1.12 (N1 email); 6 (M-U21) |
| 24 | `gigalibs-assistant` | GigaLibs Assistant | No (development preview) | — | 1 (GU1–GU7) |

`modules/platform-rbac` has no manifest. It was merged into the kernel on 2026-09-29 (WI-OI-102g) and is left over
as an untracked folder (decision 0.7g).

### C. Modules to build, already in this plan

| Module | What it is | Phase |
| --- | --- | --- |
| Manufacturing (U24) | Bills of materials, production orders, posting | 6 (M-NEW) |
| Projects (U25) | Projects, phases, tasks, issues to projects, posting | 6 (M-NEW) |
| Returns (U26) | Return authorisations linked to shipments and credits | 6 (M-NEW) |
| Mobile and offline (U27, X7) | Technicians work, punch time and capture evidence offline | 6 |
| Industry packs | 10, as configuration: agriculture, construction, event staffing, healthcare, JP metro industrial, logistics, manufacturing, QSR, travel crew, warehouse. Each needs its acceptance suite. | 6 step 8 |
| Country packs | 6, as configuration: AU, EU, GB, IN, JP, US | 6 step 8 |

### D. Domain modules in the product vision with no card yet

The owner decides whether and when each one becomes a card. Each would sit after Phase 6, or earlier if a named
customer needs it, and is built with `module:new` and the S16 kit (metadata, access rows, Assistant).

| Module | What it would cover |
| --- | --- |
| CRM and revenue operations | Leads, opportunities, pipeline, campaigns |
| Service desk | Tickets, SLAs, knowledge base. The old `tickets-core` package was removed on 2026-09-29. |
| Commerce | Cart, checkout, payments through a payment-gateway adapter |
| Logistics and shipping | Carriers, shipment tracking, freight cost |
| Quality management | Inspections, non-conformance, corrective actions; pairs with Manufacturing |
| Contracts and legal | Contract lifecycle, legal case management |
| HR beyond Workforce | Recruiting, performance, learning. Statutory payroll and tax filing stay out of scope (roadmap P8) unless the owner decides otherwise. |
| Document intelligence | Questions over documents, with citations (WI-OI-012); a later GU card |

### E. Shared packages: building blocks, not modules

| Group | Packages |
| --- | --- |
| Kernel and security | `auth-core`, `auth-nest`, `rbac-core`, `rbac-nest`, `tenancy-nest`, `audit-core`, `audit-nest`, `crypto`, `privacy-gdpr`, `platform-settings`, `platform-settings-nest`, `validation-nest`, `logger`, `db`, `db-migrations-runtime`, `jobs`, `module-sdk`, `module-registry`, `module-registry-nest`, `web-sdk`, `contracts` |
| Metadata | `configuration-core`, `configuration-react`, `custom-fields-nest`, `forms-engine-nest` |
| Interface | `analytics-charts`, `charts-react`, `kpi-widgets-react`, `maps-react`, `notifications-react`, `gigalibs-controls`, `i18n` |
| Infrastructure | `broker`, `cache`, `queue`, `redis`, `realtime`, `event-bus`, `storage-core` |
| Domain engines | `analytics-core`, `invoices-core`, `spend-core`, `rule-engine-universal`, `geofence-engine`, `maps-core`, `multi-currency`, `notifications-core`, `email-templates`, `host-kit`, `embed-sdk` |

**Not used as a dependency** by any app or module `package.json` (20): `cache`, `charts-react`,
`db-migrations-runtime`, `email-templates`, `embed-sdk`, `event-bus`, `geofence-engine`, `gigalibs-controls`,
`host-kit`, `invoices-core`, `kpi-widgets-react`, `maps-react`, `multi-currency`, `notifications-core`,
`notifications-react`, `queue`, `realtime`, `redis`, `spend-core`, `storage-core`. Some may be used another way, for
example `db-migrations-runtime` by the images. Decision 0.7g checks each one.

**Folders with no package** (no `package.json`; 1 to 23 files each): `activity-feed`, `api-keys`, `comments`,
`data-import-export`, `feature-flags`, `industry-packs`, `integrations`, `presence`, `scheduler`, `search`,
`tags-taxonomy`, `webhooks-outbound`.

## 8. Module tiers: what every workspace gets, and what it buys

Owner, 2026-10-13: three tiers. "Agreed" rows were settled in conversation. "Proposed" rows wait for decision 0.7h.
This keeps ADR-0016 F1 (core means the kernel only): tier 1 is the kernel and its screens, and tiers 2 and 3 use the
`capability` and `business` categories that the manifests already declare.

### Tier 1. Core: every workspace, always on, never sold separately

| Item | Status |
| --- | --- |
| Tenant & Access Administration, Personal Security, Modules & Plan, Organization, Parties, Configuration Studio, Approval Queue (becomes the my-work inbox), Execution Runs, Exceptions & Recovery | Agreed |
| Email delivery (N1, step 1.12) | Agreed |
| Kernel services behind them: sign-in, sessions, roles and scope, settings, audit, jobs, events, module registry | Agreed (ADR-0016 F1) |

Platform Control Tower is not part of any workspace. Only the platform's own operators use it.

### Tier 2. Foundations: switched on automatically when a module needs them, never sold alone

| Foundation | Switched on by | Status |
| --- | --- | --- |
| Multi-Currency | Every workspace gets basic currency for money fields. Exchange rates switch on with Orders, AR, Procurement, Spend or Finance. | Agreed |
| Tax | Orders, AR, Procurement, Spend or Finance | Agreed |
| Places (the Geospatial place identity, T3) | CMMS, Workforce, Inventory | Proposed |
| Analytics engine (reports inside every module, ADR-0016 F13) | Every module's reports (S8) | Proposed |
| Workflow engine (approvals) | Approval policies (R6) | Proposed |
| Connector Hub (the one way in, ADR-0016 F8) | Any integration or import | Proposed |

### Tier 3. Optional: chosen per plan

| Kind | Modules | Status |
| --- | --- | --- |
| Business modules | CMMS, Workforce, Inventory, Product Catalogue, Procurement, Orders, Finance & GL, Accounts Receivable, Spend & AP | Spend & AP agreed; others proposed |
| Add-on capabilities | GigaLibs Assistant, Analytics Studio (the builders), E-Signature, Document Scanner, Data Studio, Ontology, Saga, Autonomous Recovery, Communications channels beyond email, Business Value Ledger, Solution Packs | Assistant agreed (optional product, owner 2026-10-08); others proposed |
| Future modules | §7 C and D | When carded |

### What this needs in the product (part of T8a, step 1.11)

- The catalogue marks almost every tier 1 entry as switchable per plan (`entitlementEligible: true`). Tier 1 becomes
  always on and cannot be switched off.
- Each tier 2 foundation is switched on through the dependency list in its user's manifest (`requiredModules`), and
  switched off only when nothing needs it.
- Dependencies are reviewed: today `financial-operations` requires AR, Procurement, Orders and Inventory. A customer
  therefore cannot take the general ledger alone.
