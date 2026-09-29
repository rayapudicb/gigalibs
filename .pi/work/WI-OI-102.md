# WI-OI-102: Foundation boundaries (kernel, capability modules, one engine per job, inventory)

- **Status:** In Progress. The owner started it on 2026-09-29 after approving ADR-0016 F1–F17.
- **Owner:** SDLC Orchestrator / Solution Architecture / Developer Platform.
- **Decision record:** `docs/architecture/ADR-0016-kernel-capability-modules-and-foundation.md`, which amends
  ADR-0013 §1.
- **Independent reviewers:** Product, Backend/Data, QA/SDET.

## G0: why

The shared core must be small, stable and certifiable (vision §3.1, §6). Every later module and industry depends
on it. Today:
- "core" includes capability products;
- engines are duplicated (3 forms, 3 rules, 4 workflow);
- business logic and tables sit in the core;
- 14 modules are code only;
- the catalogue claims AVAILABLE without certification;
- many packages are unused.

## G1: scope

**In scope:**
- ADR-0016 F1–F7, F9 and F12;
- catalogue truth, chosen by the owner on 2026-09-29.

**Out of scope:** the capabilities themselves (WI-OI-103 to WI-OI-107), and moving Procurement (WI-OI-092).

## G2: acceptance

1. ADR-0016 is recorded, and ADR-0013 points to it for the definition of core.
2. There is an evaluation of the forms, rules and workflow engines, and of the execution plane. Each has a
   recommendation, and the owner has chosen the workflow engine.
3. Every workspace unit and module is classified as kernel, capability, business, shell or tooling. The layer
   audit enforces the classification, and `platform-rbac` is part of the kernel.
4. The catalogue labels AP matching "hosted, moving". An audit fails on new code that writes to the 31 fenced
   core business tables.
5. Each of the 14 code-only modules has an owner-approved outcome: run in the host, freeze, or retire.
6. Every catalogue entry shows one of the vision's six maturity states, and nothing Uncertified claims to be
   available.
7. Each unused, excluded or misplaced package has an owner-approved outcome, carried out in batches with
   `pnpm verify` passing after each batch.
8. No running service changes behaviour, and no customer data is touched.

## G3: slices

Each slice has a task card in `.pi/tasks/` when it starts.

| Slice | What | Size | Status |
|---|---|---|---|
| 102a | ADR-0016, registration of WI-OI-102 to WI-OI-107, this file | S | Done, 2026-09-29 |
| 102b | Engine evaluation (F3, F12): forms, rules, workflow, execution plane | S | Next (`.pi/tasks/WI-OI-102b.md`) |
| 102c | Kernel/capability/business classification in manifests and the layer audit (F1, F2); `platform-rbac` into the kernel | M | Proposed |
| 102d | Fencing (F4, F5): the "hosted, moving" label and the fenced-table audit | S | Proposed |
| 102e | Module triage and catalogue truth (F6): six maturity states in manifests, catalogue and screens | M | Proposed |
| 102f | Package inventory (F7): proposal, then owner-approved batches | M | Proposed |

## 102a: ADR-0016 and registration (2026-09-29)

- `docs/architecture/ADR-0016-kernel-capability-modules-and-foundation.md` records F1–F17, their order and what is
  not decided.
- `.pi/WORK_ITEMS.md` registers WI-OI-102 (In Progress) and WI-OI-103 to WI-OI-107 (Proposed).
  `config/sdlc-governance.json` makes WI-OI-102 the only active item.
- **Verification:** `pnpm verify --audits`, with the known WORKFORCE_API_URL drift only.
