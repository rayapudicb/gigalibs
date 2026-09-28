# WI-OI-074 — Industry vocabulary and configurable operations (enabler for roadmap P10)

Status: Ready — paused 2026-09-28 (owner chose to release manufacturing first, WI-OI-079; resumes before the second industry). G0–G2 recorded; vocabulary-layer design approved in direction by the owner on 2026-09-28  
Owner: SDLC Orchestrator / Configuration Studio / Workforce Domain / Maintenance Domain  
Execution: owner continuous mode (WI-OI-062). It takes the build slot while WI-OI-072 (P9) is Blocked on owner
decisions. It is pulled forward from P10 (industry suite, WI-OI-073), whose ten templates depend on it.  
Requirements: FR-01, FR-02, FR-12, FR-13, FR-14, FR-16; NFR-UX-001–004, NFR-SEC-001–005, NFR-DATA-001–004,
NFR-OBS-001–004  
Independent reviewers: Solution Architecture, Product, Web/Accessibility, Security & Privacy, QA/SDET

## Business problem

GigaLibs sells one operations product to customers in many industries. Every operational screen speaks one
industry's language (factory maintenance: "CMMS", "work order", "technician"), records a fixed set of facts and
offers fixed lists. A farm, a hotel, a broadcaster or a logistics firm sees software built for someone else.
That lengthens sales, invites demands for custom builds, and pushes towards per-client modules, turning a product
company into a services company whose costs grow with every customer.

## Problem statement

An operations leader in a new industry cannot adopt GigaLibs without engineering work, for four reasons:

1. **Words are hard-coded.**
   - User-facing text in the CMMS and GigaOps screens is fixed English (2 web files use `@gigalibs/i18n`).
   - Navigation uses internal names ("CMMS", "GigaOps").
   - The industry pack's `terminology` covers only five Workforce words, and no screen reads it.
2. **Records cannot carry the customer's own facts.** Work orders, assets, people and bookings have no custom
   fields. The CMMS custom-attribute and alias migrations (000008, 000009) are prototypes that are never installed.
3. **Choices are fixed in code.** Work-order types, priorities, asset statuses, worker categories and work-source
   types are enums.
4. **Industry packs configure analytics only** (P3), not the operational screens.

So onboarding a new industry means code changes, and every change risks forking the product.

## How it is fixed for every industry: four axes

Industries differ from each other along four axes. Three are configuration. The fourth is reusable code, never
per-client code.

| Axis | What differs | Mechanism | Who, and how fast |
| --- | --- | --- | --- |
| **Words** | What things, states and actions are called | Vocabulary layer (this item): every user-facing term is a key resolved from the tenant's industry pack | Non-engineer, minutes |
| **Data** | Which extra facts are recorded | Governed custom fields (ADR-0002 extension documents) on the canonical records | Non-engineer, minutes |
| **Choices** | Types, categories, reason codes | Tenant catalogues mapped onto a small, fixed set of behaviour classes | Non-engineer, minutes |
| **Rules and objects** | How money, time and stock behave; new kinds of object | Capability modules and rule packs. Configuration selects and parameterises them; a new rule shape (for example piece-rate pay) or object (for example shipments) is built once and reused by every client with that need | Engineering, weeks, then configuration for every later client |

For any new industry, map its operations onto the canonical concepts. What falls on axes 1–3 is configured.
What falls on axis 4 either already exists (configure it) or becomes a capability backlog item. "All
industries" is covered this way: everything that is only words, data or choices is configurable, and every real
rule difference becomes a reusable capability. ADR-0002 keeps money, ledgers, state machines, tenancy and
security in reviewed code.

### Canonical concepts across four industries

| Canonical concept | Manufacturing | Agriculture | Hospitality | Logistics |
| --- | --- | --- | --- | --- |
| Place | Plant › line › cell | Farm › field › block | Property › floor › room | Hub › warehouse › dock |
| Person / crew | Technician / shift crew | Farm hand / picking crew | Housekeeper / team | Driver / loading crew |
| Skill | Electrical L2 | Tractor licence | Deep-clean certified | CDL Class A |
| Work item | Work order | Field task / harvest run | Room turn | Delivery run |
| Asset | CNC machine | Tractor, irrigation pump | Suite, laundry machine | Truck, forklift |
| Stock item | Spare part | Seed, fertiliser | Linen, amenities | SKU (lots/expiry: **gap**) |
| Time check-in | Clock in at plant | Check in to field (geofenced) | Clock in at property | Start of route |
| Pay rule | Hourly with overtime | **Piece rate: gap** | Hourly with overtime | Hourly/mileage: **gap** |

## Beyond words: the full industry pack (owner question, 2026-09-28)

Vocabulary is one of seven layers. Industries also differ in how many facts they record, which screens and
personas they use, how people hand work to each other, their workflows, and the outcomes they measure. An
industry pack configures layers 1–6 together. Layer 7 stays in code.

