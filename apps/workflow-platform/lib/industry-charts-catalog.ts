/**
 * Industry Visualizations Catalog & Preset Data Engine
 *
 * Modeled after ThingsBoard IoT Dashboards and Chart.js sample categories.
 * Provides pre-configured, domain-tailored visual datasets across 6 industries:
 * 1. Smart Farming & Agriculture (ThingsBoard)
 * 2. Energy, Utilities & Smart Grid
 * 3. Supply Chain, Fleet & Cold-Chain Logistics
 * 4. Smart Manufacturing & Industrial IoT (IIoT)
 * 5. Healthcare, Clinical & Patient Telemetry
 * 6. Enterprise FinOps, B2B Billing & Cashflow
 *
 * Each industry defines:
 * - Default Showing Charts (4 core operational widgets shown initially)
 * - Extended Industry Visualizations (unlocked via "Explore All Industry Charts" picker)
 */

export interface IndustrySector {
  id: string;
  name: string;
  icon: string;
  badge: string;
  tagline: string;
  description: string;
  kpis: Array<{ label: string; value: string; delta: string; isPositive: boolean }>;
}

export type ChartFamily =
  | 'bar'
  | 'line'
  | 'area'
  | 'circular'
  | 'correlation'
  | 'radar'
  | 'combo'
  | 'specialized';

export interface IndustryChartDef {
  id: string;
  industryId: string;
  title: string;
  subtitle: string;
  chartType:
    | 'line'
    | 'steppedLine'
    | 'multiAxisLine'
    | 'area'
    | 'bar'
    | 'stackedBar'
    | 'floatingBar'
    | 'column'
    | 'stackedColumn'
    | 'donut'
    | 'pie'
    | 'polarArea'
    | 'scatter'
    | 'bubble'
    | 'radar'
    | 'gauge'
    | 'waterfall'
    | 'funnel'
    | 'heatmap'
    | 'treemap'
    | 'sankey'
    | 'boxPlot'
    | 'histogram'
    | 'comboBarLine';
  family: ChartFamily;
  isDefault: boolean; // Shown by default on initial dashboard load
  category: 'trends' | 'comparison' | 'composition' | 'statistical' | 'pipeline' | 'iot_telemetry';
  description: string;
  dimensions: string[];
  tags: string[];
  payload: any;
  sourceTable?: string;
  lineageSha256?: string;
  isLiveDatabaseSynced?: boolean;
  syncedAt?: string;
}

export const INDUSTRY_SECTORS: IndustrySector[] = [
  {
    id: 'farming',
    name: 'Smart Farming & Agriculture',
    icon: '🌾',
    badge: 'THINGSBOARD IoT',
    tagline: 'Precision Agriculture, Silo Telemetry & Soil Moisture Analytics',
    description: 'Collect critical indicators for agricultural production including silo thermal profiles, grain moisture, soil NPK nutrients, and real-time sensor alarms.',
    kpis: [
      // CONTAINED_P0: hardcoded KPI values removed from catalog IndustrySector definition.
      // These figures (silo count, grain temp, moisture index, alarm count) were static
      // constants presented as live operational data — fabricated data in production routing.
      // KPI values must come from the analytical dataset (WI-OI-043) once the ingestion
      // pipeline exists. Until then this array is empty.
    ],
  },
  {
    id: 'energy',
    name: 'Energy, Utilities & Smart Grid',
    icon: '⚡',
    badge: 'SMART GRID',
    tagline: 'Substation Telemetry, High-Voltage Grids & Peak Demand Balancing',
    description: 'High-frequency telemetry monitoring distribution substations, active megawatt loads, power factor variance, and battery energy storage systems.',
    kpis: [
      // CONTAINED_P0: hardcoded energy KPI values removed (MW load, Hz, generation %, health score).
    ],
  },
  {
    id: 'logistics',
    name: 'Supply Chain, Fleet & Cold-Chain',
    icon: '🚚',
    badge: 'FLEET TELEMETRY',
    tagline: 'Cold-Chain Refrigeration, Dynamic Routing & Delivery Telemetry',
    description: 'Autonomous logistics tracking temperature excursions across refrigerated containers, fuel efficiency, ETA accuracy, and fulfillment pipeline velocity.',
    kpis: [
      // CONTAINED_P0: hardcoded logistics KPI values removed (fleet count, cold-chain %, OTD %, fuel).
    ],
  },
  {
    id: 'manufacturing',
    name: 'Manufacturing & Industrial IoT',
    icon: '🏭',
    badge: 'INDUSTRY 4.0',
    tagline: 'Overall Equipment Effectiveness (OEE), Anomaly Detection & Robotics',
    description: 'Robotic assembly line sensor streams measuring vibration harmonics, thermal anomalies, machine cycle velocity, and scrap reduction analytics.',
    kpis: [
      // CONTAINED_P0: hardcoded manufacturing KPI values removed (OEE, cycle time, defect rate, anomalies).
    ],
  },
  {
    id: 'healthcare',
    name: 'Healthcare, Clinical & Life Sciences',
    icon: '🏥',
    badge: 'CLINICAL TELEMETRY',
    tagline: 'ICU Bed Occupancy, Patient Vitals Telemetry & Clinical SLA Compliance',
    description: 'Continuous patient telemetry tracking multi-parameter vitals (SpO2, Heart Rate, Arterial BP), critical triage wait times, and pharmacy dispensing reconciliation.',
    kpis: [
      // CONTAINED_P0: hardcoded healthcare KPI values removed (bed occupancy, triage time, SLA score).
    ],
  },
  {
    id: 'finops',
    name: 'FinOps, B2B Billing & Treasury',
    icon: '💰',
    badge: 'ENTERPRISE TREASURY',
    tagline: 'Cashflow Variance, 3-Way Match AP Burndown & Working Capital',
    description: 'Corporate treasury intelligence analyzing DSO/DPO divergence, multi-currency FX exposure, autonomous invoice reconciliation, and revenue realization bridges.',
    kpis: [
      // CONTAINED_P0: hardcoded FinOps KPI values removed ($14.82M cashflow, DSO, AP match rate).
      // These dollar figures and ratios were fabricated data in production routing.
    ],
  },
];

