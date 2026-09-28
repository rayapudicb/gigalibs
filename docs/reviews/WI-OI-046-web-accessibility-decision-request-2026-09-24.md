# WI-OI-046 Web/Accessibility decision request

Date: 2026-09-24  
Scope: SP-04 for bounded TP-1 Local Development  
Status: agent-executable Web precheck complete; named human decision pending

## Decision boundary

This packet asks a named Web/Accessibility reviewer to accept, condition or reject the planned TP-1
consumer state machine and post-implementation accessibility evidence. It does not claim TP-1 is
implemented, authorize product code, or authorize production, cloud, external release or TP-2–TP-6.

Security, IAM/Tenancy, API Contracts and QA/SDET decisions remain separate. Automated checks of the
current web foundation cannot replace post-Build assistive-technology testing of the TP-1 journey.

## Current web truth

| Current behavior | Verified fact | TP-1 implication |
| --- | --- | --- |
| Runtime request | `ConfiguredTenantFields` calls legacy `/configuration/runtime/manifest` with browser-owned hardcoded `local-uat` and `all-users` values | Replace with `/runtime/manifest/current`; send only module/entity/surface identity |
| State model | Separate nullable `runtime`, `record`, `status` and `busy` values; no discriminated state machine | Implement the exact typed SP-04 states and impossible-transition protection |
| Initial load | `runtime === null` returns `null` | Loading must be visible and announced; no silent blank state |
| Missing manifest | Manifest HTTP 404 returns without setting a visible state | Render an explicit safe absent state |
| Load failure | The catch handler sets `status`, but `runtime === null` still returns `null` | Render denied, invalid-scope or retryable failure instead of hiding the error |
| Retry | No visible retry action exists | Retry must be keyboard reachable, bounded and disabled while the retry is active |
| Stale requests | No `AbortController`, request sequence or unmount/tenant-change cancellation exists | Abort or ignore stale manifest/value responses before updating state |
| Save progress | The button is disabled by `busy`, but the visible label remains unchanged | Render and announce the `saving` state without relying on disabled styling alone |
| Save conflict | Non-success responses become a generic message; there is no explicit conflict state | Map version/optimistic-concurrency failure to `conflict` with reload/retry guidance |
| Field errors | Server field errors are passed to the form renderer | Preserve field association and add predictable error-summary focus behavior |
| Save success | A polite `role="status"` message is shown after reloading values | Preserve an announced `saved` outcome, then return deterministically to `ready` |
| BFF foundation | Authenticated no-store proxy, 10-second timeout, bounded mutation bodies and no web-owned registry fallback exist | Preserve these controls; do not derive tenant, entitlement, environment or cohort in the browser |
| Current renderer tests | Escaping, governed conditions, masking and registry/BFF compatibility are covered | Add direct `ConfiguredTenantFields` state, request and accessibility tests |
| Current accessibility harness | The existing axe harness exercises Configuration Studio designer/workflow states | Extend evidence to the Tenant Settings TP-1 consumer; current Studio scans do not prove TP-1 accessibility |

## Agent-executable baseline

- `@gigalibs/workflow-platform` typecheck: PASS.
- Three preserved web test files: 10 tests PASS.
- API boundary audit: PASS with 12 mounted controllers and 36 registered providers.
- Navigation boundary audit: PASS with 89 page routes and 109 static internal links.
- No product code, dependency, schema, migration or lockfile was changed by this precheck.

These results prove only that the current foundation is stable. They do not prove the future TP-1 state
machine, current-runtime request, tenant-negative behavior or accessibility journey.

## Web decisions required

### 1. Exact SP-04 state model

The reviewer must accept, amend or reject this closed typed state set:

```text
loading | absent | denied | invalid-scope | retryable-error |
ready | saving | conflict | saved
```

The implementation must not infer a state from a collection of nullable flags. Every request completion
must produce one explicit state, and a late response from an older tenant, checksum or request generation
must not replace newer state.

### 2. Safe response-to-state mapping

The Web and API Contracts reviewers must agree on these mappings before Build:

| API or transport outcome | Required visible state |
| --- | --- |
| Current manifest and extension values both decode successfully | `ready` |
| `CONFIGURATION_ADAPTER_NOT_FOUND` or `CONFIGURATION_MANIFEST_UNAVAILABLE` | `absent` |
| Authentication/authorization denial or `CONFIGURATION_RUNTIME_SCOPE_DENIED` | `denied` |
| `CONFIGURATION_ADAPTER_INCOMPATIBLE` or an invalid/incompatible strict current response | `invalid-scope` |
| `CONFIGURATION_RUNTIME_SCOPE_UNAVAILABLE`, timeout, network failure or safe upstream 5xx | `retryable-error` |
| Save begins | `saving` |
| Optimistic version/checksum conflict during value write | `conflict` |
| Save and authoritative reload both succeed | `saved`, followed by deterministic `ready` |

Unknown responses fail closed into a safe non-authoritative error state. User-visible text must not reveal
another tenant, entitlement, role, permission, activation, adapter inventory, database detail or raw
upstream error.

### 3. Request and authority boundary

1. `ConfiguredTenantFields` calls `/api/control/configuration/runtime/manifest/current` without
   environment or cohort query values.