| # | Layer | Answers | Today | Item |
| --- | --- | --- | --- | --- |
| 1 | Vocabulary | What things are called | 5 Workforce terms, unused by screens | WI-OI-074 |
| 2 | Fields and forms | More or fewer facts per record; which standard fields are shown or required | ADR-0002 framework with adopters tenant profile, invoice and customer; none on CMMS/Workforce | WI-OI-075 |
| 3 | Lists and types | The tenant's own task types and categories, each mapped to a fixed behaviour | Enums in code | WI-OI-076 |
| 4 | Capabilities, screens and personas | Which modules a tenant has; which sections and home page each persona sees | Module entitlements per tenant exist; fixed default roles (Admin, Manager, Member, Viewer) | WI-OI-077 (custom roles, persona navigation) |
| 5 | Workflows and hand-offs | Extra steps, gates, approvals, notifications and follow-up actions around each capability's core lifecycle | Workflow Studio engine exists (Review) but is not attached to CMMS/Workforce; approvals are coded | WI-OI-078 (lifecycle hooks into Workflow Studio) |
| 6 | Outcomes | Industry KPIs and dashboards from the same facts | Metric catalogue exists (P3); live operational facts wait for P9 | WI-OI-072 / P10 |
| 7 | Core rules | Invariants that make the product trustworthy: no double booking, immutable approvals, exact pay, never-negative stock, tenant isolation | Coded and certified | Capability backlog when a new rule shape is needed |

Workflows work like this. Each capability keeps a small fixed lifecycle, for example a work item goes
Open → In progress → Done/Cancelled, and a timesheet goes Submitted → Approved (then immutable). An industry
attaches its own steps to those transitions:
- checklists and forms at a step;
- gates ("spraying needs agronomist approval before it starts", "a room needs inspection before it is ready");
- routing and notifications;
- automatic follow-ups (create a task, request staffing).

The workflow engine may only call registered, safe actions. It cannot skip core rules such as four-eyes pay
approval.

## G1 — requirements and acceptance

1. Every user-facing string in the CMMS and GigaOps screens (labels, headings, buttons, statuses, empty states,
   errors, navigation) comes from a vocabulary key. A CI check fails on new hard-coded strings in adopted screens.
2. Terms resolve in this order: tenant override → industry pack → locale default → product default. A missing
   key never shows a raw key to a user; it falls back and is reported.
3. Vocabulary is a governed Configuration Studio definition (ADR-0002). The lifecycle is draft → validate →
   preview → approve → publish → activate. Versions are immutable and roll-back is by pinning. Changing it needs
   no deploy, migration or image rebuild.
4. Terms support singular and plural forms, and verbs for actions ("Check in to field").
5. The same terms reach exports, notifications and the pay/export files' human-readable columns. APIs and
   database names stay canonical and documented.
6. Acceptance: a non-engineer configures a blind industry's operational vocabulary in ≤ 30 minutes with no code
   or migration. Three industries run side by side on one build (per tenant). WCAG 2.2 AA stays at 0
   serious/critical.

Custom fields (axis 2) and tenant catalogues (axis 3) follow as WI-OI-075 and WI-OI-076 once this item is
certified (ADR-0002: one adopter certified before the next enters Build).

## G2 — design (vocabulary layer)

- **Keys:** namespaced canonical concepts, not screens: `concept.workItem.one/other`, `concept.asset.one/other`,
  `concept.person.one/other`, `concept.crew…`, `concept.place…`, `concept.skill…`, `status.workItem.OPEN`,
  `action.timeClock.clockIn`, `nav.maintenance`, `nav.workforce`. Screen text composes these keys with
  product-owned sentences, so an industry changes about 150 nouns and verbs, not thousands of sentences.
- **Definition:** extend `IndustryPackV1` with a versioned `vocabulary` map, validated against the key registry.
  Unknown keys are refused; plural pairs are required. The existing five `terminology` fields become aliases of
  the matching concept keys (backward compatible). A tenant overlay holds per-tenant overrides.
- **Resolution:** the BFF compiles the tenant's active pack and overlay into an immutable manifest (version and
  checksum) and serves it with the session. The web app uses a small, non-quarantined provider built on
  `@gigalibs/i18n` (`@gigalibs/i18n-react` stays quarantined). It is cached per version.
- **Defaults:** a neutral product pack ("Work item", "Asset", "Person"). The current maintenance and workforce
  wording becomes the `manufacturing` pack.
- **Governance and safety:** labels are text only (no markup or scripts) with length limits, and HTML-escaped at
  render. Changes are audited. A preview shows every affected screen before publish.
- **First adopters:** CMMS work orders, assets and the staffing card; GigaOps Clock & timesheets, Scheduling
  and Pay-ready outputs; navigation. Other screens follow.

## Honest limits

- Vocabulary does not create capabilities. Piece-rate pay, stock lots/expiry and shipments/routing need code
  (axis 4).
- Translating into other languages is content work that uses the same keys.
- "1,000 industries" is realistic only because the variety is mostly in words, data and choices; the capability
  shapes are far fewer. Coverage is proven per industry by the concept matrix, not assumed.
