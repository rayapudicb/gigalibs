# GigaLibs delivery-agent roster

This roster imports and adapts all 18 agent roles from the local `TextFly/docs/agents` source inventory for
GigaLibs. TextFly product names, host assumptions, notification channels, and repository paths are not
copied as GigaLibs requirements. Provenance and mappings are recorded in
`.pi/AGENT_IMPORT_PROVENANCE.md`.

The additional `agile_delivery_orchestrator` role controls flow and evidence. Agents do not self-approve
their own high-risk work, and no agent replaces named human product, risk, legal, or release authority.

## Required operating sequence

```text
Agile Delivery Orchestrator
→ Requirements Spec
→ Solution Architecture + Tenant Identity Access + Trust/Safety
→ API Contracts + Data Portability
→ Backend / Plugin Runtime / Integration / Communication / Web producers as applicable
→ Infrastructure & Observability
→ QA Spec independent verification
→ Release Operations
→ Documentation Enablement + selective Study Guide Sync
→ human release decision
→ production observation
→ outcome enhancement or next module
```

Only one module may be in production implementation at a time. Independent review and release work may
overlap, but a second module cannot enter Build until the current module enters Review or is explicitly
Blocked with containment.
