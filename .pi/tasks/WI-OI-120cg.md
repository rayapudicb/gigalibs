# WI-OI-120cg: SPEED module enhancements — Stage 1 completion, R2, and Stage 2 production certification

- **Status:** Proposed (plan restored to repo index 2026-10-29). **Do not start** until owner confirms Group 10 turn or
  explicitly overrides deploy sequence.
- **Work item:** WI-OI-120 (SPEED programme). Evidence: `.pi/work/WI-OI-120.md` and
  `docs/pharma/speed/SPEED-Module-Enhancement-Implementation-Plan.md`.
- **Size:** XL (many slices; card sub-slices as work proceeds)

## Goal

Complete captured but unfinished SPEED scope: **S9c/S9d** (lab deployment and pilot), **Stage 1 R2 (S10–S15)**, and
**Stage 2 production certification (S16–S20)** per the Montelukast workbook / AI write-up gaps.

## Read first

1. [SPEED-Module-Enhancement-Implementation-Plan.md](../../docs/pharma/speed/SPEED-Module-Enhancement-Implementation-Plan.md)
2. [SPEED-Stage2-Production-Certification-Plan.md](../../docs/pharma/speed/SPEED-Stage2-Production-Certification-Plan.md)
3. [SPEED-Stage1-Implementation-Plan.md](../../docs/pharma/speed/SPEED-Stage1-Implementation-Plan.md) §5.2
4. Branch **`feat/speed-s3-module`** / **`release/speed-uat`** — module not on `feat/gigaops-convergence-core` alone.

## Scope

- **May change:** `modules/process-safety-screening`, `packages/process-safety-engines`, SPEED contracts, `speed-lab`
  compose/solution, `.pi` evidence.
- **Must not change:** CMMS import/export; UAT production tenant data without owner deploy; start Group 10 before owner
  accepts sequencing.

## Proposed order

1. Close [WI-OI-120cc](WI-OI-120cc.md) **S9c/S9d** (speed-lab bundle, restore drill, pilot sign-off).
2. Owner decisions in Stage 2 plan §4 (dust standards, standalone dust product, AI gating).
3. **S16 → S17 → S18 → S19 → S20** (Stage 2 plan §3); interleave **S10–S15** when platform e-sign and workflow are ready.

## Done when

- [ ] Enhancement index and Stage 2 plan linked from `.pi/NOW.md` and WORK_ITEMS (documentation gate).
- [ ] Each slice S9c/d and S16–S20 (and chosen R2 slices) has its own Built card, tests, and review evidence.
- [ ] Pilot on `speed-lab` and Group 10 deploy sequence position recorded; no claim of production certification without
      owner acceptance.

## Stop and ask if

- Work would deploy to UAT as validated GxP without Security review.
- S20 is requested before Companion / local model hold ([WI-OI-120bc](WI-OI-120bc.md)) is lifted.
