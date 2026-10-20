# How to read this document

This document aligns **SPEED-BRD-FRD-001 v0.1** (SPEED Stage 1, predictive desk screening; 19 October 2026) with the
current GigaLibs architecture. **The BRD/FRD stays the requirements baseline (the URS and FRS).** This document says
how each requirement is built on GigaLibs: what is reused, what is new, what must change in the platform, and the
decisions the owner must take. Card: WI-OI-120bn.

Requirement IDs (BR-, BRL-, FR-, NFR-, TC-) are the BRD's own and are kept unchanged, so tests and the traceability
matrix cite them directly.

<!-- pagebreak -->

# 1. Summary

- **The BRD fits GigaLibs well.** SPEED becomes one GigaLibs module. Its four engines are pure calculation code, and
  its records, roles, workflow, audit, dossier and deployment map onto platform services that exist or are already
  planned.
- **The reference cases are correct.** All 12 (TC-01 to TC-12) were recomputed independently on 2026-10-20 and
  reproduce exactly (section 2). They become the first automated tests.
- **No Python runtime is needed.**
  - Every Stage-1 engine is deterministic arithmetic and runs in TypeScript.
  - Structure handling (SMILES, MOL, Rxnfile; substructure search for energetic groups) can use RDKit's official
    WebAssembly build (BSD-3 licence) inside the module.
  - So SPEED does not wait for the scientific compute decision (ADR P1 in the pharma plan).
- **Lab-only, on-premises deployment fits.** GigaLibs is already deployed as a self-hosted container stack (this is
  how UAT runs). A lab customer gets a **dedicated instance built from a solution bundle** (the core plus the SPEED
  module) on the lab network, with no internet and no cloud services.
- **Three platform gaps must close before the release can be validated:**
  1. **Append-only audit.** The migration runner grants the runtime role UPDATE and DELETE on every module table, so
     audit rows can be changed today.
  2. **Field-level audit:** old and new value, plus a reason, on every GxP record change.
  3. **Part 11 e-signatures.** The signature needs a meaning and a re-authentication. The existing e-signature module
     is a contained prototype without them.

  1 and 2 are needed for R1, because FR-AUD-01 is a Must. 3 is needed for R2.
- **Two inconsistencies in the BRD need the owner's ruling** (section 6):
  - R1's exit criterion is "all Must requirements", but some Musts are scheduled in R2: workflow, e-signature and
    library governance (FR-WF-01 to 03, FR-ADM-02), and structure input (FR-INP-03, FR-OB-04);
  - the BRD names a former employer in R-05 and section 9.

<!-- pagebreak -->

# 2. Reference cases, verified

Recomputed independently from the formulas in BRD section 15, with IUPAC atomic weights:

