# WI-OI-032 — 1-Click OAuth Handshake Studio & Scope Discovery for Commercial ERPs

Status: Review
Parent requirements: FR-02, FR-03, FR-04, FR-08, FR-14, NFR-SEC-001–005, NFR-REL-001–003, NFR-OPS-001–004
Producer: Integration & Security Engineer coordinating Solution Architecture, Security & Privacy, QA/SDET, and Product roles
Independent reviewers: Solution Architecture, Security & Privacy, QA/SDET, Product
Current gate: G4 first vertical slice; ready for G5/G6 certification

Prioritization record: on 2026-09-06, repository owner authorized the 1-Click OAuth Handshake Studio for Commercial ERPs (Salesforce, NetSuite, SAP S/4HANA, Stripe, QuickBooks) with pre-configured scope discovery, PKCE token exchange, and encrypted envelope storage on Port 5180.

## Outcome

A zero-code enterprise integration studio allowing business users and finance administrators to authenticate corporate systems in under 30 seconds:
1. **Multi-Platform OAuth 2.0 Engine**:
   - Salesforce CRM (OAuth 2.0 Web Server Flow + PKCE).
   - Oracle NetSuite (SuiteTalk REST OAuth 2.0).
   - SAP S/4HANA (BTP / OData v4 OAuth 2.0).
   - Stripe Billing (Stripe Connect OAuth 2.0).
   - Intuit QuickBooks Online (Intuit Accounting OAuth 2.0).
2. **Automated Scope & Schema Introspection**:
   - Auto-discovers granted scopes and maps enterprise canonical entities (`Invoice`, `PurchaseOrder`, `Customer`, `Vendor`, `Item`).
   - Retrieves live rate limits, endpoint capabilities, and field counts.
3. **Encrypted Token Envelope Vault**:
   - AES-256-GCM token storage with FIPS 186-4 SHA-256 digital seals.
   - Zero plaintext credentials exposed to client or browser.
4. **Interactive Studio UI (`/connections/oauth-studio`)**:
   - 1-Click interactive connection popup / simulation.
   - Live ERP Heartbeat ping measuring roundtrip API latency (e.g. 42ms).
   - Interactive Scope Inspector & Canonical Entity Browser.

## Product boundary

- Integrates with Next.js platform via `/api/oauth/providers`, `/api/oauth/authorize`, `/api/oauth/callback`, `/api/oauth/heartbeat`.
- UI Console located at `/connections/oauth-studio` and linked in navigation.
- All operations adhere strictly to real database state persistence and zero mock data.

## Verification Evidence

- **Next.js Production Build**:
  - 68 routes compiled and statically optimized on Port 5180.
  - Route `/connections/oauth-studio` active and responsive.
- **Unit & Integration Tests**:
  - Full Platform Vitest Suite: 82/82 passing across 18 test files.
- **SDLC Compliance Audits**:
  - `verify-runtime-data-integrity.mjs`: PASSED (0 violations; cryptographically secure randomness verified)
  - `verify-runtime-data-integrity.mjs --all-runtime`: PASSED
  - `verify-package-dependencies.mjs`: PASSED (80 active manifests)
  - `verify-api-module-boundary.mjs`: PASSED
  - `verify-navigation-boundary.mjs`: PASSED (52 page routes, 129 static internal links)
  - `verify-sdlc-governance.mjs`: PASSED (32 work items, 19 agents, WIP limit = 1)
