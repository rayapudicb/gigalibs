# Tenant Administration, SAML SSO & Regional Data Residency Runbook

Owner: Backend & Data Engineer + Web Experience  
Work item: WI-OI-013  
Standard: FR-14, NFR-SEC-001, NFR-SEC-002, NFR-DATA-004

## 1. SAML 2.0 / OIDC SSO & Domain Verification

1. **Domain Claiming:** Org admins add custom corporate domain (e.g. `acme-corp.com`). System generates a `TXT` DNS verification token (`gigalibs-domain-verification=<token>`).
2. **IdP Metadata Ingestion:** Ingests XML/JSON metadata from Okta, Microsoft Entra ID (Azure AD), or Google Workspace:
   - `entityID`: IdP Issuer URI.
   - `ssoUrl`: HTTP-Redirect / HTTP-POST Single Sign-On URL.
   - `x509Certificate`: Public cryptographic certificate used for signature validation.
3. **JIT (Just-in-Time) Provisioning:** Authenticated users from verified domains are provisioned automatically with default `MEMBER` role.

## 2. Multi-Factor Authentication (MFA) Enforcement

- When `enforceMfa: true` is enabled in `TenantSettings`, session authorization blocks all non-MFA sessions, forcing redirection to the TOTP setup flow (`/auth/mfa/enroll`).

## 3. Regional Data Residency & GDPR Exports

1. **Residency Routing:** Tenants configured with `region: "EU"` (Frankfurt) or `region: "APAC"` (Tokyo) route database transactions exclusively to region-bound database instances.
2. **GDPR Data Portability Archive:** Admins can trigger `POST /api/v1/tenants/current/export`, compiling all tenant invoices, workflow logs, and users into a SHA-256 signed JSON/CSV archive.