| Case | Expected (BRD) | Recomputed | Status |
| --- | --- | --- | --- |
| TC-01 TNT, C7H5N3O6 | OB −74.0 % | −74.0 % | Pass |
| TC-02 Nitroglycerin, C3H5N3O9 | OB +3.5 % | +3.5 % | Pass |
| TC-03 Toluene, C7H8 | OB −312.6 % | −312.6 % | Pass |
| TC-04 Step 1 balanced | AE 93.3 % | 93.3 % | Pass |
| TC-05 Step 1 without water | Gate fails on H and O | Fails on H and O | Pass |
| TC-06 Step 3 with 2 KMnO4 | Balanced | Balanced (sulfone 352.38, substrate 322.40 g/mol) | Pass (ξ depends on the charged mass) |
| TC-07 Step 3 thermal | ΔTad 56.5 K; MTSR 36.3 °C; 100 %: 81.5 °C | 56.5 K; 36.3 °C; 81.5 °C | Pass |
| TC-08 Decomposition (Ea 90 kJ/mol, q 10 W/kg at 140 °C) | TD24 91.8 °C; class 1; class 3 at 100 % | 91.8 °C; class 1 and class 3 (with MTT 56 °C, acetone's boiling point) | Pass |
| TC-09 Tp 70, MTSR 91, MTT 189, TD24 80 | Class 5 | Class 5 | Pass |
| TC-10 Step 5 isobutane, ξ 0.419 | 1.68 mol | 1.68 mol | Pass |
| TC-11 NaOH × DMSO | High | Rule-library dependent | Passes once the library carries the rule |
| TC-12 Route | PMI ≈ 104; AE 29.1 %; yield 45.8 % | AE 29.1 % matches the pharma plan's independent figure; PMI and yield depend on the prototype's illustrative charges | Regression baseline |

**The BRD also closes two gaps** found in the earlier pharma investigation:
- the oxygen-balance formula now treats halogens as HX and sulfur as SO2, and marks inorganic and metal-containing
  materials not applicable (FR-OB-02);
- the Stoessel rule set (section 15) now covers every ordering, with class 5 whenever TD24 ≤ MTSR and TD24 ≤ MTT.

<!-- pagebreak -->

# 3. Where each part of SPEED lives in GigaLibs

## 3.1 The shape

```
Lab network (on premises, no internet)
└── GigaLibs dedicated instance, built from solution bundle "speed-lab"
    ├── Core platform: workspaces, sign-in (tenant OIDC to the site's AD FS), roles, audit,
    │   metadata windows, events, e-signature service (R2)
    ├── Module: process-safety-screening (display name "SPEED", configurable)
    │   ├── API (NestJS on the module SDK): records, gate, results, libraries, workflow, dossier
    │   ├── Schema gigalibs_speed (forced row-level security), append-only audit
    │   └── Web: metadata windows for records, plus SPEED screens (gate, thermal, matrix, metrics)
    └── Package: @gigalibs/process-safety-engines (pure TypeScript; same code in browser and server)
        └── RDKit WebAssembly for structures (no Python)
```

## 3.2 Mapping, requirement by requirement

| BRD element | GigaLibs component | Status |
| --- | --- | --- |
| BR-09, NFR-01: lab network only; no data leaves the site | A dedicated GigaLibs instance from a solution bundle (`solutions/speed-lab.yaml`: the core plus `process-safety-screening`), on the customer's lab server. Images move in offline; no external calls; no cloud AI. | The bundle mechanism exists (`solutions/*.yaml`, selective build); the bundle is new. Single-PC offline mode is deferred to R3 (the same stack on one PC, if a site needs it). |
| FR-ADM-01: company directory login | Tenant OIDC sign-in (it exists: authorisation code with PKCE, identity mapping) against the site's AD FS or Entra ID. For the R1 pilot, administrator-created accounts are allowed (the owner's W2 decision). | Exists. No LDAP bind is built. |
| Section 11: roles | Module roles in `module.yaml` (Chemist, Engineer, Safety reviewer, QA, Admin) mapping to permissions: `speed.routes.read` / `.write`, `speed.engines.run`, `speed.thermal-data.write`, `speed.reviews.submit`, `speed.reviews.approve`, `speed.audit.read` / `.read-own`, `speed.libraries.propose` / `.approve` / `.apply`. Site scope through units and places (BRD Q1). | Pattern exists (CMMS roles, R5 scope). |
| Section 12, FR-WF-01 and FR-WF-03: states and blocks | A module state machine, following the CMMS work-order pattern: Draft → Submitted → In review → Returned or Approved → Superseded. The reviewer is not the author (four-eyes, as CMMS sign-off). Approval is blocked while BRL-03 or BRL-04 is open. | Pattern exists. |
| FR-WF-02: e-signature with password re-entry and meaning | **A platform Part 11 e-signature service:** meaning, re-authentication, manifestation on records and dossiers, record-signature binding. | **Gap.** The e-signature module is a contained prototype without meaning or re-authentication. |
| FR-AUD-01: audit with old and new values and reason; not editable by any role | Module audit events extended to field-level old and new values plus a reason. **Append-only enforcement:** a database trigger that rejects UPDATE and DELETE on audit tables, and runner support for append-only tables (SELECT and INSERT only). | **Gap.** The runner grants UPDATE and DELETE on all module tables today. |
| FR-AUD-02: retention of 10 years | A retention policy and archive export (readable), with no purge of GxP records. | New. |
| Section 13.2–13.6, section 15, NFR-03, NFR-04, NFR-09, NFR-10: engines | `packages/process-safety-engines`: pure functions, no I/O. Formula parser (brackets and hydrates), IUPAC weights (versioned table), extent, balance gate, OB, Hess, ΔTad, MTSR (actual and 100 %), decomposition kinetics, TMRad, TD24 by bisection, Stoessel class, severity and probability, gas moles and volume, AE, RME, E-factor, PMI, yield, route roll-up. Double precision; display rounding only; engine version stamped. Runs in the browser for instant recalculation (NFR-03, under 1 s for 15 steps) **and** on the server, which recomputes authoritatively on save. | New. Tests are TC-01 to TC-12 plus property tests, at ≥ 90 % coverage. |
| FR-INP-03, FR-OB-04: structures and energetic groups by substructure | RDKit WebAssembly (the official build, BSD-3) in the engine package: SMILES, MOL and Rxnfile to formula; energetic groups by SMARTS. **CDXML:** support in the WebAssembly build must be verified. If it is absent, accept CDXML through ChemDraw's export to MOL or Rxnfile in R1. | New. `licence_ip_reviewer` checks it. |
| FR-THM-02: Benson ΔHf° (Should, R2) | Group recognition with RDKit SMARTS, plus a cited group-value table whose licence is checked. Every result is labelled as an estimate (BRL-05). | R2. |
| FR-ADM-02, BRL-08, FR-HAZ-05, section 16.2: libraries | Module tables with versions and statuses: proposed → approved (QA) → applied (Admin). A citation is mandatory. The prototype's starter library is imported as **"unreviewed"**: results that use unreviewed entries say so, and release needs the process safety specialist's review of every entry (zero-mock rule). | New. |
| NFR-10, section 16.1: results | An immutable results table holding the engine version, library versions, inputs hash, outputs and timestamp. Recalculation adds a result; it never edits one. | New. |
| FR-RPT-01 to 05: dossier | Server-side generation from one dossier model. DOCX with `docx` (MIT); PDF with `pdfkit` (MIT, already used by Analytics and AR). "DRAFT — NOT APPROVED" watermark; action list traced to rules; signature block (R2); JSON and CSV export; A4. | New. |
| FR-INP-07, FR-INP-08: write-up parser (Should) | A deterministic pattern parser in TypeScript (as in the prototype); the user confirms every value. **No AI in R1.** It is on premises, with no cloud. A local model through the Assistant's AI abstraction is a later option. | New. |
| Section 14: screens | Records as metadata windows (projects, routes, materials, thermal data, libraries). SPEED screens as module web components: route and gate panel, OB chart, thermal KPI tiles and temperature ladder, interaction matrix, green metrics, dossier preview. `@medusajs/ui`; colour never the only signal; 1366 × 768 minimum. | Pattern exists (CMMS module screens). |
| BR-12, section 18: ELN and LIMS (R3) | Connector Hub (file drop or REST, per site). | R3. |
| NFR-05: TLS, encryption at rest, 15-minute session time-out | TLS at the lab reverse proxy; disk encryption on the customer's server (deployment guide). **The idle time-out setting must be verified in the platform session policy.** | Partly exists. Verify the time-out. |
| NFR-06: trusted clock | Database server time in UTC, NTP on the server, local time shown | Exists |
| NFR-07: nightly backup, quarterly restore test | GigaLibs backup tooling, productised for on-premises (plan W4, O2), with the restore drill in the deployment guide | Partly exists |
| Section 20: GAMP 5, category 5 | The supplier's SDLC and release validation pack (traceability generated from the BRD's IDs). The customer's IQ, OQ and PQ run on their own instance (on premises gives a natural validation environment). | Method in the pharma plan, section 5 |
| BR-14: trademark | Catalogue key `process-safety-screening`; display name "SPEED" is configurable, so a trademark outcome changes only the label | New |

