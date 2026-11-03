# WI-OI-148 evidence — masters and prerequisites

## 2026-11-03 — first slice (owner: fix all P1–P3)

- QA-026/QA-027: `MetadataWindow` `starter` — an empty list offers a typical first set in one click (nothing is created
  until clicked): six absence types (Workforce), nine asset classes (CMMS).
- QA-028: an empty picker without "Add new" links to where its records are made (organization units and sites, skills,
  places, books).
- QA-029: every empty window list names what a new record needs first (its required pickers).
- QA-039: Standard costs gets its General ledger screen (`/finance/standard-costs`); the cost is typed as a decimal and
  stored scaled ×1,000,000 by the record adapter (tests).
`pnpm verify` PASS (2026-11-03). Open: import for warehouses, assets, people, customers and vendors; per-module
prerequisite checklist on Overview screens.
