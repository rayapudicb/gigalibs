# WI-OI-046 Web/Accessibility — Human Reviewer Checklist

**Date:** 2026-09-24  
**Reviewer role:** Independent Web/Accessibility  
**Work item:** WI-OI-046 — Tenant Profile TP-1 Local Development  
**Scope:** SP-04 (consumer state machine, request boundary, accessibility)  
**Preparation note:** Agent B produced the initial standalone draft under
`docs/plans/WI-OI-046-parallel-review-agent-b-prompt.md`; the primary agent subsequently reconciled its
commands and claims against the repository. It remains a human execution guide only. No implementation
was created and no status was changed.

---

## Before you begin

1. Confirm you are **not** a producer of WI-OI-046 implementation code.
2. Read `docs/reviews/WI-OI-046-web-accessibility-decision-request-2026-09-24.md` in full.
3. Read `docs/reviews/WI-OI-046-sp01-sp07-resolution-request-2026-09-23.md` lines 35–115.
4. Read `docs/plans/WI-OI-046-tp1-verification-plan.md` lines 35–125.
5. Coordinate with the API Contracts reviewer on the response-to-state mapping in Section 4 before
   signing; both reviewers must agree on that table before Build.
6. This checklist does not authorize G4 implementation, production, cloud, external release, or
   TP-2–TP-6. Your completed decision records the pre-Build Web/Accessibility disposition only.

---

## Section 1 — Agent-verified baseline (confirm, do not re-run unless you choose to)

Results verified on 2026-09-24 and recorded in
`docs/audits/2026-09-24-wi-oi-046-focused-prebuild-baseline.md`.

| # | Claimed result | Re-run command | Your independent result |
|---|----------------|----------------|------------------------|
| 1.1 | `@gigalibs/workflow-platform` typecheck: **PASS** | `pnpm --config.verify-deps-before-run=false --filter @gigalibs/workflow-platform typecheck` | ☐ PASS / ☐ FAIL |
| 1.2 | Three focused web test files: **10 tests PASS** | `pnpm --config.verify-deps-before-run=false exec vitest run --config vitest.config.ts apps/workflow-platform/__tests__/configuration-renderer.test.tsx apps/workflow-platform/__tests__/configuration-surface-bff.test.ts apps/workflow-platform/__tests__/configuration-surface-registry.test.ts` | ☐ PASS / ☐ FAIL |
| 1.3 | API boundary audit: **12 controllers, 36 providers** | `pnpm --config.verify-deps-before-run=false audit:api-boundary` | ☐ PASS / ☐ FAIL |
| 1.4 | Navigation audit: **89 page routes, 109 static links** | `pnpm --config.verify-deps-before-run=false audit:navigation` | ☐ PASS / ☐ FAIL |

**Important:** These results prove only that the current web foundation is stable. They do **not** prove
the TP-1 state machine, current-runtime request boundary, tenant-negative behavior, or accessibility
evidence for the Tenant Settings consumer.

---

## Section 2 — Current component inspection

Run each command from `/Users/rayapudi/dev/gigalibs`:

### 2.1 — ConfiguredTenantFields.tsx: current state model

```
sed -n '1,150p' apps/workflow-platform/components/settings/ConfiguredTenantFields.tsx
```

Observe and record the following defects (expected — these are the TP-1 gaps):

- [ ] **Nullable flags instead of a state machine:** separate `runtime`, `record`, `status`, `busy`
      fields rather than a single typed discriminated-union state
- [ ] **Browser-supplied scope authority:** the `load()` function includes hardcoded `local-uat`
      (environmentKey) and `all-users` (cohortKey) in the query to `/configuration/runtime/manifest`
- [ ] **Wrong route:** calls `/api/control/configuration/runtime/manifest` (legacy), not
      `/api/control/configuration/runtime/manifest/current`
- [ ] **Silent null state:** when `runtime === null`, the component returns `null` (invisible; no
      loading indicator, no error state, no announcement)
- [ ] **Missing 404 handling:** HTTP 404 returns without setting any visible state
- [ ] **Missing error state render:** the catch handler sets `status` as a string, but
      `runtime === null` still causes a null return (error hidden)
- [ ] **No retry action:** no visible keyboard-reachable retry control exists
- [ ] **No AbortController:** no request cancellation on unmount or tenant change
- [ ] **Save label unchanged during save:** button remains "Save configured fields" while saving;
      no `aria-busy` or saving announcement
- [ ] **Conflict not mapped:** non-success save responses become a generic string message
- [ ] **No explicit conflict state:** optimistic version conflict is not rendered as a distinct `conflict`
      state with reload/retry guidance

**Your observation (confirm you saw all defects above):**

```
[note any exceptions or additional findings]
```

### 2.2 — BFF proxy: authentication and no-store controls

```
sed -n '1,130p' apps/workflow-platform/lib/authenticated-upstream.ts
```

