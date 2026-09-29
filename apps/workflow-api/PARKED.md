# Parked: the Python execution plane

The owner parked this service on 2026-09-29 (ADR-0016 F12, WI-OI-102b/f). It is not part of the active product:
- it is not in the local stack;
- its tests are not part of `pnpm test` (run them by hand with `pnpm test:execution-api`).

Workflow belongs to the Workflow Studio module (ADR-0016 F3). This service is reconsidered as the AI/ML worker when
the AI gateway (C11) is designed. Until then, change it only with the owner's approval.
