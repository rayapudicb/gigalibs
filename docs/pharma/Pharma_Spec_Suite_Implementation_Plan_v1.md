# How to use this document

This document is the reference plan for building the modules of the owner's pharma specification suite on the
GigaLibs platform, using spec-driven development and pharma industry practice.

| Reader | Read |
| --- | --- |
| Owner and leadership | 1 Executive summary; 8 Roadmap; 10 Risks and decisions |
| QA, regulatory and validation | 4 Regulatory and quality framework; 5 Spec-driven method; section 3 of each module; 9 Validation |
| Process safety and chemistry | 7E SPEED, including the worked example; 7A Chemistry R&D |
| Product and engineering | 5 Method; 6 Architecture; sections 5–8 of each module |
| Future agents | 3 The pharma practice; the module chapters as starting specifications |

**Status.** This is a **proposal**. Nothing in it enters the GigaLibs plan until the owner approves a card for it. Every
regulatory statement is the agents' reading of the named guidance. A named QA or regulatory professional must confirm
it before it governs validated work. Where a guidance document is still a draft, this document says so.

**Naming.** Company and product names in the source suite are deliberately not used. Modules carry generic codes
(CHEM, RESP, PROC, ENG, SPEED).

<!-- pagebreak -->

# 1. Executive summary

**What was asked.** For every module in the pharma specification suite:
- investigate it with the GigaLibs agent organisation;
- produce the best implementation plan on the current GigaLibs architecture;
- keep strictly to pharma industry processes;
- use spec-driven development.

**What was investigated.** 19 modules in five families, plus a worked example: desk screening of a 5-step route to a
known pyrimidine intermediate of a marketed statin, the owner's test case.

| Family | Modules | What it serves |
| --- | --- | --- |
| A. Chemistry R&D intelligence | CHEM-1 literature and patents · CHEM-2 retrosynthesis · CHEM-3 Bayesian experiment design · CHEM-4 reactor digital twin · CHEM-5 route economics | Choosing and developing a synthesis route |
| B. Response, qualification and trust | RESP-1 response projects · RESP-2 content library · RESP-3 trust centre · RESP-4 go/no-go · RESP-5 buyer-side requests | Winning and qualifying business between pharma companies and suppliers or CDMOs |
| C. Process, PAT and manufacturing intelligence | PROC-1 simulation and scale-up · PROC-2 PAT and chemometrics · PROC-3 multivariate batch monitoring · PROC-4 predictive maintenance | Developing, monitoring and maintaining a GMP process |
| D. Engineering, document and quality intelligence | ENG-1 drawings · ENG-2 document processing · ENG-3 vision inspection · ENG-4 production planning | Plant engineering, GMP documents, inspection, scheduling |
| E. SPEED process engineering | SPEED-1 Stage 1 predictive desk screening (stages 2–5 outlined) | Safe, efficient scale-up from gram to multi-ton |

**Headline conclusions.**

1. **GxP impact decides everything.** Some modules decide or record things that affect a batch, a release or a quality
   decision: PAT, multivariate monitoring used for release, vision inspection used to reject, document processing into
   batch records. These are **GxP** and need full validation.
   - Most chemistry R&D and commercial modules are **non-GxP or GxP-adjacent**. Validating them like GMP systems
     would waste the effort the GxP modules need.
   - Each module chapter classifies this explicitly.
2. **AI is assistive until it is proven.**
   - Every AI output shows its sources and confidence, and a named person confirms it before it becomes a record.
   - Every model has a written specification: intended use, data, metrics with thresholds, drift monitoring, change
     control.
   - This follows the direction of the EU's draft GMP Annex 22 on AI (July 2025) and FDA's draft guidance on AI for
     regulatory decision-making (January 2025). Both are drafts.
3. **GigaLibs already provides much of the foundation:**
   - workspaces with database-enforced isolation;
   - roles with unit and site scope;
   - audit, metadata windows (configurable screens), events between modules;
   - CMMS, Inventory, Procurement, Product Catalogue, Finance, Workforce, Connector Hub, Analytics and the Assistant.

   PROC-4 is built on CMMS. ENG-4 draws on CMMS, Inventory and Workforce. ENG-2 reuses the document scanner.
4. **Four platform gaps must be closed first** (sections 6 and 8):
   - a **scientific compute service** (RDKit, optimisation, chemometrics, vision). There is no Python runtime in
     GigaLibs today;
   - **Part 11 services in production:** e-signature with signature meaning, controlled documents, a complete audit
     trail;
   - an **AI model registry and lifecycle;**
   - **plant connectivity:** a site historian and OPC-UA, by integration, for the PAT and process modules.
5. **Recommended start:**
   - the Part 11 and compute foundations;
   - then **SPEED-1**: a self-contained, high-value safety tool that proves the whole stack, from structures to
     calculations to a signed dossier;
   - then **PROC-4** (predictive maintenance on the existing CMMS) and **ENG-2** (document processing on the existing
     scanner).

   The heavier GxP modules follow once the validation machinery has been proven on these.
6. **The worked example shows the method working honestly.** The route scheme carries no quantities, temperatures or
   concentrations. SPEED therefore computes what the structures allow:
   - formulas and molecular weights;
   - mole balance;
   - oxygen balance;
   - explosophore screen;
   - atom economy;
   - compatibility and solvent flags;
   - impurity alerts.

   It then **blocks the thermal engines at Gate 2** and issues the Stage-2 test plan. It does not invent a Stoessel
   class. That refusal is the poka-yoke the specification asks for.

<!-- pagebreak -->

# 2. Scope, source and assumptions

- **Source.** The owner's "Pharma Tech Spec Suite v2" (business requirements, functional specifications, workflows,
  blueprints and outcomes for four product families, the SPEED module, and a spec-driven development vision),
  extracted on 2026-10-19.
- **Excluded.**
  - Company and product names, including a former employer mentioned in an open item.
  - Pricing models of the source companies.
  - Any reuse of the source's text beyond what is needed to state requirements in our own words.
- **Architecture baseline.** GigaLibs as of 2026-10-19 (release `1d8d2634` on UAT), and the agent organisation of card
  WI-OI-120bl.
- **Assumptions.**
  - Customers are pharma, biotech, API manufacturers or CDMOs, operating under GMP in the US, EU and India at least.
  - GigaLibs acts as a software **supplier** to them. The customer remains responsible for validating its intended
    use; the supplier provides the evidence that makes this efficient.
- **Out of scope here:**
  - pricing;
  - legal opinions (IP, licensing of literature and reference databases), which are flagged for counsel;
  - a medical-device scope (none of these modules is a medical device).

<!-- pagebreak -->

# 3. The pharma practice: agents that did this work

The investigation used the GigaLibs agent organisation (`.pi/org/ORGANIZATION.md`), activating the pharma practice:

| Role (roster ID) | Part in this investigation |
| --- | --- |
| `industry_pharma_life_sciences` | Pharma and CDMO processes and vocabulary; solution blueprint |
| `quality_regulatory_specialist` | GxP classification, GAMP 5, Part 11, Annex 11, ALCOA+, ICH framework |
| `process_safety_specialist` (new) | SPEED: thermal runaway, Stoessel classes, calorimetry plan, compatibility |
| `cheminformatics_specialist` (new) | Structures, reactions, mole balance, retrosynthesis, property data |
| `pat_chemometrics_specialist` (new) | PAT, multivariate models, analytical procedure lifecycle (ICH Q2(R2), Q14) |
| `gxp_validation_specialist` (new) | CSV and CSA approach, validation deliverables, supplier assessment readiness |
| `ai_model_validation_specialist` (new) | AI model specifications, credibility, drift, change control (Annex 22 draft, FDA draft) |
| `regulatory_cmc_specialist` (new) | ICH Q8–Q12 and M7 links into filings; starting materials; established conditions |
| `maintenance_cmms_lead`, `reliability_engineering_specialist` | PROC-4 on CMMS |
| `inventory_warehouse_lead`, `procure_to_pay_lead`, `workforce_scheduling_lead` | ENG-4 and CHEM-5 reuse |
| `security_reviewer`, `licence_ip_reviewer`, `code_reviewer` | Security, licensing of corpora, honesty of outputs |
| `design_lead`, `ergonomics_human_factors` | Lab, plant and shop-floor use; inspection stations |

**Named humans needed before validated work starts:**
- a head of QA (the validation approver);
- a process safety expert (SPEED sign-off);
- a regulatory CMC lead;
- a data protection officer;
- legal counsel for licensing.

<!-- pagebreak -->

# 4. Regulatory and quality framework (applies to every module)

## 4.1 GxP impact assessment

Every module, and every function within a module, is classified before any specification is written:

| Class | Definition | Validation depth |
| --- | --- | --- |
| **GxP** | Creates, changes or uses GxP records, or makes or supports a decision on product quality, patient safety or data integrity (batch, release, deviation, qualification) | Full: risk-based validation, Part 11 and Annex 11 controls, change control, periodic review |
| **GxP-adjacent** | Supports a GxP activity, but every output is verified by a qualified person, or entered into a GxP system, before use | Proportionate: documented requirements, verification of critical functions, human-confirmation controls, audit trail on what is exported |
| **Non-GxP** | Research, commercial or administrative use with no GxP record or decision | Good software practice: specified, tested, secure; no GxP validation package |

A module can contain functions of several classes. The chapter for each module draws the line, and the line itself is a
specified, tested control: for example, an R&D prediction can be exported to a GxP record only through a confirmation
step.

## 4.2 Computerised system validation: GAMP 5 and computer software assurance

- **ISPE GAMP 5, Second Edition (2022)** is the industry reference for a risk-based approach to GxP computerised
  systems.
  - Its software categories: infrastructure (1), non-configured (3), configured (4) and custom (5).
  - Its emphasis is on critical thinking, supplier involvement and leveraging supplier evidence.
- **FDA's final guidance "Computer Software Assurance for Production and Quality System Software" (September 2025)**
  applies formally to medical-device production and quality-system software. Its risk-based thinking is widely
  applied in pharma:
  - focus assurance on intended use and risk;
  - use unscripted and exploratory testing where risk is lower;
  - use scripted testing where risk is high;
  - keep evidence proportionate.
- **For GigaLibs:**
  - the platform is configurable (closest to Category 4), and new engines are custom (Category 5);
  - AI models are treated under section 4.4;
  - the supplier provides the specification, tests, traceability and release evidence for each release, and the
    customer validates its configuration and intended use.

## 4.3 Data integrity and electronic records

- **21 CFR Part 11** (US) and **EU GMP Annex 11** (EU): secure, computer-generated, time-stamped audit trails;
  electronic signatures linked to their records, with the signature's meaning; access control; accurate and complete
  copies; retention.
- **Drafts:** a substantially revised Annex 11 and a revised Chapter 4 (Documentation) were published as drafts on
  7 July 2025, together with Annex 22. Check their final status before relying on their new text.
- **ALCOA+** (attributable, legible, contemporaneous, original, accurate; plus complete, consistent, enduring,
  available), as described in MHRA's GxP data integrity guidance (2018) and PIC/S PI 041.
- **On GigaLibs** these become platform services:
  - the audit trail on every GxP record change (who, when, old and new value, reason);
  - **e-signature** with re-authentication and the signature's meaning;
  - **controlled documents** (versions, effective dates, review and approval);
  - no deletion of GxP records, only reversal or retirement;
  - retention and export of complete copies.

## 4.4 Artificial intelligence in GxP

- **EU GMP Annex 22 "Artificial Intelligence" (draft, July 2025).**
  - Applies to AI models in computerised systems used in critical GMP applications.
  - The draft limits such critical use to **static** models (not learning in operation), with defined intended use,
    test data independent of training data, defined acceptance criteria, explainability and confidence, and
    oversight.
  - Status: a draft for consultation; check the final text.
- **FDA draft guidance "Considerations for the Use of Artificial Intelligence to Support Regulatory Decision-Making for
  Drug and Biological Products" (January 2025).**
  - A seven-step, risk-based credibility assessment tied to a model's **context of use**.
  - Its scope excludes discovery-only uses and operational uses with no effect on safety, quality or study
    reliability.
- **GigaLibs AI policy for this suite:**
  - every model has a **model specification** (Appendix C);
  - outputs show sources and confidence;
  - a named human confirms before an output becomes a GxP record or decision;
  - models are versioned in a **model registry** under change control;
  - drift is monitored;
  - no model learns in production where it affects a GxP decision;
  - no fabricated values: an engine that cannot compute says so.

## 4.5 Product and process quality frameworks

| Guidance | Relevance |
| --- | --- |
| ICH Q7 | GMP for active pharmaceutical ingredients: intermediates, starting materials, records |
| ICH Q8(R2) | Pharmaceutical development, quality by design, design space, CQAs and CPPs |
| ICH Q9(R1) | Quality risk management: the basis for every risk assessment in this plan |
| ICH Q10 | Pharmaceutical quality system: knowledge management, change management, CAPA, outsourced activities |
| ICH Q11 | Development and manufacture of drug substances: route selection, starting materials, control strategy |
| ICH Q12 | Lifecycle management, established conditions |
| ICH Q13 | Continuous manufacturing |
| ICH Q14, Q2(R2) | Analytical procedure development and validation: they govern chemometric models used as methods |
| ICH M7 | Mutagenic impurities: structural alerts, (Q)SAR, control strategy |
| ICH Q3C | Residual solvents: solvent classes and limits |
| FDA PAT framework (2004) | Process analytical technology and real-time release |

## 4.6 Process safety

The process safety basis comes from:
- CCPS guidelines;
- Stoessel's thermal-risk methodology (criticality classes from Tp, MTSR, MTT and TD24);
- calorimetry practice (DSC, ARC, reaction calorimetry);
- reactive-hazard references (licensed corpora such as Bretherick's handbook require licences before loading).

SPEED applies these at Stage 1 as **screening estimates**, always labelled for confirmation by Stage-2 testing.

## 4.7 Security and privacy

- Pharma buyers expect ISO 27001 or SOC 2 assurance.
- Personal data is governed by GDPR, India's DPDP Act and equivalent laws.
- Customer R&D data is confidential intellectual property: tenant isolation, encryption, access logging, and data
  residency options.

<!-- pagebreak -->

# 5. Spec-driven development on GigaLibs

## 5.1 The specification chain, mapped to GigaLibs artefacts

| Stage (V-model) | Pharma artefact | GigaLibs artefact | Checked by |
| --- | --- | --- | --- |
| Need | User requirements specification (URS) | Module knowledge pack; card goal and "Done when" | Product office, module lead, QA |
| Risk | Risk assessment (ICH Q9(R1); FMEA per function) | Risk table in the card; GxP classification per function | Quality and regulatory specialist |
| Function | Functional specification (FS) | Contracts (typed schemas), metadata window definitions, workflow maps, acceptance criteria | Module lead, solution architecture |
| Design | Design specification (DS) and ADRs | ADRs, migrations, module manifest, API and event contracts | Solution architecture, security reviewer |
| Build | Code to the specification | One writer; every function cites its requirement ID | Code reviewer |
| Verify | Unit, integration and functional testing | Tests that fail before and pass after; property tests for calculations | QA, financial or process maths specialist |
| Validate | IQ, OQ and PQ, or CSA-style assurance evidence | Release evidence: install and health checks (IQ), scripted functional tests (OQ), journeys on representative data (PQ) | GxP validation specialist; customer QA |
| Release | Validation summary, release note | Release record, independent reviews, owner's deploy | Security, finance controls (where applicable), owner |
| Operate | Change control, periodic review, CAPA | Cards, change records, incident and problem records | Change manager, QA |

## 5.2 Requirement identifiers and traceability

- **IDs:** `<CODE>-URS-nnn` (user requirement), `<CODE>-FR-nnn` (functional), `<CODE>-NFR-nnn`, `<CODE>-AI-nnn` (model
  specification), and test IDs `<CODE>-T-nnn`.
- Each FR cites its URS. Each test cites its FR. A generated traceability matrix (URS → FR → design → test → result) is
  part of every release. GigaLibs' existing SDLC audit (`audit:sdlc`) is extended to fail when a GxP requirement has no
  passing test.

## 5.3 Specification quality gate (before any code)

A module specification is ready only when it has:
1. a quantified problem;
2. a stakeholder map with each role's success measure;
3. numbered, single-verb functional requirements;
4. numeric non-functional requirements;
5. Given/When/Then acceptance criteria that can be automated;
6. integration contracts (direction, format, frequency, authentication, errors, SLA);
7. explicit regulatory scope and GxP classification;
8. ADRs for technology choices;
9. a data model;
10. workflow maps with exception paths;
11. an AI model specification for every model;
12. a security model (an RBAC matrix by role, resource, permission and scope);
13. **the GigaLibs additions:** reuse of existing modules checked first, zero mock data, no hard-coded values,
    tests that fail before and pass after.

## 5.4 GigaLibs as a GxP software supplier

Customers will audit GigaLibs as a supplier. The plan therefore includes:
- a documented SDLC (this method);
- release validation packages;
- traceability;
- change control with impact assessment;
- security testing evidence;
- a defined split of responsibilities: the supplier validates the platform and each release; the customer validates
  its configuration and intended use;
- periodic review;
- a supplier audit pack.

<!-- pagebreak -->

# 6. Architecture fit and decisions

## 6.1 What the suite reuses from GigaLibs

| Platform capability | Used by |
| --- | --- |
| Workspaces, database-enforced isolation, roles with unit and site scope | All modules (confidential R&D data, site-level access) |
| Audit, metadata windows, workflow and approvals | All GxP and GxP-adjacent functions |
| E-signature (built, deploy needed), document scanner (built, deploy needed) | SPEED dossier, ENG-2, RESP library approvals, PROC model approvals |
| CMMS (assets, work orders, preventive maintenance, meters, sign-off) | PROC-4; ENG-1 (asset links); ENG-4 (maintenance windows) |
| Inventory, Procurement, Product Catalogue, Finance | CHEM-5 route economics; ENG-4 materials; RESP-5 buyer requests |
| Workforce | ENG-4 people and skills |
| Connector Hub | LIMS, ELN, MES, ERP and historian connectors |
| Analytics Studio | KPIs and dashboards across modules |
| Assistant (W5) | Drafting answers (RESP), extraction confirmation, explaining results, all with citations and confirmation |
| Mobile app | Shop-floor and plant tasks (maintenance, inspection evidence) |

## 6.2 Architecture decisions to take first

| ADR (proposed) | Decision | Options and recommendation |
| --- | --- | --- |
| P1 Scientific compute service | Where chemistry, optimisation, chemometrics and vision code runs | A versioned, containerised Python compute service (RDKit, scientific stack, model runtimes) called by modules through signed context. Reproducible images, pinned dependencies, results stored with input hashes and engine version. **Recommended.** |
| P2 Part 11 platform services | E-signature, controlled documents, complete audit trail | Deploy and extend the existing e-signature and document modules into shared services; signature meaning, re-authentication, signature manifestation on records and reports |
| P3 AI model registry and lifecycle | How models are specified, validated, released and monitored | One registry per tenant and platform: model card, data provenance, metrics, approval signature, deployment state, drift monitors. Static models in GxP use |
| P4 Plant connectivity | Historian and OPC-UA | Integrate the customer's existing site historian through Connector Hub. Build only a lightweight buffer. **Recommended over building a historian.** |
| P5 Licensed knowledge corpora | Literature, patents, hazard handbooks | Licence before loading; per-tenant access control; citations on every use; no scraping |
| P6 Deployment and data residency | Region, single-tenant or on-premises options for pharma | Region choice per workspace; a dedicated deployment option for customers who require it |
| P7 Integration standards | LIMS, ELN, MES, ERP | Contract-first connectors through Connector Hub; ISA-95 for manufacturing integration; an event outbox for every hand-off |

<!-- pagebreak -->

# 7. Module investigations

Each module chapter follows the same structure:
1. purpose and users;
2. what the specification asks;
3. GxP impact and validation;
4. the industry process it must follow;
5. domain model;
6. specification set;
7. fit with GigaLibs;
8. implementation plan;
9. risks;
10. who is responsible.


<!-- pagebreak -->

# 7A. Chemistry R&D intelligence (CHEM-1 to CHEM-5)

Prepared by the pharma and life-sciences practice (`industry_pharma_life_sciences`, with
`quality_regulatory_specialist`), 2026-10-19. Read-only investigation. The source is the owner's extracted
specification: lines 60–290 for this family and lines 902–1010 for the method.

**Conventions used below**
- **"Proposed"** marks a threshold we suggest as a starting value. The owner and the customer's QA confirm it on
  real data. It is not a claim about performance.
- **"(verify)"** marks a reference to check against the standard itself before it shapes a design.
- **Source requirement IDs** (FR-001, LIQ-002, RR-003, EA-001 and so on) are kept so we can trace back to the
  source. The source's performance and accuracy figures are its own marketing numbers. We do not adopt them. We
  measure our own.

---

## Family overview

### What the family is for

In a pharma company or a CDMO, chemistry R&D takes a target molecule and finds a route that can be made safely, at
the right quality and at an acceptable cost, before GMP manufacture starts. The work runs in this order:

1. prior art and IP landscape (CHEM-1);
2. route scouting and ranking (CHEM-2);
3. lab optimisation (CHEM-3);
4. scale-up behaviour in a real vessel (CHEM-4);
5. cost of goods and supply risk (CHEM-5).

For a CDMO the same chain also feeds customer proposals, both for development work and for supply.

The family puts these steps on **one data model**: compound, reaction, route, project, source and decision. A
selected route can then be traced back to the literature that suggested it, the experiments that optimised it, the
safety assessment that cleared it for review and the cost estimate that justified it.

The source describes a free customer platform whose host is also the raw-material supplier. We do not copy that
model. In GigaLibs, the tenant owns its R&D data. The links to "what can be bought" are the tenant's own Product
Catalogue, Inventory and Procurement. A supplier sees only what the customer sends it, for example in a requisition
or an RFQ.

### Where the regulated boundary sits

- **GMP starts at the starting material.** ICH Q7 GMP applies from the point where the API starting material enters
  the process, and its rigour increases toward the final steps (verify wording). Most of this family's work happens
  before that point.
- **Outputs still flow into regulated decisions:**
  - route and regulatory starting material (RSM) selection and justification (ICH Q11 and its Q&A on starting
    materials);
  - mutagenic impurity assessment (ICH M7(R2)) and nitrosamine risk assessment (FDA and EMA guidance);
  - elemental impurities (ICH Q3D) and residual solvents (ICH Q3C);
  - development knowledge, proven acceptable ranges and design space (ICH Q8(R2), Q11), under quality risk
    management (ICH Q9(R1));
  - the CTD section on manufacturing process development (3.2.S.2.6);
  - scale-up safety (CCPS reactivity guidance; Stoessel's criticality classes).
- **So the family is assistive.** Every output becomes a record only after a named chemist, CMC lead, safety lead or
  patent attorney confirms it.
- **GAMP categories have two viewpoints.** We build bespoke code, so inside our own SDLC we test it as Category 5. A
  tenant sees GigaLibs as a configurable SaaS product (Category 4) with supplier-built components. The tenant
  assesses those components through a supplier assessment and our evidence.
- **AI/ML components** follow the GAMP 5 Second Edition AI/ML appendix (D11, verify). Two regulator drafts also
  apply:
  - the EU's **draft** Annex 22 on AI (consultation, 2025);
  - FDA's **draft** guidance on AI to support regulatory decision-making (2025).

  As drafted, Annex 22 addresses AI in GMP-critical applications. FDA's draft says it does not cover drug-discovery
  uses that do not affect patient safety, product quality or study reliability (verify both). Both are drafts and
  are used here as good practice, not as binding law.

### GxP map at a glance

| Module | Classification | GAMP 5 category (tenant view / our SDLC) | Size to validated release |
| --- | --- | --- | --- |
| CHEM-1 Literature and patent intelligence | non-GxP (IP- and licence-sensitive) | 4 / 5; ML extraction under D11, proportionate | XL |
| CHEM-2 Retrosynthesis and route ranking | GxP-adjacent (feeds ICH Q11, M7, Q3C, Q3D) | 4 / 5; ML model under D11 | XL |
| CHEM-3 Experiment design and Bayesian optimisation | GxP-adjacent for development campaigns; non-GxP in discovery | 4 / 5; statistical model, verified algorithm | L |
| CHEM-4 Reactor digital twin | GxP-adjacent and **safety-critical**; GxP if ever used for batch decisions (out of scope) | 5 (mechanistic model and gate logic) | XL (live mode adds XL) |
| CHEM-5 Route economics and commercial intelligence | non-GxP (commercial; finance-grade correctness) | 4 / 5; no ML | L |

Sizes exclude the shared foundations F1–F4 below (about M + L + M + S).

### Shared foundations (built once, used by all five)

| Foundation | Content | Size |
| --- | --- | --- |
| **F1 Chemistry core** | Compound, reaction, route and project registry; a "chemical structure" field type and structure-editor component for the metadata windows; canonicalisation; file formats (SMILES, InChI/InChIKey, MOL/SDF, Rxnfile, reaction SMILES with atom maps; CDXML import, export to be verified) | M |
| **F2 Scientific compute service** | Needs an ADR. The Python execution plane is parked (ADR-0016 F12) and is to be reconsidered with the AI gateway (C11). Proposal: a stateless service behind the module API. It accepts signed module context, has no database access of its own, runs pinned dependency images (lock file and SBOM) and deterministic seeds, and returns results that the module API persists with the engine version. | L |
| **F3 Model governance** | A model registry: model specification, version, data provenance and licence, metrics, approval and activation, drift records. Used by CHEM-1 to CHEM-4. | M |
| **F4 Licensed-content policy** | One licence record per data source: what may be displayed, cached and for how long, exported, or used for training. Enforced in code. | S |

On F1, an option worth evaluating: run RDKit's JavaScript/WebAssembly build in the module API for canonicalisation,
depiction and fingerprints, and store the fingerprints in PostgreSQL with pgvector bit vectors and Jaccard distance
(Jaccard on bit vectors equals 1 − Tanimoto; verify the pgvector version). That gives a first slice without the
Python service. The RDKit PostgreSQL cartridge is the stronger alternative for substructure search at scale, but it
changes the platform's database image, so it needs an ADR.

### Recommended order inside the family

1. **F1, plus the F2 decision (ADR only).** Nothing else is coherent without one structure identity and a compute
   decision.
2. **CHEM-5 Route economics.** Its first slice needs no Python: cost maths is deterministic TypeScript over routes
   the chemist enters by hand. It reuses four production modules (Product Catalogue, Procurement, Inventory,
   Financial Operations) and has direct value for CDMO quoting.
3. **CHEM-3 Experiment design.** The first engine that needs F2. Its data is the tenant's own lab output (CSV), so it
   needs no licences and no ELN connector. Benefit is measurable and regulatory exposure is low.
4. **CHEM-2 Retrosynthesis.** Needs F2, reaction-data licences and a model evaluation. Its routes then feed CHEM-5
   and CHEM-3.
5. **CHEM-1 Literature and patent intelligence.** Carries the heaviest licensing and legal exposure. It starts with
   open data and the tenant's own licensed connectors.
6. **CHEM-4 Reactor digital twin.** Safety-critical. It depends on SPEED (the process-safety evaluation module, owned
   by another team), on calorimetry data and on vessel data from CMMS. Live mode also needs a historian and an
   OPC-UA connector, and neither exists today.

**Intake note:** none of this family is in plan v3. The roster lists `industry_pharma_life_sciences` as "dormant
until a customer or target", so the owner must decide intake first.

---

## CHEM-1: Literature and patent intelligence (molecular intelligence)

### 1. Purpose and users

The module finds what is already known about a target molecule or reaction class: routes, conditions, yields and
patents. The goal is to bring this in front of the chemist in minutes rather than weeks, and to give the IP team a
landscape view so a patent attorney can judge freedom to operate (FTO).

**Users:**
- medicinal and process chemists;
- team leads and R&D directors;
- patent-information specialists and patent attorneys;
- procurement (is a starting material in stock?);
- the tenant administrator (sources, licences).

### 2. What the specification asks for

- **Input** by SMILES, InChI, CAS number, name, drawing or SDF/MOL upload (FR-001).
- **Search and extraction:** search a very large literature and patent corpus "in real time" with weekly refresh
  (FR-002, NFR-003); extract yield, temperature, solvent and scale with a confidence score.
- **A reaction knowledge graph** of compounds, reactions, patents, papers and authors (FR-003), shared per project
  with annotations (LIQ-003).
- **FTO risk** by jurisdiction (US/EU/IN/CN) with claim text and expiry, scored Low/Medium/High/Blocked (FR-004,
  LIQ-002).
- **Other functions:** scale filter (LIQ-004); stock and lead-time flag (LIQ-005); PDF/JSON export (FR-005); project
  isolation (NFR-004); p95 under 30 s (NFR-001); graph render under 2 s (NFR-002).

**Our changes:**
- **FTO score becomes landscape indicators for attorney review.** An FTO opinion is a legal opinion, so the software
  never says "Blocked" or "clear".
- **"Real time" becomes federated search** over the tenant's licensed sources plus locally indexed open data. We claim
  no corpus size.
- **The stock flag uses the tenant's own Inventory and Catalogue.**

### 3. GxP impact and validation approach

**Classification: non-GxP.** The module produces R&D knowledge and IP signals. It creates no GMP record and makes no
quality decision.

Two flows touch regulated work, and both are controlled by "verify at source":
- literature cited in development reports, impurity-fate arguments or RSM justifications is re-checked against the
  primary source by a named person (CHEM-1 stores DOI or patent number and location to make that quick);
- extracted conditions are used to seed CHEM-2 and CHEM-3 only after a chemist accepts them.

The main assurance risks here are legal: confidentiality, licences and IP.

**GAMP 5 category:** 4 for the tenant, 5 in our SDLC. The extraction and relevance models get a proportionate D11
lifecycle: model card, frozen test set, metrics. Rule-based name-to-structure tools (for example OPSIN) are tested as
code.

**Validation and assurance approach (CSA-style):**
- *Scripted:* canonicalisation and identifier resolution against ≥ 200 hard cases (stereo, tautomers, salts,
  charges, isotopes), because a wrong structure gives wrong prior art; tenant and project isolation; licence-term
  enforcement; egress control; citation integrity.
- *Unscripted:* chemists explore search relevance; an IP specialist reviews landscape views.
- *Evidence:* automated test runs, exploratory session notes, the model evaluation report.

**Part 11 / Annex 11 / ALCOA+:** not applicable. The audit trail still records who searched, in which project. Query
structures stay under project access, never in shared logs.

### 4. Industry process it must follow (do not deviate)

1. **Search.** A patent-information specialist runs prior-art and landscape searches, and chemists review the hits.
   Extracted values are leads, not facts, until checked against the primary source.
2. **FTO analysis.** A qualified patent attorney construes the claims in force in each jurisdiction and checks legal
   status and expiry, including term extensions (US patent term extension, EU supplementary protection
   certificates). The attorney issues a written opinion. The software supplies inputs and stores only the opinion
   *status* (requested, issued, not required).
3. **Data licences.** Respect each source's terms and confirm text-and-data-mining rights per source and
   jurisdiction. **Never scrape licensed databases.** Attribute open data as its licence requires.
4. **Confidentiality.** Unpublished structures are trade secrets, and a query to a public service can disclose one.
   External queries are opt-in per project and source, logged, and preceded by a warning.
5. **Supply.** A stock flag is information only. GMP materials come from QA-approved suppliers (ICH Q7).

### 5. Domain model (key entities and relationships)

- **Compound** and **Reaction** (F1): canonical identifiers, atom-mapped reactions, roles, and conditions each with
  its provenance. CAS Registry Numbers are proprietary, so resolving them needs a licensed source (verify).
- **Document**: type, DOI or publication number, source, **licence record** (F4), retrieval date.
- **Patent data:** PatentFamily → Publication (jurisdiction, kind code) → Claim → LegalStatusEvent (status, expected
  expiry, source, as-of date).
- **ExtractedFact**: subject, field, value, unit, confidence, source span, extractor version, review state.
- **Edge**: typed (produces, requires, cites, covers) in PostgreSQL edge tables. No graph database until load proves
  one is needed.
- **SearchRun** (sources asked and answered, versions), **LandscapeReview** (jurisdiction, reviewer, attorney status),
  **AvailabilityFlag** (compound ↔ catalogue item ↔ stock and lead time, as of a time).

### 6. Specification set to write (spec-driven)

**URS highlights**
- CHEM-1-URS-001 The system shall accept a structure (SMILES, InChI, MOL/SDF, drawing) or a name, and show the
  canonical structure for the user to confirm before any search runs.
- CHEM-1-URS-002 The system shall support exact, substructure and similarity search. The similarity metric is
  Tanimoto, with a tenant-configured default threshold.
- CHEM-1-URS-003 Every extracted value shall link to its source location and carry a confidence. Unreviewed values
  shall be visibly marked.
- CHEM-1-URS-004 No project structure shall leave the platform unless the project owner has enabled that external
  source for the project.
- CHEM-1-URS-005 The system shall enforce each source's licence terms (display, caching, export, ML use) as recorded
  in its licence record. Exports contain only citations and licence-permitted content.
- CHEM-1-URS-006 Patent information shall be shown as landscape indicators with claim text, legal status and as-of
  date. The system shall never present an FTO conclusion.
- CHEM-1-URS-007 Starting materials shall show the tenant's stock, catalogue item and supplier lead time, with as-of
  time.
- CHEM-1-URS-008 Incomplete searches (timeouts, sources down) shall name the sources that did not answer.

**Key functional requirements (Given/When/Then)**
1. **Given** a SMILES with an undefined stereocentre, **when** it is submitted, **then** the system shows the
   canonical SMILES, InChIKey, depiction and a "stereo undefined" warning, and searches only after the chemist
   confirms.
2. **Given** a project with no external sources enabled, **when** a chemist searches, **then** no request carrying
   the structure leaves the platform (checked against the egress log), and results are labelled "local sources
   only".
3. **Given** an extracted yield of 85%, **when** it is displayed, **then** it shows the source sentence or table
   cell, the extractor version, the confidence and "unreviewed" until a chemist accepts it.
4. **Given** a source whose licence record says "no caching", **when** results arrive, **then** they are not
   persisted beyond the session and are excluded from exports.
5. **Given** a patent family with in-force claims in two of four selected jurisdictions, **when** the landscape
   renders, **then** each jurisdiction shows status, as-of date and claim text under the banner "Not a
   freedom-to-operate opinion", with no aggregate verdict.
6. **Given** a user outside the project, **when** they open a shared graph link, **then** they get "not found" and
   nothing leaks.

**Non-functional requirements**
- **Search:** local structure search p95 ≤ 3 s up to 10 million compounds (proposed; depends on the F1 index
  decision). Federated search shows local results in ≤ 5 s and completes or times out at a tenant limit (default
  30 s, matching NFR-001).
- **Graph and data:** render ≤ 2 s for ≤ 500 nodes (NFR-002); open data refreshed weekly, with the date shown
  (NFR-003).
- **Availability and retention:** 99.5% monthly; tenant policy for runs and reviews; licence terms for licensed
  content.

**AI model specification**
- **Components:** reaction-information extraction (a fine-tuned entity/relation model, or a language model through
  the AI abstraction) and relevance ranking. Image-based structure recognition is excluded from v1.
- **Intended use:** suggest facts and rank documents for a chemist to review. Nothing feeds another module unreviewed.
- **Data:** openly licensed annotated corpora and open patent text. **No tenant data trains shared models.**
  Tenant-private fine-tuning needs written consent. Language-model calls go only to the tenant's chosen endpoint,
  under zero-retention terms.
- **Metrics (proposed):** on ≥ 300 annotated procedures held out by time, per-field precision ≥ 0.95 and recall
  ≥ 0.80 for yield and temperature; unit normalisation ≥ 0.99; confidence calibrated within ±0.1 per bin.
- **Oversight:** a review state on every fact. A bulk accept still records the reviewer per fact.
- **Drift:** monthly audit of a 2% sample; alert if chemist rejections rise 50% above baseline (proposed).
- **Change control:** activate only after the frozen test set passes (F3). Every fact carries its extractor version.

### 7. Fit with GigaLibs

- **Reuse:**
  - control plane (tenancy, RBAC, audit, entitlements) and `@gigalibs/module-sdk` (signed context, outbox);
  - **Connector Hub**: per-tenant credentials for licensed APIs, polling-delta-sync for open-data refresh;
  - **Universal Data Studio**: data contracts and schema-drift detection on feeds;
  - **Product Catalogue, Inventory, Procurement**: availability and lead time;
  - metadata windows for documents, reviews and annotations.
- **New:** a `chemistry-rnd` module (capability `literature-intelligence`); an extraction engine on F2; declared
  component contracts for the structure editor (Ketcher, Apache-2.0) and the graph viewer.
- **Assistant:** answers questions over the tenant's own graph with citations ("which papers report this step above
  100 g?"). It refuses FTO opinions and refuses anything outside the user's projects.
- **Decisions needed:**
  - F1 and F2;
  - the index technology (RDKit cartridge or pgvector bit vectors);
  - project-level scope in RBAC (a new scope type, or projects modelled as units; `solution_architecture`, ADR-0034,
    verify);
  - the language-model policy for confidential text;
  - a licence agreement for each external source.

### 8. Implementation plan

| Slice | Scope | Size | Acceptance evidence |
| --- | --- | --- | --- |
| 1 | Local search over open data (open compound and reaction sets, licences checked); structure input; exact, substructure and similarity search; citations | M | Canonicalisation reference-set run; isolation tests; UAT journey |
| 2 | Tenant's own documents (reports, ELN exports as files) indexed per project; availability flag | M | Project-isolation tests; journey with real tenant files |
| 3 | Extraction engine on F2, with a review queue | L | Model card and evaluation report (F3) |
| 4 | Licensed-source connectors through Connector Hub, one source at a time | L | Licence review record per source; licence-enforcement and egress tests |
| 5 | Patent landscape from patent-office data: families, claims, legal status; attorney status workflow; export | L | Attorney-reviewed wording; scripted status and expiry tests |
| 6 | Graph view, project sharing, Assistant tools | M | GU-style journey; refusal tests |

Validation deliverables: a lightweight risk assessment (non-GxP), a requirements trace, and the test evidence above.

### 9. Risks and open questions

- **Licences.** Most commercial chemistry databases forbid bulk extraction and ML training. Federating under the
  tenant's own licence gives less coverage than the source implies. (`licence_ip_reviewer`, legal counsel)
- **Leakage** of confidential structures through external queries or language-model providers. (Security, Privacy)
- **Over-trust:** users may read indicators as clearance. The tenant's patent attorney signs off the wording.
- **Coverage** of IN and CN legal status in public data (verify).
- **Privilege:** can attorney work product live in the system? (tenant's counsel)
- **Error propagation** into CHEM-2 and CHEM-3 priors. The review gate is mandatory.

### 10. Agents and humans responsible

- **Lead:** `industry_pharma_life_sciences`.
- **Engineering:** `solution_architecture`, `backend_domain`, `web_experience`, `integration_connectors`,
  `data_engineering`, `ai_engineering`, `trust_safety_automation`.
- **Quality:** `qa_spec`, `test_automation`, `performance_testing`.
- **Review:** `licence_ip_reviewer` (key), `privacy_compliance_reviewer`, `security_reviewer`, `code_reviewer`.
- **New specialists:** `cheminformatics_specialist`, `patent_information_specialist`, `ai_model_validation_specialist`.
- **Human approvers (to be named by the owner):** owner (intake, licence budget); the tenant's head of chemistry
  (acceptance); the tenant's patent attorney (wording, workflow); GigaLibs legal counsel (source licences).

---

## CHEM-2: Retrosynthesis and route ranking

### 1. Purpose and users

The module proposes candidate synthetic routes to a target and ranks them on explicit criteria: chemistry,
safety, quality, sustainability and cost. Chemists scout faster and can document why a route was chosen.

**Users:**
- process and medicinal chemists;
- the route-scouting lead;
- the CMC regulatory lead (RSM proposals);
- process safety (flags handed to SPEED);
- procurement;
- team leads.

### 2. What the specification asks for

- **Generation:** accept a target (FR-101) and generate many routes quickly (FR-102: "≥34 in <60 s").
- **Ranking:** by cost per kg, yield, step count and intermediate availability (FR-103), with a weighted score whose
  weights the user sets per project.
- **Filters and metrics:** reagent-class filters, "green" and no CMR (FR-104); PMI and E-factor with CMR flags
  (RR-003); cost within ±30% of actual quotes (RR-002).
- **Workflow:** catalogue links for intermediates (FR-105); "novel" flags on steps with no precedent; comparison of
  2–5 routes; sharing and version history (RR-004); PDF/CDXML/RXN export (RR-005); starting materials to a cart or
  an RFQ.

**Our changes:**
- **No fixed route count:** routes found within a time budget, and zero is a valid answer.
- **No adopted accuracy figures:** we measure on our own test sets.
- **Transparent scores:** every score shows its components, and weight profiles are versioned.
- **Pharma criteria added:** ICH M7 structural-alert screening, nitrosamine risk factors, Q3D metals, Q3C solvent
  classes, energetic groups (handed to SPEED) and an RSM candidate view (Q11).
- **The cart becomes a draft requisition** that a person submits.

### 3. GxP impact and validation approach

**Classification: GxP-adjacent.** Suggestions create no GMP record. But the selected route and its RSMs are later
justified in the dossier (ICH Q11, CTD 3.2.S.2), and impurity screening informs the M7 and Q3D assessments.
- A route becomes "selected for development" only through a named chemist's signed decision with rationale.
- Impurity flags read **"screening only, not an ICH M7 assessment"**. Under M7, the assessment of record uses two
  complementary (Q)SAR methods (expert rule-based and statistical) plus expert review, in the tenant's qualified
  tools.

**GAMP 5 category:** 4 for the tenant, 5 in our SDLC. The single-step model and the condition recommender are ML
components (D11). The tree search is deterministic for a given seed, model version and building-block set.

**Validation and assurance approach (CSA-style):**
- *Scripted, high-risk functions:* atom-map and stereochemistry integrity; yield-chain and mass-balance maths
  (property tests); each screening rule against positive and negative structures, with a pinned rule-set version;
  Q3C, CMR and Q3D look-ups against the tenant's list version; immutable decision records; Rxnfile round trip.
- *Unscripted:* a structured chemist-panel review of route plausibility; usability sessions.
- *Evidence:* the model evaluation report, the rule-set test report, decision-record tests, the panel record.

**Part 11 / Annex 11 / ALCOA+:**
- The route decision and RSM proposal are e-signed with a stated meaning ("selected for development"), the signature
  linked to the record (Part 11 §11.50 and §11.70 style).
- Route and weight changes are audit-trailed. Reviewed versions are immutable.
- Part 11 strictly applies only when a record meets a predicate rule or is submitted (tenant QA to confirm). We
  design to be Part 11-ready with the e-signature module, which is built but not deployed and needs a Part 11
  assessment.

### 4. Industry process it must follow (do not deviate)

1. **Scouting.** Candidate routes come from chemists and the engine.
2. **Evaluation against explicit criteria.** A common published frame is SELECT: safety, environment, legal,
   economics, control, throughput (Butters et al., 2006; verify). Green metrics use PMI as defined by the ACS GCI
   Pharmaceutical Roundtable, E-factor and published solvent-selection guides. CMR status follows EU CLP categories
   1A/1B and the tenant's restricted list.
3. **Impurity screening.** Route-related mutagenic impurities from reagents, intermediates and by-products (ICH
   M7(R2)). Nitrosamine risk factors: secondary or tertiary amines with nitrosating agents or contaminated reagents
   or solvents (regulators' nitrosamine guidance). Intentionally added elements enter the Q3D risk assessment.
   Solvents are classed under Q3C.
4. **Thermal screening.** Energetic groups go to SPEED for DSC screening before lab work at scale.
5. **Lab evaluation** of shortlisted routes (CHEM-3), then **route selection** by the development team with a
   documented rationale.
6. **RSM proposal** by the CMC lead under ICH Q11 and its Q&A: a significant structural fragment, enough steps under
   GMP, well characterised with a specification, impurity fate understood. The regulator decides acceptability.
   Atom-mapping shows which RSM atoms end up in the API.

### 5. Domain model (key entities and relationships)

- **RetroRequest**: target, constraints, weight-profile version, engine, model and building-block versions, time
  budget, seed.
- **RouteCandidate** (a tree) → **RouteStep**: atom-mapped reaction, template or model ID, model score (calibrated
  probability if one exists), precedents (CHEM-1), novel flag, suggested conditions.
- **RouteNode**: an intermediate or leaf compound, linked to its catalogue item, stock and price source.
- **ScoreComponent** (criterion, value, unit, source) and **WeightProfile** (versioned per project).
- **Alert**: type (M7, nitrosamine, Q3D, Q3C, CMR, energetic), rule ID and version.
- **RouteReview** (state, reviewer, reason) → **RouteDecision** (route version, rationale, e-signature) →
  **RSMProposal** (compound, steps to API, fragment incorporated, CMC notes).

### 6. Specification set to write (spec-driven)

**URS highlights**
- CHEM-2-URS-001 Accept a target as SMILES, MOL or a drawing, validated against tenant-configured element and MW
  limits.
- CHEM-2-URS-002 Return the routes found within a configurable time budget. Each shows its model score, its precedent
  evidence and any steps marked novel. When nothing is found, say so and give the search statistics.
- CHEM-2-URS-003 Every ranking shows each criterion's value and source. Weight profiles are versioned per project.
- CHEM-2-URS-004 Screen each route for M7 alerts, nitrosamine risk factors, Q3D elements, Q3C classes, CMR reagents
  and energetic groups, labelled "screening only".
- CHEM-2-URS-005 No route reaches "selected for development" without a named chemist's signed decision with
  rationale. AI cannot change a route's state.
- CHEM-2-URS-006 Leaf materials link to the tenant's catalogue, stock and supplier data. A missing price shows as "not
  priced", never as zero.
- CHEM-2-URS-007 Compute PMI and E-factor when mass data exists; otherwise show "not computed" with the reason.
- CHEM-2-URS-008 Export routes as Rxnfile and reaction SMILES (and PDF). CDXML export waits on library verification:
  RDKit reads CDXML, but writing it must be checked (verify).
- CHEM-2-URS-009 Tenant reactions and decisions never train shared models without written consent.

**Key functional requirements (Given/When/Then)**
1. **Given** a target and a 120 s budget, **when** no route is found, **then** the system shows "No route found
   within 120 s" with the nodes expanded, and no route is fabricated.
2. **Given** a step with no precedent in the enabled reaction sources, **when** it is shown, **then** it reads "Novel:
   no precedent in <sources>" and gets no precedent credit.
3. **Given** a route that forms a sulfonate ester in the presence of an alcohol solvent, **when** it is screened,
   **then** an M7 structural-alert flag appears, with rule ID and version and the text "screening only; ICH M7
   assessment required".
4. **Given** changed weights, **when** the ranking is recomputed, **then** a new weight-profile version is stored, the
   previous ranking is kept, and the comparison view shows both.
5. **Given** two of seven leaf materials without a price, **when** the route is ranked, **then** its cost criterion
   reads "not computed (2 not priced)" and the route is not ranked on cost.
6. **Given** a suggested route, **when** a user asks the Assistant to select it, **then** a confirm card asks for a
   rationale and the decision is recorded as "by <person> via Assistant".
7. **Given** "add starting materials to requisition", **when** the user confirms, **then** a *draft* requisition is
   created in Procurement and nothing is submitted.

**Non-functional requirements**
- **Performance:** search budget default 120 s, tenant-configurable, with a fair job queue; tree view ≤ 2 s for
  ≤ 200 nodes.
- **Reproducibility:** identical inputs, versions and seed give identical routes.
- **Availability and retention:** 99.5%; decisions follow tenant policy, with no automatic deletion.
- **Cost accuracy:** RR-002's ±30% is a measured metric against later actual quotes, not a promise.

**AI model specification**
- **Components:** a single-step retrosynthesis model (template-based from atom-mapped reactions, or sequence/graph
  based), a tree search (for example MCTS), a building-block set, an optional forward model for round-trip checks,
  and a condition recommender. Open-source candidates are AiZynthFinder, ASKCOS, RDChiral and RXNMapper, licences to
  be confirmed by `licence_ip_reviewer`.
- **Intended use:** candidates for chemists to evaluate in R&D. Never used to justify routes or RSMs in a submission.
- **Data:** open atom-mapped reaction sets (a USPTO-derived open set; the Open Reaction Database; verify licences);
  commercial reaction databases only where the licence allows ML training (most do not, verify); tenant ELN
  reactions only for a tenant-private model.
- **Metrics (proposed):** single-step top-10 accuracy on a time-split test set, reported; a known route recovered in
  the top 10 for ≥ 50% of a tenant reference set of ≥ 50 targets; a chemist panel rates at least one top-5 route
  "worth lab evaluation" for ≥ 70% of targets; expected calibration error ≤ 0.10, or scores are shown as
  "uncalibrated".
- **Oversight:** every route is reviewed; selection is signed.
- **Drift and change control:** monthly acceptance rate; the test set is re-run on every model, template or
  building-block change; F3 registry; every run carries its versions.

### 7. Fit with GigaLibs

- **Reuse:** F1 to F3 and the CHEM-1 precedent store; **Product Catalogue** (building blocks as items, price lists,
  UOM conversions); **Inventory** (stock); **Procurement** (vendors, PO price history, draft requisitions; RFQ
  bidding is *planned*, not built); CHEM-5 for cost; Workflow Studio and E-signature (built, not deployed) for review
  and decision.
- **Integrations:** SPEED receives energetic-group flags and returns screening status. CHEM-3 receives shortlisted
  routes as campaigns.
- **Assistant:** explains and compares routes with citations, and drafts requisitions after a confirm card. It never
  selects a route.
- **Decisions needed:** whether F2 needs GPUs (template search runs on CPU; transformers may not); the alert rule
  set's source and licence; reaction-data licences.

### 8. Implementation plan

| Slice | Scope | Size | Acceptance evidence |
| --- | --- | --- | --- |
| 1 | Chemist-entered routes and route tree; criteria scoring (steps, yield chain, PMI, Q3C/Q3D/CMR from tenant lists). No AI. Feeds CHEM-5 | M | Property tests; scripted look-up tests |
| 2 | Open-source retrosynthesis on F2 with open data; time budget; novel flags | L | Model evaluation report v1; chemist-panel record |
| 3 | Screening rule sets (M7 alerts, nitrosamine factors, energetic groups → SPEED), versioned | M | Rule-set test report (positive and negative cases) |
| 4 | Review and decision workflow with e-signature; RSM view with atom-mapped fragment; Rxnfile/SMILES export | M | Decision-record tests; round-trip tests |
| 5 | Tenant-private model (with consent); calibration; drift dashboard | L | Calibration report; drift alert test |

Validation deliverables: a risk assessment (GxP-adjacent, ICH Q9(R1)), the trace matrix, scripted evidence for
high-risk functions, the model specification and evaluation, and a release note signed by tenant QA when the tenant
requires one.

### 9. Risks and open questions

- **Data licences** may block training on the most useful reaction data. (legal, `licence_ip_reviewer`)
- **Benchmark inflation:** single-step accuracy is not route quality. The chemist-panel metric is the one that matters.
- **Stereo and atom-map errors** in templates can silently change the product. Scripted tests guard this.
- **Inventorship:** patents on AI-assisted routes need human conception (USPTO 2024 guidance on AI-assisted inventions,
  verify). Keep an attributable record of the chemist's contribution.
- **Wording:** screening flags could be read as an M7 assessment. The tenant's M7 expert approves the wording, and the
  CMC lead confirms what the RSM view may say.

### 10. Agents and humans responsible

- **Lead:** `industry_pharma_life_sciences`.
- **Consulted:** `quality_regulatory_specialist`, `procure_to_pay_lead`, `product_pricing_lead`.
- **Engineering:** `solution_architecture`, `backend_domain`, `web_experience`, `ai_engineering`,
  `trust_safety_automation`.
- **Quality:** `qa_spec`, `test_automation`.
- **Review:** `licence_ip_reviewer`, `security_reviewer`, `code_reviewer`.
- **New specialists:** `cheminformatics_specialist`, `process_chemistry_specialist`, `regulatory_cmc_specialist`,
  `ai_model_validation_specialist`, plus a `process_safety_specialist` as liaison to the SPEED team.
- **Human approvers (to be named):** the tenant's head of process chemistry (acceptance), CMC regulatory lead (RSM
  wording), toxicologist or M7 expert (screening wording) and QA lead (classification); the owner (intake).

---

## CHEM-3: Experiment design and Bayesian optimisation (DoE)

### 1. Purpose and users

The module plans reaction-optimisation experiments statistically, learns from each batch of results and
recommends the next experiments. Chemists reach good conditions in fewer runs, and the development knowledge is kept
in structured, attributable form.

**Users:**
- process chemists;
- high-throughput experimentation (HTE) scientists;
- statisticians;
- analysts who supply results;
- team leads;
- later, CMC staff (proven acceptable ranges, design space).

### 2. What the specification asks for

- **Space and model:** 2–12 continuous or categorical variables with constraints (FR-201, EA-001); objectives
  (maximise yield, minimise impurity, or both); a Bayesian model updated after each batch (FR-202), using a Gaussian
  process with Matérn 5/2 kernel, Expected Improvement, Thompson sampling for a 24-well batch and a Latin hypercube
  first plate.
- **Plates:** the next 24- or 96-well plate (FR-203, EA-002); liquid-handler CSV/XML and PDF export (FR-205).
- **Results:** import from CSV, ELN or manual entry with range checks and outlier flags (EA-003); response surfaces
  with uncertainty and the predicted optimum (EA-004).
- **Other:** an ELN-ready procedure (FR-204, EA-005); training under 5 s; 95% credible intervals; warm start from
  similar reactions; reagent-lot tracking; reagent orders for scale-up.

**Our changes:**
- **Classical DoE is added** (screening, factorial and fractional factorial, response-surface and D-optimal designs).
  Design-space characterisation under ICH Q8/Q11 normally rests on designed experiments with explicit statistical
  models; Bayesian optimisation is for finding an optimum.
- **Every result carries its measurement method.**
- **No silent outlier removal.**
- **Procedures export in neutral formats.** There is no ELN connector today.
- **Orders are draft requisitions.**
- **We do not promise the source's "60–80% fewer experiments".**

### 3. GxP impact and validation approach

**Classification:**
- **Non-GxP** for discovery and early campaigns.
- **GxP-adjacent** once a campaign is tagged "development" for a selected route. Its data then becomes development
  knowledge cited in CTD 3.2.S.2.6 and may support proven acceptable ranges or a proposed design space. Regulators
  assess the design space, and this tool controls no GMP batch.

**GAMP 5 category:** 4 for the tenant, 5 in our SDLC. The GP is fitted per campaign and treated as a calculation
with a verified algorithm plus per-campaign diagnostics. Warm-start transfer between campaigns is an ML component
(D11).

**Validation and assurance approach (CSA-style):**
- *Scripted:* stoichiometry, mass and volume maths (property tests, for example mass = equivalents × mmol × MW ÷
  purity); plate-map round trip; result-import validation (ranges, units, well mapping); GP and acquisition outputs
  against a reference library on fixed seeds; audit trail on edits and exclusions.
- *Unscripted:* a pilot campaign run by chemists; a statistician's exploratory review of diagnostics.
- *Evidence:* test runs, the benchmark report, pilot notes.

**Part 11 / Annex 11 / ALCOA+ (development campaigns):** the uploaded instrument export is kept as the **original**,
with a hash. The file-to-well mapping is attributable. Edits need a reason. Results are excluded with a reason, never
deleted. Timestamps are contemporaneous. The signed optimum report is locked ("reviewed").

### 4. Industry process it must follow (do not deviate)

1. **QbD frame (ICH Q8(R2)/Q11).** Define targets and potential CQAs. Use a risk assessment (ICH Q9(R1), for example
   FMEA or Ishikawa) to choose parameters. Run designed experiments, then define proven acceptable ranges or a design
   space and the control strategy. The team owns the risk assessment; the tool supports the experiments.
2. **Statistical sequence.** Screening, then optimisation (response surface or BO), then **confirmation runs with
   replicates at the predicted optimum**, then model checks (residuals, lack of fit). A predicted optimum is never
   reported as a result.
3. **HTE practice.** Randomise and block against plate-edge effects; controls and replicates on every plate; an
   internal standard for assay yield, recording area% versus assay yield explicitly.
4. **Analytical status.** Record the method and whether it is in development or validated (ICH Q2(R2)). Data from
   unvalidated methods is fine in R&D but labelled.
5. **Lab safety.** Conditions outside the envelope set by SPEED or the tenant are flagged before a plate runs (for
   example above the solvent's boiling point in sealed wells).
6. **Decision points:** the chemist approves each plate; the analyst confirms results; the chemist accepts the model
   and optimum; the team lead signs the report.

### 5. Domain model (key entities and relationships)

- **Campaign**: project, reaction (F1), objectives, stage tag (discovery or development).
- **Variable**: type, range or levels, unit, scale, constraints.
- **Design**: method (LHS, factorial, D-optimal, BO), seed, engine version.
- **Plate**: 24 or 96 wells, layout version, approval.
- **Well**: conditions, computed masses and volumes, reagent lots from Inventory.
- **Result**: response, unit, method and its status, source file and hash, analyst, timestamp, state (valid or
  excluded with reason).
- **ModelFit**: kernel, hyperparameters, leave-one-out RMSE, interval coverage.
- **Suggestion**: conditions, acquisition value, predicted mean ± interval.
- **OptimumReport**: conditions, predicted and confirmed results, intervals, signatures, version.

### 6. Specification set to write (spec-driven)

**URS highlights**
- CHEM-3-URS-001 Define 2–12 variables (continuous, discrete or categorical) with units and constraints. Reject an
  infeasible space with an explanation.
- CHEM-3-URS-002 Offer classical designs, LHS and BO suggestions, recording the method, seed and engine version.
- CHEM-3-URS-003 Calculate masses and volumes from equivalents, concentration, purity and density, with units. A
  missing property gives "not computed" for that well.
- CHEM-3-URS-004 Import results through a saved mapping. Keep the original file, validate ranges and units, and flag
  outliers without removing them.
- CHEM-3-URS-005 After each batch, refit the model and show the predicted mean, a 95% interval and diagnostics.
  Label suggestions when the diagnostics fail.
- CHEM-3-URS-006 Export a plate only after a named chemist approves it.
- CHEM-3-URS-007 The optimum report shows predicted and confirmed results separately.
- CHEM-3-URS-008 Record the reagent lots for each well from Inventory where available.
- CHEM-3-URS-009 Warm start only from source campaigns the chemist selects, displayed on the model.

**Key functional requirements (Given/When/Then)**
1. **Given** one solvent variable (6 levels) and 3 continuous variables, **when** a 24-well initial design is
   requested, **then** a design is created with every solvent level present, its method, seed and coverage
   statistics shown, and it is reproducible from the seed.
2. **Given** a reagent with no density, **when** volumes are calculated, **then** the affected wells show "volume not
   computed: density missing", and the plate cannot be approved until this is fixed or the dispense is changed to
   mass.
3. **Given** a CSV row with a yield of 112%, **when** it is imported, **then** the row is rejected ("out of range
   0–100") and the original file is retained.
4. **Given** a statistical outlier, **when** it is imported, **then** it is flagged and stays in the model unless a
   chemist excludes it with a reason, and the exclusion is audited.
5. **Given** a refitted model whose leave-one-out 95% intervals cover under 80% of points, **when** suggestions are
   shown, **then** they carry "model poorly calibrated; consider a space-filling design".
6. **Given** a signed optimum report, **when** new results arrive, **then** a new report version is created and the
   signed one stays unchanged.
7. **Given** "order reagents for scale-up", **when** the user confirms, **then** a draft requisition is created in
   Procurement with catalogue items and quantities, and nothing is submitted.

**Non-functional requirements**
- **Model fit:** fit plus a 24-well suggestion ≤ 30 s for ≤ 500 results and 12 variables (proposed).
- **Import:** a 96-well CSV imports in ≤ 5 s.
- **Reproducibility:** identical data, version and seed give identical suggestions.
- **Precision:** masses to a configurable precision (default 0.1 mg).
- **Availability:** 99.5%.
- **Retention:** development campaigns cannot be deleted; retention follows tenant policy.

**AI model specification**
- **Model:** a GP with Matérn 5/2 kernel and per-variable length scales, categorical encoding, a fitted noise model,
  batch acquisition (q-EI, q-NEI or Thompson sampling) and Pareto handling for two objectives. Open-source candidates
  are BoTorch, scikit-learn and SciPy.
- **Intended use:** suggest experiments. Not to define a design space without classical analysis.
- **Data:** the campaign's own results, plus warm-start campaigns the chemist chooses.
- **Metrics (proposed):** on benchmark functions and published HTE datasets, BO reaches the top 5% region in fewer
  runs than random or LHS in ≥ 80% of seeded repeats; per campaign, leave-one-out interval coverage of 85–99%
  (target 95%).
- **Oversight:** plate approval and report signature.
- **Drift:** the model refits each batch, so classic drift does not apply. Assay noise is watched through replicate
  variance.
- **Change control:** the engine version is pinned per campaign. A mid-campaign upgrade needs chemist consent and a
  comparison refit.

### 7. Fit with GigaLibs

- **Reuse:** F1 to F3; **Universal Data Studio** (import mappings, data contracts, quality assertions on result
  files); **Inventory** (reagent stock and lots); **Product Catalogue** (reagents, UOM conversions); **Procurement**
  (draft requisitions); **CMMS** (liquid handlers and HPLCs as assets, with calibration status shown at plate
  approval); ECharts (ADR-0004) for response surfaces. Mobile: a read-only plate view at the bench, later.
- **Assistant:** "predicted yield at these conditions, with interval?", cited to the model run; drafts a campaign
  through a confirm card; explains diagnostics.
- **Dependencies:** F2 for GP and D-optimal designs (LHS and factorial run in TypeScript, so slice 1 needs no Python).
  There are no ELN or LIMS connectors, so exchange is by file first. Liquid-handler formats differ by instrument, so
  export templates are tenant configuration.

### 8. Implementation plan

| Slice | Scope | Size | Acceptance evidence |
| --- | --- | --- | --- |
| 1 | Campaigns, variables, LHS and factorial designs, stoichiometry, plate export/PDF, plate approval | M | Property tests; export round trip; journey |
| 2 | Result import through Data Studio; original-file retention; exclusions with reason; raw plots | M | ALCOA+ scripted tests; audit-trail tests |
| 3 | GP/BO on F2; diagnostics; suggestions; D-optimal | L | Benchmark report; reference-library comparison |
| 4 | Optimum report with confirmation runs, e-signature, procedure export, draft requisition | M | Signature and lock tests; Procurement contract test |
| 5 | Warm start and two-objective Pareto | M | Transfer evaluation (helps or does no harm on benchmarks) |
| Later | ELN/LIMS connectors when they exist | — | — |

Validation deliverables: a classification record per campaign stage, a risk assessment, the trace matrix, scripted
evidence for the calculations and data-integrity functions, and the algorithm verification report.

### 9. Risks and open questions

- **Small data.** GPs are overconfident with few points and awkward with many categorical levels. Diagnostics and
  warnings are mandatory.
- **Scale transfer.** HTE optima may not transfer to batch scale (mixing, heat transfer). Hand off to CHEM-4 and
  SPEED.
- **Assay consistency.** Mixing area% and assay yield misleads the model. The measurement type is required.
- **Classification.** Which campaigns are "development"? The tenant's QA decides the trigger.
- **ELN.** Absent, so the tenant's ELN remains the IP notebook of record. Agree what CHEM-3 holds versus the ELN.
- **Over-trust.** The predicted optimum is always shown beside the confirmed results.

### 10. Agents and humans responsible

- **Lead:** `industry_pharma_life_sciences`.
- **Consulted:** `quality_regulatory_specialist`, `inventory_warehouse_lead`, `procure_to_pay_lead`,
  `integrations_lead` (Data Studio), `maintenance_cmms_lead`.
- **Engineering:** `backend_domain`, `web_experience`, `data_visualisation_design`, `ai_engineering`.
- **Quality:** `qa_spec`, `test_automation`.
- **Review:** `code_reviewer`, `security_reviewer`.
- **New specialists:** `statistics_doe_specialist`, `process_chemistry_specialist`, `csv_csa_validation_specialist`.
- **Human approvers (to be named):** the tenant's head of process R&D (acceptance), a statistician (algorithm
  report) and QA lead (stage classification); the owner.

---

## CHEM-4: Reactor digital twin (live reactor virtualisation)

### 1. Purpose and users

The module simulates how a reaction behaves on scale-up in a specific vessel: heat removal, dosing,
accumulation, gas evolution and pressure. It runs "what if" failure scenarios and gives an **advisory** feasibility
and safety check before the formal process-safety review. Later it compares live plant data with the model.

**Users:**
- process chemists;
- chemical engineers;
- process-safety specialists (through SPEED);
- pilot-plant and manufacturing engineers;
- the plant safety committee.

### 2. What the specification asks for

- **Thermochemistry:** a "DFT surrogate" graph neural network returns ΔH, Ea and HOMO/LUMO for a reaction in under
  10 s, claimed within ±2 and ±3 kcal/mol (FR-301, FR-302).
- **Reactor simulation** of heat transfer, mixing and vapour evolution, solved by RK4 at 1 L, 100 L and 1,000 L, with
  vessel settings for volume, jacket, agitator rpm, fill and addition rate (FR-303).
- **A "3-lens gate"** (FR-304): thermal (MTSR < boiling point − 20 °C), gas (< 5% of headspace) and pressure
  (< 0.7 × vessel rating). All three must pass to "unlock" a scale-up recommendation.
- **A report** with cooling profile, dosing recipe and quench procedure (FR-305), sent automatically to manufacturing,
  with procurement started.

**Our corrections:**
- **MTSR** is the *maximum temperature of the synthesis reaction* (Stoessel), not "max temp synthetic route".
- **Measured data only for safety.** Thermal data comes from measurement (DSC or adiabatic screening, reaction
  calorimetry) assessed in **SPEED**. Computed thermochemistry is screening only.
- **No default thresholds.** The source's thresholds are heuristics, not industry standards. The tenant's
  process-safety lead sets them under change control.
- **An asymmetric gate.** PASS only enables "ready for safety review" and never authorises scale-up. FAIL or NOT
  COMPUTED blocks it.
- **No automatic orders**, to manufacturing or to procurement.
- **Live mode is read-only.** It never writes to a control system.
- **Relief sizing is out of scope** (specialist work, for example the DIERS methodology). The report says "relief
  adequacy not assessed".

### 3. GxP impact and validation approach

**Classification: GxP-adjacent and safety-critical.** Process safety is not itself a GMP requirement; it falls under
process-safety law and company standards. But the scale-up report shapes the process carried into GMP manufacture
through tech transfer. If live mode were ever used for batch decisions in GMP production, it would become GxP
(Annex 11, plus draft Annex 22 for any AI part). That use is **out of scope** until separately validated. Because the
harm potential is to people, assurance here is the **highest in the family**.

**GAMP 5 category:** 5 (bespoke mechanistic model and gate logic). The model is not ML but needs model-credibility
work: verification, validation against data, uncertainty quantification (FDA's draft AI guidance frames credibility
similarly, verify). Any ML thermochemistry estimator is a separate screening component under D11 and never feeds the
gate.

**Validation and assurance approach (CSA-style), mostly scripted:**
- *Solver verification:* adiabatic batch gives T₀ + ΔT_ad within 0.1 K; energy-balance closure checked on every run.
- *Logic and inputs:* unit-conversion tests; each gate threshold tested just below, at and just above; provenance and
  applicability checks on SPEED inputs; "not computed" paths.
- *Validation* per reaction class against reaction-calorimeter runs held out from fitting.
- *Unscripted:* engineers explore scenarios.
- *Evidence:* a V&V plan and report, signed by the tenant's process-safety lead.

**Part 11 / Annex 11 / ALCOA+:** audit trail on inputs, kinetic parameters, vessel overrides and thresholds.
Threshold changes are four-eyes (process-safety role plus a second approver, as in CMMS sign-off). The readiness
review is e-signed. Retention follows tenant policy and local law; process-safety information is commonly kept for
the plant's life.

### 4. Industry process it must follow (do not deviate)

**Thermal process-safety assessment** (Stoessel, *Thermal Safety of Chemical Processes*; CCPS chemical-reactivity
guidance):
1. Screen thermal stability of reactants, mixtures and products (DSC).
2. Measure the heat of reaction, the heat-release rate, accumulation and gas evolution (reaction calorimetry; gas
   flow).
3. Derive ΔT_ad, and **MTSR = T_p + X_ac × ΔT_ad**.
4. Derive decomposition kinetics and **TD24** (adiabatic calorimetry or DSC kinetics).
5. Set **MTT**, the maximum technically allowed temperature (for example the boiling point in an open system, or the
   set pressure).
6. Assign Stoessel's **criticality class 1–5** from the relative order of T_p, MTSR, MTT and TD24.
7. Define measures: dosing control, cooling capacity, emergency measures.
8. Hold a hazard review (HAZOP per IEC 61882, or what-if) and management of change (MOC) before the pilot run. The
   plant manager authorises the run.

**Hand-off with SPEED (explicit contract):**
- **SPEED owns steps 1–6** and holds the assessment of record.
- **SPEED sends** an approved-assessment event (proposed `speed.assessment.approved.v1`): reaction ID and version;
  the assessed envelope (concentration, T_p, dosing mode, solvent); ΔH_r, ΔT_ad and the accumulation profile; MTSR,
  MTT, TD24 and Stoessel class; gas-evolution rate and total; assessment version and approver.
- **CHEM-4 refuses** scenarios outside the envelope, and **returns** its trajectories to SPEED as supporting evidence.
- **CHEM-4 never re-classifies.** If its simulated MTSR differs from SPEED's beyond a tolerance, it raises a
  discrepancy to the SPEED owner.

**Scale-up engineering:** cooling capacity Q_cool = U·A·ΔT is compared with the heat-release rate. Surface-to-volume
falls as scale grows. U and A come from vessel data or Wilson-plot measurements.

### 5. Domain model (key entities and relationships)

- **ProcessRecipe** (charges, dosing, temperature programme; from the CHEM-3 optimum) and **SafetyAssessmentRef**
  (SPEED ID, version, values, envelope).
- **KineticModel**: rate law, parameters with uncertainty, fitting data.
- **Vessel**: the CMMS asset, with volume, design pressure, jacket area against fill, U, agitator, condenser and vent
  as configured attributes, plus its inspection and calibration status.
- **Scenario**: scale, fill, dose rate, coolant temperature, failure mode (cooling loss, agitation loss, dosing
  fault).
- **SimulationRun** (solver, tolerances, version; T, p, gas and accumulation over time) → **GateResult** (lens, value,
  threshold version, PASS / FAIL / NOT COMPUTED) → **ReadinessReview** (decision, signatures, MOC reference).
- **LiveSession** (later): tag mapping, data source, divergence metrics.

### 6. Specification set to write (spec-driven)

**URS highlights**
- CHEM-4-URS-001 Safety-relevant quantities come only from an approved SPEED assessment. No computed estimate
  substitutes for them.
- CHEM-4-URS-002 Vessel data comes from the CMMS asset record with an as-of time. Overrides need a reason and are
  audited.
- CHEM-4-URS-003 Simulate normal operation and the configured failure scenarios at the selected scales.
- CHEM-4-URS-004 Each lens reports value, threshold, threshold version and PASS / FAIL / NOT COMPUTED. Missing
  inputs give NOT COMPUTED.
- CHEM-4-URS-005 PASS on every lens enables only "ready for safety review". It cannot authorise scale-up.
- CHEM-4-URS-006 Thresholds are tenant configuration, changed only by the process-safety role with a second approval.
- CHEM-4-URS-007 Runs are reproducible within the stated solver tolerance.
- CHEM-4-URS-008 The module never writes to a process-control system.
- CHEM-4-URS-009 Reports state the assumptions, the model's validation status for the reaction class, and the
  uncertainty bands.
- CHEM-4-URS-010 (Live, later) Compare live data with the predicted profile and flag divergence. Advisory only.

**Key functional requirements (Given/When/Then)**
1. **Given** no approved SPEED assessment, **when** a simulation is requested, **then** the result reads "Not
   computed: no approved SPEED assessment for reaction R" and no gate result exists.
2. **Given** a SPEED envelope of ≤ 1.0 M and a scenario at 1.4 M, **when** it runs, **then** every lens shows NOT
   COMPUTED: "outside assessed envelope".
3. **Given** a simulated value exactly at a threshold, **when** the gate evaluates, **then** the result follows the
   documented inequality for that lens (boundary tests at −ε, 0 and +ε).
4. **Given** all lenses PASS, **when** the run completes, **then** the status becomes "ready for safety review", a
   review task goes to the process-safety role, and no order or requisition is created.
5. **Given** a user without the process-safety role, **when** they edit a threshold, **then** the edit is refused.
   With the role, the change waits for a second approver and is audited.
6. **Given** a vessel whose CMMS inspection is overdue, **when** the report is produced, **then** it shows the overdue
   inspection as a blocking warning for review.
7. **Given** a simulated MTSR that differs from SPEED's by more than the tolerance, **when** the run completes,
   **then** a discrepancy is raised to the SPEED owner.

**Non-functional requirements**
- **Speed:** 3 scales × 4 scenarios in ≤ 60 s.
- **Solver:** an adaptive stiff solver with relative tolerance ≤ 1e-6. The source's fixed-step RK4 is unsafe for
  stiff kinetics.
- **Validation accuracy (proposed):** against held-out calorimeter runs, peak temperature within ±3 K and
  time-to-peak within ±10%.
- **Availability and retention:** 99.5% (advisory tool); tenant policy.

**AI model specification**
- The core model is mechanistic, not AI. The source's DFT-surrogate accuracy claims are not adopted.
- **Optional ML thermochemistry estimator:** intended only to prioritise which reactions SPEED tests first, and
  *never* an input to the gate. Data: measured heats of reaction from open literature, plus tenant data kept private.
  Metric (proposed): mean absolute error on a held-out measured set, with prediction intervals. Oversight: SPEED
  scientists. Change control: F3.

### 7. Fit with GigaLibs

- **Reuse:** **CMMS** (vessels as assets: attributes, inspection and calibration status, the four-eyes pattern);
  **Geospatial** (site, plant); **SPEED** (another team) through events and API; **CHEM-3** for the optimised recipe;
  F1 to F3; Workflow Studio and E-signature (built, not deployed) for the readiness review; Universal Data Studio for
  calorimeter files; ECharts for profiles.
- **Assistant:** "which scenarios failed and why?", cited to the runs. It refuses to authorise or change thresholds.
- **Dependencies:** **F2**, for an ODE solver (for example SciPy's stiff integrators) and kinetic fitting. **The SPEED
  contract** must exist first. **Live mode** needs an OPC-UA connector (OT security per IEC 62443), a time-series
  historian and tag mapping; none exists today.

### 8. Implementation plan

| Slice | Scope | Size | Acceptance evidence |
| --- | --- | --- | --- |
| 1 | SPEED contract; vessel data from CMMS; static cooling-capacity check (maximum heat release against U·A·ΔT) | M | Contract tests with SPEED; applicability tests |
| 2 | Dynamic semi-batch simulation on F2, with the verification suite | L | Verification report (analytical cases) |
| 3 | Failure scenarios; the gate; threshold configuration with four-eyes; readiness review with e-signature | M | Boundary tests; role tests; signature tests |
| 4 | Validation against calorimetry for the first reaction classes | L | V&V report signed by the tenant's process-safety lead |
| 5 | Live comparison mode (needs OPC-UA and a historian) | XL | Read-only proof (no write path), OT security review, divergence tests |

Validation deliverables: a process-hazard-aware risk assessment, a V&V plan and report, a threshold configuration
specification, a trace matrix, and an independent review.

### 9. Risks and open questions

- **False reassurance** from a PASS. Mitigated by the asymmetric gate and the wording; the tenant's safety lead must
  approve both.
- **Model validity limits.** Mixing-limited, multiphase, gas–liquid and heterogeneous reactions may need models
  beyond scope. The report must state when the model is outside its validated classes.
- **The SPEED contract** is not yet agreed with the other team.
- **CMMS vessel data quality** varies (jacket areas, U values).
- **Liability and contract terms** for a safety-related tool. (owner, legal)
- **Live mode** brings OT cyber risk and possible GxP scope creep.

### 10. Agents and humans responsible

- **Lead:** `industry_pharma_life_sciences`, with `industry_manufacturing`.
- **Consulted:** `maintenance_cmms_lead` (vessel assets), `health_safety_environment_specialist`,
  `quality_regulatory_specialist`.
- **Engineering:** `integration_connectors` (later OPC-UA), `backend_domain`.
- **Quality:** `qa_spec`.
- **Review:** `security_reviewer` and `security_engineering` (OT), `code_reviewer`.
- **New specialists:** `process_safety_specialist` (liaison to SPEED), `chemical_engineering_modelling_specialist`,
  `csv_csa_validation_specialist`.
- **Human approvers (to be named):** the tenant's process-safety lead (thresholds, V&V acceptance), plant manager
  (scale-up authorisation, outside the tool) and QA lead; the SPEED module owner (contract); the owner.

---

## CHEM-5: Route economics and commercial intelligence

### 1. Purpose and users

The module estimates cost of goods per kg of API for each candidate route at several scales, with uncertainty.
It shows supply risks: single source, geography, lead time and supplier qualification. Route choice then weighs
commercial viability early instead of at tech transfer. For a CDMO, it supports customer proposals.

**Users:**
- process chemists;
- project managers;
- business development and proposal teams;
- sourcing and procurement;
- finance cost controllers;
- R&D directors.

### 2. What the specification asks for

- **Cost model:** cost of goods at 1 kg, 10 kg, 100 kg and 1 t (FR-401).
- **Supply view:**
  - the vendor landscape for each intermediate (FR-402);
  - supply risk: single source, geopolitical, lead time (FR-403).
- **Linked indicators:**
  - FTO status from CHEM-1 (FR-404);
  - a scale-viability score from lab to commercial (FR-405).
- **Bottom-up cost logic:**
  - material cost, plus yield loss at each step, plus labour (FTE-hours × rate), plus overhead (utilities, waste),
    plus QC;
  - propagated from leaves to API;
  - Monte Carlo (1,000 runs) for a P10/P50/P90 band.
- **Data:** own pricing and inventory; external supplier catalogues; customs data by HS code; a commodity price
  index; patent expiry.

**Our changes:**
- **Every input has a source and an as-of date.** External catalogues and indices come only under licence, through
  Connector Hub.
- **"FTO status" becomes a patent indicator plus attorney status.**
- **Scale viability is an explicit checklist,** not an opaque score.
- **Monte Carlo is seeded and reproducible.**

### 3. GxP impact and validation approach

**Classification: non-GxP.** The module supports commercial and financial decisions.
- **Interface with GxP:** supplier qualification status is *displayed read-only* from the tenant's quality source.
  CHEM-5 cannot mark a supplier approved, and GMP materials must come from approved suppliers (ICH Q7).
- **No GL postings, no purchase orders.**

**GAMP 5 category:** not applicable for GxP purposes. We follow our normal SDLC (Category 4 configuration on Category
5 code).

**Assurance (finance-grade correctness, not CSV):**
- *Property tests* on mass and cost propagation (the "correct by construction" bar in BENCHMARKS):
  - material need falls monotonically as yield rises;
  - totals equal the sum of their parts;
  - currency rounding follows the platform rules.
- *Reproducibility tests* on seeded Monte Carlo.
- *Review* by `finance_controls_reviewer` of how actual costs are read from Finance.
- *Unscripted:* proposal teams compare estimates with past projects.

**Part 11 / Annex 11:** not applicable. The platform audit trail still covers inputs, assumptions and estimate
issue, because proposal integrity matters.

### 4. Industry process it must follow (do not deviate)

1. **Mass balance.** For each step, kg of input per kg of API is derived from stoichiometry, MW ratios and step
   yields, compounded back to the API. Solvents and reagents are included, with recovery credits where they apply.
2. **Cost build-up:** materials at scale-specific prices (price breaks); plant occupancy (vessel-hours × rate) and
   labour; waste disposal; QC and release testing; overhead.
3. **Estimate maturity.** Label early estimates by maturity class (for example AACE International's estimate
   classes, verify the recommended practice) so their wide ranges are explicit.
4. **Sourcing.** Build the supplier landscape. QA qualifies suppliers of GMP materials and RSMs (audit, quality
   agreement). Check dual sourcing, geographic concentration and lead time. Assess duties and trade controls by HS
   code.
5. **Approvals.** The project lead approves the inputs. Finance reviews any figure used in a customer proposal, and
   the issue follows delegation of authority.

### 5. Domain model (key entities and relationships)

- **CostModel**: route version (from F1 or CHEM-2), scales, reporting currency, version, status (draft or issued),
  maturity class.
- **StepCostLine**: yield distribution, cycle time, vessel class, labour hours.
- **MaterialLine**:
  - compound and catalogue item;
  - computed kg per kg API;
  - price source (price-list version, PO history, quote, or manual with a reason), price distribution, currency,
    as-of date.
- **RateCard**: labour, plant-hour, waste and QC rates; tenant configuration, or Finance once a rate source exists
  there.
- **SupplierOption**: vendor (a Parties record used by Procurement), country, lead time, qualification status
  (read-only), single-source flag.
- **RiskIndicator**.
- **SimulationResult**: P10/P50/P90 per scale, seed, iterations, top drivers.
- **ViabilityChecklist**: explicit criteria for each stage.
- **EstimateIssue**: purpose (internal decision or customer proposal), approver.

### 6. Specification set to write (spec-driven)

**URS highlights**
- CHEM-5-URS-001 Compute the material requirement per kg of API for each route from stoichiometry, MWs and step
  yields, and show the calculation.
- CHEM-5-URS-002 Price each material from a tenant-ordered source hierarchy (active price list; last PO price within
  N days; valid quote; manual with reason), showing source and as-of date. Never assume zero.
- CHEM-5-URS-003 Compute the cost at each selected scale with scale-specific prices and yields.
- CHEM-5-URS-004 Propagate uncertainty by Monte Carlo with a recorded seed and iteration count. Report P10/P50/P90 and
  the top cost drivers.
- CHEM-5-URS-005 Show supplier options per material: number of qualified suppliers, countries, lead time,
  single-source flag. Qualification is read-only.
- CHEM-5-URS-006 Show CHEM-1's patent indicator with its attorney status. Never "clear" automatically.
- CHEM-5-URS-007 Convert currencies with the tenant's rate source and show the rate date. Never sum mixed currencies
  unconverted.
- CHEM-5-URS-008 An issued estimate is versioned and locked, and records its approver and purpose.
- CHEM-5-URS-009 Never post to the ledger or create purchase orders. Draft requisitions only after user confirmation.

**Key functional requirements (Given/When/Then)**
1. **Given** a three-step route with yields of 80%, 70% and 90% and 1.2 equivalents of SM in step 1, **when** it is
   costed, **then** kg of SM per kg of API equals the closed-form value shown in the calculation panel (also
   property-tested over random routes).
2. **Given** a material with no price in any source, **when** the estimate runs, **then** the total reads "incomplete:
   1 material not priced". Only a labelled partial subtotal is shown.
3. **Given** prices in INR and USD and no rate source, **when** a total is requested, **then** the system refuses to
   sum and asks for a rate source.
4. **Given** a Monte Carlo run with seed S, **when** it is re-run, **then** P10/P50/P90 are identical.
5. **Given** one qualified supplier for an RSM, **when** risk is shown, **then** "single qualified source" appears.
6. **Given** an issued estimate, **when** an input is edited, **then** a new draft version is created and the issued
   version is unchanged.
7. **Given** a price-list version activated after an issue, **when** the issued estimate is opened, **then** it shows
   "inputs changed since issue".

**Non-functional requirements**
- **Speed:** 10,000 iterations for a 20-step route at 4 scales in ≤ 10 s, in TypeScript with no Python.
- **Determinism:** seeded runs are deterministic.
- **Money precision:** follows the platform's currency rules.
- **Availability:** 99.5%.
- **Retention:** issued estimates follow tenant policy.
- **Accuracy:** RR-002's ±30% becomes a tracked metric. The error distribution of estimate against actual (received
  PO costs, actual batch costs) is reported, not promised.

**AI model specification**
- None in the planned releases. The model is deterministic, with statistical simulation.
- Price forecasting from commodity indices would need its own model specification and a data licence. Out of scope.

### 7. Fit with GigaLibs

- **Reuse:**
  - **Product Catalogue**: items, UOM conversions (kg/L/mol with density), versioned price lists;
  - **Procurement**: vendors (Parties), PO price history, draft requisitions; RFQ bidding is planned, not built;
  - **Inventory**: stock and lots;
  - **Financial Operations costing**: receipt cost layers (actual cost), landed cost (freight, duty), valuation
    summary;
  - **Multi-currency** (built, not deployed; needed);
  - **Universal Orders** sales quotes, later, to carry a CDMO proposal;
  - Analytics Studio (dashboards), Workflow Studio (approval), Connector Hub (licensed catalogues and indices).
- **Assistant:** "what drives cost for route B at 100 kg?", cited to the simulation. It drafts requisitions after a
  confirm card.
- **Gaps:**
  - no approved-supplier list (material × supplier × site × status) exists in GigaLibs. It belongs to a future quality
    module (`quality_management_lead`, owner decides under §7D); until then, a read-only import from the tenant's
    QMS;
  - the home of the rate cards (Finance or module configuration) is a decision for `costing_valuation_lead`.

### 8. Implementation plan

| Slice | Scope | Size | Acceptance evidence |
| --- | --- | --- | --- |
| 1 | Chemist-entered route; mass balance; deterministic cost from Catalogue, Procurement and Finance inputs, with provenance and "not priced" | M | Property tests; finance reviewer record; journey on UAT data |
| 2 | Monte Carlo and sensitivity (top drivers) | S | Seeded reproducibility tests |
| 3 | Supplier landscape and risk indicators; read-only qualification import | M | Contract tests; isolation tests |
| 4 | Estimate issue, lock, approval and export; "inputs changed" banner | S | Version and lock tests |
| 5 | CHEM-2 routes and CHEM-1 indicators linked | M | Cross-module contract tests |
| 6 | Estimate against actual tracking | M | Report reconciles to Finance cost layers |

Validation deliverables: finance-correctness evidence (property tests, reviewer record). No CSV package is needed,
because the module is non-GxP.

### 9. Risks and open questions

- **Stale or unlicensed price data.** Commodity indices and customs data need licences. (`licence_ip_reviewer`)
- **Confidentiality of supplier prices.** Internal prices must never appear in customer-facing proposals by accident.
  Field-level rules and an export review are needed.
- **Multi-currency is not deployed.** Until it is, single-currency estimates only.
- **Over-precision.** Show bands and the maturity class, never a single number alone.
- **Supplier qualification data** lives outside GigaLibs (the tenant's QMS).

### 10. Agents and humans responsible

- **Lead:** `costing_valuation_lead`, with `industry_pharma_life_sciences`.
- **Consulted:** `product_pricing_lead`, `procure_to_pay_lead`, `inventory_warehouse_lead`, `order_to_cash_lead`
  (quotes, later), `financial_mathematics_specialist`, `currency_fx_specialist`, `supply_chain_planning_specialist`,
  `trade_customs_specialist`.
- **Quality:** `qa_spec`.
- **Review:** `finance_controls_reviewer`, `code_reviewer`, `security_reviewer`.
- **New specialist:** `process_economics_specialist`. This could be folded into `process_chemistry_specialist` if the
  owner prefers fewer roles.
- **Human approvers (to be named):** the tenant's finance controller (cost logic, proposal review), head of business
  development (CDMO proposals) and sourcing lead (supplier data); the owner (intake).


<!-- pagebreak -->

# 7B. Response, qualification and trust management

Pharma and life-sciences practice, GigaLibs, 2026-10-19. A read-only investigation of source lines 291–412 and the
method section (902–1010).

**Roles embodied:**
- `industry_pharma_life_sciences` and `quality_regulatory_specialist`;
- the specialists named in each module's section 10.

**Conventions:**
- "(verify)" marks a clause, date or figure to confirm against the primary text before it shapes a design.
- Every numeric threshold below is a **proposal**. The owner and the pilot customer's QA confirm it on real data.
- The source's outcome figures are vendor marketing and are **not** adopted as requirements. They include time saved,
  throughput multiples, reductions in question volume and win-rate claims.
- So are the method section's cost and return-on-investment figures.

## Family overview

### What the family is for

**The CDMO side.** A CDMO or API manufacturer answers a steady flow of requests:
- customer RFPs and RFIs (scope, capacity, timelines, price);
- supplier quality questionnaires, which are the customer's supplier-qualification step;
- due-diligence questionnaires (finance, ethics, ESG, business continuity);
- information-security questionnaires (ISO/IEC 27001 or SOC 2 style).

The same facts are asked for again and again: GMP certificates, inspection history, the site master file, the
change-notification commitment, the quality-agreement template, and equipment and containment capability. A wrong or
out-of-date answer is more than a lost deal. It can enter a customer's supplier-qualification file and surface later in
an audit or an inspection.

**The buyer side.** A pharma buyer runs the mirror process:
- it issues RFIs and RFPs to suppliers and evaluates them;
- before any GMP material or outsourced activity is used, its quality unit:
  - qualifies the supplier;
  - agrees a quality agreement;
  - monitors the supplier's changes.

The standards behind this are ICH Q7 sections 7 and 16, ICH Q10 section 2.7 and EU GMP Part I Chapter 7.

**What the family gives both sides:**
- one governed body of approved content (RESP-2);
- a controlled way to answer requests (RESP-1);
- a controlled way to share evidence (RESP-3);
- an early, recorded bid decision (RESP-4);
- a fair, auditable way to issue requests to suppliers (RESP-5).

### Where the GxP line falls

| Activity | Classification | System of record |
| --- | --- | --- |
| Price, margin, bid strategy, go/no-go, win/loss | Non-GxP (commercial) | RESP-4, RESP-1 |
| Commercial answers (capacity windows, lead times, terms) | Non-GxP | RESP-1 |
| A CDMO's answers to a customer's quality questionnaire | GxP-adjacent: they feed the customer's GxP qualification decision; the CDMO's QA approves each one | RESP-1, sourced from RESP-2 |
| Library of approved answers and evidence | GxP-adjacent: controlled copies of statements whose master is the eQMS or document system | RESP-2 |
| Evidence shown to customers (GMP certificates, site master file, audit reports under NDA) | GxP-adjacent | RESP-3 (masters stay in the eQMS) |
| Supplier qualification decision, audits, approved supplier list, quality agreements, supplier change notifications | **GxP** | The supplier-quality record. **Not in this family:** today it is the customer's eQMS; later it could be the Quality management module (plan v3 §7D, owner decides) |
| Blocking a purchase order for a GMP material from an unapproved supplier | **GxP control** | Procurement, when its GMP flag is switched on |

**Rule:**
- The family feeds and reads the supplier-quality record; it never replaces it.
- None of these is a qualification: a sourcing award, a high evidence score or a favourable bid decision.

### GxP map at a glance

| Module | Classification | GAMP 5 category | Size to validated release |
| --- | --- | --- | --- |
| RESP-1 Response projects | GxP-adjacent for quality and regulatory sections; non-GxP for commercial sections | 4; extraction and drafting AI are assistive | L |
| RESP-2 Contextual content library | GxP-adjacent | 4; retrieval AI is assistive | L |
| RESP-3 Trust centre | GxP-adjacent | 4 | L (includes external identity, shared with RESP-5) |
| RESP-4 Bid go/no-go | Non-GxP | Not applicable (good IT practice) | M for rules; another L for a win-probability model, only when the data allow |
| RESP-5 Buyer-side request issuance | Non-GxP sourcing; a GxP control at the qualification gate and the PO block | 4 for the gate; good IT practice for the rest | L |

**GAMP 5 categories.** GAMP 5 Second Edition (ISPE, 2022) uses:
- category 1: infrastructure software;
- category 3: non-configured products;
- category 4: configured products;
- category 5: custom applications.

**How they apply to GigaLibs:**
- GigaLibs modules are configured through the Application Dictionary (ADR-0033), so for the regulated user they are
  category 4.
- Anything written for one customer is category 5.

**Who validates:**
- The regulated company validates its intended use (21 CFR 11.10(a); EU GMP Annex 11 §4).
- GigaLibs supplies documentation and test evidence the customer can rely on after assessing GigaLibs as a supplier
  (Annex 11 §3).

### Recommended order inside the family, and why

1. **RESP-2 first.** Every other module draws on approved, versioned, expiring content. Without it, AI drafting has
   nothing safe to cite.
2. **RESP-1 next.** It is the main value for a CDMO, and its first slice needs no AI and no external users.
3. **RESP-3 third.** It needs a platform capability that does not exist: authenticated external parties. Build that
   once, here, under a full security review.
4. **RESP-5 fourth.** It reuses the same external identity, and it depends on:
   - Procurement's release (M-PROC, plan v3 step 5B);
   - Parties (T4);
   - a supplier-quality record.
5. **RESP-4 last.** A rules-based checklist is cheap, but anything predictive needs the bid outcomes that RESP-1
   records.

**Placement in plan v3:**
- None of this family has a card. Whether and when it starts is an owner decision (plan v3 §7D style).
- The first slices of RESP-2 and RESP-1 need nothing beyond:
  - the module SDK;
  - metadata windows;
  - email notifications (N1).
- AI drafting waits for:
  - GU1, GU4 and GU5;
  - the later GU card for questions over documents.

### Cross-cutting decisions (owner: `solution_architecture`)

**ADR-X1: external party identity.**
- **Need:** customer and supplier users with MFA and verified organisation domains, isolated by tenant and limited to
  portal surfaces.
- **Today:** a search of the control plane (`apps/playground-api/src`) and the auth packages found no guest, portal or
  magic-link identity.

**ADR-X2: retrieval index.**
- **First:** PostgreSQL full-text search, which needs no new infrastructure.
- **Later, by ADR:** semantic retrieval, with embeddings made through the Assistant's AI abstraction and a vector index
  held under module RLS.
- **Today:** no vector index exists in the repository.
- **Prior design:** the governed-RAG design (`docs/runbooks/governed-rag-pipeline.md`) is an input to this ADR, not a
  built capability. Its card, WI-OI-012, was replaced by GU1–GU7.

**ADR-X3: document storage.**
- **Option 1:** reuse the control plane's S3-compatible `ObjectStorageService`, which issues presigned uploads with a
  declared SHA-256.
- **Option 2:** a bucket prefix owned by the module.
- **Either way:** frozen packages need retention locks.

**ADR-X4: governance of generative AI.**
- a model register;
- prompts, retrieval settings and model versions held as configuration items;
- evaluation sets;
- change control.

**No Python scientific-compute runtime** is needed for this family's first slices:
- document parsing and model calls run in TypeScript through the AI abstraction;
- a win-probability model (RESP-4) is either small enough for TypeScript or waits for the scientific-compute decision.

**Module placement:**
- **New module `response-management`:** RESP-1, RESP-2 and RESP-4.
- **New module `trust-centre`:** RESP-3. It is separate because its external attack surface needs its own threat
  model.
- **RESP-5 inside `universal-procurement`:** its manifest already lists `vendor-portal` and `rfq-bidding` as planned
  capabilities.
- New modules start from `module:new` and the S16 kit (metadata, access rows and the Assistant contribution).

---

## RESP-1: Response projects (RFP, RFI, DDQ and questionnaire responses)

### 1. Purpose and users

RESP-1 lets a CDMO or API manufacturer answer an incoming request as a controlled project. The request can be an RFP,
an RFI, a supplier quality questionnaire, a due-diligence questionnaire or a security questionnaire. The project:
1. imports the customer's document;
2. drafts answers from approved content;
3. routes each answer to the right expert and approver;
4. submits a frozen, traceable package in the customer's own format.

**Users:**
- **Bid manager** (project owner): imports, assigns, chases and exports.
- **Business-development lead** (deal owner): commercial sign-off.
- **Subject-matter experts:**
  - QA;
  - QC and analytical;
  - regulatory affairs (CMC);
  - manufacturing and MSAT;
  - EHS;
  - supply chain;
  - IT and information security;
  - finance;
  - legal.
- **Quality approver** (head of QA or a delegate): approves every Quality/GMP and Regulatory answer.
- **Commercial approver**, under the delegation-of-authority matrix: approves prices and terms.

### 2. What the specification asks for (summary, in our words; key requirement IDs if the source has them)

- **Import (FR-501, RP-001):** Word, Excel and PDF. Detect tables, numbered lists, headers and nested sub-questions,
  and keep the structure. Targets: at least 95% detection; under 2 minutes for 500 questions.
- **AI first drafts (FR-502, RP-002):** for at least 80% of questions, drawn from the content library.
- **A score per answer (FR-503):** confidence, source document and page, source date, approving SME, and a stale flag
  when the source is over 90 days old.
- **Workflow (FR-504, RP-003, RP-004):** assign by tag, section or hand, with deadlines and escalation. Approve
  SME → manager → final, with an audit trail per question.
- **Export (FR-505, RP-005):** each answer in its original cell or paragraph, with formatting and version history
  kept.
- **Dashboard (RP-006):** progress, overdue questions, time to answer, win/loss.
- **Non-functional (NFR-501 to 505):** import time, availability, languages, data residency, security certification.

**Where we deviate, and why:**
- **External SMEs.** The source's "magic link, no login" for external SMEs is rejected. An answer that can reach a
  customer's qualification file must be attributable to an authenticated person (21 CFR 11.10(d); Annex 11 §12).
  External contributors get named guest accounts once ADR-X1 exists, or they send a document.
- **Library updates.** "Library updated on approval" becomes "proposed to the library". A project answer may be
  tailored to one customer or contain that customer's confidential details. It enters RESP-2 only through RESP-2's own
  approval.
- **Confidence.** A model's self-reported "confidence %" is not used. We define an evidence score from facts the
  system can verify (section 6).
- **No AI-generated numbers.** AI never generates numbers, prices, dates, capacities, certificate numbers or regulatory
  statuses.
- **Availability and certification.** The source's 99.9% availability and its SOC 2 / ISO 27001 claims are not adopted
  as product requirements:
  - platform SLOs come with plan wave W4;
  - certification is a company decision for the owner.

### 3. GxP impact and validation approach

**Classification: GxP-adjacent, set per section.**
- Quality/GMP and Regulatory answers are statements about the CDMO's quality system. A customer uses them in its
  supplier qualification (ICH Q10 §2.7; EU GMP Chapter 7; ICH Q7 §16 for API contract manufacturers).
- The CDMO takes no GMP decision in the tool.
- A named QA approver checks each such answer against its controlled source.
- Commercial-only projects are non-GxP and follow only the commercial route.

**GAMP 5: category 4.**
- Configuration covers content classes, approval routes, templates and retention.
- The question extractor, retriever and drafter are assistive AI components:
  - their output is never used without a named person's approval;
  - they are assured by evaluation against a labelled set, in line with GAMP 5 Second Edition's AI/ML guidance
    (Appendix D11, verify).
- The EU's draft Annex 22 (2025 consultation):
  - as drafted, it does not accept generative models in critical GMP applications;
  - this is a non-critical use with a person in the loop;
  - so we apply its principles as good practice: intended use, independent test data, explainability and human
    review (draft; verify the final text).

**Assurance (CSA-style, risk-based).** FDA's computer software assurance guidance is written for device production and
quality-system software. It is applied here by analogy; check its current status (verify).
- **Scripted, with recorded evidence:** class routes, no self-approval, re-approval after an edit, the export gate,
  frozen-package integrity (SHA-256 recomputed), audit-trail completeness, scope and membership access, confidentiality
  between projects, and export against golden files.
- **Unscripted and exploratory** (a recorded charter, tester and findings): unusual layouts, how useful drafts are,
  notifications.
- **AI evidence:** an evaluation report for each model or prompt version (section 6).

**Part 11, Annex 11 and ALCOA+:**
- **Audit trail** on Quality and Regulatory answers and on every approval. It records who, when, the old and new value,
  and the reason for any change after first approval (21 CFR 11.10(e); Annex 11 §9).
- **Approvals** are attributable to an authenticated, named user, with the meaning "approved for submission".
- **Signed questionnaires:**
  - Some customers or SOPs require a signed questionnaire. That needs an electronic signature showing printed name,
    date and time, and meaning (21 CFR 11.50, 11.70; Annex 11 §14).
  - GigaLibs's e-signature module is a frozen prototype and is not deployed. Its schema identifies signers by name and
    email. A read found no signature-meaning field and no re-authentication step.
  - A Part 11 gap assessment must close before the module is used for this.
- **AI contribution:** both the AI draft and the person's final text are kept, so a reviewer can see exactly what the
  AI contributed.
- **Retention:** submitted packages are kept unchanged for the period QA sets. The period is configurable; the CDMO's
  record-retention SOP decides it.

### 4. Industry process it must follow (do not deviate)

1. **Register the request.**
   - Link it to the customer (a Party).
   - Confirm that a confidentiality agreement covers what will be shared. No confidential content goes out without
     one.
2. **Bid/no-bid gate** (RESP-4) for RFPs. Questionnaires from existing customers skip it.
3. **Kick-off.** Build a compliance matrix of every requirement and question. Each gets a content class, an owner and a
   due date.
4. **Draft from approved content only.** Gaps go to SMEs.
5. **Review by the SME, then by the class approver:**
   - **QA** for Quality/GMP and Regulatory statements. QA checks them against current controlled documents: SOP
     versions, the site master file, GMP certificates and inspection history.
   - **Legal** for terms, and for any departure from the CDMO's standard quality-agreement template.
   - **Commercial approver** for prices, under the delegation of authority.
6. **Consistency checks the industry expects.** The change-notification commitment must match:
   - the CDMO's change-control SOP. ICH Q7 §13 expects API manufacturers to notify customers of changes that can
     affect quality (verify the paragraph);
   - its quality-agreement template (FDA guidance, *Contract Manufacturing Arrangements for Drugs: Quality
     Agreements*, 2016).
7. **Final sign-off and submission.** The package is frozen and retained.
8. **After submission:**
   - clarifications are recorded as new answer versions;
   - a customer audit often follows, and RESP-3 supports it;
   - record the outcome and the reason.

**Decision points:**
- bid or no-bid: the BD board;
- any departure from standard quality terms: QA and legal;
- price: the delegation of authority;
- "not answered": the project owner, with a reason.

### 5. Domain model (key entities and relationships)

- **`ResponseProject`:** type (RFP, RFI, QUALITY_QUESTIONNAIRE, DDQ, SECURITY_QUESTIONNAIRE), customer Party,
  confidentiality-agreement reference, sites in scope, due date, status, and a GxP flag.
- **`RequestDocument`**, one or more per project: file key, SHA-256, format, version.
- **`Section` → `Question`:**
  - question text;
  - original location (sheet, row and column, or paragraph and table cell);
  - parent question;
  - answer type (text, yes/no, choice, number, date, attachment);
  - content class, owner, due date.
- **`AnswerDraft`**, several per question:
  - origin: LIBRARY_VERBATIM, AI_DRAFTED or HUMAN;
  - text;
  - `Citation`s to one of:
    - a RESP-2 answer version;
    - an evidence-document version and page;
    - a GigaLibs record, such as a CMMS asset;
  - the evidence score and its components;
  - the model and prompt version, when AI drafted it.
- **`Answer`**, one per question, versioned:
  - text and status;
  - `ApprovalStep`s, each with the required role, approver, decision, meaning, reason and timestamp.
- **`Assignment`** and **`CommentThread`**.
- **`SubmissionPackage`:** frozen files, SHA-256, answer versions, approvers, submission time and channel.
- **`LibraryCandidate`**, sent to RESP-2.
- **`Outcome`** (won, lost or withdrawn, with a reason), sent to RESP-4.

### 6. Specification set to write (spec-driven)

**URS highlights:**
- **RESP-1-URS-001:** The system imports .docx, .xlsx and text-based .pdf requests. It shows each detected question
  with its original location. A person verifies the structure before drafting starts.
- **RESP-1-URS-002:** Every draft shows its sources and an evidence score with the reasons behind it. A question with
  no approved source shows "no approved source: answer manually"; AI does not draft it.
- **RESP-1-URS-003:** AI never generates numbers, prices, dates, capacities, certificate identifiers or regulatory
  statuses. These come only from cited records or from a named person.
- **RESP-1-URS-004:** Each question carries a content class, and the system enforces that class's approval route. The
  approver must hold the class's role and must not be the author.
- **RESP-1-URS-005:** A project cannot be exported for submission until every question is either approved or marked
  "not answered" with a reason.
- **RESP-1-URS-006:** A submitted package is frozen: its files, answer versions, approvers, timestamps and SHA-256. It
  is retained for the configured period and can be retrieved unchanged.
- **RESP-1-URS-007:** Every change to an answer or an approval is audit-trailed. A reason is required for any change
  after first approval.
- **RESP-1-URS-008:**
  - Access is limited to project members within their unit and site scope.
  - One customer's request content is never used to answer another customer's project.
  - It is never used to train models.
- **RESP-1-URS-009:** Export places each approved answer in its original location, with formatting kept, for .docx and
  .xlsx.
- **RESP-1-URS-010:** Proposing an answer to the library creates a RESP-2 candidate. It never changes the library
  directly.

**The evidence score** replaces a model's self-reported confidence. It is deterministic, and every component is shown:
- **Gate.** The source version is Effective and inside its review date. If not, there is no score and no draft.
- **Match strength.** The retrieval rank and similarity, shown as a band.
- **Origin.** A verbatim library answer scores higher than an AI paraphrase.
- **Age.** The source's age against its class's review interval.
- **Track record.** The share of past uses accepted without substantive edit.

It is shown as High, Medium or Low with the reasons, never as a bare percentage. Its bands are calibrated against
reviewer outcomes (see the non-functional requirements).

**Key functional requirements (Given/When/Then):**

1. **Import:**
   - Given a 500-question .xlsx on three sheets with nested sub-questions,
   - When it is imported,
   - Then each question shows its sheet, row and column, sub-questions link to their parents, and the project stays in
     "Structure to verify" until the owner confirms;
   - and on the golden set, detection recall is at least 95% and precision at least 95%.
2. **Draft from the library:**
   - Given an effective library answer that matches,
   - When drafting runs,
   - Then the draft cites the answer's ID and version and its evidence document's version, and shows the evidence band
     and its components.
   - Given only expired answers match,
   - Then nothing is inserted, the question shows "source expired", and the content owner is notified.
3. **No fabrication:**
   - Given "What is your largest reactor volume?",
   - When the CMMS asset register holds reactor volumes,
   - Then the draft states the figure and cites the asset records.
   - When no record holds it,
   - Then the answer stays empty: "not computed: no source record".
4. **Class route:**
   - Given a Quality/GMP answer written by user A,
   - When A tries to approve it,
   - Then the system refuses;
   - and approval by a holder of the Quality approver role is recorded with the meaning "approved for submission".
5. **Re-approval:**
   - Given an approved answer,
   - When anyone edits it,
   - Then its status returns to pending, a reason is required, and the earlier version is kept.
6. **Export gate:**
   - Given three questions are not approved,
   - When the owner exports for submission,
   - Then the export is refused and lists the three.
   - A draft export is allowed, watermarked "DRAFT".
7. **Frozen package:**
   - Given a package submitted two years earlier,
   - When it is opened,
   - Then the recomputed SHA-256 matches the stored one, and the package lists its answer versions and approvers.
8. **Confidentiality:**
   - Given customer X's request text exists in another project,
   - When drafting for customer Y,
   - Then retrieval returns only RESP-2 effective content, never X's text.
   - A seeded cross-project test proves it.
9. **Escalation:**
   - Given a question due on day D,
   - When D−1 passes with the question incomplete,
   - Then the assignee and the owner are notified;
   - and at D, the escalation contact is notified.

**Non-functional requirements:**
- **Import:** at most 2 minutes at p95 for a 500-question .docx or .xlsx (the source's target, kept as a proposal).
  Text-based PDF: at most 5 minutes.
- **Scanned PDFs** wait for the document scanner, which is not deployed.
- **Drafting:** at most 10 seconds per question at p95. A 500-question batch runs as a durable, resumable job in at
  most 30 minutes.
- **Detection accuracy:** recall and precision at least 95% on a golden set of at least 30 real, anonymised
  questionnaires across the supported formats.
- **Retrieval:** the correct source is in the top 3 at least 90% of the time. When no correct source exists, the system
  abstains at least 95% of the time.
- **Calibration:** in the "High" band, at least 90% of drafts are accepted without substantive edit, measured monthly.
- **Availability:** the platform SLO (set in W4). Pilot proposal: 99.5% in business hours.
- **Retention:** frozen packages and their audit trail are kept for the QA-configured period and cannot be deleted
  before it ends.
- **Language:** English first; other languages through the `i18n` package (`localisation_specialist`).

**AI model specification:**
- **Intended use:**
  - detect questions;
  - retrieve effective library answers and evidence passages;
  - draft an answer only from retrieved, approved content.
- **Not intended for:** judging compliance, making commitments, producing figures, or approving.
- **Risk lens:** FDA's 2025 draft guidance on AI for regulatory decision-making. Its scope appears to exclude drafting
  and operational uses (verify); its "model influence × decision consequence" credibility lens is used anyway.
  - Model influence is low: a person approves every answer.
  - Decision consequence is medium: a misstatement can enter a customer's qualification file.
- **Data:**
  - a general model plus retrieval;
  - no fine-tuning on customer data in the first releases;
  - golden sets come from the pilot customer's past questionnaires, used with consent.
- **Metrics:**
  - detection recall and precision at least 95%;
  - retrieval top-3 at least 90%;
  - faithfulness: at least 98% of AI drafts contain no statement unsupported by their citations, judged by two
    reviewers on 200 samples per version;
  - numbers: 100% traceable;
  - correct abstention: at least 95%.
- **Prompt-injection resistance:** request documents are untrusted. Seeded "ignore your instructions" text must
  produce no change in behaviour. The drafting context has no tools that write.
- **Oversight:** AI text is labelled; a named person approves every answer; the AI-versus-final difference is kept.
- **Drift:** watch monthly the acceptance rate without edit, edit distance, abstention rate and reviewer-flagged
  unsupported statements. Alert when flags exceed 0.5% or acceptance falls by 10 points.
- **Change control:** a change to the model, prompt, embedding model or retrieval settings re-runs the evaluation set.
  For Quality-class use, QA approves it before release.

### 7. Fit with GigaLibs

**Reuse:**
- **RESP-2:** the content.
- **Parties (T4, ADR-0020 Party and PartyRole):** customers.
- **Product Catalogue:** services and price lists. Its price resolution with immutable snapshots gives quoted prices
  with a source.
- **CMMS assets:** equipment facts.
- **Geospatial:** sites.
- **Approval Queue (Phase 4, X4) and Workflow Studio:** approval routes.
- **Rule Studio:** class-to-approver rules (it has DMN decision tables and an evaluation audit trail).
- **Communications:** email (N1).
- **Analytics Studio:** dashboards.
- **Control-plane object storage:** files.
- **`audit-core`:** its hash chain, diff and evidence helpers serve the frozen packages.
- **Connector Hub:** outside CRMs and file stores, via webhooks with HMAC verification and polling delta sync.

**The Assistant:**
- **GU1:** the model service.
- **GU4:** confirm before any change.
- **GU5:** grounded answers with citations.
- **The later GU card for questions over documents:** drafting and Q&A over evidence.

**New:**
- the `response-management` module (schema with forced RLS, dictionary windows);
- outbox events: `response.project.submitted`, `response.outcome.recorded`, `response.library.candidate_proposed`.

**Dependencies and decisions:**
- ADR-X2 to ADR-X4;
- e-signature (not deployed; Part 11 gap);
- document scanner (not deployed);
- no CRM in GigaLibs (plan v3 §7D), so opportunities are linked through Connector Hub or recorded on the project.

### 8. Implementation plan

1. **S1 (M): manual projects.**
   - **Scope:** deterministic .xlsx and .docx import with a step to verify the structure; manual answers and
     assignment; class-based approval routes; audit trail; export to the original format.
   - **Evidence:** route and self-approval tests that fail before and pass after; export golden files; a UAT journey.
   - **Validation deliverables:** URS, risk assessment, functional specification, traceability matrix started.
2. **S2 (M): verbatim reuse from the library.**
   - **Scope:** full-text retrieval from RESP-2; insertion with a citation; the deterministic evidence score; blocks on
     expired content.
   - **Evidence:** a retrieval evaluation report and the expiry tests.
3. **S3 (S): frozen package.**
   - **Scope:** hash, retention, outcomes, the dashboard.
   - **Evidence:** a test that recomputes the hash; a retention-lock test.
4. **S4 (L): generative drafting.**
   - **Depends on:** GU1, GU5 and the document GU card.
   - **Scope:** citations, the number guard, abstention, injection tests, the model register.
   - **Evidence:** an evaluation report that meets the thresholds; a red-team report; a model specification approved by
     QA.
5. **S5 (M): more inputs and signing.**
   - **Scope:**
     - text PDF import;
     - scanned PDFs, after the scanner is deployed;
     - signed questionnaires, after the e-signature gap assessment.
   - **Evidence:** the Part 11 assessment.
6. **S6 (M): validated release for the pilot.**
   - **Scope:** customer acceptance on the customer's own questionnaires; supplier documentation pack.
   - **Evidence:** validation summary report; traceability complete; residual risks accepted by the owner and the
     customer's QA.

Total to a validated release: **L**.

### 9. Risks and open questions (for the owner, QA, or named experts)

**Risks:**
- **CDA and the AI provider.** Confidentiality agreements may forbid sending a customer's documents to an outside model
  provider.
  - Each tenant chooses its model provider (including a local model), under a no-retention contract.
  - Legal must confirm.
- **Rubber-stamping.** Reviewers may approve AI drafts without reading them.
  - Watch edit rates.
  - QA samples submitted packages each quarter.
- **Drift from the SOPs.** Quality answers diverge from SOPs when SOPs change, unless RESP-2 links to the source
  versions. There is no eQMS connector today.

**Open questions:**
- **Owner:** which pilot customer?
- **Owner and QA:** which content classes and routes?
- **QA:** is a submitted quality questionnaire a controlled record in your QMS?
- **QA:** does it need a Part 11 signature?
- **Legal:** do external SMEs get guest accounts, or contribute by document only?

### 10. Agents and humans responsible (roster role IDs; new specialist roles you recommend; named human approvers)

**Roster roles:**
- **Lead:** recommend a new `response_management_lead`, a module lead for RESP-1, RESP-2 and RESP-4. Until then,
  `product_office`.
- **Consulted:**
  - `industry_pharma_life_sciences`, `quality_regulatory_specialist`;
  - `documents_lead`, `assistant_product_lead`, `ai_engineering`, `trust_safety_automation`;
  - `workflow_approvals_lead`, `product_pricing_lead`, `maintenance_cmms_lead`, `integrations_lead`;
  - `content_design`, `product_designer`.
- **Build:** `solution_architecture`, `api_contracts`, `backend_domain`, `web_experience`.
- **Prove:** `qa_spec`, `test_automation`.
- **Review:** `security_reviewer`, `privacy_compliance_reviewer`, `licence_ip_reviewer`, `code_reviewer`.

**New specialists:**
- **`csv_csa_validation_specialist`:** GAMP 5, CSA, Part 11 and Annex 11 assessments.
- **`ai_model_validation_specialist`:** evaluation sets, model specifications, drift.
- **`bid_management_specialist`:** proposal-management practice.

**Humans:**
- **The owner:** acceptance and release.
- **The pilot customer's head of QA:** approves the class routes and the validation summary.
- **A named pharma validation expert:** ORGANIZATION.md §7, still to be named.
- **A named legal adviser:** CDA and AI-provider terms.
- **The Security reviewer:** still to be named (plan v3 step 0.7b).

---

## RESP-2: Contextual content library

### 1. Purpose and users

RESP-2 is one governed store of approved, reusable answers and evidence documents. The content covers:
- the quality system;
- certifications;
- regulatory status;
- technical capabilities;
- information-security controls;
- EHS, ESG and corporate facts.

Anyone authorised can search it inside GigaLibs, and later from office-suite add-ins and workplace chat apps. It is the
single source that RESP-1 drafts from and that RESP-3 publishes.

**Users:**
- **Content owners:**
  - the QA document controller;
  - the information-security officer (ISMS owner);
  - regulatory affairs;
  - EHS;
  - business development.
- **Approvers:** QA for the Quality and Regulatory classes.
- **The library administrator.**
- **Every bid manager and SME**, as searchers.

### 2. What the specification asks for (summary, in our words; key requirement IDs if the source has them)

**Surfaces:**
- a browser extension (FR-601);
- office-suite add-ins (FR-602);
- workplace chat apps (FR-603).

**Search and use:**
- A natural-language question returns the top 3 approved answers, each with its score (FR-604).
- One click inserts an answer into the current document (FR-605).
- Results show the answer, score, source document, last approver and date.
- Filters: tag, product, language, recency. Each result can open its full source context.

**Freshness:**
- Answers older than a threshold are flagged "review needed". The default is 90 days.
- The owner is notified.
- A flagged answer cannot be inserted without an override.

**Chat-bot extras:**
- "used this" tracking;
- a request to update a stale answer.

**From the R1 section:**
- semantic search over the approved library;
- an approval log;
- the library updates itself when a project answer is approved.

**Where we deviate:**
- **Review intervals.** The interval is set by content class. One 90-day default for everything is replaced.
- **Expiry triggers.** Expiry is also triggered by events, not only by age:
  - a certificate's expiry date passes;
  - a source document is superseded.
- **Overrides.** Quality-class content has no override; only re-approval.
- **No automatic updates.** Project answers become candidates and are never written to the library directly.
- **External surfaces** come later, and each one passes its own security review.
- **CDMO-owned content only.** The library holds only the CDMO's own content. A CDMO serves competing customers, so one
  customer's confidential information must never become reusable content.

### 3. GxP impact and validation approach

**Classification: GxP-adjacent.**
- Entries are approved extracts of GxP documents of record:
  - SOPs;
  - the site master file;
  - GMP certificates;
  - validation summaries.
- The library is **not** the document system of record. The eQMS or document management system stays the master, and
  each entry links to the master's version.
- An error spreads into customers' qualification files. That is why the library needs document-control discipline
  modelled on EU GMP Part I Chapter 4:
  - approved;
  - reviewed;
  - current;
  - superseded versions withdrawn from use.
- No batch, release or quality decision uses it.

**GAMP 5: category 4.**
- The only AI is retrieval ranking, which is assistive.
- The library generates nothing; generation lives in RESP-1.

**Assurance:**
- **Scripted:**
  - the lifecycle state machine: Draft → In review → Effective → Under review → Obsolete;
  - non-effective versions never appear to searchers;
  - the expiry and supersession jobs;
  - no self-approval;
  - access by confidentiality tier;
  - where-used.
- **Exploratory:** search relevance and the authoring experience.
- **Evidence:** a retrieval evaluation report for each index or model change.

**Part 11, Annex 11 and ALCOA+:**
- **Approvals** are attributable records: user, date and time, and the meaning "approved for external use". There is a
  full version history.
- **Signatures:**
  - **Recommended:** QA's approval of Quality-class entries becomes an electronic signature with a meaning, once
    e-signature is fit for GxP use.
  - **Until then:** it is an audited action by an authenticated user, and is not presented as a Part 11 signature.
- **Superseded versions are never deleted**, so any past submission can be reproduced (ALCOA+: enduring and available;
  PIC/S PI 041).

### 4. Industry process it must follow (do not deviate)

Document control follows EU GMP Chapter 4 and ICH Q10's knowledge-management enabler. The information-security content
follows the ISO/IEC 27001 management system. The steps:
1. **Author.**
2. **SME review.**
3. **Approval:** the content owner, plus QA for GMP statements.
4. **Effective date.**
5. **Periodic review** at the class interval. The outcome is to reconfirm, revise or retire.
6. **Change triggered by the source.** When the master SOP, certificate or site master file changes through change
   control, the linked entries go to review.
7. **Withdrawal** of superseded versions.
8. **Controlled distribution** by confidentiality tier:
   - public;
   - shared under a CDA;
   - internal only.

**Decision points:**
- the class and tier of each entry;
- the periodic-review outcome;
- whether a RESP-1 candidate is generic enough and free of customer-confidential content. The content owner decides.

### 5. Domain model (key entities and relationships)

- **`LibraryAnswer`** (stable identity):
  - question variants;
  - content class (Quality/GMP, Regulatory, EHS, InfoSec, Commercial, Legal, Corporate/ESG);
  - confidentiality tier and tags;
  - Product Catalogue services;
  - Geospatial sites;
  - language.
- **`LibraryAnswerVersion`**, many per answer:
  - text and status;
  - effective-from date, review-due date and expiry date;
  - owner and approver(s);
  - approval timestamp and meaning;
  - reason for change.
- **`SourceReference`**, many per version. It points to one of:
  - an `EvidenceDocumentVersion` with page or section;
  - a GigaLibs record (a CMMS asset, a Catalogue service).
- **`EvidenceDocument` → `EvidenceDocumentVersion`:**
  - QMS document number and version;
  - file key and SHA-256;
  - validity dates (for example, a certificate's expiry);
  - issuing body;
  - tier.
- **`UsageRecord`:** which version went into which project, package or add-in insertion.
- **`ReviewTask`** and **`LibraryCandidate`**.

### 6. Specification set to write (spec-driven)

**URS highlights:**
- **RESP-2-URS-001:** Only Effective versions can be used in responses. Draft, Under review, Expired and Obsolete
  versions are visible only to content owners and approvers.
- **RESP-2-URS-002:** Every version has:
  - a named owner;
  - an approver who is not the author;
  - an effective date;
  - a review-due date set by its class.
- **RESP-2-URS-003:** Within 1 hour of a linked evidence document expiring or being superseded, its dependent versions
  move to Under review, and the owner is notified.
- **RESP-2-URS-004:** Versions are never deleted. Every past version is retrievable with its approval record.
- **RESP-2-URS-005:** Search returns at most N candidates (default 3). Each shows its source, approver, approval date,
  review status and evidence-score components.
- **RESP-2-URS-006:** The confidentiality tier limits who can see an entry and which channels may expose it.
- **RESP-2-URS-007:** Library candidates enter as Draft and follow the same approval. A candidate whose source is a
  customer's request content is rejected unless the content owner records that it holds no customer-confidential
  information.
- **RESP-2-URS-008:** Search respects tenant RLS, unit and site scope, and tier. An entry the user may not see is "not
  found", and nothing about it leaks (as GU5 requires).
- **RESP-2-URS-009:** Every use of a version is recorded, so "where did we say this?" can be answered.

**Key functional requirements (Given/When/Then):**

1. **Certificate expiry:**
   - Given an ISO 9001 certificate valid to a date and linked to answer A,
   - When the date passes,
   - Then A moves to Under review and is excluded from drafting, its owner is notified, and open RESP-1 projects that
     use A are flagged.
2. **Supersession:**
   - Given SOP version 7 is the linked source,
   - When version 8 is registered, by hand or through a connector,
   - Then the linked answers move to Under review.
3. **Where used:**
   - Given version v3 is withdrawn because it was wrong,
   - When QA runs "where used",
   - Then every submitted package containing v3 is listed with customer and date, so a correcting communication can be
     prepared.
4. **Override:**
   - Given a Commercial answer is past its review date,
   - When a user with the override right inserts it,
   - Then a reason is required and logged.
   - For a Quality answer, override is unavailable.
5. **No self-approval:**
   - Given user A wrote version v2,
   - When A approves it,
   - Then the approval is refused.
6. **Tier leak:**
   - Given a user without the "CDA" tier,
   - When they search for the audit-report summary,
   - Then the result is "not found", with no title or count.
7. **Candidate screening:**
   - Given a RESP-1 candidate that mentions the customer's product code,
   - When the owner reviews it,
   - Then it cannot be approved until the owner either confirms it is free of confidential content or edits it.

**Non-functional requirements:**
- **Search:** at most 1.5 seconds at p95 over 20,000 versions.
- **Expiry and supersession:** applied within 1 hour.
- **Retention:** every version and its approval record is kept for the life of the tenant, and is included in tenant
  export (data portability).
- **Retrieval evaluation:** the correct entry is in the top 3 at least 90% of the time on a labelled set of at least
  300 questions.
- **Availability:** the platform SLO.

**AI model specification (retrieval only):**
- **Intended use:** rank Effective entries for a question.
- **First slice:** PostgreSQL full-text search, which is deterministic and involves no model.
- **Semantic slice:**
  - an embedding model reached through the Assistant's AI abstraction;
  - metrics: top-3 recall at least 90%, mean reciprocal rank reported;
  - drift: monitor the "no candidate chosen" rate;
  - change control: changing the embedding model triggers a re-index and a re-run of the evaluation before release.
- **It never generates text.**

### 7. Fit with GigaLibs

**Reuse:**
- **Metadata windows** for authoring and administration (ADR-0033).
- **Product Catalogue** (services) and **Geospatial** (sites), for tagging.
- **CMMS assets**, as record sources.
- **Control-plane object storage**, for files.
- **`audit-core`.**
- **Approval Queue** (X4).
- **Rule Studio**, for review intervals per class (or plain metadata).
- **Communications**, for review notices.
- **Connector Hub's** polling delta sync, to learn of new versions in a customer's eQMS. No eQMS connector exists; one
  is customer-specific work.
- **Assistant GU2:** a "search library" tool, generated from the dictionary.

**New:**
- the library sub-domain of `response-management`;
- outbox events: `response.library.version_effective`, `response.library.version_withdrawn`.

**Decisions:**
- ADR-X2 (retrieval);
- ADR-X3 (storage);
- how to link to the eQMS (connector, or manual registration);
- whether office-suite add-ins and chat apps are wanted at all. Each is a new client with its own authentication and
  security review.

### 8. Implementation plan

1. **S1 (M): library core.**
   - **Scope:**
     - answers and versions with their lifecycle;
     - class rules and approval;
     - evidence documents with validity dates;
     - full-text search;
     - windows and access rows.
   - **Evidence:** lifecycle and tier tests that fail before and pass after; a UAT journey.
   - **Validation deliverables:** URS, risk assessment.
2. **S2 (S): expiry and change.**
   - **Scope:** expiry and supersession jobs, notifications, where-used.
   - **Evidence:** time-travel tests on the jobs.
3. **S3 (M): semantic retrieval.**
   - **Scope:** semantic retrieval after ADR-X2, plus an evaluation harness.
   - **Evidence:** an evaluation report that meets the threshold.
4. **S4 (M): one eQMS or document-system connector** for the pilot customer.
   - **Evidence:** a reconciliation test between the two systems' versions.
5. **S5 (L, optional): office-suite add-in and chat-app surfaces.**
   - **Evidence:** a security review and a penetration test for each surface.
6. **S6 (S): validation summary for the pilot.**

Total: **L**. The useful core (S1 and S2) is **M**.

### 9. Risks and open questions (for the owner, QA, or named experts)

**Risks:**
- **A shadow document system.** The library drifts from the eQMS without the source link. Mitigations:
  - make source references mandatory for the Quality class;
  - review periodically.
- **Review burden.** Owners stop doing periodic reviews.
  - Set realistic intervals per class.
  - Report overdue reviews.
- **Leakage through future add-ins.**

**Open questions:**
- **QA:** the review interval for each class, in place of the source's single 90 days.
- **QA:** is library approval a GxP signature?
- **QA:** who owns the entries about inspection history?
- **Owner:** are the add-ins in scope at all?

### 10. Agents and humans responsible (roster role IDs; new specialist roles you recommend; named human approvers)

**Roster roles:**
- **Lead:** `documents_lead`, with the proposed `response_management_lead`.
- **Consulted:**
  - `quality_regulatory_specialist`, `industry_pharma_life_sciences`;
  - `content_design`;
  - `integrations_lead`, `integration_connectors`;
  - `data_portability`, `ai_engineering`;
  - `metadata_studio_lead`.
- **Prove:** `qa_spec`.
- **Review:** `security_reviewer`, `privacy_compliance_reviewer`, `licence_ip_reviewer`.

**New specialist:** the `csv_csa_validation_specialist`, shared across the family.

**Humans:**
- the customer's QA document-control manager;
- the ISMS owner, for InfoSec content;
- the owner.

---

## RESP-3: Trust centre (self-serve security and compliance portal)

### 1. Purpose and users

RESP-3 is a portal facing the CDMO's customers. It exposes approved, current evidence so that pharma customers'
supplier-qualification teams can serve themselves:
- quality and regulatory evidence;
- information-security evidence;
- ESG evidence.

Customers request documents gated by a confidentiality agreement, and the CDMO knows exactly who accessed which
version.

**Content for a CDMO:**
- **GMP status:**
  - GMP certificates, with links to the authorities' public registers where these exist (for example, the EU's GMP
    certificate database);
  - a summary of inspection history.
- **Quality documents:**
  - the site master file (PIC/S explanatory notes on site master files, PE 008; verify the edition);
  - the quality policy;
  - the standard quality-agreement template;
  - the change-notification policy;
  - a data-integrity statement.
- **Certificates and reports:**
  - ISO 9001, 14001 and 45001 certificates;
  - the ISO/IEC 27001 certificate and SOC 2 report, if held.
- **Supply and continuity:**
  - the list of subcontractors and subprocessors;
  - a business-continuity summary.
- **Under a CDA:** third-party audit reports, subject to the right to share them.

**Users:**
- **External:**
  - customer QA and supplier-quality staff;
  - procurement;
  - information-security assessors;
  - auditors preparing a visit.
- **Internal:**
  - the trust-centre administrator;
  - content owners;
  - BD, who approve access;
  - legal, for CDAs.

**Dogfooding.** GigaLibs could run its own trust centre for the supplier assessments its pharma customers must do under
Annex 11 §3:
- SDLC and test evidence;
- Security review records.

It would claim no certification GigaLibs does not hold (the owner to confirm).

### 2. What the specification asks for (summary, in our words; key requirement IDs if the source has them)

**Requirements:**
- A branded portal with a custom domain (FR-701).
- A public section of certifications and a compliance matrix (FR-702).
- An NDA-gated section of reports, penetration-test summaries and policies (FR-703).
- Access requests, either approved automatically or sent to sales (FR-704).
- Tracking of who downloaded which document, and when (FR-705).

**Also asked for:**
- syncing access events to a CRM;
- alerting sales when a prospect views documents;
- linking from response projects for standard questions.

**Where we deviate:**
- **Automatic approval** is allowed only when both hold:
  - a CDA is on record for the requester's organisation, valid and covering that tier;
  - the requester's email domain has been verified for that organisation.
- **Gated downloads** are watermarked per viewer.
- **Audit reports** can be set to view only.
- **Availability follows RESP-2.** Items disappear when their source expires.
- **"Buying signal" alerts** about named individuals are off by default, need a privacy notice and are subject to the
  privacy specialist's review (GDPR).

### 3. GxP impact and validation approach

**Classification: GxP-adjacent.**
- The documents are copies of controlled GxP documents, and they support customers' qualification decisions (ICH Q10
  §2.7; EU GMP Chapter 7).
- The CDMO takes no GMP decision in the portal.
- Showing an expired certificate or a superseded site master file would misrepresent the CDMO's status.
- The customer files a downloaded document in its own QMS. The portal therefore shows the identity of each document:
  - number;
  - version;
  - effective and validity dates;
  - SHA-256.

  This lets the customer record exactly what it relied on (ALCOA+: attributable and original).

**GAMP 5: category 4. No AI in the first releases.**
- An Assistant chat for external visitors is deferred.
- If it is ever built, it answers only with verbatim published content and its citations, under its own threat model.

**Assurance:**
- **Scripted:**
  - only Effective, unexpired items are shown;
  - tier gating;
  - the CDA check;
  - the access log is complete;
  - the watermark identifies the viewer;
  - grants expire and can be revoked;
  - external users cannot cross tenants.
- **External penetration test** before go-live, by `security_engineering`, with independent review by
  `security_reviewer`.
- **Exploratory:** the external user journey on phones and desktops.

**Part 11, Annex 11 and ALCOA+:**
- The portal is not a GxP record system.
- The **access log** is treated as a quality-relevant record: attributable, contemporaneous, append-only and retained.
- External access needs a documented security concept (Annex 11 §12).
- **CDA signing:** legal decides whether a click-through CDA is acceptable, or a signed agreement is required. A signed
  one would come from GigaLibs e-signature, which is not deployed.

### 4. Industry process it must follow (do not deviate)

**The buyer's supplier-qualification process**, which the portal serves (ICH Q10 §2.7; EU GMP Chapter 7; ICH Q7 §7 and
§16; EU GMP Chapter 5 on starting-material suppliers, verify the paragraphs):
1. Desktop assessment: questionnaire, certificates, site master file.
2. A risk-based decision to audit: on site, remote or shared (ICH Q9(R1)).
3. The audit.
4. A quality agreement before GMP work starts (FDA guidance, 2016; EU GMP Chapter 7).
5. Approval onto the approved supplier list by the buyer's quality unit.
6. Ongoing monitoring and requalification.

The portal serves steps 1, 2 and 6, and helps prepare step 3.

**The CDMO's own controls:**
- a CDA before anything confidential is released;
- legal and QA approve what is published;
- the rights to share third-party audit reports are checked;
- periodic review.

**Decision points:**
- grant access: who, which tier, for how long;
- revoke access;
- publish or withdraw an item.

### 5. Domain model (key entities and relationships)

- **`TrustCentre`:** branding, domain, published state.
- **`Section`:** public, registered or gated.
- **`PublishedItem`:** a reference to a RESP-2 `EvidenceDocumentVersion` or `LibraryAnswerVersion`, never a separate
  copy, plus its rendition rules (download, or view only).
- **`ExternalOrganisation`:** a Party with the role CUSTOMER or PROSPECT, and its verified domains.
- **`ExternalUser`:** identity, organisation, MFA status.
- **`ConfidentialityAgreement`:** party, effective and expiry dates, covered tiers, signed-document reference.
- **`AccessRequest`:** requester, items or tier, justification, decision, approver.
- **`AccessGrant`:** organisation or user, tier, valid until, revoked when.
- **`AccessEvent`** (append-only):
  - type: view, download or denied;
  - item version;
  - user and organisation;
  - timestamp and IP address;
  - watermark ID.

### 6. Specification set to write (spec-driven)

**URS highlights:**
- **RESP-3-URS-001:** The portal shows only items whose source version is Effective and unexpired. An item becomes
  unavailable within 1 hour of its source expiring or being superseded.
- **RESP-3-URS-002:** A gated item is accessible only to an authenticated, MFA-verified external user who meets both
  conditions:
  - their organisation has a current CDA covering the item's tier;
  - they hold a current grant.
- **RESP-3-URS-003:** Every view, download and refused attempt is logged with user, organisation, item version and
  time. The log is append-only and kept for the configured period.
- **RESP-3-URS-004:** Gated downloads carry a visible watermark naming the user, organisation and time. Audit reports
  can be set to view only.
- **RESP-3-URS-005:** Each item shows its document number, version, effective and validity dates, and SHA-256.
- **RESP-3-URS-006:** Grants expire after a configurable time set per tier, and can be revoked at once.
- **RESP-3-URS-007:** An external user sees only the trust centre of the tenant that granted them access. They never
  see internal GigaLibs data or another tenant's data.
- **RESP-3-URS-008:** Publishing an item needs its content owner's approval, plus QA's for the Quality class.
- **RESP-3-URS-009:** Visitors are told what is logged and why. Alerts to sales about named viewers are off by default.

**Key functional requirements (Given/When/Then):**

1. **Expiry:**
   - Given the GMP certificate item's validity ends today,
   - When the expiry job runs,
   - Then the item is withdrawn from the public section, the owner is notified, and the page shows "renewal in
     progress" only if the owner chooses to.
2. **Automatic approval:**
   - Given organisation O has a CDA valid to next year that covers "Quality confidential",
   - When user u, from O's verified domain, requests the site master file,
   - Then access is granted for the tier's period.
   - Without a CDA, the request goes to the named approver, who sees the requester's identity and organisation.
3. **Revocation:**
   - Given a grant is revoked,
   - When the user opens an earlier link,
   - Then access is refused, and the refusal is logged.
4. **Watermark:**
   - Given user u downloads the audit report,
   - When the file opens,
   - Then every page carries u's name, organisation, date and time, and a watermark ID that matches the log.
5. **Audit query:**
   - Given QA asks who accessed the 2025 audit report,
   - Then a list of users, organisations, versions and times is exported.
6. **Isolation:**
   - Given external users of tenants A and B,
   - When A's user calls any of B's portal or internal API,
   - Then the call is refused. Automated cross-tenant tests prove it.
7. **Link from RESP-1:**
   - Given a questionnaire question matches a published item,
   - Then the answer can cite the trust-centre item and its tier instead of attaching a file.

**Non-functional requirements:**
- **Page load:** at most 2 seconds at p95.
- **Files:** up to 100 MB, scanned for malware on upload.
- **MFA:** required for gated tiers.
- **Rate limiting:** on requests and downloads.
- **Custom domains:** with managed TLS.
- **Access-log retention:** set by legal and QA. Proposal: at least the CDA's term plus the CDMO's record-retention
  period (verify with legal).
- **Availability:** 99.5% (proposal).

**AI model specification:** none in scope.

### 7. Fit with GigaLibs

**Reuse:**
- **RESP-2:** all the content.
- **Parties (T4):** organisations.
- **Control-plane object storage:** presigned downloads with SHA-256.
- **`audit-core`:** the hash chain for the access log.
- **Communications:** email.
- **Connector Hub:** sending access events to an outside CRM by webhook.
- **Analytics Studio:** access statistics.
- **e-signature:** CDAs, once deployed and assessed.

**New:**
- the `trust-centre` module;
- a public web surface outside the signed-in app;
- custom domains;
- a service that stamps PDFs. An open-source library is acceptable after licence review (`licence_ip_reviewer`).

**Main dependency:** ADR-X1, external party identity. The platform has none today. It is a kernel-level change that
needs:
- a threat model;
- a privacy review;
- an independent Security review.

### 8. Implementation plan

1. **S1 (M): public section only.**
   - **Scope:**
     - publish Effective RESP-2 items;
     - automatic withdrawal on expiry;
     - document identity and hash;
     - publication approval.
   - **Evidence:** expiry and publication tests; a UAT journey.
   - **Validation deliverables:** URS, risk assessment.
2. **S2 (L): external identity and the gated tier.**
   - **Scope:**
     - ADR-X1 written and built;
     - verified domains and MFA;
     - the CDA register;
     - requests, grants and the access log.
   - **Evidence:**
     - isolation tests;
     - a penetration-test report;
     - Security and Privacy reviews before deploy.
3. **S3 (S): watermarking and view-only mode.**
   - **Evidence:** watermark tests that match the log.
4. **S4 (S): CDA signing**, after the e-signature gap assessment and legal's decision.
5. **S5 (S): CRM webhook and analytics.**
6. **S6 (S): validation summary.**

Total: **L**.

### 9. Risks and open questions (for the owner, QA, or named experts)

**Risks:**
- **The external attack surface** is new to GigaLibs.
- **Third-party audit reports** often restrict redistribution. Legal must check the rights for each report.
- **Is a click-through CDA enough?**
- **GDPR** for tracking named individuals.
- **Customers might treat the portal as the primary source of GMP status.** Show links to the public registers.

**Open questions:**
- **Owner:** should GigaLibs run its own trust centre as the first tenant?
- **Legal:** the CDA model.
- **QA:** the retention of the access log.

### 10. Agents and humans responsible (roster role IDs; new specialist roles you recommend; named human approvers)

**Roster roles:**
- **Lead:** `documents_lead`, until a new `trust_centre_lead` is justified.
- **Identity:** `tenant_identity_access`.
- **Security:** `security_engineering` builds the threat model and runs the penetration test; `security_reviewer`
  reviews independently.
- **Privacy:** `privacy_specialist`, with `privacy_compliance_reviewer` reviewing.
- **Domain:** `quality_regulatory_specialist`, `industry_pharma_life_sciences`.
- **Design:** `design_lead`, `product_designer`, `service_design`, `accessibility_design`.
- **Build:** `backend_domain`, `web_experience`.
- **Prove:** `qa_spec`.
- **Review:** `licence_ip_reviewer`.

**New specialist:** `infosec_assurance_specialist`, for ISO/IEC 27001 and SOC 2 evidence and security questionnaires.

**Humans:**
- **A named legal adviser:** CDA and sharing rights.
- **The data-protection officer.**
- **The customer's head of QA and ISMS owner:** publication.
- **The owner:** release.

---

## RESP-4: Bid go/no-go requirements analysis

### 1. Purpose and users

RESP-4 helps decide early, and on the record, whether to bid on a customer's RFP:
1. extract the requirements;
2. compare them with the CDMO's capability profile;
3. list the gaps and deal-breakers;
4. recommend bid or no-bid with a traceable rationale.

A named bid board decides.

**Users:**
- the BD lead and bid manager;
- technical operations and MSAT (manufacturing science and technology);
- QA and regulatory affairs;
- finance (margin);
- the site head (capacity).

### 2. What the specification asks for (summary, in our words; key requirement IDs if the source has them)

**Requirements:**
- **FR-801:** an agent that reads the whole RFP and extracts its requirements, evaluation criteria, must-haves and
  deal-breakers.
- **FR-802:** a win probability from 0 to 100, based on the requirements and the company's capability profile.
- **FR-803:** an analysis of the requirements that cannot be met.
- **FR-804:** a bid/no-bid recommendation with a rationale.

**Scoring logic:**
- a profile of capabilities, certifications and past wins;
- requirements as structured tags;
- the percentage of hard requirements met;
- a machine-learning win probability trained on past outcomes.

**Where we deviate:**
- **Fit before prediction.** A deterministic fit score comes first.
- **Win probability only with enough history.** It is shown only when there is enough labelled history and the model is
  calibrated. Otherwise the system says "not computed", with the reason.
- **Competitive intelligence** is limited to lawful, public information (see section 9).

### 3. GxP impact and validation approach

**Classification: non-GxP.**
- Whether to pursue business is a commercial decision; no GMP record or quality decision is made.
- **Limit:** a "go" may rest on technical feasibility, for example containment for a highly potent API. The real
  assessment comes later, in GxP systems:
  - quality risk management (ICH Q9(R1));
  - technology transfer under ICH Q10.
- RESP-4 must never be cited as a GMP feasibility or risk assessment, and the screen says so.

**GAMP 5:** not applicable.
- Good IT practice is enough.
- Scripted tests cover only the fit-rule engine and the "not computed" behaviour.
- Everything else is tested by exploration.

**AI:**
- **Requirement extraction** (a language model): assistive, verified by a person.
- **Win-probability model:** non-GxP, but it still gets a model specification for transparency and to prevent
  misleading use.

**Part 11:** not applicable. Bid decisions keep the platform's standard audit trail for business governance.

### 4. Industry process it must follow (do not deviate)

The bid/no-bid gate follows proposal-management practice. It is a qualification gate before resources are committed.
1. Receive the RFP.
2. Extract its requirements.
3. Build the compliance matrix.
4. Assess fit on:
   - **strategic fit;**
   - **technical capability:**
     - chemistry and technology;
     - scale and equipment train;
     - containment band for each suite;
     - analytical methods;
   - **regulatory and quality:**
     - each site's inspection status for the target markets;
     - the regulatory support needed, such as a US Drug Master File, an EU ASMF or an EDQM certificate of suitability
       (CEP);
     - controlled-substance licences;
   - **capacity windows;**
   - **commercial:** price position and margin;
   - **risk:** new technology, customer credit.
5. The bid board decides.
6. Record the rationale.
7. After award or loss, record the outcome (RESP-1).

Containment banding (occupational exposure bands and limits) is industry practice rather than a single standard. Cite
the CDMO's own procedure.

### 5. Domain model (key entities and relationships)

- **`BidAssessment`:** a RESP-1 project, the customer Party, services, due date.
- **`RequirementItem`:**
  - text and source location;
  - category: technical, quality, regulatory, commercial, legal or EHS;
  - type: must, should or information;
  - stated weight;
  - extracted by AI or by a person;
  - verified by whom.
- **`CapabilityProfile`** (versioned), made of `CapabilityItem`s:
  - technology;
  - scale range, from CMMS assets: reactor volumes and materials of construction;
  - containment band per suite or site;
  - certifications and inspection status, from RESP-2 evidence;
  - licences;
  - analytical techniques.
- **`CapabilityMatch`:**
  - requirement → capability items;
  - status: met, partly met, not met or unknown;
  - evidence;
  - assessed by.
- **`FitScore`:** rule-set version and components.
- **`WinProbability`:** model version, plus either a value with its calibration, or "not computed: reason".
- **`BidDecision`:** go, no-go or conditional; rationale; board members; date.

### 6. Specification set to write (spec-driven)

**URS highlights:**
- **RESP-4-URS-001:** Extracted requirements show their source location, and a named person verifies them before
  scoring.
- **RESP-4-URS-002:** Each must-have is matched to capability evidence or marked "unknown". Unknown never counts as met.
- **RESP-4-URS-003:** The fit score comes from a versioned, configurable rule set, and shows how each component
  contributed.
- **RESP-4-URS-004:** A win probability appears only when both hold:
  - a model meets its calibration threshold;
  - there are at least the minimum number of labelled outcomes.

  Otherwise the system shows "not computed", with the reason.
- **RESP-4-URS-005:** The recommendation lists the deal-breakers and gaps that drove it.
- **RESP-4-URS-006:** Named decision-makers record the decision, with a rationale. The system never decides.
- **RESP-4-URS-007:** Capability facts come from cited records and show how old they are.
- **RESP-4-URS-008:** Assessments are visible only to the project team, within scope.

**Key functional requirements (Given/When/Then):**

1. **Deal-breaker:**
   - Given the RFP requires a containment band the profile does not reach,
   - Then a deal-breaker is listed with its evidence, and the recommendation is "no-go unless investment approved".
2. **Unknown:**
   - Given two must-haves are unknown,
   - Then the recommendation is "insufficient information", never "go".
3. **Not computed:**
   - Given 12 labelled outcomes against a configured minimum of 50,
   - Then the screen shows "Win probability: not computed (12 outcomes; at least 50 needed)".
4. **Rule versions:**
   - Given the rule set changes from v1 to v2,
   - Then past assessments keep their v1 scores, labelled v1.
5. **Facts from CMMS:**
   - Given the CMMS asset register lists the reactors,
   - Then "maximum reactor volume" is derived from the asset records and cites them.
   - Data not updated within the configured period is flagged as stale.
6. **Verification gate:**
   - Given AI-extracted requirements,
   - When nobody has verified them,
   - Then the fit score is not computed.

**Non-functional requirements:**
- **Extraction:** at most 3 minutes at p95 for a 100-page RFP. Must-have recall at least 90% on a labelled set, with
  verification by a person still mandatory.
- **Fit computation:** at most 2 seconds.
- **Retention:** assessments are kept for as long as the opportunity record.

**AI model specification:**
- **(a) Extraction:**
  - intended use: list requirement candidates with their locations;
  - metric: must-have recall at least 90% and precision at least 85%;
  - oversight: verification by a person is mandatory;
  - change control: re-run the evaluation.
- **(b) Win probability:**
  - **Model:** an interpretable model, such as logistic regression on fit components and deal attributes.
  - **Training data:** the tenant's own outcomes only. No pooling across tenants without consent.
  - **Minimum data:** at least 50 outcomes, including at least 15 wins and at least 15 losses (proposal).
  - **Thresholds:**
    - Brier score at least 10% better than the base-rate forecast on a time-split hold-out set;
    - calibration error of at most 0.10 per decile.
  - **Drift:** recalibrate each quarter.
  - **Model card:** approved by the owner.
  - **Data scientist:** to confirm these numbers.

### 7. Fit with GigaLibs

**Reuse:**
- **RESP-1:** imports and outcomes.
- **RESP-2:** evidence.
- **CMMS assets:** equipment facts.
- **Geospatial:** sites and suites.
- **Product Catalogue:** services.
- **Rule Studio:** fit rules as DMN decision tables. It has no service of its own yet (Phase 6).
- **Analytics Studio:** win/loss analysis.
- **The Assistant:** "why no-go?", grounded in the assessment.

**Gaps:**
- **Capacity windows:** GigaLibs has no production schedule, so these are a person's input, or come from another
  family's planning engine.
- **CRM:** there is none.

**No Python runtime** unless a richer model is later wanted.

### 8. Implementation plan

1. **S1 (M): manual assessment.**
   - **Scope:**
     - manual requirement list;
     - capability profile;
     - rule-based fit;
     - decision record.
   - **Evidence:** rule-engine tests; a UAT journey.
2. **S2 (S): capability facts.**
   - **Scope:** facts from CMMS and RESP-2, with flags for stale data.
3. **S3 (M): AI extraction.**
   - **Scope:** AI extraction, with verification by a person.
   - **Depends on:** RESP-1 S4.
   - **Evidence:** an extraction evaluation report.
4. **S4 (L, conditional): the win-probability model.**
   - **Condition:** only once the data threshold is met.
   - **Evidence:** a model card and a calibration report.

Validation: light (non-GxP). Test evidence, plus the model card.

### 9. Risks and open questions (for the owner, QA, or named experts)

**Risks:**
- **Competition law.** Collecting or exchanging competitors' sensitive information is restricted. Legal must define
  what "competitive intelligence" may contain.
- **Probabilities from small data.** Few outcomes produce false precision.
- **A stale capability profile.**
- **Over-promising feasibility.** A bid that claims more than the CDMO can do leads to a failed technology transfer.

**Open questions:**
- **Owner:** is RESP-4 worth building before RESP-1 has a year of outcomes?

### 10. Agents and humans responsible (roster role IDs; new specialist roles you recommend; named human approvers)

**Roster roles:**
- **Lead:** the proposed `response_management_lead`. `crm_revenue_lead` if the CRM module is approved.
- **Consulted:**
  - `industry_pharma_life_sciences`;
  - `maintenance_cmms_lead`, for asset facts;
  - `supply_chain_planning_specialist`, for capacity;
  - `workflow_approvals_lead`;
  - `analytics_reporting_lead`, `data_visualisation_design`.
- **AI:** `ai_engineering`.
- **Prove:** `qa_spec`.

**New specialists:**
- `ai_model_validation_specialist`;
- `bid_management_specialist`.

**Humans:**
- **The head of BD and the site head:** the bid board.
- **The head of QA:** quality feasibility.
- **Legal:** competition law.

---

## RESP-5: Buyer-side request issuance (issuing RFPs to suppliers)

### 1. Purpose and users

RESP-5 lets a pharma company, or a CDMO buying materials and services, run a sourcing event with suppliers:
1. issue an RFI, RFP or RFQ;
2. collect structured responses through a supplier portal;
3. compare and score them with weighted rubrics and an audit trail;
4. award.

The suppliers can be CDMOs, API makers, excipient and packaging suppliers, contract laboratories and service providers.

**The GMP rule:** for GMP-relevant supply, RESP-5 enforces that an award goes only to a supplier the quality unit has
qualified, or is qualifying.

**Users:**
- **The category manager or buyer:** runs the event.
- **Evaluators:** technical, quality, regulatory and finance.
- **Supplier quality (QA).**
- **Regulatory affairs.**
- **The award approver**, under the delegation of authority.
- **Supplier contacts** (external).

### 2. What the specification asks for (summary, in our words; key requirement IDs if the source has them)

**Requirements:**
- **FR-901:** create and send an RFP from a template library.
- **FR-902:** a vendor portal where suppliers submit in a structured format. Suppliers arrive by invitation link with no
  login. Progress saves automatically, and the buyer can switch on AI help for suppliers.
- **FR-903:** an automated comparison matrix.
- **FR-904:** weighted scoring rubrics per section.
- **FR-905:** an audit trail of who scored, when, and why.

**Where we deviate:**
- **No-login links** are replaced by authenticated supplier users (ADR-X1, shared with RESP-3).
- **Responses are sealed** until the deadline.
- **Evaluators score independently** before any consensus, and declare conflicts of interest first.
- **AI never scores.**
- **Supplier-side AI** is out of scope.
- **The qualification gate** is added (section 4).

### 3. GxP impact and validation approach

**Classification: split.**
- **Non-GxP:**
  - the sourcing event;
  - commercial evaluation;
  - the award recommendation.
- **GxP-adjacent:** the quality questionnaire and quality evaluation inside an event. They feed qualification.
- **GxP, held in the supplier-quality record and not in RESP-5:**
  - the qualification decision;
  - audits;
  - the approved supplier list;
  - quality agreements;
  - change notifications.

  The sources are ICH Q7 §7 (materials bought from suppliers approved by the quality unit) and §16; ICH Q10 §2.7; EU
  GMP Chapter 7; and 21 CFR 211.22 and 211.84. 211.84 allows reliance on a supplier's certificate of analysis only with
  an identity test and periodic verification of the supplier's results (verify the wording).
- **GxP control point in Procurement:** with the GMP flag on, a purchase order for a GMP material or service is blocked
  unless the supplier, site and material are approved.
- RESP-5 **reads** approval status and **raises** qualification requests. It never sets qualification status.

**GAMP 5:**
- category 4 for the gate and the PO block, with scripted tests;
- good IT practice for the rest of the event.

**Assurance:**
- **Scripted:**
  - sealing;
  - deadline enforcement;
  - independent scoring;
  - blocks on conflicts of interest;
  - weighted-score arithmetic (property tests);
  - the qualification gate;
  - the PO block.
- **Exploratory:** the supplier portal.

**ALCOA+:**
- **Scores are attributable:** evaluator, time and justification. They are locked on submission, and a change needs a
  reason.
- **Supplier submissions** are frozen with a timestamp and SHA-256 at the deadline.
- **The quality evaluation** has a full audit trail.

### 4. Industry process it must follow (do not deviate)

1. **Define the need.**
   - For GMP items, QA and regulatory affairs take part.
   - They set specifications and quality requirements.
   - They set the regulatory prerequisites, for example a DMF, ASMF or CEP, and the site's GMP status.
2. **RFI and market scan.**
3. **Quality pre-screen** by QA: GMP status and inspection history. This is pass or fail.
4. **Issue the RFP or RFQ**, including:
   - the quality questionnaire;
   - the draft quality-agreement terms.
5. **Clarifications.** Answers go to all bidders.
6. **Sealed receipt** at the deadline.
7. **Independent scoring**, after conflict-of-interest declarations, then consensus.
8. **Qualification** of the preferred supplier:
   - desktop assessment;
   - a risk-based audit (ICH Q9(R1));
   - a quality agreement before GMP work (EU GMP Chapter 7; FDA guidance, 2016).
9. **Award approval** under the delegation of authority.
10. **Contract, quality agreement and purchase order.**
11. **Performance monitoring, change notifications and requalification.**

**Pharma-specific constraint.** A new source for a registered material requires change control and a regulatory change
(a variation, or a supplement in the US) before use. An API named in a marketing authorisation is an example. The award
must show "regulatory change required", and regulatory affairs must acknowledge it.

**Decision points:**
- the shortlist;
- the QA pre-screen;
- the award.

**QA's disapproval cannot be overruled by the business.** This is the independence of the quality unit.

### 5. Domain model (key entities and relationships)

- **`SourcingEvent`:**
  - type: RFI, RFP or RFQ;
  - category;
  - GMP flag;
  - materials and services (Product Catalogue references);
  - sites;
  - timeline;
  - sealed-until time;
  - status.
- **`EventTemplate`:** sections, questions and rubric.
- **`InvitedSupplier`:** a Party with the SUPPLIER role, its contacts, and a snapshot of its qualification status at
  invitation.
- **`Clarification`:** published to all invited suppliers.
- **`SupplierResponse`**, one per round: answers, attachments, submission time, SHA-256.
- **`Rubric`:** criteria, weights, scales, knock-out criteria.
- **`Evaluator`:** a user, with a conflict-of-interest declaration.
- **`Score`:**
  - evaluator, criterion, supplier;
  - value and justification;
  - time;
  - locked or not.
- **`ConsensusScore`** and the derived **`ComparisonMatrix`.**
- **`AwardRecommendation` → `AwardDecision`.**
- **`QualificationRequest`**, sent to the supplier-quality record.
- **`RegulatoryImpactFlag`.**
- **A Procurement purchase agreement or PO.**

**The supplier-quality record (a dependency)** holds:
- `SupplierQualification`, per supplier, site and material:
  - status: unqualified, in qualification, approved, conditionally approved or disqualified;
  - risk class;
  - approved by QA;
  - valid until.
- `Audit`.
- `QualityAgreement`.
- `SupplierChangeNotification`.

### 6. Specification set to write (spec-driven)

**URS highlights:**
- **RESP-5-URS-001:** No buyer user can see any response content before the deadline. Opening the responses is logged.
- **RESP-5-URS-002:** Evaluators score independently. Others' scores stay hidden until the evaluator submits. A change
  after submission needs a reason.
- **RESP-5-URS-003:** Every score records the evaluator, criterion, value, justification and time.
- **RESP-5-URS-004:** Evaluators declare conflicts of interest before seeing responses. A declared conflict blocks
  scoring for that supplier.
- **RESP-5-URS-005:** Clarification answers are published to every invited supplier, without the asker's identity.
- **RESP-5-URS-006:** For a GMP-flagged event, an award can be approved only if the supplier-quality record shows the
  supplier, site and material as Approved or Conditionally approved. Otherwise the award is "pending qualification",
  and a request goes to QA.
- **RESP-5-URS-007:** For registered materials, the award shows "regulatory change required" and needs regulatory
  affairs to acknowledge it.
- **RESP-5-URS-008:** AI may summarise and compare responses, citing the supplier's text. It never creates or changes a
  score.
- **RESP-5-URS-009:** A supplier user sees only their own invitations, responses and clarifications.
- **RESP-5-URS-010:** On confirmation, the award creates a draft purchase agreement or PO in Procurement at the awarded
  prices, with no re-keying.

**Key functional requirements (Given/When/Then):**

1. **Sealed:**
   - Given an event with a deadline at 12:00,
   - When a buyer opens a response at 11:59,
   - Then access is refused, and the attempt is logged.
2. **Late submission:**
   - Given a supplier submits at 12:00:01 by the server clock,
   - Then the submission is refused unless the buyer has extended the deadline for everyone.
   - Any extension is logged.
3. **Arithmetic:**
   - Given weights of 40, 30 and 30 and a defined rounding rule,
   - Then each weighted total equals the documented formula.
   - Property tests prove it for random weights and scores.
4. **Knock-out:**
   - Given a supplier fails "valid GMP certificate for the manufacturing site",
   - Then it is excluded from the ranking, and every evaluator sees the reason.
5. **Qualification gate:**
   - Given the preferred supplier is "unqualified" for the material,
   - When the award is approved,
   - Then the status is "pending qualification" and a QA request exists.
   - No PO can be created.
6. **Conflict of interest:**
   - Given evaluator E declares a conflict with supplier S,
   - Then E cannot open S's response or score it.
7. **AI comparison:**
   - Given responses from three suppliers,
   - When the summary is generated,
   - Then every statement cites a supplier answer, and the raw answers are shown beside it.
8. **Award to PO:**
   - Given an approved award for a qualified supplier,
   - When the buyer confirms,
   - Then a draft PO is created with the event reference and the awarded prices.

**Non-functional requirements:**
- **Portal speed:** at most 2 seconds at p95.
- **Deadline:** enforced by the server's synchronised clock.
- **Attachments:** up to 200 MB, scanned for malware.
- **Scale:** at least 200 invited suppliers per event.
- **Availability:** 99.5% while events are open (proposal).
- **Retention:** event records are kept for the period set by finance and legal. A common range is 6–10 years; verify
  for each jurisdiction.

**AI model specification (comparison summary):**
- **Intended use:** summarise each supplier's answer per criterion and highlight the differences.
- **Metrics:**
  - faithfulness at least 98% on reviewed samples;
  - citation coverage of 100%;
  - a counterfactual bias test: swapping supplier names leaves the summary's content unchanged.
- **Oversight:** evaluators score from the raw answers. The summary is only an aid.
- **Untrusted input:** supplier submissions are untrusted (prompt-injection tests).
- **Drift:** errors reported by evaluators.
- **Change control:** re-run the evaluation set.

### 7. Fit with GigaLibs

**Build inside `universal-procurement`**, not as a new module. Its manifest already has:
- the capabilities `vendor-management`, `delegation-of-authority` and `purchase-orders`;
- the planned capabilities `rfq-bidding`, `vendor-portal` and `automated-po-generation`.

**Reuse:**
- **Parties (T4; ADR-0020's Party and PartyRole SUPPLIER).**
- **Product Catalogue:** materials, services and awarded price lists.
- **The external identity from ADR-X1** (RESP-3).
- **A library for buyer question templates**, like RESP-2.
- **Rule Studio:** weights and knock-outs.
- **Approval Queue and Workflow Studio:** award approval.
- **e-signature:** contracts and quality agreements (not deployed).
- **Communications:** invitations.
- **Connector Hub:** the qualification status in a customer's existing eQMS.
- **Analytics Studio.**

**Dependencies:**
- **M-PROC (plan v3 5B).** Procurement runs on UAT with a hard-coded screen and no metadata windows. RESP-5 should
  follow its conversion to metadata windows (S16).
- **T4 Parties.**
- **Procurement's relay** (the release condition for module hosts).
- **ADR-X1.**
- **The supplier-quality record:**
  - **Recommended:** the first slice of the Quality management module (plan v3 §7D, owner decides), or an eQMS
    connector until then.
  - **Never:** a field that buyers can edit in Procurement.

### 8. Implementation plan

1. **S1 (M): events with internal evaluation.**
   - **Scope:**
     - events, templates and rubrics;
     - responses entered or uploaded by the buyer;
     - independent scoring;
     - conflict-of-interest declarations;
     - audit trail.
   - **Evidence:** property tests for scoring; tests for sealing and conflicts.
2. **S2 (L): supplier portal.**
   - **Scope:** authenticated suppliers, sealed submission, clarifications, deadline.
   - **Depends on:** ADR-X1.
   - **Evidence:** penetration test; Security and Privacy reviews.
3. **S3 (M): gate and PO.**
   - **Scope:**
     - read qualification status and raise requests;
     - the regulatory-change flag;
     - award to PO;
     - the GMP PO block in Procurement.
   - **Evidence:** scripted tests of the gate and the block.
4. **S4 (M): AI comparison summary.**
   - **Scope:** the summary, with citations and the bias test.
   - **Evidence:** an evaluation report.
5. **S5 (S): validation summary** for the GxP touchpoints.

Total: **L**, after its dependencies.

### 9. Risks and open questions (for the owner, QA, or named experts)

**Risks:**
- **A long dependency chain:** T4, M-PROC, ADR-X1 and a supplier-quality record.
- **Pressure to award before qualification.** The gate must hold.
- **Fairness challenges.** Public-sector buyers have stricter rules.
- **Personal data of supplier contacts.**

**Open questions:**
- **Owner:** card the supplier-quality slice of Quality management, or integrate with the pilot customer's eQMS?
- **QA:** is "Conditionally approved" acceptable for award?

### 10. Agents and humans responsible (roster role IDs; new specialist roles you recommend; named human approvers)

**Roster roles:**
- **Lead:** `procure_to_pay_lead`.
- **Consulted:**
  - `partners_master_data_lead`;
  - `quality_management_lead` (owner decides);
  - `quality_regulatory_specialist`, `industry_pharma_life_sciences`;
  - `internal_controls_specialist`, for separation of duties and conflicts of interest;
  - `financial_mathematics_specialist`, for the scoring arithmetic;
  - `tenant_identity_access`;
  - `ai_engineering`, `trust_safety_automation`.
- **Prove:** `qa_spec`.
- **Review:** `security_reviewer`, `privacy_compliance_reviewer`.

**New specialist:** `supplier_quality_specialist`, for supplier qualification, GMP audits, quality agreements and change
notifications.

**Humans:**
- **The buyer's head of QA:** gate policy, and QA's veto.
- **The head of procurement:** the delegation of authority.
- **The regulatory affairs lead:** registered materials.
- **Legal.**
- **The owner.**


<!-- pagebreak -->

# 7C. Process modelling, PAT and manufacturing intelligence

- **Prepared by:** the pharma and life-sciences practice (`industry_pharma_life_sciences`, `quality_regulatory_specialist`),
  with the specialists recommended in each module's section 10.
- **Date and status:** 2026-10-19. Draft for the owner and for a named pharma QA expert (ORGANIZATION.md §7:
  "regulated-sector validation by a named expert"). It is not validated, and no code depends on it yet.
- **Sources:** the specification suite (lines 413–530; method 902–1010). GigaLibs facts checked read-only at commit
  `b23489c6`: CMMS contracts (`packages/contracts/src/cmms/index.ts`), CMMS migrations 17, 18, 20, 21, the
  `esignature` manifest, ADR-0016 F12, plan v3 §7C–D.
- **"(verify)"** marks a detail to confirm against the standard's own text before it shapes a design.

---

## Family overview

### What the family is for

In a pharma company or a CDMO, this family carries process knowledge from development into routine control:

- **PROC-1** designs the process and its scale-up.
- **PROC-2** measures quality attributes in the process (PAT).
- **PROC-3** monitors batches and runs stage 3 of process validation (continued process verification, CPV).
- **PROC-4** keeps the equipment fit for use.

Together they follow the ICH Q8–Q14 lifecycle and the FDA process validation lifecycle (2011):

| Stage | Modules |
| --- | --- |
| Stage 1, process design | PROC-1, and retrospective analysis in PROC-3 |
| Stage 2, process qualification | PROC-2 methods, and equipment qualification status in CMMS (P4-0) |
| Stage 3, continued process verification | PROC-3, with PROC-4 keeping the equipment in its qualified state |

**In a CDMO:**
- The client usually owns the process knowledge, and the CDMO runs the process.
- The quality agreement decides who approves a model change. Often the client's QA must approve too.
- Client data must stay apart. Use tenant isolation, or unit and site scope within one tenant (verify which, per client
  contract).

### GxP map at a glance

| Module | Classification | GAMP 5 category | Size |
| --- | --- | --- | --- |
| PROC-1: Process simulation and scale-up | **GxP-adjacent.** Non-GxP for pure exploration. GxP if a model becomes part of the control strategy. | Platform: Cat 4. User-written kinetics or unit models: Cat 5 elements. | L for the recommended scope. XL (multi-year) to build a general simulator (not recommended). |
| PROC-2: Process analytical technology | **GxP** when a model is the analytical procedure for an in-process control (IPC), an endpoint, release or real-time release testing (RTRT). **GxP-adjacent** for feasibility and advisory monitoring. | Platform: Cat 4. Each model is a configured analytical procedure, validated under ICH Q2(R2)/Q14. | XL |
| PROC-3: Multivariate batch monitoring and optimisation | **Set by context of use** (see the next table): engineering insight is GxP-adjacent; the CPV system of record is GxP; release is GxP at high impact. | Cat 4, with each model governed by its context of use. | XL |
| PROC-4: Predictive maintenance | **GxP-adjacent** prediction engine, on top of a CMMS that is **GxP** for pharma tenants. | CMMS: Cat 4. Models: non-critical ML with a human in the loop. | L, plus M for the CMMS GMP extension |

### The GxP line: one rule for all four modules

**The classification belongs to a model's context of use (COU), not to the software.** The same PCA engine is
GxP-adjacent when an engineer explores data, and GxP when its alarm puts a batch on hold.

We use the model-impact categories (low, medium, high) from the ICH Quality Implementation Working Group's
"Points to Consider" for Q8/Q9/Q10 (2011; verify the wording).

| Context of use | ICH model impact | Classification | Evidence before use | Who approves |
| --- | --- | --- | --- | --- |
| Exploration, development, engineering insight, investigation support | Low | GxP-adjacent (non-GxP for pure research) | Intended use stated; verified on reference data; runs reproducible | Responsible scientist |
| Advisory monitoring. A human decides, and a GMP record is made elsewhere (advisory PAT trend, PdM alert). | Low | GxP-adjacent | Plus a performance report on held-out data, and drift monitoring | Scientist or engineer, and the system owner |
| CPV system of record; or a model the control strategy or an SOP requires people to act on (IPC, endpoint, hold, diversion under ICH Q13) | Medium | GxP | Plus validation (ICH Q2(R2)/Q14 for methods, or process-model validation), change control, and a QA e-signature | QA |
| Release or RTRT, or a surrogate for a release test | High | GxP, and the marketing authorisation must include it | Plus regulatory approval (ICH Q12 established conditions) | QA, the QP or authorised person, and Regulatory Affairs |

**What the platform enforces:**
- Every model version carries a declared COU and an impact category.
- It can be bound only to uses its approved category allows.
- Raising the category needs change control, new evidence and a QA e-signature.

### Shared foundations (build once, used by all four)

| ID | Foundation | State today |
| --- | --- | --- |
| F1 | **Model registry and lifecycle.** Model, version, COU, impact, data-set hashes, metrics, approvals, deployments, drift monitors. | Does not exist |
| F2 | **Part 11 electronic signatures:** meaning, re-authentication, manifestation, signature-to-record link (21 CFR 11.50, 11.70, 11.200). | Does not exist. CMMS sign-off is four-eyes but records only who, when and a note. The `esignature` module is an envelope prototype, frozen 2026-09-28. |
| F3 | **Link to a quality system (QMS):** change control, deviation, CAPA. | No GigaLibs QMS. "Quality management" is plan v3 §7D, owner decides. Option: integrate the customer's existing eQMS. |
| F4 | **Process data access:** historian and OPC-UA. | Neither exists (decision below) |
| F5 | **Scientific compute service.** Python, versions pinned, deterministic, behind the module API with signed context. | Does not exist. ADR-0016 F12 parked the old execution plane; it is "reconsidered as the AI/ML worker". |
| F6 | **A validated release model for regulated tenants.** | Open. Plan v3 decision 0.7a makes UAT production; GxP customers expect a validation environment, advance release notes and controlled change. Owner decision before the first GxP tenant. |

**F4: options for process data.**

| Option | Pros | Cons |
| --- | --- | --- |
| (a) Integrate the site's existing historian. It stays the system of record; GigaLibs reads through an adapter. | No duplication; the historian is usually validated already | One adapter per historian; query limits |
| (b) Build a GigaLibs time-series store | Full control | It becomes a GMP system of record that needs validation, and it needs ingestion from the plant floor (OT) |
| (c) Hybrid: an on-site edge collector (outbound only, store-and-forward), plus a bounded "model-input store" that keeps only the data windows each model run used | Reproducible runs without owning the history | Needs the edge collector |

- **Recommendation:** (a) plus (c).
- OPC-UA (IEC 62541) needs that edge collector in every case. A cloud tenant cannot, and must not, open connections
  into plant networks (IEC 62443; ISA-95 level 3.5 DMZ).

### Recommended order

1. **Decisions F4, F5 and F6, and build F2 (M) and F1 (M).** No GxP slice can be accepted without them.
2. **PROC-4 first:**
   - it builds on the CMMS already in production (meters, telemetry ingestion, meter triggers, failure codes,
     requests, sign-off);
   - its regulatory risk is the lowest (GxP-adjacent);
   - the CMMS GMP extension it needs is a precondition for any pharma tenant anyway.
3. **PROC-3 next, in GxP-adjacent mode** (retrospective analysis), then univariate CPV:
   - it builds the PCA/PLS engine, T²/SPE limits and contributions at low impact;
   - PROC-2 reuses that engine.
4. **PROC-2:**
   - spectral preprocessing and method lifecycle on top of the shared engine;
   - in-line advisory use before any IPC or endpoint use;
   - RTRT only for a customer whose filing includes it.
5. **PROC-1 last, and narrow:**
   - integrate with the customer's existing simulator;
   - build only a batch scale-up and thermal-safety calculator.

   A general flowsheet simulator is a multi-year product in a mature market.

---

## PROC-1: Process simulation and scale-up

### 1. Purpose and users

Predict how an API synthesis step, and the operations after it, behave when they move from lab to kilo lab, pilot
plant and plant, before material and equipment are committed. The operations in scope are crystallisation,
extraction, distillation, solvent recovery and drying.

**Users:**
- process chemists and chemical engineers, in development and technology transfer;
- process safety engineers;
- manufacturing science and technology (MS&T) at the receiving site;
- Regulatory CMC authors, who use the reports;
- CDMO project leads, for client technology transfer.

Operators do not use it.

### 2. What the specification asks for

**Simulation:** a steady-state flowsheet with recycle convergence (FR-A101, FR-A105); NRTL, UNIQUAC, UNIFAC,
Peng–Robinson and Wilson, with binary parameters regressed from lab data (FR-A102, AP-001); stoichiometric and kinetic
plug-flow, CSTR and batch reactors (FR-A103, AP-002); sensitivity over 1–5 parameters with minimum, maximum and optimum
flagged (FR-A104, AP-003); design specifications with infeasibility detection; solvent screening for crystallisation
and extraction (FR-A106).

**Records and reports:** audit trail and e-signature on runs (AP-004); a "CMC-ready" report with balances and a drawn
flow diagram, exportable to Word (AP-005); a lab → kilo → pilot → plant comparison of yield, cycle time, utilities,
waste and capital, with bottlenecks.

**Our reading:** the source describes a general desktop simulator with a very large proprietary compound databank;
GigaLibs should not rebuild that. Gaps in the source: no process-safety gate before scale-up; steady state misses most
API steps, which are batch or semi-batch (dosing, heat removal over time); capital estimation is outside a
quality-system scope.

### 3. GxP impact and validation approach

**Classification: GxP-adjacent.**
- **Why:** Scale-up predictions are not GMP records and decide no batch. They inform stage 1 process design (FDA PV
  guidance, 2011), development reports and CTD Module 3 (3.2.S.2.2, 3.2.S.2.6, 3.2.P.2). They do so only after
  scientists check them against experiments and the reports pass document review.
- **What still applies:** Data that support a filing must be reliable. ALCOA+ applies to GxP data generally (MHRA GxP
  data integrity guidance, 2018; PIC/S PI 041-1). So the module needs an audit trail and reproducible runs, not full
  computer system validation.
- **Non-GxP:** for pure exploration.
- **GxP, under F1 governance:** if a model joins the control strategy. Examples: a residence-time-distribution model
  that diverts material in continuous manufacturing (ICH Q13), or a soft sensor.

**GAMP 5 (Second Edition):**
- The platform is Cat 4.
- User-written kinetic expressions or custom unit models are Cat 5 elements: each is reviewed and verified on its own.
- There is no ML in the first scope. If ML property prediction comes later, every predicted value is flagged
  "predicted", with its uncertainty, and is never mixed silently with measured data.

**Assurance (CSA thinking, applied to pharma through GAMP 5 Second Edition):**
- **Scripted:** engine results against published reference data and worked cases (binary VLE, flash, shortcut
  distillation, semi-batch heat balance) within stated tolerances; balance closure; the "not computed" path;
  audit-trail completeness; reproducibility (same inputs and engine digest give the same numbers).
- **Unscripted:** flowsheet editing, plots, report layout.
- **Evidence:** an engine verification report per release, a reference-case register, and the customer's
  fit-for-use assessment (not IQ/OQ/PQ).

**Part 11, Annex 11 and ALCOA+:**
- Audit trail on parameter sets, model versions and runs (who, when, old and new values, reason). Runs are immutable.
- Report approval is a review sign-off; it becomes a Part 11 e-signature (F2) only if the customer declares the report
  a GxP document (for example, attached to a technology-transfer protocol).
- **Retention:** tenant policy; data supporting a marketing authorisation kept while it is in force (EU GMP
  Chapter 4; verify).

### 4. Industry process it must follow

1. **Define the target:** the quality target product profile (QTPP) and preliminary CQAs (ICH Q8(R2)). For drug
   substance, the enhanced approach of ICH Q11.
2. **Assess risk:** link material attributes and process parameters to CQAs (ICH Q9(R1); FMEA).
3. **Generate lab data:** kinetics, solubility curves, VLE/LLE. Record the provenance of every regressed parameter.
4. **Screen process safety before any scale-up:**
   - DSC screening and reaction calorimetry: heat of reaction and accumulation;
   - adiabatic temperature rise, MTSR and TD24;
   - Stoessel's criticality classes 1–5, from the order of process temperature, MTSR, MTT and TD24 (CCPS guidance).

   **Decision point:** a process safety engineer accepts the class, and the technical measures for higher classes,
   before the kilo lab.
5. **Select solvents** against the ICH Q3C classes and the site's solvent guide.
6. **Simulate and test sensitivity.** Propose proven acceptable ranges (PARs) or a design space. Only the regulator
   approves a design space, through the filing.
7. **Assess each scale:**
   - heat removal capacity of the real vessel against heat generation;
   - mixing, mass transfer, dosing time and cycle time;
   - equipment fit.
8. **Review:** chemist, engineer and safety. A HAZOP or process hazard analysis before pilot or plant.
9. **Transfer:** the technology-transfer package (ICH Q10 knowledge management) and the stage 1 process-design
   report.

   **Decision point:** Regulatory CMC decides which model results go into a filing.

### 5. Domain model

- **Compound** has property records. Each record says where it came from: measured, regressed, literature or
  predicted.
- **PropertyMethod** (NRTL…) uses **BinaryParameterSets**, each with its regression evidence.
- **Reaction**: stoichiometry, a rate law, Arrhenius parameters, and their provenance.
- **ProcessModel**, versioned, contains **UnitOperations** joined by **Streams**. It belongs to a **ProcessStep** of a
  **Product** (Product Catalogue).
- **ScaleScenario** (lab, kilo, pilot, plant) references an **EquipmentProfile**:
  - for real plant equipment, taken from the CMMS asset and its classification specs (volume, jacket area, maximum
    jacket temperature, agitator);
  - otherwise a template.
- **SimulationCase** → **SimulationRun**. A run records the engine digest, the input hash, convergence status,
  warnings and a **ResultSet** (stream table, balances).
- **SensitivityStudy** and **DesignSpec** produce Runs.
- **ThermalSafetyAssessment**: calorimetry inputs, ΔT_ad, MTSR, TD24, class, approver.
- **ScaleUpReport**: version, status, signatures. It links to **CQA** and **CPP** records, which are shared with
  PROC-2 and PROC-3.

### 6. Specification set to write

**URS:**
- **PROC-1-URS-001** Every property value used in a run shows its source and type (measured, regressed, literature,
  predicted).
- **PROC-1-URS-002** A run that does not converge reports "not computed", with the reason. It reports no partial
  numbers as results.
- **PROC-1-URS-003** Each run stores the input hash, model version, engine image digest and user. Re-running gives the
  same results.
- **PROC-1-URS-004** A scale-up to kilo, pilot or plant cannot be marked "ready for review" until a thermal-safety
  assessment is approved for that step.
- **PROC-1-URS-005** Plant-scale scenarios take vessel data from the CMMS asset record, not from free text.
- **PROC-1-URS-006** Sensitivity studies vary 1–5 parameters and flag the minimum, maximum and best feasible point.
- **PROC-1-URS-007** Reports are drafts until approved. An approved report is locked and versioned.
- **PROC-1-URS-008** Every change to a model, parameter set or approval is in the audit trail, with a reason.

**Functional requirements (Given/When/Then):**
- **PROC-1-FR-01**
  - *Given* a binary parameter set regressed from lab data,
  - *when* it is used in a run,
  - *then* the result links to the regression data set and its goodness-of-fit.
- **PROC-1-FR-02**
  - *Given* a flowsheet with a recycle,
  - *when* convergence fails within the iteration limit,
  - *then* the run status is NOT_COMPUTED with the last residuals, and no stream table is published.
- **PROC-1-FR-03**
  - *Given* a semi-batch reaction with calorimetry inputs,
  - *when* the assessment runs,
  - *then* ΔT_ad, MTSR and the Stoessel class are shown with their inputs. If TD24 is missing, it says "class not
    computed: TD24 missing".
- **PROC-1-FR-04**
  - *Given* a plant scenario bound to a CMMS vessel,
  - *when* the required heat removal exceeds the vessel's capacity at the planned dosing rate,
  - *then* the scenario is flagged infeasible and shows the dosing time that would be feasible.
- **PROC-1-FR-05**
  - *Given* an approved report,
  - *when* anyone edits an input,
  - *then* a new draft version is created and the approved version stays unchanged.
- **PROC-1-FR-06**
  - *Given* an external simulator's result file,
  - *when* it is imported,
  - *then* its checksum, source tool and version are recorded, and its values are labelled "external".

**Non-functional requirements (proposed targets, confirmed with the first customer):**
- A flowsheet of up to 30 units converges, or reports failure, within 120 s.
- The convergence tolerance is configurable (default 1e-6 relative), and the closure achieved is shown on every
  result.
- Re-runs are deterministic to 1e-9 relative.
- Availability: 99.5% monthly (non-critical).
- Run history is kept for the product's life, by tenant policy.

**AI model specification:** none in the first scope. Parameter regression is a statistical fit. It reports confidence
intervals and residuals.

### 7. Fit with GigaLibs

**Reuse:** Product Catalogue (product, API); CMMS assets, classifications and `specs` as real equipment profiles;
Geospatial (sites); Analytics Studio (charts); Workflow Studio for review routing once deployed. The Assistant explains
non-convergence and drafts report narrative citing run IDs; it never changes a result or approves.

**New:** a `process-modelling` module; engines in the compute service (F5). Candidate open libraries: `thermo`/
`chemicals`, CoolProp, Cantera, Pyomo, IDAES (licences checked by `licence_ip_reviewer`; DWSIM is GPL, so reference
only unless legal decides otherwise).

**Decisions:**
- Integrate the customer's simulator (CAPE-OPEN or result-file import) or build a native engine. Recommended:
  integrate, plus a native batch and thermal-safety calculator.
- Property data sources and their licences: the tenant's own measured data first; no proprietary databank.
- No ELN connector exists, so experimental data arrive by file at first.

### 8. Implementation plan

| Slice | Scope | Size | Acceptance evidence | Validation deliverable |
| --- | --- | --- | --- | --- |
| P1-1 | Process knowledge core: Product, ProcessStep, QTPP, CQA, CPP, experiments and data sets with provenance, as dictionary windows (shared with PROC-2 and PROC-3) | M | RLS and scope tests; audit rows per change; windows on UAT | URS, data-integrity design note |
| P1-2 | Model and run register for external simulators: import, version, checksum, review | M | Re-import gives the same hash; edits make new versions | Verification of import fidelity |
| P1-3 | Batch scale-up and thermal-safety calculator (F5): semi-batch heat balance, vessel capacity from CMMS, Stoessel class | L | Worked reference cases within tolerance; "not computed" paths | Engine verification report |
| P1-4 | Sensitivity studies and PAR proposals over P1-3 and imported models | M | Grid and optimum flags match reference calculations | Reference-case register update |
| P1-5 | Scale-up report: draft, review, lock, Word/PDF export | M | Locked versions; signature on GxP-declared reports (needs F2) | Fit-for-use template for customers |
| P1-6 (optional) | Native steady-state engine for a few units (flash, mixer, splitter, shortcut column, solubility crystalliser) | L | Benchmark set against published data | Extended verification report |

### 9. Risks and open questions

- **Scope (owner):** a general simulator would consume the family's budget. Confirm "integrate, don't build".
- **Over-trust:** models on narrow data extrapolate badly; every result shows its data range and warns outside it.
- **Safety:** the calculator never replaces the process safety engineer's assessment; the customer names who signs.
- **Licences** of property data and libraries (`licence_ip_reviewer`, the legal adviser).
- **Open question:** does the first pharma or CDMO customer already own a simulator? If so, P1-6 is never needed.
- **CDMO:** client IP in models kept apart by unit or tenant; confirm the pattern with `solution_architecture`.

### 10. Agents and humans responsible

- **Roster:** `industry_pharma_life_sciences` (lead), `quality_regulatory_specialist`, `manufacturing_lead`,
  `maintenance_cmms_lead` (equipment profiles), `health_safety_environment_specialist`, `solution_architecture`,
  `backend_domain`, `web_experience`, `qa_spec`, `licence_ip_reviewer`, `security_reviewer`, `code_reviewer`.
- **New specialists:** `process_modelling_specialist` (thermodynamics, kinetics, scale-up), `process_safety_specialist`
  (CCPS, reaction calorimetry, Stoessel), `regulatory_cmc_specialist`.
- **Named humans:** the owner (scope, acceptance); a process safety engineer (safety method); a chemical engineer
  (engine verification); the customer's Regulatory CMC lead (report content).

---

## PROC-2: Process analytical technology (spectroscopy and chemometrics)

### 1. Purpose and users

Build, validate, deploy and maintain chemometric models that turn in-line or at-line spectra into predicted quality
attributes:
- spectra: NIR, Raman, UV-Vis;
- attributes: assay, moisture, polymorphic form, blend uniformity, reaction conversion.

They are used for monitoring, for endpoint decisions and, where the marketing authorisation allows it, for RTRT.

**Users:**
- analytical scientists and chemometricians, who build models;
- QC, who own the method;
- QA, who approve;
- operators, who see trends and confirm endpoints;
- MS&T, who watch performance;
- Regulatory CMC.

### 2. What the specification asks for

**Data and models:** spectra import in SPC, ASC, JCAMP-DX (FR-A201); preprocessing (SNV, MSC, derivatives,
Savitzky–Golay); PLS (1–20 latent variables), PCR, PLS-DA, SVM, ANN; leave-one-out, k-fold and test-set validation
with RMSECV and RMSEP (FR-A202); outlier detection by Hotelling T² and Q residuals (PAT-001).

**Live use:** OPC-UA ingestion (FR-A203); CQA trends with control limits and a "golden batch" overlay (FR-A204);
endpoint detection, "stable within ±X% for N scans", signalling the DCS (FR-A205, PAT-003); prediction shown within
5 s at a typical 30 s scan (PAT-002).

**Governance and integration:** model versions, rollback and QA-approved change control (FR-A206, PAT-004); spectra
stored with batch, probe, equipment and model version; LIMS, historian and DCS/SCADA integration (PAT-005).

**Three claims we do not adopt as written:**

1. **"RMSECV ≤ 0.5% w/w, R²cal ≥ 0.99" as a universal acceptance criterion.**
   - Acceptance comes from each method's analytical target profile (ATP).
   - R² depends on the calibration range.
   - RMSEP on an independent test set is the primary evidence; RMSECV is development evidence.
2. **Endpoint signals and set-point changes sent to the DCS from a cloud service.** We reject this for the first
   releases (section 7).
3. **"Release in 2 h instead of 72 h".** RTRT needs approval in the marketing authorisation; the software alone
   cannot give it.

### 3. GxP impact and validation approach

**Classification, by context of use:**

| Use | Classification |
| --- | --- |
| Model workbench | GxP-adjacent. Its data become GxP evidence once they support a validation report, so integrity controls apply from the first import. |
| Advisory monitoring | GxP-adjacent, low impact |
| IPC or endpoint method in the control strategy | **GxP, medium or high impact** |
| RTRT, or a surrogate for a release test | **GxP, high impact**, and needs the marketing authorisation |

**GAMP:**
- The platform is Cat 4.
- Each model (preprocessing, algorithm, latent variables, limits) is a configured analytical procedure, validated
  under ICH Q2(R2) and ICH Q14. Both texts address multivariate procedures (verify sections).
- The spectrometer's own software stays the customer's validated instrument system, outside our scope.

**AI and ML:**
- PLS and PCA are trained on data, so they follow the AI model specification discipline (brief rule 4).
- Whether the EU's **draft** Annex 22 (2025 consultation) covers classical chemometrics is open (verify). We apply its
  principles anyway:
  - static, locked models with deterministic outputs;
  - no continuous learning;
  - test data independent of training data.
- SVM and ANN are limited to low-impact uses until a validation strategy for them is approved.

**Assurance:**
- **Scripted:** preprocessing and PLS/PCA against reference outputs on public data sets (to 1e-8); T² and Q limits;
  the full prediction path with known spectra; refusal outside the model space; model binding (each prediction
  records model version and spectrum hash); e-signature and audit trail; time synchronisation.
- **Unscripted:** workbench usability and plots.
- **Per model:** the customer's validation protocol and report. **Supplier evidence:** URS → test traceability,
  verification reports, release notes.

**Part 11, Annex 11 and ALCOA+:**
- Raw spectra are original records: immutable and checksummed. Clocks synchronised (contemporaneous).
- Audit trail with a reason on every model-lifecycle event. The builder cannot approve their own model.
- Part 11 e-signatures (F2) on the validation protocol and report, model approval, deployment and retirement.
- Spectra and predictions used in batch decisions are kept with the batch record (EU GMP Chapter 4; 21 CFR 211.180;
  verify the periods). Model versions are kept as long as any batch they supported.

### 4. Industry process it must follow

Sources: ICH Q14, Q2(R2), Q8(R2) and Q12; the FDA PAT guidance (2004); USP <1039> chemometrics and <1220> analytical
procedure lifecycle (verify chapters); the EMA guideline on NIR spectroscopy (verify).

1. **ATP:** the attribute, its range, the accuracy and precision needed, and the context of use.
2. **Feasibility and risk** (ICH Q9(R1)): sample presentation, probe position, interferences.
3. **Calibration design:**
   - samples that span the expected variation: raw-material lots, process conditions, deliberate spiking;
   - a validated reference method (HPLC, Karl Fischer);
   - each reference sample synchronised with its spectrum.
4. **Model development:**
   - preprocessing and the number of latent variables chosen by cross-validation;
   - the reason for every outlier excluded is recorded;
   - an independent test set from other batches and lots.
5. **Validation protocol**, approved by QA in advance. Then validation: specificity, range, accuracy, precision,
   robustness.
6. **Change control and QA approval.** For filed methods, the reporting category under ICH Q12 established
   conditions.
7. **Deployment qualification:** instrument qualified, probe installed, data connection verified, model bound.
8. **Routine use:** diagnostics on every prediction. A spectrum outside the model space gives no valid result.
   Atypical results are handled under the site's investigation SOP (verify how the FDA OOS guidance applies to PAT).
9. **Lifecycle monitoring** (ICH Q14):
   - periodic parallel testing against the reference method;
   - trending of residuals;
   - maintenance triggers: a new supplier, instrument repair, probe change, frequent out-of-model-space results.
10. **Update** under change control, with revalidation in proportion. Model transfer between instruments counts as a
    change.
11. **Retirement.**

### 5. Domain model

- **Instrument** and **Probe** are CMMS assets, carrying qualification and calibration status.
- **Spectrum**: raw file reference, checksum, instrument, probe, acquisition parameters, time, and batch or sample.
- **ReferenceSample**: lab value, reference method, LIMS reference.
- **CalibrationDataset** splits into training and test **Partitions**.
- **PreprocessingPipeline**: ordered steps with parameters.
- **ChemometricModel** → **ModelVersion** (F1). A version holds:
  - algorithm, latent variables, library and engine digest;
  - COU and impact;
  - status: Draft → InValidation → Approved → Deployed → Retired.
- **AnalyticalTargetProfile** and **ValidationReport** are linked to a ModelVersion.
- **Deployment**: model version × instrument and probe × product and step.
- **Prediction**: value, prediction interval, T², Q, in-space flag, spectrum, model version.
- **EndpointRule**, **Alarm**, **ParallelTestResult**, **MaintenanceTrigger**.

### 6. Specification set to write

**URS:**
- **PROC-2-URS-001** Raw spectra are stored unchanged, with a checksum and acquisition metadata.
- **PROC-2-URS-002** A model version cannot be deployed for a GxP use without an approved validation report and a QA
  e-signature.
- **PROC-2-URS-003** Each prediction records the model version, spectrum hash, T², Q and the in-space verdict.
- **PROC-2-URS-004** A prediction outside the model's T² or Q limits is shown as "no valid result" and never as a
  number in a trend used for decisions.
- **PROC-2-URS-005** A deployment requires the instrument to be qualified and in calibration in the CMMS.
- **PROC-2-URS-006** Endpoint suggestions need an operator's confirmation. No control signal is sent in releases 1–2.
- **PROC-2-URS-007** Thresholds (RMSEP, bias, prediction interval) are declared from the ATP before validation, and
  the evidence is checked against them.
- **PROC-2-URS-008** A model change creates a new version under change control. The previous version can be
  restored only through the same approval.

**Functional requirements (Given/When/Then):**
- **PROC-2-FR-01**
  - *Given* a calibration set and a test set from different batches,
  - *when* the model is built,
  - *then* RMSECV, RMSEP, bias and its significance, and the latent-variable choice are reported. A test set that
    shares a batch with training is refused.
- **PROC-2-FR-02**
  - *Given* a deployed model,
  - *when* a spectrum's Q residual exceeds the 99% limit,
  - *then* the prediction is stored as invalid, an alarm is raised, and the trend shows a gap.
- **PROC-2-FR-03**
  - *Given* an endpoint rule "within ±X% for N consecutive valid scans",
  - *when* it is met,
  - *then* the operator sees a suggestion with evidence and confirms or declines it. Both are recorded.
- **PROC-2-FR-04**
  - *Given* a model version awaiting approval,
  - *when* its builder tries to approve it,
  - *then* the approval is refused.
- **PROC-2-FR-05**
  - *Given* a probe replaced in the CMMS,
  - *when* the next prediction is due,
  - *then* the deployment is suspended until the transfer is verified.
- **PROC-2-FR-06**
  - *Given* parallel-test results,
  - *when* the bias exceeds the ATP limit,
  - *then* a maintenance trigger opens with the evidence.

**Non-functional requirements (targets to confirm):**
- From receiving a spectrum to storing and showing the prediction: ≤ 5 s at p95 (advisory).
- Throughput: ≥ 20 probes per site at a 10 s scan interval.
- The edge buffer holds ≥ 72 h without loss.
- Clock skew ≤ 1 s.
- Cloud availability: 99.5%. Any control path stays on site.

**AI model specification (per model):**
- **Intended use:** from the ATP.
- **Data:** provenance of the calibration and test sets, by lot and batch.
- **Metrics:** RMSEP, bias, and prediction interval (quantitative); sensitivity and specificity (PLS-DA).
- **Thresholds:** from the ATP.
- **Human oversight:** QA approval, and operator confirmation.
- **Drift monitoring:** the rate of T²/Q exceedances, and parallel-test bias.
- **Change control:** every change.

### 7. Fit with GigaLibs

**Reuse:** CMMS (spectrometers and probes as assets; calibration through job plans, which already have the
`CALIBRATION` task type); Product Catalogue (product, specifications); Inventory (lots, for calibration design);
Analytics Studio for trends (decision views stay in the module, or Analytics Studio becomes GxP). The Assistant explains
diagnostics and fetches validation evidence with citations; it never approves.

**New:** a `pat-chemometrics` module; engines in F5 (for example scikit-learn PLS/PCA, BSD-3); an on-site edge agent;
object storage for spectra (no storage package is in use today; verify).

**Decisions:**
- **Edge and cloud split.** Recommended: in-line predictions computed at the edge and mirrored to the cloud.
- **Vendor spectral formats** parsed with open readers (licence check).
- **LIMS and MES connectors:** none exist.
- **Control signals:** none until a validated on-site runtime exists.

### 8. Implementation plan

| Slice | Scope | Size | Acceptance evidence | Validation deliverable |
| --- | --- | --- | --- | --- |
| P2-1 | Spectra and reference store: JCAMP-DX/CSV import, checksums, sample pairing | M | Hash stability; duplicate refusal; RLS | Data-integrity specification |
| P2-2 | Model workbench: preprocessing, PCA/PLS, cross-validation, test set, diagnostics (reuses the PROC-3 engine) | L | Matches reference outputs on public data sets | Numerical verification report |
| P2-3 | Model lifecycle on F1 and F2: approvals, separation of duties | M | Self-approval refused; signature manifestation | Part 11 test scripts |
| P2-4 | At-line prediction service (uploaded spectra), advisory | M | "No valid result" paths; version binding | Fit-for-use report |
| P2-5 | Edge agent and in-line advisory trends, endpoint suggestions | L | 72 h buffer test; ≤ 5 s p95 | Deployment IQ/OQ template |
| P2-6 | Lifecycle monitoring: parallel testing, drift, triggers | M | Trigger on a seeded bias | Monitoring SOP template |
| P2-7 | GxP release for IPC and endpoint use (customer PQ) | L | Customer protocol executed | Supplier validation package |
| P2-8 | RTRT support, only with a customer whose marketing authorisation includes it | XL | Customer filing and approval | Customer-specific |

### 9. Risks and open questions

- **The control loop and the cloud:**
  - A GigaLibs outage must never stop a batch.
  - Does the owner accept "advisory only" for releases 1–2?
- **Annex 22 scope** for classical chemometrics is unclear while it is a draft (`ai_model_validation_specialist`).
- **No LIMS connector,** so reference values arrive by file. That needs controls on transcription.
- **Spectra volumes** drive storage cost. Retention follows batch-record rules.
- **In a CDMO,** client QA may have to approve model changes. Model the quality agreement as an approval step.

### 10. Agents and humans responsible

- **Roster:** `industry_pharma_life_sciences`, `quality_regulatory_specialist`, `maintenance_cmms_lead`
  (instruments), `integrations_lead`, `integration_connectors`, `data_engineering`, `ai_engineering`,
  `ergonomics_human_factors` (operator alarms, ISA-18.2), `qa_spec`, `test_automation`, `performance_testing`,
  `security_reviewer`, `licence_ip_reviewer`.
- **New specialists:** `chemometrics_pat_specialist`, `csv_csa_validation_specialist`, `ai_model_validation_specialist`,
  `industrial_data_ot_specialist` (OPC-UA, ISA-95, IEC 62443).
- **Named humans:** a qualified chemometrician; the customer's QC method owner and QA approver; the QP or authorised
  person (for RTRT); the owner.

---

## PROC-3: Multivariate batch monitoring and batch process optimisation

### 1. Purpose and users

Compare every batch, or every period of a continuous run, with the multivariate behaviour of good batches. Find
abnormal behaviour early, show which variables contribute, run stage 3 continued process verification (CPV), and
propose recipe improvements inside approved ranges.

**Users:**
- MS&T and process engineers;
- the CPV statistician;
- production supervisors, for live monitoring;
- QA, for CPV review and the annual product review (APR) or product quality review (PQR);
- deviation investigators.

### 2. What the specification asks for

**Requirements (FR-A301 to FR-A306):**
- Ingest 50–500 tags from a historian or OPC (FR-A301).
- PCA charts with T², Q and contribution plots (FR-A302).
- Batch alignment by dynamic time warping (FR-A303).
- A "golden batch" model with deviation detection (FR-A304).
- Recipe optimisation for yield and cycle time, with what-if simulation and a view of the design space (FR-A305).
- Integration with the electronic batch record (FR-A306).

**Our reading:**
- The outcome percentages (OEE, cycle time, OOS) are claims, not requirements. We exclude them.
- The source is missing the regulated purpose (CPV), a source of batch context, and model governance.
- We replace the "golden batch" with a **documented reference set**: batches chosen as normal, with the reason for each
  inclusion and exclusion.

### 3. GxP impact and validation approach

**Classification. This is the precise line:**

| Use | Classification |
| --- | --- |
| (a) Retrospective analysis, troubleshooting, investigation support | **GxP-adjacent** (low impact). People record conclusions in the deviation or CAPA record. The model output is attached as supporting evidence, with its version. |
| (b) CPV system of record. The stage 3 plan is executed here, signals are evaluated here, CPV reports are approved here. | **GxP** |
| (c) Live MSPC that operators see | **GxP-adjacent** if the SOP says an alarm only prompts a check and decisions rest on validated univariate controls and the batch record. **GxP** (medium) if the SOP or control strategy requires action (hold, deviation) on the MSPC alarm. |
| (d) Batch disposition, release or RTRT based on MSPC | **GxP, high impact**, and needs the marketing authorisation. Out of scope until a customer files it. |
| (e) Recipe optimisation | **GxP-adjacent** recommendation. Implementing it is a GMP change under change control. Outside registered ranges it is a regulatory change (ICH Q12 established conditions). Moving within an approved design space is not a change (ICH Q8(R2)). |

**GAMP:** Cat 4, with each model governed by its context of use (F1).

**AI and ML:** PCA, PLS and alignment are deterministic statistical models. They are locked once approved.

**Assurance:**
- **Scripted:**
  - T², SPE (Q), limits and contributions against reference calculations;
  - alignment;
  - CPV trend rules (Western Electric/Nelson);
  - capability indices;
  - **data-retrieval fidelity:** the values used equal the historian's raw values; interpolation is never silent; gaps
    are explicit;
  - e-signature and audit trail.
- **Unscripted:** exploration screens.

**Part 11 and ALCOA+, for uses (b)–(d):**
- An audit trail with reasons on reference-batch selection and exclusions. Leaving out inconvenient batches is a known
  data-integrity risk, so each exclusion needs a reason and an approval.
- An audit trail on limits and model versions.
- E-signatures on the CPV plan, on CPV reports and on model approval.
- Historian compression and interpolation settings are recorded with every data pull.

### 4. Industry process it must follow

Sources:
- FDA Process Validation guidance (2011), stage 3: it recommends a statistician, or a person trained in SPC, design
  the data collection and the statistical methods.
- EU GMP Annex 15 (2015): ongoing process verification, and continuous process verification as an alternative
  approach.
- ICH Q10: the process performance and product quality monitoring system.
- APR (21 CFR 211.180(e)) and PQR (EU GMP Chapter 1).

**Steps:**
1. **Write the CPV plan.** It names:
   - the parameters and attributes, taken from the control strategy and the risk assessment;
   - the sampling;
   - the statistical methods;
   - the rules for alert and action;
   - the review frequency.

   QA approves it.
2. **Collect data with context:** batch, ISA-88 phases, equipment train, lots.
3. **Set the baseline:** set limits from the initial batches, and recalculate them after the number of batches the
   plan says. Every recalculation is recorded.
4. **Monitor routinely.**
5. **Triage signals:** is there an assignable cause? If so, raise a deviation or CAPA in the QMS (F3), under 21 CFR
   211.192.
6. **Write the periodic CPV report.** QA approves it, and it feeds the APR/PQR.
7. **Improve through change control.**

**For multivariate batch models:**
- unfold and align the batches;
- document the reference-set selection;
- set limits on the reference set by cross-validation;
- validate on held-out normal batches and on known abnormal batches.

### 5. Domain model

- **Tag**: historian reference, unit, asset (CMMS), and a data-quality flag following the OPC-UA status code.
- **Batch**: product, master batch record version, equipment train, start and end. It comes from MES or EBR (a
  dependency).
- **Phase**: ISA-88 boundaries.
- **BatchTrajectory**: aligned data, alignment method, and a hash of the data pull.
- **ReferenceBatchSet**: members, with the reason for each inclusion and exclusion, and the approver.
- **MultivariateModel** → **ModelVersion** (F1): observation-level or batch-level.
- **ControlLimits**: T² and SPE at 95% and 99%.
- **MonitoringRun**, **Signal**: rule, contributions, and acknowledgement.
- **InvestigationLink**: to a QMS deviation.
- **CPVPlan** has **CPVParameters**, made of CQAs and CPPs from the shared core, and rules.
- **CPVReport**.
- **OptimisationStudy**: objectives, constraints (PARs or design space), predictions with intervals.
- **RecipeChangeProposal** → change control.

### 6. Specification set to write

**URS:**
- **PROC-3-URS-001** Every model run records the data pull: tags, time range, retrieval mode, and the historian's
  compression settings.
- **PROC-3-URS-002** Each batch, and each change to the reference set, needs a reason. Changes to a GxP model's
  reference set need QA approval.
- **PROC-3-URS-003** T² and SPE charts show each signal with its contributing variables, ranked.
- **PROC-3-URS-004** The CPV plan, limits and reports are versioned and approved with e-signatures.
- **PROC-3-URS-005** A signal can be linked to a QMS deviation. The model never closes or decides a deviation.
- **PROC-3-URS-006** Optimisation proposals inside registered ranges are labelled. Proposals outside them are blocked
  and labelled "outside registered ranges: a regulatory change is needed".
- **PROC-3-URS-007** Missing data are shown as gaps and are never filled without a recorded method.
- **PROC-3-URS-008** Every model version declares its context of use. A model approved for GxP-adjacent use cannot
  drive a GxP view.

**Functional requirements (Given/When/Then):**
- **PROC-3-FR-01**
  - *Given* a reference set of N aligned good batches,
  - *when* the model is built,
  - *then* the cross-validated limits are shown, and the false-alarm rate on held-out normal batches is reported.
- **PROC-3-FR-02**
  - *Given* a running batch,
  - *when* SPE exceeds its 99% limit for the configured number of consecutive points,
  - *then* a signal is raised with contributions, and the supervisor acknowledges it with a comment.
- **PROC-3-FR-03**
  - *Given* an approved CPV plan,
  - *when* a Nelson rule fires on a CQA,
  - *then* a CPV signal is recorded and routed to the CPV owner for triage.
- **PROC-3-FR-04**
  - *Given* a request to exclude a batch from the reference set,
  - *when* it has no reason,
  - *then* it is refused.
- **PROC-3-FR-05**
  - *Given* historian data with a gap,
  - *when* a trajectory is built,
  - *then* the gap is shown and the batch is flagged "incomplete".
- **PROC-3-FR-06**
  - *Given* a what-if change to a CPP,
  - *when* it is evaluated,
  - *then* the predicted CQA is shown with its prediction interval, and with a warning if it lies outside the
    training range.

**Non-functional requirements (targets):**
- 100% of the values used equal the historian's raw values (fidelity test).
- Live update ≤ 60 s after the data reach the historian.
- Building a model from 300 batches × 200 variables takes ≤ 10 min.
- A CPV report is generated in ≤ 5 min.
- Batch-level false-alarm rate ≤ 5% on held-out normal batches, at the configured limits (set per model).

**AI model specification:**
- **Intended use and COU:** per model.
- **Data:** provenance of the reference set.
- **Metrics:** false-alarm rate, and detection of known abnormal batches.
- **Thresholds:** in the CPV plan or the model specification.
- **Human oversight:** supervisor and QA.
- **Drift monitoring:** limit exceedance rate, and changes in process or raw materials.
- **Change control:** for new versions.

### 7. Fit with GigaLibs

**Reuse:** Product Catalogue and Inventory (lots, for genealogy); CMMS (assets, equipment trains, maintenance events
as context); Analytics Studio for dashboards (CPV records stay in this module, or Analytics Studio must be validated);
Workflow Studio and rule studio for approval routing once deployed. The Assistant summarises signals and contributions
and drafts CPV report narrative with citations; a human edits and signs it.

**Not reusable:** Manufacturing (U24) covers BOMs and production orders, not a GMP batch record.

**New:** a `process-monitoring` module; the multivariate engine in F5.

**Dependencies:** batch context from the customer's MES/EBR or DCS batch system (ISA-88 events); historian access (F4);
QMS (F3).

### 8. Implementation plan

| Slice | Scope | Size | Acceptance evidence | Validation deliverable |
| --- | --- | --- | --- | --- |
| P3-1 | Tag catalogue and batch context import (file first) | M | RLS; batch–phase integrity tests | Data model specification |
| P3-2 | Historian adapter or edge pull, with fidelity checks (F4) | M–L | Fidelity test 100% on a sample | Interface specification |
| P3-3 | Univariate CPV: plan, rules, capability, report, e-signature | L | Rules fire on seeded data; signatures | First GxP package (scripted) |
| P3-4 | Retrospective MSPC: PCA/PLS, T², SPE, contributions | L | Matches reference implementation | Engine verification report |
| P3-5 | Alignment and batch-level models; reference-set governance | L | Exclusion without a reason refused | Model specification template |
| P3-6 | Live advisory MSPC with acknowledgement | L | ≤ 60 s update; alarm acknowledgement audited | Fit-for-use report |
| P3-7 | What-if and optimisation inside PARs | M | Outside-range proposals blocked | Change-control interface |
| P3-8 | GxP elevation of MSPC (use c as GxP) for a named customer | M | Customer PQ | Supplier package update |

### 9. Risks and open questions

- **No batch context source today.** Which MES, EBR or batch system does the first customer run?
- **Too many false alarms** cause alarm fatigue. Ergonomics review of alarm load is needed (ISA-18.2).
- **Optimisation on historical data** carries correlated, narrow-range risk. Confirm proposals by designed experiments
  before change control.
- **Is the CPV system of record GigaLibs or an existing tool?** This decides the validation scope (QA and the owner).

### 10. Agents and humans responsible

- **Roster:** `industry_pharma_life_sciences`, `quality_regulatory_specialist`, `manufacturing_lead`,
  `quality_management_lead`, `analytics_reporting_lead`, `data_visualisation_design`, `ergonomics_human_factors`,
  `data_engineering`, `integration_connectors`, `qa_spec`, `performance_testing`, `security_reviewer`, `code_reviewer`.
- **New specialists:** `statistics_cpv_specialist` (SPC, MSPC, CPV), `chemometrics_pat_specialist` (shared engine),
  `industrial_data_ot_specialist`, `csv_csa_validation_specialist`.
- **Named humans:** the customer's CPV statistician; the QA head (approves the CPV plan and reports); the MS&T lead;
  the owner.

---

## PROC-4: Predictive maintenance (equipment failure prediction)

### 1. Purpose and users

Detect degradation early in GMP and utility equipment, and turn it into **recommended work in the GigaLibs CMMS**
before an unplanned failure loses a batch or causes a deviation.

**Typical equipment:** pumps, agitators, compressors, HVAC air-handling units, purified water and WFI loops,
chillers, lyophiliser vacuum systems, tablet presses, autoclaves.

**Users:**
- reliability engineers;
- maintenance planners and technicians;
- engineering and maintenance managers;
- QA, for impact assessment;
- production planning.

### 2. What the specification asks for

**Requirements (FR-A401 to FR-A405):**
- Learn normal behaviour from 3–6 months of historian data (FR-A401).
- Detect failure precursors and estimate lead time (FR-A402).
- Integrate with work orders (FR-A403).
- Recommend a root cause: the failure mode and the contributing tags (FR-A404).
- Alert technicians on mobile, with evidence (FR-A405).
- One "agent" monitors each equipment item.

**Claims we exclude:**
- "No domain expertise needed". Failure-mode coverage needs FMEA or RCM work.
- A fixed "2–6 weeks" lead time. It is measurable only per failure mode, by backtest.
- The outcome percentages.

### 3. GxP impact and validation approach

**Classification: a GxP-adjacent engine on top of a GxP CMMS.**

| Part | Classification |
| --- | --- |
| A prediction, and the recommended request it creates | GxP-adjacent |
| The work order, maintenance record, calibration record and return to service | **GxP records** in the CMMS (21 CFR 211.67, 211.68, 211.182; EU GMP Chapter 3) |

**The engine never:**
- changes an asset's operational or qualification status;
- closes, skips or reschedules preventive maintenance;
- extends a calibration interval;
- releases equipment.

**When the line is crossed:**
- Using predictive evidence to change a PM or calibration interval is a GMP change. It needs change control and a
  documented justification.
- A prediction may suggest that qualified equipment ran outside its qualified or calibrated state during batches, for
  example sensor drift on a critical instrument, or HVAC pressure differentials. Then QA runs an impact assessment, and
  may open a deviation (21 CFR 211.192; EU GMP Chapter 1).

**Regulatory scope of the AI guidance:**
- FDA's **draft** AI guidance (January 2025) excludes AI used only for operational efficiency that does not affect
  product quality (verify).
- The EU's **draft** Annex 22 lets its principles be considered for non-critical uses with a human in the loop
  (verify).

**GAMP:**
- The CMMS is Cat 4, and GxP for pharma tenants. It needs the GMP extension in P4-0.
- The PdM models are non-critical ML with a human in the loop.

**Assurance:**
- **Scripted:**
  - the boundary controls: no status changes, idempotent request creation, evidence snapshots immutable, audit rows;
  - the CMMS GMP functions: calibration out-of-tolerance handling, e-signature, return to service.
- **Exploratory:** the alert screens.
- **Model evidence:** a backtest report per asset class.

**Part 11, Annex 11 and ALCOA+:**
- E-signatures (F2) on calibration results, return to service and changes to GMP schedules.
- A reason for every change on GMP records.
- Sensors fitted only for PdM, and not calibrated, are labelled "non-GMP data" and never used for a GMP decision.
- The evidence snapshot is preserved with each prediction.

### 4. Industry process it must follow

Sources:
- 21 CFR 211.67, 211.68 and 211.182.
- EU GMP Chapter 3, and Annex 15: qualification, requalification and change control.
- ISPE Baseline Guide Volume 5, Commissioning and Qualification, 2nd edition, 2019: system impact.
- SAE JA1011 (RCM).
- ISO 14224: failure taxonomy.
- ISO 17359, ISO 13374 and ISO 13381-1: condition monitoring and prognostics (verify editions).

**Steps:**
1. **Assess asset criticality and GMP impact.**
2. **List failure modes** per asset class (FMEA/RCM), and which of them are detectable from the available signals.
   The P-F interval decides how much warning there can be.
3. **Inventory sensors and data,** and their calibration status.
4. **Choose the baseline window.** A reliability engineer confirms it was healthy, and periods of maintenance and
   abnormal operation are excluded.
5. **Build the model and backtest it** against the CMMS failure history.
6. **Approve before enabling:** the reliability engineer and the maintenance manager. QA is informed for GMP
   equipment.
7. **Triage alerts.** The planner either:
   - accepts the request → a work order; or
   - rejects it with a reason, which becomes a feedback label.
8. **Do the work** under the SOP, and code the failure attribution (problem, cause, remedy).
   - For GMP equipment, assess after the work whether recalibration or requalification is needed.
   - Return to service is approved as the SOP requires (engineering, and QA where needed).
9. **Trigger a GMP impact assessment** when the evidence suggests a degraded state while the equipment was in GMP use.
10. **Review performance periodically.** Retrain under change control.

### 5. Domain model

**Existing CMMS entities (reused):**
- **Asset**: criticality, classification and specs.
- **Meter**: `GAUGE`/`COUNTER`, thresholds, condition.
- **MeterReading**: source `IOT_TELEMETRY`, `CONNECTOR_HUB` or `SCADA`.
- **MeterTrigger**.
- **FailureCode**: `PROBLEM`, `CAUSE`, `REMEDY`.
- **JobPlan**: tasks, including `CALIBRATION`.
- **MaintenanceRequest**.
- **WorkOrder**: failure attribution and sign-off.

**New:**
- **AssetGmpProfile**: GMP impact, qualification status, calibration programme.
- **CalibrationRecord**: as-found, as-left, tolerance, out-of-tolerance flag → impact assessment.
- **TelemetryTag**: maps a historian tag to an asset or meter, with a GMP or non-GMP flag.
- **HealthModel** → **ModelVersion** (F1): asset class, failure modes covered, training window.
- **HealthScore**: a time series of features.
- **Prediction**:
  - asset and failure mode (ISO 14224 / CMMS codes);
  - lead-time estimate with an interval;
  - confidence;
  - contributing tags;
  - an evidence snapshot.
- **Prediction → MaintenanceRequest** (source `PREDICTIVE`) → WorkOrder → failure attribution → **FeedbackLabel**:
  confirmed, false, or unconfirmed.
- **GmpImpactAssessment** → QMS deviation (F3).

### 6. Specification set to write

**URS:**
- **PROC-4-URS-001** A prediction creates a CMMS request with the source `PREDICTIVE` and a link to its evidence. It
  never creates a work order directly.
- **PROC-4-URS-002** No prediction changes an asset's status, qualification, PM schedule or calibration interval.
- **PROC-4-URS-003** Each prediction shows the failure mode, the lead-time interval, the confidence and the top
  contributing tags.
- **PROC-4-URS-004** A rejected request needs a reason, which is kept as a feedback label for the model.
- **PROC-4-URS-005** A model is enabled for an asset class only after an approved backtest that meets the declared
  thresholds.
- **PROC-4-URS-006** On qualified equipment, a confirmed failure prompts the planner to record whether a GMP impact
  assessment is needed.
- **PROC-4-URS-007** Data from non-GMP sensors are labelled as such wherever they are shown.
- **PROC-4-URS-008** Calibration out-of-tolerance results require an impact assessment before the work order can be
  signed off.

**Functional requirements (Given/When/Then):**
- **PROC-4-FR-01**
  - *Given* an enabled model,
  - *when* the anomaly score exceeds its threshold for the configured persistence,
  - *then* exactly one open request exists for that asset and failure mode. A repeat alert updates the evidence and
    does not duplicate the request.
- **PROC-4-FR-02**
  - *Given* a predictive request,
  - *when* the planner accepts it,
  - *then* a work order is created through the existing triage path, with the evidence attached.
- **PROC-4-FR-03**
  - *Given* any prediction,
  - *when* it is processed,
  - *then* the asset's status and PM schedule versions are unchanged. This is a scripted negative test.
- **PROC-4-FR-04**
  - *Given* a work order on a qualified asset,
  - *when* it is completed,
  - *then* return to service needs the e-signatures the asset's GMP profile requires.
- **PROC-4-FR-05**
  - *Given* a model with fewer than the minimum number of labelled failures for a failure mode,
  - *when* lead time is requested,
  - *then* it shows "lead time not computed: insufficient failure history".
- **PROC-4-FR-06**
  - *Given* missing telemetry for longer than the configured window,
  - *when* the model is scored,
  - *then* it reports "no score: data gap" and raises a data-quality alert, not a health alert.

**Non-functional requirements (proposed; confirmed by `reliability_engineering_specialist` from the backtest):**
- A score is available ≤ 15 min after the data arrive.
- A request is created ≤ 5 min after an alert qualifies.
- Telemetry ingestion stays within the existing batch limit of 500 readings per call. Features are computed at the
  edge; vibration waveforms stay on site.
- Accuracy needed before an asset class is enabled:
  - backtest precision ≥ 0.5;
  - recall ≥ 0.6 for the targeted failure modes;
  - ≤ 1 false alert per asset per month.
- Availability: 99.5%.

**AI model specification:**
- **Intended use:** recommending work for named failure modes.
- **Data:** the healthy-window provenance and the CMMS failure history.
- **Metrics:** precision, recall, and the lead-time distribution.
- **Human oversight:** planner triage.
- **Drift monitoring:** the false-alert rate and changes in feature distributions.
- **Change control:** retraining is a new version.

### 7. Fit with GigaLibs

**Reuse (verified in the repository):** CMMS assets, classifications and `specs`; meters with thresholds and a derived
`condition`; `POST meters/telemetry/batch` ingestion; meter triggers (`THRESHOLD_BREACH`, `USAGE_INTERVAL`; work-order
`trigger_source` `METER_TRIGGER`); failure codes and failure attribution; job plans; requests
(`PENDING → ACCEPTED/REJECTED`); four-eyes sign-off; Workforce staffing; Geospatial sites; the outbox
`cmms.facts.v1`. The Assistant answers "why did this asset alert?" with evidence and citations and drafts a technician
brief; it never accepts a request.

**Gaps (additive V1 fields and new tables):** a request source and evidence link; a GMP profile and qualification
status; calibration records; Part 11 signatures (F2); work-order types `CALIBRATION` and `PREDICTIVE`; mobile push
(`communications` is dormant).

**New:** a `predictive-maintenance` engine in F5; an edge feature collector (F4).

### 8. Implementation plan

| Slice | Scope | Size | Acceptance evidence | Validation deliverable |
| --- | --- | --- | --- | --- |
| P4-0 | CMMS GMP extension: GMP profile, qualification status, calibration records with out-of-tolerance → impact, return-to-service e-signature (owned by `maintenance_cmms_lead`; may be its own card) | M | Out-of-tolerance blocks sign-off; signature manifestation | CMMS supplier validation package (Cat 4) |
| P4-1 | Recommended-work path: request source `PREDICTIVE`, evidence link; existing meter thresholds raise requests | S | Idempotency; status-unchanged negative tests | Boundary test scripts |
| P4-2 | Historian or edge feature ingestion into meters (F4) | M | 72 h buffer; no duplicates | Interface specification |
| P4-3 | Multivariate anomaly model per asset class (PCA T²/SPE on features), with contributions | L | Backtest report meets thresholds | Model specification and backtest |
| P4-4 | Model registry use, approval to enable, feedback labels | M | Enable refused without backtest | Model lifecycle SOP template |
| P4-5 | Failure-mode classification and lead time, only where history supports it | M | "Not computed" path | Updated model specification |
| P4-6 | Mobile alert to technicians, with evidence | S | Delivered offline-safe | Usability check |

### 9. Risks and open questions

- **Failure history in a new tenant is thin.** Expect rule-based condition monitoring (P4-1) to give value long before
  ML does.
- **Training on a window that already has incipient faults** teaches "normal" wrongly. The reliability engineer
  confirms every baseline.
- **Pressure to extend PM intervals** on predictions is a GMP change. QA must own it.
- **Open question:** does the first customer have a historian, and condition-monitoring sensors on the target assets?

### 10. Agents and humans responsible

- **Roster:** `maintenance_cmms_lead` (lead for P4-0 and P4-1), `reliability_engineering_specialist`,
  `industry_pharma_life_sciences`, `quality_regulatory_specialist`, `industry_manufacturing`, `field_mobile_lead`,
  `ergonomics_human_factors`, `ai_engineering`, `integration_connectors`, `qa_spec`, `security_reviewer`.
- **New specialists:** `industrial_data_ot_specialist`, `ai_model_validation_specialist`, `csv_csa_validation_specialist`.
- **Named humans:** the customer's maintenance or engineering manager (enables models); a reliability engineer
  (baselines and backtests); the QA approver (GMP impact and return to service); the owner.


<!-- pagebreak -->

# 7D. Engineering, document and quality intelligence

**Prepared by:** the pharma and life-sciences practice (`industry_pharma_life_sciences` with
`quality_regulatory_specialist`), 2026-10-19.

**Status:** draft for the owner and for a named pharma QA expert. No pharma expert has validated it yet
(ORGANIZATION.md §7 requires one before code depends on it).

**Sources:**
- the owner's specification, family section (extracted lines 531–755) and the method section (lines 902–1010);
- the GigaLibs repository, read-only: module manifests, migrations, plan v3 and ADR-0016.

The source's numbers (accuracy, productivity, OEE, tickets handled) are vendor claims. They are not used as targets
here. Every threshold below is a proposed target that is measured on the customer's own data and agreed with the
customer's QA.

---

## Family overview

### What the family is for

A pharma manufacturer or CDMO runs on controlled documents and qualified equipment. This family covers four jobs:

| Code | What it does | Who mainly uses it |
| --- | --- | --- |
| ENG-1 | Reads engineering drawings and keeps the plant's asset, instrument and calibration registers true to the as-built drawings | Engineering, C&Q, maintenance |
| ENG-2 | Turns incoming GMP documents into verified data while keeping the original | QC, QA, supplier quality |
| ENG-3 | Helps run and qualify visual inspection | Sterile and packaging operations, QA |
| ENG-4 | Plans production within GMP constraints | Planning, production, QA |

All four are **assistive**: a named person confirms every output before it changes a record.

### What exists in GigaLibs today (verified in the repository, 2026-10-19)

- **CMMS (production):**
  - assets with a unique `asset_tag`, a parent hierarchy, site, criticality and status;
  - PM schedules, planned and unplanned downtimes, meters, work orders;
  - supervisor sign-off with a four-eyes rule;
  - an `audit_events` table (actor, action, entity, JSON payload).

  Asset classifications and parametric specifications exist in code (migration 000016, WI-EAM-002) but are **not
  deployed or reviewed**. They move to M-CM2 in plan v3.
- **Inventory (production):** lots with supplier lot number, `expiry_date`, and the statuses `QUARANTINED`,
  `INSPECTION`, `AVAILABLE`, `BLOCKED` and `EXPIRED`. It also has quarantine warehouses and locations.
- **Document scanner (built, frozen by the owner on 2026-09-28, ADR-0016 F6):**
  - Useful: intake with a SHA-256 checksum, a quarantine status, a job state machine, extracted and corrected data
    kept apart, and `approved_by`.
  - **Truth defects:**
    - when a field is missing, the parser fills a default: an invoice number made from a timestamp, today's date,
      a due date 30 days ahead, or USD;
    - field "confidences" are fixed constants, not model outputs;
    - three adapters, labelled as two cloud document services and an in-VPC model, all run the same local text
      parser, even when an endpoint is configured;
    - its tables enable row-level security but do not force it.

  These break the "zero mock data" and "no fabricated results" rules and must be fixed before any reuse.
- **E-signature (built, frozen):**
  - envelopes and recipients, with hash-chained audit events and forced RLS;
  - its manifest says "no legal-signature compliance is claimed";
  - it has no Part 11 signature meaning, no re-authentication at signing and no binding of the signature to a GxP
    record.
- **Not available:**
  - a Python scientific-compute runtime (ADR-0016 F12 parks the old plane until the AI gateway, C11, is designed);
  - an OPC-UA connector, a historian, and LIMS, MES or EDMS connectors;
  - a quality-management module (deviations, CAPA, complaints): plan v3 §7D, owner decides;
  - a Manufacturing module (U24, Phase 6).

**Family-wide gap.** GigaLibs has not been validated as a GxP supplier. A pharma customer that uses CMMS or Inventory
for GMP equipment or materials will expect a supplier documentation pack: Annex 11 §3, and supplier involvement as
GAMP 5 describes it. Today's evidence rules (tests that fail before and pass after, Security review, journeys) are a
strong base, but they are not that pack.

### GxP map at a glance

| Module | Classification | GAMP 5 category | First useful slice | Full scope |
| --- | --- | --- | --- | --- |
| ENG-1 Drawing intelligence | GxP-adjacent: proposals are confirmed in the target register. It becomes GxP if GigaLibs becomes the system of record for GMP drawings. PSM process safety information where PSM applies. | 4 (vision models: Category 5 components, assistive) | M | XL |
| ENG-2 Document processing | GxP for CoA, batch-record and complaint flows. GxP-adjacent for SOP Q&A and supplier summaries. Non-GxP for invoices. | 4 (extraction templates and models: Category 5) | S (truth fixes), then L (Part 11 foundation) | XL |
| ENG-3 Vision inspection | GxP. Mode A: AI suggests and a human decides (non-critical). Mode B: AI decides (critical use under the draft Annex 22). | 4 platform, 5 model; the inspection machine is qualified under Annex 15 | L (governance, no AI) | XL (Mode B per customer) |
| ENG-4 Planning digital twin | GxP-adjacent: the GMP constraint library is approved by QA, and execution stays in GMP systems. Forecasting is non-GxP. | 4 (optimiser: Category 5 component, low GxP risk) | L | XL |

### Recommended order, and why

1. **F0: shared GxP evidence foundation (L).**
   - Contents: Part 11 e-signature (meaning, re-authentication, record binding), a verification queue with the source
     side by side, a write-once store for originals, and an audit trail with old and new values and a reason.
   - Why first: ENG-1, ENG-2 and ENG-3 all need it, and other pharma families will too. It reuses the e-signature
     audit chain and the scanner's intake.
2. **ENG-2** (from the scanner's truth fixes onward).
   - It has the most reuse, and its first slices run without Python: text from native PDFs, and tesseract.js (WASM)
     for printed scans.
   - The CoA flow links straight to the Inventory lots in production.
3. **ENG-1.**
   - It extends CMMS, GigaLibs' strongest module, with register reconciliation and revision impact.
   - Its first three slices are deterministic: structured imports and PDF text layers.
4. **ENG-4.**
   - It reuses four production modules (CMMS, Inventory, Procurement, Workforce).
   - Its first slice (a GMP constraint checker) needs no optimiser.
   - It needs a decision on recipes, because Manufacturing (U24) does not exist yet.
5. **ENG-3.**
   - It has the heaviest validation and needs GPU compute and image storage.
   - Its decision-making form (Mode B) only makes sense with a named customer and an equipment maker.

**Placement in plan v3.** Plan v3 puts the document scanner and e-signature in Phase 6 (M-U29). Quality management
and document intelligence are in §7D, where the owner decides. So this family sits after the current plan order unless
the owner names a pharma customer.

### Family-wide decisions for the owner

| # | Decision | Detail |
| --- | --- | --- |
| D1 | Scientific compute service (ADR) | A service behind the module API with signed module context, versioned model artefacts and GPU for vision. It decides Python or JVM for OR-Tools CP-SAT and Timefold. Without it, these slices are blocked: ENG-1 S4–S5, ENG-2 S7, ENG-3 S3 and S5, ENG-4 S3 and S6. Every engine says "not computed" when it is absent. |
| D2 | Where Part 11 lives | E-signature and write-once storage in the kernel or in a module. Recommendation: the kernel, because every GxP module needs them. |
| D3 | GigaLibs as a GxP supplier | A quality system for GigaLibs' own SDLC, and a supplier validation pack. |
| D4 | Data use | Tenant data (drawings, CoAs, images) never trains models for other tenants without the tenant's written consent. |

---

## ENG-1: Engineering drawing intelligence

### 1. Purpose and users

ENG-1 turns engineering drawings into verified plant data and links that data to the CMMS asset register, the
calibration programme and the qualification records.
- **Drawings:** P&IDs, piping isometrics, equipment general arrangements and instrument loop diagrams.
- **Plant data:** equipment list, instrument index, line list and valve list.
- **Revision comparison:** it shows what changed between revisions, so that a change can be assessed.

**Users:** process and utility engineers, instrument and electrical engineers, document controllers, C&Q engineers,
maintenance planners, reliability engineers, process safety engineers, and QA (for GMP systems).

**Pharma and CDMO value:**
- new product introduction into multi-product suites, and plant expansions;
- legacy plants whose drawings exist only as scans;
- building a CMMS asset register from drawings (which also helps the W6 set-up wizard).

### 2. What the specification asks for

- **Ingest** PDF (native and scanned), DWG and DXF in batches of 1,000+ sheets, with OCR (source FR-K101; row 001).
- **Extract** equipment and instrument tags, pipe and cable specifications and P&ID symbols (FR-K102), claimed at
  98% (symbols) and 99% (tags); custom symbols in under four hours.
- **BOM/BOQ** per drawing set in minutes, with export (FR-K103, row 002); **revision delta**, tag-level and visual
  (FR-K104, row 003); **cable routing** (row 004); **ERP and PLM** integration both ways (FR-K105, row 005); four
  industry variants (FR-K106), replaced here by one process-plant variant.
- **Pipeline:** pre-processing, symbol detection, OCR, connectivity graph, aggregation. Engineers review only
  low-confidence items, and approved BOMs raise material requisitions automatically.

**What we change for a GMP plant:**
- every item that updates a register is confirmed by an engineer, not just the low-confidence ones;
- nothing is pushed to another system automatically;
- ENG-1 never edits a drawing.

### 3. GxP impact and validation approach

**Classification: GxP-adjacent.**
- Drawings of GMP systems are controlled documents and inputs to IQ (the P&ID walkdown). GMP systems include process
  equipment, water for injection, clean steam, and HVAC for classified areas.
- The instrument index feeds the calibration programme (21 CFR 211.68(a), 211.160(b)(4)).
- ENG-1 only proposes. The controlled drawing stays in the customer's engineering document management system (EDMS).
  A proposal becomes a record only when an engineer confirms it in the target register, under that register's
  controls.
- If the owner decides GigaLibs should be the system of record for GMP drawings, ENG-1 becomes GxP (§9).

**Process safety.**
- Where OSHA PSM (29 CFR 1910.119) or Seveso III applies, P&IDs are process safety information
  (1910.119(d)(3)(i)(B)), and changes go through management of change (1910.119(l); CCPS Risk Based Process Safety,
  "Management of Change").
- Relief and reaction-hazard bases (for example Stoessel criticality class assessments) belong to the same body of
  process knowledge.
- ENG-1 never alters process safety information. It only links to it.

**GAMP 5:**
- the module is Category 4: tag grammars, symbol libraries and templates are configured per tenant;
- the vision and OCR models are custom (Category 5) components with an assistive role, treated under GAMP 5 Second
  Edition Appendix D11 and as "non-critical with a human in the loop" in the sense of the draft Annex 22 (draft; verify
  wording).

**Assurance (CSA-style):**

| Kind | What |
| --- | --- |
| Scripted | The confirmation gate (no register write without an authorised confirmation; four-eyes for GMP-critical assets). The deterministic tag parser and revision diff, against golden sets. The two-way reconciliation. |
| Unscripted | Viewer, overlay and editing. One exploratory session by an engineer on a real drawing set, recorded. |
| Evidence | Trace from URS to FR to test; a model performance report on the customer's labelled sample. |

**Part 11, Annex 11 and ALCOA+.** These apply where a confirmation writes into a GxP register, for example CMMS used
for GMP equipment:
- an attributable confirmation: user, time, and the meaning "confirmed against drawing X revision Y";
- an audit trail with old and new values and a reason (Annex 11 §9);
- the source file kept unchanged with its checksum;
- a mandatory change-control or MOC reference for GMP-critical or PSI-flagged items.

An e-signature is needed only if the customer's procedure requires a signed approval of the register update (ask QA).

**Gap.** CMMS `audit_events` stores a JSON payload. Whether it always carries the old value, the new value and a
reason is not verified (verify).

### 4. Industry process it must follow

1. **Drawing control (EDMS).**
   - Each drawing has a number, a revision and a status: issued for review, then approval, then construction, then
     as-built.
   - An originator, a checker and an approver sign each issue.
   - ENG-1 reads drawings; it never issues them.
2. **Change.**
   - GMP change control applies (ICH Q10 change management; EU GMP Annex 15 change control), and MOC where PSM
     applies.
   - Decision points: is there GMP impact (system impact assessment, ISPE Baseline Guide Vol. 5, C&Q 2nd ed.)? Is
     process safety information affected? Is requalification needed?
3. **Execution.** Field red-line mark-ups.
4. **Verification.**
   - A P&ID walkdown during IQ (EU GMP Annex 15; ASTM E2500).
   - A pre-startup safety review where PSM applies (1910.119(i)).
   - Hygienic piping isometrics checked for slope, drainability and weld documentation in the turnover package
     (ASME BPE).
5. **As-built.** Document control revises and re-issues the drawing.
6. **Downstream updates.**
   - The asset register and the instrument index.
   - The calibration master, with instrument criticality (GMP-critical, non-critical, reference), following the
     ISPE good practice guide on calibration management (verify edition).
   - Spare parts and PM plans.

**Standards:**
- symbols: ANSI/ISA-5.1, ISO 10628-2 and IEC 62424;
- data exchange: DEXPI, the open P&ID exchange specification based on ISO 15926.

Where a structured export exists, it is preferred to vision.

**Where ENG-1 helps:** step 2 (an impact list from the revision delta), step 4 (walkdown checklists) and step 6
(update proposals). It replaces no approval.

### 5. Domain model

| Entity | Main fields and links |
| --- | --- |
| **Drawing** | number, type (P&ID, isometric, GA, loop, electrical), discipline, system, site and area (Geospatial), EDMS reference, GMP-impact flag, PSI flag |
| **DrawingRevision** | revision, status, issue date, EDMS approval reference, source file (format, SHA-256). One drawing has many revisions. |
| **ExtractionRun** | revision, engine and version (text parser, OCR, detector, structured import), coverage statistics |
| **ExtractedItem** | run, kind (equipment, instrument, line, valve, symbol), tag text, parsed ISA-5.1 parts (function letters, loop number), attributes (size, pipe class, material), page and bounding box, source, confidence (models only), status (proposed, confirmed, corrected, rejected) |
| **TagIdentity** | the canonical plant tag, unique per site. Links items across revisions to a CMMS Asset (`asset_tag`) and to calibration records. |
| **Connection** | from item, to item, line number (the connectivity graph; a later slice) |
| **RevisionDelta** | added, removed and changed items, and attribute differences, between two revisions |
| **ChangeImpactReport** | from a delta: affected assets, PM schedules, instruments due a calibration review, linked qualification and SOP references, change-control number |
| **RegisterUpdateProposal** | target (asset, specification, meter), payload, confirmer, decision, link to the audit entry |

### 6. Specification set to write

**URS highlights**
- **ENG1-URS-001:** Import PDF (native and scanned), DXF and structured exports (DEXPI XML, instrument-index CSV), and
  keep each source unaltered with its SHA-256 checksum.
- **ENG1-URS-002:** Extract instrument and equipment tags with page, location and source (text layer, OCR, model or
  import).
- **ENG1-URS-003:** Show every item with its source and, for model output, its confidence, linked to its place on the
  sheet.
- **ENG1-URS-004:** Change no asset, calibration or document record without confirmation by an authorised engineer,
  recorded with user, time and drawing revision.
- **ENG1-URS-005:** Reconcile both ways with the CMMS register: tags on the drawing that are missing from the register,
  register tags missing from the drawing, and attribute mismatches.
- **ENG1-URS-006:** Produce a tag- and attribute-level delta between two revisions, with sheet coordinates.
- **ENG1-URS-007:** Produce a change-impact list from a delta.
- **ENG1-URS-008:** Highlight the regions of a sheet where nothing was recognised.
- **ENG1-URS-009:** Require a change-control or MOC reference before confirming changes to GMP-critical or PSI-flagged
  items.
- **ENG1-URS-010:** Isolate each tenant's drawings; never use them to train another tenant's models without written
  consent.

**Key functional requirements**

1. **Deterministic extraction.**
   - Given a native PDF P&ID with a text layer and the tenant's tag grammar,
   - when extraction runs,
   - then every string that matches the grammar is listed with page, bounding box and source "text layer", and no item
     is listed that does not appear in the text layer.
2. **Confirmation gate.**
   - Given 40 proposed items, when a user without `drawings:confirm` applies them, then nothing is written and the
     attempt is audited.
   - When an authorised engineer confirms 38 and rejects 2, then exactly 38 CMMS changes are made, each audited with
     the drawing revision.
   - When the proposer of a change to a CRITICAL asset tries to confirm it, then it is refused (four-eyes).
3. **Reconciliation.**
   - Given a register of 1,200 tags and a drawing set with 1,180 tags, 1,150 of which match,
   - when reconciliation runs,
   - then it reports 30 tags found only on the drawings, 50 found only in the register, and the attribute mismatches,
     each with a link.
4. **Revision delta.**
   - Given revisions C and D of one sheet, where D adds FT-205 and changes the pipe class of line 2"-PW-104,
   - when the comparison runs,
   - then the delta lists one addition and one attribute change with coordinates, and nothing else.
5. **Change reference required.** Given a PSI-flagged drawing, when an engineer confirms an update without an MOC or
   change-control reference, then the confirmation is blocked.
6. **Not computed.**
   - Given a scanned sheet and no vision engine available,
   - when extraction is requested,
   - then the run ends "not computed: vision engine unavailable", and no items are created.

**Non-functional requirements**
- **Speed:**
  - text-layer extraction: 10 s p95 per sheet or less;
  - a 500-sheet set in 90 minutes or less (queued);
  - revision delta: 30 s p95 per sheet pair or less.
- **Files:** up to 1,000 sheets per batch, and files up to 200 MB each. The scanner's 25 MB limit must be raised in
  the storage design.
- **Availability:** 99.5% in customer working hours. ENG-1 is not on a real-time path.
- **Retention:** revisions, runs and confirmations are kept for the life of the plant, or as the customer's policy
  says. Process safety information is kept for the life of the process under PSM (verify).
- **Proposed AI targets** (agreed per customer after a baseline measurement):
  - text-layer tags on vector PDFs: recall at least 99%, precision at least 99.5%;
  - scanned sheets at 300 dpi or more: tag recall at least 95%, precision at least 98%;
  - symbols: per-class precision and recall reported, and any class below 90% recall is labelled "assist only".

**AI model specification**

| Item | Specification |
| --- | --- |
| Intended use | Propose tags, symbols and line attributes from raster or scanned drawings. Never decides. |
| Data | Tenant-owned labelled drawings, plus symbol classes from public standards. Train, validation and test sets are split by drawing (not by symbol) to avoid leakage. The test set is frozen and versioned. |
| Metrics | Per-class precision and recall; exact tag match; sheet coverage; confidence calibration; correction rate in use |
| Human oversight | 100% confirmation before any register update. The uncovered-region overlay and two-way reconciliation guard against omissions. |
| Drift | Alert when the correction rate per symbol class reaches twice the validation baseline |
| Change control | The model version is pinned per run. A new version is activated only after a frozen-set report. There is no online learning: corrections are kept only as candidate training data. |
| Licences | The most widely used YOLOv8 implementation is AGPL-3.0. Prefer torchvision detectors (BSD), Detectron2 or MMDetection (Apache-2.0), and Tesseract or PaddleOCR (Apache-2.0). The licence reviewer decides. |

### 7. Fit with GigaLibs

**Reuse:**
- **CMMS:** assets, hierarchy, criticality, PM schedules, meters, the four-eyes sign-off pattern and audit. The specs
  update depends on the M-CM2 release of the EAM classifications and specifications.
- **Geospatial:** sites and spaces.
- **Scanner:** the intake pattern only, not its invoice parser.
- **F0:** the shared GxP evidence foundation.
- **Connector Hub:** to sync EDMS references (no EDMS connector exists today).
- **Assistant:** answers questions such as "which instruments changed on P&ID 101 between revisions C and D?" from
  confirmed data, citing sheet locations. It proposes register updates for confirmation (GU rules).

**New:**
- a module `engineering-drawings` with its own schema and forced RLS;
- dictionary windows: Drawings, Revisions, Extraction review, Reconciliation, Change impact.

**Engines:**
- **TypeScript, deterministic:** pdf.js (Apache-2.0) text layer, a permissive DXF parser, the ISA tag grammar, and the
  delta.
- **Compute service (D1):** OCR and symbol detection for scans.
- **DWG:** needs a licensed SDK or conversion on the customer's side. LibreDWG is GPL-3.0.

**Decisions needed:** D1; the DWG route; whether GigaLibs becomes the system of record for drawings; the M-CM2 timing.

### 8. Implementation plan

| Slice | Scope | Size | Acceptance evidence | Validation deliverables |
| --- | --- | --- | --- | --- |
| S1 | Drawing register (reference copies with EDMS reference); structured imports (DEXPI, instrument-index CSV); two-way reconciliation with CMMS | M | Reconciliation golden-set tests fail before and pass after; UAT journey on a non-confidential sample plant | URS, GxP-adjacent risk assessment, trace matrix |
| S2 | Text-layer extraction from native PDF and DXF; verification queue; confirmation gate into CMMS with four-eyes | M | Parser golden tests; gate negative tests; audit entries | Scripted gate protocol; performance report on the customer's sample |
| S3 | Revision delta and change-impact report | M | Delta golden set; a C&Q engineer accepts an impact report on a real change | User acceptance record |
| S4 | Scanned drawings: OCR and symbol detection through the compute service; uncovered-region overlay | L | Frozen-set report against the targets; drift monitor live | Model spec, test-set manifest, performance report |
| S5 | Connectivity graph (line list, loop membership); IQ walkdown checklists | L | Accepted by C&Q on a real system | Test record |

**Deferred:** cable routing, and BOQs that raise purchase requisitions (later, through Procurement, with buyer
confirmation).

### 9. Risks and open questions

- **System of record** for GMP drawings: GigaLibs or the EDMS? (owner and customer QA)
- **Omissions.** A missed instrument may never be calibrated. Is two-way reconciliation against the existing
  calibration master mandatory before go-live? (QA)
- **Confidentiality.** Drawings are customer intellectual property and may be export-controlled (verify). Hosting and
  training consent need settling.
- **Licences:** DWG libraries and AGPL detectors (licence reviewer, legal adviser).
- **CMMS not validated for GMP use**, and the EAM specifications are not deployed.
- **Source claims** of 98–99% accuracy and over 90% productivity are unverified.

### 10. Agents and humans responsible

- **Lead:** `maintenance_cmms_lead` (registers), with `industry_pharma_life_sciences` and `documents_lead`.
- **Consulted:** `reliability_engineering_specialist` (criticality, calibration), `health_safety_environment_specialist`,
  `quality_regulatory_specialist`; engineering (`solution_architecture`, `api_contracts`, `backend_domain`,
  `web_experience`, `integration_connectors`); design (`product_designer`, `ergonomics_human_factors` for side-by-side
  review screens used all day).
- **Prove and review:** `qa_spec`, `test_automation`, `licence_ip_reviewer`, `security_reviewer`, `code_reviewer`.
- **New roles recommended:** `engineering_document_control_specialist`, `process_safety_specialist`,
  `csv_csa_validation_specialist`, `computer_vision_engineering`, `scientific_compute_engineering`.
- **Humans:** the owner (scope, acceptance, release); the customer's engineering manager (process owner), QA
  (classification, change-control linkage) and process safety manager (MOC, PSI); a named pharma expert and the
  named Security reviewer (plan v3 0.7b), neither named yet; a legal adviser for licences.

---

## ENG-2: Intelligent document processing

### 1. Purpose and users

ENG-2 captures the GMP documents that arrive from outside or on paper and turns them into verified, structured data in
the right GxP record, while keeping the original. The documents are:
- supplier certificates of analysis (CoAs);
- executed batch records;
- SOPs;
- supplier qualification documents;
- complaint and deviation reports.

**Users:** goods receiving, QC analysts and reviewers, QA document control, QA batch-record reviewers, supplier quality,
complaint handlers, and every employee (for SOP questions). Finance AP uses the same engine for invoices (non-GxP,
Phase 5B).

### 2. What the specification asks for

- **Ingest** email, PDF, Word, Excel and images (FR-K201); **classify** type, intent and priority (FR-K202; row 001:
  10+ configurable types, 95% after 200 examples, configurable threshold); **extract** fields per type (FR-K203);
  **route** (FR-K204); **act**: ticket, record update or reply (FR-K205); eight languages (FR-K206).
- Invoice extraction with PO match (row 002); email triage to a ticket with an automatic reply within 60 s (row 003);
  SOP Q&A with a cited section, under 5 s, hallucination under 1% (row 004); low-confidence items to human review,
  with corrections fed back to the model (row 005).
- **Pipeline:** layout, classification, entity extraction, rule validation, action; a no-code studio; weekly
  retraining. **Pharma uses:** CoA extraction into LIMS, batch-record routing, deviation triage to CAPA, submission
  indexing, supplier audit summaries.

**What we change:**
- **No automatic action on a GxP record.** Any write waits for human verification.
- **Complaint acknowledgements:** an automatic reply is only an acknowledgement, and only after the message is
  registered.
- **Retraining:** weekly retraining becomes controlled model versions.
- **Throughput:** the claims (10,000 documents an hour, a million tickets) are not targets.

### 3. GxP impact and validation approach

**Classification:**
- **GxP:** the flows that create GMP records. CoA data used in material disposition, batch-record review aids, and
  complaint intake.
- **GxP-adjacent:** SOP Q&A (the effective SOP is the record) and supplier audit summaries (the auditor writes the
  report).
- **Non-GxP:** invoices and general email.

**GAMP 5:**
- the platform is Category 4: document types, field classes, routing and templates are dictionary configuration;
- extraction models and templates are Category 5;
- machine transcription is treated like manual transcription, so critical data gets the additional accuracy check that
  Annex 11 §6 asks for. Here a second person provides it;
- with 100% human verification, AI use is "non-critical with a human in the loop" under the draft Annex 22. That draft
  also says generative models should not be used in critical GMP applications (draft; verify wording).

**Assurance (CSA-style):**

| Kind | What |
| --- | --- |
| Scripted | Field-class routing; the verification gate; signature and audit trail; specification comparison (units, limits, rounding, boundary values); "not extracted" behaviour; the complaint safety net; retention locks |
| Unscripted | UI; new supplier layouts; exploratory sessions with QC reviewers |
| Evidence | Per-field-class performance on a frozen test set; test records; a supplier validation pack |

**Part 11, Annex 11 and ALCOA+:**
- **Original:** the received file is stored unaltered (write-once, SHA-256). Extractions are derived data linked to
  it.
- **Paper:** paper is destroyed only under a validated true-copy process (MHRA GXP Data Integrity Guidance, 2018; PIC/S
  PI 041-1). The default is to keep the paper.
- **Attributable and contemporaneous:** who received the document and when; who verified it and when; which model and
  template versions ran.
- **Audit trail** (§11.10(e); Annex 11 §9): every create and change, with old and new values and a reason. It cannot
  be edited, and earlier values are never obscured.
- **E-signature:**
  - §11.50: name, date and time, and meaning;
  - §11.70: the signature is bound to the record;
  - §11.100 and §11.200: unique to one person, with re-entry of at least the password at each signing in a session;
  - Annex 11 §14.

  This needs the F0 Part 11 slice. The current e-signature module does none of this.
- **Access:** role and site scope. For Class A fields the verifier is never the uploader.
- **Retention:**
  - per record class;
  - batch records at least one year after batch expiry (21 CFR 211.180(a)), and longer under EU GMP Chapter 4
    (verify);
  - legal hold;
  - readable for inspection (Annex 11 §17).

### 4. Industry process it must follow

**A. Incoming material with a supplier CoA** (21 CFR 211.84; ICH Q7 §7.3; EU GMP Chapter 5)
1. Receive the material; the lot status becomes quarantined (Inventory).
2. Sample it.
3. Always run at least one identity test.
4. Accept the CoA in place of other tests only for qualified suppliers whose results are periodically verified
   (211.84(d)(2)).
5. QC compares results with the specification.
6. QC review.
7. QC or QA decides release or rejection.

ENG-2 transcribes the CoA, compares it with the specification deterministically, and flags differences. It never
releases a lot.

**B. Executed batch record review** (211.188, 211.192; EU GMP Chapter 4, Annex 16)
1. Production review.
2. QA review.
3. Deviations closed.
4. QA release, or QP certification in the EU.

ENG-2 indexes pages and flags candidate exceptions: missing entries or signatures, out-of-range values, and
corrections that break good documentation practice. Until QA has validated the aid for review by exception, the
reviewer still reviews the whole record.

**C. SOP lifecycle** (EU GMP Chapter 4; ICH Q10)
- Draft, review, approve, train, effective, periodic review, superseded.
- Q&A answers only from effective versions, cites document number, version and section, marks each answer
  "information only", and refuses when no effective source exists.

**D. Complaints and adverse events** (211.198; EU GMP Chapter 8; GVP Module VI for pharmacovigilance)
- Any message that may be a complaint or an adverse event is registered and goes to a human. Nothing is auto-closed.
- Reporting clocks start at receipt (verify per jurisdiction).

**E. Supplier documents** (EU GMP Chapter 7; ICH Q7 on supplier evaluation and contract manufacturers)
- Summaries assist the reviewer; QA approves the supplier status.

**Roles:** receiver, QC analyst, QC reviewer, QA reviewer, document controller, QP, complaint handler, pharmacovigilance
officer.

### 5. Domain model

| Entity | Main fields and links |
| --- | --- |
| **SourceDocument** | file, SHA-256, channel, received by and when, retention class, legal hold |
| **DocumentType** | the types, and their FieldDefinitions: key, data type, unit, field class (A critical, B important, C metadata) |
| **ExtractionTemplate or Model** | version, status, approved by |
| **ExtractionRun** | document, versions, timing |
| **ExtractedField** | value, unit, page and bounding box, confidence (model output only), status (proposed, verified, corrected, not extracted) |
| **VerificationTask** | verifier, decision, reason, Signature |
| **CoARecord** | supplier, manufacturer, material, supplier lot, manufacture date, expiry or retest date, and test lines (test, method, result, unit, stated limit, stated conclusion) |
| **Specification and TestLimit** | QA-approved, versioned |
| **ComparisonResult** | deterministic, cites the specification version |
| **TargetLink** | Inventory lot, complaint, SOP version |
| **AuditEvent** | the audit trail |

### 6. Specification set to write

**URS highlights**
- **ENG2-URS-001:** Keep every received document unaltered, with checksum, time, channel and receiver; derived data
  always links to it.
- **ENG2-URS-002:** Give every field a class (A, B or C), configured by the tenant and approved by QA.
- **ENG2-URS-003:** No Class A value enters a GxP record until a named person other than the uploader has verified it
  against the source image and signed with the meaning "verified".
- **ENG2-URS-004:** When a field cannot be read, record "not extracted". Never fill a default, a guess or today's
  date.
- **ENG2-URS-005:** Compare CoA results with the approved specification deterministically and show the basis.
- **ENG2-URS-006:** Keep an immutable audit trail with old and new values, user, time and reason.
- **ENG2-URS-007:** SOP answers cite an effective version and section, or refuse.
- **ENG2-URS-008:** Any possible complaint or adverse event, and any item below the classifier threshold, goes to a
  human queue.
- **ENG2-URS-009:** Record model and template versions on each run; changes go through change control.
- **ENG2-URS-010:** Apply retention and legal hold per record class.

**Key functional requirements**

1. **Not extracted.** Given a CoA with no expiry date, when extraction runs, then expiry is "not extracted" (no
   value), and the task cannot be completed until the verifier enters the value or marks it "not stated on source".
2. **Verification gate.** Given a Class A field proposed from a document uploaded by user U, when U tries to verify it,
   then it is refused. When user V verifies, then a signature with V's name, time and meaning is bound to the field
   version.
3. **Specification comparison.**
   - Given assay 99.4% against a specification of 98.0–102.0% (version 3), when compared, then "within limit (spec v3)".
   - Given a result "<0.05%" against a limit "≤0.10%", when the rule cannot interpret the qualifier, then "not
     computed: non-numeric result", routed to the reviewer.
4. **Re-authentication.** Given an active session, when V signs, then the password is required again. A wrong password
   means no signature, and the attempt is audited.
5. **Complaint safety net.**
   - Given an email that mentions a broken vial and a patient reaction,
   - when it is classified,
   - then a possible-complaint record is created in the human queue within 5 minutes, and nothing is closed
     automatically.
6. **SOP refusal.** Given a question whose only matching SOP is superseded, then the answer says no effective SOP
   covers it and cites nothing else.
7. **Honest adapters.** Given a configured provider that cannot be reached, when extraction runs, then the run fails
   "provider unavailable". It never falls back silently to another parser.
8. **Original kept.** Given a correction, then `extracted_data` is unchanged, and the correction is stored as a new
   version with its reason.

**Non-functional requirements**
- **Speed:**
  - classification: 5 s p95 or less for native documents;
  - CoA extraction: 30 s p95 or less for native PDFs, and 120 s p95 or less for a 10-page scan;
  - verification screen: 2 s or less.
- **Capacity:** 2,000 documents a day per tenant to start (measured, not claimed).
- **Resilience:** availability 99.5%; RPO 15 minutes or less and RTO 4 hours or less (verify against the W4 backup
  work).
- **Proposed AI thresholds:**
  - Class A exact match: at least 98% on the frozen set. This is a productivity target; safety comes from 100%
    verification.
  - Per-type classification accuracy: at least 95%.
  - Complaint and adverse-event recall: at least 99% on the test set.
  - Reduced verification of Class B is allowed only after QA approves evidence that the 95% upper confidence bound on
    the error rate is 1% or less at the chosen threshold.
  - SOP Q&A: 100% of answers cite an effective version, and at most 1% of answers make an unsupported claim, judged by
    human graders on a QA-approved set of at least 200 questions.

**AI model specification**

| Item | Specification |
| --- | --- |
| Intended use | Transcription and classification proposals. Never disposition. |
| Data | Tenant documents. The test set is frozen, separate from tuning, and covers every active supplier template. Synthetic documents are never used as validation evidence. |
| Metrics | Exact match per field class, character error rate, confidence calibration, per-class classifier recall |
| Human oversight | The verification gates. Against automation bias: periodic proficiency checks with known-error documents, only in a training workspace, never in live records. |
| Drift | Correction rate per supplier template; alert when it reaches twice the baseline or a new layout appears |
| Change control | Versioned models and templates. No automatic retraining into production. |

### 7. Fit with GigaLibs

**Reuse:**
- **Scanner:** after S0 fixes, its intake, job states, extracted and corrected separation, and approval fields.
- **E-signature:** its hash-chained audit and storage; Part 11 is added in F0.
- **Inventory:** lots, expiry dates and the `QUARANTINED` and `INSPECTION` statuses (a CoA links to a lot).
  Disposition stays a human action in Inventory.
- **Procurement:** supplier and PO matching.
- **Workflow and rule studios** (built, not deployed) for routing.
- **Packages:** `audit-core` and `storage-core` (`storage-core` is unused today).
- **Assistant (W5):** SOP Q&A under the GU rules.

**Engines:**
- **No Python needed:** pdf.js for native PDFs, and tesseract.js (WASM, Apache-2.0) for printed scans.
- **Compute service (D1):** layout and table models, and handwriting.
- **LLM extraction through the AI abstraction:** only with a human in the loop, and with a qualified model provider
  and data residency (Annex 11 §3).

**Missing:** a QMS (deviations, CAPA, complaints); LIMS connectors; inbound email (Communications is not on UAT, and
N1 is outbound email).

**Decisions:** F0 placement (D2); whether ENG-2 holds CoA and specification records or waits for a QC module; a model
provider policy for GxP data.

### 8. Implementation plan

| Slice | Scope | Size | Acceptance evidence | Validation deliverables |
| --- | --- | --- | --- | --- |
| S0 | Scanner truth fixes: no defaults, honest adapters, real per-field status, forced RLS | S | Tests fail before and pass after | Defect record |
| S1 | F0: Part 11 e-signature, verification queue, write-once originals, audit with reason | L | Part 11 scripted protocol passes; Security review | Part 11 and Annex 11 trace, supplier pack v1 |
| S2 | GMP intake: classification by rules (supplier, template), retention classes | M | Golden documents classified; retention locks tested | Risk assessment |
| S3 | CoA extraction (native PDF, per-supplier templates), specification comparison, link to Inventory lot | L | Class A path scripted; at least 50 real CoAs per template (proposed); QC user acceptance | Performance report, user acceptance record |
| S4 | Printed scans through tesseract.js; per-field confidence; proficiency mode | M | Frozen-set report | Model spec |
| S5 | SOP Q&A in the Assistant (needs W5) | M | Graded question set | Evaluation record |
| S6 | Inbound email with the complaint and adverse-event safety net | M | Recall test; no auto-close (negative tests) | Risk assessment with pharmacovigilance input |
| S7 | Layout and table models; batch-record review aid (compute service) | L | Validated before any reduction in human review | Model spec, QA approval |

### 9. Risks and open questions

- **Automation bias** in verification (ergonomics, QA).
- **Handwriting** in executed batch records reads poorly. Should ENG-2 only index and flag those pages? (QA)
- **LLM-based transcription:** is it acceptable to the customer's QA, even with 100% verification, given the draft
  Annex 22?
- **Accepting a CoA in place of testing** depends on supplier qualification, which is outside ENG-2.
- **Rounding** follows the customer's rule and the USP General Notices (verify section).
- **Personal health data** in complaints (privacy specialist).
- **Owner decision:** unfreezing the scanner and e-signature ahead of Phase 6.

### 10. Agents and humans responsible

- **Lead:** `documents_lead`, with `industry_pharma_life_sciences` and `quality_regulatory_specialist`.
- **Consulted:** `inventory_warehouse_lead`, `procure_to_pay_lead`, `assistant_product_lead`; engineering
  (`ai_engineering`, `plugin_runtime` for the AI abstraction, `trust_safety_automation`, `tenant_identity_access` for
  re-authentication, `data_portability` for retention); `privacy_specialist`; design (`product_designer`,
  `ergonomics_human_factors`, `content_design`).
- **Prove and review:** `qa_spec`, `test_automation`, `privacy_compliance_reviewer`, `security_reviewer`,
  `code_reviewer`, `licence_ip_reviewer`.
- **New roles recommended:** `data_integrity_specialist`, `csv_csa_validation_specialist`,
  `ai_model_validation_specialist`, `pharmacovigilance_complaints_specialist`.
- **Humans:** the customer's QA head (field classes, gating), QC manager, QP (EU) and pharmacovigilance lead (EU QPPV
  where applicable); the owner; a named pharma expert; the named Security reviewer.

---

## ENG-3: Computer-vision inspection

### 1. Purpose and users

ENG-3 helps pharma plants run, qualify and improve visual inspection:
- **Parenteral 100% inspection:** visible particles, container and closure defects, fill level.
- **Packaging and labelling:** label presence and correctness, printed lot and expiry, codes, blister seals.
- **Tablet appearance.**

AI assists human inspectors and becomes a decision component only after qualification.

**Users:** inspectors, inspection supervisors, QA, validation engineers, packaging engineers, QC (particle
identification), production managers, and equipment engineers.

### 2. What the specification asks for

- **Ingest** NDT formats (DICONDE), DICOM, video, images and CSV (FR-K301); **detect** defects with location, size,
  class and severity (FR-K302); **train a new class** in under 6 hours from 50–200 examples, without deep-learning
  expertise (FR-K303, row 002); run 24/7 with alerts and line stop (FR-K304); MES, ERP and ticket integration
  (FR-K305); ultrasonic weld sizing over 99% (FR-K306).
- Sensitivity 98%+ and false positives under 2% (row 001); 30 fps+ at line speed (row 003); claimed 80% QA time
  savings (row 004); edge or air-gapped deployment (row 005).
- **Workflow:** configure, inspect live, reject or alert, shift report for QA sign-off, post to the batch record,
  monthly retraining with drift detection.

**Our reading:**
- **Welds and corrosion.** NDT of welds and corrosion is asset integrity and belongs with CMMS, under certified NDT
  personnel (ISO 9712). It is deferred.
- **Fast new defect classes.** Training a class in six hours does not fit qualification for a GMP accept or reject
  decision.
- **Monthly retraining.** Each retrain would be a change requiring requalification.

### 3. GxP impact and validation approach

**Classification: GxP.**
- Inspection results, rejects and AQL outcomes are batch-record data (21 CFR 211.188, 211.192; EU GMP Annex 1 for
  sterile products).
- **Mode A**, AI suggests and a human decides: GxP records, with AI in non-critical use.
- **Mode B**, AI decides accept or reject at line speed: a critical GMP application under the draft Annex 22 (draft;
  verify). The model becomes part of the qualified inspection machine.

**GAMP 5:**
- the platform is Category 4, and the model is Category 5 (GAMP 5 Second Edition Appendix D11);
- the machine with its embedded model is qualified under EU GMP Annex 15 (IQ, OQ, PQ) or verified under ASTM E2500.

**Assurance:**
- **Mode A:**
  - scripted tests for records, signatures, trend limits, AQL calculations and defect-kit bookkeeping;
  - unscripted tests for the review UI;
  - the human decision follows the existing qualified manual procedure.
- **Mode B:** full lifecycle.
  - URS and risk assessment: ICH Q9(R1), with an FMEA of missed defect types.
  - Qualification against a Knapp-characterised defect kit.
  - Comparison with manual inspection: automated reject-zone efficiency at least equal to manual, per critical
    class, and an agreed false-reject rate.
  - Robustness: lighting, container lots, fill volumes.
  - A locked, deterministic model.
  - Defect-kit challenges at start-up and at intervals. Annex 1 expects automated inspection to be validated as
    equal to or better than manual, and challenged with representative defects (section 8; verify paragraph).
  - Periodic review.

**Part 11, Annex 11 and ALCOA+:**
- each decision is attributable to an inspector, or to a machine with a model version;
- images of rejects, grey-zone units and AQL samples are kept as original evidence with checksums;
- reclassification has an audit trail;
- QA signs the batch inspection summary electronically;
- clocks are synchronised with the line, so records are contemporaneous;
- data transfers from machines are checksummed.

### 4. Industry process it must follow

**A. Parenteral inspection** (USP <790>, USP <1790>, EU GMP Annex 1)
1. Qualify the method (manual, semi-automated or automated).
2. Qualify inspectors with test sets, initially and periodically, including vision checks.
3. Inspect 100% of the batch.
4. Classify rejects as critical, major or minor.
5. Compare reject rates with alert and action limits derived from history. Exceeding one leads to an investigation.
6. Inspect a sample of accepted units against an AQL plan. <790> uses ANSI/ASQ Z1.4 or ISO 2859-1, general inspection
   level II, AQL 0.65% for visible particles (verify).
7. If the AQL inspection fails, investigate. Re-inspection is allowed only under a validated procedure.
8. QC identifies particles.
9. Record the results in the batch record; QA reviews and releases.

**Knapp-style qualification** (described in <1790>):
- each defect-kit unit is inspected many times by qualified inspectors to estimate its detection probability;
- units at or above 0.7 form the reject zone (verify);
- an automated method must match or beat manual reject-zone efficiency without an unacceptable false-reject rate.

**B. Packaging and labelling**
- Line clearance (211.130).
- Label issuance and reconciliation (211.125).
- 100% electronic label verification where cut labels are used (211.122(g)).
- In-line checks of variable print and codes, with start, interval and end challenges using known defects.
- Finished-product examination (211.134).
- Serialisation (EU Delegated Regulation 2016/161; the US DSCSA) and code grading (ISO/IEC 15415).

Most of this is deterministic vision built into line equipment. AI adds value on cosmetic and print anomalies.

**Decision points:** accept or reject each unit; pass or fail each AQL; act on trends; decide on re-inspection (QA).

### 5. Domain model

| Entity | Main fields and links |
| --- | --- |
| **InspectionStation** | line, machine (CMMS asset), optics and lighting configuration, mode A or B, qualified state |
| **Presentation** | product, container, fill |
| **DefectClass** | category, description, size range, reference images. Held in a versioned **DefectLibrary** approved by QA. |
| **DefectKit and KitUnit** | defect class, characterised detection probability, zone, characterisation date |
| **CharacterisationRun** | inspector × unit × repeat |
| **InspectorQualification** | Workforce person, method, kit version, result, valid until, vision-check date |
| **BatchInspection** | inspected count, rejects per class |
| **RejectRecord** | image, class, decided by (inspector, or machine and model version), review decision |
| **AQLSample** | plan, sample size, acceptance and rejection numbers, findings, outcome |
| **TrendLimit** | alert and action limits per class |
| **Model** | version, intended use, training manifest, frozen test set, metrics, status (development, qualified, retired) |
| **ChallengeRun** | the kit run against a model or machine, with results |
| **DeviationLink** | reference to the external QMS record |

### 6. Specification set to write

**URS highlights**
- **ENG3-URS-001:** Keep a versioned defect library (critical, major, minor; reference images) approved by QA.
- **ENG3-URS-002:** Manage defect kits: record each manual inspection of each unit, and compute detection probability
  and zone.
- **ENG3-URS-003:** Record inspector qualifications with expiry, and block unqualified inspectors from batch
  assignment.
- **ENG3-URS-004:** Compute reject rates per class against alert and action limits, and alert QA when a limit is
  exceeded.
- **ENG3-URS-005:** Compute AQL sample size and acceptance and rejection numbers from the selected standard plan, and
  record the outcome.
- **ENG3-URS-006:** In Mode A, show each AI suggestion with class, confidence and region. The human decision is the
  record; the suggestion is kept.
- **ENG3-URS-007:** Allow no model in production without a model spec, a frozen test set, a qualification report and
  QA approval; change it only under change control.
- **ENG3-URS-008:** Compare automated with manual performance per class (reject-zone efficiency, false-reject rate),
  with confidence intervals.
- **ENG3-URS-009:** Keep reject, grey-zone and AQL-sample images with checksums for the batch-record retention period.
- **ENG3-URS-010:** Send no reject or line-stop signal to equipment. Mode B runs inside the qualified machine.

**Key functional requirements**

1. **Detection probability.**
   - Given a kit unit inspected 50 times with 38 detections,
   - when characterisation closes,
   - then its probability is 0.76 and its zone is "reject" (at a threshold of 0.7).
   - Given fewer inspections than the configured minimum, then "not computed: insufficient inspections".
2. **Qualification block.** Given an inspector whose qualification expired yesterday, when the supervisor assigns them
   to batch B, then the assignment is refused, with the reason shown.
3. **Trend limit.** Given an action limit of 0.5% for glass particles and 0.62% observed, when the batch closes, then a
   QA alert and a deviation-link task are created, and the batch summary cannot be signed until QA records the
   decision.
4. **AQL.** Given a lot size, general inspection level II and an AQL, when the plan is computed, then the code letter,
   n, Ac and Re match the published ISO 2859-1 tables. The expected values are taken from the published table, entered
   and checked by two people.
5. **Mode A record.** Given an AI suggestion of "particle, 0.91", when the inspector decides "accept", then the record
   holds the inspector's decision, the suggestion, the model version and the image checksum.
6. **Unqualified model.** Given a model with status "development", when a production station is configured, then that
   model cannot be selected.
7. **Comparison report.** Given kit results for manual and automated inspection, when the report runs, then it shows
   reject-zone efficiency and false-reject rate per class with 95% intervals, and marks each class pass or fail
   against the QA-set criteria.

**Non-functional requirements**
- **Speed:**
  - a review image loads in 1.5 s p95 or less (images up to 10 MB);
  - a Mode A suggestion takes 2 s p95 or less per image on GPU compute. This is not line speed.
- **Storage** is sized per customer. For example, 2,000 images × 5 MB = about 10 GB per batch, kept at least as long
  as the batch record.
- **Availability:** 99.5%. The line runs without GigaLibs.
- **Proposed AI thresholds:**
  - Mode A: a model is shown only if per-class recall is at least 90% on the frozen kit.
  - Mode B: for each critical class, automated reject-zone efficiency is at least manual, with a statistical approach
    agreed with QA, and the false-reject rate is within the agreed limit.

**AI model specification**

| Item | Specification |
| --- | --- |
| Intended use | Product, container, defect classes and mode, stated per model |
| Data | Images from the customer's line under qualified lighting. Train, validation and test sets are split by batch and container lot. The Knapp kit is the test set and is never used for training (independence, as the draft Annex 22 expects). |
| Metrics | Per-class detection probability; reject-zone efficiency; false-reject rate; grey-zone behaviour; repeatability (same image, same output, 100%) |
| Explainability | A highlighted region for each decision (draft Annex 22; verify) |
| Human oversight | Mode A: the human decides. Mode B: QA approval and periodic review. |
| Drift | Kit challenge runs; reject-rate trends per class; image statistics (brightness, focus). Out of range: the output is withheld and the station alarms. |
| Change control | No learning in production. A retrain is a new version with requalification scoped by impact. |

### 7. Fit with GigaLibs

**Reuse:**
- **Workforce:** people and skill tags. Qualification with expiry needs new fields (verify).
- **CMMS:** inspection machines as assets, and PM and calibration of cameras and lights.
- **Inventory:** lot status. Release stays QA's action.
- **Analytics Studio:** Paretos and trends, built with the data-visualisation design role.
- **F0:** the shared GxP evidence foundation.
- **Assistant:** explains trends with citations; never decides.

**New:**
- a module `visual-inspection` (governance and records);
- an image store;
- compute service with GPU (D1) for Mode A;
- for Mode B, an edge runtime in the customer's equipment: GigaLibs ships signed model packages and receives results.

**Integrations:** inspection machines through file or REST import into Connector Hub. There is no OPC-UA or historian.
Deviations go to the customer's QMS.

### 8. Implementation plan

| Slice | Scope | Size | Acceptance evidence | Validation deliverables |
| --- | --- | --- | --- | --- |
| S1 | Governance without AI: defect library, kits and characterisation, inspector qualification, batch result import, trend limits, AQL | L | Property tests (probabilities in [0,1], AQL matches the tables); QA acceptance | URS, risk assessment, scripted protocol |
| S2 | Image evidence store; human review queue for rejects and grey zone; signatures | M | Checksum and audit tests; Security review | Data-integrity assessment |
| S3 | Mode A suggestions through the compute service | L | Frozen-kit report; "blind first" review design tested | Model spec, performance report |
| S4 | Qualification toolkit: automated-versus-manual comparison, challenge runs, model registry with QA approval | M | Report reproduces a hand-calculated example | Toolkit validation record |
| S5 | Mode B with an equipment maker and a named customer: edge packaging, deterministic runtime, IQ/OQ/PQ support | XL | Customer PQ | Full qualification package |
| S6 | Packaging: import line-vision results, challenge-test records, reconciliation | M | UAT on a real line export | Test record |

### 9. Risks and open questions

- **Regulatory and liability position for Mode B.** Should GigaLibs only govern, and leave decisions to equipment
  makers? (owner, legal)
- **Rare critical defects** give few training examples, and augmented images cannot be qualification evidence.
- **Anchoring.** Show the AI's suggestion only after the inspector's own call ("blind first")? (ergonomics, QA)
- **Workload.** Building Knapp kits takes many hours of inspector time.
- **Storage cost** of the images.
- **Annex 22 is a draft;** the final text may change scope.
- **NDT** is out of scope.

### 10. Agents and humans responsible

- **Lead:** `quality_management_lead` (owner decides on the module), with `industry_pharma_life_sciences`,
  `quality_regulatory_specialist` and `manufacturing_lead`.
- **Consulted:** `workforce_scheduling_lead`, `maintenance_cmms_lead`, `analytics_reporting_lead`; design
  (`data_visualisation_design`, `ergonomics_human_factors` for inspector fatigue and review screens,
  `product_designer`); engineering and operations (`solution_architecture`, `ai_engineering`,
  `trust_safety_automation`, `integration_connectors`, `capacity_cost`).
- **Prove and review:** `qa_spec`, `performance_testing`, `security_reviewer`, `code_reviewer`, `licence_ip_reviewer`.
- **New roles recommended:** `visual_inspection_specialist`, `quality_statistics_specialist` (sampling, Knapp
  statistics, confidence bounds), `ai_model_validation_specialist`, `computer_vision_engineering`,
  `scientific_compute_engineering`, `csv_csa_validation_specialist`.
- **Humans:** the customer's QA head, head of sterile or packaging operations, validation lead and QP; the owner; a
  named pharma expert; the named Security reviewer; a legal adviser for Mode B.

---

## ENG-4: Production planning and scheduling digital twin

### 1. Purpose and users

ENG-4 is a planning model of a pharma or CDMO plant. It holds:
- products and master recipes;
- equipment and rooms;
- cleaning and changeover rules;
- people, materials and maintenance windows;
- QC release lead times.

It checks plans against GMP constraints, proposes schedules and answers what-if questions. The plan is a
recommendation. Execution stays in the batch record and in MES or ERP.

**Users:** master scheduler, production planner, production manager, QC planner, supply planner and buyer, maintenance
planner, and CDMO project managers (client commitments). QA owns the constraints.

### 2. What the specification asks for

- **Sync** ERP orders and inventory, MES batch status, LIMS release and SCADA state (FR-K401); **ML forecasts** over
  4–52 weeks (FR-K402; MAPE targets, row 002); **capacity plans** by shift and week (FR-K403); **what-if** in under
  60 s for 50 products on 10 units (FR-K404, row 003); **OTIF** with root cause (FR-K405, row 004).
- Plan versus actual within 5%, downtime reflected within 15 minutes (row 001); ERP write-back within 15 minutes of
  approval (row 005).
- **Optimiser** constraints: capacity, cleaning validation, batch sizes, regulatory holds; Gantt, inventory runway and
  bottleneck views.

**Our reading:**
- **Missing feeds.** The MES, LIMS and OPC-UA feeds the source assumes do not exist in GigaLibs. The first slices use
  GigaLibs' own modules and imports.
- **Demand.** A CDMO's demand mostly comes from client orders and contractual forecasts, so constraint-correct
  scheduling matters more than ML forecasting.
- **Claims.** The OEE and OTIF gains are claims, not targets.

### 3. GxP impact and validation approach

**Classification: GxP-adjacent.**
- A schedule is not a GMP record. It does not release, start or execute a batch.
- But it encodes GMP constraints: cleaning validation limits, hold times, dedicated equipment and qualification
  status. A wrong constraint could lead a planner to schedule work that becomes a deviation if executed.
- The GMP controls stay in GMP systems: equipment status and logbooks, the batch record, MES interlocks and QA
  release.
- Forecasting and OTIF are non-GxP.

**GAMP 5:**
- the application is Category 4;
- the checker and optimiser are Category 5 components with low GxP risk;
- the constraint library is QA-approved configuration data.

**Assurance (CSA-style):**

| Kind | What |
| --- | --- |
| High assurance, scripted | The GMP constraint checker, with every rule type at its boundaries: campaign exactly at its maximum, dirty hold time exceeded by one minute, dedicated equipment, expired qualification, expiry before use. Every library entry is verified by a second person against its source report. |
| Unscripted | Everything else, as exploratory sessions with planners |

**Part 11.** Not required for the plan. Recommended as good practice:
- an audit trail for constraint-library changes: who, why, and which validation report;
- a record of plan approvals.

An e-signature is needed only if the customer's SOP makes the approved schedule a GMP document (ask QA).

### 4. Industry process it must follow

**Planning hierarchy** (ASCM; ISA-95, Level 4 against Level 3):
1. S&OP, monthly.
2. Master production schedule with rough-cut capacity.
3. MRP.
4. Finite-capacity scheduling, with frozen and slushy time fences.
5. Release of process orders.
6. Batch-record issue and execution (MES or paper).
7. QC testing.
8. QA disposition, or QP certification under Annex 16.
9. Shipment.

ISA-88 provides the recipe and equipment hierarchy (process cell, unit).

**Pharma constraints the plan must respect:**

| Constraint | Detail and sources |
| --- | --- |
| Cleaning and campaigns | Validated changeover cleans between products; minor cleans within a campaign; maximum campaign length and dirty and clean hold times from cleaning validation (EU GMP Annex 15 section 10; 21 CFR 211.67; ICH Q7 §5.2); cleaning and verification durations |
| Cross-contamination | Dedicated facilities or equipment where risk assessment requires them (EU GMP Chapters 3 and 5 with HBEL-based assessment, EMA guideline 2014; 21 CFR 211.42(d) and 211.46(d) for penicillin; ICH Q7 §4.4); product-sequence rules set by QA |
| Equipment | Qualified, calibrated, maintained; PM windows and downtime from CMMS |
| People | Trained on the SOPs; gowning-qualified for aseptic work; shifts |
| Materials | Released lots. A quarantined lot is planned only as a flagged risk. Expiry and retest dates; FEFO; supplier lead times. |
| QC and release lead times | Per product: for example a 14-day sterility incubation (USP <71>), QC lab capacity, QA review, QP certification |
| Hold times | Validated hold times for intermediates and bulk |
| Shelf life | Minimum remaining shelf life at shipment |

**Decision points:**
- the scheduler proposes, and the production manager approves;
- changes inside the frozen window need approval;
- QA owns the constraint library;
- **no planner can override a GMP constraint.** That needs change control or validation. Business constraints (due
  dates, priorities) can be overridden, with a reason.

### 5. Domain model

| Entity | Main fields and links |
| --- | --- |
| **Site, Room** | from Geospatial |
| **ProcessCell, Unit** | linked to a CMMS asset; equipment class; qualification due date; cleaning state |
| **Product** | product group for cleaning, HBEL class |
| **MasterRecipeRef** | unit procedures, equipment class, durations, batch-size range, crew |
| **ChangeoverRule** | from group to group; cleaning type; duration; validating reference |
| **CleaningLimit** | maximum campaign length, dirty and clean hold times, per unit and group; report reference; QA approval |
| **DedicationRule, SequenceRule, HoldTimeRule** | the remaining constraint rules |
| **QCReleaseProfile** | tests, durations, lab resource |
| **MaterialRequirement** | linked to Inventory lots (status, expiry, retest) |
| **SupplyOrder** | from Procurement |
| **Demand** | Orders or client forecasts; due date; minimum remaining shelf life |
| **CrewRequirement, Availability** | from Workforce |
| **MaintenanceWindow** | CMMS PM and downtime |
| **Scenario** | a base or what-if case |
| **PlannedBatch, Operation** | unit, start, end, campaign |
| **ConstraintCheckResult** | rule; severity (GMP-blocking or business warning); explanation; evidence |
| **PlanVersion** | approver, time, publication target |

### 6. Specification set to write

**URS highlights**
- **ENG4-URS-001:** Keep a QA-approved GMP constraint library with references to the validating documents, and full
  history.
- **ENG4-URS-002:** Check any schedule against every active GMP constraint. A schedule with GMP-blocking violations
  cannot be approved.
- **ENG4-URS-003:** Use CMMS, Inventory, Procurement and Workforce data, and show how old each source is.
- **ENG4-URS-004:** Propose a schedule that meets all GMP constraints, or say "no feasible schedule" and name the
  binding constraints.
- **ENG4-URS-005:** Run what-if scenarios without touching the approved plan, and compare their KPIs.
- **ENG4-URS-006:** Show the planned QC release date per batch, and flag due-date and shelf-life misses.
- **ENG4-URS-007:** Require the production manager to approve each plan version, and record what changed.
- **ENG4-URS-008:** Never release process orders or issue batch records. Publish planned orders only through a
  confirmed integration.
- **ENG4-URS-009:** Label every result as optimal, best found within the time limit (with the gap), or heuristic.
- **ENG4-URS-010:** Show forecasts only with prediction intervals, and only when they beat a naive baseline.

**Key functional requirements**

1. **Campaign limit.**
   - Given a maximum campaign of 6 batches for group P on unit R-101 (test fixture report CV-001) and a schedule of 7
     consecutive batches,
   - when the check runs,
   - then there is a GMP-blocking violation that cites the rule and the report, and approval is disabled.
2. **Dirty hold time.** Given a dirty hold time of 72 h, when cleaning is planned 73 h after the batch ends, then the
   violation is GMP-blocking.
3. **Maintenance.**
   - Given a CMMS PM window on R-101, when the optimiser runs, then no operation overlaps it.
   - When the PM moves in CMMS, then the plan is flagged stale within 5 minutes (through outbox events).
4. **Materials.**
   - Given lot L expires before its planned use, then the violation is GMP-blocking.
   - Given a quarantined lot whose expected release falls after it is needed, then a risk warning is shown.
5. **Infeasibility.** Given demand above capacity, when the optimiser runs, then it says "no feasible schedule" and
   lists the binding constraints and the orders at risk.
6. **What-if.**
   - Given approved plan v12, when the scenario "R-101 down 5 days" runs,
   - then v12 is unchanged, and the scenario shows the orders at risk and the utilisation changes
   - within 60 s p95 at the reference size.
7. **No override.** Given a GMP-blocking violation, when a planner tries to override it, then no override control
   exists. A business warning can be overridden with a reason.
8. **Not computed.** Given the optimiser service is down, then the result is "not computed: optimiser unavailable",
   and the TypeScript checker still works.

**Non-functional requirements**
- **Speed:**
  - the checker takes 5 s p95 or less for 300 batches × 10 units over 8 weeks;
  - the optimiser takes 60 s p95 or less for 50 products, 10 units and 8 weeks, and returns the best found with its
    gap;
  - Gantt: 2,000 operations render in 2 s or less.
- **Freshness:** source changes reflected within 5 minutes through relays.
- **Availability:** 99.5% in working hours.
- **Retention:**
  - plan versions for at least 3 years (proposed);
  - the constraint library history for the life of the product.
- **Forecast quality:**
  - WAPE reported against a seasonal-naive baseline;
  - a forecast is shown only if its value added over the trailing 6 months is positive;
  - in backtests, the 80% prediction interval covers between 70% and 90% of actuals.

**Model specification**

| Model | Specification |
| --- | --- |
| Optimiser (no ML) | A formulation document; fixed seeds. The same input and time budget give a reproducible result. Note: multi-worker CP-SAT is not reproducible, so validation runs use a single worker. |
| Forecast | Intended use: planning information only. Data: at least 24 months of history per SKU; otherwise naive only. Metrics: WAPE, bias, interval coverage. The planner approves forecasts. Drift: a monthly backtest. Change control: versioned. |

### 7. Fit with GigaLibs

**Reuse (all in production):**
- **CMMS:** assets, PM schedules, planned and unplanned downtimes, work orders, criticality.
- **Inventory:** lots with `expiry_date`; the statuses `QUARANTINED`, `INSPECTION`, `AVAILABLE` and `EXPIRED`;
  quarantine warehouses.
- **Procurement:** open POs.
- **Orders:** due dates and OTIF facts.
- **Workforce:** people, availability patterns, bookings, skill tags. GMP training qualifications with expiry are a
  gap (verify).
- **Geospatial:** rooms.
- **Analytics Studio:** KPIs.
- **Module SDK:** outbox and relays.
- **Assistant:** explains why a batch does not fit and drafts scenarios. It never approves.

**New:**
- a module `production-planning`;
- recipes and changeover data. Manufacturing (U24) does not exist, so ENG-4 either holds minimal recipe references or
  waits for U24 (owner decides).

**Engines:**
- **TypeScript, no compute dependency:** the checker and a greedy heuristic.
- **Compute service (D1):** OR-Tools CP-SAT (Apache-2.0; no official Node binding) or Timefold (Apache-2.0, Java),
  and forecasting with open-source libraries.

**Integrations:** ERP and MES through Connector Hub (none exist today). Without OPC-UA, a historian or MES, a
"real-time twin" is out of scope.

### 8. Implementation plan

| Slice | Scope | Size | Acceptance evidence | Validation deliverables |
| --- | --- | --- | --- | --- |
| S1 | Planning model; QA-approved constraint library; checker on entered or imported schedules; Gantt; CMMS and Inventory data | L | Rule-type boundary tests fail before and pass after; UAT journey | Risk assessment, library verification record |
| S2 | Workforce, Procurement and Orders feeds; data age; stale-plan alerts | M | Event tests | Trace matrix |
| S3 | Optimiser through the compute service; infeasibility explanation; result labels | L | Benchmark instances with known optima; reproducibility test | Formulation document |
| S4 | What-if scenarios; QC release and shelf-life checks; OTIF at risk | M | Scenario isolation tests | Test record |
| S5 | Publish planned orders to ERP or MES (per customer) | M–L | Integration contract tests; reconciliation | Interface specification |
| S6 | Forecasting with a baseline comparison | M | Backtest report | Model spec |

### 9. Risks and open questions

- **Spreadsheets.** Recipe and changeover data usually lives in spreadsheets, so data quality is the first risk.
- **Ownership.** QA owning the constraint library must be agreed.
- **Manufacturing.** It overlaps U24 (owner).
- **MRP ownership.** ERP MRP owns planned orders, so write-back can conflict.
- **Client confidentiality.** CDMO scenarios need unit-scoped access.
- **Over-trust.** Planners may over-trust "optimal" labels.

### 10. Agents and humans responsible

- **Lead:** `manufacturing_lead`, with `supply_chain_planning_specialist`, `industry_pharma_life_sciences` and
  `quality_regulatory_specialist`.
- **Consulted:** `maintenance_cmms_lead`, `inventory_warehouse_lead`, `procure_to_pay_lead`, `order_to_cash_lead`,
  `workforce_scheduling_lead`, `places_geospatial_lead`, `analytics_reporting_lead`; design
  (`data_visualisation_design`, `product_designer`, `ergonomics_human_factors` for a planner at a desk all day);
  engineering (`solution_architecture`, `backend_domain`, `api_contracts`, `integration_connectors`).
- **Prove and review:** `qa_spec`, `test_automation`, `performance_testing`, `security_reviewer`, `code_reviewer`,
  `licence_ip_reviewer`.
- **New roles recommended:** `operations_research_specialist`, `pharma_production_planning_specialist` (campaigns,
  cleaning-validation constraints), `scientific_compute_engineering`.
- **Humans:** the customer's head of planning (process owner), production manager (plan approval), QA (constraint
  library) and validation lead (cleaning-validation references); the owner; a named pharma expert.


<!-- pagebreak -->

# 7E. SPEED, the process engineering module (scale-up from gram to multi-ton)

- **Prepared by:** the pharma and life-sciences practice (`industry_pharma_life_sciences`, `quality_regulatory_specialist`),
  with the proposed specialists `process_safety_specialist`, `cheminformatics_specialist` and
  `csv_csa_validation_specialist` (see §10).
- **Date and status:** 2026-10-19. A draft for the owner's review. Nothing here is built.
- **Source:** the owner's SPEED blueprint (spec lines 756–900) and the spec-driven method (lines 902–1010).
- **Name:** "SPEED" (Scalable Processes Enabling Excellence in Delivery) is the owner's module name. It is used here
  as a working name only, until trademark clearance is complete (§9, item 1).
- **Calculations:** the worked example's numbers come from a script in this folder
  (`speed_calc/speed_stage1.py`), which uses IUPAC standard atomic weights (abridged values).

---

## Family overview

### What the family is for

In a pharma company or a CDMO, the cheapest place to remove a runaway hazard is the chemist's desk. The same goes
for a gas-evolution surprise or a wasteful step. Fixing it in the plant costs far more.

SPEED gives chemists and process engineers one auditable path from a route on paper to a process that can be
transferred to manufacturing:

| Stage | What it does | Status |
|---|---|---|
| Stage 1 | Desk screening | Specified by the owner |
| Stage 2 | Experimental thermal testing | Proposed here |
| Stage 3 | Kilo-lab | Proposed here |
| Stage 4 | Pilot plant | Proposed here |
| Stage 5 | Technology transfer | Proposed here |

Its records are:
- process-safety knowledge under CCPS practice;
- development knowledge under ICH Q10 and ICH Q11.

Once material is made for clinical or commercial use, its records also become GMP records.

### GxP map at a glance

| Module | Classification | GAMP 5 (2nd ed.) category | Size |
|---|---|---|---|
| **SPEED-1**: Stage 1 predictive desk screening | **GxP-adjacent.** It is safety-critical but not GMP. A process-safety engineer reviews and signs every output, and Stage-2 experiments confirm it before material is scaled. | Category 5 (custom calculation engines). RDKit is treated as an embedded library. The LLM extraction is an AI component with its own model specification. | **XL** in total. The first useful slice is **M**. |
| SPEED-2: Stage 2 thermal testing *(proposal)* | GxP-adjacent. These are R&D safety data, and ALCOA+ still applies. | Category 5 module. The instrument software belongs to the laboratory (Category 3 or 4). | L (indicative) |
| SPEED-3: Kilo-lab *(proposal)* | **GxP** if the material is for clinical use (ICH Q7 §19). Otherwise GxP-adjacent. | Category 4 or 5 | L (indicative) |
| SPEED-4: Pilot plant *(proposal)* | **GxP** | Category 4 or 5. Equipment is qualified under EU GMP Annex 15. | XL (indicative) |
| SPEED-5: Manufacturing technology transfer *(proposal)* | **GxP** | Category 4 or 5 | XL (indicative) |

### Recommended order, and why

1. **SPEED-1's deterministic engines first.**
   - These are the mole balance, MW, oxygen balance (OB%), atom economy, ΔTad, MTSR and the Stoessel class.
   - They need no AI and no Python runtime. Each is a formula we can prove with property tests.
   - The worked example below shows that this alone gives a chemist a useful, honest screen.
2. **Next: the hazard matrix, the gas estimate, the dossier and e-signature.** These make the output a signed record.
3. **The thermochemistry engine (Benson) and the AI extraction come last.**
   - They depend on an architecture decision (no scientific-compute runtime exists today).
   - They also depend on reference-data licences.
   - They need a validated evaluation set.
4. **Stage 2 follows Stage 1.** Its gate consumes Stage 1's test plan.
5. **Stages 3–5 wait for a customer.** They touch GMP records, so they need a customer's QA in the loop.

---

## SPEED-1: Predictive desk screening (Stage 1)

### 1. Purpose and users

**Purpose.** Before any material enters the kilo-lab, SPEED-1 turns a reaction scheme and a lab write-up into five
outputs:
- a thermal-risk verdict, or an explicit "not computed" with the reason;
- a list of reactive hazards;
- green metrics;
- a Stage-2 experimental test plan;
- a signed dossier.

**Users:**
- **R&D chemist:** submits schemes and write-ups, and confirms structures and by-products.
- **Process-safety engineer:** reviews, dispositions flags, overrides with a reason, and signs as reviewer.
- **Process-engineering lead:** approves the gate.
- **Admin and QA:** maintain users, thresholds, reference data and the audit-trail review.

### 2. What the specification asks for

**Hard gates.** The owner calls these the poka-yoke design.
- **Gate 1:** no engine runs until every step balances element by element (SP-102).
- **Gate 2:** no thermal engine runs until these process conditions are entered (SP-104):
  - Tp;
  - concentration or batch mass;
  - solvent;
  - dosing mode;
  - addition time;
  - MTT.

**Inputs:**
- structures (SP-101): SMILES, Rxnfile or CDXML;
- extraction from patents and write-ups (SP-103), where every value is confirmed by a person;
- physical properties with units and reasoned overrides (SP-105).

**Four engines:**

| Engine | Requirements |
|---|---|
| 1. Oxygen balance | OB% for every raw material and isolated intermediate (SP-201). An explosophore screen (SP-202). A mandatory DSC/ARC flag if OB% falls in a configured, cited band or an explosophore is present (SP-203). |
| 2. Thermochemistry | ΔHrxn by Hess's law, using Benson group additivity for new molecules, with source and uncertainty (SP-211). ΔTad (SP-212). MTSR with Xac (SP-213). TMRad and TD24 screening estimates, always labelled "screening estimate — confirm by DSC/ARC" (SP-214). The Stoessel class 1–5 (SP-215). |
| 3. Reactive hazards | A pairwise compatibility matrix with SDS and literature cross-check (SP-221). A gas-evolution estimate against headspace and vent capacity (SP-222). |
| 4. Green metrics | AE, E-factor, PMI and RME, with a visible water setting (SP-231). |

**Outputs:**
- the dossier as PDF and DOCX (SP-301);
- a scorecard (SP-302);
- the Stage-2 test plan (SP-303);
- an audit trail and e-signature to Part 11 and Annex 11 (SP-401).

**Workflow (six steps):**
1. Upload.
2. Gate 1.
3. Gate 2.
4. Run the engines.
5. Classify and review.
6. Sign off.

### 3. GxP impact and validation approach

**Classification: GxP-adjacent.**
- **Why not GMP:** Stage-1 screening is R&D work before GMP. It creates no batch record, release decision or quality
  decision.
- **Why safety-critical:** its outputs are safety-critical. A wrong MTSR or a missed incompatibility can injure
  people.
- **Why adjacent:** the outputs become process-safety knowledge (CCPS Risk Based Process Safety, "process knowledge
  management") and development knowledge. These later enter a technology-transfer package (ICH Q10).

So we validate the **calculation engines** with GxP-grade rigour, because of the safety consequence. We do **not**
apply GMP lifecycle overhead to the rest of the tool.

**GAMP 5 category:**
- The engines, gates and dossier are Category 5 (custom).
- RDKit and the PDF/DOCX renderers are third-party libraries inside custom software. Our tests cover them through our
  functions; they are not validated on their own.

**How AI components are treated:**
- **LLM document extraction (SP-103):** assistive. A value is never used until a named person confirms it.
- **Retrieval for hazard citations:** assistive. Every citation must resolve to a stored, licensed passage.
- **Benson additivity and every engine** are deterministic code, not AI.
- **Regulatory context:** the EU's Annex 22 on AI (consultation draft, 2025) and FDA's draft guidance on AI for
  regulatory decision-making (2025) are both drafts. We follow their direction anyway:
  - intended use;
  - test data independent from the development data;
  - metrics with thresholds;
  - human oversight.

**Assurance, CSA-style.** FDA's computer software assurance guidance formally covers device production and
quality-system software; we apply its thinking by analogy.

| Risk | Functions | Assurance |
|---|---|---|
| **High** | Gate 1, OB% and the flag logic, ΔTad, MTSR, TD24/TMRad, the Stoessel class, the gas estimate, the audit trail and e-signature | **Scripted** tests against an independent golden set (hand-calculated cases, including this document's worked example). Property tests: a balanced equation conserves mass; OB% scales correctly with formula; MTSR ≥ Tp whenever ΔTad ≥ 0. Boundary tests on every band and every class ordering. |
| **Medium** | The parser, property lookup, compatibility matrix and green metrics | Scripted tests on representative cases, plus unscripted exploratory testing by a process-safety engineer. |
| **Low** | Layout and report formatting | Unscripted testing, with screenshots as evidence. |

**Evidence:**
- the traceability matrix (URS → FR → test);
- test records in CI;
- the golden-set report signed by a process-safety engineer;
- for each deployment, an installation and operational check of the tenant instance (IQ/OQ-style).

**Part 11, Annex 11 and ALCOA+.**
- **Where Part 11 applies:** Part 11 applies to records that a predicate rule requires. Stage-1 dossiers usually are
  not such records.
- **Why we build the controls anyway:** we build Part 11-grade controls for two reasons. The specification asks for
  them, and the dossier may later support GMP decisions in Stage 5.
- **Controls:**
  - a computer-generated, time-stamped audit trail of every input, override and approval, with old value, new value,
    reason and user (§11.10(e); Annex 11 clause 9);
  - signature manifestation showing name, date and time, and meaning (§11.50);
  - signature-to-record linking by content hash (§11.70);
  - two-component signing (§11.200);
  - role and site scope;
  - no deletion: a correction creates a new version;
  - retention under the customer's records policy;
  - ALCOA+ on extracted values: the source span is attributable and the confirming person is recorded.

### 4. Industry process it must follow (do not deviate)

1. **Hazard identification before experimentation** (CCPS, *Guidelines for Chemical Reactivity Evaluation and
   Application to Process Design*; Bretherick-type screening). The chemist and the process-safety engineer do this
   together.
2. **Thermal risk assessment by the cooling-failure scenario** (Stoessel). The steps are:
   1. Tp;
   2. the heat of reaction and ΔTad;
   3. accumulation (Xac);
   4. MTSR;
   5. compare MTSR with MTT and TD24;
   6. assign the criticality class;
   7. state the action per class.
   - **The decision point:** the process-safety engineer accepts or overrides, giving a reason.
3. **Screening values are estimates.** Every estimate is labelled as such and confirmed by calorimetry before scale-up
   (SP-214). A Stage-1 class is never a licence to scale.
4. **Green metrics follow common definitions:**
   - AE is defined from the balanced equation;
   - E-factor and PMI follow the definitions used by the ACS GCI Pharmaceutical Roundtable;
   - the water scope is stated.
5. **Separation of duties.** The author cannot review or approve their own dossier. Approval means "release the
   Stage-2 plan". It never means "approve scale-up" while Gate 2 outputs are missing.

### 5. Domain model

- **Route** (versioned) → **Step** (ordinal).
- **Species** (substance): identity, structure, formula, MW, form (salt, hydrate or solution) and CAS.
- **Step participant:** links a step and a species, with:
  - role: reactant, reagent, catalyst, solvent, by-product or product;
  - stoichiometric coefficient;
  - equivalents;
  - charged mass or volume.
- **Balance check:** the element differences, charge, status and the confirmation by the person.
- **Condition set** (per step, versioned): Tp, C0, the solvent and its volume, dosing mode, addition time, MTT and Xac.
- **Property value:** Cp, ρ or boiling point, with units, source and any override reason.
- **Thermo estimate:** ΔH°f per species, with method (table or Benson), source and uncertainty.
- **Calculation run:**
  - engine and rule version;
  - input hash;
  - outputs;
  - status (`computed` / `not computed`);
  - missing inputs.
- **Result types:**
  - OB result;
  - explosophore hit (rule ID and citation);
  - hazard pair (A × B, in-step or carry-over, verdict, citation, disposition);
  - gas estimate;
  - green metrics;
  - Stoessel classification.
- **Override:** old value, new value, reason, user and time.
- **Test plan item:** test type, target, trigger rule and the question it answers.
- **Dossier** (version, hash, status) → **Signature** (signer, meaning, time, hash).
- **Reference data** (versioned and approved): the OB band with its citation, the explosophore library, the
  defaults (Ea) and the property sources.
- **Extraction item:** the AI value, its source span and its confirmation.

### 6. Specification set to write

**URS highlights:**
- **SPEED-1-URS-001:** The system blocks every engine until each step is element-balanced. It lists the unbalanced
  elements per step.
- **SPEED-1-URS-002:** The system derives a molecular formula and MW for every species. It uses a pinned table of
  IUPAC standard atomic weights.
- **SPEED-1-URS-003:** Every result shows its units, engine version and data sources. Any result that cannot be
  computed shows "not computed" and the missing inputs.
- **SPEED-1-URS-004:** ΔTad, MTSR, TMRad, TD24 and the Stoessel class do not run until the Gate 2 inputs are complete
  for that step.
- **SPEED-1-URS-005:** Every Stage-1 decomposition value carries the label "screening estimate — confirm by DSC/ARC".
- **SPEED-1-URS-006:** The compatibility screen covers all pairs within a step and the carry-over between consecutive
  steps. Each flag cites a source.
- **SPEED-1-URS-007:** No AI-extracted value is used by an engine until a named user confirms it against the source
  span shown.
- **SPEED-1-URS-008:** Thresholds and libraries are versioned reference data. Each is approved by a process-safety
  engineer and cites the literature.
- **SPEED-1-URS-009:** A dossier is approved only by electronic signatures from two people other than its author. One
  signs as reviewer, the other as approver, and each signature states its meaning.
- **SPEED-1-URS-010:** Every input, override and signature is recorded in a non-editable audit trail.

**Key functional requirements (Given / When / Then):**

1. **Gate 1.**
   - Given step 4 entered as "P3 + N-methylmethanesulfonamide → P4", with no by-products,
   - when the chemist runs screening,
   - then all engines stay locked and the imbalance is shown as C 1, H 4, O 2, S 1 (left minus right). The system
     proposes "CH3SO2Na + H2O with NaOH" for the chemist to confirm.
2. **OB flag.**
   - Given band version 1 (−160% < OB% < +80%, with citation),
   - when OB% is computed for N-methylmethanesulfonamide (C2H7NO2S),
   - then OB% = −80.6 ± 0.1%, a mandatory DSC flag is raised, and the rule version is named.
3. **MTSR default.**
   - Given semi-batch dosing, no user Xac, Tp = 25 °C and ΔTad = 30.9 K,
   - then MTSR = 55.9 °C, labelled "Xac defaulted to 1 (worst case)".
4. **Stoessel completeness.**
   - Given any ordering of Tp, MTSR, MTT and TD24, including ties and TD24 ≤ Tp,
   - then the engine returns a class from the approved rule table, or "unclassified — review". It never guesses.
5. **Gate 2 block.**
   - Given Tp missing,
   - when the engines run,
   - then ΔTad, MTSR, TMRad, TD24 and the class show "not computed: missing Tp", and the dossier's approval meaning is
     limited to "Stage-2 plan".
6. **Override.**
   - Given the reviewer replaces Cp,
   - then the old value, new value, reason, user and time are stored, and the dossier lists the override.
7. **Test plan.**
   - Given a flagged material or step,
   - when the dossier is generated,
   - then every flag maps to at least one test item (DSC, ARC, reaction calorimetry or gas measurement), with its
     trigger rule.
8. **Extraction.**
   - Given a write-up,
   - when extraction completes,
   - then every value shows its page and span, and stays `unconfirmed` (unusable) until confirmed.
9. **E-signature.**
   - Given dossier v3,
   - when the approver signs,
   - then the manifestation shows printed name, date and time, and meaning, and the signature is bound to the hash of
     v3. Any edit creates v4, and v4 is unsigned.
10. **Green metrics.**
    - Given a BOM with "water excluded",
    - then E-factor and PMI both exclude water, and PMI = E + 1 is shown as checked.

**Non-functional requirements (proposed targets; QA to confirm):**
- **Accuracy:**
  - MW within ±0.01 g/mol of the reference computed with the pinned weights;
  - OB% and AE within ±0.1 percentage point;
  - ΔTad and MTSR within ±0.1 K;
  - identical inputs give byte-identical results (hash-checked).
- **Units:** every numeric input carries a unit. A dimensional check rejects mismatches.
- **Performance (p95):**
  - Gate 1 plus all engines for a 10-step route in ≤ 10 s;
  - extraction of a 30-page document in ≤ 3 min.
- **Availability:** 99.5% monthly in business hours. This is an R&D tool, not production-critical.
- **Retention:** no deletion function. Dossiers and the audit trail are kept for at least the customer's
  development-records period. The default proposal is ≥ 10 years after the last related product is discontinued;
  QA sets the final value.

**AI model specification (extraction and retrieval):**
- **Intended use:** pre-fill a table of conditions and equivalents from patents and write-ups, and attach citations
  to hazard flags. It is never a source of record.
- **Data:**
  - an evaluation set of at least 100 documents, annotated by two chemists;
  - patents in the public domain, plus the customer's own write-ups used with consent;
  - kept separate from any prompt-tuning examples.
- **Metrics and thresholds (proposed):**
  - field-level precision ≥ 0.95 and recall ≥ 0.90 for numeric fields with units;
  - unit-normalisation errors = 0, because normalisation is deterministic code;
  - citation resolution = 100%;
  - citation support ≥ 0.90, judged by a process-safety engineer.
- **Oversight:** the person confirms every value.
- **Drift and change control:**
  - the model version is pinned;
  - the evaluation set is re-run on any model, prompt or corpus change, and a release blocks if a threshold fails;
  - per-field correction rates are monitored as a drift signal.

### 7. Fit with GigaLibs

**Reuse:**
- **The control plane:**
  - tenancy;
  - RBAC with site scope (chemists see their site's routes);
  - audit;
  - the Configuration Studio.
  - A search found no old-value/new-value capture in the control-plane audit (verify). Part 11 needs it, so it is
    either a platform card or a module-level audit table.
- **`@gigalibs/module-sdk`:** the outbox events `speed.screening.approved` and `speed.testplan.issued`.
- **Application Dictionary windows** for Route, Step, Species, Conditions, Overrides and Test plan, so a tenant can
  configure them without code.
- **Built but not deployed:**
  - **E-signature:** a prototype, frozen 2026-09-28. A search found no signature-meaning or re-authentication
    support, so it needs a Part 11 hardening card.
  - **Document scanner:** for write-up uploads.
  - **Workflow studio:** for review routing.
- **Analytics Studio:** route scorecards.
- **Later stages:** CMMS assets for vessel data (volume, headspace, vent rating, vessel temperature limit), and the
  Product Catalogue and Procurement for the BOM.

**New work:**
- the module `modules/process-engineering` (schema `gigalibs_speed`, with RLS);
- a deterministic engine package written in TypeScript and property-tested;
- an explosophore SMARTS library and a reference-data store.

**Integrations:**
- No ELN or LIMS connector exists, so Stage 1 takes uploads.
- Events go to the suite's reactor-virtualisation module (MTSR and class feed its thermal, gas and pressure gate).
- File export goes to external process simulators.

**Assistant (W5):**
- explains a flag with its citations;
- proposes by-products for Gate 1 and confirms before writing;
- refuses to state a class when Gate 2 is incomplete.

**Architecture decisions needed:**
1. **Chemistry runtime (ADR).** The choice is between two options:
   - RDKit's JavaScript/WASM build ("MinimalLib") inside the module. Its CDXML support is to be verified.
   - A Python scientific-compute service behind the module API with signed context. The old Python plane is parked
     (ADR-0016 F12).
   - Slice 1 needs neither, because it works from formulas.
2. **Reference-data licences.** These cover the property database, ΔH°f and Benson group values, and the hazard
   corpus.
3. **The e-signature hardening card.**

### 8. Implementation plan

| # | Slice | Size | Acceptance evidence | Validation deliverable |
|---|---|---|---|---|
| 1 | Registry and windows. Formula-based Gate 1, MW, OB% with band, AE, and the "not computed" contract. | M | The golden set, including this route; property tests (mass conservation, OB% scaling); tests that fail before and pass after | URS v1; functional risk assessment; engine test protocol |
| 2 | Structure input (SMILES, Rxnfile), the explosophore SMARTS library v1, and assisted by-product proposals | M (after the ADR) | SMARTS hits on a curated positive and negative set | Library approval record |
| 3 | Gate 2 capture; property lookup with overrides; ΔTad, MTSR and the complete Stoessel rule table, using a ΔHrxn the user enters (from literature or calorimetry) | M | Boundary tests on every ordering and tie | Updated trace matrix |
| 4 | The compatibility matrix (in-step and carry-over) and the gas estimate (stoichiometric, ideal gas, against headspace) with citations | M | Reviewer-dispositioned matrix for three real routes | Citation-resolution test |
| 5 | Green metrics from the BOM, with the water toggle and scorecard | M | PMI = E + 1 check; RME against hand calculation | — |
| 6 | Dossier (PDF/DOCX), test-plan rules, review and override, e-signature (needs the hardening card, M) | M | Part 11 checklist test; four-eyes test | Part 11 / Annex 11 assessment |
| 7 | Thermochemistry engine (ΔH°f table plus Benson, with uncertainty); TMRad and TD24 estimates once the defaults are agreed | L | Comparison with published calorimetric values on an agreed set | Model-of-calculation report |
| 8 | AI extraction and cited retrieval | L | Evaluation report against thresholds | AI model specification and evaluation record |
| 9 | Validation package and release | M | Customer acceptance on UAT | Validation summary report; periodic-review SOP input |

### 9. Risks and open questions

1. **Trademark (owner, legal).**
   - Run a trademark clearance search on the name and acronym "SPEED" in Class 9 and Class 42.
   - Confirm freedom to operate, and confirm that no prior user has a claim, before commercial use.
2. **The OB% band (process safety).**
   - The −160% to +80% band has no citation yet.
   - The specification's formula covers only C, H, N and O. On this route it flags DMSO, acetic acid and KMnO4.
   - A heteroatom convention (S → SO2, F → HF, metal oxides) changes some verdicts: it moves DMSO out of the band.
   - Decide and cite the convention.
3. **The decomposition defaults (process safety).**
   - In TMRad = Cp·R·T0²/(q0·Ea), a lower Ea at a fixed q0 *lengthens* TMRad.
   - A low Ea is conservative only when it is used to extrapolate q to temperatures below a reference point.
   - The engine must apply the default that way (verify with the process-safety specialist).
4. **Stoessel table gap.**
   - SP-215 lists five orderings. It omits Tp < TD24 < MTSR < MTT, ties, and TD24 ≤ Tp.
   - In Stoessel's scheme, MTSR > TD24 with MTT > TD24 is understood to be class 5 (verify against Stoessel,
     *Thermal Safety of Chemical Processes*).
5. **ΔHrxn gating.** ΔHrxn is intrinsic and does not need Gate 2. Should it run after Gate 1, so it can sharpen the
   Stage-2 plan?
6. **Benson coverage.** Group values for some of this route's groups (heteroaryl sulfone, N-sulfonyl on a pyrimidine)
   may be missing (verify).
7. **Licences.** Bretherick, Sax, NFPA and the journals need licences before their content is loaded
   (`licence_ip_reviewer`).
8. **Liability.** Safety outputs must not be presented as approvals. The labelling and signature meanings need legal
   review.

### 10. Agents and humans responsible

**Roles in the roster:**

| Role | Responsibility |
|---|---|
| `industry_pharma_life_sciences` | Lead: brief and backlog |
| `quality_regulatory_specialist` | Classification, Part 11 and validation |
| `health_safety_environment_specialist` | Process-safety interface |
| `solution_architecture` | Chemistry-runtime ADR |
| `api_contracts` | API, event and manifest schemas |
| `backend_domain` | Services and engines |
| `web_experience` | Screens |
| `ai_engineering` | Extraction and retrieval |
| `documents_lead` | E-signature |
| `metadata_studio_lead` | Windows |
| `qa_spec` | Test strategy |
| `requirements_spec` | Requirements quality |
| `licence_ip_reviewer` | Licences |
| `security_reviewer` | Security review before every deploy |
| `code_reviewer` | Code review |

**New specialists recommended:**
- `process_safety_specialist`: CCPS, Stoessel and calorimetry;
- `cheminformatics_specialist`: RDKit, SMARTS and structure standardisation;
- `csv_csa_validation_specialist`: GAMP 5, CSA, Part 11 and Annex 11;
- `ai_model_validation_specialist`: evaluation sets and drift;
- `regulatory_cmc_specialist`: ICH Q11 and Q12, for Stages 4–5.

**Named human approvers:**
- **The owner:** scope, priority and trademark.
- **A customer-named, qualified process-safety engineer:** the golden set, the band, the defaults and the libraries.
- **The customer's QA head:** classification and the validation plan.
- **The customer's process-engineering lead:** gate sign-off.
- **Legal counsel:** trademark, licences and liability wording.

---

## SPEED stages 2–5 outline (PROPOSAL, not specified by the owner)

This outline follows common pharma and CDMO practice. Each stage ends at a gate, with named evidence. Classifications
and sizes are indicative.

| Stage | Purpose | Main activities and evidence | Gate (who decides) | Standards |
|---|---|---|---|---|
| **2. Experimental thermal testing** | Replace Stage-1 estimates with measured data | **DSC screening** of materials, intermediates and reaction mixtures: onset and energy (ASTM E537, verify edition). **ARC**: adiabatic self-heating, pressure and TMRad/TD24 (ASTM E1981, verify edition). **Reaction calorimetry**: heat of reaction, heat-release rate, accumulation (Xac) and Cp at the intended Tp and dosing. **Gas measurement**: rate and total. The class is recomputed from measured values. Evidence: raw instrument files with ALCOA+ metadata, an analysis record, and a measured Stoessel class with its assumptions. | Class 1–2: proceed. Class 3–4: technical measures defined. Class 5: redesign. Decided by the process-safety engineer and the process-engineering lead. | Stoessel; CCPS reactivity guidelines |
| **3. Kilo-lab** | First scale-up of a defined process | A process description and BOM. A what-if or checklist hazard review before the first run. Solvent and impurity fate. First critical parameters (ICH Q8, Q11). Analytical methods fit for purpose (ICH Q2(R2), Q14). A batch record if the material is for clinical use (ICH Q7 §19). Change control of the process. | Readiness review: process safety, QA (if GMP) and the operations lead | ICH Q7 §19, Q8, Q11; CCPS RBPS |
| **4. Pilot plant** | Plant-representative scale | A full **HAZOP** (CCPS *Guidelines for Hazard Evaluation Procedures*; IEC 61882). Process safety information: chemistry, technology, equipment. Equipment qualification (EU GMP Annex 15). Vessel-specific checks of gas, vent and cooling capacity. Process validation Stage 1, process design (FDA, *Process Validation: General Principles and Practices*, 2011). Proposed control strategy. | HAZOP actions closed; QA approval of GMP campaigns | ICH Q7, Q8–Q11; Annex 15; CCPS; OSHA PSM 29 CFR 1910.119 or Seveso III where applicable |
| **5. Manufacturing technology transfer** | Hand the process to the commercial site | A technology-transfer protocol and report (**ICH Q10**: technology transfer and knowledge management). The control strategy and starting-material justification (**ICH Q11**). Established conditions and the lifecycle plan (**ICH Q12**). A receiving-site HAZOP and an update of the process safety information. Management of change. Process performance qualification, then continued process verification. | QA approves the transfer report and PPQ; the receiving site accepts | ICH Q10, Q11, Q12; CCPS RBPS; EU GMP Annex 15 |

**What SPEED adds across these stages:**
- one knowledge thread per route, linking every gate's evidence to the earlier assumptions it replaces;
- management-of-change records;
- vessel data from CMMS assets.

---

## Worked example: desk screening of a 5-step route

**The test case.** The owner's test case is a five-step synthesis of a known pyrimidine intermediate of a marketed
statin.
- **What the scheme gives:** structures and reagents only.
- **What it does not give:** quantities, temperatures, concentrations, dosing mode or vessel data.

This section shows exactly what Stage 1 can and cannot do with that input. Every number below comes from
stoichiometry, from atomic weights or from the specification's formulas. **No thermochemical number is presented as a
result.**

### E1. Species register (formulas written by hand, counted twice, MW by script)

| ID | Species | Role | Formula | MW (g/mol) | To confirm with the chemist |
|---|---|---|---|---|---|
| A | 4-fluorobenzaldehyde (CAS 403-42-9) | Reactant, step 1 | C7H5FO | 124.11 | — |
| B | Methyl 4-methyl-3-oxopentanoate | Reactant, step 1 | C7H12O3 | 144.17 | — |
| **P1** | Methyl 2-(4-fluorobenzylidene)-4-methyl-3-oxopentanoate | Product, step 1 | **C14H15FO3** | **250.27** | E/Z mixture expected; same formula |
| C | S-methylisothiourea (free base) | Reactant, step 2 | C2H6N2S | 90.14 | Usually supplied as a salt |
| C·½H2SO4 | S-methylisothiourea hemisulfate (2:1 salt) | Possible real form | C4H14N4O4S3 | 278.36 | Hemisulfate or another salt? |
| **P2** | Methyl 4-(4-fluorophenyl)-6-isopropyl-2-(methylthio)-dihydropyrimidine-5-carboxylate | Product, step 2 | **C16H19FN2O2S** | **322.40** | 1,4- or 1,6-dihydro tautomer; same formula |
| **P3** | Methyl 4-(4-fluorophenyl)-6-isopropyl-2-(methylsulfonyl)pyrimidine-5-carboxylate | Product, step 3 | **C16H17FN2O4S** | **352.38** | — |
| D | N-methylmethanesulfonamide | Reactant, step 4 | C2H7NO2S | 109.14 | — |
| **P4** | Methyl 4-(4-fluorophenyl)-6-isopropyl-2-[methyl(methylsulfonyl)amino]pyrimidine-5-carboxylate | Product, step 4 | **C17H20FN3O4S** | **381.42** | — |
| **P5** | N-[4-(4-fluorophenyl)-5-(hydroxymethyl)-6-isopropylpyrimidin-2-yl]-N-methylmethanesulfonamide | Product, step 5 | **C16H20FN3O3S** | **353.41** | — |
| — | KMnO4 / NaOH / NaHCO3 / DIBAL-H (C8H19Al) | Reagents | — | 158.03 / 40.00 / 84.01 / 142.22 | DIBAL-H: concentration and solvent of the solution as supplied |

**Cross-check by fragments.**

| Species | Fragments | Total |
|---|---|---|
| P5 | pyrimidine C4N2 + C6H4F + C3H7 + CH2OH + N(CH3)SO2CH3 | C16H20FN3O3S |
| P4 | the same, with CO2CH3 in place of CH2OH | C17H20FN3O4S |

### E2. Gate 1: the scheme as drawn fails, and passes after by-products are confirmed

**As drawn, each step's imbalance (left minus right) is shown and the engines stay locked:**

| Step | Imbalance |
|---|---|
| 1 | H2O |
| 2 | H2O |
| 3 | H +2, O −2 (with the oxidant only over the arrow) |
| 4 | CH3SO2H (C1 H4 O2 S1) |
| 5 | C1 O1 (with the reductant only over the arrow) |

**Proposed balanced equations.** SPEED proposes these; the chemist confirms them. All were verified element by element
and by mass.

| Step | Balanced equation (by-products in bold) | Chemist must confirm |
|---|---|---|
| 1 | A + B → P1 + **H2O** | Piperidine and AcOH are catalysts (piperidinium acetate) and are not in the equation. |
| 2 (free base) | P1 + C → P2 + **H2O** | Which salt of C is used. |
| 2 (as charged, hemisulfate) | 2 P1 + (C)2·H2SO4 + 2 NaHCO3 → 2 P2 + **Na2SO4 + 2 CO2 + 4 H2O** | That NaHCO3's role is to liberate the free base. What the HCl does: a work-up or neutralisation of excess NaHCO3 (NaHCO3 + HCl → NaCl + **CO2** + H2O), or acid-promoted dehydration? Its equivalents. |
| 3 | P2 + 2 KMnO4 → P3 + **2 MnO2 + 2 KOH** | This assumes MnO4⁻ → MnO2 (3 e⁻ per Mn) and 6 e⁻ per substrate: 2 e⁻ to aromatise, 4 e⁻ to turn sulfide into sulfone. So 2.0 mol KMnO4 is the stoichiometric minimum. Confirm the actual excess, the water content and the pH: in acid, Mn(II) is the product (5 e⁻), so the stoichiometry changes. |
| 4 | P3 + D + NaOH → P4 + **CH3SO2Na + H2O** | NaOH equivalents and form (solid or aqueous). Whether D is pre-deprotonated. |
| 5 | P4 + 2 iBu2AlH + 6 H2O (quench) → P5 + **CH3OH + 2 Al(OH)3 + 4 C4H10 (isobutane)** | That ester → alcohol needs 2 hydride equivalents. The actual excess: each extra mole of DIBAL-H gives **H2 + 2 isobutane** on quench. The quench reagent and sequence (water, methanol, Rochelle salt or acid). |

### E3. What can be computed now

#### E3.1 Oxygen balance

**Formula (from the spec):** OB% = −1600 / MW × (2x + y/2 − w), for CxHyNzOw. The band is −160% < OB% < +80%. That
band is uncited (open item).

**How to read the table:**
- The "CHNO" column applies the specification's formula literally. It ignores S, F and metals as fuel or oxidant.
- The sensitivity column uses a convention still to be chosen (S → SO2, F → HF, Na/K → M2O, Al → Al2O3,
  Mn → MnO2). **It is not a result.** It shows how much the convention matters.

| Material | OB% (CHNO, spec) | In band? | OB% (sensitivity) | Note |
|---|---|---|---|---|
| A 4-fluorobenzaldehyde | −199.8 | No | −193.4 | |
| B methyl isobutyrylacetate | −188.7 | No | −188.7 | |
| P1 | −207.8 | No | −204.6 | |
| C S-methylisothiourea (base) | −124.2 | **Yes → DSC flag** | −159.7 | Small, S- and N-rich molecule |
| C·½H2SO4 (hemisulfate) | −63.2 | **Yes → DSC flag** | −97.7 | |
| P2 | −196.0 | No | −203.5 | |
| P3 | −165.7 | No (5.7 points outside) | −172.5 | Near the edge |
| D N-methylmethanesulfonamide | −80.6 | **Yes → DSC flag** | −109.9 | |
| P4 | −167.8 | No (7.8 points outside) | −174.1 | Near the edge |
| P5 | −176.6 | No | −183.4 | |
| KMnO4 | +40.5 | **Yes → DSC flag** | +15.2 | An oxidiser. The real hazard is in its mixtures (E3.4). |
| DIBAL-H | −286.9 | No | −303.8 | OB% is not meaningful for a pyrophoric organometallic |
| DMSO (solvent) | −122.9 | **Yes → DSC flag** | −163.8 (out) | A relevant flag (E3.4) |
| Acetic acid (solvent) | −106.6 | **Yes → DSC flag** | −106.6 | Not an energetic material. The reviewer would disposition this with a cited reason. |
| IPA / acetone / toluene / piperidine | −239.6 / −220.4 / −312.6 / −291.3 | No | Same | |

**Reading.** The CHNO band flags six materials. At least one of them (acetic acid) is a false positive, and at least
one (DMSO) is relevant for a different reason. This supports the open item: the band needs a citation and a
heteroatom convention. Flags are dispositioned by the reviewer, with a reason. They are never silently suppressed.

#### E3.2 Explosophore screen (the SP-202 list)

**Result.** None of these groups is present in any reactant, intermediate, product or solvent:
- nitro, nitroso, azide or diazo;
- peroxide;
- N–O;
- acetylenic;
- N-halo;
- other high-energy groups.

**Other features recorded** (not explosophores):

| Feature | Hazard type |
|---|---|
| Permanganate | An oxidising salt; a compatibility hazard |
| Al–H and Al–C in DIBAL-H | Pyrophoric and water-reactive |
| S=O in DMSO | Known decomposition behaviour |
| IPA | Appears on some peroxide-former lists as a concentration hazard (verify against the site solvent policy) |

**Effect on SP-203.** The mandatory flags therefore come from OB% only.

#### E3.3 Atom economy (AE = MW of product / Σ MW of stoichiometric reactants × 100%)

**Base-case assumptions:**
- C is the free base;
- KMnO4 is reduced to MnO2 (2 mol per mol);
- NaOH is 1 mol and counted;
- DIBAL-H is 2 mol;
- the 6 mol of quench water are counted, because the alcohol's hydrogen comes from the quench;
- catalysts and solvents are excluded, as AE defines.

| Step | AE, base case | Sensitivity |
|---|---|---|
| 1 Knoevenagel | **93.3%** | — |
| 2 Cyclocondensation | **94.7%** | 68.1% if the hemisulfate and 1 NaHCO3 are counted |
| 3 KMnO4 oxidation | **55.2%** | Lower if excess oxidant were counted (AE excludes excess; RME captures it) |
| 4 Substitution | **76.1%** | 82.6% without NaOH |
| 5 DIBAL-H reduction | **45.7%** | 53.1% without the quench water |
| **Overall, 5 steps** (P5 / all consumed reactants; intermediates cancel; Σ = 1,216.17 g/mol) | **29.1%** | 26.2% (as hemisulfate + NaHCO3); 31.9% (without quench water) |

**Reading.** The stoichiometric oxidation (step 3) and the aluminium-hydride reduction (step 5) dominate the mass
inefficiency. These two steps are where the route-improvement discussion should start, for example on catalytic
alternatives. That decision belongs to the chemist.

#### E3.4 Reactive hazard and compatibility flags (qualitative, each to be cited from the licensed corpus or SDS)

| # | Step | Pair or condition | Flag and reason | Action raised |
|---|---|---|---|---|
| H1 | 1 | Piperidine + AcOH; IPA | Mild exotherm from salt formation. IPA is flammable. | SDS-level controls. Calorimetry optional (the reviewer may waive it, with a reason). |
| H2 | 2 | NaHCO3 + H2SO4 (salt) and + HCl | **CO2 evolution.** Foaming and pressure, so headspace and the dosing rate of the acid matter. | Gas measurement; dosing-controlled acid addition |
| H3 | 2 | S-methylisothiourea; P2 (a cyclic S-methyl isothiourea) under basic or acidic heat | **Possible methanethiol release.** It is toxic, flammable and has an extreme stench. | Off-gas analysis; scrubber design by process safety |
| H4 | 2, 4 | **DMSO with acid, base or salts at elevated temperature** | The literature reports that DMSO's decomposition is autocatalytic and that acids, bases and some salts can lower its onset (process-safety literature, e.g. Org. Process Res. Dev. reviews on DMSO mixtures; **verify** citation). Step 4 (NaOH/DMSO) is the higher concern. | DSC of the actual mixtures; ARC with pressure if the onset is near the process window |
| H5 | 3 | **KMnO4 (strong oxidant) + acetone and the organic substrate** | Exothermic oxidation. Acetone itself is oxidisable, so it consumes oxidant and adds heat. KMnO4 is a solid poorly soluble in acetone, so accumulation is possible if solids are dosed into a cold mass. | Reaction calorimetry with the real dosing mode |
| H6 | 3 | KMnO4 waste | The **MnO2** solid is fine and filters slowly. The cake can hold residual permanganate and solvent. | Defined quench of excess oxidant before filtration (the chemist chooses the reductant); keep the cake wet; DSC of the cake |
| H7 | 2→3 carry-over | Residual **HCl** in P2 + KMnO4 | Permanganate oxidises chloride to **chlorine**. | Specification for acid or chloride in P2 before step 3 |
| H8 | 3→4 carry-over | Residual oxidant in P3 + DMSO | SDS: DMSO is incompatible with strong oxidisers. | Test for residual oxidant before step 4 |
| H9 | 4 | NaOH + methyl esters (P3, P4); residual acetone + NaOH | Ester hydrolysis (a quality issue and a mild exotherm). Aldol reaction of acetone. | IPC; drying specification for P3 |
| H10 | 5 | **DIBAL-H** | Pyrophoric (neat; for solutions, per the SDS for the supplied concentration). Violent with water, giving isobutane and H2 (from Al–H). Often run sub-ambient or cryogenic: slow reaction at low Tp means **accumulation**, then a heat surge on warming. | Reaction calorimetry at the intended Tp; an inert-gas handling SOP |
| H11 | 5 | **The quench** | Strongly exothermic, with gas. **Isobutane (bp about −12 °C) dissolves or condenses when cold and is released as the mass warms (delayed gas).** Aluminium salts can gel. | Gas measurement of the quench against temperature |
| H12 | 4→5 carry-over | Residual water, DMSO or NaOH in P4 + DIBAL-H | Consumes reagent and makes gas and heat. Aluminium alkyls react with sulfoxides (verify). | Water (KF) and residual-DMSO specification for P4 |
| H13 | 1, 3, 5 | IPA, acetone, toluene | Flammable. Toluene is a low-conductivity static accumulator. | Inerting and grounding per site standard |
| H14 | 1 | Piperidine | Controlled-precursor status in some jurisdictions (verify per country). | Compliance check, not a safety flag |

**Gas evolution (SP-222).** These are stoichiometric amounts per mole, for an ideal gas at 25 °C and 1.01325 bar
(24.47 L/mol). They are **not** process-condition values. The comparison with headspace and vents is **not
computed**, because there are no vessel data.

| Step | Gas | Stoichiometric amount |
|---|---|---|
| 2 | CO2 from neutralising the hemisulfate | 1 mol per mol of P2, about 24.5 L/mol of P2. Plus 1 mol CO2 per mol of HCl that meets bicarbonate (amount unknown). |
| 2 | Methanethiol | Not quantifiable. It is a side reaction. |
| 5 | Isobutane at 2.0 equiv DIBAL-H | 4 mol per mol of P4, about 97.9 L/mol |
| 5 | Each extra equivalent of DIBAL-H | Another 2 isobutane + 1 H2, about 73.4 L/mol |

**Gas release rate is not computed**, because it needs the dosing rate and Stage-2 measurement.

#### E3.5 Residual solvents (ICH Q3C, current revision; verify)

| Solvent | Class | Note |
|---|---|---|
| 2-propanol (IPA) | Class 3 | |
| Acetic acid | Class 3 | |
| DMSO | Class 3 | |
| Acetone | Class 3 | |
| Toluene | **Class 2** | 890 ppm (PDE 8.9 mg/day) |
| Methanol (step 5 by-product) | **Class 2** | 3,000 ppm |
| DIBAL-H's carrier solvent | Depends on the solvent | Hexane, if used, is Class 2 (290 ppm). Heptane is Class 3. |
| Piperidine | Not in the Q3C tables, as far as we know (verify) | |

**Elemental impurities.** Mn (step 3) and Al (step 5) are process residues. Confirm their status under ICH Q3D, which
does not set PDEs for some low-toxicity elements (verify).

#### E3.6 ICH M7 notes (structural alerts only; no conclusion on mutagenicity)

| Species | Feature | Note |
|---|---|---|
| P1 | α,β-unsaturated carbonyl (a Michael acceptor) | A recognised alert class. Needs two complementary (Q)SAR methods (expert rule-based and statistical) and expert review. |
| A | Aromatic aldehyde | An alert in some systems. Assess. |
| P3 | 2-(methylsulfonyl)pyrimidine | An activated electrophile (SNAr-reactive). Assess. Relevant to purge arguments. |
| C, D | — | Assess by (Q)SAR. |

**Scope.** M7 applies to impurities in the drug substance. These species are upstream intermediates and reagents, so
their **purge** to the final drug substance is the eventual question. **No sulfonic acid + alcohol combination** (the
alkyl sulfonate-ester risk) is evident in the scheme. Confirm this against the real reagents and work-ups.

### E4. Blocked by Gate 2: not computed

The scheme gives no process conditions, so Gate 2 blocks the thermal engines for **all five steps**.

**Missing inputs, per step:**
- Tp;
- concentration C0, or batch mass and solvent volumes;
- the solvent volume for each solvent (IPA/AcOH, DMSO, acetone, DMSO, toluene);
- dosing mode (batch or semi-batch) and the dosed reagent;
- addition time;
- MTT (boiling point at the operating pressure, or the vessel limit);
- the Xac source.

**Missing for the gas estimate:** vessel headspace and vent capacity.

**Missing for green metrics:** charged masses of every input, including work-up and washes, and the isolated yields.

| Output | Status | Why |
|---|---|---|
| ΔHrxn (Hess / Benson) | **Not computed** | No validated ΔH°f data or Benson engine is in hand. Some group values may be missing. Inorganic species (KMnO4, MnO2, KOH) are tabulated, but the organics are not. |
| ΔTad, MTSR | **Not computed** | Needs ΔHrxn, C0, ρ, Cp and Tp |
| TMRad, TD24 | **Not computed** | Needs decomposition data and the agreed defaults (open item) |
| Stoessel class | **Not computed** | Needs Tp, MTSR, MTT and TD24 |
| E-factor, PMI, RME | **Not computed** | Needs masses |
| Gas against headspace and vent | **Not computed** | Needs vessel data and rates |

**Qualitative expectation (from general literature, not a number):**
- **Expected to be strongly exothermic:** steps 3 (oxidation), 5 (hydride reduction and its quench) and the
  neutralisations.
- **Expected to be more moderate:** steps 1 and 4.

Stage 2 measures this.

> **ILLUSTRATION — not a result.** These are hypothetical inputs for a generic semi-batch step. They do not belong to
> any step above.
> - Inputs: ΔHrxn = −100 kJ/mol, C0 = 0.5 mol/L, ρ = 0.9 kg/L, Cp = 1.8 kJ/(kg·K).
> - ΔTad = (100 × 0.5) / (0.9 × 1.8) = **30.9 K**.
> - With Tp = 25 °C and Xac = 1 (the default), MTSR = **55.9 °C**. With a measured Xac = 0.3, MTSR = 34.3 °C.
> - With a hypothetical MTT = 110 °C and TD24 = 150 °C, the ordering is Tp < MTSR < MTT < TD24, which is **class 1**.
>
> The example shows why Xac from calorimetry matters. It also shows why SPEED refuses to print a class without real
> inputs.

### E5. Stage-2 test plan the system would issue

**Trigger rules:**
- **R1 (SP-203):** an OB% flag or an explosophore.
- **R2 (proposed site rule; process safety to confirm):** DSC of every isolated intermediate.
- **R3:** a step with an exotherm or accumulation flag.
- **R4:** a step with predicted gas.
- **R5:** DMSO with an acid, base or salt.

| # | Target | Test | Trigger | Question answered |
|---|---|---|---|---|
| T1 | S-methylisothiourea salt (as supplied) | DSC; TGA with evolved-gas analysis | R1, H3 | Onset and energy; methanethiol release |
| T2 | N-methylmethanesulfonamide | DSC | R1 | Onset and energy. May be dispositioned with cited data. |
| T3 | Acetic acid, DMSO (as solvents) | Disposition with literature data, or DSC | R1 | Confirm whether the flag stands |
| T4 | P1–P5 (isolated, as dried) | DSC on each | R2 | Safe drying and storage temperature; TD24 basis |
| T5 | Step 2 reaction mixture (DMSO, salt, NaHCO3, then HCl) | DSC of the mixture; reaction calorimetry of the acid addition; gas measurement (CO2 rate, methanethiol detection) | R3, R4, R5 | Heat and gas rate; foaming margin |
| T6 | Step 3 (KMnO4 dosing into substrate in acetone) | Reaction calorimetry with the real solid or solution dosing; DSC of the mixture and of the wet MnO2 cake | R1, R3, H5, H6 | Heat-release rate, accumulation, cake stability |
| T7 | Step 4 (P3 + D + NaOH in DMSO) | DSC across the full process window; ARC with pressure if the DSC onset is close; reaction calorimetry | R3, R5, H4 | Decomposition margin; TD24; heat of substitution |
| T8 | Step 5 (DIBAL-H addition at the intended Tp) | Reaction calorimetry measuring accumulation at low Tp | R3, H10 | Xac and MTSR on warming |
| T9 | Step 5 quench | Reaction calorimetry plus gas measurement against temperature | R4, H11 | Rate of isobutane and H2 release; delayed gas on warm-up |
| T10 | DMSO recovery residues (if recovery is planned) | DSC or ARC | R5 | Decomposition of concentrated residues |
| T11 | Carry-over (H7, H8, H12) | Analytical in-process control specifications, not thermal tests: chloride or acid in P2; residual oxidant in P3; water (KF) and DMSO in P4 | Carry-over flags | Removes the incompatibility at its source |

### E6. Dossier outline and e-signature steps

**Dossier, v1 (status: "Stage 1 — partial: thermal engines blocked at Gate 2"):**
1. Header: the route ID and version, the scheme hash, and the engine and rule versions.
2. Gate 1 record: the E2 equations and the chemist's confirmations.
3. Inputs and provenance. There were no extractions (no write-up was supplied).
4. OB% and explosophores (E3.1–E3.2), with the band version and its citation status.
5. Thermochemistry: the E4 "not computed" table and the Gate 2 missing-input list.
6. Hazard and compatibility matrix with citations, and the gas table (E3.4).
7. Green metrics: AE, with E-factor, PMI and RME marked not computed (E3.3).
8. Regulatory notes: Q3C, Q3D and M7 (E3.5–E3.6).
9. The Stage-2 test plan (E5).
10. Assumptions, the overrides log and open questions.
11. Signature page.

**E-signatures (Part 11 §11.50, §11.70, §11.200; Annex 11 clause 14):**

| Order | Signer | Meaning | Rule |
|---|---|---|---|
| 1 | R&D chemist (author) | "Authored: structures, by-products and inputs confirmed" | Re-authenticates with ID and password. Signs the v1 hash. |
| 2 | Process-safety engineer | "Reviewed: flags dispositioned; overrides justified" | Must not be the author (four-eyes rule, reusing the CMMS sign-off pattern) |
| 3 | Process-engineering lead | "Approved: release of the Stage-2 test plan" | **Not** "approved for scale-up". That meaning is unavailable while any thermal output is "not computed". |
| — | QA | Not required for a Stage-1 R&D dossier | Added when the dossier enters a GMP technology-transfer package (Stage 5) |

**What any edit does.** Any edit after signing creates v2, which is unsigned, and the audit trail keeps v1. When
Stage-2 data arrive, the class is recomputed from measured values and a new signature cycle starts.


<!-- pagebreak -->

# 8. Consolidated roadmap

## 8.1 All modules at a glance

Sizes are to a validated release: S ≤ 1 week, M 2–4 weeks, L 1–3 months, XL more. They are the teams' estimates
before discovery with a real customer. Re-estimate per card.

| Module | GxP classification | GAMP 5 category | Size | Family's order |
| --- | --- | --- | --- | --- |
| SPEED-1 Desk screening | GxP-adjacent, safety-critical | 5 | First slice M; XL to complete | E1 |
| PROC-4 Predictive maintenance | GxP-adjacent engine on a GxP CMMS | 4 (models: non-critical ML) | L, plus M for CMMS GMP extensions | C1 |
| ENG-2 Document processing | GxP for CoA, batch-record and complaint flows | 4 (templates and models: 5) | S fixes first, then L | D1 |
| RESP-2 Content library | GxP-adjacent | 4 | L | B1 |
| CHEM-5 Route economics | Non-GxP (finance-grade correctness) | 4 / 5, no ML | L | A1 |
| RESP-1 Response projects | GxP-adjacent (quality sections) | 4 | L | B2 |
| PROC-3 Multivariate monitoring | By context of use: adjacent, then GxP | 4, with model components | L to XL | C2 |
| CHEM-3 Bayesian experiment design | GxP-adjacent in development | 4 / 5 | L | A2 |
| ENG-1 Drawing intelligence | GxP-adjacent | 4 | L | D2 |
| RESP-3 Trust centre | GxP-adjacent | 4 | L (with external identity) | B3 |
| CHEM-2 Retrosynthesis | GxP-adjacent (feeds Q11, M7) | 4 / 5 | XL | A3 |
| ENG-4 Planning digital twin | GxP-adjacent (QA-approved constraints) | 4 (optimiser 5) | L to XL | D3 |
| PROC-2 PAT and chemometrics | GxP when used as a method (IPC, endpoint, release) | 4, with model components | XL | C3 |
| RESP-5 Buyer-side requests | Non-GxP, with a GxP qualification gate | 4 for the gate | L | B4 |
| CHEM-1 Literature and patents | Non-GxP (licence-sensitive) | 4 / 5 | XL | A4 |
| ENG-3 Vision inspection | GxP (Mode B is critical use under the draft Annex 22) | 4 platform, 5 model | XL | D4 |
| CHEM-4 Reactor digital twin | GxP-adjacent, safety-critical | 5 | XL (live mode adds XL) | A5 |
| RESP-4 Go/no-go | Non-GxP | — | M (another L for a model, only when the data allow) | B5 |
| PROC-1 Simulation and scale-up | GxP-adjacent; narrow scope | 4, with category 5 elements | L (narrow) | C4 |

## 8.2 Waves

**Wave P0: foundations.** Every GxP or GxP-adjacent module needs them. Nothing in P1 reaches a validated release
without them.

1. **Part 11 services:**
   - e-signature with the signature's meaning, re-authentication and manifestation on records and reports. The
     current e-signature module is a contained prototype without them;
   - a field-level audit trail with reasons on every GxP record;
   - write-once originals;
   - a verification queue for AI-extracted values;
   - controlled documents.
2. **The scientific compute service (ADR P1).** It runs RDKit, optimisation, chemometrics and vision with
   reproducible, versioned environments. Until it exists, those engines report "not computed".
3. **The AI model registry (ADR P3):** model cards, test evidence, approval signatures, drift monitors, and a block
   on using a model above its approved context of use.
4. **Validation environment and controlled releases for GxP tenants.** GigaLibs treats UAT as production (plan v3
   decision 0.7a). A regulated customer needs a validation environment, release notes and controlled upgrade timing.
   **This is an owner decision.**
5. **The supplier quality pack:** SDLC procedure, release validation pack template, traceability generator.
6. **Truth fixes before reuse.** The contained document-scanner prototype:
   - invents an invoice number when none is found;
   - defaults the currency to USD;
   - reports a constant confidence of 0.99;
   - enables row-level security without forcing it.

   These must be fixed, under the zero-mock rule, before ENG-2 builds on it.

**Wave P1: first value.** These modules are each self-contained, reuse what exists, and prove a part of the stack.

- **SPEED-1, first slice:**
  - structure and reaction input;
  - the mole-balance gate;
  - oxygen balance;
  - atom economy;
  - the Stoessel calculation from entered values;
  - a dossier with e-signature.

  The deterministic engines come first; thermochemical estimation follows on the compute service.
- **PROC-4, first slice:** predictive requests on the CMMS from meter and telemetry rules. A prediction never changes
  an asset's status.
- **ENG-2, first slice:** certificate-of-analysis intake with human verification, after the truth fixes.
- **RESP-2:** an approved, versioned, expiring content library.
- **CHEM-5, first slice:** route costing from Product Catalogue, Procurement, Inventory and Finance costing.

**Wave P2: expand.**
- SPEED thermochemistry, and the Stage-2 data capture;
- CHEM-3, CHEM-2;
- RESP-1, RESP-3;
- PROC-3 at low impact;
- ENG-1, ENG-4.

**Wave P3: high-assurance and live modules.**
- PROC-2 (advisory first; endpoint and release only with the customer's filing);
- PROC-3 as the CPV system of record;
- ENG-3 (Mode A, then Mode B);
- CHEM-4 (it needs SPEED's approved envelope and plant connectivity);
- CHEM-1, RESP-5, RESP-4, PROC-1.

## 8.3 How this enters the GigaLibs plan

- **Not yet in the plan.** These modules are not in plan v3. Each wave enters only through cards the owner approves.
  The recommendation is P0 and SPEED-1 after Phase 1's W1 (CMMS), unless a named pharma customer brings a module
  forward.
- **One writer.** One implementation writer at a time still applies. Discovery for the next module runs ahead,
  read-only, through the pharma practice.
- **Gates.** Every slice has acceptance tests that fail before and pass after, independent Security review, the
  pharma practice's GxP review, and the owner's deploy.


<!-- pagebreak -->

# 9. Validation strategy for the suite

## 10.1 Supplier and customer responsibilities

| Activity | GigaLibs (supplier) | Customer (regulated user) |
| --- | --- | --- |
| Quality system for software development | Documented SDLC (section 5), change control, CAPA, training | Supplier assessment and audit |
| Requirements | Product specifications per module (URS/FS/DS), GxP classification per function | Intended use, its own URS, configuration specification |
| Risk assessment | Function-level risk (ICH Q9(R1), GAMP 5) | Intended-use risk; acceptance of supplier evidence |
| Verification | Automated tests per requirement, traceability, security testing, release evidence | Leverage supplier evidence; test configuration and critical intended-use scenarios |
| Validation | Release validation package per version; IQ evidence (deployment, health, versions) | OQ and PQ for intended use (risk-based; CSA-style unscripted testing where risk allows); validation summary |
| AI models | Model specification, independent test-set results, model card, drift monitoring | Context-of-use acceptance; human-oversight procedures |
| Operation | Release notes, impact assessment of changes, incident notification, periodic review input | Change control, periodic review, data integrity governance |

## 10.2 Evidence per release (supplier)

1. **Release validation pack:**
   - the version;
   - the requirement-to-test traceability matrix;
   - test results;
   - open defects with their risk assessment;
   - independent review records (security; finance controls where relevant);
   - the deployment record (IQ).
2. **Change impact statement:** which GxP functions changed; recommended regression testing for customers.
3. **AI model changes:** a new model version is a change. It needs re-validation against its specification before
   release; it is never retrained silently.

## 10.3 Validation depth by classification

| Classification | Supplier evidence | Typical customer effort |
| --- | --- | --- |
| GxP, high risk (decides release, rejects product, records batch data) | Scripted tests for every critical function; challenge sets for AI; full traceability; e-signature and audit-trail tests | Scripted OQ/PQ of intended use |
| GxP, medium or low risk | Scripted tests for critical functions; unscripted and exploratory testing for the rest | Mostly leverage supplier evidence; targeted unscripted testing |
| GxP-adjacent | Verification of the confirmation and export controls; audit trail on exports | Procedure for human verification |
| Non-GxP | Good software practice | None for GxP |

<!-- pagebreak -->

# 10. Risks and decisions for the owner

## 11.1 Decisions

1. **Whether and when the pharma suite enters the GigaLibs plan.** Plan v3 Phase 1 is CMMS, accounts, lifecycle,
   operations and the Assistant. These modules would follow, unless a named pharma customer brings one forward.
   Recommended: approve the foundations (section 8, wave P0) and SPEED-1 as the first pharma card once Phase 1's W1 is
   complete.
2. **ADR P1:** the scientific compute service (Python). This changes the platform's runtime set, which is why the
   decision is the owner's.
3. **Named humans:**
   - a head of QA for validation approval;
   - a process safety expert to sign off SPEED;
   - a regulatory CMC lead;
   - a data protection officer;
   - legal counsel for corpus licensing, trademark clearance of the name SPEED, and the IP position on retrosynthesis
     and literature content.
4. **Licensed content:** budget and terms for literature, patent and hazard-reference corpora.
5. **Deployment options for pharma:** region, dedicated and on-premises.
6. **A validation environment for GxP tenants.** UAT is production today (plan v3 decision 0.7a). Regulated customers
   need a validation environment, controlled releases and release notes before upgrades.
7. **Tenant data and models.** One tenant's data never trains another tenant's model: confirm this as policy.

## 11.2 Principal risks

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Treating AI output as fact | Wrong route, wrong hazard verdict, wrong batch decision | Confirmation by a named human; sources and confidence shown; static validated models; never computing what inputs do not support |
| Over-validating non-GxP tools | Slow delivery, cost | Function-level GxP classification; CSA-style proportionality |
| Under-validating GxP functions | Inspection findings, product risk | QA approval of each classification; scripted testing of critical functions |
| Licensing of reference content | Legal exposure | Licence before loading; licence and IP reviewer; citations |
| No plant connectivity | PAT, MSPC and twin modules blocked | ADR P4: integrate site historians through Connector Hub |
| Draft regulations change (Annex 11, Annex 22, FDA AI) | Rework | Track final texts; design to the stricter reading |
| Scope sprawl across 19 modules | Nothing reaches validated release | Waves, one writer, foundations first, SPEED first |

<!-- pagebreak -->

# Appendix A. Glossary

| Term | Meaning |
| --- | --- |
| ALCOA+ | Attributable, Legible, Contemporaneous, Original, Accurate; plus Complete, Consistent, Enduring, Available |
| API | Active pharmaceutical ingredient (in chemistry sections); application programming interface (in software sections) |
| CDMO | Contract development and manufacturing organisation |
| CPP / CQA | Critical process parameter / critical quality attribute (ICH Q8) |
| CSA | Computer software assurance (FDA, risk-based assurance) |
| CSV | Computerised system validation |
| DSC / ARC | Differential scanning calorimetry / accelerating rate calorimetry |
| GAMP 5 | ISPE's good automated manufacturing practice guide, Second Edition (2022) |
| IQ / OQ / PQ | Installation, operational and performance qualification |
| MSPC | Multivariate statistical process control |
| MTSR / MTT / TMRad / TD24 | Maximum temperature of the synthesis reaction / maximum technical temperature / time to maximum rate under adiabatic conditions / temperature at which TMRad is 24 hours |
| PAT | Process analytical technology |
| PMI / RME / AE | Process mass intensity / reaction mass efficiency / atom economy |
| URS / FS / DS | User requirements / functional / design specification |

# Appendix B. Standards and guidance referenced, with status

| Document | Status as understood on 19 October 2026 |
| --- | --- |
| 21 CFR Part 11 | In force (US) |
| EU GMP Annex 11, Computerised Systems | In force. A substantially revised draft was published on 7 July 2025 for consultation; final status to be checked |
| EU GMP Annex 22, Artificial Intelligence | Draft (published 7 July 2025, with revised Annex 11 and Chapter 4); final status to be checked |
| EU GMP Chapter 4, Documentation | In force. Revised draft published 7 July 2025 |
| EU GMP Annex 15, Qualification and Validation | In force |
| FDA guidance "Computer Software Assurance for Production and Quality System Software" | Final (September 2025); medical-device scope, risk-based thinking applied by analogy |
| FDA draft guidance "Considerations for the Use of AI to Support Regulatory Decision-Making for Drug and Biological Products" | Draft (January 2025) |
| FDA guidance "PAT: A Framework for Innovative Pharmaceutical Development, Manufacturing, and Quality Assurance" | Final (2004) |
| ISPE GAMP 5, Second Edition | Published 2022 (industry guide) |
| ICH Q7, Q8(R2), Q9(R1), Q10, Q11, Q12, Q13, Q14, Q2(R2), Q3C, M7 | Adopted ICH guidelines (check the current revision of each) |
| MHRA GxP Data Integrity Guidance (2018); PIC/S PI 041 | Published guidance |
| USP <790>, <1790> | Visible particulates and visual inspection of injections (compendial) |
| CCPS process safety guidelines; Stoessel's thermal risk methodology | Industry practice and literature |

# Appendix C. Specification templates

## C.1 User requirement

`<CODE>-URS-nnn`
- **Statement:** one testable sentence.
- **Rationale.**
- **GxP classification.**
- **Priority:** MoSCoW.
- **Source:** stakeholder or regulation.
- **Acceptance:** the measure.

## C.2 Functional requirement

`<CODE>-FR-nnn`
- **Traces to:** URS IDs.
- **Inputs; processing; outputs; errors.**
- **Roles and permissions:** role × resource × action × scope.
- **Acceptance criteria:** Given / When / Then, quantified.
- **Tests:** `<CODE>-T-nnn`.

## C.3 AI model specification

`<CODE>-AI-nnn`
- **Intended use and context of use.**
- **Decision class:** assistive / critical.
- **Model type and version.**
- **Data:** the provenance of training, validation and independent test sets; representativeness; exclusions.
- **Metrics and thresholds:** for example accuracy, recall on critical defects, RMSEP, calibration.
- **Explainability and confidence shown to users.**
- **Human oversight:** who confirms, and how.
- **Monitoring:** drift measures, alert thresholds, review frequency.
- **Change control:** what triggers re-validation.
- **Static or dynamic:** GxP critical use requires static.

## C.4 Traceability matrix (generated per release)

| URS | FR | Design / ADR | Test | Result | Evidence |
| --- | --- | --- | --- | --- | --- |

# Appendix D. Pharma practice roles to add to the GigaLibs roster

| Role ID | Department | Mission |
| --- | --- | --- |
| `process_safety_specialist` | Centres of expertise | Thermal risk, reactive hazards, calorimetry plans, Stoessel classes; signs off nothing (a named human expert signs) |
| `cheminformatics_specialist` | Centres of expertise | Structures, reactions, mole balance, property data, retrosynthesis methods |
| `pat_chemometrics_specialist` | Centres of expertise | PAT, multivariate models, the analytical procedure lifecycle |
| `gxp_validation_specialist` | Quality | CSV and CSA approach, validation packs, supplier audit readiness |
| `ai_model_validation_specialist` | Independent review and risk | Model specifications, credibility, drift, change control |
| `regulatory_cmc_specialist` | Centres of expertise | ICH Q8–Q12, M7; starting materials; established conditions; filings |

The existing roster entries `industry_pharma_life_sciences` and `quality_regulatory_specialist` become active.


<!-- pagebreak -->

# Appendix E. Sources consulted for regulatory status (19 October 2026)

- FDA final guidance on computer software assurance, reported by NSF:
  https://www.nsf.org/life-science-regulatory-news/fda-final-guidance-computer-software-assurance-csa
- Hogan Lovells, "FDA finalizes Computer Software Assurance guidance for production and quality system software":
  https://www.hoganlovells.com/en/publications/fda-finalizes-computer-software-assurance-guidance-for-production-and-quality-system-software
- Federal Register notice (2025-18468): https://www.federalregister.gov/api/v1/documents/2025-18468.json
- ECA Academy, "Drafts of EU GMP Guideline Annex 11, Annex 22 and Chapter 4 released for comment":
  https://www.gmp-compliance.org/gmp-news/drafts-of-eu-gmp-guideline-annex-11-annex-22-and-chapter-4-released-for-comment
- Rephine, "EMA draft revisions to EU GMP: Annex 11, Annex 22 and AI":
  https://www.rephine.com/resources/blog/ema-draft-revisions-to-eu-gmp-annex-11-annex-22-ai/
- FDA, "Considerations for the Use of Artificial Intelligence to Support Regulatory Decision-Making for Drug and
  Biological Products" (draft guidance page):
  https://www.fda.gov/regulatory-information/search-fda-guidance-documents/considerations-use-artificial-intelligence-support-regulatory-decision-making-drug-and-biological
- ECA Academy, "New FDA guidance for industry draft on AI": https://gmp-compliance.org/gmp-news/new-fda-guidance-for-industry-draft-on-ai

Other standards and guidance are cited by name in the text. Their current revisions must be confirmed by QA before use.
