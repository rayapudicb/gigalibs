# WI-OI-046 QA/SDET — Human Reviewer Checklist

**Date:** 2026-09-24  
**Reviewer role:** Independent QA/SDET  
**Work item:** WI-OI-046 — Tenant Profile TP-1 Local Development  
**Scope:** SP-01–SP-07 and the full TP-1 verification contract (QA-01 through QA-12)  
**Agent recommendation (pre-Build):** Conditional — amendments QA-01 through QA-12 must be incorporated  
**Preparation note:** Agent B produced the initial standalone draft under
`docs/plans/WI-OI-046-parallel-review-agent-b-prompt.md`; the primary agent subsequently reconciled its
commands and claims against the repository. It remains a human execution guide only. No implementation
was created and no status was changed.

---

## Before you begin

1. Confirm you are **not** a producer of WI-OI-046 implementation code.
2. Read `docs/reviews/WI-OI-046-qa-sdet-decision-request-2026-09-24.md` in full.
3. Read `docs/plans/WI-OI-046-tp1-verification-plan.md` sections 1–5.
4. Review all four other decision requests (IAM, API Contracts, Web, Security) and confirm the
   reviewers' conditions are captured before recommending Build entry.
5. This checklist records the pre-Build QA/SDET disposition only. Post-Build, you will need to re-engage
   with the completed evidence bundle before accepting any G5 handoff.

---

## Section 1 — Agent-verified fresh baseline (2026-09-24)

All results are recorded in `docs/audits/2026-09-24-wi-oi-046-focused-prebuild-baseline.md`.

| # | Check | Claimed result | Your confirmation |
|---|-------|----------------|-------------------|
| 1.1 | Contracts build | PASS | ☐ Confirmed / ☐ Discrepancy |
| 1.2 | Configuration Core build | PASS | ☐ Confirmed / ☐ Discrepancy |
| 1.3 | Contract/compiler tests | PASS — 4 files, 30 tests | ☐ Confirmed / ☐ Discrepancy |
| 1.4 | Playground API tests | PASS — 10 files, 47 tests | ☐ Confirmed / ☐ Discrepancy |
| 1.5 | Workflow platform typecheck | PASS | ☐ Confirmed / ☐ Discrepancy |
| 1.6 | Focused workflow tests | PASS — 3 files, 10 tests | ☐ Confirmed / ☐ Discrepancy |
| 1.7 | Configuration contract audit | PASS — 11 outcomes, 32 operations | ☐ Confirmed / ☐ Discrepancy |
| 1.8 | Local deployment-profile audit | PASS — 51 required API environment keys | ☐ Confirmed / ☐ Discrepancy |
| 1.9 | Static observability audit | PASS — 13 metrics, 6 alerts, 16 panels, 8 outcomes | ☐ Confirmed / ☐ Discrepancy |
| 1.10 | **Total** | **87 tests across 17 files** | ☐ Confirmed / ☐ Discrepancy |

**Your notes on any discrepancies:**

```
[your text here]
```

---

## Section 2 — Review the collision audit

Read `docs/audits/2026-09-24-wi-oi-046-prebuild-collision-audit.md` and confirm:

- [ ] All 15 proposed candidate files are byte-identical to the September 23 checkpoint
- [ ] The WI-OI-042 correction did not touch any TP-1 candidate
- [ ] You understand the four remaining semantic defects (browser-supplied scope, inline surface
      list, no server-resolved scope evidence, null-render absence states) that TP-1 must address
- [ ] The exact 15-file candidate manifest SHA-256 file exists at
      `docs/reviews/WI-OI-046-g3-prebuild-candidate-manifest-2026-09-24.sha256`

**Your finding:**

```
[your text here]
```

---

## Section 3 — Review of the verification plan

Run from `/Users/rayapudi/dev/gigalibs`:

```
sed -n '1,260p' docs/plans/WI-OI-046-tp1-verification-plan.md
```

Assess whether the plan explicitly covers the following. Mark ☐ Covered, ☐ Partial (note gap),
or ☐ Missing (block until addressed):

### 3A — Structural requirements

| Requirement | Coverage |
|-------------|----------|
| Strict contract, unknown-field, and compatibility tests | ☐ Covered / ☐ Partial / ☐ Missing |
| Duplicate registry rejection and deep immutability | ☐ Covered / ☐ Partial / ☐ Missing |
| Required/invalid/missing server environment startup behavior | ☐ Covered / ☐ Partial / ☐ Missing |
| Current, legacy assertion, and privileged-preview boundaries | ☐ Covered / ☐ Partial / ☐ Missing |
| Current-state revocation and two-tenant isolation | ☐ Covered / ☐ Partial / ☐ Missing |
| Real PostgreSQL authenticated HTTP, cache/invalidation, and restart evidence | ☐ Covered / ☐ Partial / ☐ Missing |
| Complete visible web states and post-Build accessibility review | ☐ Covered / ☐ Partial / ☐ Missing |
| Exact-image Local Development certification | ☐ Covered / ☐ Partial / ☐ Missing |
| Repository gates, stop rules, and generated-data cleanup | ☐ Covered / ☐ Partial / ☐ Missing |
| Explicit exclusion of TP-2–TP-6, cloud, Helm, and production claims | ☐ Covered / ☐ Partial / ☐ Missing |

