# WI-OI-120o (T1a): automatic worker-link on invitation acceptance

- **Status:** Deferred (owner direction, 2026-10-24) — needs a cross-service identity-delivery design; the journey blocker it targets is already fixed by B1.
- **Work item:** WI-OI-120 (execution plan v3 Phase 2 step 2.2). Evidence in `.pi/work/WI-OI-120.md`.
- **Size:** L (cross-service)

## Goal

When an invited user accepts their invitation, a Workforce person is linked to their login automatically,
so an administrator need not return to link it after the person joins.

## Finding (2026-10-24) — why this is not a module-local build

- Invitations are accepted in the **control-plane** database ([`acceptInvite`](../../packages/tenancy-nest/src/tenancy.service.ts), ~line 1261),
  which creates the `tenantMember`. The Workforce module is a separate service/DB with `crossSchemaAccess: false`.
- The signed platform context (`PlatformContextV1Schema`) carries **no email** — only `sub` (user UUID). The
  Workforce module therefore cannot match a pre-registered worker (known by email) to an accepting user.
- The only control-plane→module channel that exists is the **organization replica** (kernel job
  `workforce.organization-sync`). There is **no member/identity replica**.

So every viable design needs new cross-service machinery:
- **A — member-identity replica (recommended):** a kernel member-sync job delivering member id+email into a
  Workforce replica, mirroring the org replica (ADR-0018); auto-link a pending-by-email worker when identities
  arrive. Identity stays in the control plane; reuses the sanctioned delivery pattern. Benefits every module.
- **B — email claim in the signed context:** smallest module code, but puts PII in a token passed to every
  module — a security/privacy decision (producer cannot decide auth/secrets alone, AGENTS.md).
- **C — control-plane→module provisioning event** at acceptance time.

## Decision (owner, 2026-10-24)

Defer. **B1 (`6ecca404`) already fixed the real blocker** — the manual admin-link works, so technicians are not
stuck "not linked." T1a only *automates* that link. It is platform-identity work best designed once for all
modules; build it when identity delivery is prioritised, via option A unless owner chooses otherwise.

## When resumed — Done when

- [ ] Member identities (id, email, status) are delivered to a Workforce replica by a kernel job (option A), or the
      owner-chosen mechanism is built.
- [ ] An admin pre-registers a worker by email; on the invited user's first authenticated access, the module links
      `platform_user_id = sub` by matching the replicated email. Linking remains a system action (never a module role).
- [ ] Tests: pending worker auto-links on identity arrival; no match leaves it pending; an already-linked worker is untouched.
- [ ] `pnpm verify` clean; evidence in `.pi/work/WI-OI-120.md`; `.pi/NOW.md` updated.
