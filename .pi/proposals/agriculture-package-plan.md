# Agriculture Package Plan

- **Status:** proposal for the product owner. Not approved, not registered, not started.
- **Date:** 2026-09-29.
- **Prepared by:** Claude, from the repository (branch `feat/gigaops-convergence-core`), the product vision, the
  manufacturing package plan and the WI-OI-074 industry-pack design.
- **Scope:** AI predictions and IoT sensors are out of scope (Wave 3).

**For agents:** do not implement anything here until the owner approves it and registers the work items. Owner
decisions are listed in §8. The one-active-item rule applies. Where this plan and the vision documents disagree,
the vision wins: ask the owner.

## 1. Summary

- Agriculture is built as **configuration on top of common modules**, not as agriculture code.
- The **common analytics engine comes first.** It also serves manufacturing Release 1 (the WI-OI-090 KPIs), so
  it respects the owner's manufacturing-first decision.
- **Agriculture sources and the agriculture pack come after** the engine.

Principles:
- **Charts hold no data.** A chart is a saved query plus a chart template. The same data can be switched to any
  chart type that fits its shape.
- **No developer per requirement.** Analysts connect, model, chart and report in the UI. Developers build each
  layer once, plus one adapter per kind of source system.
- **Agriculture is a pack.** Wording, fields, lists, dashboards and metrics are settings. The only new code is
  reusable capability gaps, such as piece-rate pay.

## 2. How the package is put together

This follows the layers of the vision (§3): core, capability products, business modules, industry packs and
solutions. Only the top two layers are specific to agriculture, and both are configuration.

