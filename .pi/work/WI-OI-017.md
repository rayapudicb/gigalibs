# WI-OI-017 — Temporal rules, durable workflow orchestration, and compensation slice

Status: Review  
Parent requirements: FR-06, FR-08, NFR-REL-001, NFR-REL-002, NFR-REL-003  
Producer: Backend & Data Engineer + Solution Architecture  
Independent reviewers: Solution Architecture, QA Spec  
Gate: G2–G5

## Outcome

Durable state-machine workflow engine supporting asynchronous delays, parallel branch execution,
durable checkpointing across node crashes, saga compensation rollbacks, and idempotency key locks.

## Scope

- Durable state persistence for multi-step DAG executions.
- Saga pattern: automated compensation steps when downstream nodes fail irrevocably.
- Distributed lock manager (`RedisRedlock` / `PrismaAdvisoryLock`) preventing duplicate step execution.
- Human-in-the-loop approval pause/resume gates with SLA timeout triggers.

## Acceptance Criteria

1. Workflow execution survives server restart and resumes from last persisted checkpoint.
2. Irrevocable step failure triggers reverse compensation actions in order.
3. Concurrent duplicate triggers for same idempotency key are rejected with 409 Conflict.
4. All machine governance audits pass cleanly.
