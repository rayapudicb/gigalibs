# How to read this document

This specifies every SPEED Stage 1 screen precisely enough to build slices S3 to S7 without guessing. It is written
for the implementers of those slices (`backend_domain`, `web_experience`, `api_contracts`), for `design_system`
(tokens) and for `content_design` (messages).

| Source | Used for |
| --- | --- |
| The clickable mock (`SPEED-Desk-Screening-Prototype.html`) | Layout, flow, every state and action |
| SPEED-BRD-FRD-001 v0.1 and blueprint BP-01 | Requirement IDs and rules |
| Implementation plan v1.3 (§3.3, §4) | Windows, panels, data model, API |
| WI-OI-120bs, metadata panels (`ad75a0f1`) | How panels are registered and placed |
| WI-OI-120br, the engine package (`68be9379`) | The codes every screen translates |
| WI-OI-120bv, actions and Stage 2 plan (engines 0.2.0) | The codes in §4.4 and §4.5 |

**One rule runs through the whole document: the mock is the UI, and metadata drives it.**

- **Metadata** decides what appears where, in what order, for whom and when. That covers windows, tabs, fields,
  labels, panels, actions, permissions and visibility, all declared in the module's dictionary.
- **A registered panel** decides only what it draws. Panels are code, reviewed like code, and placed by metadata.
- **Engines return codes and numbers, never text.** Every message comes from the catalogue in section 4.

<!-- pagebreak -->

# 1. Conventions

## 1.1 Windows and routes

| Window (surface key) | Main entity | Page route | Slice |
| --- | --- | --- | --- |
| `speed-projects` | `speed.projects` | `/speed/projects` | S3 |
| `speed-routes` (the route workbench) | `speed.routes` | `/speed/routes` | S4 to S7 |
| `speed-substances` | `speed.substances` | `/speed/substances` | S4 |
| `speed-thermal-data` | `speed.thermal-data` | `/speed/thermal-data` | S5 |
| `speed-criteria` | `speed.criteria-sets` | `/speed/library/criteria` | S5 |
| `speed-library-materials` | `speed.library-materials` | `/speed/library/materials` | S6 |
| `speed-interaction-rules` | `speed.interaction-rules` | `/speed/library/rules` | S6 |
| `speed-reaction-classes` | `speed.reaction-classes` | `/speed/library/reaction-classes` | S6 |
| Audit trail (platform audit, filtered) | — | `/speed/audit` | S2 + S3 |
| Outcomes (module page, not a record window) | — | `/speed/outcomes` | S9 |

Navigation, as dictionary entries:

| Order | Item | Permission |
| --- | --- | --- |
| 1 | Projects | `speed.routes.read` |
| 2 | Routes | `speed.routes.read` |
| 3 | Substances | `speed.routes.read` |
| 4 | Thermal data | `speed.routes.read` |
| 5 | Library, with Materials, Interaction rules, Reaction classes and Screening criteria under it | `speed.routes.read` |
| 6 | Audit trail | `speed.audit.read` or `.read-own` |
| 7 | Outcomes | `speed.routes.read` |

All entries are hidden without the entitlement.

## 1.2 The panel catalogue (`spec.ui.panels` in `module.yaml`)

Every panel binds to `RECORD`, the route the tab shows. Props are typed and checked when the window is published
(WI-OI-120bs).

| Component key | Draws | Props (type, required) | Placed on |
| --- | --- | --- | --- |
| `speed.route-summary` | The six summary tiles | `compact` (BOOLEAN) | Route & gate, top |
| `speed.gate-workbench` | Step rail, step equation, materials grid, process conditions, gate result | — | Route & gate |
| `speed.ob-chart` | OB chart with the alert band, OB table, energetic-group tags | `showTable` (BOOLEAN) | Oxygen balance |
| `speed.thermal-panel` | Step pills, six tiles, temperature ladder, Stoessel strips, gas, mitigation, all-steps table | — | Thermal & runaway |
| `speed.interaction-matrix` | Step pills, matrix, findings and controls, single-material notes | — | Interactions |
| `speed.green-scorecard` | Route tiles, step metrics, PMI by stream | `showStreams` (BOOLEAN) | Green metrics |
| `speed.writeup-parser` | Paste box, extraction table, confirm and apply | — | Write-up parser |
| `speed.dossier-preview` | Dossier preview, generate and download, JSON and CSV export | — | Dossier |

**Edits inside panels.** The gate workbench, the parser and the control and mitigation entries change records:
steps, materials, conditions, controls and mitigations. Those entities and their fields are declared in the dictionary
and saved through the module's **record routes**. Permissions, validation, the reason, concurrency and audit therefore
work exactly as they do in a metadata form. The panel is only the editing surface.

## 1.3 Permissions

| Permission | Lets the user |
| --- | --- |
| `speed.routes.read` | See projects, routes, results, the library and criteria |
| `speed.routes.write` | Create and edit draft routes, steps, materials, conditions, controls and mitigations, and tag energetic groups |
| `speed.substances.write` | Create, edit and archive substances |
| `speed.thermal-data.write` | Enter thermal data; while a route is in review (R2), also its condition fields |
| `speed.engines.run` | Ask for a recompute (every save recomputes anyway) |
| `speed.reviews.submit` / `.approve` (R2) | Submit and withdraw / review, return, accept mitigations, approve and sign (never their own route) |
| `speed.libraries.propose` / `.approve` / `.apply` | Library and criteria change control (R2); `.apply` also imports a cited pack (R1) |
| `speed.settings.manage` | Module settings: display name, units, criteria in force |
| `speed.audit.read` / `.read-own` | The whole audit trail / their own entries |

