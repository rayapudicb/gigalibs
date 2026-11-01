# Operator Rounds UAT journey (WI-OI-133)

**Status:** Prepared source only. The owner deploys from a release worktree after the fixed groups; no UAT execution or acceptance is recorded here.

## Before running

1. Deploy the verified Rounds API, workflow web, mobile BFF, CMMS and Workforce integration, and the CMMS relay worker. Enable `operator-rounds` for the UAT tenant.
2. Provision four UAT users in the same tenant: route author (`routes.manage`), a **different** publisher (`routes.publish`), supervisor (`assignments.manage`, `board.read`, `exceptions.read`, `exceptions.review`), and operator (`runs.execute`, mobile app access). If any login uses MFA, arrange a compatible UAT identity or update the test to handle MFA; the spec does not bypass it.
3. Supply an existing CMMS asset UUID and an active Workforce human resource UUID linked to the operator's **platform user ID**. The resource must have an eligible position and working slot covering the next 30 minutes, with no conflicting absence or site closure. The CMMS relay must be able to accept a RED corrective action.
4. Set `E2E_UAT_TENANT` to the actual UAT tenant display name. Set `ROUNDS_BASE_URL`, `ROUNDS_ASSET_ID`, `ROUNDS_WORKFORCE_RESOURCE_ID`, the four `ROUNDS_*_EMAIL/PASSWORD` pairs, and optional `ROUNDS_APP_PROFILE`/`ROUNDS_APP_VERSION` from [uat.env.example](../../e2e/uat.env.example). The command loads `e2e/uat.env` when present. The dedicated command fails when prerequisites are missing.

## Run

```bash
pnpm e2e:uat:rounds
```

The command uses the live HTTPS origin, or localhost for local UAT. It signs in through the real mobile bearer flow, including workspace selection if needed. It then creates a unique `CERT-*` route and uses a separate publisher, saves a roster, creates an assignment, downloads the mobile bundle, verifies its initially empty manual-inspection history and offline grant, syncs four commands, verifies each receipt and exact replay, checks the supervisor board, waits for CMMS `ACTION_ACCEPTED` with a work-order reference, resolves the exception, and opens the admin page. Any failed command or missing relay settlement fails the journey. The run creates real UAT records; keep the route code from the Playwright trace for audit. Do not delete records with direct SQL.

The RED checkpoint in this **API contract journey** has `photoOnException: false`. That permits an API-only test without falsely claiming a staged photo or a physical barcode scan. The `scannedTag` field is supplied over HTTP; this test cannot prove that a camera read the physical tag. The test also does not prove that a device was offline, that its encrypted journal survived restart, or that Analytics received the fact. Those are separate acceptance checks below.

## Remaining acceptance evidence

| Gate | Evidence needed |
|---|---|
| Physical barcode and NFC | Representative Android/iOS devices scan real installed checkpoint tags; wrong tag and revoked assignment are refused. |
| Photo exception | Device captures a photo, stages and commits it through the object store, sends its bound `evidenceId`, and proves retry and failed upload recovery. |
| Offline and lifecycle | Device downloads a grant, captures while disconnected, restarts, reconnects, receives persisted receipts, and purges data after logout, workspace switch and reinstall. |
| Analytics | Inspect the signed Rounds reading relay and Analytics inbox watermark/fact through the documented Analytics interface for this route and tenant. Record event IDs and no duplicate on replay. |
| Security and scope | Exercise another tenant, owning unit and place; deny unauthorized publisher/reviewer and stale versions; confirm no data crosses the boundary. |
| Performance | Measure checkpoint capture time on representative devices under the intended plant conditions against the 4–7 second goal. |
| Release | `pnpm verify` clean, mobile repository gates, migration and roll-forward proof, live module conformance, owner UAT acceptance. |

Record the journey result and remaining evidence in `.pi/work/WI-OI-133.md`. Do not mark WI-OI-133 Built until the module completion gate passes, or Done until the owner records UAT acceptance.