Verify the BFF currently has:
- [ ] Authenticated proxy (no unauthenticated upstream calls)
- [ ] `cache: 'no-store'` or equivalent no-store header behavior
- [ ] Upstream timeout (verify the value; decision request states 10 seconds)
- [ ] Bounded mutation body size limit
- [ ] No web-owned registry fallback (BFF does not derive tenant, entitlement, environment, or cohort)

**Your finding:**

```
[paste key lines here]
```

### 2.3 — BFF route handler

```
sed -n '1,150p' apps/workflow-platform/app/api/control/[...path]/route.ts
```

(Note: you may need to quote the path in your shell:
`sed -n '1,150p' 'apps/workflow-platform/app/api/control/[...path]/route.ts'`)

Verify:
- [ ] The BFF route proxies only to an authenticated upstream
- [ ] No hard-coded environment, cohort, tenant, or entitlement is added by the BFF
- [ ] The authenticated user session is forwarded to the upstream, not derived in the browser

**Your finding:**

```
[paste key lines here]
```

---

## Section 3 — SP-04 state model decision

The reviewer must accept, amend, or reject this exact typed state set for the TP-1 implementation:

```
loading | absent | denied | invalid-scope | retryable-error |
ready | saving | conflict | saved
```

| Decision point | Your decision |
|----------------|---------------|
| 3.1 Exactly these nine states; no state inferred from a collection of nullable flags | ☐ Accept / ☐ Conditional / ☐ Reject |
| 3.2 Every request completion produces one explicit state (no silent null) | ☐ Accept / ☐ Conditional / ☐ Reject |
| 3.3 A late response from an older tenant, checksum, or request generation must not replace newer state | ☐ Accept / ☐ Conditional / ☐ Reject |
| 3.4 Impossible state transitions are prevented at the type level | ☐ Accept / ☐ Conditional / ☐ Reject |

**Conditions or amendments to the state model:**

```
[your text here]
```

---

## Section 4 — Response-to-state mapping decision (joint with API Contracts reviewer)

This table must be agreed with the API Contracts reviewer before Build. Both reviewers sign Section 9.

| API or transport outcome | Required visible state | Your decision |
|--------------------------|------------------------|---------------|
| Current manifest and extension values both decode successfully | `ready` | ☐ Accept / ☐ Conditional / ☐ Reject |
| `CONFIGURATION_ADAPTER_NOT_FOUND` or `CONFIGURATION_MANIFEST_UNAVAILABLE` | `absent` | ☐ Accept / ☐ Conditional / ☐ Reject |
| Authentication/authorization denial or `CONFIGURATION_RUNTIME_SCOPE_DENIED` | `denied` | ☐ Accept / ☐ Conditional / ☐ Reject |
| `CONFIGURATION_ADAPTER_INCOMPATIBLE` or invalid/incompatible strict current response | `invalid-scope` | ☐ Accept / ☐ Conditional / ☐ Reject |
| `CONFIGURATION_RUNTIME_SCOPE_UNAVAILABLE`, timeout, network failure, or safe upstream 5xx | `retryable-error` | ☐ Accept / ☐ Conditional / ☐ Reject |
| Save begins | `saving` | ☐ Accept / ☐ Conditional / ☐ Reject |
| Optimistic version/checksum conflict during value write | `conflict` | ☐ Accept / ☐ Conditional / ☐ Reject |
| Save and authoritative reload both succeed | `saved`, then deterministic `ready` | ☐ Accept / ☐ Conditional / ☐ Reject |
| Unknown response | Fail closed into a safe non-authoritative error state | ☐ Accept / ☐ Conditional / ☐ Reject |

Additional requirement:
- [ ] User-visible text must not reveal another tenant, entitlement, role, permission, activation,
      adapter inventory, database detail, or raw upstream error

**Conditions or findings for response mapping:**

```
[your text here]
```

**API Contracts reviewer agreement:** ☐ Agreed / ☐ Pending agreement / ☐ Disagreement (note below)

```
[note any disagreement or pending item]
```

---

## Section 5 — Request and authority boundary decision

| Rule | Your decision |
|------|---------------|
| 5.1 `ConfiguredTenantFields` calls `/api/control/configuration/runtime/manifest/current` with NO environment or cohort query values | ☐ Accept / ☐ Conditional / ☐ Reject |
| 5.2 Browser supplies only code-owned `moduleKey`/`entityKey`/`surfaceKey`; never tenant, entitlement, environment, or cohort authority | ☐ Accept / ☐ Conditional / ☐ Reject |
| 5.3 `canUpdate` affects presentation only; server remains authoritative for both manifest and value access including post-revocation | ☐ Accept / ☐ Conditional / ☐ Reject |
| 5.4 BFF preserves no-store, upstream timeout, and bounded mutation bodies | ☐ Accept / ☐ Conditional / ☐ Reject |
| 5.5 No cached, demo, static, or previous-tenant manifest/value becomes a fallback after failure | ☐ Accept / ☐ Conditional / ☐ Reject |

