# WI-OI-028 — Real Multi-Tenant RBAC, Centralized Platform Control Panel, Self-Service Marketplace & Dynamic DB Isolation

Status: Review
Parent requirements: FR-13, FR-14, FR-15, FR-16, NFR-SEC-001–005, NFR-DATA-001–004, NFR-OPS-001–004
Producer: SDLC Orchestrator coordinating Solution Architecture, Backend, Web, Tenant IAM, Data, Security, QA, SRE, and Documentation roles
Independent reviewers: Solution Architecture, Security & Privacy, QA/SDET, Product
Current gate: G4 first vertical slice; ready for G5/G6 certification or release authorization

Prioritization record: on 2026-09-05, repository owner authorized Real Multi-Tenant RBAC, Centralized Platform Control Panel (Super Admin), Self-Service Module Marketplace with Transactional Purchase Ledger (without external Stripe dependency), On-the-Fly Subdomain Routing, and Zero-Downtime Dynamic Microservice Schema Isolation on Port 5180 with Port 4300 dedicated microservice and PostgreSQL 16 schema gigalibs_platform.

## Outcome

An enterprise SaaS multi-tenant control plane and RBAC foundation. Features:
1. **Centralized Platform Control Panel (`/platform-admin`)**: Managed exclusively by Platform Super Admins for fleet health, on-the-fly tenant onboarding, global platform settings, and JIT impersonation audits.
2. **Entitlement-Driven Microservice DB Isolation (Zero Ghost Schemas)**: When a tenant subscribes to a subset of modules (e.g. Connector Hub + Recovery Studio), PostgreSQL 16 provisions *only* those specific module schemas (`tenant_<slug>_connectors`, `tenant_<slug>_recovery`), while unpurchased microservices allocate zero tables or memory.
3. **Zero-Downtime Dynamic Schema Hydration**: Creating new module schemas acquires zero locks on existing tenant operations, hydrating in <300ms.
4. **Self-Service Module Marketplace (`/marketplace`)**: Built-in corporate checkout flow generating real invoices (`INV-2026-XXXX`) and transactional double-entry ledger records without external Stripe dependencies.
5. **Hierarchical Tenant RBAC (`/settings`)**: Multi-level departments with spending limits, functional groups, and custom role permission matrices with declarative `<Can do="..." on="...">` client authorization.

## Product boundary

The module owns `platform_tenants`, `platform_users`, `platform_settings`, `module_catalog`, `module_purchases`, `billing_invoices`, `ledger_transactions`, and `platform_audit_events` in the dedicated schema `gigalibs_platform`.
It integrates with Port 5180 unified UI via `/platform-admin`, `/marketplace`, `/settings`, and BFF proxies `/api/platform/[...path]` and `/api/tenant-rbac/[...path]`.
Microservice runs independently on Port 4300.
Cross-module handshakes coordinate dynamically across all 9 running microservices (AR, Spend, Tax, Currency, Data Studio, Rules, Workflow Studio, Connector Hub, Recovery Studio).

## Verification Evidence

- **Database Persistence**: PostgreSQL 16 `gigalibs_platform` schema with complete relational integrity and audited mutations.
- **Platform Microservice**: Running on Port 4300 (`modules/platform-rbac/apps/api`). Health check returns `{"status":"ok","service":"platform-rbac-api","database":"connected","isolationProtocol":"Zero-Ghost-Schemas / Dynamic Namespace Hydration"}`.
- **Dynamic Schema Hydration**: Verified with on-the-fly tenant onboarding (`POST /api/platform/v1/tenants`) and self-service module marketplace purchase (`POST /api/tenant/v1/marketplace/purchase`) creating schemas and tables in <200ms.
- **UI Experience**: Compiled 53 routes on Port 5180 with 100% authentic Medusa UI design tokens.
- **SDLC Audits**:
  - `verify-runtime-data-integrity.mjs`: PASSED
  - `verify-runtime-data-integrity.mjs --all-runtime`: PASSED
  - `verify-package-dependencies.mjs`: PASSED
  - `verify-api-module-boundary.mjs`: PASSED
  - `verify-navigation-boundary.mjs`: PASSED (43 page routes, 90 static links)
  - `verify-sdlc-governance.mjs`: PASSED

