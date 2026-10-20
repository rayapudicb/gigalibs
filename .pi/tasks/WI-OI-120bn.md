# WI-OI-120bn: SPEED Stage 1 (desk screening) on GigaLibs: architecture alignment and R1 slices

- **Status:** Approved 2026-10-20 (owner: "approved 120bn as recommended"); in progress. S1 is Built and committed
  (`68be9379` on `feat/speed-s1-engines`, WI-OI-120br). The owner asked first: "lets work on this slice, can you align
  with the current architecture".
- **Decisions (all as recommended, 2026-10-20):**
  - **D1** dedicated on-premises instance from the `speed-lab` solution bundle, not a separate application;
  - **D2** RDKit WebAssembly inside the module, no Python;
  - **D3** append-only, field-level audit (R1) and Part 11 e-signature (R2) as platform services;
  - **D4** tenant OIDC to the site's AD FS; administrator-created accounts for the pilot;
  - **D5** SPEED runs now, in parallel worktrees, without displacing the Phase 1 writer;
  - **D6** R1 is a non-validated pilot: every Must except workflow, e-signature, library governance and structure
    input, which come in R2;
  - **D7** one product, two deployments: a SaaS workspace by entitlement, or a dedicated lab instance;
  - **D8** no AI in R1; optional AI extraction in R2 at the earliest, run inside the deployment, every value confirmed
    by the user;
  - **D9** the library holds curated entries written by the process safety specialist, each citing its source; no
    copied text; bulk loading only under a licence.
- **Work item:** WI-OI-120 (pharma practice; follows WI-OI-120bm). Requirements baseline: SPEED-BRD-FRD-001 v0.1
  (`~/Downloads/SPEED_Stage1_BRD_FRD.docx`).
- **Size:** L overall, in 9 slices (S1–S9); each slice is its own card.

## Goal

SPEED Stage 1 runs as a GigaLibs module:
- on a dedicated on-premises instance (lab network, no internet);
- with the BRD's four engines, gate, libraries, dossier and audit;
- as an R1 pilot with one lab team, then an R2 validated release.

## Alignment

`docs/pharma/speed/SPEED-Stage1-Architecture-Alignment.md` (Word copy alongside). It maps every BRD requirement to a
GigaLibs component. Its section 2 records the independent recomputation: TC-01 to TC-12 reproduce exactly.

## Implementation plan (2026-10-20)

`docs/pharma/speed/SPEED-Stage1-Implementation-Plan.md` (and `.docx`): the clickable mock mapped screen by screen and
action by action onto the architecture, the target code layout and data model, R1 slices S1–S9 and R2 slices
S10–S15 with proofs, dependencies, sizes and agents, and the order (S1 can start in its own worktree). It assumes
D1–D6 as recommended.

**v1.2 (2026-10-20):** the mock is the UI, driven by metadata (calculation panels placed by the dictionary; platform
slice S2b adds metadata panels); cross-check against the owner's BP-01 blueprint, Stage 1 note and reference route
(section 9) adds decisions **D7** (SaaS and lab instance from one product), **D8** (AI extraction and retrieval,
R2 at the earliest) and **D9** (reference literature as cited curated entries, not copied text).

## Decisions for the owner (alignment section 4)

| # | Decision | Recommendation |
| --- | --- | --- |
| D1 | Deployment | A dedicated on-premises instance from solution bundle `speed-lab` |
| D2 | Chemistry | RDKit WebAssembly in the module; no Python |
| D3 | Part 11 | Append-only and field-level audit as platform services for R1; e-signature service for R2 |
| D4 | Sign-in | Tenant OIDC to the site's AD FS; administrator-created accounts for the pilot |
| D5 | Plan | SPEED is not in plan v3; starting now pauses T3 and the Table 1 audit (one writer); W1-B is already on UAT |
| D6 | BRD scope | R1 is a non-validated pilot without workflow, e-signature, library governance and structure input (R2) |

## Slices (alignment section 5)

S1 engines (M) → S2 append-only and field-level audit (M) → S3 module scaffold and bundle (M) → S4 input and gate (L)
→ S5 engine screens and results (M) → S6 hazard screener and libraries (L) → S7 dossier (M) → S8 write-up parser (M,
Should) → S9 pilot deployment (M).

**First card: S1, the engine package.** It is pure TypeScript, with TC-01 to TC-12 as tests. It depends on no
decision except D5.

## Platform gaps found (verified 2026-10-20)

- `infra/compose/docker/run-module-migrations.mjs:148` grants UPDATE and DELETE on all module tables, so audit rows
  are not append-only.
- `modules/esignature` is a contained prototype without Part 11 meaning or re-authentication.
- There is no DOCX library (pdfkit exists).
- There is no RDKit.
- The session idle time-out is not confirmed.

## Done when (this card)

- [x] The alignment covers every BRD requirement, with reuse, gaps and decisions.
- [x] The reference cases were recomputed independently.
- [ ] The owner takes D1–D6 and approves S1.
