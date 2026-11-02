# WI-OI-146 evidence — unblock every screen

## 2026-11-02 — causes found (read-only probes on UAT 5180, release `c88a88d4`)

| Screen fault | Cause (measured) |
|---|---|
| Procurement (4) and Orders (5): "This is not set up for your workspace yet" | The web gateway answered `Unsupported route` for `…/v1/records/*` and `…/v1/lookups/*`: the two manifests had no `records: true` in `spec.gateway`, so the generated gateway never mapped the record API although the module host serves it |
| Inventory (8): "The service is unavailable" (500) | `ORGANIZATION_VERSION_PENDING`: the organization version in force was never delivered to Inventory, Orders, Procurement or General ledger. `kernel_job_runs` (read-only query) shows the version delivered to Manufacturing, Business partners, SPEED, Workforce, Analytics and Products only; the four modules were missing from the kernel worker's `ORGANIZATION_SYNC_OPERATIONS`, so no job was ever queued for them, and the module's refusal surfaced as a bare 500 |
| Inspection rounds (4): 503 "organization version is still being delivered" | No delivery job for the current version for `operator-rounds` (it is in the list; the version was activated before the module was up). Needs the administrator's "Send to modules again" (Settings › Organization & hierarchy) after the deploy |
| Business partners: 400 "cannot be sorted by display-name" | The partners record adapter declared no `sortFields`, so the window's default sort was refused |
| Settings › Security & SSO: "Unexpected end of JSON input" | Load calls parsed an empty or aborted body as JSON |
| Settings › General: configured fields 404 | No `tenant-profile-extension` manifest is published for the workspace (expected); the section showed an error instead of nothing |
| Analytics, CMMS › Reliability, Workforce › Analytics: "Missing module permission: cmms.analytics.read" | The workspace administrator role does not hold the module read permissions; the refusal carried the permission code as the message |
| Screens that never settle (15 s) | Did not reproduce in the journey runs; retest after the deploy |

## Changes (branch `feat/frontline-suite`, after `88e493d7`)

- `modules/universal-orders/module.yaml`, `modules/universal-procurement/module.yaml`: `records: true` in the gateway;
  `apps/workflow-platform/lib/generated/module-gateways.ts` regenerated (`pnpm modules:catalog`).
- `apps/playground-api/src/kernel-worker/module-call.job.ts`: `universal-inventory`, `universal-orders`,
  `universal-procurement` and `financial-operations` `.organization-sync` operations (payload union, sync list, call
  list, parse, payload, target), with the audiences, base URLs and keys the generated compose already sets on the
  kernel worker.
- `packages/module-sdk/src/organization-access.ts`: `OrganizationVersionPendingError` is a 503 with code
  `ORGANIZATION_VERSION_PENDING` and a plain message naming Settings › Organization & hierarchy.
- `modules/business-partners/apps/api/src/party/partners-record-adapter.ts`: `sortFields: ['display-name', 'code']`,
  ORDER BY honours the requested field and direction.
- `apps/workflow-platform/components/settings/TenantAccessManager.tsx`: `readJsonBody` (empty or broken body → null)
  on the five load calls.
- `apps/workflow-platform/components/settings/ConfiguredTenantFields.tsx`: renders nothing when no manifest exists.
- `modules/analytics-studio/apps/api/src/auth/source-access.service.ts`: plain refusals
  (`ANALYTICS_SOURCE_NOT_ENTITLED`, `ANALYTICS_SOURCE_PERMISSION`), permission and module kept in the body.

## Verification

- `pnpm verify` (2026-11-02 14:07Z): PASS for every step that ran — build, test, every audit including
  `audit:ui-shell`, module manifests, windows, conversions, migration pins, deployment, inventory-finance relay and
  posting reconciliation; 14 proof steps not run (need `PROOF_DATABASE_URL`, an isolated database).
- The web app builds (`next build` inside verify).
- Journey run 2 on `c88a88d4` (`docs/plans/ux-benchmark-2026-11-02/journeys-e2e-before.json`) is the "before"; the
  "after" run follows the owner's deploy and the "Send to modules again" click.

## Open (stays in this card)

- Geospatial and Workflow Studio are not in the UAT stack (`/api/maps/*`, `/api/workflow-studio/*` → 502): deploy them
  or hide place pickers and Workflow entries when absent.
- Analytics module-read grants for the workspace administrator (or hide sources the person cannot read).
- Inventory start-up error `InventoryReceiptPostingReconciliationJob: Cannot read properties of undefined (reading
  'getPool')`.
- Organization delivery dead-letters early ("fetch failed") when a module is not up yet.
