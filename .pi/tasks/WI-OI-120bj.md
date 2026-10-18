# WI-OI-120bj: Remove the AR invoice page's fake "Cryptographic Audit Verified"

- **Status:** On UAT (2026-10-18, web tag `1d8d2634b8f2-c6148e918ff0`)
- **Work item:** WI-OI-120 (zero-mock rule, plan v3 step 0.4 follow-up). Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** S

## Goal

No screen claims a verification it did not make.

## Finding (WI-OI-120bh review, 2026-10-18)

`apps/workflow-platform/app/(app)/ar/invoices/[invoiceId]/page.tsx:158-167` (`handleAuditSeal`, from 2026-09-14) waits
450 ms and then always reports: "FIPS 180-4 Cryptographic Audit Verified: SHA-256 hash matches … chains back to genesis
root". Nothing is checked. The zero-mock sweep (WI-OI-120ak) missed it.

The AR API is not deployed, so the page is very likely unreachable with real data. Even so, 17 active UAT workspaces
have AR enabled (read-only check, 2026-10-18).

## Scope

- **May change:**
  - the AR invoice page: remove the fake verification and its button;
  - show the seal's own stored fields (hash, sequence) as data, with no "verified" claim;
  - a web test that no screen claims verification without a server check (search the web app for similar timer-based
    "verified" results, and list any others found on this card).
- **Must not change:** the AR module (contained, M-AR0); other sessions' files; secrets.

## Done when

- [x] No "verified" claim without a server check on the AR invoice page; repo scan finds no other `Cryptographic Audit Verified` string.
- [x] `apps/workflow-platform/__tests__/zero-mock-verification-claims.test.ts` guards the invoice page.
- [ ] Owner deploy web with Phase 1 release; record in `.pi/work/WI-OI-120.md`.

## Built (2026-10-18)

- Removed `handleAuditSeal` timer, fake hash prefix, and “Audit Hash Chain Integrity” / “TAMPER-EVIDENT SECURED” claims.
- Seal panel shows API-stored hash, previous pointer, sequence, and sealed time only when `invoice.seal` or `invoice.sealHash` exists.
