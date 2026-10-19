# Maintenance (CMMS): knowledge pack

- **Kept by:** `maintenance_cmms_lead`
- **Status:** Seed (2026-10-19, WI-OI-120bl). Sections 2–5 and 7 are not yet researched. Section 6 is verified
  against the repo and UAT.
- **Last reviewed:** 2026-10-19, card WI-OI-120bl

## 1. What it is for

Keep assets working, safely and at the lowest total cost:
- requests are raised, triaged and turned into work;
- work is planned, done and signed off;
- prevention replaces repair;
- the history shows what fails and why.

## 2. How the business works

Not yet researched. To cover, with sources:
- the request-to-close life cycle and who acts at each step;
- preventive maintenance by time and by meter;
- condition-based maintenance;
- contractors;
- permits and lockout (with `health_safety_environment_specialist`);
- spares and storerooms;
- shutdowns.

## 3. Rules and calculations

Not yet researched. With `reliability_engineering_specialist` and `financial_mathematics_specialist`:
- MTBF, MTTR, availability;
- PM compliance;
- backlog in weeks;
- planned versus reactive ratio;
- cost per asset;
- the due-date rules for schedules by time and by meter.

## 4. Best in class

Not yet researched. Start from BENCHMARKS.md (EAM/CMMS row):
- IBM Maximo, SAP PM/EAM, IFS for depth;
- MaintainX, UpKeep, Limble, Fiix for adoption and mobile.

## 5. Standards and regulation

Not yet researched. ISO 55000/55001, ISO 14224, EN 13306, SAE JA1011/JA1012, ISO 45001; statutory inspections per
country (with the industry leads).

## 6. GigaLibs today (verified 2026-10-19)

- **Module:** `modules/physical-operations-cmms`, entitlement `asset-maintenance`.
- **Metadata windows (8):** assets, classifications, meters, parts, requests, schedules, spaces, work orders.
- **Work-order states:** `OPEN → IN_PROGRESS ⇄ ON_HOLD → COMPLETED`, or `CANCELLED`
  (`packages/contracts/src/cmms/index.ts`).
  - Supervisor sign-off closes a completed work order (WI-OI-120bi, migrations 21 and 22). It is four-eyes, and a
    closed work order cannot be changed.
- **Requests:** raised by members and triaged by planners (migration 20, WI-OI-120be).
- **Access:** by role, unit and site. CMMS is in `SCOPE_ENFORCING_MODULES` (W1-B, WI-OI-120bk).
- **UAT:** release `1d8d2634`, CMMS at migration 22 (read-only check, 2026-10-19).
  - The last recorded journey, `dg84u3`, predates sign-off.
  - Proof of sign-off on UAT by journey is not recorded in this pack yet.
- **Reference only (GPL v2, never copied):** iDempiere `org.adempiere.base/src/org/compiere/model/MRequest.java`,
  `MRequestType.java`, `MAsset.java`, `MAssetGroup.java`.

## 7. Fit and gaps

Not yet researched; the first research card fills it against sections 2–5.

## 8. Open questions

- Which sector is the first paying CMMS customer: facilities, manufacturing, or another?
- Mobile and offline for technicians (plan U27) is Phase 6. Does the first customer need it sooner?

## Sources

- [1] The repository at commit `15199507` (2026-10-19) and the UAT read-only checks of 2026-10-19.
