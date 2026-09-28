# WI-OI-046 independent specialist decision request

Date: 2026-09-24  
Profile: `configuration-local-development-v1`  
Status: agent-executable G3 preparation complete; named human decisions pending

Step-by-step execution instructions:
`docs/reviews/WI-OI-046-human-review-execution-guide-2026-09-24.md`.

Current exact-image Security decision instructions:
`docs/reviews/WI-OI-047-WI-OI-046-security-decision-request-2026-09-24.md`.

Short Security human execution checklist:
`docs/reviews/WI-OI-046-security-human-checklist-2026-09-24.md`.

IAM/Tenancy decision instructions:
`docs/reviews/WI-OI-046-iam-tenancy-decision-request-2026-09-24.md`.

IAM/Tenancy human execution checklist:
`docs/reviews/WI-OI-046-iam-tenancy-human-checklist-2026-09-24.md`.

API Contracts decision instructions:
`docs/reviews/WI-OI-046-api-contracts-decision-request-2026-09-24.md`.

API Contracts human execution checklist:
`docs/reviews/WI-OI-046-api-contracts-human-checklist-2026-09-24.md`.

Web/Accessibility decision instructions:
`docs/reviews/WI-OI-046-web-accessibility-decision-request-2026-09-24.md`.

Web/Accessibility human execution checklist:
`docs/reviews/WI-OI-046-web-accessibility-human-checklist-2026-09-24.md`.

QA/SDET decision instructions:
`docs/reviews/WI-OI-046-qa-sdet-decision-request-2026-09-24.md`.

QA/SDET human execution checklist:
`docs/reviews/WI-OI-046-qa-sdet-human-checklist-2026-09-24.md`.

## Boundary

This packet requests the remaining independent human decisions for bounded TP-1 Build entry. It does not
authorize product code, production, cloud, external release or TP-2–TP-6. An agent cannot complete these
rows. A reviewer must be a named, qualified human and must state whether they are independent from the
implementation producer.

One human may cover multiple responsibilities only where organizational policy permits it and the record
states the person's relevant competence. The implementation producer cannot be the only reviewer of
security, tenancy, migrations/recovery or release risk.

## Frozen evidence identity

| Evidence | SHA-256 |
| --- | --- |
| WI-OI-042 Backend/Data request | `17d71fa5c77bb745ab877752a748b8ae25f3f931cc5f09869309181603427177` |
| WI-OI-046 G3 decision request | `d97654eafd4c2672d2f6b4fb782c8dd65042909ae0cd86d98288a9fd3d872a65` |
| SP-01–SP-07 resolution request | `f6ec2b7f874783882f85ddcf8030117c7619ce472d95c9e2ca5098add837a023` |
| Specialist technical pre-review | `1fde26c87fe8ae254d2fb9cc54b4ee1f3c973f7086abffd09daa8fcf5601b1ce` |
| TP-1 verification plan | `de491921008efe15b17cd89fffd9dad9aa4c3e321d62ce4239ad58f61a666ca8` |
| Refreshed collision audit | `4c1e98b6467f8cefef95dd4b36fab420e08a0de55e902f079c5c143092805c46` |
| Refreshed focused baseline | `a266d9e2f5bf0f56678294eb1ec6897e8bf3e47c4cb13fdc8ae7b4e971ede343` |
| Exact 15-file candidate manifest | `846057e81977d9ff2ebe95ed813e54a6ab19af221ee93d32ed21ceec91dc6a6c` |
| Machine-readable focused baseline | `7db43ab34ea402aac3dc88dafcf2e55dcab50a52ae5a1532471304766377b010` |

The focused baseline passes both builds, 87 tests across 17 files, workflow typecheck, Configuration
contract/profile/observability audits and SDLC governance. These results prove a stable pre-change baseline,
not the unimplemented TP-1 behavior.

## Required decisions

