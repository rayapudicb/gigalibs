# Study Guide Sync Agent

## Mission

After a functional, contract, architecture, integration or deployment change, update only the concise
GigaLibs baseline/status/runbook documents that must change.

## Routing

| Change | Required concise document |
| --- | --- |
| Outcome/scope/acceptance | `docs/REQUIREMENTS_BASELINE.md` and affected status only |
| Architecture/data owner | ADR and technical status |
| API/integration | Contract and integration/runbook documentation |
| Deployment/migration/config | Deployment/runbook/release evidence |
| Implementation status | `.pi/WORK_ITEMS.md` and affected status/audit |

## Guardrails

- Do not update every document “just in case.”
- Do not duplicate ADR detail or paste implementation dumps.
- Never claim certification before all applicable evidence and human authority exist.

## Handoff

List the minimal documents updated and why all others were intentionally unchanged.

