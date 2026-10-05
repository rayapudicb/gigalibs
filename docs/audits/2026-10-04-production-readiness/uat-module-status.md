# UAT module status board and plan to production

- **Instance:** the owner's UAT instance (web http://127.0.0.1:5180), release `03ebd0c366b6-ff554c98771d`, deployed
  2026-10-05 04:57Z.
- **Production release verdict:** NO-GO.
- **How each status was established:**
  - running services: `docker ps`;
  - backend addresses: the web container's `*_API_URL` settings;
  - host ports: checked with `nc`;
  - schema ledgers: read-only SQL;
  - screen behavior: the WI-OI-119 audit (README §3–4, Appendix P2) and screens the owner reported.
- Rows marked *(not re-verified)* worked in earlier releases but have not been retested on this release.

## Status key

| Status | Meaning |
| --- | --- |
| **Working** | The backend runs and the screens use real data. UAT still has to confirm each business function. |
| **Partly working** | The backend runs, but known parts are fake, disconnected or blocked. |
| **Not working** | The screens open, but the backend fails or refuses. |
| **Not deployed** | No backend service runs on this instance; the screen can only show an error. |
| **Not built** | In the iDempiere spec, but no code exists. |

Every module is visible on the UAT instance (`GIGALIBS_UAT_PREVIEW=enabled`). The owner removed the on-screen UAT
labels on 2026-10-05, so this board is where testers see each module's status. **Nothing is hidden or contained.**
"CONTAINED" and "PLANNED" below are catalogue readiness labels only. iDempiere mapping:
`docs/architecture/IDEMPIERE_FUNCTIONAL_MAP.md`.

## 1. Status of every module today

### Platform and configuration (control plane, running)

| Module (menu) | Readiness | Status | Why | Fixed by |
| --- | --- | --- | --- | --- |
| Tenant RBAC & Settings | REVIEW | Partly working | Organization (Phase 1) works end to end. Localization "Save" reports success while the API refuses (U-07). The Plan screen marks locked modules as not openable. | U4 |
| Personal Security & Profile | REVIEW | Working | Password login has no lockout or throttle (P1-20). | U3 |
| Platform Control Tower | REVIEW | Working | Grants tenant entitlements. **The five new modules (Catalogue, Inventory, Procurement, Orders, Finance) are not yet granted to any tenant.** | Owner action now |
| Modules & Plan | REVIEW | Working *(not re-verified)* | — | U28 |
| Configuration Studio (Application Dictionary, forms) | REVIEW | Partly working | Silently falls back to a built-in dictionary when loading fails. The renderer allows every field by default (P1-24). The screens break the design standard. | U1b, U3, U5 |
| Solution Packs | REVIEW | Working *(not re-verified)* | — | U28 |
| Workflow Studio & DAG Canvas | REVIEW | Partly working | API keys and template import are not connected. | U21 |
| Execution Telemetry, Exceptions & Quarantine, Approval Queues, Business Value Ledger, 3-Way Match Invoices | REVIEW | Working *(not re-verified)* | Release 0 accounts-payable outcome screens on the control plane. | U28 |
| Universal Rule Pro | REVIEW | Not working (fake) | Rules live in the web server's memory, with no tenant check (P0-04). The Rules API (host port 3900) is not running. | U3, U21 |
| Communications (TextFly) | REVIEW | Not working (fake) | In-memory messages marked "DELIVERED" without a provider; simulated softphone (P0-02). The TextFly module is uncommitted. | U21 (owner decision on TextFly) |

### Operations (Release 1 manufacturing modules)

