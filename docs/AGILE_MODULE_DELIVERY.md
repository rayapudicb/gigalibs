# Agile production-module delivery loop

Status: adopted  
Process owner: Agile Delivery Orchestrator

## Goal

Deliver one measurable production capability, close its real gaps, prove it through independent evidence,
then either enhance its business outcome from observed results or start the next highest-value Ready module.

## Flow and WIP

```text
Outcome hypothesis
→ repository/runtime gap discovery
→ Ready story and acceptance/negative cases
→ architecture + threat + data + contract review
→ one production vertical slice in Build
→ module-completeness review
→ independent verification/UAT
→ release evidence + human authorization
→ canary/production observation
→ measured outcome review
↳ enhance the same module, retire it, or select the next Ready module
```

- WIP limit: one module in Build.
- Independent QA/security/release review may overlap once code enters Review.
- A new module cannot be used to escape open P0/P1, unsafe migration, fake success or recovery debt in the
  current module.
- Blocked external/human decisions are recorded explicitly; safe work may move to the next Ready item only
  when the current item is contained.

## Iteration packet

Every iteration must state:

1. Business outcome, user/role and measurable success definition.
2. Work item plus FR/NFR IDs.
3. Existing behavior, confirmed gaps and non-goals.
4. Authoritative data source, models, classifications, retention and lineage.
5. API/event contracts, security/tenant policy and failure/recovery behavior.
6. UI states and accessibility impact.
7. Migration, compatibility, observability, runbook and release impact.
8. Unit, contract, integration, isolation, migration, performance, accessibility and E2E evidence required.
9. Independent reviewers and human decisions.
10. Production metric and review date that will drive the next enhancement.

## Selection score

The Product Requirements and Product Owner Advisor roles rank Ready work using evidenced value, signed
demand, shared-platform leverage, risk reduction, source readiness and delivery cost. Illustrative industry
ROI or a package name receives no value credit. Safety/regulatory risk can lower automation scope or make a
candidate advisory-only.

## Production states

| State | Claim allowed |
| --- | --- |
| Proposed | Product idea only |
| Ready | Requirements/design dependencies resolved |
| In Progress | Being implemented; not usable as a product claim |
| Review | Integrated candidate with pending independent evidence |
| Accepted | Human product/control acceptance recorded for the target environment |
| Released | Authorized artifact deployed to a cohort |
| Production Proven | Released module met defined SLO/outcome through its observation window |

“Production ready” requires G5 evidence and G6 human release authorization. “Production proven” additionally
requires G7 operating evidence.

## Current application

The Release 1 AP reference outcome is in Review, not Released: its connected functional certifications and
aggregate control/execution metrics pass, but distributed tracing/approved alerts and SLOs,
supply-chain/security scanning, performance/resilience, accessibility/usability,
migration/restore/DR and independent acceptance remain. These are the current module's next work; Release 2
does not enter Build until the Release 1 P0/P1 gate is resolved or formally contained.
