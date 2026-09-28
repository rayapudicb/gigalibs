# WI-OI-046 TP-1 pre-Build collision audit

Date: 2026-09-23  
Status: Review evidence only; no product-code authority

## Result

The WI-OI-046 candidate map remains stable after WI-OI-047 technical closure. Thirteen product/API/web
candidates are byte-identical to the 2026-09-22 G3 checkpoint. Two Local Development Compose files changed
through WI-OI-047 as expected. The two Helm candidates are unchanged but excluded from the current local
TP-1 scope because customer-managed and cloud deployment remain `DEFERRED_EXTERNAL`.

The exact current hashes are in
`docs/reviews/WI-OI-046-g3-prebuild-candidate-manifest-2026-09-23.sha256`.

## Drift classification

| Candidate group | Current state | Collision decision |
| --- | --- | --- |
| API module/controller/service | Modified before WI-OI-046; hashes unchanged | High overlap; new focused providers plus minimal import/injection/route hunks only |
| Configuration contracts and exports | Modified before WI-OI-046; hashes unchanged | High overlap in configuration schema, low overlap in export indexes; no wholesale rewrite |
| `ConfiguredTenantFields.tsx` | Tracked with no diff; hash unchanged | Preferred minimal normal-runtime caller change after authorization |
| Studio mode/workbench | Large pre-existing diffs; hashes unchanged | High overlap; only exact runtime caller and explicit activation controls may change |
| OpenAPI | Large pre-existing diff; hash unchanged | Patch only affected paths/schemas; no regeneration or reformatting |
| Root `.env.example` | Tracked with no diff; hash unchanged | Use only if the accepted config authority requires it; no secret value |
| Local Compose files | Untracked; hashes changed under WI-OI-047 | Re-review current bytes at Build entry; add only the accepted required environment key |
| Helm files | Untracked; hashes unchanged | Excluded from current Local Development TP-1; external-profile work item required |

## Current semantic collision points

The application still contains the exact defect TP-1 is intended to remove from the normal Tenant Profile
path:

- `ActivateConfigurationSchema` and `ConfigurationRuntimeQuerySchema` default to `local-uat` and
  `all-users`;
- the current runtime controller exposes only `GET /configuration/runtime/manifest` with client query
  scope;
- `ConfiguredTenantFields.tsx` and `StudioMode.tsx` send the two hard-coded values from the browser;
- the workbench initializes visible explicit activation controls with those local values; and
- the service has other local-scope literals outside the bounded Tenant Profile normal-runtime path.

TP-1 must remove schema omission defaults, make normal Tenant Profile runtime scope server-owned and keep
explicit administrative preview/activation distinct. It must not claim to remediate every Configuration
consumer. Every out-of-scope literal remains recorded debt for its owning slice.

## Safe patch boundary after authorization

1. Put descriptor, registry, Tenant Profile adapter and scope resolution in focused new files.
2. Limit existing API changes to provider registration, injection, exact delegation and the three accepted
   runtime/compatibility/preview route semantics.
3. Limit web changes to the Tenant Profile normal-runtime caller and complete visible error/accessibility
   states. Preserve explicit Studio activation controls.
4. Patch only the exact contract/OpenAPI nodes; do not regenerate or format the full files.
5. Patch the current Local Development Compose profile only. Do not edit Helm/cloud/customer-managed
   profiles under WI-OI-046.
6. Re-hash every candidate immediately before the first authorized product hunk. Any mismatch requires a
   fresh semantic diff review.

## Gate

This audit satisfies only the fresh collision-inspection portion of pre-flight preparation. WI-OI-046
remains `Proposed`. ADR/D1–D6 acceptance, named specialist decisions, accepted QA evidence paths and the
explicit Ready/sole-Build transition remain mandatory before product code.
