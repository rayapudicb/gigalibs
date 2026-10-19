# The GigaLibs organisation

How GigaLibs is built and run, as an organisation of AI agents and named humans. The card is
[WI-OI-120bl](../tasks/WI-OI-120bl.md). Every role is listed in [ROSTER.md](ROSTER.md). New agents follow
[AGENT-TEMPLATE.md](AGENT-TEMPLATE.md), and the bar for each area is set in [BENCHMARKS.md](BENCHMARKS.md).
Knowledge lives in [docs/knowledge](../../docs/knowledge/README.md).

`AGENTS.md`, plan v3 and `docs/plans/phase-1-sizing.md` still govern the order of work and the rules of delivery. This
file describes who does the work and how it flows.

---

## 1. Principles

1. **Organise around business outcomes.** Each business module has a lead who owns its outcome from discovery to
   adoption. This follows the stream-aligned teams of *Team Topologies* (Skelton and Pais): the module lead and
   engineering form the delivery stream; platform teams and centres of expertise support it.
2. **Matrix, not silos:** module practices × industry practices × centres of expertise.
   - A payables design draws on the payables lead (the module), the tax specialist (the country), the financial
     maths specialist (the calculation) and, for a pharma customer, the pharma industry lead (the sector).
3. **One writer, many readers.** One implementation agent changes code at a time (AGENTS.md). Almost every other role
   researches, designs, tests or reviews, read-only.
4. **Independence.** The producer never reviews its own work. Security, finance-controls and licence reviews use a
   different model or tool from the producer.
5. **Knowledge is an asset.** What agents learn is written into versioned, cited and reviewed knowledge packs in
   `docs/knowledge`, so the next card starts from it instead of re-inventing it, and nothing rests on an agent's
   memory.
6. **Best in class, not one reference.** Each area is compared with the leading products and the relevant standards
   ([BENCHMARKS.md](BENCHMARKS.md)). iDempiere is one reference among several.
7. **Evidence over claims.** Statuses follow evidence (plan v3 rule 8). A screen that pretends, a test that is
   loosened, or a fact without a source is a defect.
8. **Humans hold authority.** Agents produce and recommend. Named humans accept the product, the risk, the accounts,
   the legal position and the release.
9. **Design is part of done.**
   - Every screen is designed for the person and the place it is used: a technician with gloves in a noisy plant, a
     planner at a desk all day, an accountant at month end.
   - Design reviews, usability and ergonomics are gates like tests and security.
   - Design decides; engineering builds.

---

## 2. Structure

```
Owner (human): vision, priorities, acceptance, production release
│
├─ Product office: portfolio, roadmap, intake, benchmarks, plan v3 keeper
│   └─ Delivery orchestration: work items, gates, one writer at a time
│
├─ Design: UX research, product and interaction design, UI and visual design, design system,
│   content design, accessibility design, data visualisation, service design, ergonomics and human factors
│
├─ Business practices: one lead per module (PO + functional consultant + business analyst)
│   ├─ Finance                      ├─ Supply chain and commercial
│   ├─ Operations and assets        ├─ People and workforce
│   ├─ Customer and service         └─ Platform business (tenancy, workflow, reporting, documents)
│
├─ Industry practices: one lead and knowledge pack per sector
├─ Centres of expertise: tax (per country), accounting standards, financial maths, controls, FX,
│   supply-chain planning, trade and customs, reliability, health and safety, quality and regulatory,
│   master data, privacy, payroll and labour law (per country)
│
├─ Engineering: architecture, contracts, backend, web, integrations, runtime, identity, data, AI, mobile
├─ Quality: QA strategy, test automation, financial and calculation testing, performance, accessibility, UAT
├─ Independent review and risk: security, code, finance controls, privacy and compliance, licence and IP
├─ Platform operations: release, observability, incidents, security engineering, backup and recovery, capacity
└─ Customer operations (BAU): support desk, incident and problem, change, onboarding and data migration,
    customer success and training, documentation
```

### 2.1 What a module lead is

One agent per module combines three hats, because at module level they need the same knowledge:

| Hat | In this role |
| --- | --- |
| Product owner | The module's vision, outcomes, backlog and priorities, within the plan. It prepares acceptance; the owner accepts. |
| Functional consultant | How the business process works end to end. Configuration, edge cases, fit and gaps. |
| Business analyst | Requirements, acceptance criteria, data, reports and KPIs, written for engineering. |

The module lead keeps the **module brief**: the knowledge pack for its module (section 5). It consults
specialists and industry leads; it does not replace them.

### 2.2 Specialists and industry leads

- **A specialist** is deep in one discipline and serves every module that needs it. Some specialists are
  parameterised by **country** (tax, e-invoicing, payroll, labour law) or by **standard** (IFRS, US GAAP, Ind AS). One
  agent, one pack per country, added when a customer needs it.
- **An industry lead** knows how one sector runs: its processes, rules, KPIs, vocabulary and systems. It writes the
  sector's **solution blueprint**: which GigaLibs modules, configured how, with which data and integrations. The
  plan's industry packs (plan v3 §7C) are its output.

---

## 3. How work flows

