# Product Spec 04: Digital LOTO & Permit-to-Work (PTW)
**Module Code:** `M-LOTO`  
**Parent Ecosystem:** GigaLibs High-Risk Safety & Environmental Health  
**Complementary Existing Agents:** `process_safety_specialist`, `industry_manufacturing`, `maintenance_cmms_lead`, `security_reviewer`

---

## 1. Executive Summary & Business Outcomes

`M-LOTO` digitizes hazardous energy control (Lockout/Tagout) and high-risk Permit-to-Work (Confined Space, Hot Work, Line Breaking, High Voltage). It eliminates dangerous paper permits and unverified padlocks by enforcing photo-verified isolation points and cryptographic multi-party authorization right at the machine disconnect.

### Concrete Business Outcomes
* **Zero Hazardous Energy Incidents:** 100% verification of Zero Energy State (electrical, pneumatic, hydraulic, thermal, chemical) before maintenance begins.
* **40% Reduction in Work Permit Downtime:** Cuts permit approval and handoff delays from 90 minutes of paper chasing down to 10 minutes of digital coordination.
* **100% OSHA 1910.147 & UK HSE Compliance:** Immutable record of lock box IDs, lock serial numbers, physical isolation photos, and dual sign-offs.
* **Isolation Conflict Prevention:** Web engine prevents overlapping or conflicting isolations on shared headers, pipes, or electrical feeders.

---

## 2. Personas & RBAC Matrix

| Feature / Action | Lead Technician (Mobile) | Safety Officer / Issuer (Web/Mobile) | Area Operations Lead (Web) | Contract Worker (Mobile) |
|---|:---:|:---:|:---:|:---:|
| Request Permit & Select Isolation Procedure | **Create** | Read | Read | Read |
| Execute Isolation Point Lock & Photo Upload | **Execute** | None | None | None |
| Zero Energy Verification ("Try Step") | **Perform** | **Witness** | None | None |
| Permit Approval & Safe Work Release | None | **Authorize** | **Countersign** | None |
| Individual Lock On / Lock Off Sign-in | **Sign** | None | None | **Sign** |
| Configure Plant Isolation Master Procedures | None | **Full** | **Full** | None |

---

## 3. Mobile Application Functionalities (Field Execution)

### 3.1. Field LOTO Execution Engine
* **Step-by-Step Isolation Checklist:** Pre-defined isolation points (e.g., *Point 1: Breaker MCC-04 Cubicle 12 -> Switch OFF and apply Lock #08. Point 2: Bleed valve BV-102 -> Open to drain pressure*).
* **Mandatory Photo Proof-of-Lock:** Camera automatically prompts with crosshairs overlay. Technician must photograph the applied red padlock and physical tag at the disconnect.
* **"Try Step" Verification:** Enforces OSHA "Zero Energy Verification". Tech tries to turn the local start button ON while locked out; logs confirmation that equipment did not energize.
* **Group Lock Box Virtual Master:** Multiple technicians apply individual personal digital locks to the electronic lockbox before stepping into the hazardous zone.

### 3.2. Mobile Permit-to-Work (Hot Work & Confined Space)
* **Gas Testing Entry Table:** Technicians log Oxygen %, LEL (combustible), CO, and H2S levels directly with automated threshold safety flags.
* **Live Permit Timer:** Prominently displays remaining active permit time in status bar (e.g., *Hot Work Permit Expires in: 02h 15m*). Warning vibrates phone 30 minutes before cutoff.

---

## 4. Web Application Functionalities (Permit Master & Area Control)

* **Live Plant Isolation Board:** Interactive overview of every asset currently locked out, colored by state: DRAFT, ISOLATING, APPROVED / LIVE, DE-ISOLATING, CLOSED.
* **Cross-Permit Clash Detection:** Alerts if two separate teams attempt to isolate interconnected systems (e.g., Team A isolating steam supply while Team B is working on condensate return).
* **Isolation Procedure Library:** Version-controlled master SOPs for complex plant systems with single-line electrical diagrams and P&IDs.

---

## 5. Design Benchmarks & 5-Second to 10-Second Physical User Journey

**Physical Work Area Benchmark:** Technician in PPE with face shield standing at motor control center (MCC). Target time per isolation point: **6 to 8 seconds**.

```
[Step 1: Locate Disconnect & Scan] (1.5s)
  Technician scans barcode on Breaker #14. Isolation Point 01/03 opens.

[Step 2: Snap Lock Photo] (3.5s)
  Worker throws switch, attaches Padlock #22, taps big camera button in thumb zone.
  Camera captures photo of lock and tag.

[Step 3: Confirm Zero Energy Check] (1.5s)
  Worker taps button on field control panel -> nothing moves.
  Worker taps single thumb pill [Zero Energy Confirmed].

[Step 4: Auto-Progress] (0.5s)
  Point 01 turns Green. Screen automatically cues Isolation Point 02 (Pneumatic Supply).
  Total action time: 7.0 seconds.
```

---

## 6. Architecture & GigaLibs Integration

**Implementation status:** The diagram is a product sketch; its route, table and event names are unverified proposals. Use the [frontline suite implementation plan](../../plans/frontline-mobile-suite-implementation-plan.md) for proposed ownership, contract order and acceptance gates.

```
[Mobile Device]
     │ (Encrypted Payload + Compressed Photo)
     ▼
[mobile-bff / v1/permits]
     │
     ├──> [gigalibs_cmms.loto_permits] (Binds Permit ID to CMMS Work Order)
     ├──> [esignature module] (Stores dual crypto signatures of Issuer + Receiver)
     └──> [@gigalibs/broker (topic: plant.safety.loto_activated)]
               │
               └──> [iot-gateway / rules engine] (Suppresses false-alarm SCADA downtime alerts)
```
