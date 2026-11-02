# WI-OI-143 evidence: M-CONTR contractor field safety pass

Card: `.pi/tasks/WI-OI-143.md`. Branch `feat/frontline-suite` (worktree `gigalibs-rounds`); mobile in `gigalibs_mobile`.

## Status

**Built** (2026-11-02). Platform core `1db87eee` plus migration **4** and verify hygiene in working tree; `pnpm verify` PASS. Owner UAT and optional PG/device proof before **Done**.

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

- PostgreSQL proof run with `SAFETY_OPERATIONS_PG_URL` (includes enroll replay case).
- Device QR scan journey (camera) vs manual pass id/secret entry.
- Owner UAT on single-suite deploy.

## 2026-11-02 checkpoint (WI-OI-143 `/next`)

- **Migration 4** `000004_contractor_enroll_idempotency`: `enroll_client_operation_id` + unique `(tenant_id, enroll_client_operation_id)`; service replays enroll on `clientOperationId` before `platform_user_id` shortcut.
- **Static conformance:** `pnpm module:conformance safety-operations` — S1–S15 with **4** migrations; `modules.json` migrationVersion **4**.
- **Mobile (`gigalibs_mobile`, uncommitted):** exported contractor DTO types from `mobile-contracts`; fixed `mobile-feature-contractor` tsconfig + screens to match `Button`/`ServiceProblemPanel` patterns; `@gigalibs/mobile-api` and contractor feature **typecheck pass**.
- **BFF tests:** `packages/auth-nest/src/mobile/mobile-contractor.spec.ts` — 2/2 pass.
- **Verify:** `pnpm verify` PASS (2026-11-02); log `/tmp/verify-143.log`.
