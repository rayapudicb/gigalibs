# Canonical owners of business concepts (decision D4)

One owner per concept; every other module refers to it by id and keeps only what it needs (a snapshot on a document,
or its own details keyed by the owner's id). Moves follow the D9 migration template
(`docs/plans/platform-implementation-plan.md`). Status per row: **Decided** (owner decision recorded) or **Open**.

| Concept | Owner | Others keep | Status | Source |
| --- | --- | --- | --- | --- |
| Place identity (site, building, floor, zone) | Geospatial (`spatial_nodes`) | CMMS keeps facility details keyed by place id (areas, use, CAD/BIM references); CMMS spaces migrate under their site | **Decided** 2026-10-06 | ADR-0006 (accepted 2026-10-06) |
| Organization unit (department, team, site organization) | Control plane organization units | Legacy departments and CMMS departments map to units; historical documents keep a department snapshot | **Decided** (ADR-0018 accepted 2026-10-01) | ADR-0018 |
| Worker (a person or crew who performs work) | Workforce `workforce_resources`, linked to a login by `platform_user_id` | WFO workers migrate onto it (U20a); CMMS keeps a projection fed by Workforce events | **Open** until ADR-0003 is accepted (D5) | ADR-0003 D7, ADR-0007 |
| Party (customer, vendor, organization, person as counterparty) | Core Parties | Documents keep the name and address they were issued with | **Open** | ADR-0020 |
| Stock (on hand, reservations, movements) | Universal Inventory commands | CMMS parts issue and return through Inventory | **Open** | EAM-005, U8 |
| Customer invoice | Accounts Receivable | Orders hand off to AR | **Open** | ADR-0026, U22 |
| Vendor invoice | Procurement (payables) | Spend reimbursements flow into payables | **Open** | ADR-0023 |
| Asset | CMMS operational asset; Finance fixed asset | Each linked to the other; neither duplicates the other's fields | **Open** | ADR-0028, U14 |
| Product, unit of measure, price | Product Catalogue | Others refer by id; documents keep prices they used | **Decided** (U7 on UAT) | ADR-0021 |
| Login and workspace membership | Control plane | Modules see only the signed context | **Decided** | ADR-0003 D1 |
