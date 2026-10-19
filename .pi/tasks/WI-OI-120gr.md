# WI-OI-120gr: Procurement window actions (submit / approve)

- **Status:** Built (2026-10-19; not on UAT)
- **Work item:** Table 1 P2P polish — F0 command actions on requisitions and vendor bills.

## Goal

Expose existing procurement lifecycle APIs as metadata window actions on `/procurement` (requisition submit + approve; vendor bill approve).

## Done when

- [x] Dictionary actions on `procurement-requisitions` and `procurement-vendor-bills`
- [x] Record adapter `actions` wired to `ProcurementService`
- [x] `generate-windows.mjs --check` and module tests pass
