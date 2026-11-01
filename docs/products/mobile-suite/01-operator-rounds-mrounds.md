# Product Spec 01: Operator Inspection Rounds (`mRounds`)
**Module Code:** `M-RND`  
**Parent Ecosystem:** GigaLibs Autonomous Maintenance & Frontline Operations  
**Complementary Existing Agents:** `industry_manufacturing`, `maintenance_cmms_lead`, `reliability_engineering_specialist`, `ergonomics_human_factors`

**Implementation clarification (owner, 2026-10-30):** The Bluetooth probe and geofencing ideas below are original product concepts, not first-build requirements. WI-OI-133 uses NFC/barcode for physical checkpoint proof and CMMS meter readings (which IoT Gateway may supply) as timestamped equipment context. The operator's own reading remains a separate inspection record. A later handheld probe adapter needs a named device and protocol.

---

## 1. Executive Summary & Business Outcomes

`M-RND` automates routine operator asset tours and autonomous maintenance rounds. Operators on the factory floor or industrial plant walk scheduled routes (daily, per shift, or weekly) to capture operating parameters (temperature, pressure, vibration, oil levels, leaks, visual condition) across machinery.

### Concrete Business Outcomes
* **55% Reduction in Unplanned Equipment Downtime:** Detects bearing heat-ups, minor lubrication leaks, and belt slippage 3 to 14 days before catastrophic failure.
* **100% Elimination of "Ghost / Pencil-Whipping" Rounds:** Enforces anti-tamper physical presence via NFC/barcode scans with immutable timestamped telemetry.
* **Instant Corrective Loop:** Anomalous readings automatically instantiate a prioritized CMMS work order (`physical-operations-cmms`) with photographic evidence and failure classification.
* **Autonomous Maintenance Enablement (TPM):** Operators take ownership of first-line asset care without requiring senior maintenance technicians.

---

## 2. Personas & RBAC Matrix

| Feature / Action | Plant Operator (Mobile) | Shift Supervisor (Web & Mobile) | Reliability Engineer (Web) | System Admin (Web) |
|---|:---:|:---:|:---:|:---:|
| Execute Assigned Route (Offline) | **Full** | **Full** | Read | None |
| Log Exception / Ad-hoc Defect | **Full** | **Full** | Read | None |
| Pair Bluetooth Sensor (Vibration/IR) | **Full** | **Full** | None | None |
| Route Template Builder & Schedule | None | **Review** | **Full** | **Full** |
| Shift Route Conformance Live Board | Read | **Full** | **Full** | None |
| Override Reading / Skip Point Approval | None | **Authorize** | None | None |
| Threshold & Alarm Rule Config | None | None | **Full** | **Full** |

---

## 3. Mobile Application Functionalities (Field Execution)

### 3.1. Route Execution Engine
* **Offline-First SQLite Cache:** Entire route, previous 5 historical baseline readings, and equipment asset photos pre-cached during login. Operates in deep basements or steel structures with zero signal.
* **Checkpoint Proof-of-Presence:** Checkpoint unlocks only when scanning physical NFC tag or Barcode on the asset (anti-tamper geofencing verification).
* **Smart Input Modalities:**
  * **One-Tap Stepper / Numeric Pad:** For gauges (pressure, temperature). Values default to nominal range; one tap increments/decrements.
  * **Pass / Flag / Fail Tri-State Toggle:** Large thumb-friendly segmented pill (32dp height minimum).
  * **Bluetooth Sensor Sync:** BLE listener automatically captures continuous temperature/vibration from handheld probes (e.g., Fluke, SKF quick-collector).
* **Deviation & Anomaly Reaction:** Entering a value outside the yellow/red limits instantly:
  1. Prompts for mandatory annotated camera photo.
  2. Offers a 1-tap "Create Corrective Work Order" pill.
  3. Recommends immediate standard operating guidance (e.g., "Check oil sight glass, isolate coolant bypass").

---

## 4. Web Application Functionalities (Enterprise Control & Config)

* **Drag-and-Drop Route Canvas:** Visual sequencing of inspection points by physical plant topology (Site → Building → Floor → Machine Line → Asset Checkpoint).
* **Dynamic Branching Rules:** Configure conditional questions (e.g., *“If motor casing temp > 75°C, prompt for vibration reading and bearing housing photo”*).
* **Live Supervisor Route Conformance Dashboard:** Real-time progress bar of active shift tours (e.g., *Shift A: Boiler Route 74% complete, 2 exceptions flagged, 1 asset skipped*).
* **Historical Trend Overlay:** Direct integration with `analytics-studio` showing 90-day degradation curves for temperature/pressure readings per asset.

---

## 5. Design Benchmarks & 5-Second to 10-Second Physical User Journey

**Physical Work Area Benchmark:** Operator standing in noisy, high-vibration environment wearing work gloves. Target time per checkpoint: **4 to 7 seconds**.

```
[Step 1: Arrive & Scan] (1.5s)
  Worker walks up to Pump 04 → taps phone to NFC tag on motor housing.
  └─ Phone vibrates. Checkpoint 03/12 opens directly into active screen.

[Step 2: Nominal Check / Reading] (2.5s)
  Screen displays 2 fields:
  - Discharge Pressure (Bar): Default dial preset to nominal (4.2). Worker taps (+0.1) -> 4.3 Bar.
  - Oil Level Sight Glass: Big thumb toggle [Normal | Low | Overfilled]. Worker taps [Normal].

[Step 3: Auto-Advance / Next Point] (1.0s)
  Green check flash → Screen immediately transitions to Checkpoint 04 (Heat Exchanger 01).
  Total physical action time: 5.0 seconds. Zero keyboard typing.
```

---

## 6. Architecture & GigaLibs Integration

**Implementation status:** The original diagram was a product sketch. WI-OI-133 now routes operator writes through the session-bound `/mobile/v1/rounds` BFF to the Rounds API. Rounds owns the reading and sends a signed fact to Analytics' inbox; Analytics stores it in its own raw-record store and serves an authorized 90-day trend. CMMS owns equipment context and corrective work orders. These are source integrations awaiting the full HTTP/UAT and device proof. Use the [frontline suite implementation plan](../../plans/frontline-mobile-suite-implementation-plan.md) for ownership and acceptance gates.

```
[Mobile Device (encrypted SQLite)]
     │ (bounded JSON sync over HTTPS)
     ▼
[mobile-bff / v1/rounds]
     │
     └──> [operator-rounds API] (Assignments, runs, readings, exceptions)
                  ├──> [signed Analytics inbox] (Manual facts → scoped 90-day trend)
                  ├──> [signed CMMS inbox] (Idempotent corrective action request)
                  └──> [signed Workforce read] (Active resource and shift window)
```
