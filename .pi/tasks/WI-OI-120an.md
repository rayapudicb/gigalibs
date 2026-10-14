# WI-OI-120an: The Time screen's help tells the truth, and an administrator with no person gets no 403

- **Status:** Carded, not started (2026-10-14). Shown to the owner before it starts.
- **Found by:** the independent Security review of [WI-OI-120ah](WI-OI-120ah.md) (release `e785f9d`), findings M1 and L1.
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** S

## Why

- **M1 (Medium): the help drawer on `/gigaops/time` describes the deleted demo screen.**
  - `apps/workflow-platform/lib/module-knowledge-registry.ts` (`'/gigaops/time'`), shown by
    `components/navigation/ModuleHeaderAndDrawer.tsx`.
  - It promises a muster roll, operator rounds and automated defect work orders, none of which exist.
  - It makes two security claims that are false:
    - "GPS coordinates cryptographically signed at the mobile hardware boundary";
    - "Anti-tamper hardware monotonic clock".

    The location comes from the browser (`navigator.geolocation`), the punch time from the browser's clock, and
    nothing is signed. An approver or auditor could trust an "inside the site" punch as tamper-proof.
  - It also prints the internal port and schema name.
- **L1 (Low): an administrator with no person still gets 403s on the Time screen** (the plan v3 step 0.8 item from
  journey `7i0v43`).
  - On the first load, "my week" is requested before the session and the people list arrive, so 120ah's check
    cannot stop it.
  - The clock panel lists the caller's own punches, which is a second 403.
  - A late 403 can replace the week of a person the user has just picked, because out-of-date answers are not ignored.

## Design (to be confirmed with the owner)

1. Rewrite the `/gigaops/time` help entry to describe the real screen:
   - punches checked against the site boundary using the browser's location;
   - the weekly timesheet;
   - four-eyes approval;
   - time exceptions and corrections.

   Its guardrails name only what the server enforces. No port or schema.
2. The workbench tells the Time screen when the people list has finished loading (or failed).
3. "My week" and "my punches" wait until the session and that answer are known:
   - a known user with no person → neither is requested, and the screen says so;
   - the list failed or is incomplete → the screen asks the server, as today.
4. Out-of-date answers are ignored (a request counter or `AbortController`).
5. Tests:
   - the help entry's text is checked against the screen's real features (no "signed", "anti-tamper", "muster"
     or port);
   - the waiting rule is tested as a pure function, like `timeActions`.

## Scope

- **May change:** `apps/workflow-platform/components/gigaops/` (TimeAndAttendance, the workbench), the `/gigaops/time`
  entry of `apps/workflow-platform/lib/module-knowledge-registry.ts`, their tests, the journey spec if needed.
- **Must not change:** the Workforce API, other help entries (they go to WI-OI-120ak), other agents' work.

## Done when

- [ ] The Time help drawer describes only what exists and claims only what the server enforces.
- [ ] An administrator with no person opens `/gigaops/time` with no 403 (journey check).
- [ ] A late answer never overwrites the week of the person now shown.
- [ ] Evidence recorded; built, reviewed and deployed by the owner.
