# WI-OI-143 evidence: M-CONTR contractor field safety pass

Card: `.pi/tasks/WI-OI-143.md`. Branch `feat/frontline-suite` (worktree `gigalibs-rounds`); mobile in `gigalibs_mobile`.

## Status

In progress (2026-11-02). Core stack wired; full `pnpm verify` and owner UAT not yet recorded.

## Ownership

Safety Operations (`safety-operations`) per ADR-0035: companies, workers, induction quiz, revocable pass secrets (hashed), gate check-in, escort, roster. Spend-management hour sync and COI document upload remain follow-ups (not implemented).

## Implemented (this slice)

- **Contracts:** `packages/contracts/src/frontline/contractor.ts` (+ unit tests).
- **DB:** migration `000003_contractor_pass` (RLS; partial unique index for one active pass per worker).
- **API:** `ContractorsService` + `ContractorsController`; permissions `safety-operations.contractors.{admin,worker,gate,escort,roster}`; catalogue regenerated.
- **Web:** Safety workspace **Contractors** tab (`ContractorCompliance.tsx`, `safety-api` routes).
- **Mobile BFF:** `MobileContractorController`, `/mobile/v1` routes in `mobile-bff.ts`, session module key `contractor`.
- **Mobile app:** `@gigalibs/mobile-feature-contractor`, contracts adapter, operations routes `/contractor/*`.
- **Tests:** `mobile-contractor.spec.ts`; `contractors.pg.test.ts` (opt-in `SAFETY_OPERATIONS_PG_URL`).

## Gates still open

- Full suite `pnpm verify` (no new failures).
- PostgreSQL proof run with `SAFETY_OPERATIONS_PG_URL`.
- Device QR scan journey (camera) vs manual pass id/secret entry.
- Enroll idempotency on `clientOperationId` (currently idempotent by platform user only).
- Owner UAT on single-suite deploy.
