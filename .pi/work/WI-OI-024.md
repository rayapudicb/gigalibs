# WI-OI-024 — Universal Rule Pro & Policy Decision Engine

Status: Review
Parent requirements: FR-06, FR-08, FR-12, FR-14, FR-16, NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-OPS-001–004
Producer: SDLC Orchestrator coordinating Product, Architecture, Backend, Web, Data, Security, QA, SRE, Release, and Documentation roles
Independent reviewers: Solution Architecture, Security & Privacy, QA/SDET, Product
Current gate: G4 first vertical slice; no G5/G6 certification or release authorization

Prioritization record: on 2026-09-05, repository owner authorized Universal Rule Pro & Policy Decision Engine development (3-tier inheritance from Platform to Tenant to Department, deterministic in-memory AST evaluator with sub-2ms latency, multi-dimensional DMN decision matrices, real-time FX normalized condition checks, and regulatory SOX audit logging) on Port 5180 with Port 3900 dedicated microservice and PostgreSQL 16 schema gigalibs_rules.

## Outcome

A multi-tenant, enterprise business policy and decision orchestration engine. Serves as the central decision brain across Accounts Receivable, Spend Management, Tax Nexus, MultiCurrency FX, Workflow Studio, and BI Analytics. Evaluates complex condition trees and decision tables, enforces credit holds, routes executive approvals, verifies statutory exemptions, and maintains an immutable execution audit ledger.

## Product boundary

The module owns `rules`, `rule_versions`, `decision_tables`, `rule_evaluation_logs`, and `audit_events` in the dedicated schema `gigalibs_rules`.
It integrates with Port 5180 unified UI via `/rules` and BFF `/api/rules/[...path]`.
Microservice runs independently on Port 3900.
Cross-module handshakes integrate with MultiCurrency (`WI-OI-022`), Universal Data Studio (`WI-OI-023`), Accounts Receivable (`WI-OI-019`), Spend Management (`WI-OI-020`), and TaxConfiguration (`WI-OI-021`).
