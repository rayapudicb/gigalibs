# WI-OI-082 — Module SDK: shared plumbing extracted from CMMS and Workforce (Wave 0, C3)

Status: In Progress (sole active item from 2026-09-28)  
Owner: SDLC Orchestrator / Developer Platform / Backend Domain  
Plan: `docs/plans/manufacturing-package-solution-plan.md` §4 C3; ADR-0013 (the SDK is core)  
Independent reviewers: Security & Privacy (relay tokens, tenant binding), Backend/Data, QA/SDET

## G0 — evidence of duplication (measured 2026-09-28)

CMMS (`modules/physical-operations-cmms/apps/api/src`) compared with Workforce (`modules/gigaops/apps/api/src`):

| File | Similarity | Differences | Decision |
| --- | --- | --- | --- |
| `relay/relay-config.ts` | identical apart from names | env names, peer hostname | SDK |
| `relay/outbox-relay.ts` | identical apart from names | lease/settle function names, audience, source, log text | SDK |
| `relay/outbox-retention.ts` | 94% | env prefix | SDK |
| `relay/relay-inbox.guard.ts` | 88% | audience, source, label | SDK |
| `database/database.service.ts` | ~85% | schema, definer names, messages, pool options, tenant binding in 2 vs 1 round trips | SDK |
| `relay/inbox.service.ts` (receipt handling) | receipt block identical apart from names | schema, consumer, source module, code prefix | SDK helper; projections stay in each module |
| `auth/authorization.ts` | 48% | principal shapes, personas, scopes diverged | **Not in v1**: merging would change behaviour |
| `common/command(s).ts` | 22% | CMMS multi-statement vs Workforce single CTE | **Not in v1** |
| `runtime-config.ts` (all 14 modules) | 15–51 shared lines each | different shapes | **Not in v1** |

The plan listed a signed-context guard and an audit/outbox command. The evidence shows they diverged rather
than being copied, so they need their own design and are not extracted here. The sync change feed belongs to
WI-OI-084.

## G1 — acceptance

1. **New core package `@gigalibs/module-sdk`** (`packages/module-sdk`, classified core in
   `config/package-layers.json`) provides:
   - `ModuleDatabase`: pool; tenant-bound transaction (`search_path` and `app.tenant_id`, in the module's
     binding style); readiness (exact schema version, role neither superuser nor BYPASSRLS); allow-listed definer calls;
     context-revocation check; tenant-binding probe.
   - `loadRelayConfig` and `relayOrigin`: Ed25519 key parsing and the peer-origin allow-list.
   - `OutboxRelay` and `deliver`: lease, sign, deliver, settle, back-off and dead letter.
   - `RelayInboxGuardBase`: body-bound relay-token verification and envelope match.
   - `receiveOnce`: inbox receipt de-duplication around a module-supplied apply step.
   - `loadOutboxRetentionConfig` and `OutboxRetention`: bounded sweeps through `outbox_sweep`.
2. **CMMS and Workforce keep their existing class names, constructors, injection tokens, exports and error
   texts** as thin subclasses or wrappers. Every existing unit test passes unmodified.
3. **Behaviour unchanged**, with these two deliberate, stated exceptions:
   - Workforce gains the idle-client pool error handler CMMS already had, so an idle connection failure is
     logged instead of crashing the process.
   - The Workforce readiness log line now includes the migration version, as CMMS's already did.

   Each module keeps its exact tenant-binding statements (CMMS: `SET LOCAL search_path` plus `set_config`;
   Workforce: one combined `set_config`). `cmms-truth-boundary.test.ts` asserts them verbatim.
4. **Live certification** on rebuilt images passes unchanged:
   - CMMS and Workforce runtime;
   - the CMMS ↔ Workforce handshake (ordering, orphans, privileges);
   - the relay outage;
   - outbox retention;
   - Workforce time, and pay and export.
5. **Images:** `infra/compose/docker/pnpm-workspace.yaml` includes the package, the lockfile is updated, and
   scans show 0 Critical and 0 High.

## G2 — design

- **Parameters instead of copies.** Each module passes:
  - its label ("CMMS", "Workforce");
  - its schema;
  - its allow-listed definer functions;
  - pool options: CMMS keeps its 15 s statement timeout and application name; Workforce keeps none;
  - env variable names or prefixes;
  - relay audience and source;
  - log text.

  Messages are composed from these, so existing texts are reproduced exactly.
