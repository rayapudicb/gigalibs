# WI-OI-149 evidence — forms to 10–30 seconds

## 2026-11-02 — party and product pickers, money in normal units (first slice)

No business-logic change: every picker writes the same id the field held before; money is stored in minor units as
before and only typed and shown in normal units.

- **Customer and vendor pickers.** `business-partners-parties` lookup (`partnersLookup`, permission
  `business-partners:read`, active parties, label `Name (code)`, attributes `name`, `code`) registered in the
  partners dispatcher. Orders quote, sales order and credit memo: `Customer` is a reference over it and fills the
  customer name. Procurement purchase order, vendor bill and debit memo: `Vendor` likewise, filling the vendor name.
  `LOOKUP_BASE_PATHS` in both workspaces route the lookup to `/api/business-partners`.
- **Product picker fills the line.** The catalogue products lookup returns `code`, `name` and `base-uom-id`; the order
  and procurement line windows fill product code, name and unit from the pick.
- **Reference `fills`.** `DictionaryReferenceV1Schema.fills` (contracts), `lookup(key, resolver, { fills })`
  (window builder), `LookupOption.attributes` (module SDK and records client), and `MetadataWindow` copies the picked
  option's attributes into the named fields.
- **Money in normal units.** `isMinorMoney`, `moneyFromMinor`, `fieldLabel` (window model): "12.50" is stored as 1250,
  shown as 12.50, and the "(minor units)" label suffix is dropped; validation says "must be an amount such as 12.50".
- **Masters readable by module roles.** Orders and Procurement roles gain product, unit, business-partner and
  inventory reads, so their pickers have options (`roles.generated.ts`, permission catalogue regenerated).
- **Plain errors.** `plainStatus` replaces "Request failed (n)" in the records client.

## Verification

`pnpm verify` PASS (2026-11-02 14:07Z, see WI-OI-146); targeted suites (configuration-react window model and
MetadataWindow, contracts dictionary, module SDK dispatcher, business partners, product catalogue, gateway
equivalence) passed. Journey timings after the deploy replace the estimates in the plan.

## Open (stays in this card)

Action dialogs that ask for UUIDs ("Fulfillment warehouse UUID", "Inventory issue UUID", "Vendor party UUID"); credit
memo order and invoice typed as ids; Inventory "Owning organization unit" free text; organization unit default (the
picker needs `organization:read`, which module roles cannot grant); date defaults; create-from (quote → order,
PO → receipt → bill); one-click approvals.
