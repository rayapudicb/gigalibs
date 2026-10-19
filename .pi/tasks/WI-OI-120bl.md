# WI-OI-120bl: The GigaLibs agent organisation

- **Status:** Approved (owner, 2026-10-19): "card the organisation proceed by giving me the best better than
  iDempiere, you can take any other example if you want". Built 2026-10-19; not committed.
- **Work item:** WI-OI-120 (delivery governance). Documentation only: no product code, no deploy.
- **Size:** M (documents)

## Goal

GigaLibs works like a well-run software organisation:
- business agents per module, combining product owner, functional consultant and business analyst;
- shared specialists (tax by country, accounting standards, financial maths, reliability and others);
- industry practices (manufacturing, pharma, healthcare, agriculture, retail, hotels, sports, IT and others);
- engineering, quality, independent review, operations and customer operations (BAU).

Every module is benchmarked against the best products in its field, not against one reference. iDempiere is one
reference among several.

## Scope

- **New files:**
  - `.pi/org/ORGANIZATION.md`: principles, structure, operating model, gates, activation by wave, human authorities;
  - `.pi/org/ROSTER.md`: every role, its department, mission and status;
  - `.pi/org/AGENT-TEMPLATE.md`: the standard definition for any new agent;
  - `.pi/org/BENCHMARKS.md`: best-in-class references and standards per area, and what "better" means for GigaLibs;
  - `docs/knowledge/README.md` and `docs/knowledge/_template/PACK.md`: where knowledge lives and its rules
    (sources, citations, review, licences);
  - **12 pilot agents** in `.pi/agents/<id>/AGENT.md`:
    - `product_office`;
    - `maintenance_cmms_lead`, `reliability_engineering_specialist`, `industry_manufacturing` and
      `industry_facilities_real_estate`;
    - `gl_record_to_report_lead`, `accounting_standards_specialist`, `financial_mathematics_specialist` and
      `finance_controls_reviewer`;
    - `security_reviewer`, `code_reviewer` and `licence_ip_reviewer`;
  - **Design department** (owner, 2026-10-19: "you missed the design department (UX UI) ergonomics"): 10 roles in
    the roster, of which 4 are active, with files: `design_lead`, `product_designer`, `ergonomics_human_factors` and
    `design_system`. Plus a design knowledge pack, `docs/knowledge/design/PACK.md`;
  - **7 seed knowledge packs for the pilot:**
    - `docs/knowledge/modules/maintenance` and `modules/general-ledger`;
    - `docs/knowledge/industries/manufacturing` and `industries/facilities-real-estate`;
    - `docs/knowledge/specialists/reliability`, `specialists/accounting-standards` and
      `specialists/financial-mathematics`.
- **Changed file:** `.pi/AGENT_CATALOG.md` gains a section that points to the organisation and lists the pilot agents.
- **Must not change:**
  - product code;
  - the plan's order or dates;
  - other agents' files;
  - `AGENTS.md`. The `sdlc_orchestrator` / `agile_delivery_orchestrator` naming mismatch is noted for the owner.

## Rules this organisation keeps

- One implementation writer at a time; most agents are read-only knowledge, design or review roles.
- The producer never reviews its own work. Security, finance and licence reviews use a different model or tool.
- Humans hold the authorities AGENTS.md names: product acceptance, risk acceptance, accounting sign-off, legal,
  production release.
- **Knowledge is evidence:**
  - every fact in a pack cites a source;
  - packs for tax, accounting and regulated sectors are validated by a named human before code depends on them;
  - iDempiere (GPL v2) and every other product are references for business knowledge only. No code, text or
    proprietary content is copied.

## Done when

- [x] The organisation, roster, template, benchmarks and knowledge rules exist and agree with plan v3 §7.
- [x] The 16 pilot agents (12, plus 4 in Design) are defined with the template, and the 8 seed packs exist with verified pointers and open
  research questions (no unverified facts presented as researched).
- [x] `pnpm verify --audits` adds no new failure. On 2026-10-19 it fails on layers, design tokens and S16, all from
  earlier work; `audit:sdlc` passes.
- [ ] The owner reviews the organisation. Then come one card per pilot agent's first research task, and the next
  activation as each wave starts.

## Stop and ask if

- a role would change the plan's order, or add a module the plan does not have (plan v3 §7D: the owner decides);
- a knowledge pack would need paid or proprietary sources.