**Conditions or findings:**

```
[your text here]
```

---

## Section 6 — Interaction and announcement behavior decision

| Rule | Your decision |
|------|---------------|
| 6.1 Loading and saving are visible with `aria-busy` and a polite `role="status"` announcement | ☐ Accept / ☐ Conditional / ☐ Reject |
| 6.2 Absent, denied, invalid-scope, retryable-error, and conflict have distinct headings and safe guidance; retry appears only where it can change the outcome | ☐ Accept / ☐ Conditional / ☐ Reject |
| 6.3 Save error moves focus to an error summary linked to affected fields; background loading does not steal focus | ☐ Accept / ☐ Conditional / ☐ Reject |
| 6.4 Field errors retain accessible names, `aria-invalid`, and `aria-describedby` through rerenders | ☐ Accept / ☐ Conditional / ☐ Reject |
| 6.5 Saved status announced without requiring color, animation, or mouse; not mistaken for persistence before authoritative reload | ☐ Accept / ☐ Conditional / ☐ Reject |
| 6.6 Retry and save: keyboard-reachable, visible focus, no double-submit, preserve safe input; conflict offers authoritative reload before another write | ☐ Accept / ☐ Conditional / ☐ Reject |
| 6.7 Tenant change, unmount, and newer load cancel or invalidate older requests | ☐ Accept / ☐ Conditional / ☐ Reject |
| 6.8 Reduced-motion preferences respected; no status depends on motion | ☐ Accept / ☐ Conditional / ☐ Reject |

**Conditions or findings:**

```
[your text here]
```

---

## Section 7 — Post-Build evidence you will require

Confirm you will require all of the following before closing Web/Accessibility review:

**Component and unit tests:**
- [ ] Direct tests for all nine states: `loading`, `absent`, `denied`, `invalid-scope`, `retryable-error`,
      `ready`, `saving`, `conflict`, `saved`
- [ ] Allowed-transition tests (invalid transitions rejected at type level)
- [ ] Request assertion that `/runtime/manifest/current` receives NO `environmentKey` or `cohortKey`
- [ ] Stale-response tests for tenant change, unmount, and overlapping retry
- [ ] Status-code/stable-code mapping and sanitized unknown-error behavior tests
- [ ] Load retry, save double-submit prevention, optimistic conflict, reload, preserved-input tests
- [ ] Focus management, live-region, field-error association, and reduced-motion tests

**BFF tests:**
- [ ] Authentication behavior (unauthenticated request blocked)
- [ ] No-store response verification
- [ ] Timeout and failure behavior
- [ ] Bounded mutation body

**Integration with other workstreams:**
- [ ] Two-tenant and current-state revocation evidence owned jointly with IAM/Security/QA
- [ ] BFF test covering no browser-owned tenant/scope derivation

**Accessibility evidence (post-Build, Tenant Settings consumer specifically):**
- [ ] Three-browser (Chromium, Firefox, WebKit) automated axe WCAG 2.2 A/AA output
- [ ] Signed manual notes: keyboard-only, screen-reader, 200% zoom, 400% zoom, high-contrast,
      reduced motion, desktop and narrow/mobile layout
- [ ] Manual notes must name: browser, OS, AT name/version, viewport or zoom, tester name, date,
      outcome, and any finding
- [ ] No page error, unhandled rejection, or HTTP 5xx during the evidence journey
- [ ] Evidence covers **Tenant Settings consumer**, not only Configuration Studio designer

---

## Section 8 — Human decision

Complete this form and provide it to the primary agent for attachment to the WI-OI-046 decision record.
The API Contracts reviewer must have already confirmed agreement on the response-to-state mapping before
you sign.

```
I, [full human name], reviewed WI-OI-046 as the independent Web/Accessibility reviewer against
docs/reviews/WI-OI-046-web-accessibility-decision-request-2026-09-24.md and the frozen WI-OI-046 design
evidence. My decision for SP-04, including the exact visible state model, safe response mapping, current
runtime request boundary, focus/live-region behavior and post-Build manual accessibility plan, is
[Accept / Conditional / Reject]. I confirm that the green baseline proves only the current web foundation
and does not claim TP-1 or its accessibility evidence is implemented. Conditions/findings: [exact text
or "None"]. The response-to-state mapping was agreed with the API Contracts reviewer on [date] and I
confirm alignment. This does not authorize G4 implementation, production, cloud, external release or
TP-2–TP-6. I am [independent / not independent] from the implementation producer. Date: [YYYY-MM-DD].
```

---

*Initially drafted by Agent B and reconciled by the primary agent on 2026-09-24. Neither agent has
authority to close this review or mark human acceptance. WI-OI-046 remains Proposed and no implementation
was created by this checklist work.*
