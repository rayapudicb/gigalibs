# Enterprise UI/UX Design Rulebook & Ergonomics Standard

> **The Enterprise Stance:** Enterprise software exists to complete real-world business tasks with minimum human friction. Screens are built backwards from **business outcomes** and **time-to-task benchmarks**, never from the database schema. A user must only type what the system cannot deduce; everything derivable is derived, everything shared is inherited, and everything computed is read-only and live.

---

## 1. Task Completion Time Benchmarks

Developers must measure and optimize screens against these hard time-to-task thresholds:

| Action Category | Target Benchmark | Maximum Allowed Clicks | Example |
| :--- | :--- | :--- | :--- |
| **Instant Lookup** | **$\le 5$ seconds** | 1 click or shortcut | Global `Cmd+K` partner or asset search |
| **Simple Approval / Sign-off** | **$\le 10$ seconds** | 1 click | Credit hold release, manager PO sign-off |
| **Quick Record Creation** | **$\le 30$ seconds** | $\le 2$ required fields | Quick-adding a Business Partner or Work Order |
| **Standard Record Entry** | **$\le 60$ seconds** | $\le 5$ required fields | Creating a sales order or material receipt |
| **Complex Reconciliation** | **$\le 2$ minutes** | N/A (Inline split-view) | 3-way invoice match, freight rate discrepancy audit |

*Golden Rule:* If a routine frontline activity takes longer than 60 seconds, the screen design is broken and must be simplified.

---

## 2. The Zero-Training Strategy

A newly onboarded plant technician, warehouse clerk, or order desk operator must be able to complete their core daily tasks on Day 1 without reading a manual or attending training.

### Rule 2.1 — Plain-Language Affordance Over ERP Jargon
* **FORBIDDEN:** Exposing technical database codes or legacy transaction acronyms (e.g., `IW31`, `ME21N`, `c_bpartner_id`, `subledger_201_cr`).
* **REQUIRED:** Clear, action-oriented verbs (*"Create Work Order"*, *"Issue Invoice"*, *"Place Credit Hold"*).

### Rule 2.2 — Progressive Disclosure
* **The 2-Field / Quick-Create Principle:** When a user clicks "New", do not show a form with 30 fields. Open a lightweight drawer with the 2–3 required fields (e.g., Name + Role).
* Tuck secondary, optional, or advanced configuration (custom tax classifications, payment routing overrides) into collapsible accordions or detail tabs.

### Rule 2.3 — Inline Guardrails Over Disruptive Modals
* **FORBIDDEN:** Allowing the user to fill out a long form, hit "Submit", and get a blocking error modal (*"Error 400: Customer over credit limit"*).
* **REQUIRED:** Validate constraints inline as the user types. If a credit limit is exceeded, show an inline alert badge with an instant one-click remedy: *"Exceeds credit limit by \$4,000. [Request Manager Override]"*.

### Rule 2.4 — Contextual Next-Best Action
* Never leave the user at a dead-end "Success" screen. Suggest the next step in the business process:
  * *Work order saved $\rightarrow$ "Assign Technician now?"*
  * *Invoice issued $\rightarrow$ "Download PDF or Email to Customer?"*

---

## 3. Layout Architecture & Spatial Hierarchy

### Rule 3.1 — The Master-Detail Split-Screen Standard
Never use full-page redirects for record inspection. Full-page redirects cause users to lose their list position and scroll state.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Header: Breadcrumbs / Title / Global Search (Cmd+K) / Tenant / Org Unit     │
├──────────────────────────────────────┬──────────────────────────────────────┤
│ PRIMARY DATA TABLE (Left 60%)        │ FOCUS INSPECTOR / DRAWER (Right 40%) │
│                                      │                                      │
│ [Filter Facets] [Search] [Export]    │ Record Title / Identifier            │
│ ┌──────────────────────────────────┐ │ [Status Badge] [Live Gauge / KPI]    │
│ │ Row 1: Partner A    [ACTIVE]     │ ├──────────────────────────────────────┤
│ │ Row 2: Partner B    [ON_HOLD]    │ │ Tabs: Overview | Contacts | History  │
│ │ Row 3: Partner C    [ACTIVE]     │ │                                      │
│ └──────────────────────────────────┘ │ Form / Data Canvas (Editable)        │
│                                      │                                      │
│                                      │ [Secondary Action] [PRIMARY ACTION]  │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

* **Left Panel (60% width):** High-density `DataTable` with faceted search, quick filters, and status indicators.
* **Right Panel / Focus Drawer (40% width):** Slides in to show the selected record’s details, tabs, and action buttons without unmounting the list.

### Rule 3.2 — The 3-Tier Visual Hierarchy
Every record screen must follow this top-to-bottom visual hierarchy:
1. **Tier 1 (The Anchor / Glanceable Header):**
   * High-contrast status badge (`ACTIVE`, `CREDIT_HOLD`, `MAINTENANCE_PENDING`).
   * Primary business identifier (Name + Code).
   * Live real-time visual indicator (e.g., Credit Utilization Gauge, Machine Telemetry health).
