# WI-OI-120bd: Four small hardening fixes from step 0.8

- **Status:** On UAT (release `f9de9a3`); journey `b0j8mq` is clean. Done needs the owner's acceptance.
- **Plan v3:** step 0.8 follow-ups, released together in one W1 release (phase-1-sizing.md).
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** S overall: four S slices, one release. No migration.

## The four fixes

### S1. No built-in sign-in in verification scripts

- **Now:** `scripts/verify-charts-and-reports-browser.mjs` and `scripts/verify-intelligence-documents-browser.mjs`
  fall back to a built-in UAT email and password when none is given (lines 10–11). That account no longer exists on
  UAT, but a credential written into code breaks the zero-hard-coding rule (AGENTS.md). WI-OI-120at found these.
- **Change:**
  - both scripts require `GIGALIBS_UAT_EMAIL` and `GIGALIBS_UAT_PASSWORD` and refuse to start without them;
  - the zero-mock audit gains a rule that fails on a password default in `scripts/`.

### S2. Platform Control Tower survives a retired module

- **Now:** a release-review finding (b7632d6, M1).
  - The tenant editor seeds its module list from every ENABLED entitlement, including keys no longer in the catalogue.
  - Saving then answers 400.
  - `updateEntitlements` only writes catalogue keys, so it cannot close the stale row itself.
  - UAT has no such rows today (the Master Data clean-up), but the next retirement would bring the problem back.
- **Change:**
  - the editor lists only catalogue modules;
  - saving disables any ENABLED row whose key is not in the catalogue, with the reason "Module no longer offered" and
    an audit record.

### S3. Relay health tells slow and failing relays apart

- **Now:** release-review Info (b7632d6).
  - A pass that is slow but making progress can read as "stalled".
  - A relay whose every delivery fails still reads "running"; only `lastFailureCode` shows it.
- **Change:**
  - each relay records when its current pass started, so a pass still in progress is "running", not "stalled";
  - a new state, "failing", is set after 3 passes in a row that leased facts but delivered none;
  - `GET v1/health/relays` answers 503 for "failing" too, so monitoring (O3) can alert.

### S4. Expired sessions are swept automatically

- **Now:** UAT, read-only, 2026-10-16:
  - 243 sessions are marked ACTIVE although they have expired, next to 290 live ones;
  - the sign-in guard already refuses expired sessions, so nobody can use them;
  - but every "active sessions" count and check, including the 120aw read-back, has to filter them out by hand.
- **Change:**
  - a small sweeper in the control-plane API, built like the data-export worker, sets expired ACTIVE sessions to
    EXPIRED;
  - it runs every 15 minutes, in batches, with a configured interval and batch size, and writes an audit summary.
  - The first run clears the 243.

## Built (2026-10-16)

- **S1, no built-in sign-in:**
  - both verify scripts read `GIGALIBS_UAT_EMAIL` and `GIGALIBS_UAT_PASSWORD` only, and stop with a message without
    them;
  - the zero-mock audit gains `DEFAULT_CREDENTIAL`: an environment password, secret, token or API key that falls back
    to a written-in value. It applies to `apps/` and `modules/`, and in a new pass to `scripts/`, which gets only this
    rule. The report shows `<value hidden>` instead of the value.
  - **Proven:** with a made-up default put back in one script, the audit fails, and the value appears 0 times in its
    report. Restored, it passes. Only these two scripts matched before.
- **S2, retired modules:**
  - Control Tower's tenant editor lists only modules still offered (`entitlementEligible`);
  - `updateEntitlements` switches off any ENABLED row whose module is no longer offered ("Module no longer offered"),
    and records the keys in the audit metadata (`closedModulesNoLongerOffered`);
  - 2 new tests.
- **S3, relay health:**
  - each relay tracks when its current pass started and when it last settled a fact, so a slow pass that keeps making
    progress reads "running";
  - a new state, "failing", is set after 3 passes in a row that leased facts but delivered none; idle passes do not
    reset the count, a delivery does;
  - the report reads "degraded" (503) for "stalled" or "failing";
  - 3 new tests;
  - the Connector Hub route spec's snapshot gained the new fields;
  - all 4 APIs that run a relay (Workforce, CMMS, Geospatial, Connector Hub) type-check.
- **S4, expired sessions:**
  - `SessionSweepWorker` in the control-plane API runs every `SESSION_SWEEP_INTERVAL_SECONDS` (default 900);
  - each run handles up to 20 batches of `SESSION_SWEEP_BATCH_SIZE` (default 500), marking ACTIVE sessions past expiry
    EXPIRED (the write checks status and expiry again), and writes one audit summary when anything changed;
  - the sign-in guard and refresh already refuse expired sessions, so this is housekeeping only;
  - the kernel worker does not start this module, so it runs once;
  - 5 new tests;
  - no compose or env change: the defaults live in code, like the export worker's.
- **Verification:**
  - module-sdk, tenancy, control-plane API, web and the relay route: 1,024 passed, none failed;
  - type-checks clean (web, control-plane API, tenancy, module-sdk and the 4 relay APIs);
  - lint unchanged against HEAD, with the new files formatted;
  - every audit passes; design tokens fails only on the 3 files other sessions own.
- **Next:** release, Security review, the owner's deploy. Then check on UAT: 0 ACTIVE sessions past expiry, healthy
  relays, and the journey.

