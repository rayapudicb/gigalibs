# WI-OI-015 — Usage metering, consumption caps, and billing reconciliation slice

Status: Review  
Parent requirements: FR-16, NFR-FIN-001, NFR-SEC-001, NFR-REL-002  
Producer: Backend & Data Engineer + Finance / Domain Expert  
Independent reviewers: Finance & Product, Security & Privacy, QA Spec  
Gate: G1–G5

## Outcome

Real-time usage metering and consumption billing engine that tracks API requests, workflow run credits,
AI inference tokens, and storage bytes; enforces hard/soft spend caps; and generates reconciled monthly tenant billing statements.

## Scope

- High-throughput Redis rate-limiting and usage counters aggregated into PostgreSQL billing ledgers.
- Tiered plan quotas (e.g. Starter: 10,000 runs/mo; Enterprise: Unlimited with overage rates).
- Proactive threshold alerts (at 80%, 90%, and 100% of plan quotas).
- Automated monthly invoice line-item generation and Stripe billing sync.

## Acceptance Criteria

1. API invocations increment tenant usage counters in Redis atomically.
2. Exceeding a hard cap returns 429 Too Many Requests with clear upgrade CTA headers.
3. Monthly invoice generation aggregates exact metered usage without double-billing.
4. All SDLC machine audits pass cleanly.
