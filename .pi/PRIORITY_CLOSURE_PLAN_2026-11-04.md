# Priority closure plan (owner list, 2026-11-04)

**Rule (plan v3, AGENTS.md):** nothing becomes **Done** without **your recorded acceptance** on UAT.  
**Close** means one of: **Done** (accepted) · **On UAT** (deployed + verified, release named) · **Built** (code + verify) · **Decided** (owner decision logged, work unblocked) · **Deferred** (explicit later card).

Canonical queue: `docs/plans/master-data-foundation-execution-plan.md` §6a. Status register: `.pi/WORK_ITEMS.md`.

---

## Wave 0 — P0 production safety (parallel owner + one agent slot)

| # | Item | Close as | Who | Next action |
|---|------|----------|-----|-------------|
| 1 | Security review `ef8d7dad` | **Decided → evidence** | You / independent reviewer | Review 167, 169, 164 mobile BFF; record in `.pi/work/WI-OI-167.md`, 169, 164 |
| 2 | Read-only retest `ef8d7dad` | **On UAT evidence** | You or agent (read-only) | Commands in `.pi/work/WI-OI-151.md` + 163/167/169 checks in handoff; update workbook |
| 3 | Master data "No access" | **Built → On UAT** | Agent **WI-OI-176** | Claim slot after 164 deploy proof or owner reorders slot |
| 4 | Six relays not wired | **Decided** | **You** (keys/settings) | Decision in `.pi/work/WI-OI-160.md`; then WI-OI-156 B–C or relay deploy slice |
| 5 | Relay health command | **Evidence** | **You** | Run command from `.pi/work/WI-OI-168.md`; paste result in 168 evidence |
| 6 | Workflow Studio 503 | **Decided** | **You** (QA-009) | Start service **or** hide four screens from nav until card exists |
| 7 | AR not on UAT | **Built** (later) | Agent when C5 scheduled | Stage C5; not Wave 0 unless you reprioritise queue |
| 8 | WI-OI-131 outside queue | **Decided** | **You** | Merge/stash/abandon `~/dev/gigalibs` WI-OI-131; one card owns Analytics |

**Gate:** Wave 0 is not "closed" until **#1–2** have evidence and **#4, 6, 8** have logged decisions.

---

## Wave 1 — P1 before customer go-live (queue §6a order)

| # | Item | Card | Close as | Notes |
|---|------|------|----------|-------|
| 9 | Mobile CMMS | WI-OI-164 | **Built** (impl) → **On UAT** → **Done** | Impl on GitHub; **task capture deferred** (future card). Needs deploy + device proof |
| 10 | Reference viewer + No access | WI-OI-176 | **Built** | Queue 9a; blocks hub UX for all logins |
| 11 | 11 frontline device proofs | WI-OI-165 | **Done** (×11) | Owner device + screenshots; contractor profiles pushed |
| 12–14 | Packs, import/export, replicas | WI-OI-154, 155, 156 B–C | **Built** each | One module completion commit per Phase 1 rule where applicable |
| 15 | CMMS M-CM1 acceptance | You | **Done** | `PHASE-1-CM1-CHECKLIST.md` + journey jsjmyx |
| 16–17 | UAT owner checks, 43 rows | You | **Done** | `.pi/work/WI-OI-168.md` list; batch acceptance |

**Gate:** P1 "closed" for go-live = **9–11** at minimum **On UAT** with proofs + **12–14** for empty-workspace risk.

---

## Wave 2 — P2 foundations (confirm each before start)

Cards WI-OI-157–175, 159, 158, 161, 162: **Proposed** until you say "build" on the card.  
Do not start in parallel with Wave 1 slot (governance: one `activeImplementationWorkItems`).

---

## Wave 3–4 — P3 module stages C1–C11, P4 hardening

Track in `docs/plans/all-modules-completion-plan.md` §7 and plan v3 O1–O7.  
No stage is **Done** until module journeys + your acceptance.

---

## Suggested active slot sequence (agent)

1. Finish **WI-OI-164** closure: you deploy `feat/frontline-suite` + mobile `main`, device proof → row **On UAT**.
2. **WI-OI-176** (fixes P0 #3 and P1 #10 together).
3. **WI-OI-165** device matrix (you run; agent fixes failures).
4. Resume queue: **WI-OI-154** → **155** → **156 B–C** …

---

## Your decisions needed to unblock Wave 0 (one line each)

1. **Relays (#4):** wire six on UAT now / defer / which keys first?  
2. **Workflow Studio (#6):** hide nav vs deploy stack?  
3. **WI-OI-131 (#8):** fold into queue card vs park vs merge from `~/dev/gigalibs`?  
4. **Slot (#9 vs #10):** keep **WI-OI-164** until device proof, or **reassign slot to WI-OI-176** now?

Record answers in `.pi/NOW.md` under "Open decisions".
