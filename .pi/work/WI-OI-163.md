# WI-OI-163 evidence — record-level available actions (one answer for web and mobile)

## 2026-11-03 — built (queue item 7, claimed by Claude)

**Built:**
- Contract `RecordActionOfferV1` / `RecordActionOffersV1` (`packages/contracts/src/records/index.ts`): per action,
  offered or not, the refusal code and the plain-words reason.
- Module SDK: `RecordActionOffer`; an adapter may answer `offers(principal, id, record)` for all its actions at once (one
  read of what the guards need — a departure from the card's per-action `offer()`, to avoid one read per action);
  `RecordDispatcher.offers()` checks the read permission, answers 404 for a record the person cannot read, refuses an
  action whose permission the person lacks (`RECORD_PERMISSION_DENIED`), takes the adapter's answer for the rest, and
  offers an action the adapter does not mention (as before). Route `GET v1/records/{entity}/{id}/actions`, added to the
  generated gateway of all ten modules that expose records (`records: true`).
- CMMS work orders: `work-order-offers.ts` — one pure rule for start, hold, resume, complete, cancel and sign-off that
  mirrors the commands: the transition table, execute-own only on one's own assigned work (a writer executes any), the
  LOTO interlock (start needs a live permit, completion needs every permit closed), nothing after sign-off, and the
  completer cannot sign off. `WorkOrdersService.actionFacts` reads who completed the work and the permit counts for a work
  order the person may see. The commands keep every check of their own.
- Web: `RecordClient.offers` (optional, so older clients still work); the record screen reads the offers whenever the
  record's version moves, shows only offered actions, and lists why each action the person would otherwise have is not
  possible now (a missing permission stays hidden, as before); without offers it behaves as before.

**Tests:** dispatcher offers (permission refusal, the adapter's reason, unmentioned actions offered, no adapter call
without a permitted action, 404 and 403); work-order offers for every guard, including "the completer is not offered
sign-off and another supervisor is" with the command's code `CMMS_SIGN_OFF_FOUR_EYES`; a drift guard that every code
the offers use is a code the commands throw; web `offeredActions` and the client route. Module SDK and CMMS tests 397
pass; record screen tests 22 pass; existing CMMS command tests unchanged.

**Mobile:** the same route answers the phone; `/mobile/v1` exposes it with WI-OI-164 (my work orders), which uses these
offers for its buttons. WI-OI-169 adds "booked for me" to the execute-own rule (offers and commands together).

**Verification:** `pnpm verify` PASS (19 steps) after adding the offers route to the CMMS gateway test's list of SDK
record routes (`cmms-gateway-screens.test.ts`); compiled CMMS app module loads under Node. Status: **Built**.
