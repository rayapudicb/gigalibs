# WI-OI-120bn: SPEED Stage 1 (desk screening) on GigaLibs: architecture alignment and R1 slices

- **Status:** Proposed (2026-10-20). The owner asked: "lets work on this slice, can you align with the current
  architecture".
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
