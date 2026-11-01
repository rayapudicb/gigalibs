# ADR-0035: Frontline mobile suite product and domain boundaries

- **Status:** Proposed for independent Architecture and Security review. The owner subsequently approved the separate WI-OI-133 M-RND build on 2026-10-30. Runtime certification still follows the module gate.
- **Work items:** WI-OI-132 (suite boundaries), WI-OI-133 (M-RND implementation); [suite plan](../plans/frontline-mobile-suite-implementation-plan.md).
- **Builds on:** ADR-0001 (one authority), ADR-0007 (module outbox/inbox relay), ADR-0016 (kernel and capability boundaries), ADR-0018 (tenant, organization and place scope), ADR-0033 (governed metadata and domain actions), execution plan v3 §5–7.
- **Required reviewers:** independent Solution Architecture, Security & Privacy, Backend/Data, CMMS and Workforce domain owners, Product.

## Context

The 12 mobile product specs describe valuable frontline journeys but their diagrams do not prove that named endpoints, tables, brokers or safety controls exist. The owner's earlier 19-module list is a historical inventory, while the current generated catalogue and manifest set contain more entries. Product codes therefore cannot be treated as one-to-one service names.

The first suite draft proposed a Safety Operations owner for LOTO and a Frontline Operations owner for handover. Reconciliation with execution plan v3 and WI-OI-108 shows permits assigned to **CMMS M-CM2** and handovers to **Workforce M-WF3**. Those accepted owners must be reused. CMMS EAM-003 also covers maintenance manuals/job plans, so the visual SOP design must avoid duplicating their authority.

## Decision direction

1. **Products and runtime modules are distinct.** All 12 keep their product/journey identifiers. They may be experiences on existing modules; a new runtime module is introduced only after a separate owner and catalogue decision. All existing modules also need mobile-first task journeys where their roles work in the field.
2. **Existing authoritative owners remain:** CMMS for assets, maintenance requests, work orders, permits in M-CM2, calibration, fleet inspections, commissioning and asset-specific diagrams; Workforce for shifts, worker roster, qualifications and handovers in M-WF3; Communications for messages; Inventory for ATP and reservations; Product Catalogue for part/model definitions; Geospatial for places; control plane for identity/entitlements/settings. M-RND may store only route-specific assignment references to Workforce people, not a second worker master or shift roster.
3. **Residual new contexts are narrow proposals.** WI-OI-133 assigns Operator Inspection Rounds to its own M-RND module in Frontline Operations; CMMS remains the asset/meter/work-order owner. General operating SOPs remain a separate boundary decision after checking CMMS/Knowledge scope. Safety Operations may own incidents and contractor site access after checking SPEED, Workforce compliance and Business Partner/Procurement ownership. This ADR alone does not certify a schema, manifest or entitlement.
4. **No duplicated source of truth.** A multi-domain product composes data through the BFF and sends authorized commands to its writer. Cross-module effects use versioned outbox/relay/inbox contracts and visible reconciliation. The mobile BFF has no direct business-table writes.
5. **Server authority governs offline actions.** Offline drafts/readings may queue with identity, scope/config version and idempotency keys. Permit activation/release, equipment clearance, contractor access and signature approval require fresh online authority or a separately approved emergency procedure, and never display success before server acknowledgement.
6. **Build order:** design contracts, then each owner's schema/API/events, then governed admin configuration, then mobile UI/offline behavior, then full verification and module-completion commit. WI-OI-133 authorizes this sequence for the complete M-RND module. It does not authorize a global pass across all 12 backends before any mobile work.

## Product-to-owner reconciliation