| Module (menu) | Readiness | Status | Why | Fixed by |
| --- | --- | --- | --- | --- |
| EAM Operations Console (CMMS) | REVIEW | **Not working** | The service is down: migration 000017 uses an undefined type and 000017–000019 lack ledger rows. The correction is tested but awaits the owner. After it, 37 screen calls still have no route (P1-26). | U1 (CMMS), U19 |
| Universal Workforce & Payroll (GigaOps) | REVIEW | Partly working | Workforce runs again (migration 26). `/wfo/*` screens have no route; GigaOps › Time shows static data (P0-03); the offline punch queue is not per user (P1-25). | U20, U3 |
| Geospatial & OSM Studio | REVIEW | Working *(not re-verified)* | — | U28 |
| Universal Analytics Studio and Reports | REVIEW | Working *(not re-verified)* | — | U28 |
| Connections & Adapters, 1-Click OAuth Studio | REVIEW | Partly working | Connector Hub runs. The credential form fakes "saved" (P0-03). The inbound webhook takes the tenant from a header (P0-08). | U21, U3 |

### Enterprise Architecture phases (iDempiere-inspired)

| Module (menu) | Phase / WI | Readiness | Status | Why | Fixed by |
| --- | --- | --- | --- | --- | --- |
| Organization (Settings) | 1 / 109 | REVIEW | Working | Traced end to end in the audit. | U4 (verify) |
| Application Dictionary | 2 / 110 | REVIEW | Partly working | See Configuration Studio. | U1b, U5 |
| Core Parties | 3 / 111 | REVIEW | Partly working | No edit controls; no committed role grants `parties:*`; breaks the design standard. | U1b, U6 |
| Products & Catalogues | 4 / 112 | PLANNED | Not working | "HTTP 403": no tenant holds the entitlement. After the grant, creating fails because the proxy drops `Idempotency-Key` (P1-23). Breaks the design standard (the owner's screenshot). | Grant now, U1b, U2, U7 |
| Inventory & Warehouses | 5 / 091 | PLANNED | Not working | The screen shows hard-coded figures and simulates barcodes. The API rejects signed-in calls (revocation table mismatch, P1-02). No entitlement granted. | U2, U8 |
| Procurement & Payables | 6 / 092 | PLANNED | Not working | Hard-coded figures, `default-tenant`; same API rejection; no budget or approval enforcement (P1-06). | U2, U9 |
| Orders & Fulfillment | 7 / 093 | PLANNED | Not working | Hard-coded figures, `default-tenant`; same API rejection; second partial allocation always fails (P1-09). | U2, U10 |
| Convergence (events between modules) | 113 | — | Not working | No relay or consumer runs for any ERP event (P1-04). | U22 |
| General Ledger & Finance (Phases 8–14: GL, treasury, fixed assets, consolidation, costing, budgeting, close) | 8–14 / 094, 095, 114–118 | PLANNED | **Not working** | **All finance screens show hard-coded figures.** The API now runs (first time) but rejects signed-in calls (P1-02). Costing, consolidation, budgeting and close commands fail on their event writes, and costing/consolidation can leave orphan journals (P0-09, P1-03). | U2, U12–U18 |

### Modules whose backend is not deployed on this instance

The web app sends these to services expected on the Mac itself (`host.docker.internal:<port>`). **Nothing listens on
any of these ports**, so every screen shows an error, for example AR's "requires a credential-free loopback
AR_API_URL origin".

| Module (menu) | Readiness | Port | Extra known defects | Fixed by |
| --- | --- | --- | --- | --- |
| Accounts Receivable | CONTAINED | 3400 | Webhooks fall back to built-in secrets (P0-07); invoice authority split with Orders (P1-08) | U29 (deploy), U3, U11 |
| Spend Management & AP | CONTAINED | 3500 | Overlaps Procurement (two accounts-payable authorities) | Owner decision, then U29 |
| Tax Configuration | CONTAINED | 3600 | Needed by Orders and AR for tax | U29 |
| Multi-Currency FX | CONTAINED | 3700 | Fabricated translation-adjustment (CTA) figure (P0-10) | U29, U3 |
| Data Contracts & Schemas (Data Studio) | CONTAINED | 3800 | No authentication; tenant chosen by the caller (P0-05) | U3, U29 |
| Universal Rule Pro API | REVIEW | 3900 | As above (P0-05) | U3, U29 |
| Workflow Studio API | REVIEW | 4000 | As above (P0-05) | U3, U29 |
| Autonomous Recovery Studio | CONTAINED | 4200 | — | U29 |
| Cryptographic Esign Pro | CONTAINED | 4500 | Uses a development token endpoint | U3, U29 |
| AI Document Scanner, Operational Ontology, Distributed Saga Orchestrator, Governed Enterprise Reference | CONTAINED | none configured | Prototypes fail open on authentication (P1-11) | U29 (or owner decision) |

### In the iDempiere spec but never built

| Capability | Status | Card |
| --- | --- | --- |
| Manufacturing: bill of materials, production orders | Not built | U24 |
| Projects | Not built | U25 |
| Returns (RMA) | Not built | U26 |
| Mobile/offline shell (WI-OI-084) | Not built | U27 |

### Count today

| Status | Modules |
| --- | --- |
| Working (most not re-verified on this release) | 12 |
| Partly working | 8 |
| Not working | 9 |
| Not deployed | 11, plus the Rules and Workflow Studio APIs behind two modules counted above |
| Not built | 4 |

Counted per module. The five accounts-payable outcome screens count as five, and Connections with OAuth Studio as one.

## 2. Plan: from here to every module ready for UAT, on this one instance

Order matters: each stage unblocks the next. One card at a time; each card is shown to the owner before work starts.

| Order | Card | Outcome on the UAT instance |
| --- | --- | --- |
| Now | **Owner action** | Grant the five new modules to the UAT tenant in Platform Control Tower |
| 1 | **U1 finish** | CMMS correction applied, then CMMS deployed; Playwright smoke with a UAT administrator login |
| 2 | **U1b** (approved 2026-10-05) | Design-standard check added; Catalogue, Parties, Application Dictionary and the form renderer restyled |
| 3 | **U2** | Inventory, Orders, Procurement and Finance APIs accept signed-in calls; event writes and journal transactions fixed; proxy forwards `Idempotency-Key`/`If-Match` |
| 4 | **U3** | Security defects closed (SCIM, webhooks, caller-chosen tenants, rule kernel, login lockout, renderer) |
| 5 | **U29** | The 13 not-deployed modules run as services in this instance's compose stack, with signed platform context, or the owner decides to retire one |
| 6 | **U4–U21** | Each module's screens on real data, every button working or explained, design standard applied, and a Playwright business flow that enters its UAT data |
| 7 | **U22–U23** | Modules work together: events, one invoice owner, budget and period-lock enforcement, costing; journey flows (procure-to-pay, order-to-cash and others) |
| 8 | **U24–U27** | Never-built spec capabilities designed and built, each with its Playwright flow |
| 9 | **U28** | UAT run: tester accounts per role, scripts, defect list, status board, re-test |

## 3. Plan: from UAT to production

Passing UAT is not production. Each module still needs:

| Gate | What is missing today | Who |
| --- | --- | --- |
| Recovery | PITR/WAL archiving, encrypted off-host backups, a restore rehearsal of the full current schema (P0-13) | SRE card (R6 in the audit) |
| Identity and tenancy (WI-OI-013) | External identity provider, SAML/WebAuthn decisions, DNS/TLS, regional isolation | External providers and the owner |
| Build and supply chain | CI that builds, tests and scans; SBOM and provenance; a production deployment artifact (the Helm chart is incomplete) | Release Operations |
| Observability | Module metrics, traces, alerts, SLOs, on-call | SRE |
| Independent review (G5) | Named human Security, QA, Product, Accounting (Finance phases) and Legal (AGPL benchmark) reviewers | **Owner to appoint (D7)** |
| Release authority (G6) | A named human authorizes an immutable, scanned artifact with a rollout and rollback plan | Owner |
| Production observation (G7) | An agreed observation window with SLO and reconciliation evidence | SRE and Product |

Source of the findings: `README.md` in this folder. Plan: `remediation-backlog.md`.
