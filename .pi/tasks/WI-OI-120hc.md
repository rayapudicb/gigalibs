# WI-OI-120hc: Relay test fixtures include inboxPath

- **Status:** Built (2026-10-19; git `6c29fe92`; not on UAT)
- **Work item:** Unblocks **WI-OI-120gf** / root `pnpm verify` after module-sdk relay `inboxPath` (Table 2 relay hardening).

## Goal

Integration and relay health tests construct valid `RelayConfig.outbound` objects so `@gigalibs/connectors-api` (and peers) compile in root build.

## Done when

- [x] Connector Hub + Geospatial relay integration tests pass `inboxPath`
- [x] `@gigalibs/module-sdk` relay-health test updated
- [x] Record adapters return `RecordPage.total` (orders, procurement)
- [x] `verify-migration-pins.mjs` lists `ar-migrations` / mig **16**
- [x] Orders quote window INTEGER default fixed (`payment-term-days`)
