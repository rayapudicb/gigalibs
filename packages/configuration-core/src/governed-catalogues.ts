import type { MetricCatalogueV1 } from '@gigalibs/contracts';

// WI-OI-064c: platform-shipped governed catalogues. A tenant installs one as a Configuration Studio change set,
// then approves, publishes and activates it. Industry and country packs moved to the solution layer in WI-OI-107:
// they are `solutions/packs/*`, compiled into @gigalibs/contracts (`SHIPPED_INDUSTRY_PACKS`, `SHIPPED_COUNTRY_PACKS`).

export interface BundledMetricCatalogue {
  readonly key: string;
  readonly title: string;
  readonly catalogue: MetricCatalogueV1;
}

export const BUNDLED_METRIC_CATALOGUES: readonly BundledMetricCatalogue[] = [
  {
    "key": "operations",
    "title": "Operations metrics",
    "catalogue": {
      "metrics": [
        {
          "kind": "AGGREGATE",
          "key": "labour_hours",
          "label": "Labour hours",
          "unit": "HOURS",
          "factType": "LABOUR_HOURS",
          "aggregate": "SUM"
        },
        {
          "kind": "AGGREGATE",
          "key": "labour_cost",
          "label": "Labour cost",
          "unit": "CURRENCY",
          "factType": "LABOUR_COST",
          "aggregate": "SUM"
        },
        {
          "kind": "AGGREGATE",
          "key": "spend",
          "label": "Spend",
          "unit": "CURRENCY",
          "factType": "SPEND",
          "aggregate": "SUM"
        },
        {
          "kind": "AGGREGATE",
          "key": "downtime_minutes",
          "label": "Downtime",
          "unit": "MINUTES",
          "factType": "DOWNTIME_MINUTES",
          "aggregate": "SUM"
        },
        {
          "kind": "AGGREGATE",
          "key": "carbon_kg",
          "label": "Carbon",
          "unit": "KG",
          "factType": "CARBON_KG",
          "aggregate": "SUM"
        },
        {
          "kind": "RATIO",
          "key": "cost_per_labour_hour",
          "label": "Cost per labour hour",
          "unit": "CURRENCY",
          "numerator": "labour_cost",
          "denominator": "labour_hours"
        },
        {
          "kind": "RATIO",
          "key": "carbon_per_labour_hour",
          "label": "Carbon per labour hour",
          "unit": "KG",
          "numerator": "carbon_kg",
          "denominator": "labour_hours"
        }
      ]
    }
  }
];
