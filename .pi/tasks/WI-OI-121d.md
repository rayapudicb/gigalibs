# WI-OI-121d: Universal Tool Calling & Dynamic Generative UI Dispatcher

> **Withdrawn, 2026-10-14.** The Assistant preview was reverted from the branch (WI-OI-120aj, execution plan v3 step 0.3)
> and was never deployed. GU1–GU7 in `docs/plans/gigalibs-execution-plan-v3.md` replace it. Every claim below of Done,
> G5–G7, production readiness or release is withdrawn; this file is kept as a record.

- **Status:** Replaced by GU1–GU7, steps 1.4–1.10 (plan v3 §5; step 0.6, 2026-10-15). Withdrawn 2026-10-14 (WI-OI-120aj). Was: Done (2026-10-09)
- **Work item:** WI-OI-121 (its row in `.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-OI-121.md`.
- **Size:** M

## Goal
Implement a domain-agnostic Universal Tool Calling architecture and tool-name driven Generative UI dispatcher. Replace brittle keyword/substring branches with structured tool definitions, model tool resolution, tenant-scoped module execution, and dynamic card rendering across all operational archetypes.

## Scope
- **May change:** 
  - `apps/workflow-platform/lib/assistant-tool-registry.ts` (create)
  - `apps/workflow-platform/app/api/gigalibs-assistant/[...path]/route.ts`
  - `apps/workflow-platform/components/assistant/GigaLibsAssistantDrawer.tsx`
  - `apps/workflow-platform/app/(app)/assistant/page.tsx`
  - `apps/workflow-platform/components/assistant/ClaudeStyleMessageRenderer.tsx`
- **Must not change:**
  - `packages/db/schema.prisma` or database migrations
  - CMMS or Workforce backend business logic
  - Existing service port configurations (5180, 3333, 4200, 4700)

## Read first
- `.pi/NOW.md`
- `docs/plans/gigalibs-assistant-self-hosted-implementation-plan.md`
- `apps/workflow-platform/lib/signed-module-proxy.ts`
- `apps/workflow-platform/lib/llm-inference.ts`

## Steps
1. Create `apps/workflow-platform/lib/assistant-tool-registry.ts` defining structured operational tool schemas (Asset Search, Daily Inspections, System Health, Analytics Reporting, Work Order Creation, Emergency Dispatch, Stock Inquiry).
2. Implement semantic tool routing and execution in `apps/workflow-platform/app/api/gigalibs-assistant/[...path]/route.ts`:
   - Connect to local LLM or semantic intent matcher.
   - Dispatch tool execution through `callSignedModule` with verified session context.
   - Stream AG-UI SSE events (`TOOL_CALL_START`, `TOOL_CALL_RESULT`, `TEXT_MESSAGE_*`).
3. Connect tool-driven Generative UI dispatching in `GigaLibsAssistantDrawer.tsx` and `/assistant/page.tsx` via `toolRenderers`.
4. Rebuild Next.js platform and verify all platform audits with `pnpm verify --audits`.
5. Restart the Next.js daemon and verify live functionality.

## Done when
- [x] Prompts with diverse natural language phrasing execute corresponding tools and render interactive Generative UI cards.
- [x] No regression on existing 22 card archetypes.
- [x] `pnpm verify --audits` passes cleanly.
- [x] `.pi/NOW.md` is updated.

## Stop and ask if
- A decision is needed that changes database schema or cross-tenant isolation boundaries.

## Report
At most five bullets: what changed, the evidence, what's next, and what the owner must decide.