| Responsibility | Required disposition |
| --- | --- |
| Backend/Data | Decide the WI-OI-042 bounded Department remediation using its separate ten-point checklist |
| Security & Privacy | SP-01, SP-03, SP-05 and SP-07; safe errors/metrics and predecessor credential conditions |
| IAM/Tenancy | SP-01 entitlement authority and SP-03 privileged-preview authority |
| Infrastructure/SRE | SP-07 fail-fast local configuration and the Local Development evidence boundary |
| API Contracts | SP-01–SP-03, SP-05 and SP-06; exact legacy/current wire compatibility |
| Web/Accessibility | SP-04 visible state machine and the manual accessibility plan |
| QA/SDET | SP-01–SP-07 requirement/test trace, real-dependency evidence and cleanup rules |

Product/Solution Architecture acceptance of D1–D6 and the recommended SP amendments is already recorded.
It does not replace any row above.

## Assigned reviewers

| Human name | Responsibility | Independence | Decision status | Assignment evidence |
| --- | --- | --- | --- | --- |
| Rakesh Konduri | Backend/Data | Personally declared independent from the implementation producer | Accept — bounded WI-OI-042 Department remediation; no conditions | `docs/reviews/WI-OI-042-backend-data-decision-2026-09-24.md` |
| Rakesh Konduri | Infrastructure/SRE | Confirmed by Chinni babu Rayapudo and personally declared independent from the implementation producer | Accept — SP-07 and bounded Local Development operational evidence; no conditions | Checklist execution recorded in `docs/reviews/WI-OI-046-infrastructure-sre-check-record-2026-09-24.md` |
| Harsha Koganti | Security/Supply-chain for WI-OI-047 | Personally declared independent from the implementation producer | Conditional — bounded Local Development only; stated external/distribution conditions remain open | `docs/reviews/WI-OI-047-security-supply-chain-decision-2026-09-24.md` |
| Harsha Koganti | Security & Privacy for WI-OI-046 | Personally declared independent from the implementation producer | Accept — SP-01, SP-03, SP-05 and SP-07 subject to implementation and post-Build proof | `docs/reviews/WI-OI-046-security-privacy-decision-2026-09-24.md` |
| Harsha Koganti | IAM/Tenancy for WI-OI-046 | Personally declared independent from the implementation producer | Accept — SP-01 and SP-03 subject to implementation and post-Build proof | `docs/reviews/WI-OI-046-iam-tenancy-decision-2026-09-24.md` |
| Chinni babu Rayapudi | API Contracts for WI-OI-046 | Personally declared independent from the implementation producer | Accept — SP-01 through SP-03, SP-05 and SP-06 subject to implementation proof | `docs/reviews/WI-OI-046-api-contracts-decision-2026-09-24.md` |
| Chinni babu Rayapudi | Web/Accessibility for WI-OI-046 | Personally declared independent from the implementation producer | Accept — SP-04 and the post-Build accessibility plan | `docs/reviews/WI-OI-046-web-accessibility-decision-2026-09-24.md` |
| Chinni babu Rayapudi | QA/SDET for WI-OI-046 | Personally declared independent from the implementation producer | Accept with QA-01 through QA-12 incorporated | `docs/reviews/WI-OI-046-qa-sdet-decision-2026-09-24.md` |

Harsha Koganti's WI-OI-047 declaration did not constitute either WI-OI-046 specialist decision. His
separate Security & Privacy and IAM/Tenancy declarations now resolve both TP-1 design rows, subject to
their stated implementation and post-Build proof requirements.

### Recorded Backend/Data dependency decision

Rakesh Konduri accepted the bounded WI-OI-042 Department schema-contract remediation with no conditions.
The verbatim declaration and its exact evidence binding are in
`docs/reviews/WI-OI-042-backend-data-decision-2026-09-24.md`. This resolves the Backend/Data disposition
requested by this entry packet, but does not accept WI-OI-047 or authorize WI-OI-046 G4 implementation.

### Recorded Infrastructure/SRE declaration

> I, Rakesh Konduri, reviewed WI-OI-046 as the Infrastructure/SRE reviewer against the frozen evidence
> identity in the 2026-09-24 independent specialist decision request. My decision for SP-07 and the bounded
> Local Development operational evidence is accepted, I am independent from the implementation producer.
> Conditions/findings: none. This does not authorize production, cloud, external release or TP-2–TP-6.
> Date: 2026-09-24.

