# WI-OI-120h (U19a): CMMS screens reach their API

- **Status:** Approved (owner, 2026-10-05, option A; widened the same day to the API faults the proof found). Implemented
  and checked; awaiting deploy. Done before U7 (WI-OI-120g).
- **Work item:** WI-OI-120 (U19 in `remediation-backlog.md`: "all 37 unrouted calls working"). Evidence goes in
  `.pi/work/WI-OI-120.md`.
- **Size:** S

## Goal

Every CMMS screen reaches the CMMS API route it calls. In UAT today:
- Assets and Meters say "Unsupported CMMS route";
- `/cmms/spaces` crashes in the browser;
- deletes and the two PUT updates cannot pass the web gateway at all.

## Cause

- 36 routes the CMMS API serves and the screens call are missing from the gateway list in
  `modules/physical-operations-cmms/module.yaml`:
  - classifications and spec definitions;
  - asset specs, equipment tree and cascade status;
  - meter triggers and telemetry;
  - storerooms and part balances;
  - part issue, return and TCO;
  - failure codes;
  - job plans;
  - failure attribution.
- The screen calls `spaces/{id}/cad-layer`; the API serves `cad-layers`.
- The web gateway route answers GET, POST and PATCH only, so 5 deletes and 2 PUTs never reach the module.
- The API answers the space tree and a space's assets as plain lists; every other CMMS list (and the screen) uses
  `{ items }`.
- Three deletes answer 204 with no body, which the screen's client tries to read as JSON.

## Scope

- **May change:**
  - the CMMS gateway list in `module.yaml` and the generated gateway;
  - the web gateway route and the signed module proxy, which forward PUT and DELETE only on routes a module lists
    (option A). PUT and DELETE get the same same-site check and write headers as POST and PATCH;
  - the CMMS spaces controller (`{ items }`);
  - the CMMS screen client: `cad-layers`, and 204 answers;
  - tests and a proof script.
- **Must not change:**
  - the CMMS import/export files;
  - applied migrations;
  - other modules' routes;
  - running services (the owner deploys).

## Proof

- **Unit tests:**
  - every call in the CMMS screen client has a gateway route with a permission;
  - every CMMS gateway route is served by a CMMS API controller;
  - the equivalence oracle covers the new routes;
  - PUT and DELETE pass the same-site check and forward their body.
- **HTTP proof** on an isolated database, with real migrations and the built CMMS API: each screen call, signed as
  the gateway signs it, gets a success and the shape the screen reads. It also checks another tenant's record and a
  missing permission.

## Done when

- [ ] Assets, Meters, Parts and Spaces load on screen after deploy; the deletes and spec/balance updates work.
- [ ] `pnpm build`, `pnpm test` and `pnpm verify` pass.
- [ ] Evidence is recorded; images are built and handed to the owner for deploy.