| Stage | What happens | Responsible | Consulted | Decides or can block |
| --- | --- | --- | --- | --- |
| 1. Sense | Signals: customers, support tickets, journeys, benchmarks, regulation changes | Product office, support desk, industry leads | Module leads | — |
| 2. Shape | Module brief, fit and gaps against the benchmarks, industry blueprint, specialist input; flows and screens from design; a proposed card with outcomes and acceptance | Module lead, product designer | Specialists, industry leads, ergonomics, solution architecture | A specialist can block a design that is wrong in its field (tax, accounting); the design lead can block a screen that fails its users or the design system |
| 3. Commit | The card is approved and placed in the plan's order | Product office | Delivery orchestration | **Owner** |
| 4. Build | Design, contracts and code: one writer | Engineering roles | Module lead, specialists | Solution architecture can block a design that breaks a boundary |
| 5. Prove | Tests that fail before and pass after; property tests for calculations; journeys; usability and ergonomics checks; accessibility and performance | Quality roles, design lead | Financial maths, ergonomics, module lead | QA's No-Go blocks a release |
| 6. Review | Independent security, code, finance-controls, privacy and licence reviews | Review roles (never the producer) | — | A reviewer's block holds until fixed or **the owner accepts the risk**; **the human accountant** signs finance |
| 7. Release | Release worktree, builds, backup, `--check` | Release operations | Platform operations | **Owner** deploys |
| 8. Run | Monitoring, incidents, support, changes | Platform and customer operations | Module lead | Incident lead can halt or roll back with the owner |
| 9. Learn | Feedback and incidents update the knowledge packs and the backlog | Module lead, product office | Everyone | — |

**Artefacts at each stage:** the module brief (knowledge pack), the card, the evidence (tests, journeys), the review
record on the card, the release record, and the updated pack.

---

## 4. Working rhythm

- **One card per session.** The orchestrator names it from `.pi/NOW.md`. Sessions are short and leave evidence.
- **Discovery runs ahead of build.** While engineering builds card N, the next module lead and its specialists shape
  card N+1, read-only. Discovery never writes product code.
- **Portfolio review with the owner** at each wave boundary. The product office brings outcomes against the plan, the
  benchmark gaps and the next wave's activations.
- **Every release:** an independent Security review; finance changes also get finance controls review and the
  accountant's sign-off.

---

## 5. Knowledge: where it comes from and how it is kept

Agents research; knowledge packs remember. Sources, in order of value:
1. **Customers:** their processes, documents, reports and interviews. The best source, and the reason for industry
   leads.
2. **Laws, standards and official guidance:** tax authorities, IFRS and local GAAP, ISO, GS1, HL7 FHIR, GMP, ITIL and
   others. Always cited with the edition or date.
3. **Leading products:** published documentation of SAP, Oracle, Microsoft Dynamics, IFS, IBM Maximo, Odoo, ERPNext,
   ServiceNow, Salesforce and others, for patterns and benchmarks ([BENCHMARKS.md](BENCHMARKS.md)).
4. **Open-source references:** iDempiere (`/Users/rayapudi/idem`, GPL v2), ERPNext and Odoo (various licences), for
   data models and rules.

**Rules (enforced by the licence and IP reviewer):**
- Learn business rules, processes and calculations, and write them in our own words. Cite the source file or page.
  **Never copy code, text or proprietary content.** Copying GPL code would place GPL obligations on GigaLibs.
- Every fact in a pack cites its source. "Not yet researched" is better than a guess.
- Tax, accounting and regulated-sector packs (pharma, healthcare, food) are validated by a named human expert before
  code depends on them.
- Packs are versioned in git and change through cards like any other artefact.

---

## 6. How many agents, and when

- **The full organisation** is 112 roles ([ROSTER.md](ROSTER.md)). 19 existed before this card; 16 are the new active
  pilot (12, plus 4 in Design).
- **Active at any time:** about 15–20. A role is **Active** when its wave needs it, and **Dormant** otherwise
  (defined, not running).
- **Activation follows `docs/plans/phase-1-sizing.md`:**

| Wave | Activate |
| --- | --- |
| **Now: W1 CMMS, and the review of the Table 2 finance work** | Product office; design lead, product designer, ergonomics and human factors, design system; maintenance lead; reliability specialist; manufacturing and facilities industry leads; general ledger lead; accounting standards specialist; financial maths specialist; finance controls reviewer; security, code and licence reviewers |
| W2 Enterprise accounts and sign-in security | Workspaces and accounts lead; privacy specialist; security engineering |
| W3 Workspace lifecycle and data rights | Commercial packaging; privacy and compliance reviewer; data portability (exists) |
| W4 Production operations | Incident and SRE; backup and recovery; capacity and cost; change manager; support desk; accessibility design and testing |
| W5 Assistant | AI engineering; trust and safety (exists); UI and visual design; data visualisation; the leads of the modules the Assistant covers first |
| W6 CMMS set-up wizard | Onboarding and data migration; customer success and training; content design; service design; UX research (or earlier, with the first customer) |
| Phase 5 (finance, supply chain, commercial) | The finance and supply-chain module leads; tax specialist with the plan's country packs (AU, EU, GB, IN, JP, US); FX; supply-chain planning; trade and customs |
| Phase 6 and customers by sector | The industry leads for the sectors of named customers or target markets |

---

## 7. Human authorities

| Authority | Who | Notes |
| --- | --- | --- |
| Vision, priorities, card approval, product acceptance, production release | The owner | Today all of these are the owner |
| Security risk acceptance | A named Security reviewer | Plan v3 step 0.7b: still to be named |
| Accounting sign-off | A named accountant | Table 2's F2.9 is waiting for one |
| Legal and licence decisions | A named legal adviser | Needed before any reuse beyond reference |
| Regulated-sector validation | A named expert per sector | Pharma, healthcare, food, as customers arrive |

---

## 8. Open points for the owner

- `AGENTS.md` names an `sdlc_orchestrator` role; the catalogue calls it `agile_delivery_orchestrator`. Pick one name.
- Name the humans in section 7 as the waves need them, starting with the accountant (for Table 2) and the Security
  reviewer.
