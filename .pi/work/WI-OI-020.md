# WI-OI-020 — Enterprise Spend Management & AP Studio (Coupa / Ramp Standard)

Status: In Progress
Parent requirements: FR-02, FR-04, FR-09, FR-14, FR-15, FR-16, NFR-GOV-001–003, NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-OPS-001–004
Producer: SDLC Orchestrator coordinating Product, Finance, Architecture, Backend, Web, Data, Security, QA, SRE, Release, and Documentation roles
Independent reviewers: Finance/Domain, Solution Architecture, Security & Privacy, QA/SDET, Product
Current gate: G4 first vertical slice; no G5/G6 certification or release authorization

Prioritization record: on 2026-09-04, repository owner authorized Enterprise Spend Management & AP Studio development (Coupa/Ramp standard: Budgets & Cost Centers, Expense & Corporate Card Ledger, Travel Desk & GSA Per-Diem, Imprest Multi-Wallets, SaaS Sprawl & Software Subscriptions, Spend Analytics) on Port 5180 with Port 3500 dedicated microservice and PostgreSQL 16 schema gigalibs_spend.

## Outcome

A multi-tenant, enterprise spend orchestration platform modeled after Coupa, Ramp Enterprise, and Brex Enterprise. Features departmental cost-center budget envelopes, corporate card expense itemization with receipt uploads and GL coding, GSA per-diem policy ceilings, multi-wallet petty cash imprest funds, SaaS subscription renewal management, and dynamic approval rule hierarchies.

## Product boundary

The module owns `cost_centers`, `expenses`, `expense_lines`, `travel_requests`, `imprest_wallets`, `imprest_transactions`, `saas_subscriptions`, `approval_rules`, `audit_events`, and `outbox_events` in the dedicated schema `gigalibs_spend`.
It integrates with Port 5180 unified UI via `/spend` and BFF `/api/spend/[...path]`.
Microservice runs independently on Port 3500.
