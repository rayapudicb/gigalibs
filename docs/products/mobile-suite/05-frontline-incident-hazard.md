# Product Spec 05: Frontline Hazard, Near-Miss & Incident Reporter
**Module Code:** `M-INC`  
**Parent Ecosystem:** GigaLibs Frontline Safety & EHS Incident Management  
**Complementary Existing Agents:** `process_safety_specialist`, `industry_manufacturing`, `ergonomics_human_factors`, `compliance`

---

## 1. Executive Summary & Business Outcomes

`M-INC` democratizes safety reporting by providing a frictionless, zero-barrier reporting mechanism for any worker on the shop floor. By capturing leading safety indicators (hazards, unsafe conditions, near-misses) in under 10 seconds, plants eliminate the paperwork hurdle that causes workers to ignore minor hazards until an injury occurs.

### Concrete Business Outcomes
* **5x Increase in Frontline Hazard Reporting (Leading Indicators):** Lowers reporting friction to zero, capturing 500+ near-misses annually before they escalate to recordable injuries.
* **45% Drop in OSHA Recordable Incident Rate (TRIR):** Addressing high-frequency trip/slip/leak/pinch hazards proactively.
* **Instant "Stop Work" Escalation:** Imminent life-safety hazards trigger instant notifications to the entire plant area within 3 seconds.
* **Automated OSHA 300 / 300A & RIDDOR Logging:** Seamless generation of statutory regulatory reports directly from verified incident datasets.

---

## 2. Personas & RBAC Matrix

| Feature / Action | Any Frontline Worker (Mobile) | Area Safety Champion (Mobile/Web) | EHS Director (Web) | Legal & HR (Web) |
|---|:---:|:---:|:---:|:---:|
| 1-Tap 10-Second Hazard Submission | **Full** | **Full** | Read | None |
| Emergency "Stop Work" Immediate Alert | **Trigger** | **Acknowledge** | **Acknowledge** | Read |
| Photo Markup & Voice Recording | **Full** | **Full** | Read | None |
| Hazard Triage & Risk Matrix Rating | None | **Evaluate** | **Full** | None |
| Incident Investigation & 5-Why RCA | None | **Participate** | **Full** | Read |
| OSHA 300 / 300A Regulatory Filing | None | None | **Full** | **Full** |

---

## 3. Mobile Application Functionalities (Field Execution)

### 3.1. Ultra-Rapid Safety Capture
* **Zero-Login Quick Shortcut:** Quick tile on mobile home screen (or lock screen widget) directly launches camera.
* **Live Photo Markup Tool:** Camera takes picture, immediately loads a simple markup canvas:
  * Red circle / arrow tool to highlight the hazard (e.g., exposed wire, chemical puddle).
  * 1-touch voice memo (up to 30 seconds of audio transcribed instantly to text).
* **Auto-Geotagging & Area Assignment:** Uses indoor BLE beacons, Wi-Fi fingerprinting, or GPS to automatically tag the location down to the specific building and bay.
* **3-Button Severity Categorization:**
  * `[Minor / Good Catch]` (Triage within 48h)
  * `[Moderate / Unsafe Condition]` (Triage within 8h)
  * `[Critical / STOP WORK]` (Instant audible alarm broadcast to area supervisor)

---

## 4. Web Application Functionalities (EHS Command Console)

* **Hazard Triage Kanban:** Incoming cards triaged by EHS officers into: *Actionable Maintenance*, *Training Needed*, *Root Cause Investigation*, or *Resolved*.
* **5-Why & Fishbone RCA Studio:** Interactive root-cause analysis canvas for severe near-misses and recordable injuries.
* **Plant Heatmap Analytics:** Plant layout overlay displaying recurring hazard clusters (e.g., *“High slip hazard frequency in Packhouse Conveyor Bay”*).
* **Statutory Compliance Exporter:** 1-click export of OSHA 300, 300A, and 301 logs with redaction of private personal data.

---

## 5. Design Benchmarks & 5-Second to 10-Second Physical User Journey

**Physical Work Area Benchmark:** Operator walking down a catwalk spots hydraulic oil leaking onto a ladder rung. Target time to log: **6 to 8 seconds**.

```
[Step 1: Launch Camera] (1.0s)
  Worker taps the dedicated orange "Report Hazard" floating icon. Camera is instantly live.

[Step 2: Snap & Mark] (3.0s)
  Worker taps shutter -> draws a quick red circle around the oil puddle on the rung.

[Step 3: Quick Voice Memo] (2.5s)
  Worker presses mic button, speaks: "Hydraulic leak on Line 2 overhead line dripping on ladder."

[Step 4: Tap Severity & Submit] (1.0s)
  Worker taps [Unsafe Condition] -> [Submit].
  Screen flashes green check. Supervisor notified.
  Total action time: 7.5 seconds.
```

---

## 6. Architecture & GigaLibs Integration

**Implementation status:** The diagram is a product sketch; its route, table and event names are unverified proposals. Use the [frontline suite implementation plan](../../plans/frontline-mobile-suite-implementation-plan.md) for proposed ownership, contract order and acceptance gates.

```
[Mobile Device]
     │ (HTTPS / Image Multipart Upload)
     ▼
[mobile-bff / v1/safety/incident]
     │
     ├──> [gigalibs_safety.incidents] (Persisted incident record)
     ├──> [@gigalibs/broker (topic: plant.safety.hazard_reported)]
     │         │
     │         ├──> [physical-operations-cmms] (Generates Emergency Remediation WO)
     │         └──> [communications / SMS / Push] (Immediate push alert to Area Safety Lead)
     └──> [universal-connector-hub] (Optional sync to corporate EHS systems like Cority/Enablon)
```
