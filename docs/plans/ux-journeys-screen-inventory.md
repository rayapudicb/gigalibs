# UX journeys — screen inventory (generated)

Measured read-only on UAT 5180 (release `c88a88d4`) on 2026-11-02 as the walkthrough workspace administrator, at
1440×900, by `e2e/ux-benchmark/bench.mjs`. Regenerate with `node e2e/ux-benchmark/inventory.mjs <data> <out>` after a
new run. "Ready" is navigation start to network idle (15 s means it never settled). "Form" is the New form opened and
closed without saving: controls / required / pickers. Plan items name the work item that owns them.

## Screens

| Screen | Breadcrumb | Ready | Rows | State | Failed call | Form | Plan |
|---|---|---:|---:|---|---|---|---|
| `/actions` | Finance › Invoice approvals | 688 ms | 0 | empty: No approval actions found | — | — | P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/analytics` | Intelligence › Analytics › Overview | 986 ms | 0 | ok | GET /api/analytics/v1/module-sources/23fbcffa-b28e-461f-946f-faebf45ad8d0/catalo | — | P1 sources the person may not read: hide or explain, grant to admin role: WI-OI-147 |
| `/analytics/dashboards` | Intelligence › Analytics › Dashboards | 938 ms | 0 | empty: No dashboards yet | — | — | P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/analytics/explore` | Intelligence › Analytics › Explore | 876 ms | 0 | empty: No models yet | — | — | P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/analytics/places` | Intelligence › Analytics › Places | 858 ms | 0 | empty: not set up yet: an administrator activates the Operations metric catalogue in Configuration Studio → Catalogues | — | — | P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/analytics/reports` | Intelligence › Analytics › Reports | 953 ms | 0 | empty: No reports yet | — | — | P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/analytics/sources` | Intelligence › Analytics › Sources | 1173 ms | 36 | ok | — | — | — |
| `/ap` | Finance › Invoice matching | 810 ms | 0 | ok | — | — | — |
| `/business-partners` | Finance › Business partners | 836 ms | 0 | error: Could not load records business-partners.partners cannot be sorted by  | GET /api/business-partners/v1/records/business-partners.partners → 400 | — | P0 default sort not allowed by the API: WI-OI-146 |
| `/cmms` | Operations › Asset maintenance › Overview | 899 ms | 1 | ok | — | — | — |
| `/cmms/analytics` | Operations › Asset maintenance › Reliability | 868 ms | 0 | error: Missing module permission: cmms.analytics.read | GET /api/analytics/v1/module-sources/23fbcffa-b28e-461f-946f-faebf45ad8d0/catalo | — | P1 sources the person may not read: hide or explain, grant to admin role: WI-OI-147 |
| `/cmms/assets` | Operations › Asset maintenance › Assets | 933 ms | 1 | ok | GET /api/maps/nodes → 502 | — | P0 Geospatial not running: deploy it or degrade place pickers gracefully: WI-OI-146 |
| `/cmms/calibration` | Operations › Asset maintenance › Calibration | 1111 ms | 0 | empty: No calibrated instruments yet | — | — | P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/cmms/classifications` | Operations › Asset maintenance › Classifications | 1008 ms | 0 | empty: No records yet | — | 4/2/1 | P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/cmms/commissioning` | Operations › Asset maintenance › Commissioning | 886 ms | 0 | ok | — | — | — |
| `/cmms/fleet` | Operations › Asset maintenance › Fleet readiness | 875 ms | 0 | ok | — | — | — |
| `/cmms/inventory` | Operations › Asset maintenance › Parts | 1034 ms | 1 | ok | GET /api/maps/nodes → 502 | — | P0 Geospatial not running: deploy it or degrade place pickers gracefully: WI-OI-146 |
| `/cmms/meters` | Operations › Asset maintenance › Meters | 1250 ms | 0 | ok | — | — | — |
| `/cmms/permits` | Operations › Asset maintenance › Permits & LOTO | 819 ms | 0 | empty: Nothing isolated | — | — | P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/cmms/request-links` | Operations › Asset maintenance › QR request links | 803 ms | 0 | ok | — | — | — |
| `/cmms/requests` | Operations › Asset maintenance › Requests | 1024 ms | 2 | ok | — | 7/2/1 | — |
| `/cmms/schedules` | Operations › Asset maintenance › Preventive maintenance | 971 ms | 1 | ok | — | 12/4/0 | — |
| `/cmms/sop` | Operations › Asset maintenance › Work instructions | 880 ms | 0 | ok | — | 9/5/0 | — |
| `/cmms/spaces` | Operations › Asset maintenance › Spaces | 903 ms | 0 | ok | — | 8/3/0 | — |
| `/cmms/spares` | Operations › Asset maintenance › Visual spares | 884 ms | 1 | ok | — | — | — |
| `/cmms/work-orders` | Operations › Asset maintenance › Work orders | 1021 ms | 1 | ok | GET /api/maps/nodes → 502 | 11/1/0 | P0 Geospatial not running: deploy it or degrade place pickers gracefully: WI-OI-146 |
| `/configuration` | Settings › Forms & apps | 827 ms | 0 | ok | — | — | — |
| `/connections` | Settings › Connections › Connections | 15144 ms | 0 | ok | — | — | P1 never settles (polling or retrying): stop after failure, cap retries: WI-OI-149 |
| `/connections/credentials` | Settings › Connections › Credentials | 966 ms | 0 | ok | — | — | — |
| `/connections/oauth-studio` | Settings › Connected apps | 731 ms | 1 | empty: No active connections configured yet | — | — | P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/dashboard` | Executive Control Tower | 928 ms | 0 | ok | — | — | — |
| `/exceptions` | Settings › Processing exceptions | 828 ms | 0 | ok | — | — | — |
| `/finance` | Finance › General ledger › Journal entries | 1167 ms | 6 | ok | — | 4/3/1 | — |
| `/finance/accounts` | Finance › General ledger › Chart of accounts | 819 ms | 22 | ok | — | 10/6/2 | P1 New form asks 6 required fields: defaults and auto-fill (WI-OI-149) |
| `/finance/books` | Finance › General ledger › Books | 1464 ms | 1 | ok | — | 6/0/0 | — |
| `/finance/periods` | Finance › General ledger › Periods | 950 ms | 12 | ok | — | — | — |
| `/finance/posted-journals` | Finance › General ledger › Posted journals | 876 ms | 6 | ok | — | — | — |
| `/finance/reports` | Finance › General ledger › Reports | 905 ms | 0 | ok | — | — | — |
| `/finance/set-up` | Finance › General ledger › Set up a book | 839 ms | 0 | ok | — | — | — |
| `/gigaops` | Operations › Workforce › Overview | 853 ms | 0 | empty: no workforce records yet | — | — | P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/gigaops/analytics` | Operations › Workforce › Analytics & trends | 852 ms | 0 | error: Missing module permission: workforce.positions.read | GET /api/analytics/v1/module-sources/6cdfa18f-14b1-4751-88f0-1ae17ba3cb28/catalo | — | P1 sources the person may not read: hide or explain, grant to admin role: WI-OI-147 |
| `/gigaops/availability` | Operations › Workforce › Availability | 728 ms | 0 | empty: No records yet | — | 5/4/2 | P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/gigaops/bookings` | Operations › Workforce › Bookings | 891 ms | 0 | empty: No records yet | — | — | P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/gigaops/capabilities` | Operations › Workforce › Skills & qualifications | 978 ms | 0 | ok | — | — | — |
| `/gigaops/jobs` | Operations › Workforce › Jobs & positions | 1431 ms | 0 | ok | GET /api/maps/nodes → 502 | 7/3/0 | P0 Geospatial not running: deploy it or degrade place pickers gracefully: WI-OI-146 |
| `/gigaops/logbook` | Operations › Workforce › Shift logbook | 912 ms | 0 | empty: No logbooks yet | — | — | P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/gigaops/pay` | Operations › Workforce › Pay-ready outputs | 1565 ms | 0 | ok | — | — | — |
| `/gigaops/resources` | Operations › Workforce › People | 770 ms | 0 | empty: No records yet | — | 4/3/1 | P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/gigaops/scheduling` | Operations › Workforce › Scheduling & dispatch | 720 ms | 0 | empty: No demand yet | GET /api/maps/nodes → 502 | 5/3/0 | P0 Geospatial not running: deploy it or degrade place pickers gracefully: WI-OI-146; P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/gigaops/time` | Operations › Workforce › Time & attendance | 1479 ms | 0 | empty: Nothing is waiting | GET /api/maps/nodes → 502 | — | P0 Geospatial not running: deploy it or degrade place pickers gracefully: WI-OI-146; P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/inventory` | Operations › Inventory › Warehouses | 766 ms | 0 | error: Could not load records The service is unavailable. Try again shortly.  | GET /api/universal-inventory/v1/records/inventory.warehouses → 500 | 6/4/0 | P0 service error 500: WI-OI-146 |
| `/inventory/availability` | Operations › Inventory › Availability | 15333 ms | 0 | error: Could not load warehouses. | — | — | P1 never settles (polling or retrying): stop after failure, cap retries: WI-OI-149 |
| `/inventory/balances` | Operations › Inventory › Balances | 880 ms | 0 | error: Could not load records The service is unavailable. Try again shortly.  | GET /api/universal-inventory/v1/records/inventory.balances → 500 | — | P0 service error 500: WI-OI-146 |
| `/inventory/barcode` | Operations › Inventory › Barcode lookup | 781 ms | 0 | ok | — | — | — |
| `/inventory/items` | Operations › Inventory › Items | 825 ms | 0 | error: Could not load records The service is unavailable. Try again shortly.  | GET /api/universal-inventory/v1/records/inventory.items → 500 | 10/1/3 | P0 service error 500: WI-OI-146; P2 3 pickers: inline "Add new" on each (WI-OI-148) |
| `/inventory/ledger` | Operations › Inventory › Stock ledger | 905 ms | 0 | error: Could not load records The service is unavailable. Try again shortly.  | GET /api/universal-inventory/v1/records/inventory.ledger → 500 | — | P0 service error 500: WI-OI-146 |
| `/inventory/lots` | Operations › Inventory › Lots | 1093 ms | 0 | error: Could not load records The service is unavailable. Try again shortly.  | GET /api/universal-inventory/v1/records/inventory.lots → 500 | 6/2/1 | P0 service error 500: WI-OI-146 |
| `/inventory/movement-costs` | Operations › Inventory › Movement costs | 751 ms | 0 | error: Could not load records The service is unavailable. Try again shortly.  | GET /api/universal-inventory/v1/records/inventory.cost-layers → 500 | — | P0 service error 500: WI-OI-146 |
| `/inventory/posted-receipt-costs` | Operations › Inventory › Posted receipt costs | 897 ms | 0 | error: Could not load records The service is unavailable. Try again shortly.  | GET /api/universal-inventory/v1/records/inventory.posted-receipt-costs → 500 | — | P0 service error 500: WI-OI-146 |
| `/inventory/receipts` | Operations › Inventory › Receipts | 958 ms | 0 | error: Could not load records The service is unavailable. Try again shortly.  | GET /api/universal-inventory/v1/records/inventory.receipts → 500 | 3/1/1 | P0 service error 500: WI-OI-146 |
| `/inventory/replenishment` | Operations › Inventory › Replenishment | 15214 ms | 0 | error: Could not load warehouses. | — | — | P1 never settles (polling or retrying): stop after failure, cap retries: WI-OI-149 |
| `/inventory/reservations` | Operations › Inventory › Reservations | 873 ms | 0 | error: Could not load records The service is unavailable. Try again shortly.  | GET /api/universal-inventory/v1/records/inventory.reservations → 500 | — | P0 service error 500: WI-OI-146 |
| `/inventory/transfers` | Operations › Inventory › Transfers | 899 ms | 0 | empty: Nothing here | — | — | P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/inventory/valuation` | Operations › Inventory › Valuation setup | 929 ms | 0 | ok | — | — | — |
| `/inventory/warehouse-map` | Operations › Inventory › Warehouse map | 15159 ms | 0 | error: Could not load warehouses. | — | — | P1 never settles (polling or retrying): stop after failure, cap retries: WI-OI-149 |
| `/iot` | Operations › IoT Gateway › Overview | 871 ms | 0 | ok | — | — | — |
| `/iot/alerts` | Operations › IoT Gateway › Alerts | 831 ms | 0 | ok | — | — | — |
| `/iot/devices` | Operations › IoT Gateway › Devices | 1022 ms | 0 | ok | — | 1/0/0 | — |
| `/iot/discovery` | Operations › IoT Gateway › Discovery | 817 ms | 0 | ok | — | — | — |
| `/iot/protocols` | Operations › IoT Gateway › Protocols | 1186 ms | 5 | ok | — | — | — |
| `/iot/rules` | Operations › IoT Gateway › Rules | 826 ms | 0 | ok | — | — | — |
| `/maps` |  | 836 ms | 0 | ok | GET /api/maps/nodes → 502 | — | P0 Geospatial not running: deploy it or degrade place pickers gracefully: WI-OI-146 |
| `/modules` | Home | 1110 ms | 0 | ok | — | — | — |
| `/operator-rounds` | Operations › Inspection rounds › Routes | 1090 ms | 0 | ok | GET /api/operator-rounds/v1/skips → 503 | — | P0 organization version not delivered; show "Send organization to modules" action: WI-OI-146/147 |
| `/operator-rounds/board` | Operations › Inspection rounds › Live board | 871 ms | 0 | empty: No assignments yet | GET /api/operator-rounds/v1/exceptions → 503 | — | P0 organization version not delivered; show "Send organization to modules" action: WI-OI-146/147; P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/operator-rounds/exceptions` | Operations › Inspection rounds › Exceptions | 799 ms | 0 | ok | GET /api/operator-rounds/v1/routes → 503 | — | P0 organization version not delivered; show "Send organization to modules" action: WI-OI-146/147 |
| `/operator-rounds/skips` | Operations › Inspection rounds › Skip approvals | 778 ms | 0 | ok | GET /api/operator-rounds/v1/routes → 503 | — | P0 organization version not delivered; show "Send organization to modules" action: WI-OI-146/147 |
| `/orders` | Finance › Orders › Quotes | 1047 ms | 0 | error: Could not load records This is not set up for your workspace yet. Ask  | GET /api/universal-orders/v1/records/orders.sales-quotes → 404 | 13/10/3 | P0 records route answers 404 (entity not registered for the workspace): WI-OI-146; P1 New form asks 10 required fields: defaults and auto-fill (WI-OI-149); P2 3 pickers: inline "Add new" on each (WI-OI-148) |
| `/orders/credit-memos` | Finance › Orders › Credit memos | 910 ms | 0 | error: Could not load records This is not set up for your workspace yet. Ask  | GET /api/universal-orders/v1/records/orders.customer-credit-memos → 404 | 9/5/0 | P0 records route answers 404 (entity not registered for the workspace): WI-OI-146 |
| `/orders/fulfillment` | Finance › Orders › Fulfillment | 818 ms | 0 | error: Could not load records This is not set up for your workspace yet. Ask  | GET /api/universal-orders/v1/records/orders.fulfillment-orders → 404 | 6/4/1 | P0 records route answers 404 (entity not registered for the workspace): WI-OI-146 |
| `/orders/invoices` | Finance › Orders › Invoices | 1010 ms | 0 | error: Could not load records This is not set up for your workspace yet. Ask  | GET /api/universal-orders/v1/records/orders.customer-invoices → 404 | 3/2/0 | P0 records route answers 404 (entity not registered for the workspace): WI-OI-146 |
| `/orders/sales-orders` | Finance › Orders › Sales orders | 766 ms | 0 | error: Could not load records This is not set up for your workspace yet. Ask  | GET /api/universal-orders/v1/records/orders.sales-orders → 404 | 14/10/5 | P0 records route answers 404 (entity not registered for the workspace): WI-OI-146; P1 New form asks 10 required fields: defaults and auto-fill (WI-OI-149); P2 5 pickers: inline "Add new" on each (WI-OI-148) |
| `/procurement` | Finance › Procurement › Requisitions | 768 ms | 0 | error: Could not load records This is not set up for your workspace yet. Ask  | GET /api/universal-procurement/v1/records/procurement.requisitions → 404 | 9/7/3 | P0 records route answers 404 (entity not registered for the workspace): WI-OI-146; P1 New form asks 7 required fields: defaults and auto-fill (WI-OI-149); P2 3 pickers: inline "Add new" on each (WI-OI-148) |
| `/procurement/debit-memos` | Finance › Procurement › Debit memos | 802 ms | 0 | error: Could not load records This is not set up for your workspace yet. Ask  | GET /api/universal-procurement/v1/records/procurement.debit-memos → 404 | 10/6/1 | P0 records route answers 404 (entity not registered for the workspace): WI-OI-146; P1 New form asks 6 required fields: defaults and auto-fill (WI-OI-149) |
| `/procurement/landed-cost` | Finance › Procurement › Landed cost | 752 ms | 0 | ok | — | — | — |
| `/procurement/purchase-orders` | Finance › Procurement › Purchase orders | 1193 ms | 0 | error: Could not load records This is not set up for your workspace yet. Ask  | GET /api/universal-procurement/v1/records/procurement.purchase-orders → 404 | 12/10/5 | P0 records route answers 404 (entity not registered for the workspace): WI-OI-146; P1 New form asks 10 required fields: defaults and auto-fill (WI-OI-149); P2 5 pickers: inline "Add new" on each (WI-OI-148) |
| `/procurement/vendor-bills` | Finance › Procurement › Vendor bills | 958 ms | 0 | error: Could not load records This is not set up for your workspace yet. Ask  | GET /api/universal-procurement/v1/records/procurement.vendor-bills → 404 | 11/8/2 | P0 records route answers 404 (entity not registered for the workspace): WI-OI-146; P1 New form asks 8 required fields: defaults and auto-fill (WI-OI-149) |
| `/products` | Operations › Products › Products | 849 ms | 9 | ok | — | 12/4/2 | — |
| `/products/attributes` | Operations › Products › Attributes | 758 ms | 0 | empty: No records yet | — | 9/3/0 | P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/products/catalogue-versions` | Operations › Products › Catalogue versions | 1015 ms | 1 | ok | — | 4/1/1 | — |
| `/products/catalogues` | Operations › Products › Catalogues | 1058 ms | 1 | ok | — | 5/2/0 | — |
| `/products/categories` | Operations › Products › Categories | 794 ms | 2 | ok | — | 5/2/1 | — |
| `/products/import-export` | Operations › Products › Import & export | 905 ms | 0 | ok | — | — | — |
| `/products/price-list-versions` | Operations › Products › Price-list versions | 947 ms | 3 | ok | — | 4/2/1 | — |
| `/products/price-lists` | Operations › Products › Price lists | 1147 ms | 1 | ok | — | 8/3/0 | — |
| `/products/price-resolver` | Operations › Products › Price resolver | 1164 ms | 0 | ok | — | — | — |
| `/products/units` | Operations › Products › Units | 819 ms | 8 | ok | — | 8/4/0 | — |
| `/project-operations` | Operations › Projects | 1002 ms | 0 | ok | — | — | — |
| `/runs` | Settings › Run history | 903 ms | 0 | empty: No execution runs found | — | — | P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/safety-operations` | Operations › Safety › Stop work | 745 ms | 0 | ok | — | — | — |
| `/safety-operations/contractors` | Operations › Safety › Contractors | 833 ms | 0 | ok | — | — | — |
| `/safety-operations/insights` | Operations › Safety › Insights | 949 ms | 0 | ok | — | — | — |
| `/safety-operations/reports` | Operations › Safety › Reports | 913 ms | 0 | empty: Nothing here | — | — | P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/safety-operations/triage` | Operations › Safety › Triage | 770 ms | 0 | empty: Nothing here | — | — | P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/settings` | Settings › Workspace settings › Team & access | 811 ms | 7 | ok | — | — | — |
| `/settings/general` | Settings › Workspace settings › General & localization | 892 ms | 0 | ok | GET /api/control/configuration/runtime/manifest/current → 404 | — | — |
| `/settings/organization` | Settings › Workspace settings › Organization & hierarchy | 934 ms | 6 | ok | GET /api/maps/nodes → 502 | — | P0 Geospatial not running: deploy it or degrade place pickers gracefully: WI-OI-146 |
| `/settings/people` | Settings › Workspace settings › People | 737 ms | 0 | ok | — | — | — |
| `/settings/plan` | Settings › Workspace settings › Plan & entitlements | 837 ms | 0 | ok | — | — | — |
| `/settings/profile` | Settings › My profile & security | 846 ms | 0 | ok | — | — | — |
| `/settings/security` | Settings › Workspace settings › Security & SSO | 959 ms | 0 | error: Unexpected end of JSON input | — | — | P0 "Unexpected end of JSON input": empty response parsed as JSON: WI-OI-146 |
| `/speed` | Intelligence › Process safety (SPEED) | 1182 ms | 1 | ok | — | 5/3/2 | — |
| `/speed/audit` | Intelligence › Process safety (SPEED) › Audit trail | 890 ms | 15 | ok | — | — | — |
| `/speed/criteria` | Intelligence › Process safety (SPEED) › Screening criteria | 1539 ms | 1 | empty: No criteria set is in force yet | — | — | P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/speed/library` | Intelligence › Process safety (SPEED) › Screening library | 974 ms | 1 | empty: No library is in force yet | — | — | P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/speed/outcomes` | Intelligence › Process safety (SPEED) › Outcomes | 943 ms | 0 | ok | — | — | — |
| `/speed/projects` | Intelligence › Process safety (SPEED) › Projects | 933 ms | 1 | ok | — | 5/3/2 | — |
| `/speed/routes` | Intelligence › Process safety (SPEED) › Routes | 914 ms | 1 | ok | — | 2/2/1 | — |
| `/speed/substances` | Intelligence › Process safety (SPEED) › Substances | 897 ms | 0 | empty: No records yet | — | 6/2/1 | P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/universal-manufacturing` | Operations › Manufacturing › Overview | 920 ms | 0 | ok | — | — | — |
| `/universal-manufacturing/boms` | Operations › Manufacturing › BOMs | 878 ms | 0 | ok | — | — | — |
| `/universal-manufacturing/mrp` | Operations › Manufacturing › MRP preview | 873 ms | 0 | ok | — | — | — |
| `/universal-manufacturing/production` | Operations › Manufacturing › Production | 817 ms | 0 | ok | — | — | — |
| `/universal-returns` | Finance › Returns | 754 ms | 1 | empty: No returns yet | — | — | P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/value` | Intelligence › Business value | 856 ms | 0 | ok | — | — | — |
| `/workflows` | Settings › Workflows › Workflows | 798 ms | 0 | empty: No Orchestration Pipelines Found | GET /api/workflow-studio/workflows → 502 | 5/2/0 | P0 Workflow Studio not running: deploy or hide: WI-OI-146; P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148 |
| `/workflows/api-keys` | Settings › Workflows › API keys | 945 ms | 0 | ok | GET /api/workflow-studio/api-keys → 502 | 8/0/0 | P0 Workflow Studio not running: deploy or hide: WI-OI-146 |
| `/workflows/templates` | Settings › Workflows › Templates | 871 ms | 0 | ok | GET /api/workflow-studio/workflows → 502 | 5/2/0 | P0 Workflow Studio not running: deploy or hide: WI-OI-146 |

