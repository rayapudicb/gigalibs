# WI-OI-011 — Demo Lab, safe scenario simulation, and expiring workspace slice

Status: Review  
Parent requirements: FR-13, NFR-SEC-001, NFR-DATA-004  
Producer: Product Requirements + Solution Architecture  
Independent reviewers: Security & Privacy, Web Experience, QA Spec  
Gate: G1–G5

## Outcome

An isolated, expiring tenant sandbox environment ("Demo Lab") allowing prospective customers and operators
to run end-to-end operational workflows against synthesized scenario data with 1-click reset and zero leak into production tenants.

## Scope

- Ephemeral tenant provisioning with automated 24-hour TTL expiration.
- Pre-packaged scenario data pipelines (e.g. Accounts Payable 3-way reconciliation, IoT vibration telemetry).
- Safe sandbox guardrails preventing outbound external API mutations without explicit simulation flags.
- 1-click workspace reset and cryptographic deletion audit trail.

## Acceptance Criteria

1. Demo workspace automatically provisions within < 3 seconds.
2. Expired workspaces are purged cleanly without leaving orphaned records.
3. Outbound connectors in demo mode are restricted to mock/sandbox endpoints.
4. All machine governance audits pass.