## Tests

- **S1:**
  - both scripts refuse to start without the variables;
  - the audit fails on a password default.
- **S2:**
  - the editor list leaves out keys not in the catalogue;
  - saving disables a stale ENABLED row and audits it.
- **S3:**
  - a slow pass in progress reads "running";
  - 3 failing passes read "failing" and return 503;
  - a delivery resets the count.
- **S4:**
  - only expired ACTIVE sessions change;
  - batches are bounded;
  - the audit summary is written;
  - the interval comes from configuration.
- **Checks:** the type-checks, the suites and the audits.
- **On UAT, after the owner deploys:**
  - 0 ACTIVE sessions past expiry within 15 minutes;
  - every relay healthy;
  - the journey is unchanged.

## Done when

- [x] No script carries a default credential, and the audit stops new ones.
- [x] Retiring a module can no longer stop Control Tower saving a workspace.
- [x] Relay health reports slow passes as running and failing relays as failing.
- [x] No session stays ACTIVE past its expiry for more than one sweep interval.
- [x] Released and Security-reviewed. The owner has deployed it and the journey is rerun.

## Security review of release f9de9a3 (2026-10-16): approve with one condition, met

- **Condition:** count, read-only on UAT, the ENABLED entitlement rows for modules that are not offered.
  - **Result (2026-10-16):** 17 rows, all for the key `reports`: 1 in `gigalibs-global` (TRIAL, from the self-service
    trial of 2026-09-13) and 16 in cancelled workspaces.
  - `reports` left the catalogue on 2026-09-30, when Analytics took over reports (WI-OI-103e, ADR-0016 F11). No code
    reads that key (`git grep`, release branch).
  - So these are exactly the stale rows S2 is for. The next Control Tower save of `gigalibs-global` switches its row
    off and records it, and nothing a person uses changes.
- **No High findings in the diff.**
- **Verified:**
  - S1: no secret is printed; the rule matches exactly the 2 old scripts; the new pass reads only tracked
    `scripts/` files; the redaction over-hides.
  - S2: authorisation unchanged; closures happen in the same transaction after the tenant lock; the audit names the
    keys; the entitlement event is still sent; key casing is consistent.
  - S3: no healthcheck or readiness check uses `/relays`, so a 503 there cannot restart anything.
  - S4: the sweep (`expiresAt < now`) and the guard and refresh (`> now`) cannot overlap; the update re-checks;
    only the API process runs it; each run is bounded.
  - Parity: 13 of 14 files byte-identical, and the audit script differs only by the older WI-OI-120aj block.
- **Medium, old code, not in this release and not deployed:**
  - `modules/accounts-receivable/apps/api/src/payments/webhooks.controller.ts:96` falls back to a written-in payment
    webhook signing key when `ADYEN_HMAC_KEY` is unset.
  - The AR API is in no compose file, so UAT is not exposed.
  - The new `DEFAULT_CREDENTIAL` rule misses it: it reads `process.env['…']` with brackets, and the name ends in
    `_KEY`.
  - **Follow-up card:**
    - remove that fallback;
    - widen the rule to bracket access, `*_KEY`, `HMAC` and `PRIVATE_KEY` names, and shell `${X:-…}` defaults.
- **Low:**
  - S2 treats "not entitlement-eligible" as "no longer offered". A module later made ineligible only to stop new sales
    would be switched off for current customers when saved. No impact today: the only ineligible module is
    `platform-control`, which platform authority gates. Follow-up: document that ineligible means retired, or close
    only keys missing from the catalogue.
  - S3 "failing" holds until a delivery, and a failed lease counts. So 3 database blips on a quiet relay keep
    `/relays` at 503 until the next delivery or restart. It affects monitoring only. Follow-up: count only passes that
    leased facts, and clear the state after a quiet period.
- **Info:**
  - the audit fingerprint is a hash over text that includes the value;
  - names like `*TOKEN_TTL` could be flagged falsely;
  - a tracked script deleted from the worktree makes the pass fail closed;
  - the sweep's audit row is written outside the batch writes;
  - on UAT the sweep settings are the code defaults;
  - there is no `(status, expiresAt)` index yet, which is negligible now.

## On UAT (2026-10-16)

- **Release `f9de9a3`:** owner deploy, smoke test passed.
- **Read-only check:** 11 of 11 containers on `local-20261016T122119Z-f9de9a391bf8-ec895080a77e`, healthy, with 0
  restarts; 546 tables; 0 error lines.
- **S4 on its first run:**
  - "Marked 243 expired session(s) EXPIRED";
  - 0 sessions now ACTIVE past expiry;
  - 1 audit row (`EXPIRED_SESSIONS_SWEPT`, count 243).
- **S3, from inside the compose network:** every relay answers 200 `ok`, each `running` with 0 failed passes:
  - Workforce, to Analytics and CMMS;
  - CMMS, to Workforce;
  - Geospatial, to Analytics;
  - Connector Hub, to Analytics and Geospatial.
- **Journeys on `f9de9a3`:**
  - `b03w3r`: 4 blockers. They came from the host's load (about 9.5) right after the deploy: two Workforce calls ran
    past the web proxy's 3-second limit.
  - `b0j8mq`, the rerun: 52 findings, 2 blockers (the known CMMS ones), identical to `asyz8p`.
