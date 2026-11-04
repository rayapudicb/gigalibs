# WI-OI-154 evidence — governed master data packs

## In progress (2026-11-04)

**Slice 1 — format (started):**
- Extended `packages/contracts/src/configuration/packs.ts` with WI-OI-154 section schemas (product catalogue, finance, CMMS, tax) and statutory provenance.
- Module manifests declare `spec.pack` layers: `product-catalogue`, `financial-operations`, `physical-operations-cmms`, `tax-configuration`.
- **Manufacturing** industry pack: units, categories, asset classes, work order types, absence types.
- **India** country pack: fiscal year (April–March), starter chart slice, payment terms, GST structure (rates null pending owner tax review), GSTIN format.

**Slice 2 — product-catalogue `pack.apply` (2026-11-04):**
- Migration `000003_product_catalogue_pack_sections.up.sql`, `POST product-catalogue/v1/pack/apply`, kernel `product-catalogue.pack-apply` job.
- Applies industry pack units/categories by code (skips existing); audit `CATALOGUE_PACK_APPLIED`.

**Slice 2b — CMMS `pack.apply` (2026-11-04):**
- Migration `000035_cmms_pack_sections.up.sql`, `POST v1/pack/apply`, kernel `physical-operations-cmms.pack-apply` job.
- Applies industry asset classes by code; stores work order types in `pack_sections`; audit `CMMS_PACK_APPLIED`.

**Not built yet (card steps 2–5, remainder):**
- Handlers for financial-operations, tax-configuration, gigaops absence types; pack key columns on rows.
- Generic baseline country pack; remaining countries in §4.3 order.
- UI: "Load from pack" replacing hard-coded `STARTER_CHART` / `STARTERS`; hub pack column.

## Verification

- Run after handlers land: `pnpm verify`, `pnpm exec vitest run packages/contracts/src/configuration/packs.test.ts`

## Owner

- Name **reviewedBy** on India tax and chart entries before On UAT (placeholders in `solutions/packs/country/in.yaml`).