export const INDUSTRY_CHARTS_CATALOG: IndustryChartDef[] = [
  // ==========================================================================
  // 1. SMART FARMING & AGRICULTURE (ThingsBoard Inspired)
  // ==========================================================================
  {
    id: 'farm-silos-temp',
    industryId: 'farming',
    title: 'Silos Multi-Axis Temperature Profile',
    subtitle: 'Dual-axis thermal monitoring across Silo Alpha, Beta & Gamma (°C vs Ambient)',
    chartType: 'multiAxisLine',
    family: 'line',
    isDefault: true,
    category: 'iot_telemetry',
    description: 'High-precision telemetry from internal thermal cables inside grain silos compared against ambient field temperatures.',
    dimensions: ['Time Horizon', 'Internal Silo (°C)', 'Ambient Weather (°C)', 'Critical Threshold'],
    tags: ['ThingsBoard', 'Chart.js Multi-Axis', 'Thermal Telemetry', 'IoT Sensors'],
    payload: {
      categories: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', 'Now'],
      series: [
        { name: 'Silo A (Wheat)', data: [17.8, 17.5, 18.2, 19.4, 19.1, 18.4, 18.2], color: '#2563eb', unit: '°C' },
        { name: 'Silo B (Barley)', data: [18.5, 18.2, 18.8, 20.1, 19.8, 19.0, 18.7], color: '#10b981', unit: '°C' },
        { name: 'Ambient Field Weather', data: [12.4, 11.2, 16.5, 26.2, 24.8, 18.1, 15.6], color: '#f59e0b', unit: '°C' },
      ],
    },
  },
  {
    id: 'farm-crop-level',
    industryId: 'farming',
    title: 'Crop & Grain Fill Level (Cumulative)',
    subtitle: 'Stacked area fill percentage by silo storage compartment',
    chartType: 'area',
    family: 'area',
    isDefault: true,
    category: 'iot_telemetry',
    description: 'Stacked volume accumulation showing capacity saturation across storage bins to prevent overfill hazards.',
    dimensions: ['Timestamp', 'Silo Compartment', 'Fill Metric (%)'],
    tags: ['Stacked Area', 'Volume Sensor', 'ThingsBoard'],
    payload: {
      categories: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'],
      series: [
        { name: 'Silo A (Wheat)', data: [45, 52, 60, 68, 75, 82, 88], color: '#3b82f6' },
        { name: 'Silo B (Barley)', data: [30, 38, 45, 50, 58, 65, 72], color: '#10b981' },
      ],
    },
  },
  {
    id: 'farm-storage-status',
    industryId: 'farming',
    title: 'Silo Capacity & Aeration Efficiency',
    subtitle: 'Grouped column comparing current tonnage vs max rated capacity',
    chartType: 'column',
    family: 'bar',
    isDefault: true,
    category: 'comparison',
    description: 'Current metric tons stored vs rated maximum capacity with active aeration status.',
    dimensions: ['Silo Identifier', 'Metric Tons Stored', 'Rated Capacity'],
    tags: ['Column Chart', 'Capacity Management', 'Grouped Bars'],
    payload: {
      categories: ['Silo 01', 'Silo 02', 'Silo 03', 'Silo 04', 'Silo 05'],
      series: [
        { name: 'Current Tonnage (t)', data: [820, 640, 910, 480, 750], color: '#2563eb' },
        { name: 'Rated Capacity (t)', data: [1000, 1000, 1200, 800, 1000], color: '#93c5fd' },
      ],
    },
  },
  {
    id: 'farm-alarms-gauge',
    industryId: 'farming',
    title: 'Soil Moisture & Agronomic Health Score',
    subtitle: 'Real-time telemetry compliance dial (Speedometer SLA style)',
    chartType: 'gauge',
    family: 'specialized',
    isDefault: true,
    category: 'iot_telemetry',
    description: 'Composite agricultural health index synthesizing soil volumetric water content, pH balance, and leaf wetness.',
    dimensions: ['Sensors Active', 'Composite Score %'],
    tags: ['Gauge', 'ThingsBoard', 'Health Index'],
    payload: {
      value: 94.8,
      min: 0,
      max: 100,
      label: 'Optimal Soil Vitals',
    },
  },
  // "More Charts" for Farming:
  {
    id: 'farm-soil-radar',
    industryId: 'farming',
    title: 'Soil NPK Nutrient Balance (Multi-Axis)',
    subtitle: 'Spider radar plot of Nitrogen, Phosphorus, Potassium & Micro-minerals',
    chartType: 'radar',
    family: 'radar',
    isDefault: false,
    category: 'comparison',
    description: 'Multi-axis radar comparing target agronomic nutrient standards against live soil sensor readings.',
    dimensions: ['Nutrient Compound', 'Target Standard', 'Live Field Sample'],
    tags: ['Radar Chart', 'Soil Science', 'NPK Nutrients'],
    payload: {
      categories: ['Nitrogen (N)', 'Phosphorus (P)', 'Potassium (K)', 'Soil Organic C', 'Calcium (Ca)', 'Moisture'],
      series: [
        { name: 'Ideal Agronomic Target', values: [90, 85, 95, 80, 88, 75], color: '#94a3b8' },
        { name: 'Live Soil Sensors', values: [88, 92, 90, 82, 85, 78], color: '#10b981' },
      ],
    },
  },
  {
    id: 'farm-temp-floating',
    industryId: 'farming',
    title: 'Daily Micro-Climate Temperature Bounds',
    subtitle: 'Chart.js Floating Bar showing Min/Max diurnal thermal excursion',
    chartType: 'floatingBar',
    family: 'bar',
    isDefault: false,
    category: 'trends',
    description: 'Floating interval bars displaying the diurnal day/night temperature swings across field zones.',
    dimensions: ['Field Sector', 'Min Temp (°C)', 'Max Temp (°C)'],
    tags: ['Floating Bars', 'Chart.js Range', 'Temperature Bounds'],
    payload: {
      data: [
        { label: 'North Field', min: 11, max: 28, color: '#3b82f6' },
        { label: 'South Orchard', min: 14, max: 31, color: '#10b981' },
        { label: 'East Vineyard', min: 9, max: 26, color: '#8b5cf6' },
        { label: 'West Silos', min: 15, max: 24, color: '#f59e0b' },
      ],
      unit: '°C',
    },
  },

  // ==========================================================================
  // 2. ENERGY, UTILITIES & SMART GRID
  // ==========================================================================
  {
    id: 'energy-grid-load',
    industryId: 'energy',
    title: 'Regional Substation Megawatt Load',
    subtitle: 'Gradient area curve showing aggregate demand vs spinning reserve',
    chartType: 'area',
    family: 'area',
    isDefault: true,
    category: 'trends',
    description: 'Active grid demand in Megawatts compared to spinning reserve margins.',
    dimensions: ['Dispatch Hour', 'Active MW Load', 'Spinning Reserve'],
    tags: ['Smart Grid', 'Megawatts', 'Area Chart'],
    payload: {
      categories: ['02:00', '06:00', '10:00', '14:00', '18:00', '22:00', 'Now'],
      series: [
        { name: 'Grid Consumption (MW)', data: [280, 340, 490, 560, 520, 440, 390], color: '#ef4444' },
        { name: 'Renewable Baseload (MW)', data: [180, 210, 320, 390, 310, 240, 190], color: '#10b981' },
      ],
    },
  },
  {
    id: 'energy-demand-combo',
    industryId: 'energy',
    title: 'Peak Demand vs Grid Voltage Fluctuation',
    subtitle: 'Chart.js Combo Bar + Line Chart (MW Volume on bars, Voltage kV on line)',
    chartType: 'comboBarLine',
    family: 'combo',
    isDefault: true,
    category: 'comparison',
    description: 'Simultaneous dual-axis comparison of total Megawatts demanded alongside voltage stability.',
    dimensions: ['Substation Zone', 'Demand (MW)', 'Grid Voltage (kV)'],
    tags: ['Combo Chart', 'Dual Axis', 'Voltage Regulation'],
    payload: {
      categories: ['North Grid', 'Metro Central', 'West Industrial', 'East Valley', 'South Harbor'],
      barSeries: { name: 'Active Demand', data: [142, 285, 390, 118, 204], color: '#3b82f6', unit: 'MW' },
      lineSeries: { name: 'Voltage Stability', data: [99.8, 98.4, 97.9, 99.9, 98.8], color: '#f59e0b', unit: '%' },
    },
  },
  {
    id: 'energy-mix-donut',
    industryId: 'energy',
    title: 'Clean Energy Generation Mix',
    subtitle: 'Proportional generation distribution with center total KPI',
    chartType: 'donut',
    family: 'circular',
    isDefault: true,
    category: 'composition',
    description: 'Current power generation breakdown between Solar, Wind, Hydro, Nuclear, and Natural Gas.',
    dimensions: ['Generation Source', 'Share %', 'Output (GWh)'],
    tags: ['Donut Chart', 'Decarbonization', 'Generation Mix'],
    payload: {
      data: [
        { label: 'Solar Photovoltaic', value: 34, color: '#f59e0b' },
        { label: 'Wind Offshore/Onshore', value: 28, color: '#06b6d4' },
        { label: 'Hydroelectric Dam', value: 16, color: '#3b82f6' },
        { label: 'Nuclear Baseload', value: 14, color: '#8b5cf6' },
        { label: 'Natural Gas Peaker', value: 8, color: '#64748b' },
      ],
      total: '100%',
    },
  },
  {
    id: 'energy-freq-stepped',
    industryId: 'energy',
    title: 'Grid Frequency Tolerance (60.00 Hz)',
    subtitle: 'Chart.js Stepped Line showing synchronous frequency governor response',
    chartType: 'steppedLine',
    family: 'line',
    isDefault: true,
    category: 'iot_telemetry',
    description: 'High-frequency stepped governor response maintaining grid equilibrium within standard ±0.05 Hz.',
    dimensions: ['Time Interval', 'Frequency (Hz)'],
    tags: ['Frequency Stability', 'Stepped Line', 'Governor'],
    payload: {
      labels: ['12:00:00', '12:00:10', '12:00:20', '12:00:30', '12:00:40', '12:00:50', '12:01:00'],
      data: [60.01, 59.98, 60.03, 60.0, 59.99, 60.02, 60.0],
      lineColor: '#10b981',
      stepMode: 'middle',
    },
  },
  // "More Charts" for Energy:
  {
    id: 'energy-transformer-floating',
    industryId: 'energy',
    title: 'Step-Up Transformer Temperature Ranges',
    subtitle: 'Chart.js Floating Bars displaying core min/max operating temperatures',
    chartType: 'floatingBar',
    family: 'bar',
    isDefault: false,
    category: 'trends',
    description: 'Thermal interval tracking across primary step-up transformers to prevent insulation breakdown.',
    dimensions: ['Transformer Bank', 'Min Temp (°C)', 'Max Temp (°C)'],
    tags: ['Floating Bars', 'Substation Telemetry', 'Transformer Health'],
    payload: {
      data: [
        { label: 'Bank 01 (500kV)', min: 42, max: 74, color: '#3b82f6' },
        { label: 'Bank 02 (230kV)', min: 38, max: 68, color: '#10b981' },
        { label: 'Bank 03 (Peaker)', min: 48, max: 88, color: '#f59e0b' },
        { label: 'Bank 04 (Aux)', min: 32, max: 55, color: '#8b5cf6' },
      ],
      unit: '°C',
    },
  },
  {
    id: 'energy-loss-waterfall',
    industryId: 'energy',
    title: 'Transmission & Distribution Loss Bridge',
    subtitle: 'Waterfall reconciliation from generation busbar to customer meter',
    chartType: 'waterfall',
    family: 'specialized',
    isDefault: false,
    category: 'pipeline',
    description: 'Reconciliation bridge accounting for high-voltage line resistive losses, transformer core dissipation, and distribution drop.',
    dimensions: ['Grid Stage', 'Energy Amount (MWh)', 'Net Delivered'],
    tags: ['Waterfall', 'Energy Reconciliation', 'Line Losses'],
    payload: {
      data: [
        { label: 'Generated at Busbar', amount: 10000, type: 'BASE' },
        { label: 'HV Line Ohmic Loss', amount: -280, type: 'SUBTRACT' },
        { label: 'Step-Down Core Loss', amount: -140, type: 'SUBTRACT' },
        { label: 'Feeder Phase Imbalance', amount: -80, type: 'SUBTRACT' },
        { label: 'Net Delivered Power', amount: 9500, type: 'TOTAL' },
      ],
    },
  },

  // ==========================================================================
  // 3. SUPPLY CHAIN, FLEET & COLD-CHAIN LOGISTICS
  // ==========================================================================
  {
    id: 'fleet-velocity-combo',
    industryId: 'logistics',
    title: 'Fleet Delivery Volume vs On-Time SLA %',
    subtitle: 'Chart.js Combo Bar + Line Chart (Deliveries on bars, On-Time % on line)',
    chartType: 'comboBarLine',
    family: 'combo',
    isDefault: true,
    category: 'comparison',
    description: 'Daily shipment execution volume compared with on-time delivery percentages across carrier regions.',
    dimensions: ['Region Hub', 'Parcels Delivered', 'On-Time SLA %'],
    tags: ['Combo Bar Line', 'Fleet Logistics', 'SLA Adherence'],
    payload: {
      categories: ['NE Hub', 'Midwest Central', 'SE Logistics', 'Southwest', 'Pacific Coast'],
      barSeries: { name: 'Packages Dispatched', data: [12400, 18900, 15200, 11400, 21500], color: '#2563eb', unit: 'pkgs' },
      lineSeries: { name: 'On-Time Rate', data: [97.2, 95.8, 96.4, 98.1, 94.9], color: '#10b981', unit: '%' },
    },
  },
  {
    id: 'cold-chain-floating',
    industryId: 'logistics',
    title: 'Cold-Chain Refrigeration Bounds (-20°C)',
    subtitle: 'Chart.js Floating Bar showing container temperature safety envelopes',
    chartType: 'floatingBar',
    family: 'bar',
    isDefault: true,
    category: 'trends',
    description: 'Ensuring pharmaceutical and biological shipments stay strictly between -25°C and -15°C across transport corridors.',
    dimensions: ['Reefer Unit', 'Min Temp (°C)', 'Max Temp (°C)'],
    tags: ['Floating Bar', 'Cold-Chain', 'Pharma Logistics'],
    payload: {
      data: [
        { label: 'Reefer-01 (Pharma)', min: -22, max: -17, color: '#06b6d4' },
        { label: 'Reefer-02 (Biologics)', min: -24, max: -19, color: '#3b82f6' },
        { label: 'Reefer-03 (Vaccines)', min: -21, max: -16, color: '#10b981' },
        { label: 'Reefer-04 (Enzymes)', min: -23, max: -18, color: '#8b5cf6' },
      ],
      unit: '°C',
    },
  },
  {
    id: 'logistics-funnel',
    industryId: 'logistics',
    title: 'Fulfillment Pipeline & Milestones',
    subtitle: 'Conversion stage funnel from order receipt to doorstep signature',
    chartType: 'funnel',
    family: 'specialized',
    isDefault: true,
    category: 'pipeline',
    description: 'Five-stage logistics progression tracking order routing, picking, manifest generation, transit, and customer POD.',
    dimensions: ['Logistics Stage', 'Volume Count', 'Throughput %'],
    tags: ['Funnel Chart', 'Fulfillment Velocity', 'Milestones'],
    payload: {
      stages: [
        { label: 'Order Received & Verified', count: 48500, conversionRate: 100 },
        { label: 'Automated Pick & Pack', count: 47200, conversionRate: 97.3 },
        { label: 'Manifested & Carrier Handshake', count: 45800, conversionRate: 94.4 },
        { label: 'Last-Mile Out for Delivery', count: 44600, conversionRate: 91.9 },
        { label: 'Delivered & E-Signed POD', count: 43900, conversionRate: 90.5 },
      ],
    },
  },
  {
    id: 'logistics-scatter',
    industryId: 'logistics',
    title: 'Vehicle Fuel Economy vs Payload Weight',
    subtitle: 'Chart.js Scatter Chart (Payload in tons vs Fuel L/100km)',
    chartType: 'scatter',
    family: 'correlation',
    isDefault: true,
    category: 'comparison',
    description: 'Multi-point XY correlation mapping vehicle payload against observed diesel fuel economy.',
    dimensions: ['Vehicle Class', 'Payload Tons', 'Fuel L/100km'],
    tags: ['Scatter Chart', 'Fuel Efficiency', 'Correlation'],
    payload: {
      points: [
        { x: 5, y: 18, label: 'Sprinter Van (Light)', color: '#10b981' },
        { x: 12, y: 24, label: 'Box Truck 01', color: '#2563eb' },
        { x: 18, y: 31, label: 'Single Axle Hauler', color: '#f59e0b' },
        { x: 26, y: 38, label: 'Semi Trailer A', color: '#8b5cf6' },
        { x: 34, y: 44, label: 'Heavy Double B', color: '#ef4444' },
      ],
    },
  },
  {
    id: 'fleet-engine-stepped',
    industryId: 'logistics',
    title: 'Fleet Engine Duty & Auxiliary APU Cycles',
    subtitle: 'Chart.js Stepped Line tracking active engine state transitions',
    chartType: 'steppedLine',
    family: 'line',
    isDefault: true,
    category: 'iot_telemetry',
    description: 'Orthogonal stepped transitions tracking engine operating states: Idle (0), Eco-Cruise (1), Max Power (2).',
    dimensions: ['Time Interval', 'Engine State'],
    tags: ['Stepped Line', 'Engine Telemetry', 'Fleet Ops'],
    payload: {
      labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', 'Now'],
      data: [0, 1, 2, 2, 1, 0, 1],
      lineColor: '#2563eb',
      stepMode: 'before',
    },
  },
  {
    id: 'port-dwell-bar',
    industryId: 'logistics',
    title: 'Terminal Container Dwell Time by Hub',
    subtitle: 'Horizontal Bar showing average dwell hours before dispatch',
    chartType: 'bar',
    family: 'bar',
    isDefault: true,
    category: 'comparison',
    description: 'Container turnaround velocity across international logistics maritime ports.',
    dimensions: ['Terminal Hub', 'Avg Dwell Hours'],
    tags: ['Bar Chart', 'Port Logistics', 'Dwell Time'],
    payload: {
      data: [
        { label: 'Long Beach Terminal', value: 38 },
        { label: 'Rotterdam Gateway', value: 26 },
        { label: 'Singapore Port', value: 18 },
        { label: 'Hamburg Terminal', value: 31 },
        { label: 'Newark Marine Hub', value: 42 },
      ],
    },
  },

  // ==========================================================================
  // 4. SMART MANUFACTURING & INDUSTRIAL IOT (IIoT)
  // ==========================================================================
  {
    id: 'mfg-oee-combo',
    industryId: 'manufacturing',
    title: 'Overall Equipment Effectiveness (OEE) by Cell',
    subtitle: 'Chart.js Combo Bar + Line Chart (Units Produced vs OEE Score %)',
    chartType: 'comboBarLine',
    family: 'combo',
    isDefault: true,
    category: 'comparison',
    description: 'Evaluates manufacturing cell performance: Availability × Performance × Quality.',
    dimensions: ['Robotic Workcell', 'Units Produced', 'OEE Index %'],
    tags: ['OEE', 'Manufacturing', 'Combo Chart'],
    payload: {
      categories: ['Cell 1 (Stamping)', 'Cell 2 (Welding)', 'Cell 3 (Paint)', 'Cell 4 (Assembly)', 'Cell 5 (QC)'],
      barSeries: { name: 'Units Output', data: [1850, 1720, 1680, 1590, 1580], color: '#3b82f6', unit: 'pcs' },
      lineSeries: { name: 'OEE Index', data: [91.2, 88.5, 86.4, 89.1, 94.2], color: '#f59e0b', unit: '%' },
    },
  },
  {
    id: 'mfg-vibration-scatter',
    industryId: 'manufacturing',
    title: 'Robotic Spindle Vibration vs RPM Harmonic',
    subtitle: 'Chart.js 2D Scatter showing bearing anomaly threshold envelope',
    chartType: 'scatter',
    family: 'correlation',
    isDefault: true,
    category: 'iot_telemetry',
    description: 'Identifies early bearing breakdown by plotting spindle RPM against high-frequency accelerometer vibrations.',
    dimensions: ['Spindle ID', 'RPM (x100)', 'Vibration Peak (mm/s)'],
    tags: ['Predictive Maintenance', 'Vibration Telemetry', 'Scatter'],
    payload: {
      points: [
        { x: 12, y: 1.2, label: 'Spindle A1 (Normal)', color: '#10b981' },
        { x: 18, y: 1.4, label: 'Spindle A2 (Normal)', color: '#10b981' },
        { x: 24, y: 1.8, label: 'Spindle B1 (Nominal)', color: '#2563eb' },
        { x: 30, y: 2.2, label: 'Spindle B2 (Moderate)', color: '#f59e0b' },
        { x: 36, y: 4.8, label: 'Spindle C1 (Warning Anomaly)', color: '#ef4444' },
      ],
    },
  },
  {
    id: 'mfg-pareto-column',
    industryId: 'manufacturing',
    title: 'Defect Category Pareto Distribution',
    subtitle: 'Grouped column highlighting primary root cause contributors',
    chartType: 'column',
    family: 'bar',
    isDefault: true,
    category: 'comparison',
    description: 'Pareto principle 80/20 root cause analysis across automated vision inspection stations.',
    dimensions: ['Defect Type', 'Occurrences', 'Impact Minor'],
    tags: ['Pareto Analysis', 'Six Sigma', 'Column Chart'],
    payload: {
      categories: ['Misalignment', 'Surface Scratches', 'Dimension Delta', 'Weld Porosity', 'Solder Bridge'],
      series: [
        { name: 'Defect Count', data: [142, 98, 64, 32, 18], color: '#ef4444' },
      ],
    },
  },
  {
    id: 'mfg-gauge-health',
    industryId: 'manufacturing',
    title: 'Plant Operational Safety & Uptime SLA',
    subtitle: 'Dial speedometer tracking 99.9% uptime compliance',
    chartType: 'gauge',
    family: 'specialized',
    isDefault: true,
    category: 'iot_telemetry',
    description: 'Composite manufacturing uptime gauge reflecting scheduled maintenance adherence and zero safety incidents.',
    dimensions: ['Safety Incidents', 'Uptime %'],
    tags: ['Gauge', 'Plant Uptime', 'Speedometer'],
    payload: {
      value: 99.6,
      min: 0,
      max: 100,
      label: 'World Class Operations',
    },
  },
  {
    id: 'mfg-thermal-floating',
    industryId: 'manufacturing',
    title: 'Stator Winding Thermal Operating Windows',
    subtitle: 'Chart.js Floating Bar showing motor temperature tolerances',
    chartType: 'floatingBar',
    family: 'bar',
    isDefault: true,
    category: 'iot_telemetry',
    description: 'Operating temperature boundaries across CNC machine stator windings and spindles.',
    dimensions: ['Machine Component', 'Min Operating Temp', 'Max Tolerable Temp'],
    tags: ['Floating Bar', 'Thermal Telemetry', 'IIoT'],
    payload: {
      data: [
        { label: 'Stator Motor A', min: 45, max: 82, color: '#10b981' },
        { label: 'Stator Motor B', min: 52, max: 94, color: '#f59e0b' },
        { label: 'Extruder Head 1', min: 140, max: 185, color: '#ef4444' },
        { label: 'Coolant Chiller', min: 12, max: 24, color: '#06b6d4' },
      ],
      unit: '°C',
    },
  },
  {
    id: 'mfg-sensor-radar',
    industryId: 'manufacturing',
    title: 'Robotic Arm Precision & Kinematic Repeatability',
    subtitle: 'Radar Chart benchmarking 6-axis kinematics and accuracy',
    chartType: 'radar',
    family: 'radar',
    isDefault: true,
    category: 'comparison',
    description: 'Robotic arm dynamic profiling evaluating axis backlash, payload margin, and thermal stability.',
    dimensions: ['Kinematic Axis', 'Target SLA', 'Observed Performance'],
    tags: ['Radar Chart', 'Robotics', 'Kinematics'],
    payload: {
      categories: ['Payload Margin', 'Repeatability', 'Thermal Stability', 'Speed Profile', 'Axis Backlash', 'Power Efficiency'],
      series: [
        { name: 'KUKA Titan Arm', values: [94, 98, 88, 92, 95, 89], color: '#3b82f6' },
        { name: 'ABB IRB 6700', values: [88, 95, 92, 89, 91, 94], color: '#10b981' },
      ],
    },
  },

  // ==========================================================================
  // 5. HEALTHCARE, CLINICAL & LIFE SCIENCES
  // ==========================================================================
  {
    id: 'health-vitals-multi',
    industryId: 'healthcare',
    title: 'ICU Patient Vitals Real-Time Telemetry',
    subtitle: 'Chart.js Multi-Axis Line Chart (Heart Rate BPM vs SpO2 % vs Mean Arterial Pressure)',
    chartType: 'multiAxisLine',
    family: 'line',
    isDefault: true,
    category: 'iot_telemetry',
    description: 'Simultaneous clinical telemetry plotting continuous pulse oximetry (SpO2), heart rate, and blood pressure.',
    dimensions: ['Time Interval', 'Heart Rate (BPM)', 'SpO2 (%)', 'Mean Arterial Pressure (mmHg)'],
    tags: ['Healthcare', 'Vitals Telemetry', 'Multi-Axis Line'],
    payload: {
      categories: ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', 'Now'],
      series: [
        { name: 'Heart Rate', data: [72, 75, 78, 82, 79, 74, 73], color: '#ef4444', unit: 'BPM' },
        { name: 'Oxygen Saturation (SpO2)', data: [98, 98, 97, 99, 98, 98, 99], color: '#06b6d4', unit: '%' },
        { name: 'Mean Arterial Pressure', data: [88, 90, 92, 94, 91, 89, 88], color: '#8b5cf6', unit: 'mmHg' },
      ],
    },
  },
  {
    id: 'health-bed-stacked',
    industryId: 'healthcare',
    title: 'Hospital Bed Occupancy by Care Unit',
    subtitle: 'Stacked column comparing ICU, Step-Down, General & Post-Op wards',
    chartType: 'stackedColumn',
    family: 'bar',
    isDefault: true,
    category: 'comparison',
    description: 'Tracks capacity pressures across specialty clinical units to forecast bed surges and staffing ratios.',
    dimensions: ['Clinical Department', 'Occupied Beds', 'Available Beds'],
    tags: ['Stacked Column', 'Bed Management', 'Hospital Ops'],
    payload: {
      categories: ['Cardiology ICU', 'Neuro Trauma', 'Pediatric Wing', 'Oncology Ward', 'General Surgery'],
      series: [
        { name: 'Occupied Beds', data: [42, 38, 55, 48, 62], color: '#ef4444' },
        { name: 'Available Beds', data: [8, 12, 15, 10, 18], color: '#10b981' },
      ],
    },
  },
  {
    id: 'health-sla-gauge',
    industryId: 'healthcare',
    title: 'Emergency Triage & Door-to-Doctor SLA',
    subtitle: 'Compliance dial monitoring urgent care turnaround under 20 minutes',
    chartType: 'gauge',
    family: 'specialized',
    isDefault: true,
    category: 'pipeline',
    description: 'Measures patient journey velocity from emergency room check-in to clinical doctor consultation.',
    dimensions: ['Triage Level', 'Average Wait Minutes'],
    tags: ['Gauge', 'Clinical SLA', 'Emergency Care'],
    payload: {
      value: 98.4,
      min: 0,
      max: 100,
      label: 'Rapid Response Cleared',
    },
  },
  {
    id: 'health-dept-donut',
    industryId: 'healthcare',
    title: 'Clinical Encounters by Specialty',
    subtitle: 'Proportional distribution with center active patient volume',
    chartType: 'donut',
    family: 'circular',
    isDefault: true,
    category: 'composition',
    description: 'Categorical distribution of patient visits across inpatient specialty departments.',
    dimensions: ['Specialty Service', 'Encounter Count'],
    tags: ['Donut Chart', 'Patient Encounters', 'Specialty'],
    payload: {
      data: [
        { label: 'Cardiovascular Care', value: 32, color: '#ef4444' },
        { label: 'Orthopedic Surgery', value: 24, color: '#3b82f6' },
        { label: 'Neurology Center', value: 18, color: '#8b5cf6' },
        { label: 'Pulmonology', value: 16, color: '#06b6d4' },
        { label: 'Internal Medicine', value: 10, color: '#10b981' },
      ],
      total: '100%',
    },
  },
  {
    id: 'health-cleanroom-stepped',
    industryId: 'healthcare',
    title: 'Cleanroom ISO-5 HVAC Particle Filtration Status',
    subtitle: 'Chart.js Stepped Line monitoring air handler discrete stages',
    chartType: 'steppedLine',
    family: 'line',
    isDefault: true,
    category: 'iot_telemetry',
    description: 'Orthogonal air handler transitions tracking HEPA pressure stages: Low (1), Target Positive (2), Sterilization Boost (3).',
    dimensions: ['Time Interval', 'Filtration Stage'],
    tags: ['Stepped Line', 'Cleanroom', 'Clinical Safety'],
    payload: {
      labels: ['06:00', '09:00', '12:00', '15:00', '18:00', '21:00', 'Now'],
      data: [1, 1, 2, 2, 3, 2, 1],
      lineColor: '#06b6d4',
      stepMode: 'after',
    },
  },
  {
    id: 'health-patient-polar',
    industryId: 'healthcare',
    title: 'ICU Patient Acuity Distribution by Ward',
    subtitle: 'Polar Area Chart mapping clinical triage severity levels',
    chartType: 'polarArea',
    family: 'circular',
    isDefault: true,
    category: 'composition',
    description: 'Polar area diagram illustrating emergency triage severity distribution across inpatient wards.',
    dimensions: ['Acuity Tier', 'Patient Count'],
    tags: ['Polar Area', 'Clinical Triage', 'Healthcare'],
    payload: {
      data: [
        { label: 'Level 1 (Resuscitation)', value: 14, color: '#ef4444' },
        { label: 'Level 2 (Emergent)', value: 28, color: '#f97316' },
        { label: 'Level 3 (Urgent)', value: 45, color: '#f59e0b' },
        { label: 'Level 4 (Less Urgent)', value: 32, color: '#3b82f6' },
        { label: 'Level 5 (Non-Urgent)', value: 18, color: '#10b981' },
      ],
    },
  },

  // ==========================================================================
  // 6. FINOPS, B2B BILLING & TREASURY
  // ==========================================================================
  {
    id: 'finops-cashflow-spline',
    industryId: 'finops',
    title: 'Enterprise Operating Cashflow Velocity',
    subtitle: 'Smooth spline line comparing cash inflows vs operational disbursements',
    chartType: 'line',
    family: 'line',
    isDefault: true,
    category: 'trends',
    description: 'Tracks daily corporate cash velocity across AR collections, vendor AP settlements, and payroll runs.',
    dimensions: ['Fiscal Period', 'Cash Velocity ($M)'],
    tags: ['Cashflow', 'Spline Line', 'FinOps'],
    payload: {
      labels: ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4', 'Wk 5', 'Wk 6', 'Current'],
      data: [12.4, 14.8, 13.9, 16.2, 17.5, 18.9, 21.4],
      lineColor: '#10b981',
      fillGradient: true,
    },
  },
  {
    id: 'finops-ap-burndown',
    industryId: 'finops',
    title: '3-Way Match AP Burndown & Invoiced Spend',
    subtitle: 'Gradient area showing PO matching vs autonomous supplier disbursements',
    chartType: 'area',
    family: 'area',
    isDefault: true,
    category: 'pipeline',
    description: 'Cumulative burndown of AP supplier invoices through optical character recognition, PO 3-way match, and automated payment.',
    dimensions: ['Invoice Batch', 'Total Invoiced ($k)', 'Reconciled ($k)'],
    tags: ['Accounts Payable', '3-Way Match', 'Area Chart'],
    payload: {
      categories: ['Batch A', 'Batch B', 'Batch C', 'Batch D', 'Batch E', 'Batch F'],
      series: [
        { name: 'Invoiced Spend ($k)', data: [450, 680, 820, 1150, 1420, 1890], color: '#3b82f6' },
        { name: '3-Way Cleared ($k)', data: [420, 650, 780, 1100, 1380, 1840], color: '#10b981' },
      ],
    },
  },
  {
    id: 'finops-variance-waterfall',
    industryId: 'finops',
    title: 'EBITDA Contribution & Financial Margin Bridge',
    subtitle: 'Waterfall reconciliation from gross contract ceiling to net contributed margin',
    chartType: 'waterfall',
    family: 'specialized',
    isDefault: true,
    category: 'pipeline',
    description: 'Financial variance waterfall explaining the path from contracted gross revenue to net realized operating margin.',
    dimensions: ['Financial Stage', 'Impact ($ USD)', 'Net Total'],
    tags: ['Waterfall', 'Margin Realization', 'EBITDA'],
    payload: {
      data: [
        { label: 'Gross Revenue Ceiling', amount: 4800000, type: 'BASE' },
        { label: 'Vendor COGS & Suppliers', amount: -1450000, type: 'SUBTRACT' },
        { label: 'Direct Engineering WIP', amount: -1120000, type: 'SUBTRACT' },
        { label: 'Multi-Currency FX Drift', amount: -65000, type: 'SUBTRACT' },
        { label: 'Autonomous AP Clawbacks', amount: 85000, type: 'ADD' },
        { label: 'Net Contributed Margin', amount: 2250000, type: 'TOTAL' },
      ],
    },
  },
  {
    id: 'finops-dso-histogram',
    industryId: 'finops',
    title: 'Days Sales Outstanding (DSO) Distribution',
    subtitle: 'Histogram frequency of customer invoice payment turnaround in days',
    chartType: 'histogram',
    family: 'specialized',
    isDefault: true,
    category: 'statistical',
    description: 'Distribution analysis of payment collection cycles identifying invoice drag across client tiers.',
    dimensions: ['Payment Age (Days)', 'Invoice Count'],
    tags: ['Histogram', 'DSO', 'Working Capital'],
    payload: {
      bins: [
        { range: '1-15 Days', count: 184 },
        { range: '16-30 Days', count: 412 },
        { range: '31-45 Days', count: 289 },
        { range: '46-60 Days', count: 96 },
        { range: '61-90 Days', count: 38 },
        { range: '90+ Days', count: 12 },
      ],
    },
  },
  {
    id: 'finops-multitenant-stacked',
    industryId: 'finops',
    title: 'Multi-Tenant Cloud Compute Spend by Layer',
    subtitle: 'Stacked Bar comparing Bare Metal GPU, DB IOPS & Egress',
    chartType: 'stackedBar',
    family: 'bar',
    isDefault: true,
    category: 'comparison',
    description: 'Breakdown of cloud infrastructure consumption across isolated enterprise tenant environments.',
    dimensions: ['Sovereign Tenant', 'Compute USD', 'Database USD', 'Network USD'],
    tags: ['Stacked Bar', 'Multi-Tenant', 'Cloud FinOps'],
    payload: {
      categories: ['giga-internal', 'nova-fintech', 'defense-prime', 'summit-logistics', 'apex-telemetry'],
      series: [
        { name: 'Bare Metal GPU', data: [4200, 3100, 5800, 2400, 1900], color: '#6366f1' },
        { name: 'PostgreSQL 16 IOPS', data: [1800, 1400, 2200, 950, 800], color: '#3b82f6' },
        { name: 'Egress Bandwidth', data: [650, 420, 890, 310, 260], color: '#10b981' },
      ],
    },
  },
  {
    id: 'finops-cloud-spend-radar',
    industryId: 'finops',
    title: 'Cloud Architecture Well-Architected Assessment',
    subtitle: 'Radar Chart benchmarking cost, reliability, security & performance',
    chartType: 'radar',
    family: 'radar',
    isDefault: true,
    category: 'comparison',
    description: 'Multi-dimensional evaluation against AWS/GCP Well-Architected Framework pillars.',
    dimensions: ['Pillar', 'Score Index'],
    tags: ['Radar Chart', 'Well-Architected', 'FinOps'],
    payload: {
      categories: ['Cost Optimization', 'Security Posture', 'Reliability', 'Performance', 'Operational Excellence', 'Sustainability'],
      series: [
        { name: 'Production Infrastructure', values: [88, 96, 94, 91, 95, 87], color: '#10b981' },
      ],
    },
  },
];
