# WI-OI-135: M-TAG Asset tagging and field commissioning (CMMS extension, web and mobile)

- **Status:** Approved (owner, 2026-11-01: "continue all the modules without my intervention implement everything");
  In progress on `feat/frontline-suite`.
- **Work item:** WI-OI-135. Evidence: `.pi/work/WI-OI-135.md`. Spec: `docs/products/mobile-suite/11-asset-tagging-gis-commissioning.md`;
  plan §3 (CMMS owns asset creation/commissioning; Geospatial owns places; OCR assistive and confirmed; a tag write
  failure never creates a second asset).
- **Size:** L

## Goal

A field technician commissions a new asset from the floor (nameplate fields, a physical tag, its space and parent);
a different reviewer approves it into the register, or links it to an existing asset; and a floor walk audit shows
which registered assets were seen, missing, relocated, and which tags are unknown.

## Ownership record

- **Writer:** CMMS. Reconciliation: CMMS assets carry `asset_tag` (business identifier), serial, manufacturer, model,
  parent, site, space, classification and specs. No physical-tag binding, commissioning intake or audit walk exists.
  Product Catalogue model matching is out of scope (manufacturer/model stay text).
- **Data (CMMS migration 28, additive):** `asset_physical_tags` (one active binding per tag kind and value; an asset may
  carry several; retire with reason); `asset_commissioning_requests` (client operation id, proposed fields, optional
  coordinates, confirmed nameplate text, tag, duplicate candidates found at submit, decision by a different user,
  created or linked asset); `asset_audit_walks` and `asset_audit_sightings` (append-only sightings, idempotent per
  client operation id). Forced tenant RLS; scope from site, department and space.
- **Rules:** submit refuses a tag that is already bound (409). Approval creates the asset (through the CMMS asset
  writer) and binds the tag in one transaction, or links the tag and location to an existing asset; a tag bound in the
  meantime refuses the approval. Reviewer ≠ submitter (DB check). A finished walk's report: seen, missing (registered
  in the walk's space or site, not sighted), relocated (sighted in another space), unknown tags.
- **Permissions:** `cmms.commissioning.read|submit|approve`, `cmms.audits.read|execute`; tag binding by
  `cmms.assets.write`. Technician: commissioning read+submit, audits read+execute. Planner: commissioning
  read+approve, audits read. Viewer: commissioning and audits read.
- **Mobile:** `/mobile/v1/commissioning/...` (context, submit, tag resolve, walks); feature `commissioning`.

## Gates

On-device nameplate OCR (needs a native vision capability pack and device proof) — today the technician confirms
typed or pasted nameplate text; GPS capture (no location capability pack yet; indoor placement by space); offline
persistence (shared encrypted journal); physical NFC/DataMatrix device proof; owner UAT.
