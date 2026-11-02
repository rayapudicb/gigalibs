# WI-OI-144: M-CHAT Work-order chat (Communications extension, web and mobile)

- **Status:** Approved (owner, 2026-11-02: complete all twelve frontline products for single deploy); Proposed → start after WI-OI-143 slice 1 on `feat/frontline-suite`.
- **Work item:** WI-OI-144. Evidence: `.pi/work/WI-OI-144.md`. Spec: `docs/products/mobile-suite/08-work-order-chat-ptt.md`; ADR-0035.
- **Size:** L

## Goal

Deliver M-CHAT v1 for frontline deploy: WO-scoped threaded chat (text + photo + voice memo metadata), membership from CMMS work-order scope, retention and export for RCA — on the **Communications** module authority. Live WebRTC PTT is explicitly **out of v1** unless a separate ADR approves it; v1 ships text/media threads with server-enforced membership.

## Scope

- **May change:** `modules/communications` (or Textfly boundary per ADR reconciliation), contracts, CMMS WO reference projection, mobile BFF, `gigalibs_mobile` (`mobile-feature-chat`), web moderation UI.
- **Must not change:** CMMS work-order writes from chat; mock message stores.

## Done when

- [ ] Create/list/post messages on a WO thread with permission + unit scope; media via classified storage references.
- [ ] Mobile + web + BFF parity; `pnpm verify` and mobile gates clean (no new failures).
- [ ] PTT/WebRTC listed as deferred in evidence unless owner expands scope.