<!-- pagebreak -->

# 4. Decisions for the owner

| # | Decision | Recommendation |
| --- | --- | --- |
| D1 | Deployment model | **A dedicated on-premises GigaLibs instance from a solution bundle.** Not a separate standalone application, which would duplicate the platform: users, audit, workflow, documents. |
| D2 | Chemistry toolkit | **RDKit WebAssembly in the module.** It removes the Python dependency for SPEED. |
| D3 | Part 11 services | **Build e-signature and append-only, field-level audit as platform services** (they serve every GxP module), not inside SPEED. Append-only and field-level audit land first, for R1; e-signature for R2. |
| D4 | Sign-in | **Tenant OIDC to the site's AD FS** (it exists). Administrator-created accounts for the R1 pilot. |
| D5 | Plan placement | SPEED is not in plan v3. Starting it now pauses the remaining W1 step (T3, one place identity) and the Table 1 audit (one writer). W1-B, CMMS unit scope, is already on UAT. **The owner's call.** |
| D6 | BRD release scope (section 6) | Rule R1 as a **non-validated pilot**: all Musts except workflow, e-signature, library governance and structure input, which come in R2. Or move those into R1. |

<!-- pagebreak -->

# 5. Slices to R1, in order

Each slice is a card with tests that fail before and pass after, an independent Security review where code ships,
and the owner's deploy. Sizes: S ≤ 1 week, M 2–4 weeks, L 1–3 months.

