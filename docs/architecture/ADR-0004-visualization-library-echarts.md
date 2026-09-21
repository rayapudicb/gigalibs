# ADR-0004 — Visualization Library: Apache ECharts

Status: Accepted  
Deciders: Product (repository owner — 2026-09-22)  
Work item: WI-OI-043 (External Data Analytics & Reporting Studio)  
Supersedes: none  

---

## Context

WI-OI-043 requires a chart rendering library for the Analytics & Reporting Studio's charts, dashboards, and
report artifacts. The library must support a Tableau-like evolution path for B2B SaaS: high data volume,
multiple advanced chart types, cross-filtering, drill-down, and accessible table equivalents.

Three candidates were evaluated against the production completeness standard and the GigaLibs OSS adoption
gate (provenance, license, SBOM, vulnerability, accessibility, upgrade owner, removal plan).

| Criterion | Recharts | Nivo | Apache ECharts |
|---|---|---|---|
| Chart types | ~20 | ~30 | 80+ |
| Data volume (browser, no WebGL) | ~10K pts ceiling | ~5K pts | ~500K pts (canvas) |
| WebGL/large dataset mode | No | No | Yes (ECharts GL) |
| DataZoom (zoom/pan/brush) | Plugin, limited | No | Built-in |
| Cross-filtering | Manual | No | Built-in toolbox |
| Drill-down | Manual | No | Built-in |
| Parallel coordinates | No | No | Yes |
| Geo/map charts | No | Partial | Yes |
| Tree maps, sunbursts | Partial | Yes | Yes |
| Server-side rendering | No | Yes | Yes (ECharts SSR) |
| React wrapper maturity | Native | Native | echarts-for-react (good) |
| License | MIT | MIT | Apache 2.0 |
| SBOM / provenance | npm | npm | Apache top-level project |
| Known CVEs (2026-09-22) | None critical | None critical | None critical |
| Accessibility (WCAG 2.1 AA) | Partial SVG | SVG | Canvas + SVG + table equiv |
| Active maintenance | Yes | Slowing | Yes (Apache TLP, corporate) |

---

## Decision

**Apache ECharts** is adopted as the sole charting library for WI-OI-043, with the `echarts-for-react`
React wrapper.

Rationale:
1. Only ECharts provides the DataZoom + cross-filtering + drill-down triad needed for Tableau-competitive UX
2. Canvas renderer handles production-scale datasets without client-side ceiling; WebGL mode (ECharts GL)
   handles scatter matrices and 3D at analytical scale
3. Server-side rendering (`@apache/echarts-ssr`) produces consistent PNG/SVG report artifacts without a
   headless browser
4. Apache 2.0 is permissive and compatible with GigaLibs commercial licensing
5. Apache Software Foundation stewardship provides long-term maintenance assurance

---

## Provenance and supply chain

| Field | Value |
|---|---|
| Package | `echarts` |
| Version pinned | `5.5.1` |
| Upstream source | https://github.com/apache/echarts |
| Upstream commit (5.5.1) | `v5.5.1` tag on Apache GitHub |
| License | Apache-2.0 |
| NOTICE obligations | Preserve NOTICE file in distribution; include Apache attribution in OSS disclosures |
| SSR package | `@apache/echarts-ssr` (Apache, same license) |
| React wrapper | `echarts-for-react@3.0.2` (MIT) |
| SBOM entry | added to `docs/sbom/analytics-studio-sbom.json` |
| Known CVEs (scan date: 2026-09-22) | None — verify at each dependency upgrade |
| Accessibility proof | ECharts 5 SVG renderer + `aria` option produces labelled series; accessible table equivalent required for every chart (implementation spec in Phase 5) |
| Runtime dependency | Client-side bundle only; no server-side ECharts process dependency |
| Upgrade owner | Backend/Data engineer assigned to WI-OI-043 |
| Removal plan | ECharts is isolated behind a `ChartRenderer` abstraction layer; swap requires replacing the adapter, not the entire chart surface |

---

## Constraints

1. ECharts is imported **only** inside the `analytics-studio` module and the `packages/charts-react` adapter package. No other module may import it directly.
2. Every chart must have a server-rendered accessible table equivalent (`aria.show: true`, plus a `<table>` fallback rendered alongside the canvas in the DOM).
3. Tenant-supplied data never flows directly to ECharts `option.series.data` — it goes through the governed query engine response contract first.
4. `ECharts GL` (WebGL extension) may be imported only after a separate OSS adoption decision records its `@apache/echarts-gl` provenance.
5. `echarts-for-react` wrapper is the only React binding. Direct `echarts.init()` in component code is forbidden (violates the abstraction boundary).

---

## Alternatives not chosen

**Recharts**: MIT, React-native, good DX. Rejected — performance ceiling at ~10K data points, no DataZoom or cross-filtering, chart type breadth insufficient for Tableau evolution.

**Nivo**: MIT, SSR, beautiful defaults. Rejected — slow at analytical data volume, no interactive cross-filtering, slowing maintenance cadence, no DataZoom equivalent.

**Metabase/Superset/Lightdash embedded**: Rejected — creates a separate authenticated runtime, uncontrolled direct database access, separate auth authority, no GigaLibs ownership of the implementation. Explicitly forbidden by the agent prompt.

---

## Consequences

- `packages/charts-react` adapter package wraps `echarts-for-react` and exports `<AnalyticsChart>` with the GigaLibs design token integration
- All existing `industry-charts-catalog.ts` definitions are replaced by real dataset-backed chart definitions in Phase 5
- Report artifact generation uses `@apache/echarts-ssr` to produce PNG charts embedded in CSV/PDF report runs
- Upgrade cadence: pin exact version in `pnpm-lock.yaml`; upgrade owner reviews release notes and runs the accessibility/performance certification before merging
