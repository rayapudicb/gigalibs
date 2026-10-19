# WI-OI-120gs: O2C / P2P window lifecycle actions

- **Status:** Built (2026-10-19; not on UAT)
- **Work item:** Table 1 polish — F0 commands on orders and purchase orders.

## Goal

Expose existing lifecycle APIs as metadata window actions: quote accept, sales order confirm, PO issue and acknowledge.

## Done when

- [x] Dictionary actions on quotes, sales orders, and purchase orders windows
- [x] Record adapter `actions` wired to OrderService / ProcurementService
- [x] Window generation `--check` and module tests pass