- **NestJS integration.** Base classes carry the lifecycle hooks (`onModuleInit`, `onApplicationBootstrap`,
  `onApplicationShutdown`). Modules keep `@Injectable()` subclasses with their own `@Inject` tokens, so dependency
  injection and module wiring do not change. Loggers keep the subclass names.
- **Security invariants unchanged.**
  - Tenant ids are validated before binding.
  - Definer calls are limited to each module's allow-list.
  - Relay tokens stay bound to audience, source, tenant, message id and body SHA-256.
  - The peer origin stays restricted to loopback or the peer's Compose service.
- **Tests.** The root Vitest config aliases `@gigalibs/module-sdk` to its source, as it does for other source
  packages. The SDK has its own unit tests for the parameterisation.

## G3 — test plan

1. **Unit.** New SDK tests cover:
   - config messages for two parameter sets;
   - origin allow-list;
   - delivery outcome classification (2xx, permanent 4xx, 408/429, timeout, unreachable);
   - guard rejections;
   - receipt de-duplication;
   - retention bounds.

   The existing CMMS and Workforce relay, retention and inbox tests, and the full suite, pass unmodified.
2. **Build and audits.** Type check and build every workspace package; all repository audits, including
   `audit:layers` with the new core package.
3. **Live.** Rebuild the workforce and module images, deploy only `cmms-api` and `workforce-api` (no schema
   change), then run: `verify-cmms-runtime`, `verify-workforce-runtime`, `verify-cmms-workforce-handshake`,
   `verify-cmms-workforce-relay-outage`, `verify-outbox-retention`, `verify-workforce-time` and
   `verify-workforce-pay`.

## G4 — implementation (2026-09-28)

**New package `packages/module-sdk`** (`@gigalibs/module-sdk`, classified core):
- `ModuleDatabase`;
- `loadRelayConfig` and `relayOrigin`;
- `OutboxRelay` and `deliver`;
- `RelayInboxGuardBase`;
- `receiveOnce`;
- `loadOutboxRetentionConfig` and `OutboxRetentionSweeper`.

**CMMS and Workforce** each keep thin `@Injectable()` subclasses with their own class names, constructors, tokens,
exports and messages. The database, relay config, outbox relay, inbox guard and retention files became wrappers,
and the receipt blocks in the two inbox services call `receiveOnce`. No existing test file was changed.

**Packaging:**
- The SDK declares `@nestjs/common` as a peer dependency (dev copy pinned to 11.2.3 with `reflect-metadata` and
  `rxjs`), so a module image carries one NestJS instance.
- The package is added to `infra/compose/docker/pnpm-workspace.yaml`, the root Vitest aliases and
  `config/package-layers.json`.

## G5 — evidence (2026-09-28)

**Unit and build:**
- The SDK tests, plus the unchanged CMMS and Workforce suites: 32 files, 225 tests.
- Full suite: 218 files and 1,908 tests (previously 217 and 1,897; the difference is the SDK tests).
- All ten repository audits pass, including layers and module manifests.
- Both modules type-check and the SDK builds. The SDK passes lint; module files were formatted only (DI imports
  must stay runtime imports).

**Defect found and fixed during live certification:**
- The first images (`103da75e470e-1690249a0fee`) carried two copies of `@nestjs/common`: 11.2.3 for the app and
  11.2.6 for the SDK. SDK HTTP exceptions were therefore not recognised by NestJS.
- `verify-cmms-workforce-handshake` caught it: a user context sent to the CMMS inbox was still refused, but with
  500 instead of 401.
- Fixed by the peer dependency. The certification now fails if a module image has more than one `@nestjs/common`.

**Live certification** on `workforce-api` and `cmms-api` `103da75e470e-f01b896910a9`, deployed module-only with no
schema change (evidence `infra/compose/evidence/wi-oi-082-20260928T075902Z`):
- 0 Critical and 0 High in both images;
- one `@nestjs/common` instance in each image;
- both services healthy at schema 14;
- 12 of 12 checks pass: CMMS runtime, Workforce runtime, CMMS ↔ Workforce handshake, relay outage, outbox
  retention, Workforce time, Workforce pay, Workforce HTTP, Workforce journey, CMMS HTTP, CMMS journey, and the
  GigaOps web path (via 5190).

## Remaining

- Independent review (Security & Privacy for relay tokens and tenant binding, Backend/Data, QA/SDET).
- Not extracted, and recorded for later design: authorization and signed context (48% similar), the audit/outbox
  command (22%), and runtime configuration (14 differing shapes).
