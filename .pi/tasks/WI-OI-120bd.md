# WI-OI-120bd: Four small hardening fixes from step 0.8

- **Status:** Built (2026-10-16), not yet released. Approved by the owner on 2026-10-16 ("approved 120bd").
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

- [ ] No script carries a default credential, and the audit stops new ones.
- [ ] Retiring a module can no longer stop Control Tower saving a workspace.
- [ ] Relay health reports slow passes as running and failing relays as failing.
- [ ] No session stays ACTIVE past its expiry for more than one sweep interval.
- [ ] Released and Security-reviewed. The owner has deployed it and the journey is rerun.
