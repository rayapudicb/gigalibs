# Product Spec 07: Contractor Field Safety Pass & Escort Verification
**Module Code:** `M-CONTR`  
**Parent Ecosystem:** GigaLibs Contractor Management & Site Access Security  
**Complementary Existing Agents:** `security_reviewer`, `compliance`, `gigaops`, `industry_manufacturing`

---

## 1. Executive Summary & Business Outcomes

`M-CONTR` governs external contractors, service technicians, and construction crews working inside manufacturing and industrial sites. It enforces verified site safety inductions, insurance validation, daily badge sign-in/sign-out, and plant escort verification directly on mobile devices at the security gate or production skid.

### Concrete Business Outcomes
* **Zero Uninducted Contractors on Site:** Guarantees 100% of external labor completes site-specific safety briefings, environmental hazard awareness, and PPE requirements before entry.
* **Instant Insurance & Certificate of Insurance (COI) Verification:** Flags expired general liability, workers' comp, or trade licenses at the gate.
* **Precise Contractor Labor Hour Reconciliation:** Digital arrival/departure timestamps eliminate inflated contractor billing hours on invoices (`spend-management` sync).
* **Emergency Accountability:** Live digital roll-call roster of all external contractors on site in the event of a plant fire alarm or chemical release.

---

## 2. Personas & RBAC Matrix

| Feature / Action | External Contractor (Mobile) | Plant Escort / Host (Mobile/Web) | Security Gate Guard (Mobile) | EHS & Procurement Lead (Web) |
|---|:---:|:---:|:---:|:---:|
| Self-Service Mobile Safety Induction Video | **Watch** | None | None | None |
| Gate Arrival QR Scan Check-in | **Scan** | None | **Verify** | Read |
| Skid-Level Escort Sign-off | **Present** | **Authorize** | None | None |
| End-of-Day Work Order Milestone Sign-off | **Sign** | **Approve** | None | Read |
| Upload Company COI & Worker Certifications | **Upload** | None | None | **Approve** |
| Live Evacuation Headcount Board | Read | Read | **Full** | **Full** |

---

## 3. Mobile Application Functionalities (Field Execution)

### 3.1. Field Contractor Gateway
* **Pre-Arrival Induction Fast-Track:** Contractor watches 4-minute mandatory safety video on their own phone prior to arriving at the gate. Takes a 3-question quiz. App generates a digital Green Safety Pass QR code.
* **Gate Check-In Scan:** Security guard scans contractor's pass. App verifies:
  1. Induction video valid (within 365 days).
  2. Employer COI active in the system.
  3. Work Order or Purchase Order exists for today's visit.
* **Skid Escort Authorization:** For high-risk areas (e.g., chemical tank farm), plant escort taps their corporate badge against the contractor's phone to grant localized physical access.
* **Field Scope Completion Sign-Off:** Contractor presents completed work. Plant host inspects quality, snaps photo, and signs digitally on glass.

---

## 4. Web Application Functionalities (Contractor Compliance Master)

* **Contractor Directory & Insurance Compliance Console:** Master registry of approved vendor companies, active contracts, and automated alerts for expiring insurance policies.
* **Site Evacuation Roster:** Real-time list of all external individuals currently inside the security perimeter, sorted by building, zone, and assigned internal host.
* **Contractor Invoice 3-Way Match Relay:** Compares contractor time-stamped on-site hours against invoice labor billing hours to automatically catch overbilling.

---

## 5. Design Benchmarks & 5-Second to 10-Second Physical User Journey

**Physical Work Area Benchmark:** Internal plant host meeting a third-party electrical contractor at the production line. Target time: **5 to 8 seconds**.

```
[Step 1: Contractor Presents Pass] (1.0s)
  Contractor shows digital QR on their phone.

[Step 2: Host Scans & Confirms] (2.0s)
  Plant host taps "Verify Contractor" on GigaLibs mobile app -> camera scans QR.
  Green banner displays: "John Doe (Apex Electrical) - Induction Valid - PPE Qualified".

[Step 3: Assign Work Area & Authorize] (3.0s)
  Host taps [Line 3 Packaging Skid] -> taps [Authorize Escort].

[Step 4: Done] (1.0s)
  Both phones vibrate. Work area access logged.
  Total action time: 7.0 seconds.
```

---

## 6. Architecture & GigaLibs Integration

**Implementation status:** The diagram is a product sketch; its route, table and event names are unverified proposals. Use the [frontline suite implementation plan](../../plans/frontline-mobile-suite-implementation-plan.md) for proposed ownership, contract order and acceptance gates.

```
[Contractor Mobile Pass]
     │ (QR Verification / HTTPS)
     ▼
[mobile-bff / v1/contractors]
     │
     ├──> [spend-management.contractor_hours] (Reconciles PO billable hours)
     ├──> [esignature module] (Stores induction quiz certification)
     └──> [geospatial / place_directory] (Updates on-site plant presence log)
```
