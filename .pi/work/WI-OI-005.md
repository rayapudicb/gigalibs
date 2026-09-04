# WI-OI-005 — Threat model, permission matrix, and data-protection slice

Status: Review  
Parent requirements: FR-14, FR-15, NFR-SEC-001, NFR-SEC-002, NFR-SEC-003, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-DATA-001, NFR-DATA-002, NFR-DATA-004  
Producer: Security & Privacy + Solution Architecture  
Independent reviewers: Solution Architecture, QA Spec  
Gate: G2–G5

## Outcome

Formal STRIDE threat model, multi-tenant RBAC boundary matrix, data-classification taxonomy (Public, Internal, Confidential, Restricted), and encryption-at-rest/in-transit verification.

## Scope

- Threat modeling covering Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, and Elevation of Privilege across all API boundaries.
- Explicit RBAC permission mapping across tenant isolation modes (Row-Level Security, Schema-Isolated, Dedicated Database).
- Data classification registry covering PII, financial ledgers, execution payloads, and credentials.
- AES-256-GCM authenticated payload encryption verification and key rotation runbook.

## Acceptance Criteria

1. Threat model identifies and addresses all high-risk vector pathways.
2. Tenant boundary guard enforces strict tenant separation on every private route.
3. Cryptographic payload envelope verifies AEAD authentication tags.
4. All machine governance audits pass cleanly.