**Gaps or findings:**

```
[your text here]
```

---

## Section 4 — QA amendments (QA-01 through QA-12) — your decision

For each amendment, mark **Accept** (incorporated into plan), **Conditional** (note requirement),
or **Reject** (note reason). Rejecting an amendment requires a documented alternative that satisfies
the same evidence gap.

### QA-01 — Stable requirement-to-test trace
Machine-readable trace from every applicable requirement ID (D5-CTX-001–008, D5-META-001–012,
FR-01/05/14/15, NFR-GOV/SEC/DATA/REL/PERF/OBS/UX/OPS) to design decision, changed file, executable
test, evidence file, and result. No ID passes through a producer statement alone; not-applicable
requires a reason and named reviewer acceptance.

**Decision:** ☐ Accept / ☐ Conditional / ☐ Reject

```
[conditions or reason if not Accept]
```

### QA-02 — Real-dependency classification
Every check declares one class: Unit/contract test double, Real local dependency (PostgreSQL 16,
authenticated HTTP, web BFF/browser, two real API replicas), Controlled fault injection, or Manual
human review. No mocked token, in-memory tenant, fabricated manifest, static payload, or
browser-only authorization accepted as integration evidence.

**Decision:** ☐ Accept / ☐ Conditional / ☐ Reject

```
[conditions or reason if not Accept]
```

### QA-03 — Exact HTTP and authority matrix
Authenticated real-HTTP fixtures must cover: current-runtime success with no browser scope params,
unknown query field rejection, legacy omission/match/mismatch, preview with/without each permission,
all five entitlement states (enabled/missing/disabled/future/expired), inactive tenant/user/membership
and role downgrade without restart, unknown/incompatible adapter/unavailable manifest, cross-tenant
substitution attempts, and activation omission rejection. Denial fixtures must assert absence of
cross-tenant identifiers, role/permission detail, and raw exceptions.

**Decision:** ☐ Accept / ☐ Conditional / ☐ Reject

```
[conditions or reason if not Accept]
```

### QA-04 — Concurrency, restart, and cache proof
Must prove: duplicate adapter keys prevent readiness deterministically; concurrent identical writes
have one idempotent outcome; concurrent stale writes have one winner and explicit conflict loser;
missed invalidation repaired from PostgreSQL; two replicas converge on accepted checksum without
cross-tenant cache keys; restart reloads authoritative state; acknowledged values survive tested
PostgreSQL interruption.

**Decision:** ☐ Accept / ☐ Conditional / ☐ Reject

```
[conditions or reason if not Accept]
```

### QA-05 — Web state and accessibility trace
All nine SP-04 states and transitions tested. Stable response-to-state mapping frozen by API
Contracts and Web/Accessibility reviewers. Evidence covers: overlapping-request cancellation, retry
bounds, double-submit prevention, authoritative conflict reload, focus/live-region, field-error
association, preserved safe input. Three-browser axe + signed manual notes (keyboard, screen-reader,
200%/400% zoom, high-contrast, reduced-motion) covering Tenant Settings consumer.

**Decision:** ☐ Accept / ☐ Conditional / ☐ Reject

```
[conditions or reason if not Accept]
```

### QA-06 — TP-1 observability and audit assertions
Post-Build tests: correlation IDs on current/legacy/preview/value-write outcomes; sanitized
admin-read audit event for privileged preview; accepted/denied/unavailable/conflict telemetry; no
tenant/user/cohort/manifest payload in metric labels; logs contain stable codes without credentials
or DB detail; restart/outage followable from request to recovery. If no new metric: prove which
existing metric represents each TP-1 outcome via live scrape.

**Decision:** ☐ Accept / ☐ Conditional / ☐ Reject

```
[conditions or reason if not Accept]
```

### QA-07 — Performance characterization
100 authenticated current-manifest reads at concurrency 10: sample count, success count, unexpected
error count, p50, p95, p99, maximum. Accepted limits: p95 ≤ 500 ms, p99 ≤ 1 s, zero unexpected
failures, zero cross-tenant or stale-checksum outcomes. Cold-start/restart reported separately. Not
a production capacity claim.

**Decision:** ☐ Accept / ☐ Conditional / ☐ Reject

```
[conditions or reason if not Accept]
```

### QA-08 — Schema and migration stop rule
Capture canonical schema and migration-tree diff before and after implementation. Any new table,
column, migration, or ownership change stops the slice immediately and requires migration design,
forward migration, clean/upgrade verification, and recovery review before testing continues.
Applied migrations must never be edited.

**Decision:** ☐ Accept / ☐ Conditional / ☐ Reject

```
[conditions or reason if not Accept]
```

### QA-09 — Rebuilt-image and supply-chain identity
Migrations, API, and web images must be rebuilt from final accepted source state. Evidence binds
source-state SHA-256, image ID/digest, Dockerfile/build context, and runtime identity. Re-run exact-image vulnerability, secret, non-root, and filesystem/SBOM checks for all changed images.
Any Critical/High, secret match, unexpected root runtime, identity mismatch, or missing scan routes
to Security/Supply Chain and blocks handoff.

