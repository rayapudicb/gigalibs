# SPEED module enhancement — implementation plan (restored index)

**Purpose.** Single entry point for SPEED work **after Stage 1 R1 desk screening** (S1–S7, UAT prototype via
WI-OI-120cd/120ce) and for **production-certification enhancements** (Stage 2). This index was restored 2026-10-29 so
agents and the owner can find captured scope without searching git history.

**Canonical sources (read in order):**

| Document | Role |
| --- | --- |
| [SPEED-Stage1-Implementation-Plan.md](./SPEED-Stage1-Implementation-Plan.md) | R1 slices S1–S9; R2 slices S10–S15; guardrails |
| [SPEED-Stage1-Screen-Specifications.md](./SPEED-Stage1-Screen-Specifications.md) | Windows, panels, messages (S3–S7, S8, S9) |
| [SPEED-Stage1-Architecture-Alignment.md](./SPEED-Stage1-Architecture-Alignment.md) | Decisions D1–D9, module boundary |
| [SPEED-Stage2-Production-Certification-Plan.md](./SPEED-Stage2-Production-Certification-Plan.md) | **Enhancement / scale-up scope** — gaps A–D, slices **S16–S20** |

**Deploy sequence:** AGENTS.md **Group 10** — SPEED production certification (after Groups 1–9). Build in the SPEED
worktree (`feat/speed-s3-module` / `release/speed-uat`); test on `gigalibs-test` and `speed-lab`; **never treat UAT as
the lab pilot** (plan rule 7 — UAT may carry a PLANNED prototype only).

---

## 1. What is done vs open (2026-10-29)

### Stage 1 R1 — desk screening (module `process-safety-screening`)

| Slice | Status | Evidence |
| --- | --- | --- |
| S1 Engines | **Built** | WI-OI-120br, `packages/process-safety-engines` |
| S2 Platform audit | Partial / shared | WI-OI-120bp platform audit patterns |
| S2b Metadata panels | **Built** | WI-OI-120bs |
| S3 Module scaffold | **Built** | WI-OI-120bw |
| S4 Input & gate | **Built** | WI-OI-120bx |
| S5 OB / thermal / green | **Built** | WI-OI-120by |
| S6 Interactions & libraries | **Built** | WI-OI-120bz |
| S7 Dossier (+ S7a `actionList` / `stage2Plan`) | **Built** | WI-OI-120ca, WI-OI-120bv |
| S8 Write-up parser | **Built** (R1 completion) | WI-OI-120cc `fb21e5c8` |
| S9 Outcomes (S9b) | **Built** | WI-OI-120cc `fb21e5c8` |
| S9a speed-lab preview | **Built** | WI-OI-120cc `5b74a503` |
| S9c speed-lab bundle / TLS / restore drill | **Open** | Deployment phase — [WI-OI-120cc](../../.pi/tasks/WI-OI-120cc.md) |
| S9d Pilot sign-off | **Open** | Business owner + `licence_ip_reviewer` |
| UAT prototype parity | **In progress** | [WI-OI-120ce](../../.pi/tasks/WI-OI-120ce.md) on `release/speed-uat` |

**Code location:** not on `feat/gigaops-convergence-core` by default — branch **`feat/speed-s3-module`**, releases on
**`release/speed-uat`** (e.g. `dc99f1bb`, `a1eb8242`).

### Stage 1 R2 — validated release (still enhancement backlog)

| Slice | Delivers | Card |
| --- | --- | --- |
| S10 Platform e-signature (Part 11) | Approve & sign on routes | *Card when Group 10 starts* |
| S11 Workflow | Submit / review / return / notifications | *With S10* |
| S12 Library & criteria governance | Propose / approve / apply | *With S11* |
| S13 Structures (RDKit WASM) | SMILES, energetic groups, Catalogue link | *R2* |
| S14 Benson estimates | Licensed group contributions | *R2* |
| S15 Validation pack | IQ/OQ/PQ, traceability matrix | *R2* |

Detail: [Stage 1 plan §5.2](./SPEED-Stage1-Implementation-Plan.md).

### Stage 2 — production certification (the captured enhancement plan)

Full text: **[SPEED-Stage2-Production-Certification-Plan.md](./SPEED-Stage2-Production-Certification-Plan.md)** (commit
`ff6661cb`).

| Owner gap | Slices | Size |
| --- | --- | --- |
| **A. Powder & dust explosion** | **S16** dust engine → **S17** data + Powder & dust tab | M + M |
| **B. What-if cases** | **S18** scenario runner (less solvent, dump addition, loss of cooling, distillation residue) | M |
| **C. Testing plan + Basis of Safety** | **S19** scale-aware tests, instrument TMRad, BoS composer, dossier + Scale-up tab | L |
| **D. AI assessment draft** | **S20** Assistant tools; in-instance model only | L (gated: [WI-OI-120bc](../../.pi/tasks/WI-OI-120bc.md) / GU1–GU7) |

**Order:** S16 → S17; S18 parallel; S19 after S16+S18; S20 last.

**Owner decisions before S16:** dust standards citation; standalone dust product vs SPEED-only; AI timing; confirm Group 10
sequencing — see Stage 2 plan §4.

---

## 2. How to resume implementation

1. **Task card:** [.pi/tasks/WI-OI-120cg.md](../../.pi/tasks/WI-OI-120cg.md) — umbrella for enhancements (S9c/d, R2, S16–S20).
2. **Checkout:** `feat/speed-s3-module` worktree (`gigalibs-speed-s3`) or merge/release from `release/speed-uat`.
3. **Verify:** `pnpm verify` on that branch; SPEED tests under `modules/process-safety-screening` and
   `packages/process-safety-engines` when present.
4. **One slice = one card** with tests named from BRD IDs, forward-only migrations, `security_reviewer` on code slices.

---

## 3. Related work items

| ID | Topic |
| --- | --- |
| WI-OI-120bn | Stage 1 approval (D1–D9) |
| WI-OI-120cc | S9 lab pilot (open: S9c, S9d) |
| WI-OI-120cd | SPEED on UAT (prototype) |
| WI-OI-120ce | UAT matches HTML prototype |
| WI-OI-120cg | **Enhancements umbrella (this plan)** |
| WI-OI-120bc | Generative UI / Companion (gates S20) |

Registry: [.pi/WORK_ITEMS.md](../../.pi/WORK_ITEMS.md) (search WI-OI-120).
