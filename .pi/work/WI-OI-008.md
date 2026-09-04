# WI-OI-008 — CI security, supply-chain, SAST, and SBOM slice

Status: Review  
Parent requirements: NFR-SEC-004, NFR-SC-001, NFR-SC-002, NFR-SC-003, NFR-SC-004  
Producer: DevSecOps / SRE + Security & Privacy  
Independent reviewers: License & Supply Chain, QA Spec  
Gate: G5

## Outcome

Automated CI pipeline verification ensuring zero hardcoded secrets, deterministic dependency locking,
clean SAST/vulnerability scanning, CycloneDX/SPDX Software Bill of Materials (SBOM) generation, and provenance tracking.

## Scope

- Dependency lockfile integrity verification (`pnpm-lock.yaml`).
- Static Application Security Testing (SAST) and Biome lint security checks.
- Zero-mock and secret exposure detection across all repository files.
- Automated SBOM generation and open-source license compliance audit.

## Acceptance Criteria

1. All package dependencies strictly adhere to workspace and quarantine boundaries.
2. Biome lint and typechecks pass with zero unhandled security vulnerabilities.
3. Secret scanning confirms zero embedded credentials or private keys in repository commits.
4. All machine audits pass cleanly.
