# WI-OI-023 — Universal Data Studio & Enterprise Data Contract Engine

Status: Review
Parent requirements: FR-02, FR-04, FR-07, FR-12, FR-14, FR-16, NFR-GOV-001–003, NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-OPS-001–004
Producer: SDLC Orchestrator coordinating Product, Architecture, Backend, Web, Data, Security, QA, SRE, Release, and Documentation roles
Independent reviewers: Solution Architecture, Security & Privacy, QA/SDET, Product
Current gate: G4 first vertical slice; no G5/G6 certification or release authorization

Prioritization record: on 2026-09-05, repository owner authorized Universal Data Studio & Enterprise Data Contract Engine development (Versioned Data Contracts, Schema Drift & Breaking Change Detection, Field Mapping & Transformation Studio with MultiCurrency Normalization, Data Quality Assertions, and Universal Cross-Module Lineage) on Port 5180 with Port 3800 dedicated microservice and PostgreSQL 16 schema gigalibs_data_studio.

## Outcome

A multi-tenant, enterprise data contract and pipeline schema governance engine. Serves as the central trust boundary across all business modules (Accounts Receivable, Spend Management, Tax Nexus, MultiCurrency, Workflow Studio, and BI Analytics). Enforces versioned JSONSchema contracts, detects breaking schema drifts, executes declarative field transformations with foreign exchange normalization, evaluates data quality assertions, and maintains an immutable lineage graph.

## Product boundary

The module owns `data_contracts`, `contract_versions`, `field_mappings`, `quality_assertions`, `schema_drift_logs`, and `audit_events` in the dedicated schema `gigalibs_data_studio`.
It integrates with Port 5180 unified UI via `/data-contracts` and BFF `/api/data-studio/[...path]`.
Microservice runs independently on Port 3800.
Cross-module handshakes integrate with MultiCurrency (`WI-OI-022`), TaxConfiguration (`WI-OI-021`), Accounts Receivable (`WI-OI-019`), Spend Management (`WI-OI-020`), Universal Rule Pro, Workflow Studio, and BI Analytics.