### Recorded Infrastructure/SRE checks

The submitted execution record confirms that the frozen manifest, SDLC audit, Local Development profile,
focused baseline, exact-image supply-chain policy, runtime evidence, restore evidence and SP-07 text were
checked. All bounded results matched the expected disposition. See
`docs/reviews/WI-OI-046-infrastructure-sre-check-record-2026-09-24.md`.

## Copy-ready role statements

Each reviewer should copy only the statement for their actual responsibility and complete every bracket.

### Security & Privacy

```text
I, [full human name], reviewed WI-OI-046 as the Security & Privacy reviewer against the frozen evidence
identity in the 2026-09-24 independent specialist decision request. My decision for SP-01, SP-03, SP-05
and SP-07 in the bounded Local Development TP-1 slice is [Accept / Conditional / Reject]. I am
[independent / not independent] from the implementation producer. Conditions/findings: [exact text].
This does not authorize production, cloud, external release or TP-2–TP-6. Date: [YYYY-MM-DD].
```

### IAM/Tenancy

```text
I, [full human name], reviewed WI-OI-046 as the IAM/Tenancy reviewer against the frozen evidence identity
in the 2026-09-24 independent specialist decision request. My decision for SP-01 and SP-03 in the bounded
Local Development TP-1 slice is [Accept / Conditional / Reject]. I am [independent / not independent]
from the implementation producer. Conditions/findings: [exact text]. This does not authorize production,
cloud, external release or TP-2–TP-6. Date: [YYYY-MM-DD].
```

### Infrastructure/SRE

```text
I, [full human name], reviewed WI-OI-046 as the Infrastructure/SRE reviewer against the frozen evidence
identity in the 2026-09-24 independent specialist decision request. My decision for SP-07 and the bounded
Local Development operational evidence is [Accept / Conditional / Reject]. I am [independent / not
independent] from the implementation producer. Conditions/findings: [exact text]. This does not authorize
production, cloud, external release or TP-2–TP-6. Date: [YYYY-MM-DD].
```

### API Contracts

```text
I, [full human name], reviewed WI-OI-046 as the API Contracts reviewer against the frozen evidence identity
in the 2026-09-24 independent specialist decision request. My decision for SP-01–SP-03, SP-05 and SP-06
in the bounded Local Development TP-1 slice is [Accept / Conditional / Reject]. I am [independent / not
independent] from the implementation producer. Conditions/findings: [exact text]. This does not authorize
production, cloud, external release or TP-2–TP-6. Date: [YYYY-MM-DD].
```

### Web/Accessibility

```text
I, [full human name], reviewed WI-OI-046 as the Web/Accessibility reviewer against the frozen evidence
identity in the 2026-09-24 independent specialist decision request. My decision for SP-04 and the proposed
manual accessibility plan in the bounded Local Development TP-1 slice is [Accept / Conditional / Reject].
I am [independent / not independent] from the implementation producer. Conditions/findings: [exact text].
This does not authorize production, cloud, external release or TP-2–TP-6. Date: [YYYY-MM-DD].
```

### QA/SDET

```text
I, [full human name], reviewed WI-OI-046 as the QA/SDET reviewer against the frozen evidence identity in
the 2026-09-24 independent specialist decision request. My decision for the SP-01–SP-07 verification plan,
real-dependency matrix, stop conditions and cleanup rules in the bounded Local Development TP-1 slice is
[Accept / Conditional / Reject]. I am [independent / not independent] from the implementation producer.
Conditions/findings: [exact text]. This does not authorize production, cloud, external release or
TP-2–TP-6. Date: [YYYY-MM-DD].
```

## Orchestrator rule

All applicable WI-OI-046 pre-Build decisions are now recorded. On 2026-09-24 Chinni babu Rayapudi then
directed the work to proceed with development. The Orchestrator may therefore move WI-OI-046 to
`In Progress` as the sole active G4 item while preserving every implementation and post-Build evidence
condition. No production, cloud, external release or TP-2–TP-6 authority is created.
