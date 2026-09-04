# WI-OI-013 — Self-service tenant administration, SSO/MFA, and regional isolation slice

Status: Review  
Parent requirements: FR-14, NFR-SEC-001, NFR-SEC-002, NFR-DATA-004  
Producer: Backend & Data Engineer + Web Experience  
Independent reviewers: Security & Privacy, Solution Architecture, QA Spec  
Gate: G1–G5

## Outcome

Enterprise self-service tenant administration suite enabling org admins to configure SAML 2.0 / OIDC Single Sign-On,
enforce TOTP MFA policies, manage custom roles, customize branding, select data residency regions (US/EU/APAC), and perform one-click GDPR data exports.

## Scope

- Self-service member invitations and custom role assignment.
- SAML SSO configuration (Okta, Azure AD / Entra ID, Google Workspace) and domain verification.
- Enforced Multi-Factor Authentication (TOTP / WebAuthn).
- Multi-region database residency bindings and full tenant data export archive (JSON/CSV).

## Acceptance Criteria

1. Org admins can invite team members and modify custom RBAC permissions without platform operator intervention.
2. Enabling MFA forces all tenant members to register a TOTP authenticator on subsequent login.
3. Tenant data export generates a cryptographically signed archive of all tenant-owned records.
4. All machine governance audits pass cleanly.