| Layer | Contents |
|---|---|
| **Solution** (configuration only) | `solutions/agriculture.yaml`: the selected modules, one industry pack and one country pack (units, currency and rules for the farm's country). |
| **Agriculture pack** (7 layers, WI-OI-074) | 1. Vocabulary: Farm, Field, Block, Crop, Season, Harvest run.<br>2. Fields and forms: variety, sowing date, soil test values.<br>3. Lists and types: crops, inputs, pest and disease codes, irrigation methods.<br>4. Screens and personas: farm owner, agronomist, farm manager, field worker.<br>5. Workflows: spray approval gate, harvest quality check.<br>6. Outcomes: metric catalogue and default dashboards.<br>7. Core rules: stay in code; none new except capability gaps. |
| **Common capability modules** (any industry; used by a business, not a business) | Connector Hub (pulls outside data), Geospatial (Farm › Field › Block places, boundaries, area), Analytics (model, query, charts, dashboards), Reports (scheduled CSV now; PDF and Excel in Reporting v2).<br>Code only, not running today: Workflow Studio (approval gates), Rules (rule-based advice), Communications (SMS and email alerts). |
| **Business modules** (optional, per farm) | Workforce (farm hands, crews, time, pay; piece-rate pay is a gap), CMMS (tractors, pumps, irrigation equipment), Inventory (seed, fertiliser; Wave 2, not built). |
| **Core** (every client) | Sign-in and sessions, tenants and entitlements, roles and permissions, audit. |

## 3. How data moves

This is how Palantir Foundry, Looker, Power BI and Tableau avoid a developer for every new question: each layer
is built once and then configured.

1. **Connect.** Connector Hub runs one adapter per system type, with scheduled incremental pulls and no
   duplicates. Sources: farmOS and Farmier, Ekylibre, Tania, weather, market prices.
2. **Model.** Standard farm records, with measures defined once (for example yield per hectare).
3. **Query.** One engine answers "measure by dimension, filtered by place, crop, season or date".
4. **Visualise.** Chart templates: 24 types plus a map. The chart type can be switched on the same data.
5. **Compose.** Dashboards and reports are saved views with shared filters and scheduled delivery.

**Every record carries its place.** Incoming data is linked to a Geospatial place (Farm › Field › Block) once,
when it arrives. Filters use the place tree, and each user's place scope limits what they can see.

## 4. Standard farm records and metric catalogue

Every source is mapped onto the same records. Metrics are formulas over those records, defined once in the model.
Units follow the country pack.

| Record | Key facts | First source |
|---|---|---|
| Farm, Field, Block | boundary, area (ha), parent place | farmOS land assets (WKT geometry) |
| Crop planting | crop, variety, planted area (ha), sowing date, season | farmOS plantings and seeding logs |
| Harvest | quantity and unit (t, kg, quintal), field, date, grade | farmOS harvest logs and quantities |
| Input application | product, rate per ha, cost | farmOS input logs, Ekylibre |
| Irrigation event | volume (m³), duration, method | farmOS activity logs |
| Soil test | pH, N, P, K (kg/ha), organic matter (%), EC (dS/m) | farmOS lab test logs |
| Field observation | pest or disease code, severity, photo | farmOS observation logs |
| Weather reading | rainfall (mm), temperature (°C), reference evapotranspiration ET₀ (mm) | weather provider (to choose) |
| Market price | commodity, market, price per tonne, date | price feed (to choose by country) |
| Cost and revenue | account, amount, field or crop | Ekylibre accounting; Workforce and CMMS costs |

| Metric | Unit | Formula |
|---|---|---|
| Yield | t/ha | harvest quantity ÷ planted area |
| Area by crop | ha | sum of field areas per crop and season |
| Water applied | mm, m³/ha | irrigation volume ÷ area, shown next to rainfall |
| Water productivity | kg/m³ | harvest ÷ water applied |
| Input cost | cost/ha | input cost ÷ planted area |
| Gross margin | margin/ha | (revenue − variable costs) ÷ area |
| Soil health | pH, kg/ha, % | latest value and trend per field |
| Pest incidence | % of fields | fields with an observation ÷ fields |

## 5. The owner's 10 requirements

| # | Requirement | Status | How | Phase |
|---|---|---|---|---|
| 1 | Crop Yield Prediction | Partly | Yield history per field and season now. The forecast needs a prediction model, after the AI decision (D11). | 5, then AI |
| 2 | Weather vs Crop Performance | Delivered | Weather readings per field location, joined to yields; scatter and multi-axis charts. | 4, 5 |
| 3 | Satellite & NDVI (area by crop type only) | Delivered | Area by crop from field boundaries and plantings. No satellite imagery is needed for area. | 3, 5 |
| 4 | Smart Irrigation Analytics | Partly | Water use from irrigation logs and weather now. Live soil-moisture sensors come with IoT (C10). | 5, then IoT |
| 5 | Pest & Disease Prediction | Partly | Where and when outbreaks happened (maps, heatmaps) now. Prediction after D11. | 5, then AI |
| 6 | Agricultural Market Price Analytics | Delivered | Price-feed adapter; trends by commodity and market. | 4, 5 |
| 7 | Farm Profitability Analysis | Delivered | Revenue and costs per field or crop: Ekylibre accounting, plus labour from Workforce and machinery from CMMS. No ledger is built (ADR-0013). | 4, 5 |
| 8 | Soil Health Analytics | Delivered | farmOS lab tests by field and over time; map by field. | 4, 5 |
| 9 | Crop Recommendation | Later | Rule-based advice once the Rules module runs; model-based advice after D11. | later |
| 10 | Agriculture Intelligence Platform | Delivered | The agriculture solution and pack, combining the items above. | 5 |

## 6. Development plan

Phases 1 to 3 are common and serve manufacturing too. Agriculture-specific work starts at phase 4, when the owner
schedules the second industry.

Sizes are relative (S, M, L); estimates follow the phase 0 decisions. Each phase is a work item with gates G0–G7,
and only one runs at a time.

### Phase 0: decisions and registration (S, owner)

Answer the decisions in §8. Register the work items with G0–G3 recorded, and choose when each starts. The GPT agent
holds the active slot until WI-OI-085 reaches Review.

**Exit:** the decisions are recorded, and phase 1 is registered as the next active item.

### Phase 1: complete the Analytics engine (L, common; serves manufacturing KPIs)

a. **Query.** One query contract:
   - measures, one or more dimensions, time grain, filters and place scope;
   - returns rows;
   - safe SQL;
   - keeps tenant isolation and the accessible data table.

b. **Model.**
   - Formula measures, such as yield per hectare.
   - Measure versions are published through maker-checker, and each chart keeps the version it was built on.
   - Sensitive measures are flagged.

c. **Speed.**
   - Typed fact rows.
   - Summaries per measure, place and day or month, refreshed as data arrives.
   - A result cache, and time and row limits.
   - A benchmark at 1M and 10M rows against the agreed target.

d. **Visualise.**
   - A chart is a query plus a chart template.
   - One renderer covers all 24 types.
   - A "change chart" menu offers only the types that fit the data.
   - A map chart is added. The static chart gallery is removed.

e. **Compose and permissions.**
   - Dashboards with shared filters (time, place, category).
   - Scheduled CSV reports.
   - Seven permissions and four default roles (§7).
   - Every change is audited.

f. **Proof on manufacturing data:** CMMS work orders by site over time, built with the no-developer test (§7).

**Exit:** the no-developer test passes on manufacturing data, and the Wave 1 KPIs (WI-OI-090) can be built on it.

### Phase 2: Connect, one path for outside data (M, common; can start after 1a and 1b)

a. **Adapter framework** in Connector Hub:
   - logins (OAuth2, API key, token);
   - paging styles and incremental pulls;
   - retries, and a quarantine for bad records.

b. **Bridge to Analytics:** raw records become datasets through no-code field mapping, including unit conversion
   (kg, quintal, t).

c. **Scheduler** for pulls and report runs.

d. **One connector owner.** An ADR makes Connector Hub the integration foundation (plan C10) and retires the
   copies in Analytics and the core API.

**Exit:** a REST source syncs on a schedule into a dataset, with no code beyond its adapter.

### Phase 3: places with boundaries (M, common; depends on decision 3)

a. Area is computed when a boundary is saved, and stored on the place.

b. Records with only coordinates are assigned to the smallest place that contains them. Unmatched records go to a
   visible "Unplaced" bucket.

c. Places are created or updated from source locations, keeping each source id linked to its place id.

d. Each user's place scope applies to every Analytics query. It arrives in the signed context today but is unused.

**Exit:** a map of fields coloured by a measure, filtered to one farm, shows only what the user may see.

### Phase 4: agriculture sources (M, agriculture; needs phases 2 and 3)

a. **farmOS adapter** (JSON:API, OAuth2 client credentials). It also covers Farmier, which hosts farmOS.

b. **Weather adapter** (provider to choose).

c. **Market price adapter** (source depends on country).

d. **Ekylibre adapter** (REST with a token) for accounting and profitability.

e. **Tania**, only if a client uses it (last change March 2026).

**Exit:** each source syncs a real farm's data into the standard records, with no code copied from GPL or AGPL
projects.

### Phase 5: agriculture pack and solution (M, agriculture, configuration only; needs phase 4 and the decision on where packs live)

a. Standard farm records as versioned contracts.

b. Vocabulary (resumes WI-OI-074), lists and personas.

c. Metric catalogue and default dashboards for requirements 2, 3, 4, 6, 7, 8 and 10, plus the history parts of
   1 and 5.

d. `solutions/agriculture.yaml` and its country pack.

e. Acceptance on a design-partner farm's data.

**Exit:** installing the pack on a new tenant needs no code change and no deploy.

### Phase 6: Reports v2, PDF and Excel (M, common; any time after 1e)

a. **Excel** from the same result table, one sheet per chart, with formula-injection protection (reuses the
   Workforce export pattern).

b. **PDF** with charts rendered on the server, the filters applied, data freshness, and a data table under each
   chart.

c. **Delivery** through the existing channels (email, webhook, SFTP, in-app) and signed download links.

The plan puts this in Wave 2 (WI-OI-096). Decision 6 can move it earlier.

**Exit:** a scheduled report arrives as PDF and Excel that match the screen.

## 7. Acceptance, security and permissions

### The no-developer test

An analyst does all of this in the UI, with no code change and no deploy. It runs first on manufacturing data
(phase 1f), then on a farm (phase 5e).

1. Connect a source and see its fields.
2. Map the fields to the standard records, including units.
3. Define a measure such as yield per hectare, and have a second person publish it.
4. Build a chart of that measure by field and month.
5. Switch the same chart to three other chart types without rebuilding the query.
6. Add it to a dashboard filtered to one farm. A user scoped to another farm sees nothing from it.
7. Schedule a report of the dashboard to a recipient who is allowed to see it.
8. Find every step in the audit log, and every number's lineage back to its source.

### Permissions

Declared in the Analytics manifest, so both the gateway and the module enforce them:

| Permission | Allows | Status |
|---|---|---|
| `analytics:read` | view dashboards | exists |
| `analytics:connectors:write` | connect sources | exists |
| `analytics:mappings:write` | map fields | exists |
| `analytics:models:write` | define measures | new |
| `analytics:charts:write` | build charts | new |
| `analytics:dashboards:write` | build dashboards | new |
| `analytics:reports:write` | define and schedule reports | new |
| `analytics:export` | download or export data | new |

**Default roles**, for owner approval:
- Viewer: read.
- Analyst: charts, dashboards and reports.
- Data steward: sources, mappings and measures.
- Tenant admin: all.

Custom roles come with WI-OI-077.

**Other rules:**
- Measure changes are drafts until a second person publishes them.
- Sensitive measures (pay, cost) need an extra permission.
- Scheduled reports run with their owner's rights, and go only to recipients allowed to see that data, checked at
  send time.

### Speed

- Never aggregate raw JSON. Build typed fact rows and summaries per measure × place × day or month, refreshed
  incrementally.
- The engine answers from the smallest summary that fits the question ("aggregate awareness").
- Results are cached per query and data version.
- Queries have time and row limits, and big reports run in the background.
- Consider a columnar engine, as an adapter, only if PostgreSQL misses the agreed target.

## 8. Owner decisions (needed before phase 1)

1. **Priority.** Schedule phases 1–3 next, since they serve manufacturing too, and decide when agriculture
   (phases 4–5) starts. Manufacturing stays first as decided; phase 1 feeds its Wave 1 KPIs.
2. **Who owns Reports.** Analytics, or a separate Reports module (ADR-0001, one owner per concept).
   *Recommendation:* Analytics owns report definitions and runs, and the core's switched-off Reports entry goes.
3. **Field geometry.** Compute area and containment in code now, or add PostGIS now. *Recommendation:* code now.
   Add PostGIS later if free-form map questions are needed, with an ADR and a restore drill first, because it
   changes the database image that holds the owner's data.
4. **Speed target.** *Suggested:* 95% of dashboard queries under 1 second at 10 million rows.
5. **Roles and maker-checker.** Viewer, Analyst, Data steward and Tenant admin; a second person publishes measure
   changes.
6. **PDF method and timing.** Server-rendered charts (recommended) or headless Chrome; and whether PDF and Excel
   come before Wave 2.
7. **Where industry packs live.** Inside Workforce today; the vision puts them at the solution layer across all
   modules. This is also the GPT agent's Task 2d.
8. **Data providers.** Weather, market prices for the target country, and satellite later if wanted.
9. **Design-partner farm.** Which farm, which source system (farmOS, Farmier or Ekylibre), and which country
   pack.
10. **One connector owner.** Connector Hub as the integration foundation (plan C10), retiring the other two
    copies.

## 9. Risks

- **Licences.** farmOS is GPL-2.0 and Ekylibre is AGPL-3.0. Integrate through their APIs only; never copy their
  code into GigaLibs.
- **Messy source data.** Missing boundaries, mixed units, fields without crops. Mapping handles units, and the
  Unplaced bucket keeps gaps visible.
- **Speed at volume.** Measured in phase 1c before anything is built on top.
- **Scope creep into prediction.** Kept out until D11.
- **Catalogue truth.** Agriculture is not advertised as available until it is Certified (vision §5).
- **Two agents at once.** Only one active item. The GPT agent is on WI-OI-085f now.

## 10. Not in this plan (later, by decision)

- Yield, pest and disease prediction, and model-based crop advice: AI gateway C11, after D11 (Wave 3).
- Live soil-moisture and flow sensors: IoT ingestion C10 (Wave 3).
- Satellite imagery and NDVI indices beyond field area.
- A general ledger. ADR-0013 rules it out; money figures come from the farm's accounting system.
- Piece-rate pay for crews: a reusable Workforce capability, when a client needs it.

## 11. Starting point (checked in the code, 2026-09-29)

| Area | Today | State |
|---|---|---|
| Chart library | 24 chart types in `@gigalibs/charts-react` (ECharts 6) | Ready |
| Saved charts | 9 types. A chart stores a query, not data, but `query-engine.service.ts` returns one total per measure: dimensions, filters and time grain are ignored. | Partial |
| Model | Measures are a simple SUM, AVG, COUNT, COUNT_DISTINCT, MIN or MAX of one field; no formulas | Partial |
| Fast facts | `operational_facts` and daily `place_rollups` by place; 1 million facts in about 6 ms (95th percentile, WI-OI-064) | Ready |
| Industry chart gallery | `IndustryChartsCatalogView` reads stored payloads from `telemetry_series` (0 rows); counts are hard-coded | Replace |
| Build permissions | Model, chart, dashboard, dataset and report routes name no permission. The web proxy (`lib/analytics-proxy.ts`) does not expose them yet. | Missing |
| Reports | Definitions, schedules and secure files (SHA-256, expiring links); CSV only; delivery by email, webhook, SFTP or in-app | Partial |
| Connector Hub | Generic REST pull (`?since=&limit=`) with no login; raw journal; nothing reaches Analytics; no scheduler | Partial |
| Analytics sources | External PostgreSQL only (`external_source_type`) | Partial |
| Geospatial | `spatial_nodes`: ltree path, latitude/longitude, boundary as JSON; no PostGIS. Place scope is in the signed context but unused by Analytics. | Partial |
| Industry packs | 9 JSON files in `modules/gigaops/config/industry-packs`, Workforce wording only; no agriculture pack | Missing |

## Sources

- farmOS: https://github.com/farmOS/farmOS
  - API: https://farmos.org/development/api/
  - Authentication: https://farmos.org/development/api/authentication/
  - Location and geometry: https://farmos.org/model/logic/location/
- Farmier (hosted farmOS): https://farmier.com/
- Ekylibre: https://github.com/ekylibre/ekylibre
  - API: https://ekylibre.stoplight.io/docs/eky/747a3d68e6ba3-ekylibre
- Tania: https://github.com/usetania/tania-core
