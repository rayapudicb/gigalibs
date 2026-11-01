# Product Spec 11: Mobile Asset Tagging, GIS & Field Commissioning
**Module Code:** `M-TAG`  
**Parent Ecosystem:** GigaLibs Asset Lifecycle & Enterprise Asset Management (EAM)  
**Complementary Existing Agents:** `maintenance_cmms_lead`, `geospatial`, `reliability_engineering_specialist`, `industry_manufacturing`

---

## 1. Executive Summary & Business Outcomes

`M-TAG` solves the massive operational bottleneck of onboarding, verifying, and mapping physical assets during greenfield plant startups, acquisitions, and brownfield modernization audits. Rather than recording asset serial numbers on clipboards and manually entering them into desktop spreadsheets, reliability engineers and technicians walk the facility with a mobile tablet, photograph the machine nameplate, auto-extract technical specifications via OCR, bind an NFC/RFID tag, and map its exact GPS/indoor location in under 30 seconds.

### Concrete Business Outcomes
* **85% Faster Plant Asset Onboarding & Audits:** Cuts greenfield asset registration time from 15 minutes down to 45 seconds per asset.
* **100% Elimination of Transposition Errors in Serial Numbers:** Optical Character Recognition (OCR) auto-reads stamped metal nameplates directly into structured fields.
* **Accurate Geographic & Plant Hierarchy Placement:** Automatically ties assets to physical parent systems (Enterprise → Site → Building → Area → Line) and spatial coordinates.
* **Seamless Field Verification:** Instantly detects "ghost assets" (assets in the ERP that don't physically exist) and unrecorded equipment on the plant floor.

---

## 2. Personas & RBAC Matrix

| Feature / Action | Field Commissioning Tech (Mobile) | Reliability Engineer (Web & Mobile) | Plant Maintenance Lead (Web) | GIS / CAD Specialist (Web) |
|---|:---:|:---:|:---:|:---:|
| Field Commission New Asset | **Full** | **Full** | Read | None |
| Nameplate Photo OCR Extraction | **Execute** | **Execute** | Read | None |
| Write Physical NFC / RFID Tag | **Write** | **Write** | None | None |
| Approve Newly Commissioned Asset | None | **Review** | **Authorize** | None |
| Reassign Parent Asset in Tree Hierarchy | None | **Full** | **Full** | Read |
| Spatial Floorplan & GIS Alignment | Read | Read | Read | **Full** |

---

## 3. Mobile Application Functionalities (Field Execution)

### 3.1. Field Commissioning Assistant
* **Nameplate AI-OCR Scanner:** Technician aims camera at the stamped metal manufacturer nameplate. On-device vision OCR parses:
  * Manufacturer (e.g., *Siemens*)
  * Model Number (e.g., *1LE1001-1DB23-4AA4*)
  * Serial Number (e.g., *E1809/1498234*)
  * Electrical/Mechanical Ratings (e.g., *15 kW, 1470 RPM, 400V, 50 Hz*)
* **1-Tap Physical Tag Binding:** User taps an unprogrammed NFC sticker or scans a 2D DataMatrix code. The UUID is instantly bound to the newly created asset record.
* **Indoor & Outdoor Spatial Tagging:**
  * Outdoor: Captures high-precision GPS coordinates.
  * Indoor: Tap on a digital plant architectural floor plan to drop a spatial pin at the exact column line (e.g., *Bay C, Column 14*).
* **Parent-Child Hierarchy Selector:** Quick-picker assigns the asset to its functional location (e.g., *Line 2 Packaging → Conveyor Belt 04 → Drive Motor*).

---

## 4. Web Application Functionalities (Asset Master & Floorplan Studio)

* **Commissioning Triage Console:** Web review workbench where reliability managers review field-onboarded assets, verify technical specs, and approve inclusion into the active asset registry.
* **Interactive Plant Floorplan Overlay:** CAD/BIM floor plans showing real-time pins for all commissioned assets with zoom-in capability down to individual motors and valves.
* **Asset Discrepancy & Audit Tool:** Compares physical floor walk audits against legacy ERP databases to identify missing, relocated, or decommissioned machinery.

---

## 5. Design Benchmarks & 5-Second to 10-Second Physical User Journey

**Physical Work Area Benchmark:** Field engineer standing in front of a newly installed water pump. Target time to bind tag and capture location: **8 to 10 seconds**.

```
[Step 1: Snap Nameplate] (3.0s)
  Engineer holds camera to pump nameplate. App auto-extracts: "Grundfos CRN 15-08, S/N: 98124501".
  Fields populate automatically on screen.

[Step 2: Bind NFC Tag] (2.0s)
  Engineer taps phone to new metal-mount NFC tag stuck to the pump casing.
  App chimes: "Tag #NFC-8802 bound successfully."

[Step 3: Pin Location & Select Parent] (3.0s)
  - Engineer taps [Indoor Map] -> drops pin on Water Treatment Room room node.
  - Quick-picker selects: Parent -> [Skid WT-01].

[Step 4: Save & Commission] (1.0s)
  Engineer taps [Submit Asset].
  Asset created in CMMS with status "Commissioned - Pending Approval".
  Total action time: 9.0 seconds.
```

---

## 6. Architecture & GigaLibs Integration

**Implementation status:** The diagram is a product sketch; its route, table and event names are unverified proposals. Use the [frontline suite implementation plan](../../plans/frontline-mobile-suite-implementation-plan.md) for proposed ownership, contract order and acceptance gates.

```
[Mobile Device]
     │ (HTTPS Payload with OCR metadata & location)
     ▼
[mobile-bff / v1/assets/commission]
     │
     ├──> [physical-operations-cmms.assets] (Creates new Master Asset Record)
     ├──> [geospatial module] (Stores GIS / indoor spatial coordinate point)
     └──> [universal-data-studio / ontology] (Maps asset schema to enterprise hierarchy)
```