**Decision:** ☐ Accept / ☐ Conditional / ☐ Reject

```
[conditions or reason if not Accept]
```

### QA-10 — Test-data provenance and cleanup
Evidence bundle records generated prefixes/IDs, creator, creation time, classification, and cleanup
method without credentials or raw business values. Cleanup distinguishes: active identities (zero
remaining or explicitly deactivated), mutable test config/value records (removed or retained under
accepted policy), immutable audit/outbox evidence (retained, test-attributed, excluded from customer
metrics), processes/ports/temp DBs/containers (stopped/removed), cleanup failure (recorded, never
hidden).

**Decision:** ☐ Accept / ☐ Conditional / ☐ Reject

```
[conditions or reason if not Accept]
```

### QA-11 — Repository regression disposition
Run every mandatory repository command from AGENTS.md after focused and exact-image certification.
A new or worsened failure in WI-OI-046 scope blocks handoff. Unchanged Analytics/CMMS/quarantine
failures remain red and linked to their owner — not converted into a TP-1 pass. Record command, exit
code, timestamp, and scoped comparison against pre-Build baseline.

**Decision:** ☐ Accept / ☐ Conditional / ☐ Reject

```
[conditions or reason if not Accept]
```

### QA-12 — Defects, limitations, and immutable evidence
Each evidence JSON must contain: `verifier`, `timestamp`, `workItem`, `profile`, `sourceIdentity`,
`status`, `outcomes`, `failures`, `limitations`, `testDataCleanup`. Failed run retained under
original identity; corrected run creates a new timestamped record. Open P0/P1, cross-tenant
visibility, browser-controlled authority, production-reachable fallback, credential exposure, lost
acknowledged data, incompatible legacy removal, or unexplained mismatch is an immediate No-Go.

**Decision:** ☐ Accept / ☐ Conditional / ☐ Reject

```
[conditions or reason if not Accept]
```

---

## Section 5 — Required execution order after authorized Build

Confirm you will enforce this exact sequence:

- [ ] 1. Capture source/candidate/Compose identities; verify no unexpected migration change
- [ ] 2. Run contract, registry, API, BFF, and component tests
- [ ] 3. Run authenticated real-HTTP authority, two-tenant, and revocation matrices
- [ ] 4. Run two-replica invalidation, restart, and PostgreSQL interruption/recovery
- [ ] 5. Run web state, three-browser automated accessibility, and manual assistive-technology review
- [ ] 6. Run current-manifest local performance characterization and live TP-1 observability checks
- [ ] 7. Build and scan exact migrations/API/web images; bind runtime identities
- [ ] 8. Run all repository gates; compare known external failures truthfully
- [ ] 9. Execute and verify cleanup; retain immutable failed and successful evidence
- [ ] 10. Produce requirement-to-test trace; obtain independent post-Build decisions

**Confirmed sequence stop rule:** ☐ Yes — the sequence stops at the first security, tenancy,
data-loss, compatibility, secret, or evidence-identity violation; no later result can overwrite or
transform that failure into a pass.

---

## Section 6 — Cross-reviewer dependency tracking

Before recommending Build entry, verify each of the following are complete:

| Dependency | Status |
|------------|--------|
| IAM/Tenancy reviewer has signed their pre-Build decision | ☐ Complete / ☐ Pending |
| API Contracts reviewer has signed their pre-Build decision | ☐ Complete / ☐ Pending |
| Web/Accessibility reviewer has signed and agreed on response-to-state mapping with API Contracts | ☐ Complete / ☐ Pending |
| Security & Privacy reviewer has signed WI-OI-047-WI-OI-046-security-decision-request-2026-09-24.md | ☐ Complete / ☐ Pending |
| No open G4 WI-OI-047 Build item authorization conflict exists | ☐ Confirmed / ☐ Conflict |

---

## Section 7 — Human decision

Complete this form and provide it to the primary agent for attachment to the WI-OI-046 decision record.

```
I, [full human name], reviewed WI-OI-046 as the independent QA/SDET reviewer against
docs/reviews/WI-OI-046-qa-sdet-decision-request-2026-09-24.md, the TP-1 verification plan and the frozen
WI-OI-046 design evidence. My decision for the SP-01–SP-07 verification contract is
[Accept with QA-01 through QA-12 incorporated / Conditional / Reject]. I confirm that the 87-test green
baseline proves only the current foundation and does not claim TP-1 is implemented. Conditions/findings:
[exact text or "None"]. I verified the other pre-Build reviewer decisions were [complete / pending] as of
[date]. This decision alone does not authorize G4 implementation, production, cloud, external release or
TP-2–TP-6.
I am [independent / not independent] from the implementation producer. Date: [YYYY-MM-DD].
```

---

*Initially drafted by Agent B and reconciled by the primary agent on 2026-09-24. Neither agent has
authority to close this review or mark human acceptance. WI-OI-046 remains Proposed and no implementation
was created by this checklist work.*