2. The browser supplies only the code-owned module/entity/surface identity required by the strict current
   contract; it never chooses tenant, entitlement, environment or cohort authority.
3. `canUpdate` affects presentation only. The server remains authoritative for both manifest and value
   access, including revocation without a browser restart.
4. The authenticated BFF preserves no-store behavior, upstream timeout and bounded mutation bodies.
5. No cached, demo, static or previous-tenant manifest/value becomes a fallback after failure.

### 4. Interaction and announcement behavior

1. Loading and saving are visible and exposed with `aria-busy` and a polite status announcement.
2. Absent, denied, invalid-scope, retryable-error and conflict have distinct headings and safe guidance;
   retry appears only where retry can change the outcome.
3. A user-triggered save error moves focus to an error summary linked to affected fields. Background
   loading does not unexpectedly steal focus.
4. Field errors retain accessible names, `aria-invalid` and described-by relationships through rerenders.
5. Saved status is announced without requiring color, animation or a mouse and cannot be mistaken for
   persistence before the authoritative reload completes.
6. Retry and save are keyboard reachable, have visible focus, cannot double-submit, and preserve input
   when safe. Conflict recovery explicitly offers authoritative reload before another write.
7. Tenant change, unmount and a newer load cancel or invalidate older requests.
8. Reduced-motion preferences are respected; no status depends on motion.

### 5. Responsive and assistive-technology acceptance

Post-Build evidence must cover the Tenant Settings TP-1 consumer, not only Configuration Studio:

- keyboard-only operation with logical tab order and no trap;
- screen-reader announcements and error/field navigation;
- 200% and 400% zoom with no lost content or operation;
- browser/OS high-contrast or forced-colors behavior;
- desktop and narrow/mobile layout;
- reduced motion;
- automated WCAG 2.2 A/AA axe checks in Chromium, Firefox and WebKit; and
- no page error, unhandled rejection or HTTP 5xx during the successful evidence journey.

Manual evidence must name browser, operating system, assistive technology/version, viewport or zoom,
tester, date, outcome and any finding. Automated axe output alone is insufficient.

## Required implementation evidence

After an authorized Build, the Web/Accessibility reviewer must receive:

- direct component tests for all nine states and allowed transitions;
- request assertion proving `/runtime/manifest/current` receives no environment/cohort authority;
- stale-response tests for tenant change, unmount and overlapping retry;
- status-code/stable-code mapping tests and sanitized unknown-error behavior;
- load retry, save double-submit, optimistic conflict, reload and preserved-input tests;
- focus, live-region, field-error association and reduced-motion tests;
- BFF tests proving authentication, no-store response, timeout/failure behavior and bounded writes;
- two-tenant and current-state revocation evidence owned jointly with IAM/Security/QA;
- the extended three-browser accessibility certification output; and
- signed manual keyboard, screen-reader, zoom and high-contrast notes.

Production-reachable mocks, fixture fallbacks, default scope values and UI-only permission decisions are
release stops. Test doubles remain permitted only inside isolated automated tests and cannot be reported
as real-dependency evidence.

## Reviewer inspection commands

Run from `/Users/rayapudi/dev/gigalibs`:

```text
sed -n '1,150p' apps/workflow-platform/components/settings/ConfiguredTenantFields.tsx
sed -n '1,150p' apps/workflow-platform/app/api/control/[...path]/route.ts
sed -n '1,130p' apps/workflow-platform/lib/authenticated-upstream.ts
sed -n '35,115p' docs/reviews/WI-OI-046-sp01-sp07-resolution-request-2026-09-23.md
sed -n '35,125p' docs/plans/WI-OI-046-tp1-verification-plan.md
pnpm --config.verify-deps-before-run=false --filter @gigalibs/workflow-platform typecheck
pnpm --config.verify-deps-before-run=false exec vitest run --config vitest.config.ts \
  apps/workflow-platform/__tests__/configuration-renderer.test.tsx \
  apps/workflow-platform/__tests__/configuration-surface-bff.test.ts \
  apps/workflow-platform/__tests__/configuration-surface-registry.test.ts
pnpm --config.verify-deps-before-run=false audit:api-boundary
pnpm --config.verify-deps-before-run=false audit:navigation
```

The shell may require quoting `apps/workflow-platform/app/api/control/[...path]/route.ts` when the
inspection command is executed interactively.

## Human decision form

```text
I, [full human name], reviewed WI-OI-046 as the independent Web/Accessibility reviewer against
docs/reviews/WI-OI-046-web-accessibility-decision-request-2026-09-24.md and the frozen WI-OI-046 design
evidence. My decision for SP-04, including the exact visible state model, safe response mapping, current
runtime request boundary, focus/live-region behavior and post-Build manual accessibility plan, is
[Accept / Conditional / Reject]. I confirm that the green baseline proves only the current web foundation
and does not claim TP-1 or its accessibility evidence is implemented. Conditions/findings: [exact text].
This does not authorize G4 implementation, production, cloud, external release or TP-2–TP-6. I am
[independent / not independent] from the implementation producer. Date: [YYYY-MM-DD].
```

The reviewer must state their professional responsibility. Pre-Build design acceptance cannot replace
the post-implementation automated and manual accessibility evidence.
