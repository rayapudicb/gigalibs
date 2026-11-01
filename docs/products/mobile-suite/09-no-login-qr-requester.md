# Product Spec 09: No-Login QR Service Request Portal
**Module Code:** `M-REQ`  
**Parent Ecosystem:** GigaLibs Frontline Service Management & Request Triage  
**Complementary Existing Agents:** `maintenance_cmms_lead`, `web_experience`, `ergonomics_human_factors`, `product_designer`

---

## 1. Executive Summary & Business Outcomes

`M-REQ` eliminates the barrier between machine operators, plant visitors, custodial staff, and the maintenance department. Every physical machine, door, AC unit, or conveyor carries a weather-resistant QR code. Anyone with a standard smartphone camera can scan the code and submit a maintenance request in seconds—**with zero login, zero account creation, and zero app download required**.

### Concrete Business Outcomes
* **80% Faster Breakdown Notification:** Cuts the time from a physical breakdown occurring to maintenance being dispatched from an average of 45 minutes down to 2 minutes.
* **100% Elimination of "Vague Trouble Tickets":** Because the user scans the exact QR code on the machine, the ticket is guaranteed to have the correct asset ID, physical location, and serial number.
* **Zero License Cost Barrier for General Staff:** Allows thousands of plant operators, packaging line workers, and forklift drivers to submit requests without purchasing enterprise software seats.
* **Reduction of Duplicate Work Requests:** Smart visual proximity matching warns users if someone else already reported the issue 10 minutes prior.

---

## 2. Personas & RBAC Matrix

| Feature / Action | Anonymous Requester (Mobile Web) | Maintenance Triage Lead (Web) | Assigned Technician (Mobile) | System Administrator (Web) |
|---|:---:|:---:|:---:|:---:|
| Scan QR & Submit Issue (No Login) | **Full** | **Full** | **Full** | None |
| Attach Defect Photo & Voice Note | **Full** | **Full** | **Full** | None |
| Receive SMS/Email Status Updates | **Receive** | None | None | None |
| Triage, Deduplicate & Convert to WO | None | **Full** | Read | None |
| Batch Generate & Print Asset QR Codes | None | **Generate** | None | **Full** |
| Configure Allowed Portal Request Types | None | None | None | **Full** |

---

## 3. Mobile Application Functionalities (Lightweight Responsive PWA / Web)

### 3.1. Zero-Friction Web Portal Experience
* **Native Camera Launch:** User points phone camera at QR code -> opens lightweight mobile web page (`gigalibs.io/r/<asset_uuid>`) in Safari or Chrome in under 800ms.
* **Instant Context Display:** Page immediately displays asset name and photo: *"Packaging Line 3 - Heat Sealer Station"*.
* **Minimalist 3-Field Request Card:**
  1. **Issue Type Pill Toggle:** `[Stopped / Won't Run]` `[Strange Noise]` `[Leaking]` `[Quality Issue]` `[Other]`.
  2. **Camera Snap:** 1-tap photo capture showing the broken part or jam.
  3. **Requester Name & Phone / Email:** Optional or single field for SMS ticket status updates.
* **Duplicate Alert Banner:** If another ticket was logged for this asset in the last 4 hours, a banner pops up: *"Ticket #1092 'Heat sealer cold' was logged 18m ago and technician John is assigned. Tap to view status or add note."*

---

## 4. Web Application Functionalities (Triage & Dispatch Board)

* **Request Triage Inbox:** Incoming stream of customer/operator requests with photo previews, AI suggested priority, and automated asset routing.
* **1-Click Work Order Conversion:** Converting a request into a formal CMMS work order takes exactly one click; copies all photos, notes, and asset details over automatically.
* **QR Code Print Generator:** Bulk print utility that formats weatherproof QR asset stickers in standard industrial Avery/Brady label formats with human-readable asset tags.

---

## 5. Design Benchmarks & 5-Second to 10-Second Physical User Journey

**Physical Work Area Benchmark:** Packaging line worker whose box-taping machine just jammed. Target time: **7 to 9 seconds**.

```
[Step 1: Point Camera at QR] (1.5s)
  Worker aims phone camera at the sticker on the machine frame -> taps URL banner.

[Step 2: Instant Form Loads] (1.0s)
  Webpage opens: "Box Taper #02".
  Top of screen shows 4 big buttons.

[Step 3: Tap Problem & Snap Photo] (4.0s)
  - Worker taps [Jammed / Won't Feed].
  - Taps camera button -> snaps photo of the crumpled tape roll.

[Step 4: Tap Submit] (1.5s)
  Worker types 4 digits of their phone extension -> taps [Submit Request].
  Green screen: "Request #502 Received! Maintenance notified."
  Total physical action time: 8.0 seconds. No password typed.
```

---

## 6. Architecture & GigaLibs Integration

**Implementation status:** The diagram is a product sketch; its route, table and event names are unverified proposals. Use the [frontline suite implementation plan](../../plans/frontline-mobile-suite-implementation-plan.md) for proposed ownership, contract order and acceptance gates.

```
[Anonymous Mobile Browser]
     │ (HTTPS POST to Public Gateway)
     ▼
[mobile-bff / v1/public/request]
     │ (Rate limited, captcha-free authenticated token)
     ├──> [physical-operations-cmms.requests] (Persisted into CMMS incoming queue)
     ├──> [@gigalibs/broker (topic: plant.cmms.request_created)]
     │         │
     │         └──> [communications] (Sends SMS status update to requester)
     └──> [analytics-studio] (Logs response time metric from request to WO completion)
```
