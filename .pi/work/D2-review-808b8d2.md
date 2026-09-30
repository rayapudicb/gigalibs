# D2 review: the unreviewed other-stream commit `808b8d2` (2026-09-30)

**Commit:** `808b8d2` (2026-09-28), "UNREVIEWED forms, ledger genesis, telemetry, permits and ledger settlement". It
was written by a concurrent Antigravity session between 2026-09-25 and 2026-09-28. Its message says not to run the
core migrations job until the owner decides (D2).

**Reviewed by:** Claude, at the owner's request ("full catch-up of the real local stack, after the unreviewed work is
reviewed").

## 1. The five core migrations

The migrations are:
- `20260927000000_ledger_genesis_records`
- `20260927100000_phase2_dual_mode_forms`
- `20260927110000_phase3_thingsboard_telemetry`
- `20260927120000_phase4_workforce_eptw_handover`
- `20260927130000_phase5_cmms_workforce_ledger_settlement`

**Already in the local database, unrecorded.** Every object they create already exists: the tables, columns,
constraints, policies, the four GL accounts and the ledger genesis rows. They were applied directly, without a row in
`_prisma_migrations`.

**Idempotent.** Each statement uses `IF NOT EXISTS`, `DROP ... IF EXISTS` then re-create, `ON CONFLICT DO NOTHING`, or
a guarded `DO` block. Running them through the migrations job only records them.

**No data removed.** Their DROP statements remove only constraints and policies, which are re-created at once.

**The CMMS constraints match the data.** The replaced CMMS checks match what the database holds today:
- work-order status: OPEN 66, COMPLETED 16, CANCELLED 13;
- trigger source: MANUAL 85, PM_SCHEDULE 10;
- meter-reading source: MANUAL 30.

**Architecture finding (A1).** Three core migrations change the CMMS and Workforce module schemas, which breaks module
schema ownership (ADR-0013, ADR-0016). The right home is each module's own migrations. Moving them is follow-up work
and does not block the catch-up.

**Verdict:** safe to record. The catch-up changes no data.

## 2. Code still live from the commit

**Already handled by WI-OI-083 (owner-approved 2026-09-28):**
- The CMMS settlement routes and the Workforce permit and handover routes were removed.
- The two telemetry routes answer "unavailable".

**Dead code (C1).** `lib/telemetry-bridge-service.ts` and `lib/workforce-safety-service.ts` have no product
importers, only their own tests. Both run SQL directly against module schemas (layer-audit baseline entries).
Candidates for removal.

**Forms are live, including on the current 5180 web image (`a255e935`).** The routes are `/api/forms`,
`/api/forms/[id]`, `/api/forms/[id]/submissions`, `/api/forms/mobile/*`, `/api/forms/public/[slug]` and the public
page `/forms/q/[slug]`.

| # | Severity | Finding |
|---|---|---|
| F1 | High | The signed-in forms routes check only that a session exists: no permission and no entitlement. Any member of a tenant, including VIEWER or GUEST, can create, edit and delete forms and read every submission (all tenant-scoped). |
| F2 | High | Their changes (POST, PATCH, DELETE) have no same-origin check, unlike every other shell mutation (cross-site request forgery). |
| F3 | Medium | The public submission route is open by design, but it has no body-size limit, no rate limit and no validation against the form's fields. It stores a caller IP taken from the spoofable `X-Forwarded-For` header. |
| F4 | Architecture | A second forms engine (`form_schemas` and `form_submissions`) beside Configuration Studio's governed forms (WI-OI-039). This goes against ADR-0016 F3 (one engine per job). |

**Recommendation:** contain the forms routes the way WI-OI-083 contained telemetry, answering "unavailable" until they
are rebuilt on the governed forms engine with permissions. The data stays in place. The public questionnaire and
mobile sync would come back as part of that rebuild, the offline-mobile path the owner chose (SQLite plus a command
queue).
