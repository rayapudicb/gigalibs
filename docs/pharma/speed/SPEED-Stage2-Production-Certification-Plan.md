# SPEED Stage 2 — Production Certification: implementation plan

**Index:** [SPEED-Module-Enhancement-Implementation-Plan.md](./SPEED-Module-Enhancement-Implementation-Plan.md) (status of
S9c/d, R2, and this document). Task card: `.pi/tasks/WI-OI-120cg.md`.

**What this is.** The two owner documents (the Montelukast Sodium reaction-hazard workbook + the AI-drafted write-up)
define SPEED's **production-certification** scope: the step from "screen the reaction at the desk" (Stage 1, shipping)
to "a full safety assessment ready for scale-up." This plan turns the owner's four gaps into SPEED slices in the same
shape as `SPEED-Stage1-Implementation-Plan.md` — pure engines in `@gigalibs/process-safety-engines`, records + metadata
windows in `modules/process-safety-screening`, every number recomputed server-side from cited data, no hard-coding.

**Sequencing (unchanged from the owner's note).** This is **group 10 in the fixed deploy sequence** — SPEED's
production certification, *after* the current order. **Nothing starts now; mobile and the running order are untouched.**
This document only records the scope so it is ready when group 10 comes. It is built on the SPEED line in its own
worktree, tested on `gigalibs-test`, piloted on `speed-lab`, and **never on UAT** (SPEED's rule 7).

---

## 1. What SPEED already has vs. the four new areas

Stage 1 (S1–S9 shipping, S10–S15 the validated release) already covers ~60% of the workbook: reaction balance + the
mole gate, oxygen balance, energetic groups, binary interactions, ΔTad, MTSR, TMRad, TD24, the Stoessel criticality
class, green metrics, and the dossier. Two of the four gaps are already **seeded**, which lowers their cost:

| Owner's gap | SPEED today | New work |
| --- | --- | --- |
| **A. Powder & dust explosion** (dry API) | **Nothing** | A whole new engine + data + tab (biggest piece) |
| **B. What-if cases** (less solvent, dump addition, loss of cooling, distillation residue) | Loss-of-cooling is the base case (MTSR/TMRad/Stoessel already assume cooling fails) | A scenario runner that perturbs inputs and recomputes; the residue sub-case |
| **C. Testing plan + Basis of Safety** | **Seeded in S7:** `actionList` (actions before kilo-lab) and `stage2Plan` (DSC, ARC, RC1, gas tests) already exist as pure functions | Deepen into a scale-aware test plan (kilo-lab vs plant), instrument-derived TMRad (DSC/TSU/ARC), and the Basis-of-Safety composer |
| **D. AI drafts the assessment** | **Decided (D8):** R2 may add AI extraction through the Assistant's AI layer, in-instance, every value user-confirmed | Wire the Assistant to draft a full assessment from the scheme; tie to the Companion's local model |

---

## 2. The four areas as concrete work

All engine functions keep SPEED's form `f(inputs, criteria, library, weights) → outputs` — pure, no I/O, no business
constants. All thresholds and properties are **versioned, cited data** (criteria sets + libraries), never code
constants. Every result is immutable and stamps the engine/criteria/library/weights versions it used.

### A. Powder & dust explosion assessment — the new pillar
*Engine* (`process-safety-engines`): new `dust.ts` computing, from a substance's dust properties + the dust criteria
set: MIE (minimum ignition energy) band, MIT (cloud and layer ignition temperatures), K_st / P_max → St class (St 1–3),
LOC (limiting oxygen concentration) with the inerting target (N₂ to below LOC minus the criteria's safety margin), MEC
(minimum explosible concentration), and the charge-relaxation/resistivity verdict. A missing property gives a
"data gap", never a default.
*Data* (`gigalibs_speed`): a `dust_data` table mirroring `thermal_data` (substance, kind ∈ {MIE, MIT-cloud, MIT-layer,
Kst, Pmax, LOC, MEC, resistivity}, value, unit, measured|estimated, source, citation, conservative flag); the dust
thresholds live in a new section of `screening_criteria` (each value cited). `results` gain the dust outputs.
*UI*: a **Powder & dust** tab with a `DustPanel` registered component (the S2b metadata-panel pattern) and a
`speed-dust-data` metadata window.
*Proof*: new TC fixtures for a dried API (St class monotonic in K_st; inerting target strictly below LOC; data-gap when
a property is missing); `process_safety_specialist` + `licence_ip_reviewer` (standards source) + `security_reviewer`.
*Note (owner's point)*: dust/powder assessment applies to **any plant that dries or mills powder** (food, chemicals,
agriculture), so it is built as a self-contained engine + capability and can later be offered standalone.

### B. What-if cases — scenario runner on the existing thermal engine
*Engine*: new `scenario.ts` that takes the base case and a perturbation and recomputes ΔTad/MTSR/TMRad/Stoessel:
`less-solvent` (higher concentration → higher ΔTad), `dump-addition` (no dosing control → full reagent accumulation),
`loss-of-cooling` (already the adiabatic base case — surfaced explicitly), and `distillation-residue` (a concentration
factor → the residue's ΔTad/onset). Each case reuses `thermal.ts`/`stoessel.ts`; nothing new is invented numerically.
*Data*: `whatif_cases` (route/step, case kind, perturbation params) and a result row per case (immutable, like
`results`).
*UI*: a **What-if** tab (`WhatIfPanel`) showing each case's criticality beside the base case.
*Proof*: TC fixtures per case kind + the reference route's cases; `process_safety_specialist`.

### C. Testing plan + Basis of Safety — deepen S7's seed
*Engine*: grow `actionList`/`stage2Plan` into a **scale-aware test-recommendation** function — from the data gaps +
criticality class + dust results it names the tests needed at **kilo-lab** and at **plant** scale (DSC, TSU, ARC, RC1,
gas, and the dust tests MIE/MIT/Kst/LOC), and records **which instrument each TMRad/parameter must come from** (an
instrument-derived TMRad path alongside today's kinetics path, per the workbook). A **Basis-of-Safety composer** then
derives, from the whole assessment, the controls, interlocks and nitrogen inerting required before scale-up.
*Data*: `testing_plan` and `basis_of_safety` rows, both derived and immutable per result, linked to the findings and
criticality that drove them.
*UI*: the **Dossier** gains Testing Plan + Basis of Safety sections; a **Scale-up** tab presents them.
*Proof*: deterministic from inputs (same plan for the same assessment); `process_safety_specialist` +
`gxp_validation_specialist`.

### D. AI drafts the assessment — the Assistant applied to SPEED (decision D8)
The Assistant drafts a **full assessment from the reaction scheme** — materials, balance, screening, thermal,
criticality, dust, what-if, write-up — producing a **DRAFT** route + results that a chemist reviews and edits; **no
value is ever applied silently**, and the draft is labelled until confirmed. SPEED's windows/actions become Assistant
tools (the GU6 adoption kit: "draft the assessment for this scheme", "what is the MTSR of step 3").
*Constraint*: SPEED's NFR-01 forbids cloud AI or data leaving the instance, so this runs on a **local, in-instance
model** — which ties directly to the **Giga AI Companion (WI-OI-120bc), currently ON HOLD** pending a stronger local
model (`qwen2.5:7b`). D (AI draft) therefore cannot ship until that hold lifts.
*Proof*: the draft never auto-applies; every value user-confirmed; `ai_model_validation_specialist` + `security` + `gxp`.

---

## 3. Proposed slices (continuing SPEED's S-numbering)

| Slice | Delivers | Depends on | Size |
| --- | --- | --- | --- |
| **S16 Dust engine** | `dust.ts` + dust criteria section + TC fixtures | S1 engines | M |
| **S17 Dust data & screen** | `dust_data` CRUD, `speed-dust-data` window, Powder & dust tab + `DustPanel` | S16, S5 | M |
| **S18 What-if** | `scenario.ts`, `whatif_cases`, What-if tab | S5 (thermal) | M |
| **S19 Test plan + Basis of Safety** | engine growth of `actionList`/`stage2Plan`, instrument-derived TMRad, BoS composer, dossier sections, Scale-up tab | S7, S16, S18 | L |
| **S20 AI assessment draft** | Assistant tools over SPEED; scheme → draft assessment; in-instance model | WI-OI-120bc hold lifted; plan v3 W5 Assistant | L |

Order: **S16 → S17**, **S18** in parallel, then **S19** (needs dust + what-if), then **S20** last (gated on the
Companion). Each slice is one card: tests named from the requirement IDs (so the traceability matrix is generated),
`pnpm verify` green (`audit:layers`, `audit:design-tokens`, `audit:production-data`), forward-only structure-only
migrations, independent review before it ships, evidence on the card.

---

## 4. Decisions needed from the owner (before S16)

1. **Dust standards source** — which cited standard for the thresholds and test methods (e.g. ASTM E1226/E2019,
   VDI 2263, IEC 60079-10-2), the same way the OB alert band needs its published source. Blocks the dust criteria pack.
2. **Standalone dust product?** — whether the powder/dust assessment is also packaged as its own catalogue module for
   non-pharma plants (food/chemicals/agriculture), or stays a SPEED capability for now.
3. **AI draft timing** — confirm S20 is gated on the Giga AI Companion local-model resolution (`qwen2.5:7b`,
   WI-OI-120bc) and the plan-v3 W5 Assistant adoption.
4. **Sequencing** — confirm this is recorded as group 10 and nothing starts before its turn (as the note already says).

## 5. Guardrails (inherited from Stage 1, unchanged)
Server-authoritative calculation; immutable, version-stamped results; no business values in code (cited criteria +
libraries only); no silent fallbacks (data gaps surfaced); **no external calls at runtime** — any AI is a local
in-instance model; dev/test on `gigalibs-test`, pilot on `speed-lab`, **never UAT**; `security_reviewer` on every code
slice, `gxp_validation_specialist` on the test-plan/BoS and AI slices, `licence_ip_reviewer` on every standards source.
