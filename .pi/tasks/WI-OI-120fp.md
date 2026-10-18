# WI-OI-120fp (F0.5): Inventory metadata on UAT — deploy and Playwright proof

- **Status:** In progress (owner, 2026-10-18)
- **Work item:** WI-OI-120 (closes F0 on WI-OI-120f). Evidence in `.pi/work/WI-OI-120.md` § F0.5 UAT.
- **Size:** S (release + one Playwright run; no product code unless manifest regression)

## Goal

On UAT, a tenant administrator uses `/inventory` metadata windows to receive goods and see balance/ledger; the
Playwright business flow passes against UAT with labelled test data.

## Preconditions (code)

- F0.1–F0.5 are in git (`424a733` … `bf049e1`, manifest fix `2104f91`).
- F1 (`0d29f8f`) may ship in the same release; it does not block Inventory windows.

## Owner deploy (same rules as CMMS releases)

1. Verified backup of UAT Postgres.
2. Independent Security review when the release touches module host / financial APIs (include F1 if in the tag).
3. Build images from the release commit; run migration jobs (**Finance 10–11**, **Inventory 5** on this release).
4. In `infra/compose/.env.modules` (owner-only): run `generate-inventory-finance-relay-credentials.sh` if keys absent; set
   `FINANCE_INVENTORY_POSTING_DATABASE_URL` to the **same value as `UNIVERSAL_INVENTORY_DATABASE_URL`** (Finance updates
   receipt posting status via the Inventory definer function).
5. Deploy; read-only check: module host and web healthy; Finance migration **11**, Inventory **5**; relay health ok.
6. Live F2: complete a receipt → `GET …/subledger/inventory/posting-reconciliation` balanced; receipt shows **Posted**.
7. Control plane activates six Inventory window views for the tenant with Universal Inventory entitled.
8. Manual smoke: `/inventory` → Warehouses tab loads a grid (not “no view” / not static demo figures).

## Playwright (agent or owner machine)

One-time (gitignored): `cp e2e/uat.env.example e2e/uat.env` and fill credentials.

```bash
pnpm e2e:uat:inventory
```

(Installs workspace deps and Playwright if needed; loads `e2e/uat.env`; no prompts when vars are set.)

Tenant must hold **Product Catalogue** and **Universal Inventory** entitlements (admin role).

## Done when

- [ ] Owner deploy recorded with tag and backup id in `.pi/work/WI-OI-120.md`.
- [ ] Playwright `inventory-business-flow` passed; run id and tenant noted.
- [ ] WI-OI-120f Done checklist ticked; `NOW.md` updated.
