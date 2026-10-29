/** WI-OI-130: availability-first downtime dashboard template (OEE performance/quality deferred until production facts exist). */
export const DOWNTIME_DASHBOARD_TEMPLATE = {
  key: 'cmms-downtime-availability',
  title: 'Asset Downtime & Availability',
  charts: [
    { title: 'Availability trend', metric: 'uptime_pct', dimensions: ['asset_id', 'week'], chartType: 'line' },
    { title: 'Downtime Pareto', metric: 'total_downtime_hours', dimensions: ['failure_cause'], chartType: 'horizontal_bar' },
    { title: 'MTBF trend', metric: 'mean_time_between_failures_hrs', dimensions: ['asset_classification'], chartType: 'bar' },
    { title: 'MTTR trend', metric: 'mean_time_to_repair_hrs', dimensions: ['asset_classification'], chartType: 'bar' },
    { title: 'Planned vs unplanned', metric: 'downtime_hours', dimensions: ['downtime_type'], chartType: 'stacked_bar' },
  ],
  filterDimensions: [
    'asset_id',
    'asset_classification',
    'site',
    'downtime_type',
    'failure_cause',
    'source',
    'date_range',
  ],
} as const;
