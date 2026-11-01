# Product Spec 03: Field Instrument Calibration Management (`mCalibration`)
**Module Code:** `M-CAL`  
**Parent Ecosystem:** GigaLibs Quality, Metrology & Precision Maintenance  
**Complementary Existing Agents:** `industry_manufacturing`, `quality_regulatory_specialist`, `financial_mathematics_specialist`, `maintenance_cmms_lead`

---

## 1. Executive Summary & Business Outcomes

`M-CAL` provides a dedicated field metrology workflow for Electrical & Instrumentation (E&I) technicians. It eliminates paper calibration sheets and error-prone manual calculations when testing pressure transmitters, RTD temperature probes, flowmeters, weigh scales, and pH sensors directly at the production skid.

### Concrete Business Outcomes
* **90% Reduction in Metrology Documentation Time:** Calculations for span %, linearity error, and hysteresis occur automatically on the device in real time.
* **100% Audit Readiness for ISO 9001, FDA 21 CFR Part 11, and OSHA PSM:** Digital calibration certificates with tamper-evident digital signatures and traceable test standard references.
* **Immediate Out-of-Tolerance Containment:** Failing instruments trigger automatic quarantine in the ERP and generate replacement work orders before batch contamination occurs.

---

## 2. Personas & RBAC Matrix

| Feature / Action | E&I Technician (Mobile) | Quality / Metrology Lead (Web) | Maintenance Planner (Web) | ISO/FDA Auditor (Web) |
|---|:---:|:---:|:---:|:---:|
| Execute Field Calibration (Offline) | **Full** | None | None | None |
| Select Traceable Master Reference Standard | **Full** | Read | None | Read |
| Real-time Span & Tolerance Evaluation | **Execute** | Read | None | Read |
| Approve Out-of-Tolerance Adjustment | Request | **Authorize** | None | None |
| Issue Legally Binding Calibration Certificate | **Sign** | **Approve** | None | Read |
| Configure Calibration Tolerances & Standard Lifecycles | None | **Full** | Read | None |

---

## 3. Mobile Application Functionalities (Field Execution)

### 3.1. Field Calibration Calculator & Test Matrix
* **Auto-Populating Calibration Grid:** Pre-configured test points (typically 5 points: 0%, 25%, 50%, 75%, 100% of range).
  * Example for 4–20 mA pressure transmitter: Input (0, 25, 50, 75, 100 PSI) → Expected Output (4.00, 8.00, 12.00, 16.00, 20.00 mA).
* **As-Found vs. As-Left Workflows:**
  * **As-Found:** Technician inputs measured mA. App computes Error % and immediately flags cell Green (Within Spec) or Red (Out of Spec).
  * **Zero/Span Adjust:** If Out of Spec, technician adjusts trim on the instrument and fills **As-Left** values.
* **Traceable Master Standard Selection:** Quick scan of the calibration calibrator's barcode (e.g., Fluke 754 Multichannel Calibrator). App validates that the master standard itself is within its valid calibration window.
* **On-Glass Digital Signature:** Cryptographic sign-off creating an immediate tamper-proof PDF certificate.

---

## 4. Web Application Functionalities (Enterprise Metrology Control)

* **Instrument Calibration Registry:** Master catalogue of every instrument requiring periodic calibration, including engineering units, allowable max permissible error (MPE), and test intervals.
* **Master Test Equipment & Standards Bank:** Tracks company-owned calibrators, deadweight testers, and reference blocks, their external calibration certificates, and expiration locks.
* **Metrology Drift Analytics:** Tracks instrument sensor degradation over 1, 3, and 5-year spans using `analytics-studio` to predict sensor failure before drift causes quality defects.

---

## 5. Design Benchmarks & 5-Second to 10-Second Physical User Journey

**Physical Work Area Benchmark:** Technician kneeling at an instrument rack holding a pressure pump and mobile tablet. Target time per point entry: **3 to 5 seconds**.

```
[Step 1: Point Selection] (1.0s)
  Technician pumps pressure to 50 PSI (50% test point). Grid highlights Row 3 (Expected: 12.00 mA).

[Step 2: Enter Reading] (2.5s)
  Technician taps the numeric field. Quick numpad appears. Types [1] [2] [.] [0] [4] -> Taps Enter.

[Step 3: Immediate Live Validation] (0.5s)
  Engine computes: Error = +0.25% (Tolerance limit = ±0.50%). Cell flashes Green with "PASS" icon.
  Cursor automatically jumps to Row 4 (75% point).

Total action time: 4.0 seconds. Zero mental arithmetic or paper lookups.
```

---

## 6. Architecture & GigaLibs Integration

**Implementation status:** The diagram is a product sketch; its route, table and event names are unverified proposals. Use the [frontline suite implementation plan](../../plans/frontline-mobile-suite-implementation-plan.md) for proposed ownership, contract order and acceptance gates.

```
[Mobile Device]
     │ (Calculates Math Locally: Error = |AsFound - Expected| / Span)
     ▼
[mobile-bff / v1/calibration]
     │
     ├──> [gigalibs_cmms.calibration_records] (Stores As-Found & As-Left raw datasets)
     ├──> [esignature module] (Binds cryptographically verified 21 CFR Part 11 signature)
     └──> [physical-operations-cmms] (Marks PM Schedule item complete, resets counter)
```
