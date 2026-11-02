# WI-OI-137: M-LOG Operator shift logbook, bypass register and two-person handover (Workforce, web and mobile)

- **Status:** Approved (owner, 2026-11-01: "continue all the modules without my intervention implement everything");
  In progress on `feat/frontline-suite`.
- **Work item:** WI-OI-137. Evidence: `.pi/work/WI-OI-137.md`. Spec: `docs/products/mobile-suite/02-operator-shift-logbook.md`;
  ADR-0035 (handover is Workforce M-WF3; notes and bypass ownership to be resolved without a second handover store).
- **Size:** L

## Ownership decision (agent, under the owner's directive; for Architecture review)

Workforce writes the logbook, its entries, the bypass register and the handover: all are shift-bound, the ADR assigns
handovers to Workforce, and one owner avoids a second handover store and any cross-module write. Assets are plain CMMS
references. Open work orders, Rounds exceptions and IoT standing alarms are composed into the turnover view by the
clients from their own owners (a later composition step), not copied into Workforce.

## Design

- **Data (Workforce migration 29, additive):** `logbooks` (unit, place, IANA zone, shift windows); `logbook_entries`
  (immutable; category; optional asset reference; corrections are new entries pointing at the corrected one;
  client operation id); `logbook_bypasses` (REQUESTED → AUTHORIZED by someone else → CLEARED, or REJECTED; planned
  removal time; reason and mitigation); `logbook_handovers` (shift; outgoing submits a frozen package and signs a fixed
  statement; a different incoming operator acknowledges every active bypass and accepts; optional supervisor
  countersign by a third person). Forced tenant RLS; scope by unit and place.
- **Rules:** entries and package snapshots never change; a shift has at most one open handover; acceptance is refused if
  the set of active bypasses changed since the package was frozen (re-freeze first); a bypass active longer than 48
  hours is flagged on the board.
- **Permissions:** `workforce.logbook.read|write|authorize|manage`. Operator read+write; supervisor read, write,
  authorize, manage.
- **Mobile:** `/mobile/v1/logbook/...` (logbooks, current shift, entries, bypass request, handover submit/accept);
  feature `logbook`.

## Gates

Voice-to-structured logging and photo evidence (media and transcription capabilities); PIN or biometric step-up for
sign-off (platform identity); composed turnover roll-up from CMMS, Rounds and IoT; offline persistence; device proof;
owner UAT; Architecture review of the ownership decision above.
