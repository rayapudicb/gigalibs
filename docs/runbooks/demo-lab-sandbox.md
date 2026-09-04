# Demo Lab & Ephemeral Workspace Sandbox Runbook

Owner: Product Requirements + Solution Architecture  
Work item: WI-OI-011  
Standard: FR-13, NFR-SEC-001, NFR-DATA-004

## 1. Ephemeral Sandbox Architecture

Demo workspaces ("Demo Labs") are isolated, sandboxed tenant environments created on-demand for prospect evaluation and testing:
- **Tenant Isolation:** Provisioned with dedicated schema or isolated tenant ID (`demo_<random_suffix>`).
- **TTL Expiration:** Default 24-hour expiration timestamp (`expiresAt = now() + 24h`).
- **Automated Teardown:** A scheduled cron job purges all data, billable records, and workflow runs for expired demo tenants.

## 2. Safe Simulation Guardrails

1. **Connector Mocking:** Outbound HTTP connectors (Stripe, Twilio, SendGrid) are automatically routed to local sandboxes; real API keys cannot be attached to Demo tenants.
2. **One-Click Scenario Seeding:**
   - Scenario A: Accounts Payable 3-way matching with synthetic POs and line-item variances.
   - Scenario B: Industrial IoT vibration telemetry stream with anomalous bearing harmonics.
3. **One-Click Reset:** Operators can instantly re-seed or wipe the demo tenant without leaving orphan database records.
