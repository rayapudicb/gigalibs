# Mobile WorkforceOps Functional Specification (WI-WFO-007 Scope Boundary)

**Status:** Bookmarked / Approved Decision Framework  
**Scope:** Frontline Worker Mobile Application (`apps/workforce-mobile`)  
**Companion Web Platform:** `@gigalibs/workflow-platform` (`/gigaops/*`)

---

## 1. Guiding Principle: "Frontline on Glass, Management on Web"

- **Desktop Web (`@gigalibs/workflow-platform`):** The operational control plane for Planners, Schedulers, Compliance Officers, Payroll Admins, and Executives (52 screens, org trees, GL push, batch analytics).
- **Mobile (`apps/workforce-mobile`):** Tailored **strictly for the frontline worker** on the ground (stadium stagehands, clinical nurses, plant operators, field drivers) plus an optional **Supervisor Lite** mode.

---

## 2. Functional Matrix: What Ships on Mobile vs. Desktop Web

| Domain | Mobile Functionality (Worker Persona) | Web Only (Admin / Management) |
|---|---|---|
| **Identity & Access** | • Biometric Login (Face ID / Fingerprint / PIN)<br>• Self-serve profile & trade skills update | • Enterprise SSO / SAML configuration<br>• Organization hierarchy builder & tree editing |
| **Invitations & Contracts** | • Push notification on job invitation<br>• 1-tap **Accept / Decline** with reasons<br>• **E-Signature on glass** (finger/stylus) for contracts | • Multi-slot engagement builder & quota setup<br>• Bulk Excel template import/export<br>• Contract template authoring & voiding |
| **Time & Attendance** | • **Geo-validated 1-tap Clock-In / Clock-Out**<br>• Break tracking (meal/rest penalties)<br>• Offline punch buffer (syncs when connectivity returns) | • Geofence zone polygon drawing<br>• Multi-worker timesheet review & approval board<br>• Time exception overrides & audit trail |
| **Shifts & Schedule** | • **My Schedule** (calendar of confirmed bookings)<br>• **Open Shifts Marketplace** (claim available slots)<br>• **Shift Swap Request** (peer-to-peer trade) | • Algorithmic demand forecasting & position gaps<br>• Dispatch board with drag-and-drop assignment<br>• Multi-location master scheduling |
| **Expenses & Claims** | • **Camera receipt capture** (upload receipt photo directly)<br>• **IRS Mileage Calculator** (enter start/destination)<br>• View claim approval & reimbursement status | • Expense policy max caps & mileage rates config<br>• Multi-line verification queue & line rejections |
| **Payroll & Earnings** | • **My Pay History** (gross pay, expense reimbursements, net pay, hours breakdown) | • Payroll period scope locking & closing<br>• ADP / SAP / Workday batch CSV export<br>• **iDempiere ERP GL journal batch generation** |
| **Compliance & Docs** | • **Camera photo capture of licenses/certs**<br>• Push alerts for documents expiring in 30 days | • Document verification queue (maker-checker)<br>• Regulatory audit export reports |
| **Communications** | • Frontline **Notification Feed** (call time changes, site alerts)<br>• Submit worker support tickets | • Targeted engagement multi-channel broadcast composer<br>• Support ticket resolution queue |

---

## 3. Tiered Rollout Architecture

### Tier 1: Core Worker Essentials (Must-Have for Day-1 Mobile MVP)
1. **Biometric Auth:** Secure device-native Face ID / Touch ID authentication with token refresh.
2. **Clock-In / Out:** GPS-bounded punch recording with geofence radius feedback and offline storage.
3. **My Jobs & Digital E-Sign:** Accept/decline shifts and digitally sign legal contracts on glass.
4. **My Schedule:** Active shift card (call time, site location, lead supervisor contact).

### Tier 2: Frontline Agility & Receipts
1. **Camera Expense Capture:** Snap receipt photos on the spot; auto-calculate driving mileage.
2. **Shift Marketplace & Peer Swaps:** Pick up open shifts and swap with qualified peers.
3. **Pay Stubs & History:** Transparent breakdown of hours worked, overtime, and reimbursements.
4. **License Upload:** Snap photo of state license / OSHA card for compliance validation.

### Tier 3: Supervisor Lite Mode (Optional in-app role switch)
* When a logged-in user is a **Crew Chief / Shift Supervisor / Charge Nurse**:
  * **On-Site Muster:** View live list of who is currently clocked in at the site.
  * **Quick Approval:** 1-tap approval for end-of-shift timesheets and punch exceptions.
  * **Safety Roll-Call:** Emergency headcount verification tool.

---

## 4. Features Exclusively Restricted to Desktop Web
* Multi-level Organization tree modifications (Region → District → Facility).
* Industry Pack activation & taxonomy definition.
* ERP GL batch journal pushing to iDempiere.
* Analytics Studio multi-metric queries and report builders.
* Staffing agency vendor invoice reconciliation.
