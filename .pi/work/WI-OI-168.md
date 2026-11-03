# WI-OI-168 evidence — status truth on UAT

## 2026-11-03 — read-only check of everything running on UAT (queue item 6, Claude)

**Release:** `bd852946` (images `bd85294645c7-82b8998c28f0`), deployed by the owner 2026-11-03. Evidence gathered
read-only: container state and log scan (no errors since the restart), the screen bench
(`docs/plans/ux-benchmark-2026-11-03-r4/live.json`), 28 dry journeys, 50 read-only e2e tests and the milestone A retest
(`.pi/work/WI-OI-151.md`).

### Per module (bench on `bd852946`: screens that load with no failing call / screens)

| Module | Screens | Cards it verifies |
| --- | --- | --- |
| Asset maintenance (CMMS) | 17 / 17 | M-CM1, WI-OI-134–136, 138–140, 142 |
| Workforce | 11 / 11 | WI-OI-137 (logbook) |
| Places & maps | 1 / 1 | — |
| Products | 10 / 10 | — |
| Inventory | 15 / 15 | WI-OI-122, 124, 125, 127 |
| Procurement | 5 / 5 | WI-OI-122, 127 |
| Orders | 5 / 5 | — |
| General ledger | 8 / 8 | WI-OI-122 |
| Business partners | 1 / 1 | WI-OI-123 |
| Manufacturing | 4 / 4 | WI-OI-126 |
| Projects | 1 / 1 | WI-OI-129 |
| Returns | 1 / 1 | WI-OI-128 |
| Inspection rounds | 4 / 4 | WI-OI-133 |
| Safety | 5 / 5 | WI-OI-141, 143 |
| Process safety (SPEED) | 8 / 8 | — |
| IoT | 6 / 6 | WI-OI-130 |
| Analytics | 6 / 6 | (WI-OI-131, outside the queue) |
| Master data | 7 / 7 | WI-OI-152 |
| Settings | 6 / 7 | Settings › General: configured-field manifest 404, handled on screen (QA-011) |
| Connections | 2 / 3 | Connections reads Workflow Studio's 503 (QA-009) |
| Workflows | 0 / 3 | Workflow Studio is not in the UAT stack (QA-009, owner decision) |

### Rows relabelled by this evidence

- **On UAT (release `bd852946`):** WI-OI-122–130, 133–143, 145 — each row names what was checked and what Done still
  needs (write journeys with the owner's approval, relays configured on UAT, device proof WI-OI-165, the owner's
  acceptance).
- **On UAT (release `38aa9017`):** WI-OI-147, 148 (what is left is checks, not code) and 149 for what was built.
- **WI-OI-149 remainder, moved (owner to confirm):** one-click approvals → WI-OI-163 record offers; create-from →
  WI-OI-161; unit and date defaults → each module's completion card; journey times QA-038 → WI-OI-151; QA-022 dialogs
  need records on UAT.
- **WI-OI-151 → Built:** the harness and 28 journeys run on UAT; write mode on the isolated test stack and journey
  budgets as a gate are new work for the owner to place.
- `.pi/NOW.md`: stale deploy instructions and verify notes moved to `.pi/archive/NOW-history-before-2026-11-03.md`;
  NOW.md now says no deploy is waiting for code that already runs.

### Not checked by an agent (refused: agents do not read production)

Relay health inside the services. The owner can run it (read-only; relay names, times and counts only, no workspace
data) and paste the result:

```
for t in "module-host 4790 financial-operations/" "module-host 4790 project-operations/" "module-host 4790 universal-inventory/" "module-host 4790 universal-manufacturing/" "module-host 4790 universal-returns/" "cmms-api 4200 " "workforce-api 4700 " "geospatial-api 4720 " "connector-hub-api 4100 "; do set -- $t; printf '%s %s: ' "$1" "$3"; docker exec gigalibs-configuration-local-$1-1 /nodejs/bin/node -e "fetch('http://127.0.0.1:$2/$3v1/health/relays').then(async r=>console.log(r.status,(await r.text()).slice(0,300))).catch(e=>console.log('ERR',e.message))"; done
```

### Owner list

1. **Accept (or name what fails):** the modules above, by opening their screens on 5180; rows move to Done only with the
   owner's recorded acceptance.
2. **Decide:** Workflow Studio — start its service on UAT or hide its screens (QA-009); the six not-wired relays
   (`.pi/work/WI-OI-160.md`); WI-OI-131 Analytics (outside the queue); where the WI-OI-149 remainder and WI-OI-151's
   open work go.
3. **Click on UAT:** load the starter absence types and asset classes (QA-026); "Send to modules again" for QA-034,
   QA-036, QA-047.
4. **Run:** the relay-health command above; the CMMS journey `jsjmyx` after the next deploy; write journeys only with
   `GIGALIBS_ALLOW_UAT_WRITE_E2E=1` or on the isolated test stack.

`audit:sdlc` green after the relabel (every On UAT row names its release).