| Slice | Scope | BRD coverage | Size | Done when |
| --- | --- | --- | --- | --- |
| **S1 Engines** | `packages/process-safety-engines`: parser, MW, extent, gate, OB, Hess (manual and class value), ΔTad, MTSR, kinetics, TMRad, TD24, Stoessel, ratings, gas, green metrics, route roll-up | §13.2–13.6 engine rules, §15, §15.1 ranges, NFR-03/04/09/10 | M | TC-01 to TC-12 pass (TC-11 with its rule); property tests (balance conservation, PMI = E + 1, monotonic TMRad); coverage ≥ 90 % |
| **S2 Platform: append-only and field-level audit** | Runner support for append-only tables; a trigger that blocks UPDATE and DELETE on audit tables; module-sdk audit with old and new values and a reason | FR-AUD-01 | M | A test proves that the runtime role cannot update or delete an audit row; every change records old, new and reason |
| **S3 Module scaffold** | `module:new` with the S16 kit: `process-safety-screening`, schema `gigalibs_speed` (projects, routes, steps, materials, thermal data, results, libraries), forced RLS, roles and permissions, gateway, catalogue entry, solution bundle `speed-lab` | §11, §16.1 | M | The conversion and manifest checks pass; tenant isolation tests pass |
| **S4 Input and gate** | Projects, routes (15+ steps), materials with roles, charges, conditions with range validation; gate panel with the element table; engines locked until the gate passes | FR-INP-01, 02, 04, 05, 06; FR-GATE-01 to 06 | L | The gate acceptance criteria pass; no engine result for a failing step (FR-GATE-04) |
| **S5 Engine screens and results** | OB, thermal (KPI tiles, temperature ladder, Stoessel strip, gas), green metrics; immutable results with versions and input hash; server recompute | FR-OB-01, 02, 03, 05, 06; FR-THM-01, 03 to 12; FR-GRN-01 to 04 | M | Screen values equal the engine tests; every result is stamped (NFR-10) |
| **S6 Hazard screener and libraries** | Reactivity classes, pair rules with citations, matrix and findings, single-material notes; library tables with versions; starter library imported as unreviewed | FR-HAZ-01 to 06; §16.2 | L | TC-11 passes; no rule without a citation; the "absence of a finding" statement is shown |
| **S7 Dossier** | DOCX and PDF from one model; watermark; action list traced to rules; JSON and CSV | FR-RPT-01 to 04 | M | The files open in Word and a PDF reader; the watermark is on every page until approval |
| **S8 Write-up parser** (Should) | Pattern extraction, user confirmation, add to step | FR-INP-07, 08 | M | At least 90 % of quantities correct on 20 annotated procedures |
| **S9 Pilot deployment** | The speed-lab bundle on a lab server; offline image transfer; TLS; backup and restore drill; pilot with one lab team | BR-09, NFR-01, 02, 05, 06, 07 | M | Pilot sign-off by the business owner |

**R2 (validated):**
- the Part 11 e-signature service, workflow and approval (FR-WF-01 to 03);
- library governance (FR-ADM-02);
- structure input with RDKit (FR-INP-03, FR-OB-04, if D6 moves them);
- Benson (FR-THM-02);
- the IQ, OQ and PQ pack.

**R3:**
- route comparison;
- ELN and LIMS;
- advanced parsing;
- single-PC mode;
- hand-off to SPEED Stage 2.

<!-- pagebreak -->

# 6. Points in the BRD to settle

1. **R1 scope against "all Must requirements".**
   - FR-WF-01, 02, 03 and FR-ADM-02 are Musts, but the roadmap places workflow, e-signature and library governance
     in R2.
   - FR-INP-03 and FR-OB-04 (structure-based) are Musts, but structure input is listed in R2.

   Recommendation (D6): R1 is a **non-validated pilot** whose exit is "all Musts except those six"; R2 is the
   validated release.
2. **A former employer is named** in R-05 and section 9. The BRD itself says to remove the reference from
   externally shared versions. Do so before the BRD leaves the company.
3. **Q3, the alert band.** The −160 % to +80 % band still needs a cited source (BRL-02, FR-OB-03). Until the process
   safety lead confirms it, the dossier shows the band and its citation status.
4. **BRL-06** (TD24 = onset − 100 K when only a DSC onset is known) is a conservative screening rule of thumb. Keep the
   "conservative" label everywhere it is used, as the BRD says.
5. **TC-12** depends on the prototype's illustrative charges. Store those charges with the test, so the baseline is
   reproducible.

# 7. Platform gaps found (verified 2026-10-20)

| Gap | Evidence | Needed for |
| --- | --- | --- |
| Audit rows can be updated or deleted by the runtime role | `infra/compose/docker/run-module-migrations.mjs:148` grants SELECT, INSERT, UPDATE and DELETE on all tables in the module schema | R1 (FR-AUD-01) |
| No Part 11 e-signature (meaning, re-authentication) | `modules/esignature`: `lifecycle: prototype`, `readiness: CONTAINED`; no meaning or re-authentication in its code | R2 (FR-WF-02) |
| No DOCX library in the product | `pdfkit` exists (Analytics, AR); `docx` (MIT) must be added | R1 (FR-RPT-02) |
| No cheminformatics toolkit | No RDKit in any package | R1 or R2 (D6) |
| Session idle time-out not confirmed | Not found in the auth packages by search; verify | NFR-05 |
