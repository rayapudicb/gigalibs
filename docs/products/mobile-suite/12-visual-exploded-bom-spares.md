# Product Spec 12: Interactive Visual Exploded BOM / Spare Parts Explorer
**Module Code:** `M-BOM`  
**Parent Ecosystem:** GigaLibs Spare Parts Logistics, Material Ledger & MRO Supply Chain  
**Complementary Existing Agents:** `industry_manufacturing`, `maintenance_cmms_lead`, `inventory_warehouse_lead`, `product_designer`

---

## 1. Executive Summary & Business Outcomes

`M-BOM` bridges the gap between complex engineering schematics and dirty hands on the plant floor. Technicians frequently order the wrong replacement part because they cannot find the exact part number in text-only ERP catalogues or have to flip through 400-page paper PDF manuals. `M-BOM` gives technicians an interactive, pinch-to-zoom 2D/3D exploded view of the machine directly on their mobile tablet. Tapping on any gear, bearing, or seal in the diagram displays real-time warehouse stock (Available-to-Promise) and reserves the part to their active work order with one tap.

### Concrete Business Outcomes
* **95% Elimination of Incorrect Spare Part Requisitions:** Technicians visually confirm the exact component in the mechanical assembly before reserving.
* **40% Reduction in Work Order Wrench Time Delays:** Cuts parts identification from 45 minutes of manual catalog searching down to 10 seconds.
* **Accurate Material Ledger Consumption:** Directly debits the physical inventory bin in `universal-inventory` and attributes MRO cost to the specific equipment asset.
* **Automatic Stockout Prevention:** When a part is reserved from the exploded diagram, inventory ATP is updated in real time; if safety stock is breached, it alerts procurement.

---

## 2. Personas & RBAC Matrix

| Feature / Action | Field Technician (Mobile Tablet) | Tool Crib / Warehouse Clerk (Web/Mobile) | Maintenance Planner (Web) | MRO Procurement Buyer (Web) |
|---|:---:|:---:|:---:|:---:|
| Visual Exploded Diagram Navigation | **Full** | **Full** | **Full** | Read |
| 1-Tap Part Reservation to Work Order | **Full** | **Full** | **Full** | None |
| View Real-Time Bin Location & Stock Level | **Full** | **Full** | **Full** | **Full** |
| Hot-Spotting Editor (Map SVG/CAD to Parts) | None | None | **Manage** | None |
| Reconcile Missing Part Numbers | Request | **Update** | **Full** | Read |
| Trigger Emergency Part Purchase Order | None | None | **Request** | **Authorize** |

---

## 3. Mobile Application Functionalities (Field Execution)

### 3.1. Interactive Visual Parts Navigator
* **Pinch-to-Zoom Assembly Canvas:** High-performance vector graphics (SVG / WebGL) rendering complex multi-part mechanical assemblies with smooth 60fps pan/zoom.
* **Visual Hot-Spot Highlighting:** Every individual component in the exploded diagram has an interactive touch target:
  * Green glow: In-stock in plant warehouse (displays bin location, e.g., *Bin B-14, Shelf 2*).
  * Yellow glow: Low stock / allocated to another job.
  * Red glow: Out of stock (displays estimated supplier lead time).
* **1-Tap Add to Work Order:** Tapping a component highlights its callout number (e.g., `#24 - O-Ring Viton 75`), shows current unit price, and offers a single thumb button: `[Reserve 1 for WO #4082]`.
* **Cross-Assembly Search:** Typing a keyword (e.g., *"impeller"*) zooms and highlights the specific part within the visual diagram instantly.

---

## 4. Web Application Functionalities (BOM Hot-Spotting Studio)

* **Visual Schematic Hot-Spotting Canvas:** Web utility where maintenance planners upload vendor 2D assembly drawings (SVG/PDF/CAD) and click on numbered balloons to bind them to internal inventory SKUs.
* **Multi-Level Equipment BOM Hierarchy:** Visual tree mapping complete machines down to sub-assemblies (e.g., *Pump → Power End → Wet End → Mechanical Seal Assembly → Individual O-Rings*).
* **Parts Consumption Heatmap:** Visual overlay showing which parts within a machine fail and get replaced most frequently over a 12-month operating window.

---

## 5. Design Benchmarks & 5-Second to 10-Second Physical User Journey

**Physical Work Area Benchmark:** Technician disassembling an overhead conveyor drive on an aerial scissor lift, needing a replacement drive pin. Target time: **5 to 8 seconds**.

```
[Step 1: Open Asset Diagram] (1.0s)
  Technician taps "View Visual BOM" on their active Work Order. Exploded drive assembly opens.

[Step 2: Pinch & Tap Component] (3.0s)
  Technician pinches to zoom into the planetary gearbox -> taps the sheared drive pin (Item #14).

[Step 3: Check Stock & Bin] (1.5s)
  Card pops up: "Drive Shear Pin 8x40mm (SKU: PIN-840). Stock: 14 available in Crib 1 (Bin G-08)".

[Step 4: 1-Tap Reserve] (1.0s)
  Technician taps [Reserve 1 for This WO].
  Part is reserved. Tool crib clerk notified to stage the part for pickup.
  Total action time: 6.5 seconds.
```

---

## 6. Architecture & GigaLibs Integration

**Implementation status:** The diagram is a product sketch; its route, table and event names are unverified proposals. Use the [frontline suite implementation plan](../../plans/frontline-mobile-suite-implementation-plan.md) for proposed ownership, contract order and acceptance gates.

```
[Mobile Device]
     │ (HTTPS Vector Render / GraphQL)
     ▼
[mobile-bff / v1/bom/visual]
     │
     ├──> [universal-inventory.material_ledger] (Checks real-time ATP and bin balance)
     ├──> [physical-operations-cmms.work_orders] (Adds reserved line item to WO BOM)
     └──> [@gigalibs/broker (topic: warehouse.stock.reserved)]
               │
               └──> [universal-procurement] (Triggers restock alert if ATP < Reorder Point)
```
