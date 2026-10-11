# WI-OI-121e: Production Sovereign Assistant: Local LLM, Live Backend Tools & PostgreSQL Persistence

- **Status:** Done (owner verified, 2026-10-10)
- **Work item:** WI-OI-121 (its row in `.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-OI-121.md`.
- **Size:** L

## Goal
Promote GigaLibs Assistant from an architectural preview to a genuine, production-grade operational AI assistant:
1. Install Ollama and pull `llama3.2` locally for real, zero-egress, streaming LLM text generation.
2. Wire operational tools in `route.ts` to live backend microservice endpoints (`cmms_create_work_order`, `inventory_check_stock`, `platform_get_module_health`).
3. Implement PostgreSQL conversation persistence using Prisma `ChatChannel` and `ChatMessage` models.

## Scope
- **May change:** 
  - Host environment (install Ollama CLI, start service, pull `llama3.2`)
  - `apps/workflow-platform/app/api/gigalibs-assistant/[...path]/route.ts`
  - `apps/workflow-platform/app/api/assistant/threads/route.ts` (create thread persistence API)
  - `apps/workflow-platform/components/assistant/DailyInspectionChecklistCard.tsx`
  - `apps/workflow-platform/lib/llm-inference.ts`
- **Must not change:**
  - `packages/db/schema.prisma` structure or core migrations
  - CMMS or Workforce backend business logic

## Read first
- `.pi/NOW.md`
- `docs/plans/gigalibs-assistant-self-hosted-implementation-plan.md`
- `packages/db/schema.prisma` (ChatMessage & ChatChannel lines 3126-3146)
- `apps/workflow-platform/lib/signed-module-proxy.ts`

## Steps
1. Install Ollama via Homebrew, start the background server, and pull `llama3.2`.
2. Connect `route.ts` streaming to `http://127.0.0.1:11434/v1/chat/completions` with streaming token piping.
3. Wire real CMMS work order creation and inventory parts queries using `callSignedModule`.
4. Implement PostgreSQL chat message persistence in `route.ts` using Prisma `ChatMessage`.
5. Verify build, run `pnpm verify --audits`, and verify live conversation end-to-end.

## Done when
- [x] Ollama `llama3.2` generates unscripted, dynamic streaming text via `http://127.0.0.1:11434`.
- [x] Tools create real work orders and query real parts inventory in PostgreSQL.
- [x] Chat messages persist across browser reloads.
- [x] `pnpm verify --audits` passes with zero audit regressions.
- [x] `.pi/NOW.md` is updated.

## Stop and ask if
- A decision is needed that changes database schema or cross-tenant isolation boundaries.

## Report
At most five bullets: what changed, the evidence, what's next, and what the owner must decide.
