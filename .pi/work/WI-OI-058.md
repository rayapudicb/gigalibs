# WI-OI-058 — Universal five-pixel module viewport gutter

Status: Review  
Profile: bounded Local Development  
Requirements: NFR-UX-001, NFR-UX-002

## Outcome

Use the authenticated application workspace efficiently by limiting every module's outer left and right
gutter to exactly five pixels, without removing the internal padding of bordered cards and forms.

## Acceptance contract

- The shared authenticated app and Studio layouts own the module gutter; individual modules do not
  duplicate it.
- The outer module viewport uses `5px` left and right padding at every screen breakpoint.
- Legacy page-level width caps and unbordered wrapper padding do not add unused outer real estate.
- Bordered cards and forms retain their internal padding.
- Print output has no screen-only five-pixel gutter.
- A regression test protects the shared boundary and exact value.

## Implementation evidence

- `apps/workflow-platform/app/(app)/layout.tsx` and `apps/workflow-platform/app/(studio)/layout.tsx` mark
  the canonical authenticated module and Studio viewports.
- `apps/workflow-platform/app/globals.css` enforces the shared five-pixel gutter and wrapper normalization.
- `apps/workflow-platform/__tests__/module-content-gutter.test.ts` verifies the contract.
- `infra/compose/docker/pnpm-workspace.yaml` no longer includes the quarantined
  `@gigalibs/data-import-export-react` package that the canonical workspace and Docker build filters both
  exclude; this restores frozen-lockfile image builds without changing dependency versions.

## Verification

- Focused Vitest contract: PASS, 1 file / 4 tests.
- Workflow-platform TypeScript check: PASS.
- Optimized Next.js production build: PASS, 138 routes generated.
- Replacement non-root image:
  `gigalibs/workflow-platform:5abfa667bb10-154a1094ad0c`
  (`sha256:0784d10b51b758ffce147e9e25967c261be92861271bdc2a91a6fb1ad3b1378c`),
  source-state `154a1094ad0cec8076f114f1b41a6ca95c143442075baff3b520ec309b28abb4`,
  runtime user `65532:65532`.
- Image and live readiness: PASS; web and control-plane readiness returned HTTP 200.
- Authenticated Chrome measurements at 1024px, 1440px and 1890px: PASS; computed left/right padding was
  exactly `5px` with no horizontal overflow.
- Representative `/modules`, `/analytics`, `/reports`, `/connections`, `/settings`, `/configuration` and
  `/ar` routes: PASS; every route returned HTTP 200 and inherited the exact shared gutter.
- `/studio/configuration` is covered by the same marker through the separate authenticated Studio shell;
  the production build and two-shell regression contract pass.
- Mandatory static audits: PASS for production data, all runtime data, package dependencies, API
  boundaries, navigation and SDLC governance.
- Full repository Vitest baseline: 164 of 178 files and 1,384 of 1,426 tests passed. The remaining 14
  files / 42 failures are pre-existing or out-of-scope Analytics, CMMS and privacy portability failures;
  none exercise or fail the WI-OI-058 shared module-gutter contract.

## Limits

This slice changes only authenticated module page geometry. It does not alter authentication pages,
sidebar width, top-header spacing, internal card spacing, data behavior, permissions, persistence, cloud,
or production-release status.