| Product | Proposed writer of its primary record | Existing dependency or unresolved boundary |
| --- | --- | --- |
| M-RND | Frontline Operations, M-RND module (WI-OI-133) | CMMS meter/WO, Workforce shift, Analytics facts through contracts. First complete build in this suite. |
| M-LOG | Workforce M-WF3 for handover | Operational notes/bypass ownership must be resolved without a second handover store. |
| M-CAL | CMMS | eSignature evidence and standards validity require reviewed contracts. |
| M-LOTO | CMMS M-CM2 | CMMS WO interlock, safety policy and SPEED distinction. |
| M-INC | Safety Operations candidate | CMMS remediation, notifications, jurisdiction-specific reporting. |
| M-DVIR | CMMS | Workforce credential projection, grounded-state invariant. |
| M-CONTR | Safety Operations candidate | Business Partner/Procurement vendor, Workforce qualification and Geospatial place. |
| M-CHAT | Communications | CMMS WO reference, Workforce membership, media. |
| M-REQ | CMMS | Public gateway/BFF capability, requester privacy and abuse control. |
| M-SOP | CMMS for maintenance job plans/manuals; Frontline Operations candidate for general operating SOPs | One published revision authority per SOP type; existing Documents/Knowledge scope to reconcile. |
| M-TAG | CMMS | Product Catalogue match and Geospatial place reference. |
| M-BOM | CMMS for asset-specific diagram mapping; Inventory for reservation | Product Catalogue part definition; engineering-content owner to confirm. |

## Consequences and remaining decisions

- The 12 specs and this ADR do not imply runtime capability. WI-OI-133 separately authorizes M-RND schema, API, manifest, admin and mobile implementation; its catalogue stays PLANNED until the completion gate passes.
- M-CM2 and M-WF3 remain in their existing plans. Detailed lifecycle and ownership decisions for M-LOG notes/bypasses, general SOPs, incident records and contractor site access require review before build cards.
- Security and domain review must establish exact online/offline safety rules, anonymous QR capability policy, media retention and shared-device purge behavior.
- M-RND's WI-OI-133 card proposes the first Frontline Mobile Suite delivery after fixed group 12. The owner deploys; agents do not. Other suite products need their own build cards and release position.
- **Equipment readings for WI-OI-133 (owner clarification, 2026-10-30):** use CMMS meters as the asset-level source of truth; the existing IoT Gateway can feed those meters through its relay. Rounds may show a timestamped, attributed CMMS meter snapshot as context, while the operator's physical inspection and manual reading remain a separate record. Do not copy telemetry into an operator reading or call a stale offline snapshot current. The first Rounds release does not require handheld BLE probes. An exact vendor protocol and tested device are prerequisites for any later BLE adapter. Plant geofencing is not proof of presence at a specific indoor asset; NFC or barcode scan remains the checkpoint method.
- **Schedule ownership for WI-OI-133:** M-RND stores a published route's cadence, window length and route-specific list of Workforce resource/user references. Workforce remains authoritative for the active person, position, work-unit, shift/working slot, absence and site closure. One-date daily/weekly generation rechecks that signed Workforce authority for each assignment and uses a stable request key; automatic and per-shift generation still require completed orchestration and Workforce shift-window discovery.
- **Native Rounds adapter decision (WI-OI-133):** use the mobile repository's Expo SDK 57 line with [`expo-sqlite` SQLCipher](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/) for the partitioned offline journal and [`expo-camera`](https://docs.expo.dev/versions/v57.0.0/sdk/camera/) for barcode/photo capture. The SDK 57 references recommend `~57.0.4` and `~57.0.6` respectively. SQLCipher requires a rebuilt native binary; the adapter queries `PRAGMA cipher_version` and refuses offline capture when absent, because an unsupported `PRAGMA key` can silently leave ordinary SQLite unencrypted. Hold the database key in device-only secure storage, exclude database and staged media from backup, and prove key loss/purge/restart on physical devices. The mobile source now pins [`react-native-nfc-manager` 4.2.0](https://github.com/revtel/react-native-nfc-manager/releases/tag/v4.2.0) and contains a fail-closed NFC scan adapter; a typed tag or geofence never counts as NFC scan evidence. NFC UIDs and printed codes identify tags but are not anti-clone secrets, so the product must not promise tamper-proof presence from these scans alone. The encrypted journal and backup-excluded native directory exist in source, but signed-device compilation and physical proof remain absent; the Rounds mobile feature stays disabled.