**Editability by status.**

| Status | What can be edited |
| --- | --- |
| Draft | Everything, given `speed.routes.write` |
| Submitted or In review (R2) | Condition fields only, given `speed.thermal-data.write` |
| Approved | Nothing. A change needs "Create new version" |
| Superseded | Nothing |

R1 has only Draft.

## 1.4 States every screen shows

| State | When | What the user sees |
| --- | --- | --- |
| Loading | Fetching | "Loading…" (no skeleton flash under 300 ms) |
| Empty | No records | One sentence saying what is missing, plus the create action if permitted |
| Locked | The gate fails for the step (FR-GATE-04) | "Engines locked. The gate is failing for this step. Fix it on the Route & gate tab." |
| Invalid input | An engine `INVALID` (§15.1) | The coded messages next to the fields, with the field outlined |
| Not computed | A `notComputed` code | The reason message instead of the number, as "—" plus the reason |
| Data gap | `DATA_GAP` (a criterion or library value missing) | "Not computed: the screening criteria have no value for {key}." Nothing is ever defaulted |
| Unreviewed library | `usesUnreviewedLibrary` | A blue "Unreviewed library" tag on the result, and an entry in the dossier's data gaps |
| Read-only | Status or permission | Inputs disabled, with no hidden values |
| Conflict | The row version changed | "Someone else changed this record. Reload to see their change." (the platform's message) |
| Refused | 403 | "You do not have access to this." Nothing else is revealed |
| Panel unavailable | Registry miss (WI-OI-120bs) | "This panel is not available", naming the component |

## 1.5 Tokens, tones and formatting

Colour is **never** the only signal: every tone also carries a text label. Tones use `@medusajs/ui` Badge colours and
`ui-*` tokens only. The mock's CSS variables map one-to-one:

| Mock variable | GigaLibs token |
| --- | --- |
| `--bg-base`, `--bg-subtle`, `--bg-component`, `--bg-highlight` | `bg-ui-bg-base`, `bg-ui-bg-subtle`, `bg-ui-bg-component`, `bg-ui-bg-highlight` |
| `--fg-base`, `--fg-subtle`, `--fg-muted`, `--fg-error`, `--fg-interactive` | `text-ui-fg-base`, `-subtle`, `-muted`, `-error`, `-interactive` |
| `--border-base`, `--border-interactive` | `border-ui-border-base`, `border-ui-border-interactive` |
| `--tag-{red,orange,green,blue,neutral}-{bg,fg}` | `bg-ui-tag-*-bg` / `text-ui-tag-*-text` (neutral → grey) |
| `--seg-r/a/s/w` (PMI stream colours) | The tag blue, purple, orange and green icon tokens, each with a legend label |
| `--watermark` | The dossier files only (S7), not screens |

| Meaning | Badge colour |
| --- | --- |
| High, Critical, gate blocked, Stoessel class 4–5 | red |
| Medium, Review, class 3, Returned | orange |
| Low, passed, class 1–2, Approved, control documented | green |
| Data gap, Unreviewed library, Submitted | blue |
| In review | purple |
| Draft, Superseded, not applicable | grey |

**Numbers.** The locale comes from the user's settings (en-GB in the mock). Display rounding only; stored values are
never rounded (NFR-09).

| Quantity | Decimals |
| --- | --- |
| OB %, ΔTad, MTSR, TD24, TMRad (h) | 1 |
| ξ | 4 |
| Molar mass | 2 |
| mol | 3 |
| Equivalents | 2 |
| PMI, E-factor | 2 per step, 1 per route |
| AE, RME, yield | 1 |

Units always appear in the label ("Mass (g)", "Cp J/g·K").

**Layout.** 1366 × 768 minimum; a 12-column grid; panels use their placement span.

<!-- pagebreak -->

# 2. Record windows (S3–S6)

## 2.1 Projects (`speed-projects`, S3)

- **List:** Project code, Name, Site, Owner, Routes (count), Status. Search by code and name; sort by code.
- **Form** (section Main): code (TEXT, required, unique per workspace), name (TEXT, required), site (REFERENCE to the
  organisation replica's sites), owner (REFERENCE to users, defaults to the current user), notes (TEXTAREA).
- **Child tab "Routes"** (level 1, `project-routes`): the project's routes with the routes list columns (2.3).
- **Actions:** archive (COMMAND, `speed.routes.write`, with a reason).
- **Dropped from the mock:** the portfolio tiles move to Outcomes (2.8).

## 2.2 Substances (`speed-substances`, S4)

- **List:** Name, CAS, Formula, Molar mass, Library material, Status.
- **Form:**
  - name (required);
  - CAS (TEXT, pattern checked);
  - formula (TEXT, required, parsed on save; the parser's codes become field errors, §4.1);
  - density (NUMBER, g/mL);
  - library material (REFERENCE to `speed-library-materials`; it supplies the reactivity classes);
  - molar mass (read-only: computed on the server, with "IUPAC 2021 weights, v…" as help text);
  - structure (R2, S13).
- **Actions:** new version (when a substance is used by an approved route, R2); archive.
- A substance used by an approved route is read-only.

## 2.3 Routes list (`speed-routes`, LIST view; the mock's Projects table)

- **Columns:** Project, Route, Version, Status, Steps, Worst class, High interactions, Last change.
- **Derived columns.** Worst class, High interactions and Steps passing the gate are read-only fields the API fills
  from the latest result, so they sort and filter like any field.
- **Status tones** as in §1.5. Opening a route opens the workbench (2.4).

## 2.4 Route workbench (`speed-routes` record view, S4 to S7)

Record tabs (WI-OI-120bs): a main tab plus further level-0 tabs on the same record, which hold panels only.

| Tab (position) | Fields (main tab only) | Panels (key: component, span) | Shown when |
| --- | --- | --- | --- |
| **Route & gate** (0) | Section Header: route name, project, version (read-only), status (read-only), author (read-only) | `summary`: `speed.route-summary` (12); `gate`: `speed.gate-workbench` (12) | Always |
| **Oxygen balance** (1) | — | `ob`: `speed.ob-chart` (12), `showTable: true` | Always |
| **Thermal & runaway** (2) | — | `thermal`: `speed.thermal-panel` (12) | Always |
| **Interactions** (3) | — | `interactions`: `speed.interaction-matrix` (12) | Always |
| **Green metrics** (4) | — | `green`: `speed.green-scorecard` (12), `showStreams: true` | Always |
| **Write-up parser** (5) | — | `parser`: `speed.writeup-parser` (12), read permission `speed.routes.write` | Status is Draft |
| **Dossier** (6) | — | `dossier`: `speed.dossier-preview` (12) | Always |

**Header actions.**
- R1: Edit (draft fields) and Archive.
- R2 lifecycle actions, as dictionary COMMAND actions, each shown only in its status (visibility condition) and only
  with its permission:

  | Action | Status | Permission |
  | --- | --- | --- |
  | Submit for review | Draft | `speed.reviews.submit` |
  | Withdraw to draft | Submitted | `speed.reviews.submit` |
  | Start review | Submitted | `speed.reviews.approve` |
  | Return with comments | In review | `speed.reviews.approve`; dialog with required text |
  | Approve and sign | In review | `speed.reviews.approve`; the platform e-signature (S10), never available to the author |
  | Reopen as draft | Returned | `speed.reviews.submit` |
  | Create new version | Approved | `speed.routes.write` |

- Approval guards (§4.3 of the plan) refuse it with a coded message listing what blocks it.

**Notices above the tabs (R2).**
- Returned: "Returned by the safety reviewer: {comment}" (orange).
- Approved: "Approved and locked. Signed by {name} ({meaning}, {time}). Changes need a new version." (green).

### Panel `speed.route-summary`

Six tiles, in this order (FR-RPT-01 summary; mock route header):

| Tile | Value | Note | Tone |
| --- | --- | --- | --- |
| Gate | {passing}/{steps} | "Steps mole-balanced" | green if all pass, otherwise red |
| Worst criticality | "Class {k}" | "Worst of actual and 100 % accumulation" | by class |
| High interactions | {controlled}/{total} | "With a documented control" | red if any is undocumented |
| Route PMI | number, or "—" | "kg input per kg product" | — |
| Atom economy | "{n} %" | "Route, from balanced equations" | — |
| Data gaps | count | "Listed in the dossier" | blue if more than 0 |

`compact` puts the tiles in one row of smaller tiles.

### Panel `speed.gate-workbench` (S4; FR-INP-01 to 06, FR-GATE-01 to 06)

**Layout:** step rail on the left (3 columns); the step on the right (9 columns); the gate result below the step.

1. **Step rail.**
   - One item per step: number, name, a gate badge ("Gate passed" or "Gate blocked", with a tick or cross) and a class
     badge ("Class 3", or "Class —").
   - "Add step" when the route is editable.
   - Keyboard: arrow keys move, Enter opens.
2. **Step.**
   - The step name: editable in a draft.
   - The written equation: reactants → product + by-products, with coefficients and subscripts.
   - **Reason recorded with each change:** a SELECT from the value list `change-reasons`: Data entry, Correction,
     Measured value, Literature value, Mitigation. It is sent with every save (FR-AUD-01).
3. **Materials grid** (entity `speed.step-materials`).

   | Column | Behaviour |
   | --- | --- |
   | Role | SELECT: Reactant, Additive, Solvent, Work-up, Product, By-product |
   | Substance | REFERENCE to substances, with "Add new" (F0.6) |
   | Formula | Read-only, from the substance |
   | ν | Editable only for Reactant, Product and By-product |
   | Mass (g) | Not editable for a by-product |
   | MW | Read-only |
   | mol | Read-only |
   | eq | Read-only; reactants only, relative to the first charged reactant |
   | Remove | Draft only |

   "Add material" appends a row. Each formula error shows its parser code (§4.1) as a field error.
4. **Process conditions** (entity `speed.step-conditions`).
   - Tp (°C).
   - MTT (°C, "boiling point or vessel limit").
   - Cp (J/g·K).
   - Accumulation Xac (%).
   - Dosing: Batch, Semi-batch (dosed), Semi-batch (portions).
   - ΔHr source: reaction-class library (estimate), or measured or manual value.
     - With a reaction class: Reaction class (REFERENCE).
     - With a manual value: ΔHr (kJ/mol) and Source note.
   - Ea (kJ/mol), q at T ref (W/kg), T ref (°C), TD24 if known (°C), DSC onset (°C).
   - Range errors and warnings come from the criteria in force (§4.1, `INPUT_*`).
5. **Gate result** (`aria-live="polite"`).
   - A "Passed" (green) or "Blocked" (red) badge.
   - When blocked: "Engines are locked for this step until these are fixed:", then each issue as code badge + message.
   - The element table: Element, In, Out, and a tick or cross labelled "balanced" or "unbalanced".
   - "Reaction extent ξ = {ξ} mol, limiting: {material}."

**Save.** Each change saves through the record routes with the reason, recomputes on the server, and refreshes the
gate result and the rail badges.

### Panel `speed.ob-chart` (S5; FR-OB-01 to 06, BRL-02)

- **Explainer.** "OB% = −1600/MW × (2C + (H − X)/2 + 2S − O). Halogens are taken as HX and sulfur as SO₂. Inorganic
  and metal-containing materials are not applicable and are classified by reactivity. Band source: {citation of the
  criteria in force}."
- **Chart.** A horizontal axis from −350 % to +100 % (ticks every 50).
  - The alert band is shaded, with the label "Alert band {lower} % to +{upper} %", both values from the criteria.
  - One point per distinct material formula; its tooltip gives name and value.
  - Accessible name: "Oxygen balance of every material, with the alert band".
  - Legend badges: "High: band + energetic group → DSC and ARC mandatory" (red); "Review: in band, or tagged" (orange);
    "Low" (green).
- **Table** (`showTable`): Step, Material, Formula, MW, OB %, Band ("In band" orange / "Outside" grey), Energetic groups,
  Recommendation.
  - Energetic groups: tag badges, removable in a draft, plus an "Add tag" picker from the energetic-group library.
  - Not applicable: "n/a: classify by reactivity" (grey).
- **Dropped:** the mock's "Try it…" hint.

### Panel `speed.thermal-panel` (S5; FR-THM-01 to 12, BRL-05, BRL-06)

1. **Step pills** ("Step 1" … "Step n"). The selected step's heading is "Step {n}: {name}".
2. **States.** Locked (§1.4); Invalid (the coded range errors); otherwise the content below.
3. **Six tiles.**

   | Tile | Value | Note | Tone |
   | --- | --- | --- | --- |
   | ΔHr | "{n} kJ/mol" or "Not computed" | an "Estimate" tag + source label, or the not-computed reason | — |
   | Heat released | "{Q} kJ" | "{q′} kJ/kg of reaction mass" | — |
   | ΔTad | "{n} K" | "Severity: {Low, Medium or High}" | by severity |
   | MTSR at {Xac} % | "{n} °C" | "At 100 % accumulation: {n} °C" | — |
   | TD24 | "{n} °C" or "Missing" | the source (§4.2) | conservative onset orange; missing blue |
   | TMRad at MTSR | "{n} h" | "Probability: {…}" | by probability |
4. **Cooling-failure scenario.**
   - The **temperature ladder**: a vertical axis with markers Tp, MTSR (Xac), MTSR (100 %), MTT and TD24, each labelled
     with its value. Labels never overlap (a minimum 16 px gap). Accessible name: "Temperature ladder for the
     cooling-failure scenario".
   - **Two Stoessel strips**, "Actual ({Xac} %)" and "Full accumulation". Each has five cells, the assigned one marked
     and labelled "Class {n}, assigned".
   - The class action text from the catalogue (§4.3), or "The class cannot be assigned without TD24 and MTT."
5. **Gas evolution.**
   - Table: Gas (name and formula), mol, L at STP; then "Compare with vessel headspace and vent capacity."
   - With none: "No gas-forming by-product in this step."
6. **Mitigation** (class 4 or 5).
   - The card "Mitigation required (class {k})".
   - In a draft with `speed.routes.write`: a mitigation text box, empty. The mock's prefilled text was demo data;
     suggested text comes from the library rule's control if the specialist adds one.
   - Once recorded: "Recorded by {user}: {text}" plus "Awaiting acceptance" (orange), or "Accepted" (green) by
     {user} on {time} (R2, `speed.reviews.approve`).
   - Without permission: "Recorded by the chemist or engineer while the route is a draft; accepted by the safety
     reviewer during review."
7. **All steps.** Table: Step, Name (opens that step), ΔTad (K), MTSR (°C), TD24 (°C), TD24 source, Class (actual /
   100 %).

### Panel `speed.interaction-matrix` (S6; FR-HAZ-01 to 06)

1. **Step pills,** with the High count ("Step 4 · 1 High").
2. **Matrix: step {n}.**
   - Rows and columns are the step's materials, numbered, including work-up streams and by-products. The diagonal is
     "·".
   - A cell with a finding shows H, M or L in its tone. Activating it scrolls to and focuses the finding.
   - Legend: "H High · M Medium · L Low. Every pair in the step, including work-up streams and by-products."
   - Unclassified materials: "Not in the library (no classes): {names}."
3. **Findings and controls,** most severe first. Each finding shows:
   - the severity badge, "{A} × {B}" and the rule ID badge;
   - the rule's finding text (library);
   - "Citation: {citation} · Library v{version} ({status})".
   - **High findings:**
     - in a draft with permission: a control text box, prefilled with the rule's control text from the library, and
       "Document control";
     - once documented: "Control documented" (green) plus the text and its author.
   - With none: "No finding from the current rule library."
4. **The statement, always shown:** "**Absence of a finding does not prove safety.** The library is incomplete until
   reviewed and cited."
5. **Single-material notes.** "{material}: {note} ({citation})" for each linked library material with a note.

### Panel `speed.green-scorecard` (S5; FR-GRN-01 to 04, BP-01 §4.B)

1. **Four route tiles.**

   | Tile | Note |
   | --- | --- |
   | Route PMI | "kg of all inputs per kg of final product" |
   | Route E-factor | "PMI − 1, water included" |
   | Route atom economy | "Final product / all consumed reactants" |
   | Overall yield | "Product of the step yields" |

   When the roll-up is blocked: "The route roll-up needs every step to pass the gate and have an isolated product
   mass (step {n})."
2. **Step metrics.** Table: Step, Name, AE %, Yield %, RME %, PMI, E, E (no water), Solvent intensity.
   - Note: "Intermediates carried forward are excluded from the route totals: {list}."
   - **Dropped:** the mock's "illustrative charges" sentence.
3. **PMI by stream** (`showStreams`).
   - One stacked bar per step: Reactants, Additives, Solvents, Work-up, in kg/kg, with the PMI value at the bar's end.
   - The legend carries text labels. Accessible name: "Process mass intensity by stream for each step".

### Panel `speed.writeup-parser` (S8; FR-INP-07, 08; D8: no AI)

- **Heading:** "Lab write-up or patent text".
- **Controls:** a target step selector and a text area. Pasted text is not saved until the user confirms.
- "Extract" runs the deterministic parser in the browser: "Pattern-based extraction. Nothing is used until you confirm
  it. No AI and no network call: the lab deployment stays on site."
- **Extracted table:** Confirm (checkbox), Type, Found (source excerpt), Value (editable).
  - With nothing extracted: "Press Extract to read temperatures, masses, volumes, amounts, equivalents, times, dosing
    statements and known reagents."
- **Recognised reagents** (matched to library materials), or "None recognised."
- **Apply** buttons, for confirmed values only:
  - "Use confirmed temperature as Tp";
  - "Add confirmed materials to the step".

  Each saves through the record routes with the reason "Data entry".

### Panel `speed.dossier-preview` (S7; FR-RPT-01 to 05)

1. **Actions.**
   - "Generate dossier" creates a job (shows its progress), then lists DOCX and PDF with their hash.
   - "Download" uses a signed link.
   - "Export JSON" and "Export CSV".
2. **Preview.** The same model as the files.
   1. **Summary.** Tiles: Steps, Worst class, Critical actions, "Route PMI · AE · yield". Then the action totals by
      level.
   2. **Route and gate.** The equation and gate result per step.
   3. **Thermal and runaway.** Table: Step, Name, ΔTad, MTSR, TD24 and its source, Class.
   4. **Interactions.** The findings with citations and controls.
   5. **Actions before kilo-lab.**
      - Every action from the engine's action list, with its level (Critical red, Review orange, Data gap blue), step,
        message and rule ID.
      - New pure engine function `actionList(results, library, criteria)`, added to the S1 package in S7. The rules
        are the mock's `buildActions`, with texts moved to the catalogue (§4.4).
   6. **Stage 2 test plan.**
      - Table: Step, Target, Test, Why.
      - Derived by `stage2Plan(results, library)` from the OB, thermal, gas and interaction results.
      - The test recommended for an interaction comes from the **library rule** (a `recommendedTest` field), not from
        code. The mock's hard-coded "DMSO with acid or base" case becomes data.
   7. **Basis and references.** Engine version, criteria version and citations, library version and status, element
      table version, and the inputs hash.
   8. **Signatures** (R2). Table: Name, Role, Meaning, Date and time (UTC). Until signed: "Not yet signed."
3. **Watermark.** Until the route is approved, every page of the files says "DRAFT — NOT APPROVED". On screen, a banner
   says the same.

<!-- pagebreak -->

# 3. Library, criteria, audit and outcomes

## 3.1 Library windows (S6; FR-ADM-02, BRL-08, §16.2)

| Window | List columns | Form |
| --- | --- | --- |
| `speed-library-materials` | Name, CAS, Formula, Reactivity classes, Note, Citation, Status | name, synonyms, CAS, formula, classes (multi-select from the class value list), note, citation (required), status (read-only) |
| `speed-interaction-rules` | Rule, Classes (A × B), Severity, Finding and control, Recommended test, Citation, Status | rule ID, class A, class B, severity, finding text, control text, recommended test, citation (required) |
| `speed-reaction-classes` | ID, Reaction class, Typical ΔHr, Range, Source, Flag | name, typical ΔHr (kJ/mol), range, source, citation (required); the flag is always "Estimate" (BRL-05) |

- **R1:** read-only lists.
- **"Import cited pack"** (COMMAND, `speed.libraries.apply`) loads a pack. Every entry is "Unreviewed" (blue). The
  import is audited.
- **R2 actions:**
  - "Propose change" (`speed.libraries.propose`), as a dialog;
  - "Approve" (`.approve`);
  - "Apply" (`.apply`).
- **Footer:** "Change control: the safety reviewer proposes, QA approves, the administrator applies. Each applied change
  raises the library version, which is stamped on every result."

## 3.2 Screening criteria (`speed-criteria`, S5)

- **Main tab: the criteria set.** Version, status (Unreviewed, Approved, In force), "in force" (one per workspace),
  cited by, applied on.
- **Child tab: Values.** Key (fixed list: the engine's criteria keys), value, unit, citation (required), note.
- **Actions:**
  - R1: "Import cited pack" and "Put in force" (`speed.settings.manage`, with a reason).
  - R2: propose, approve and apply, as for the library.
- **Example.** The alert band row shows "−160 % to +80 %" with its citation. Until the process safety lead confirms the
  source (BRD Q3), its status is "Unreviewed".

## 3.3 Audit trail (S2 + S3; FR-AUD-01, 02)

- **Heading and note:** "Audit trail. Secure, time-stamped, append-only. No role can edit or delete an entry."
- **Columns:** Time (UTC), Local, User, Action, Record, Field, Old → New, Reason / meaning.
- **Filters:** route, user, action, date range.
- **Export CSV** (`speed.audit.read`).
- `speed.audit.read-own` users see only their own entries.

## 3.4 Outcomes (module page `/speed/outcomes`, S9; BO-1 to BO-5)

- **Heading and note:** "Business outcomes. The BRD's objectives, measured from SPEED's own data."
- **Tiles:**

  | Tile | Value |
  | --- | --- |
  | BO-1, hazards found before the first experiment | Count of High and Medium interactions, class 3 or worse steps, and gas-forming steps |
  | BO-2, time to screen a route | Median from opening to submission (R2); in R1, opening to the first dossier. Target ≤ 2 h |
  | BO-3, routes screened before kilo-lab | Screened / all; target 100 % |
  | BO-4, economy visible at route selection | Share of routes with a route PMI and AE in their dossier |
  | BO-5, transfer findings raised by the plant | "Later stage" (SPEED Stage 5) |

- **"What the client receives":** the dossier contents list.
- **Moved here from the mock's Projects page:** the portfolio tiles "Routes screened before kilo-lab" and "Worst
  criticality in portfolio".

## 3.5 Dialogs (R2)

| Dialog | Fields | Rules |
| --- | --- | --- |
| Electronic signature | Meaning (Approved, Reviewed), password re-entry | The platform Part 11 service (S10) re-authenticates against the directory. The mock's "any 6 characters" is dropped |
| Return to the author | Comment (required) | Shown on the route until it is reopened |
| Propose a change | The library entry's fields; reason (required) | Creates a proposal, not an edit |

## 3.6 Dropped from the mock

| Mock element | Why | Instead |
| --- | --- | --- |
| Role switcher | Demo only | Real sign-in and roles (D4) |
| Journey guide panel | Demo only | Product help (`content_design`) |
| Reset | Demo only | — |
| Browser storage | Demo only | The module API and `gigalibs_speed` |
| Illustrative route, charges and library | Zero mock | Cited packs imported as unreviewed; TC-12 charges stay in tests |
| "Try it…" and "illustrative charges" sentences | Demo text | — |
| Prefilled mitigation text | Demo data | Empty, or the library rule's control text |
| Hard-coded Stage 2 "DMSO with acid or base" | Hard-coded | The library rule's `recommendedTest` |
| "DSC onset − 100 K" in the action text | Hard-coded | The criteria set's `td24ConservativeOnsetOffsetK` |
| ARC recommended for an entered TD24 | Mock defect: an entered TD24 was treated as conservative | No action and no Stage 2 test for an entered TD24 |

<!-- pagebreak -->

# 4. Message catalogue

The engine package (WI-OI-120br) returns codes and parameters. These are the English texts; translations follow the
same keys (`i18n`). `{…}` marks a parameter.

## 4.1 Formula and gate (FR-GATE-01 to 06, FR-INP-05, BRL-01, BRD §15.1)

| Code | Text |
| --- | --- |
| `FORMULA_EMPTY` | Enter a molecular formula. |
| `FORMULA_UNKNOWN_ELEMENT` | Unknown element "{element}". |
| `FORMULA_UNEXPECTED_CHARACTER` | Unexpected character "{character}" in the formula. |
| `FORMULA_UNMATCHED_BRACKET` | "{bracket}" has no opening bracket. |
| `FORMULA_UNCLOSED_BRACKET` | A bracket is not closed. |
| `FORMULA_EMPTY_HYDRATE_PART` | Nothing on one side of a hydrate dot. |
| `GATE_COEFFICIENT_INVALID` | The coefficient ν must be greater than 0. |
| `GATE_CHARGE_MASS_INVALID` | A reactant's charge mass must be greater than 0. |
| `GATE_PRODUCT_MISSING` | Define one main product. |
| `GATE_PRODUCT_NOT_UNIQUE` | Only one main product is allowed. Mark the others as by-products. |
| `GATE_ELEMENT_BALANCE` | The element balance does not close for {elements}. |
| `GATE_NO_CHARGED_REACTANT` | Enter the charge mass of at least one reactant to set the reaction scale. |
| `GATE_FORMULA_IGNORED` (warning) | This material's formula is not valid; it is ignored in calculations. |

## 4.2 Thermal (FR-THM-01 to 12, BRD §15.1)

| Code | Text |
| --- | --- |
| `INPUT_OUT_OF_RANGE` | {field} must be between {min} and {max}. |
| `INPUT_UNUSUAL` | {field} is outside the usual range ({min} to {max}). Check the value. (ΔHr: "beyond {warnBelow} kJ/mol") |
| `THM_ENTHALPY_SOURCE_MISSING` | Choose a ΔHr source and enter a value. |
| `THM_REACTION_CLASS_UNKNOWN` | The reaction class is not in the library. |
| `THM_HESS_FORMATION_ENTHALPY_MISSING` | Missing ΔHf° for: {materials}. |
| `THM_CONDITIONS_REQUIRED` | Enter Tp, Cp and the accumulation. |
| `DATA_GAP` | Not computed: the screening criteria have no value for {missing}. |
| TD24 basis `KINETICS` | Decomposition kinetics |
| TD24 basis `ENTERED` | Entered value |
| TD24 basis `CONSERVATIVE_ONSET` | DSC onset − {offset} K (conservative, BRL-06) |
| TD24 basis `OUT_OF_SEARCH_RANGE` | TMRad does not reach 24 h between {min} and {max} °C |
| TD24 basis `MISSING` | Missing |
| OB `NOT_APPLICABLE` | n/a: classify by reactivity |
| OB `INVALID_FORMULA` | Invalid formula |

## 4.3 Stoessel class actions (content: the process safety specialist confirms before release)

| Class | Text |
| --- | --- |
| 1 | Low risk. Standard controls. |
| 2 | Low risk unless held hot for long. Avoid prolonged hold at MTSR. |
| 3 | Boiling is the barrier. Check reflux and condenser capacity and gas release. |
| 4 | Boiling may stop the runaway, but decomposition is possible. Technical measures and Stage 2 testing are mandatory. |
| 5 | Critical. Decomposition triggers before boiling. Redesign the process before scale-up. |

## 4.4 Actions before kilo-lab (S7 `actionList`; texts reviewed with 4.3)

`actionList(steps, decisions, library, criteria)` returns the actions in route order (WI-OI-120bv). Parameters
carry ids, not names: the panel and dossier resolve material names from the route records, rule texts from the
library rule (`ruleId`) and gas names from the library gas (`gasId`). `mitigationAccepted` and `controlDocumented` come
from the route's records (BRL-03, BRL-04), passed in as `decisions`. A step whose gate fails yields only
`ACTION_GATE_FAILING`. `stepId` is empty for a route-level action.

| Code | Level | Rule | Parameters | Text |
| --- | --- | --- | --- | --- |
| `ACTION_GATE_FAILING` | Critical | FR-GATE-04 | — | The gate is failing: no results for this step. |
| `ACTION_OB_HIGH` | Critical | BRL-02 | `materialId` | {material}: OB in the alert band with an energetic group. DSC and ARC are mandatory before synthesis. |
| `ACTION_OB_REVIEW` | Review | FR-OB-05 | `materialId`, `percent`, `basis` | `ALERT_BAND`: {material}: OB {percent} % is inside the alert band. Confirm by DSC or a cited value. `ENERGETIC_GROUP`: {material}: an energetic group is tagged. Confirm by DSC or a cited value. |
| `ACTION_STOESSEL_CRITICAL` | Critical | FR-THM-09 | `stoesselClass`, `mitigationAccepted` | Stoessel class {k}. `yes`: Mitigation accepted: {the mitigation record's text}. `no`: A mitigation must be recorded and accepted before approval. |
| `ACTION_STOESSEL_3` | Review | FR-THM-09 | — | Stoessel class 3: boiling is the barrier. Check reflux and condenser capacity and gas release. |
| `ACTION_INTERACTION_HIGH` | Critical | BRL-04 | `ruleId`, `materialAId`, `materialBId`, `controlDocumented` | {A} × {B}: {rule text}. `yes`: Control documented. `no`: Control not yet documented. |
| `ACTION_INTERACTION_MEDIUM` | Review | FR-HAZ-02 | `ruleId`, `materialAId`, `materialBId` | {A} × {B}: {rule text}. |
| `ACTION_DH_ESTIMATE` | Data gap | BRL-05 | — | ΔHr comes from a reaction-class estimate. Measure it by reaction calorimetry. |
| `ACTION_TD24_CONSERVATIVE` | Data gap | BRL-06 | `offsetK` | TD24 is DSC onset − {offsetK} K (conservative). Measure the decomposition kinetics by ARC. |
| `ACTION_NO_DECOMPOSITION_DATA` | Data gap | FR-THM-07 | — | No decomposition data: the Stoessel class cannot be assigned. Run DSC of the reaction mixture. |
| `ACTION_TD24_OUT_OF_RANGE` | Data gap | FR-THM-07 | — | TMRad does not reach 24 h in the search range. Measure the decomposition kinetics by ARC. |
| `ACTION_THERMAL_NOT_COMPUTED` | Data gap | FR-THM-01 | `reasonCode` | Thermal results not computed: {the §4.2 text of `reasonCode`}. |
| `ACTION_CRITERIA_MISSING` | Data gap | FR-THM-01 | `missing` | Not computed: the screening criteria have no value for {missing}. |
| `ACTION_GAS_EVOLUTION` | Review | FR-THM-11 | `materialId`, `gasId`, `moles`, `litresAtStp` | {gas} released: {moles} mol ({litresAtStp} L at STP). Check headspace and vent capacity. |
| `ACTION_LIBRARY_UNREVIEWED` | Data gap | BRD 16.2 | `libraryVersion` (route level) | Hazard library v{libraryVersion} is not yet reviewed by the process safety specialist. |

## 4.5 Stage 2 test plan (S7 `stage2Plan`)

`stage2Plan(steps)` lists each step, target and test once; steps whose gate fails are left out (WI-OI-120bv).

| Reason code | Rule | Target | Test | Why (text) |
| --- | --- | --- | --- | --- |
| `STAGE2_OB_HIGH` | BRL-02 | `MATERIAL` | `DSC_ARC` | OB in the band with an energetic group (BRL-02) |
| `STAGE2_OB_REVIEW` | FR-OB-05 | `MATERIAL` | `DSC` | OB inside the alert band, or an energetic group is tagged |
| `STAGE2_DH_ESTIMATE` | BRL-05 | `REACTION_MIXTURE` | `RC1` | ΔHr is an estimate (BRL-05) |
| `STAGE2_NO_DECOMPOSITION_DATA` | FR-THM-07 | `REACTION_MIXTURE` | `DSC` | No decomposition data |
| `STAGE2_TD24_CONSERVATIVE` | BRL-06 | `REACTION_MIXTURE` | `ARC` | Replace the conservative TD24 (BRL-06) |
| `STAGE2_TD24_OUT_OF_RANGE` | FR-THM-07 | `REACTION_MIXTURE` | `ARC` | TD24 is outside the search range |
| `STAGE2_STOESSEL_CLASS` | FR-THM-09 | `REACTION_AT_DOSING` | `RC1_ACCUMULATION` | Stoessel class {stoesselClass} |
| `STAGE2_GAS_RELEASED` | FR-THM-11 | `MATERIAL` | `GAS_MEASUREMENT` | {moles} mol released |
| `STAGE2_INTERACTION_RULE` | FR-HAZ-02 | `MATERIAL_PAIR` | The library rule's `recommendedTest` | {rule text} |

| Target | Text |
| --- | --- |
| `MATERIAL` | {material} |
| `MATERIAL_PAIR` | {A} + {B} |
| `REACTION_MIXTURE` | Reaction mixture |
| `REACTION_AT_DOSING` | Reaction at the intended dosing |

| Test code | Text |
| --- | --- |
| `DSC` | DSC |
| `DSC_ARC` | DSC and ARC |
| `ARC` | ARC |
| `RC1` | Reaction calorimetry (RC1) |
| `RC1_ACCUMULATION` | Reaction calorimetry with accumulation |
| `GAS_MEASUREMENT` | Gas measurement |
| `DSC_MIXTURE` | DSC of the mixture |

A library rule's `recommendedTest` must be a code in this table: the library import (S6) rejects any other, so every
test in the plan has a text. A new test needs its code and text here first.

<!-- pagebreak -->

# 5. Accessibility

- Tabs, step rails and pills are `role="tablist"` with `aria-selected`. Arrow keys move, and focus is visible
  (`border-ui-border-interactive`).
- Charts are `role="img"` with an accessible name, and their numbers also appear in the tables next to them.
- Badges always carry text. The matrix cells' accessible names read as "{A} × {B}: High".
- The gate result and recompute updates are `aria-live="polite"`.
- Every input has a label with its unit, and every error is tied to its field (`aria-describedby`).
- Contrast is WCAG 2.2 AA in light and dark themes, through the `ui-*` tokens (`accessibility_testing` in S5).

# 6. Acceptance checks per slice

| Slice | The screens are done when |
| --- | --- |
| S3 | Projects and the routes list behave as §2.1 and §2.3; navigation is hidden without the entitlement; the audit trail shows module entries with old, new and reason |
| S4 | The gate workbench: adding, editing and removing steps and materials saves through the record routes with a reason; the gate result and rail badges update after every save; TC-04 and TC-05 reproduce on screen; formula errors show their §4.1 texts |
| S5 | OB, thermal and green panels show the S1 test values for TC-01 to TC-03 and TC-06 to TC-10, with all states of §1.4; the ladder and strips show the TC-08 classes; the criteria window holds the cited set in force |
| S6 | TC-11 shows as a High finding with citation; controls document and display; the "absence of a finding" statement is always present; library windows show the imported pack as unreviewed |
| S7 | The dossier preview and files have the eight sections; the watermark is on every page until approval; the actions and Stage 2 plan come from `actionList` and `stage2Plan`, whose texts are in the catalogue; the hash matches on download |
| All | `audit:design-tokens` passes; no hard-coded text, colour or threshold in the module's web package; panels are placed only by the dictionary; 1366 × 768 works; keyboard-only use completes the route-to-dossier journey |