## Metadata windows (labels, fields, masters)

From `packages/contracts/src/configuration/window-baselines.generated.ts` (each module's `dictionary/*.window.json`).
Masters: the lookup each picker reads and how many options it returned for the workspace (`HTTP n` = the lookup fails).

| Module | Window | Route | Fields | Required | Required fields | Pickers → masters | Label problems | Help |
|---|---|---|---:|---:|---|---|---|---:|
| accounts-receivable | Customers | `/ar` | 4 | 2 | Legal name, Billing email | — | — | 0 |
| accounts-receivable | Invoices | `/ar` | 8 | 6 | Customer, Owning organization unit, Issue date, Due date, Line description, Line unit amount (minor) | — | Total (minor units), Amount due (minor units) | 0 |
| business-partners | Credit exposure | `/business-partners` | 0 | 0 |  | — | Credit limit (minor units), Exposure (minor units), Available (minor units) | 0 |
| business-partners | Credit holds | `/business-partners` | 0 | 0 |  | — | Party id | 0 |
| business-partners | Credit gauge | `/business-partners` | 0 | 0 |  | — | — | 0 |
| business-partners | AR/AP netting | `/business-partners` | 0 | 0 |  | — | — | 0 |
| business-partners | Partners | `/business-partners` | 0 | 0 |  | — | — | 0 |
| financial-operations | Chart of accounts | `/finance` | 10 | 6 | Book, Code, Name, Class, Subtype, Normal balance | *Book → finance-books (1); Parent account → finance-accounts (22) +new | — | 2 |
| financial-operations | Books | `/finance` | 6 | 0 |  | — | — | 0 |
| financial-operations | Journal entry | `/finance` | 9 | 4 | Book, Posting date, Description, Account | *Book → finance-books (1); *Account → finance-accounts (22) +new | Total debits (minor units), Total credits (minor units), Debit (minor units), Credit (minor units) | 3 |
| financial-operations | Posted journals | `/finance` | 0 | 0 |  | — | Total debits (minor units), Total credits (minor units), Debit (minor units), Credit (minor units) | 0 |
| financial-operations | Periods | `/finance` | 0 | 0 |  | — | — | 0 |
| financial-operations | Standard costs | `/finance` | 6 | 4 | Cost profile, Product, Standard unit cost (scaled), Effective from | — | — | 0 |
| gigaops | Absence types | `/gigaops/availability` | 4 | 2 | Code, Name | — | — | 2 |
| gigaops | Absence requests | `/gigaops/availability` | 5 | 4 | Person, Absence type, From, Until | *Person → wf-resources (0) +new; *Absence type → wf-absence-types (0) +new | — | 2 |
| gigaops | Bookings | `/gigaops/bookings` | 0 | 0 |  | — | — | 0 |
| gigaops | Site calendars | `/gigaops/availability` | 3 | 2 | Code, Name | Site → workspace-sites (HTTP 502) | — | 1 |
| gigaops | Closures | `/gigaops/availability` | 3 | 3 | Calendar, Date, Label | *Calendar → wf-calendars (0) +new | — | 1 |
| gigaops | My absences | `/gigaops/availability` | 4 | 3 | Absence type, From, Until | *Absence type → wf-absence-types (0) +new | — | 2 |
| gigaops | People | `/gigaops/resources` | 21 | 14 | Reference code, Display name, Type, Resource, Skill, Valid from, Person, Starts on, Time zone, Working hours, Person, Absence type, From, Until | Linked login → workspace-members (5); *Resource → wf-resources (0) +new; *Skill → wf-capabilities (0); *Person → wf-resources (0) +new; *Person → wf-resources (0) +new; *Absence type → wf-absence-types (0) +new | — | 8 |
| gigaops | Working weeks | `/gigaops/availability` | 5 | 4 | Person, Starts on, Time zone, Working hours | *Person → wf-resources (0) +new | — | 3 |
| physical-operations-cmms | Assets | `/cmms/assets` | 20 | 2 | Asset tag, Asset name | Parent asset → cmms-assets (1) +new; CAFM space → cmms-spaces (2) +new; Classification → cmms-classifications (0) +new | Asset ID, Spec definition ID, Attribute key | 1 |
| physical-operations-cmms | Classifications | `/cmms/classifications` | 12 | 5 | Classification code, Classification name, Attribute key, Label, Data type | Parent classification → cmms-classifications (0) +new | Classification ID, Attribute key | 1 |
| physical-operations-cmms | Meters | `/cmms/meters` | 10 | 6 | Meter name, Asset, Unit, Reading type, Reading value, Timestamp | *Asset → cmms-assets (1) +new | Meter ID | 2 |
| physical-operations-cmms | MRO Parts | `/cmms/inventory` | 19 | 5 | Part number, Part name, Unit of measure, Movement type, Quantity change | — | Part ID, Storeroom ID | 1 |
| physical-operations-cmms | Requests | `/cmms/requests` | 7 | 2 | Title, Priority | Asset → cmms-assets (1) +new | — | 1 |
| physical-operations-cmms | PM Schedules | `/cmms/schedules` | 13 | 7 | Schedule name, Asset, Frequency count, Frequency unit, Next due date, Work order title, Priority | *Asset → cmms-assets (1) +new | — | 1 |
| physical-operations-cmms | Spaces | `/cmms/spaces` | 10 | 3 | Space code, Space name, Space type | Parent space → cmms-spaces (2) +new | Space ID | 1 |
| physical-operations-cmms | Work orders | `/cmms/work-orders` | 26 | 10 | Title, Type, Priority, Task description, Technician, Hours, Date performed, Part, Quantity, Note | Asset → cmms-assets (1) +new; Assigned technician → workspace-members (5); *Part → cmms-parts (1) +new | — | 2 |
| process-safety-screening | Screening criteria | `/speed` | 0 | 0 |  | — | — | 0 |
| process-safety-screening | Library | `/speed` | 0 | 0 |  | — | — | 0 |
| process-safety-screening | Projects | `/speed` | 7 | 5 | Project code, Name, Site, Project, Route | *Site → speed-sites (2); Owner → workspace-members (5); *Project → speed-projects (1) +new | — | 1 |
| process-safety-screening | Routes | `/speed` | 2 | 2 | Project, Route | *Project → speed-projects (1) +new | — | 0 |
| process-safety-screening | Substances | `/speed` | 6 | 2 | Name, Formula | Library material → speed-library-materials (0) | — | 3 |
| product-catalogue | Attributes | `/products` | 9 | 3 | Code, Name, Value type | — | — | 1 |
| product-catalogue | Catalogue versions | `/products` | 8 | 2 | Catalogue, Product | *Catalogue → catalogue-catalogues (1) +new; *Product → catalogue-products (9) +new | — | 1 |
| product-catalogue | Catalogues | `/products` | 9 | 2 | Code, Name | Catalogue → catalogue-catalogues (1) +new | — | 0 |
| product-catalogue | Categories | `/products` | 5 | 2 | Code, Name | Parent category → catalogue-categories (2) +new | — | 0 |
| product-catalogue | Price-list versions | `/products` | 11 | 7 | Price list, Effective from, Product, Unit, List price (minor units), Standard price (minor units), Limit price (minor units) | *Price list → catalogue-price-lists (1) +new; *Product → catalogue-products (9) +new; *Unit → catalogue-uoms (8) +new | List price (minor units), Standard price (minor units), Limit price (minor units) | 3 |
| product-catalogue | Price lists | `/products` | 12 | 4 | Code, Name, Currency, Effective from | Price list → catalogue-price-lists (1) +new | — | 1 |
| product-catalogue | Products | `/products` | 12 | 4 | Code, Name, Type, Base unit | *Base unit → catalogue-uoms (8) +new; Category → catalogue-categories (2) +new | — | 1 |
| product-catalogue | Units | `/products` | 14 | 6 | Code, Name, Symbol, Dimension, To unit, Rate | From unit → catalogue-uoms (8) +new; *To unit → catalogue-uoms (8) +new; Only for product → catalogue-products (9) +new | — | 3 |
| universal-inventory | Balances | `/inventory` | 0 | 0 |  | — | — | 0 |
| universal-inventory | Cost layers | `/inventory` | 0 | 0 |  | — | — | 0 |
| universal-inventory | Items | `/inventory` | 10 | 1 | Product | *Product → catalogue-products (9) +new; Default warehouse → inventory-warehouses (HTTP 404) +new; Default location → inventory-locations (HTTP 500) | Standard cost (minor units) | 1 |
| universal-inventory | Stock ledger | `/inventory` | 0 | 0 |  | — | — | 0 |
| universal-inventory | Lots | `/inventory` | 6 | 2 | Product, Lot number | *Product → catalogue-products (9) +new | — | 0 |
| universal-inventory | Posted costs | `/inventory` | 0 | 0 |  | — | — | 0 |
| universal-inventory | Receipts | `/inventory` | 10 | 4 | Warehouse, Product, Unit, Expected quantity | *Warehouse → inventory-warehouses (HTTP 404) +new; *Product → catalogue-products (9) +new; *Unit → catalogue-uoms (8) +new; Put-away location → inventory-locations (HTTP 500) | — | 1 |
| universal-inventory | Reservations | `/inventory` | 0 | 0 |  | — | — | 0 |
| universal-inventory | Warehouse map | `/inventory` | 0 | 0 |  | — | — | 0 |
| universal-inventory | Warehouses | `/inventory` | 16 | 7 | Code, Name, Type, Owning organization unit, Code, Name, Type | Warehouse → inventory-warehouses (HTTP 404) +new | — | 1 |
| universal-orders | Credit memos | `/orders` | 9 | 5 | Customer party, Reason, Line quantity, Line unit price (minor), Line reason | — | Total (minor units) | 2 |
| universal-orders | Customer invoices | `/orders` | 3 | 2 | Sales order, Due date | — | Total (minor units) | 1 |
| universal-orders | Fulfillment orders | `/orders` | 6 | 4 | Sales order, Ship-from warehouse, Order line, Shipped quantity | *Ship-from warehouse → inventory-warehouses (HTTP 404) +new | — | 1 |
| universal-orders | Sales orders | `/orders` | 14 | 10 | Organization unit, Customer party, Customer name, Fulfillment warehouse, Line product, Line product code, Line product name, Line quantity, Line unit of measure | *Organization unit → organization-units (5); *Fulfillment warehouse → inventory-warehouses (HTTP 404) +new; *Line product → catalogue-products (9) +new; *Line unit of measure → catalogue-uoms (8) +new; Line warehouse → inventory-warehouses (HTTP 404) +new | Total (minor units) | 3 |
| universal-orders | Sales quotes | `/orders` | 13 | 10 | Organization unit, Customer party, Customer name, Valid until, Line product, Line product code, Line product name, Line quantity, Line unit of measure, Line uni | *Organization unit → organization-units (5); *Line product → catalogue-products (9) +new; *Line unit of measure → catalogue-uoms (8) +new | Total (minor units) | 2 |
| universal-procurement | Debit memos | `/procurement` | 10 | 6 | Vendor party, Reason, Line description, Line quantity, Line unit price (minor), Line reason | Line product → catalogue-products (9) +new | Total (minor units) | 2 |
| universal-procurement | Purchase orders | `/procurement` | 12 | 10 | Organization unit, Vendor party, Vendor name, Ship-to warehouse, Line product, Line product code, Line product name, Line quantity, Line unit of measure, Line u | *Organization unit → organization-units (5); *Ship-to warehouse → inventory-warehouses (HTTP 404) +new; *Line product → catalogue-products (9) +new; *Line unit of measure → catalogue-uoms (8) +new; Line ship-to warehouse → inventory-warehouses (HTTP 404) +new | Total (minor units) | 3 |
| universal-procurement | Requisitions | `/procurement` | 9 | 7 | Organization unit, Line product, Line product code, Line product name, Line quantity, Line unit of measure, Line estimated unit price (minor) | *Organization unit → organization-units (5); *Line product → catalogue-products (9) +new; *Line unit of measure → catalogue-uoms (8) +new | Estimated total (minor units) | 1 |
| universal-procurement | Vendor bills | `/procurement` | 11 | 8 | Vendor invoice #, Vendor party, Invoice date, Due date, Line description, Line quantity, Line unit of measure, Line unit price (minor) | *Line unit of measure → catalogue-uoms (8) +new; Line product → catalogue-products (9) +new | Total (minor units) | 3 |

## Masters behind the pickers

| Lookup | Options for the workspace | Used by |
|---|---:|---|
| `finance-books` | 1 | finance-accounts, finance-journal-drafts |
| `finance-accounts` | 22 | finance-accounts, finance-journal-drafts |
| `wf-resources` | 0 | wf-absences, wf-resources, wf-working-weeks |
| `wf-absence-types` | 0 | wf-absences, wf-my-absences, wf-resources |
| `workspace-sites` | fails (HTTP 502) | wf-calendars |
| `wf-calendars` | 0 | wf-closures |
| `workspace-members` | 5 | wf-resources, cmms-work-orders, speed-projects |
| `wf-capabilities` | 0 | wf-resources |
| `cmms-assets` | 1 | cmms-assets, cmms-meters, cmms-requests, cmms-schedules, cmms-work-orders |
| `cmms-spaces` | 2 | cmms-assets, cmms-spaces |
| `cmms-classifications` | 0 | cmms-assets, cmms-classifications |
| `cmms-parts` | 1 | cmms-work-orders |
| `speed-sites` | 2 | speed-projects |
| `speed-projects` | 1 | speed-projects, speed-routes |
| `speed-library-materials` | 0 | speed-substances |
| `catalogue-catalogues` | 1 | catalogue-catalogue-versions, catalogue-catalogues |
| `catalogue-products` | 9 | catalogue-catalogue-versions, catalogue-price-list-versions, catalogue-units, inventory-items, inventory-lots, inventory-receipts, orders-sales-orders, orders-sales-quotes, procurement-debit-memos, procurement-purchase-orders, procurement-requisitions, procurement-vendor-bills |
| `catalogue-categories` | 2 | catalogue-categories, catalogue-products |
| `catalogue-price-lists` | 1 | catalogue-price-list-versions, catalogue-price-lists |
| `catalogue-uoms` | 8 | catalogue-price-list-versions, catalogue-products, catalogue-units, inventory-receipts, orders-sales-orders, orders-sales-quotes, procurement-purchase-orders, procurement-requisitions, procurement-vendor-bills |
| `inventory-warehouses` | fails (HTTP 404) | inventory-items, inventory-receipts, inventory-warehouses, orders-fulfillment-orders, orders-sales-orders, procurement-purchase-orders |
| `inventory-locations` | fails (HTTP 500) | inventory-items, inventory-receipts |
| `organization-units` | 5 | orders-sales-orders, orders-sales-quotes, procurement-purchase-orders, procurement-requisitions |
