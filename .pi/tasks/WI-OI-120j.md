# WI-OI-120j (F0.6): "Add new" from any picker

- **Status:** Approved (owner, 2026-10-06, with the walk-through plan). Implemented and checked; awaiting deploy.
- **Work item:** WI-OI-120 (F0, ADR-0033 metadata windows). Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** M

## Goal

A tester never has to know which other screen feeds a dropdown. Every picker whose records a published window creates
offers "+ Add new …":
- the pop-up is that window itself, so it has the same fields, rules, audit and permissions;
- the new record is selected when saved;
- the half-filled form is kept.

"Open" shows the chosen record. "Add new" appears only to a user holding the window's create permission.

## Design

- **The reference names the window.** A dictionary reference may name the window that creates its records:
  `createWith: { moduleKey, surfaceKey, permission }`. The module generator refuses a window no module ships.
- **One dialog stack per window.** Each window keeps its dialogs outside its forms, so a dialog's form never nests in
  another form, and dialogs can stack (a unit while adding a product while adding an item).
- **Pages hand over clients.** A page gives its windows the record clients of the modules they may open; Inventory
  gives the Catalogue's.
- **Windows upgrade on deploy.** Changed baselines upgrade at start-up for tenants that have not customised them (by
  checksum). A customised window keeps the tenant's version and gets a review notice.

## Done when

- [x] `createWith` is in the contract and the field model; the generator checks it; 13 shipped windows use it.
- [x] `pnpm build`, `pnpm test` and `pnpm verify` pass.
- [ ] After deploy, `e2e/specs/uat-add-new.spec.ts` passes on the UAT instance: item → Add new Product → Add new
      Unit → saved and selected.
