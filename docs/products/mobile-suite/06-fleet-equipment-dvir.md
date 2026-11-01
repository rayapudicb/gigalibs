# Product Spec 06: Fleet & Heavy Equipment Pre-Trip Inspection (DVIR)
**Module Code:** `M-DVIR`  
**Parent Ecosystem:** GigaLibs Mobile Fleet, Logistics & Material Handling Equipment  
**Complementary Existing Agents:** `maintenance_cmms_lead`, `industry_manufacturing`, `reliability_engineering_specialist`, `compliance`

---

## 1. Executive Summary & Business Outcomes

`M-DVIR` provides a driver vehicle and mobile equipment inspection workflow designed for industrial mobile machinery: forklifts, reach stackers, overhead cranes, yard spotters, haul trucks, and service vehicles. Operators complete a mandatory circle-check before turning the ignition key, preventing catastrophic equipment failure and ensuring Department of Transportation (DOT) and OSHA 1910.178 compliance.

### Concrete Business Outcomes
* **Zero Catastrophic Brake/Hydraulic Failures on Shop Floor:** Enforces pre-operation checks before equipment can be legally operated on a shift.
* **Instant "Red Tag" Equipment Grounding:** Critical safety defects immediately ground the equipment in the database, preventing other drivers from checking it out.
* **100% Elimination of Paper DVIR Clipboards:** Satisfies USDOT 49 CFR § 396.11 and OSHA Powered Industrial Truck logging electronically.
* **Direct Integration into Mechanic Maintenance Queue:** Defect photos and operator notes feed directly into CMMS work orders.

---

## 2. Personas & RBAC Matrix

| Feature / Action | Equipment Driver / Operator (Mobile) | Fleet Mechanic (Mobile/Web) | Fleet & Yard Supervisor (Web) | Compliance Officer (Web) |
|---|:---:|:---:|:---:|:---:|
| Execute Pre-Trip / Post-Trip Inspection | **Full** | **Full** | Read | None |
| "Red Tag" Instant Vehicle Grounding | **Full** | **Full** | **Override** | Read |
| Sign-off Defect Rectification | None | **Certify** | **Authorize** | None |
| Configure Inspection Checklist by Asset Type | None | None | **Manage** | **Full** |
| Live Yard Availability Board | Read | Read | **Full** | Read |
| USDOT / OSHA Regulatory Audit Export | None | None | Read | **Full** |

---

## 3. Mobile Application Functionalities (Field Execution)

### 3.1. Circle-Check Guided Execution
* **QR Scan Checkout:** Driver scans QR code on the forklift mast or truck steering column. App verifies driver holds a valid forklift certification in `gigaops`.
* **Visual Walk-Around Carousel:** Screen guides the operator around the equipment in a physical circle:
  1. *Zone 1: Front* (Forks, mast chains, hydraulic rams, headlights).
  2. *Zone 2: Left Side* (Tires, wheel nuts, battery plug / propane cylinder).
  3. *Zone 3: Cab / Controls* (Seatbelt, backup alarm, horn, brake pedal travel, emergency shutoff).
* **Defect Classification:**
  * `[Pass]` (Green)
  * `[Minor Defect / Operational]` (Amber — cosmetic scratch, indicator bulb out; allowed to operate, logs maintenance notice).
  * `[Critical Safety Defect / GROUND]` (Red — brake spongy, hydraulic hose frayed; grounds equipment immediately).

---

## 4. Web Application Functionalities (Fleet Command Center)

* **Fleet Readiness Matrix:** Live visual matrix of every mobile asset across warehouses and yards showing: OPERATIONAL, INSPECTION OVERDUE, GROUNDED (RED TAG), IN REPAIR.
* **Driver License & Certification Interlock:** Automatically blocks uncertified workers from completing pre-trips or checking out heavy equipment.
* **Mechanic Defect Resolution Workflow:** When a mechanic repairs a grounded vehicle, they input the corrective action and sign off; only then does the app restore the asset to OPERATIONAL.

---

## 5. Design Benchmarks & 5-Second to 10-Second Physical User Journey

**Physical Work Area Benchmark:** Forklift driver standing next to Forklift #09 at the start of a shift. Target time to log a specific check zone: **5 to 7 seconds**.

```
[Step 1: Scan Forklift QR] (1.0s)
  Driver scans barcode on steering column. Forklift #09 specs load.

[Step 2: Zone 1 Check (Forks & Mast)] (3.0s)
  Driver looks at chains and forks. Taps large bottom segmented button [All Clear / Pass].

[Step 3: Horn & Seatbelt Test] (2.0s)
  Driver sits down, clicks belt, honks horn. Taps [Pass].

[Step 4: Sign & Release] (1.0s)
  Thumb-scrolls to bottom -> taps [Complete & Start Shift].
  Screen shows Green Authorized Badge. Ignition unlocked.
  Total check time for standard pass: under 25 seconds across all zones.
```

---

## 6. Architecture & GigaLibs Integration

**Implementation status:** The diagram is a product sketch; its route, table and event names are unverified proposals. Use the [frontline suite implementation plan](../../plans/frontline-mobile-suite-implementation-plan.md) for proposed ownership, contract order and acceptance gates.

```
[Mobile Device]
     │ (HTTPS / Bluetooth BLE Engine Telematics)
     ▼
[mobile-bff / v1/fleet/dvir]
     │
     ├──> [gigalibs_cmms.asset_downtimes] (Sets asset status to GROUNDED if Critical Defect)
     ├──> [physical-operations-cmms] (Creates Priority 1 Work Order for Fleet Shop)
     └──> [gigaops.compliance] (Validates operator license credentials)
```