2. **Tier 2 (The Canvas / Operational Workspace):**
   * The core transactional inputs (line items, equipment checklist, invoice balance).
3. **Tier 3 (Context & Audit Trail):**
   * Tabbed lower panel or drawer for change history, compliance notes, linked documents, and audit logs.

### Rule 3.3 — Standardized Screen States
Every screen must handle four states without jumping layout shifts:
* **Loading:** Use shimmering skeleton loaders matching the exact form/table dimensions. Never use a single center spinning wheel.
* **Empty:** Show an encouraging, actionable empty state graphic with a primary action button (*"No Work Orders found. [Create First Work Order]"*).
* **Error:** State clearly what failed and provide a one-click retry button.
* **Offline / Syncing:** In field apps, display an amber connectivity pill (*"Saved locally. Syncing when online..."*).

---

## 4. Minimal Data Entry (The 80/20 Rule)

**Zero-Re-Keying Mandate:** If the system already knows a piece of information, the user must never be asked to type it.

1. **Context Inheritance (Pre-fill):**
   * If creating a work order from a machine detail page, pre-populate: Plant Site, Machine Serial, Cost Center, and Preferred Vendor.
2. **Smart Defaults:**
   * Default Organization Unit, Currency, Tax Code, and Warehouse Locator based on the user's active session and role profile.
3. **Searchable Pickers Over Free-Text:**
   * Accounts, tax codes, and currencies must use type-ahead fuzzy search dropdowns.
4. **Barcode & Camera OCR Integration (Mobile/Tablet):**
   * Asset tags, bin locators, and invoice scans must support hardware scanner or device camera scan to auto-fill input fields.
5. **Computed Data is Strictly Read-Only:**
   * Values like **Credit Exposure**, **Netting Balance**, **Stock Available-to-Promise (ATP)**, and **Tax Totals** are calculated server-side in real-time. They must be displayed in read-only badges/gauges, never as manual entry inputs.
6. **Single GxP / Compliance Reason:**
   * For regulated edits (GxP/SOX), prompt for a single "Reason for Change" modal upon saving the record, never per individual field.

---

## 5. Physical & Cognitive Ergonomics

### Rule 5.1 — Desktop / Desk-Clerk Ergonomics (Keyboard-First)
Clerks entering tens of orders or invoices per hour must never need to lift their hands to use the mouse:
* **Focus Order:** Logical `Tab` key progression from top-left to bottom-right.
* **Keyboard Hotkeys:**
  * `Cmd/Ctrl + Enter`: Submit / Save active form.
  * `Esc`: Close modal or slide-over drawer without saving.
  * `/`: Focus search input.
  * `Arrow Up / Down`: Navigate table rows.
* **Typeahead Dropdowns:** Typing automatically highlights the closest match; pressing `Enter` selects it and advances to the next input.

### Rule 5.2 — Plant Floor & Field Ergonomics (Mobile / Tablet)
Technicians in manufacturing plants, warehouses, and mines operate in harsh environments (grease, glare, gloves, one-handed operation):
* **The Thumb-Zone Layout:** Place primary action buttons (Approve, Complete, Scan) in the **bottom 30% of the viewport**. Never place primary actions in the top-right corner on mobile.
* **Large Touch Targets:** All tap targets must be at least **$48 \times 48\text{ pixels}$** with a minimum $8\text{px}$ margin between buttons.
* **High Contrast (Glare-Proof):** Adhere to **WCAG 2.2 AAA** contrast ($7:1$ ratio) for outdoor/field modes.
* **One-Handed Modals:** Swipe-to-dismiss bottom sheets instead of center popups.

---

## 6. Implementation & Code Quality Checklist

Developers must check every PR against this list before requesting review:

- [ ] **Task speed:** Can the core happy path be completed in $\le 45$ seconds?
- [ ] **Quick-create:** Does the initial creation require $\le 2$ mandatory fields?
- [ ] **No full-page redirects:** Does row inspection use the Split-Screen DataTable + Drawer pattern?
- [ ] **Computed fields are read-only:** Are exposures, totals, and balances computed server-side and rendered read-only?
- [ ] **Context pre-fill:** Are user location, currency, and parent entity IDs inherited automatically?
- [ ] **Keyboard navigation:** Can the form be completed and submitted using only `Tab`, arrows, and `Ctrl+Enter`?
- [ ] **Mobile touch target:** On mobile/responsive views, are all interactive controls $\ge 48\times 48\text{px}$?
- [ ] **No generic error modals:** Do errors appear inline with actionable remedies?
- [ ] **Token compliance:** Are all colors, fonts, and spacings using design system tokens (`@medusajs/ui` / Tailwind presets) with zero hard-coded hex colors?
- [ ] **Skeletons:** Are shimmer skeletons implemented for loading states instead of blocking spinners?
