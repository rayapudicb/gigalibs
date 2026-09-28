# WI-OI-046 IAM/Tenancy decision

Date: 2026-09-24  
Reviewer: Harsha Koganti  
Responsibility: Independent IAM/Tenancy reviewer  
Decision: Accept  
Scope: SP-01 and SP-03 for bounded Local Development TP-1

Evidence reviewed:

- `docs/reviews/WI-OI-046-iam-tenancy-decision-request-2026-09-24.md`;
- the frozen WI-OI-046 design evidence; and
- `docs/reviews/WI-OI-046-iam-tenancy-human-checklist-2026-09-24.md`.

## Verbatim reviewer declaration

> I, Harsha Koganti, reviewed WI-OI-046 as the independent IAM/Tenancy reviewer against
> docs/reviews/WI-OI-046-iam-tenancy-decision-request-2026-09-24.md and the frozen WI-OI-046 design
> evidence.
>
> My decision for SP-01 and SP-03 in the bounded Local Development TP-1 slice is Accept.
>
> Conditions/findings: The implementation must use current durable tenant, user, membership, permission
> and tenant-access entitlement authority. Preview must remain tenant-bound, require both permissions and
> never establish normal cohort membership.
>
> I confirm the existing tests prove only the current authority foundation and do not claim TP-1 is
> implemented. I am independent from the implementation producer. This does not waive Security review or
> authorize production, cloud, external release or TP-2–TP-6.
>
> Date: 2026-09-24.

## Recorded boundary

This accepts the WI-OI-046 IAM/Tenancy design for SP-01 and SP-03 subject to the stated implementation
and post-Build proof requirements. It does not constitute the separate Security & Privacy decision, does
not prove TP-1 implementation and does not authorize G4 by itself.
