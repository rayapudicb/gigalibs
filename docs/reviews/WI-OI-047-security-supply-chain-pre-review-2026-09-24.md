# WI-OI-047 Security and supply-chain technical pre-review

Date: 2026-09-24

Status: Agent technical recommendation only; named human Security/Supply-chain decision pending

Scope: `configuration-local-development-v1` and the exact replacement images in
`infra/compose/evidence/phase-a-20260923T180053Z/`

## Decision boundary

This record prepares evidence for a human Security/Supply-chain reviewer. It is not security-risk
acceptance, vulnerability VEX, legal/license approval, production authorization or a human decision. It
does not activate WI-OI-046 or any G4 Build item.

The historical vulnerability and offline-SBOM audits for `phase-a-20260923T103641Z` describe the deleted
pre-remediation images. They remain remediation history and must not be used as the verdict for the three
replacement image IDs below.

## Exact replacement identities

| Component | Exact image ID | CycloneDX components | Critical | High | Other vulnerability occurrences |
| --- | --- | ---: | ---: | ---: | ---: |
| Migrations | `sha256:0ef0a1e9bbfc6d5294c9856c4252bf876967aac74cd5e47415c4c30246636e48` | 52 | 0 | 0 | 22 |
| API | `sha256:0a9b4a9160dd9a840af630617bec7ec02af0b4923459b9312e6e29017a26b3ac` | 243 | 0 | 0 | 24 |
| Web | `sha256:8541a74ac83305ae2f155a08a9a924fc9aab2118c670454331671d7e95c47301` | 304 | 0 | 0 | 22 |

All three raw Trivy records bind to Git revision
`5abfa667bb105143ba8c00bc07b1fb4e6d9ac7d6` and image-build source-state label
`3e04668a12128ac56234549152789e034a61b60b56085055d9db58b74b53f614`.

## Evidence integrity verified

- Scanner: Trivy 0.74.0 with telemetry disabled.
- Vulnerability policy: maximum Critical `0`, maximum High `0`, `ignoreUnfixed=false`.
- Raw vulnerability report hashes match their policy records:
  - migrations: `19d4f404e4b006c8145b1d775e83d63fb5f83aec0d75cbaec09600c0ae75c386`;
  - API: `607fe21c34a911671dddb843640faada56078fb5a131755750f8ce0760937d5f`;
  - web: `75b983acdb646825bbb335f778624e38a6c603f8fef3c198bf6bfd5e465373bc`.
- CycloneDX 1.7 SBOM hashes:
  - migrations: `559550ac2328d79d1f0ec3fe70d6d3347c28d94dfef5d7c80e5bde727a8e1242`;
  - API: `44572a67a14456c3eb82fff4965437ef5dfbc6cc0e4774705468817f04bd538f`;
  - web: `9e0868d0051f390d49b33b8cd5fa68e79fcaf2050ba701fa7c354cd97196556c`.
- The additional count-only secret-scan record is
  `docs/audits/2026-09-24-wi-oi-047-exact-image-secret-scan-summary.json`, SHA-256
  `b905b441b4ee324065144b9a94e4795a1ff05ade36f9ed61346d79b8363261f5`.

## Security control disposition

| ID | Control | Result | Evidence or limitation |
| --- | --- | --- | --- |
| SEC-047-01 | Exact-image vulnerability policy | PASS | All three images have zero Critical and zero High findings; lower-severity occurrences remain visible and are not described as zero-risk |
| SEC-047-02 | Image secret-content scan | PASS with tool limitation | A read-only local Trivy secret scan of each exact image ID found zero matches; only sanitized counts were retained so evidence cannot reproduce a secret value |
| SEC-047-03 | Prohibited paths and runtime minimization | PASS | No `.env*`, `.git`, private-key path, global npm or shell path was found; each image runs as `65532:65532` on Debian 13.7 |
| SEC-047-04 | Runtime environment content | PASS for inspected image configuration | Image configuration contains only bounded non-secret runtime names: `PATH`, `SSL_CERT_FILE`, `NODE_ENV`, and web `NEXT_TELEMETRY_DISABLED` |
| SEC-047-05 | Authentication, tenant isolation and revocation | PASS for bounded F2 evidence | Unauthenticated access returned 401; two-tenant isolation, maker/checker denial, live role/membership/user/tenant revocation and logout revocation passed |
| SEC-047-06 | Test identity cleanup | PASS | Active generated users, tenants and memberships all returned to zero |
| SEC-047-07 | Historical ACS/Twilio credential exposure | OPEN — external-use stop | Clean images do not prove the superseded provider credentials were rotated or revoked; credential-owner proof is mandatory before any external use |
| SEC-047-08 | Quarantined runtime dependency | OPEN — routed | Both runtime-data audits fail because the workflow web still depends on/imports quarantined `data-import-export-react`; frozen CMMS also has a localhost Redis fallback. Do not waive or edit those paths under WI-OI-047 |
| SEC-047-09 | Repository build/test integrity | OPEN — routed | Build/test failures remain in Analytics and frozen CMMS. Focused WI-OI-047 evidence passes, but repository-wide release integrity does not |
| SEC-047-10 | License evidence | INCOMPLETE | SBOM license fields are absent for 5/52 migrations, 27/243 API and 20/304 web components; no named legal/license disposition exists in this replacement bundle |
| SEC-047-11 | SAST and IaC scanning | NOT EVIDENCED | The replacement bundle does not contain a versioned SAST or IaC scan. Do not infer a pass from container scanning |
| SEC-047-12 | Registry provenance/signing | `DEFERRED_EXTERNAL` | No remote push, registry digest, signature or external provenance attestation exists for the Local Development-only profile |
| SEC-047-13 | Source-identity closure field | DOCUMENTED FINDING | `phase-a-closure.json` contains the post-certification working-tree fingerprint in `sourceStateSha256`; raw image metadata carries the image-build source label. The integrated review explains the distinction |

## Threat and release interpretation

The replacement artifacts materially resolve the exact-image Critical/High vulnerability condition and
the earlier image-packaging defect. They do not resolve the historical provider credential lifecycle,
quarantined-package governance, whole-repository test failures, license coverage, SAST/IaC evidence or
external provenance.

Agent technical recommendation:

- **Conditional Go for a named human Security reviewer to consider the bounded Local Development profile
  for continued local development/demo only**, provided every open item above remains explicit and the
  reviewer accepts the limited evidence coverage.
- **No-Go for production, cloud, customer-managed distribution or external provider use.**
- **No-Go for claiming WI-OI-047 fully Accepted solely from this record.** The human decision and other
  independent review rows remain required.

## Human Security/Supply-chain decision request

An actual qualified human reviewer completes this statement and the corresponding row in
`docs/reviews/WI-OI-047-exit-WI-OI-046-entry-integrated-review.md`:

```text
I, [full human name], reviewed WI-OI-047 as the Security/Supply-chain reviewer against replacement bundle
phase-a-20260923T180053Z and the 2026-09-24 Security technical pre-review. My decision for the bounded
configuration-local-development-v1 profile is [Accept / Conditional / Reject]. I am [independent / not
independent] from the implementation producer. Conditions/findings: [exact conditions]. I do not authorize
production, cloud, customer-managed distribution, external provider use or WI-OI-046 G4 implementation.
Date: [YYYY-MM-DD].
```
