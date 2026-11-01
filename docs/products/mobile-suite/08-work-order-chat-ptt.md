# Product Spec 08: Frontline Work Order Chat & Push-to-Talk (PTT)
**Module Code:** `M-CHAT`  
**Parent Ecosystem:** GigaLibs Frontline Collaboration & Team Communications  
**Complementary Existing Agents:** `communication_orchestration`, `maintenance_cmms_lead`, `ergonomics_human_factors`, `web_experience`

---

## 1. Executive Summary & Business Outcomes

`M-CHAT` is the communication fabric of the industrial plant, combining the immediacy of WhatsApp/Slack with contextual enterprise work order execution. Frontline technicians and operators hate filling structured forms while troubleshooting in dirty, loud plant environments; `M-CHAT` allows them to capture machine conditions, share advice, and request assistance via threaded chats, voice memos, and Push-to-Talk (PTT) channels directly attached to specific assets and work orders.

### Concrete Business Outcomes
* **35% Reduction in Mean Time to Repair (MTTR):** Technicians solve complex faults faster by instantly pulling in senior specialists via live video/photo chat without walking across a 50-acre facility.
* **100% Elimination of Shadow IT:** Eliminates unmonitored consumer messaging apps (WhatsApp, SMS) where sensitive asset data, proprietary schematics, and safety discussions are lost.
* **Automatic Knowledge Capture:** Chat threads, photos, and voice notes attached to a work order are automatically indexed into the machine's permanent failure history.
* **Instant Frontline Dispatch:** Push-to-Talk emergency channels allow control room operators to broadcast urgent instructions to field crews instantly.

---

## 2. Personas & RBAC Matrix

| Feature / Action | Field Technician (Mobile) | Machine Operator (Mobile) | Maintenance Supervisor (Web/Mobile) | Plant Manager (Web) |
|---|:---:|:---:|:---:|:---:|
| Send Voice Memo / Photo in WO Thread | **Full** | **Full** | **Full** | Read |
| Use Push-to-Talk (PTT) Channel | **Full** | **Full** | **Full** | Listen |
| Broadcast Urgent Area Alert | None | None | **Authorize** | **Full** |
| Tag Asset / Auto-link Work Order | **Full** | **Full** | **Full** | Read |
| Export Incident Chat Log for RCA | Read | None | **Full** | **Full** |
| Manage Channels & Access Permissions | None | None | **Manage** | **Full** |

---

## 3. Mobile Application Functionalities (Field Execution)

### 3.1. Work-Order-Threaded Messaging
* **Contextual Thread Header:** Chat header clearly displays: `WO #4082 - Pump P-102 Overheating (High Priority)`.
* **Push-to-Talk (PTT) Walkie-Talkie Button:** Dedicated floating thumb button on screen. Holding down broadcasts real-time audio over the area channel (e.g., *Channel: Utilities & Steam*).
* **Industrial Media Attachments:**
  * Quick 10-second video clip capture with audio (captures strange mechanical grinding noises for remote diagnostics).
  * High-resolution photo upload with instant telestrator finger markup.
* **Voice-to-Text Auto-Transcription:** Audio messages automatically transcribe into searchable text inside the thread.

---

## 4. Web Application Functionalities (Dispatch & Command Center)

* **Multi-Channel Dispatch Console:** Web cockpit for maintenance planners and shift superintendents showing active channels, live PTT feeds, and open technician queries.
* **Asset Chat History Tab:** Under any asset in `physical-operations-cmms`, an integrated tab displays every past conversation, audio clip, and photo shared about that asset over its entire lifecycle.
* **Safety Keyword Listener:** Real-time stream processing flags critical safety terms (*"fire", "leak", "smoke", "spill", "hazard"*) and alerts the EHS desk.

---

## 5. Design Benchmarks & 5-Second to 10-Second Physical User Journey

**Physical Work Area Benchmark:** Technician holding a greasy wrench, needing advice on a seized bearing. Target time to ask for help: **5 to 7 seconds**.

```
[Step 1: Open WO & Tap Mic] (1.0s)
  Technician taps the active Work Order notification on mobile screen.

[Step 2: Record Voice & Photo] (4.0s)
  - Tech taps camera icon -> snaps photo of the seized bearing.
  - Tech holds thumb on mic icon: "Bearing cage cracked, need 6208 deep groove ball bearing from tool crib."

[Step 3: Send & Tag Tool Crib] (1.5s)
  Tech taps [@ToolCrib] -> [Send].
  Notification pushes to Tool Crib attendant with photo and part number.
  Total action time: 6.5 seconds.
```

---

## 6. Architecture & GigaLibs Integration

**Implementation status:** The diagram is a product sketch; its route, table and event names are unverified proposals. Use the [frontline suite implementation plan](../../plans/frontline-mobile-suite-implementation-plan.md) for proposed ownership, contract order and acceptance gates.

```
[Mobile Device]
     │ (WebSockets / WebRTC for PTT Audio)
     ▼
[communications module / mobile-bff]
     │
     ├──> [gigalibs_communications.messages] (PostgreSQL Partitioned Chat Storage)
     ├──> [physical-operations-cmms.work_orders] (Indexes chat into Work Order audit log)
     └──> [S3 / MinIO Object Storage] (Audio clips and high-res diagnostic photos)
```
