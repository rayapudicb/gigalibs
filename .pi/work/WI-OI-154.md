# WI-OI-154 evidence — governed master data packs

## In progress (2026-11-04)

**Slice 1 — format (started):**
- Extended `packages/contracts/src/configuration/packs.ts` with WI-OI-154 section schemas (product catalogue, finance, CMMS, tax) and statutory provenance.
- Module manifests declare `spec.pack` layers: `product-catalogue`, `financial-operations`, `physical-operations-cmms`, `tax-configuration`.
- **Manufacturing** industry pack: units, categories, asset classes, work order types, absence types.
- **India** country pack: fiscal year (April–March), starter chart slice, payment terms, GST structure (rates null pending owner tax review), GSTIN format.

**Not built yet (card steps 2–5):**
- Kernel `pack.apply` handlers in each module API (idempotent create, pack key on rows, skip edited).
- Generic baseline country pack; remaining countries in §4.3 order.
- UI: "Load from pack" replacing hard-coded `STARTER_CHART` / `STARTERS`; hub pack column.

## Verification

- Run after handlers land: `pnpm verify`, `pnpm exec vitest run packages/contracts/src/configuration/packs.test.ts`

## Owner

- Name **reviewedBy** on India tax and chart entries before On UAT (placeholders in `solutions/packs/country/in.yaml`).
