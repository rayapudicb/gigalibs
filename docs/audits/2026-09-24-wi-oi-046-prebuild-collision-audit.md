# WI-OI-046 TP-1 refreshed pre-Build collision audit

Date: 2026-09-24  
Status: agent-executable pre-flight complete; no product-code authority

## Result

All 15 proposed API, contract, web and deployment candidates are byte-identical to the September 23
checkpoint. The WI-OI-042 Department schema-contract correction and its review reconciliation did not
change a TP-1 candidate file. The exact current hashes are in
`docs/reviews/WI-OI-046-g3-prebuild-candidate-manifest-2026-09-24.sha256`.

The first authorized product hunk must still re-hash every candidate. Existing files carry substantial
user work, so TP-1 must use focused new providers/contracts plus minimal integration hunks; it must not
rewrite or reformat whole files.

## Current collision decisions

| Candidate group | Disposition at an authorized Build entry |
| --- | --- |
| API module/controller/service | High overlap; focused provider registration, injection and exact route/delegation hunks only |
| Configuration contracts/exports | Add strict TP-1 schemas and minimal exports; preserve current response contracts |
| `ConfiguredTenantFields.tsx` | Preferred bounded normal-runtime caller and visible-state change |
| Studio mode/workbench | Preserve explicit administrative activation controls; no broad redesign |
| OpenAPI | Patch only new/affected schemas and paths; no whole-file regeneration |
| Local Compose | Add only the accepted fail-fast environment input; never add a secret/default fallback |
| Helm/cloud/customer-managed | `DEFERRED_EXTERNAL`; excluded from TP-1 |

## Remaining semantic defect

The product still has the exact behavior TP-1 is designed to remove:

- normal Tenant Profile runtime scope is browser-supplied/hard-coded as `local-uat` and `all-users`;
- the registered surface is an inline list rather than an accepted code-owned adapter descriptor;
- the normal current-runtime response does not carry separately versioned server-resolved scope evidence;
  and
- absent, denied and dependency-error UI states can disappear behind a `null` render.

No product correction was made because WI-OI-046 remains `Proposed` and no G4 item is active.

## Source/evidence boundary

The exact 15-file candidate manifest is the authoritative pre-Build collision identity. A whole-context
source-state hash is intentionally deferred until authorized Build entry because writing this evidence and
reconciling governance changes that working-tree fingerprint. The earlier WI-OI-042 replacement images
remain immutable predecessor evidence bound to source state
`7185c069c64026c17fb58ed02636b3304ab48e56711a92d150f0969034517fc5`; they are not TP-1 images. An
authorized TP-1 build must create new source-bound images and certification evidence.
