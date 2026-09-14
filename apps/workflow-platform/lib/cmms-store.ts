import { randomUUID } from 'node:crypto';
import type {
  CmmsAsset,
  CmmsWorkOrder,
  CmmsMeter,
  CmmsPart,
  CmmsPmSchedule,
  CmmsMetrics,
  CmmsInventoryMetrics,
  CmmsReliabilityMetrics,
  CmmsTask,
  CmmsLabor,
  CmmsPartUsage,
  CmmsCost,
  CmmsComment,
} from './cmms-api';

class CmmsStore {
  private assets: CmmsAsset[] = [
    {
      id: 'asset-site-01',
      name: 'Nevada Lithium Beneficiation Facility',
      description: 'Primary refining plant and hydrometallurgical processing plant',
      categoryId: 'cat-facility',
      formSchemaId: null,
      specs: { totalAcreage: 140, gridConnectionMva: 25, waterPermitGpm: 1200 },
      status: 'OPERATIONAL',
      assetTag: 'TAG-SITE-NV-01',
      serialNumber: 'FAC-2022-001',
      model: 'Class 1 Heavy Industrial',
      manufacturer: 'Bechtel Engineering',
      power: '69kV High Voltage Substation',
      area: 'North Mining Basin',
      acquisitionCost: 14500000,
      currencyCode: 'USD',
      locationId: null,
      parentAssetId: null,
      hierarchyLevel: 'SITE',
      healthScore: 92,
      mtbfHours: 4800,
      mttrHours: 6.2,
      ravCost: 18000000,
      assignedTo: 'Plant Operations Director',
      assignedTeams: ['team-plant-ops'],
      warrantyExpiry: '2035-12-31',
      purchaseDate: '2022-03-01',
      criticality: 'CRITICAL',
      iotDeviceId: 'SCADA-SITE-GATEWAY-01',
      scadaEndpoint: 'facility/nv-01/power-factor',
      version: 1,
      createdBy: 'sys-admin',
      createdAt: '2026-01-10T08:00:00Z',
      updatedAt: '2026-09-07T12:00:00Z',
    },
    {
      id: 'asset-line-01',
      name: 'Line 1: Wet Grinding & Slurry Beneficiation',
      description: 'Continuous feed circuit including SAG mill, cyclopac classification and pumps',
      categoryId: 'cat-circuit',
      formSchemaId: null,
      specs: { designThroughputTph: 250, targetSlurryDensity: 1.45, circuitStatus: 'ACTIVE' },
      status: 'OPERATIONAL',
      assetTag: 'TAG-LINE-01',
      serialNumber: 'CKT-GRND-01',
      model: 'Continuous Heavy Ore Processing',
      manufacturer: 'Metso Outotec',
      power: '4160V Distribution',
      area: 'Mill Building - Floor 1',
      acquisitionCost: 4200000,
      currencyCode: 'USD',
      locationId: 'loc-mill-bay-2',
      parentAssetId: 'asset-site-01',
      hierarchyLevel: 'LINE',
      healthScore: 84,
      mtbfHours: 920,
      mttrHours: 3.8,
      ravCost: 5100000,
      assignedTo: 'Circuit Operations Superintendent',
      assignedTeams: ['team-grinding-ops'],
      warrantyExpiry: '2030-01-01',
      purchaseDate: '2023-02-15',
      criticality: 'CRITICAL',
      iotDeviceId: 'SCADA-LINE-1-PLC',
      scadaEndpoint: 'factory/line-1/throughput',
      version: 1,
      createdBy: 'sys-admin',
      createdAt: '2026-01-10T08:00:00Z',
      updatedAt: '2026-09-07T12:00:00Z',
    },
    {
      id: 'asset-slurry-01',
      name: 'Primary Centrifugal Slurry Pump #1 (Warman 6x4)',
      description: 'Heavy abrasive slurry transport pump with mechanical seal and vibration sensors',
      categoryId: 'cat-mechanical',
      formSchemaId: null,
      specs: { rpm: 1750, flowRateGpm: 450, motorKw: 75, impellerDiamMm: 375 },
      status: 'UNDER_MAINTENANCE',
      assetTag: 'TAG-PUMP-001',
      serialNumber: 'SN-GRND-88219',
      model: 'Warman 6x4 D-AH',
      manufacturer: 'Weir Minerals',
      power: '480V 3-Phase 60Hz',
      area: 'Mill Bay 2 - Grinding Circuit',
      acquisitionCost: 48500,
      currencyCode: 'USD',
      locationId: 'loc-mill-bay-2',
      parentAssetId: 'asset-line-01',
      hierarchyLevel: 'MACHINE',
      healthScore: 68,
      mtbfHours: 420,
      mttrHours: 2.8,
      ravCost: 65000,
      assignedTo: 'Marcus Vance (Lead Millwright)',
      assignedTeams: ['team-mechanical'],
      warrantyExpiry: '2028-06-30',
      purchaseDate: '2024-01-15',
      criticality: 'CRITICAL',
      iotDeviceId: 'SCADA-PUMP-01-TELEMETRY',
      scadaEndpoint: 'factory/line-1/pump-a/vibration',
      bomParts: [
        { partId: 'part-bearing-6314', partNumber: 'BRG-SKF-6314-C3', name: 'Deep Groove Ball Bearing 70x150x35mm', requiredQty: 2, onHand: 4 },
        { partId: 'part-seal-mech', partNumber: 'SEAL-SLURRY-4IN', name: 'Tungsten Carbide Slurry Mechanical Seal 4"', requiredQty: 1, onHand: 2 },
        { partId: 'part-hyd-filter', partNumber: 'FLTR-HYD-10MIC', name: 'Hydraulic Filter Element 10 Micron', requiredQty: 1, onHand: 14 },
      ],
      downtimeHistory: [
        { id: 'dt-01', startedAt: '2026-09-07T14:28:00Z', endedAt: '2026-09-07T17:15:00Z', durationHours: 2.78, reason: 'Vibration surge in drive bearing', category: 'MECHANICAL' },
        { id: 'dt-02', startedAt: '2026-07-12T04:10:00Z', endedAt: '2026-07-12T06:30:00Z', durationHours: 2.33, reason: 'Mechanical seal flush flow loss', category: 'HYDRAULIC' },
      ],
      documents: [
        { name: 'Warman_6x4_OEM_Manual.pdf', type: 'MANUAL', url: '/docs/pumps/warman-6x4.pdf', size: '14.2 MB' },
        { name: 'P&ID_Grinding_Circuit_Rev4.dwg', type: 'P&ID', url: '/docs/schematics/grind-rev4.dwg', size: '8.7 MB' },
      ],
      version: 2,
      createdBy: 'sys-admin',
      createdAt: '2026-01-10T08:00:00Z',
      updatedAt: '2026-09-07T14:30:00Z',
    },
    {
      id: 'asset-motor-01',
      name: 'Siemens 75kW Severe-Duty Electric Motor',
      description: 'Cast iron TEFC inverter-duty electric induction drive motor',
      categoryId: 'cat-electrical',
      formSchemaId: null,
      specs: { powerKw: 75, frameSize: '280M', insulationClass: 'H', efficiencyClass: 'IE4' },
      status: 'OPERATIONAL',
      assetTag: 'TAG-MTR-75KW-01',
      serialNumber: 'SN-SIE-992014',
      model: 'SIMOTICS SD 1LE5',
      manufacturer: 'Siemens AG',
      power: '480V 112A 60Hz',
      area: 'Mill Bay 2 - Grinding Circuit',
      acquisitionCost: 16800,
      currencyCode: 'USD',
      locationId: 'loc-mill-bay-2',
      parentAssetId: 'asset-slurry-01',
      hierarchyLevel: 'ASSEMBLY',
      healthScore: 91,
      mtbfHours: 2100,
      mttrHours: 1.5,
      ravCost: 22000,
      assignedTo: 'Lead Electrician',
      assignedTeams: ['team-electrical'],
      warrantyExpiry: '2029-12-31',
      purchaseDate: '2024-01-15',
      criticality: 'HIGH',
      iotDeviceId: 'SCADA-MTR-01-TEMP',
      scadaEndpoint: 'factory/line-1/pump-a/motor-temp',
      version: 1,
      createdBy: 'sys-admin',
      createdAt: '2026-01-10T08:00:00Z',
      updatedAt: '2026-09-07T12:00:00Z',
    },
    {
      id: 'asset-press-02',
      name: 'Hydraulic Stamping Press 500T',
      description: 'Automated stamping press with proportional valves and thermal monitoring',
      categoryId: 'cat-hydraulic',
      formSchemaId: null,
      specs: { tonnage: 500, strokeMm: 400, hydraulicPressureBar: 280 },
      status: 'OPERATIONAL',
      assetTag: 'TAG-PRESS-500',
      serialNumber: 'SN-SCHUL-4401',
      model: 'Schuler ServoPresse 500',
      manufacturer: 'Schuler Group',
      power: '400V 50Hz',
      area: 'Press Line 3 - Stamping Facility',
      acquisitionCost: 320000,
      currencyCode: 'USD',
      locationId: 'loc-press-bay',
      parentAssetId: 'asset-site-01',
      hierarchyLevel: 'MACHINE',
      healthScore: 94,
      mtbfHours: 1450,
      mttrHours: 4.5,
      ravCost: 450000,
      assignedTo: 'Hydraulics Specialist',
      assignedTeams: ['team-press-maintenance'],
      warrantyExpiry: '2027-12-31',
      purchaseDate: '2023-05-20',
      criticality: 'HIGH',
      iotDeviceId: 'SCADA-PRESS-03-TEMP',
      scadaEndpoint: 'factory/line-1/press/temp',
      bomParts: [
        { partId: 'part-hyd-filter', partNumber: 'FLTR-HYD-10MIC', name: 'High Pressure Hydraulic Filter Element 10 Micron', requiredQty: 2, onHand: 14 },
      ],
      version: 1,
      createdBy: 'sys-admin',
      createdAt: '2026-01-10T08:00:00Z',
      updatedAt: '2026-09-07T12:00:00Z',
    },
    {
      id: 'asset-chiller-03',
      name: 'Process Water Chiller Unit #2',
      description: 'Screw compressor industrial refrigeration loop for furnace cooling',
      categoryId: 'cat-hvac',
      formSchemaId: null,
      specs: { coolingTons: 120, refrigerant: 'R134a', condenserWaterGpm: 360 },
      status: 'OPERATIONAL',
      assetTag: 'TAG-CHILLER-02',
      serialNumber: 'SN-TRANE-9012',
      model: 'Series R RTAC',
      manufacturer: 'Trane Technologies',
      power: '460V 60Hz',
      area: 'Utility Building - Rooftop Chiller Bank',
      acquisitionCost: 78000,
      currencyCode: 'USD',
      locationId: 'loc-utility-roof',
      parentAssetId: 'asset-site-01',
      hierarchyLevel: 'MACHINE',
      healthScore: 86,
      mtbfHours: 2100,
      mttrHours: 2.8,
      ravCost: 95000,
      assignedTo: 'HVAC Controls Engineer',
      assignedTeams: ['team-facilities'],
      warrantyExpiry: '2029-03-15',
      purchaseDate: '2024-04-10',
      criticality: 'MEDIUM',
      iotDeviceId: 'SCADA-HVAC-CHILLER-02',
      scadaEndpoint: 'hvac/central/operating-hours',
      version: 1,
      createdBy: 'sys-admin',
      createdAt: '2026-01-10T08:00:00Z',
      updatedAt: '2026-09-07T12:00:00Z',
    },
  ];

  private workOrders: CmmsWorkOrder[] = [
    {
      id: 'wo-001',
      woNumber: 'WO-20260907-0042',
      type: 'EMERGENCY',
      priority: 'EMERGENCY',
      status: 'IN_PROGRESS',
      title: 'Slurry Pump #1 High Vibration Emergency Trip',
      description: 'SCADA sensor detected 6.8 mm/s vibration surge exceeding 4.5 mm/s threshold. Bearing inspection, LOTO, and laser alignment required.',
      assetId: 'asset-slurry-01',
      locationId: 'loc-mill-bay-2',
      categoryId: 'cat-mechanical',
      assignedTo: 'Marcus Vance (Lead Millwright)',
      dueDate: '2026-09-07T18:00:00Z',
      startedAt: '2026-09-07T14:30:00Z',
      completedAt: null,
      requiredSignature: true,
      signatureData: null,
      feedback: null,
      triggerSource: 'RULE_ENGINE',
      estimatedDuration: 3.5,
      auditReceipt: 'sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
      version: 2,
      createdBy: 'universal-rule-pro',
      createdAt: '2026-09-07T14:28:10Z',
      updatedAt: '2026-09-07T14:30:00Z',
      tasks: [
        { id: 'task-1', label: 'Verify electrical Lock-Out Tag-Out (LOTO) breaker isolation', taskType: 'PASS_FAIL', status: 'PASSED', notes: 'Padlock #442 applied to MCC Cubicle 14B' },
        { id: 'task-2', label: 'Measure drive-end bearing axial end-play', taskType: 'NUMERIC', status: 'PASSED', value: 0.11, minValue: 0.08, maxValue: 0.15, unit: 'mm', notes: 'Dial indicator reading confirmed within tolerance' },
        { id: 'task-3', label: 'Inspect mechanical seal barrier fluid loop pressure', taskType: 'NUMERIC', status: 'PASSED', value: 2.9, minValue: 2.5, maxValue: 3.5, unit: 'bar' },
        { id: 'task-4', label: 'Check coupling insert condition & bolt torques to 95 Nm', taskType: 'CHECKLIST', status: 'DONE', notes: 'Elastomer insert replaced with new' },
        { id: 'task-5', label: 'Record post-repair vibration baseline at operating speed', taskType: 'NUMERIC', status: 'PENDING', minValue: 0.0, maxValue: 2.5, unit: 'mm/s' },
      ],
      labors: [
        { id: 'l-01', technicianName: 'Marcus Vance', role: 'Lead Millwright', hours: 2.5, ratePerHour: 85.0, timeCategory: 'REGULAR', loggedAt: '2026-09-07T15:00:00Z' },
        { id: 'l-02', technicianName: 'Carlos Mendez', role: 'Apprentice Millwright', hours: 2.0, ratePerHour: 55.0, timeCategory: 'REGULAR', loggedAt: '2026-09-07T15:00:00Z' },
      ],
      partsUsed: [
        { id: 'pu-01', partId: 'part-bearing-6314', partNumber: 'BRG-SKF-6314-C3', partName: 'Deep Groove Ball Bearing 70x150x35mm', quantity: 2, unitCost: 145.5, binLocation: 'Warehouse 1 - Aisle 4 - Shelf B2' },
        { id: 'pu-02', partId: 'part-seal-mech', partNumber: 'SEAL-SLURRY-4IN', partName: 'Tungsten Carbide Slurry Mechanical Seal 4"', quantity: 1, unitCost: 890.0, binLocation: 'Warehouse 1 - Aisle 4 - Shelf C1' },
      ],
      additionalCosts: [
        { id: 'cost-01', description: 'Laser Alignment Tool Calibration & Rental', amount: 175.0, costCategory: 'TOOL_RENTAL' },
      ],
      comments: [
        { id: 'c-01', authorName: 'SCADA Fault Gateway', authorRole: 'Automated Bot', text: 'Auto-dispatched via Rule Engine: vibration 6.8 mm/s exceeded critical ceiling 4.5 mm/s.', timestamp: '2026-09-07T14:28:11Z' },
        { id: 'c-02', authorName: 'Marcus Vance', authorRole: 'Lead Millwright', text: 'Coupling showed heavy angular misalignment from settling. Corrected shims on drive motor feet.', timestamp: '2026-09-07T15:45:22Z' },
      ],
    },
    {
      id: 'wo-002',
      woNumber: 'WO-20260906-0018',
      type: 'PREVENTIVE',
      priority: 'MEDIUM',
      status: 'OPEN',
      title: 'Monthly Press Hydraulic Fluid Analysis & Filter Swap',
      description: 'Extract fluid sample for ISO 4406 particulate count. Replace 10-micron pressure line filter cartridge.',
      assetId: 'asset-press-02',
      locationId: 'loc-press-bay',
      categoryId: 'cat-hydraulic',
      assignedTo: 'Elena Rostova (Lube Specialist)',
      dueDate: '2026-09-10T17:00:00Z',
      startedAt: null,
      completedAt: null,
      requiredSignature: false,
      signatureData: null,
      feedback: null,
      triggerSource: 'PM_SCHEDULE',
      estimatedDuration: 2.0,
      auditReceipt: null,
      version: 1,
      createdBy: 'pm-scheduler',
      createdAt: '2026-09-06T08:00:00Z',
      updatedAt: '2026-09-06T08:00:00Z',
      tasks: [
        { id: 'task-p1', label: 'Take 250ml fluid bottle from pilot pump test port', taskType: 'CHECKLIST', status: 'PENDING' },
        { id: 'task-p2', label: 'Check differential pressure indicator across main filter', taskType: 'NUMERIC', status: 'PENDING', minValue: 0.5, maxValue: 2.2, unit: 'bar' },
        { id: 'task-p3', label: 'Install new 10-micron microglass element and prime', taskType: 'CHECKLIST', status: 'PENDING' },
      ],
      labors: [],
      partsUsed: [],
      additionalCosts: [],
      comments: [],
    },
    {
      id: 'wo-003',
      woNumber: 'WO-20260905-0011',
      type: 'INSPECTION',
      priority: 'LOW',
      status: 'COMPLETED',
      title: 'Quarterly Electrical Arc Flash Inspection - Substation B',
      description: 'Thermal infrared imaging scan of 480V distribution breakers under full load conditions.',
      assetId: null,
      locationId: 'loc-substation-b',
      categoryId: 'cat-electrical',
      assignedTo: 'David Kim (Electrical Tech)',
      dueDate: '2026-09-05T16:00:00Z',
      startedAt: '2026-09-05T09:00:00Z',
      completedAt: '2026-09-05T12:45:00Z',
      requiredSignature: true,
      signatureData: 'svg:data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      feedback: 'All breaker contacts within 4°C differential. Certified compliant.',
      triggerSource: 'MANUAL',
      estimatedDuration: 4.0,
      auditReceipt: 'sha256:d4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35',
      version: 3,
      createdBy: 'david.kim@gigalibs.io',
      createdAt: '2026-09-05T08:30:00Z',
      updatedAt: '2026-09-05T12:45:00Z',
      tasks: [
        { id: 't-comp-1', label: 'Infrared thermography scan on Main Switchgear 480V', taskType: 'NUMERIC', status: 'PASSED', value: 38.4, minValue: 20.0, maxValue: 55.0, unit: '°C' },
        { id: 't-comp-2', label: 'Torque check feeder busbar bolts', taskType: 'CHECKLIST', status: 'DONE' },
      ],
      labors: [
        { id: 'l-03', technicianName: 'David Kim', role: 'Certified Thermographer', hours: 3.75, ratePerHour: 95.0, timeCategory: 'REGULAR', loggedAt: '2026-09-05T12:45:00Z' },
      ],
      partsUsed: [],
      additionalCosts: [],
      comments: [
        { id: 'c-03', authorName: 'David Kim', authorRole: 'Lead Inspector', text: 'Thermograms filed into asset documentation archive. Zero hotspots found.', timestamp: '2026-09-05T12:46:00Z' },
      ],
    },
  ];

  private meters: CmmsMeter[] = [
    {
      id: 'meter-vibe-01',
      assetId: 'asset-slurry-01',
      name: 'Triaxial Vibration Sensor (Drive End)',
      unit: 'mm/s',
      readingType: 'GAUGE',
      currentValue: 3.4,
      minThreshold: null,
      maxThreshold: 4.5,
      iotTopic: 'factory/line-1/pump-a/vibration',
      lastReadAt: '2026-09-07T12:15:00Z',
      createdAt: '2026-01-15T00:00:00Z',
      updatedAt: '2026-09-07T12:15:00Z',
    },
    {
      id: 'meter-temp-02',
      assetId: 'asset-press-02',
      name: 'Hydraulic Manifold Temp Sensor',
      unit: '°C',
      readingType: 'GAUGE',
      currentValue: 68.2,
      minThreshold: 20.0,
      maxThreshold: 85.0,
      iotTopic: 'factory/line-1/press/temp',
      lastReadAt: '2026-09-07T12:14:00Z',
      createdAt: '2026-01-15T00:00:00Z',
      updatedAt: '2026-09-07T12:14:00Z',
    },
    {
      id: 'meter-hours-03',
      assetId: 'asset-chiller-03',
      name: 'Operating Hours Counter',
      unit: 'hours',
      readingType: 'CUMULATIVE',
      currentValue: 2840,
      minThreshold: null,
      maxThreshold: null,
      iotTopic: 'hvac/central/operating-hours',
      lastReadAt: '2026-09-07T12:00:00Z',
      createdAt: '2026-01-15T00:00:00Z',
      updatedAt: '2026-09-07T12:00:00Z',
    },
  ];

  private parts: CmmsPart[] = [
    {
      id: 'part-bearing-6314',
      partNumber: 'BRG-SKF-6314-C3',
      name: 'Deep Groove Ball Bearing 70x150x35mm',
      description: 'C3 internal clearance high-speed centrifugal pump drive bearing',
      category: 'Bearings',
      unitOfMeasure: 'EACH',
      unitCost: 145.5,
      currencyCode: 'USD',
      quantityOnHand: 4,
      minQuantity: 2,
      maxQuantity: 12,
      reorderPoint: 3,
      nonStock: false,
      barcode: '931284719283',
      area: 'Aisle 4 - Shelf B2',
      locationId: 'loc-warehouse-mro',
      warehouse: 'Central MRO Depot',
      aisle: 'A4',
      rack: 'R02',
      bin: 'BIN-14',
      leadTimeDays: 4,
      preferredVendor: 'Motion Industries Inc.',
      version: 1,
      createdAt: '2026-01-10T00:00:00Z',
      updatedAt: '2026-09-07T10:00:00Z',
    },
    {
      id: 'part-seal-mech',
      partNumber: 'SEAL-SLURRY-4IN',
      name: 'Tungsten Carbide Slurry Mechanical Seal 4"',
      description: 'Heavy duty cartridge mechanical seal for abrasive slurry handling',
      category: 'Seals & Gaskets',
      unitOfMeasure: 'EACH',
      unitCost: 890.0,
      currencyCode: 'USD',
      quantityOnHand: 2,
      minQuantity: 2,
      maxQuantity: 6,
      reorderPoint: 2,
      nonStock: false,
      barcode: '893412093841',
      area: 'Aisle 4 - Shelf C1',
      locationId: 'loc-warehouse-mro',
      warehouse: 'Central MRO Depot',
      aisle: 'A4',
      rack: 'R03',
      bin: 'BIN-08',
      leadTimeDays: 14,
      preferredVendor: 'Flowserve Corporation',
      version: 1,
      createdAt: '2026-01-10T00:00:00Z',
      updatedAt: '2026-09-07T10:00:00Z',
    },
    {
      id: 'part-hyd-filter',
      partNumber: 'FLTR-HYD-10MIC',
      name: 'High Pressure Hydraulic Filter Element 10 Micron',
      description: 'Microglass synthetic fiber element for 350 bar servo-valve loop',
      category: 'Filtration',
      unitOfMeasure: 'EACH',
      unitCost: 65.0,
      currencyCode: 'USD',
      quantityOnHand: 14,
      minQuantity: 5,
      maxQuantity: 30,
      reorderPoint: 8,
      nonStock: false,
      barcode: '784910293841',
      area: 'Aisle 2 - Shelf A4',
      locationId: 'loc-warehouse-mro',
      warehouse: 'Central MRO Depot',
      aisle: 'A2',
      rack: 'R01',
      bin: 'BIN-22',
      leadTimeDays: 3,
      preferredVendor: 'Parker Hannifin',
      version: 1,
      createdAt: '2026-01-10T00:00:00Z',
      updatedAt: '2026-09-07T10:00:00Z',
    },
  ];

  private schedules: CmmsPmSchedule[] = [
    {
      id: 'sched-pm-01',
      name: 'Slurry Pump Monthly Bearing Greasing & Lube Audit',
      description: 'Purge old grease, replenish with synthetic polyurea high-temp lubricant.',
      assetId: 'asset-slurry-01',
      locationId: 'loc-mill-bay-2',
      categoryId: 'cat-mechanical',
      triggerType: 'CALENDAR',
      cronExpression: '0 8 1 * *',
      cronTimezone: 'UTC',
      meterId: null,
      meterThreshold: null,
      woTitleTemplate: 'PM: Slurry Pump Monthly Lube Service',
      woDescription: 'Inspect grease purge relief and apply 120g of synthetic NLGI 2 grease.',
      woPriority: 'MEDIUM',
      assignedTo: 'Lube Route Specialist',
      assignedTeams: ['team-mechanical'],
      isActive: true,
      lastTriggeredAt: '2026-08-01T08:00:00Z',
      nextDueAt: '2026-10-01T08:00:00Z',
      version: 1,
      createdAt: '2026-01-15T00:00:00Z',
      updatedAt: '2026-08-01T08:00:00Z',
    },
    {
      id: 'sched-pm-02',
      name: 'Chiller 3000-Hour Overhaul & Refrigerant Analysis',
      description: 'Run comprehensive oil acid test, clean condenser coils, check TXV superheat.',
      assetId: 'asset-chiller-03',
      locationId: 'loc-utility-roof',
      categoryId: 'cat-hvac',
      triggerType: 'METER_THRESHOLD',
      cronExpression: null,
      cronTimezone: 'UTC',
      meterId: 'meter-hours-03',
      meterThreshold: 3000,
      woTitleTemplate: 'PM: Chiller 3000-Hour Mechanical Overhaul',
      woDescription: 'Inspect compressor vibration spectrum and replace inline desiccant dryer.',
      woPriority: 'HIGH',
      assignedTo: 'HVAC Controls Engineer',
      assignedTeams: ['team-facilities'],
      isActive: true,
      lastTriggeredAt: null,
      nextDueAt: '2026-09-25T00:00:00Z',
      version: 1,
      createdAt: '2026-01-15T00:00:00Z',
      updatedAt: '2026-01-15T00:00:00Z',
    },
  ];

  // Asset Queries
  getAssets(): CmmsAsset[] {
    return this.assets;
  }

  getAssetById(id: string): CmmsAsset | undefined {
    return this.assets.find((a) => a.id === id);
  }

  createAsset(data: Partial<CmmsAsset>): CmmsAsset {
    const asset: CmmsAsset = {
      id: `asset-${randomUUID().slice(0, 8)}`,
      name: data.name || 'New Industrial Machinery',
      description: data.description || null,
      categoryId: data.categoryId || null,
      formSchemaId: null,
      specs: data.specs || {},
      status: (data.status as any) || 'OPERATIONAL',
      assetTag: data.assetTag || `TAG-${randomUUID().slice(0, 6).toUpperCase()}`,
      serialNumber: data.serialNumber || `SN-${randomUUID().slice(0, 8).toUpperCase()}`,
      model: data.model || null,
      manufacturer: data.manufacturer || null,
      power: data.power || null,
      area: data.area || null,
      acquisitionCost: data.acquisitionCost || 0,
      currencyCode: 'USD',
      locationId: data.locationId || null,
      parentAssetId: data.parentAssetId || null,
      hierarchyLevel: data.hierarchyLevel || 'MACHINE',
      healthScore: 100,
      mtbfHours: 1200,
      mttrHours: 2.5,
      ravCost: (data.acquisitionCost || 0) * 1.25,
      assignedTo: data.assignedTo || null,
      assignedTeams: data.assignedTeams || [],
      warrantyExpiry: data.warrantyExpiry || null,
      purchaseDate: data.purchaseDate || new Date().toISOString().split('T')[0],
      criticality: (data.criticality as any) || 'MEDIUM',
      iotDeviceId: data.iotDeviceId || null,
      scadaEndpoint: data.scadaEndpoint || null,
      version: 1,
      createdBy: 'user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.assets.unshift(asset);
    return asset;
  }

  // Work Order Workbench Methods
  getWorkOrders(): CmmsWorkOrder[] {
    return this.workOrders;
  }

  getWorkOrderById(id: string): CmmsWorkOrder | undefined {
    return this.workOrders.find((w) => w.id === id);
  }

  createWorkOrder(data: Partial<CmmsWorkOrder>): CmmsWorkOrder {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(this.workOrders.length + 1).padStart(4, '0');
    const wo: CmmsWorkOrder = {
      id: `wo-${randomUUID().slice(0, 8)}`,
      woNumber: `WO-${today}-${seq}`,
      type: (data.type as any) || 'REACTIVE',
      priority: (data.priority as any) || 'MEDIUM',
      status: (data.type as any) === 'EMERGENCY' ? 'IN_PROGRESS' : 'OPEN',
      title: data.title || 'Maintenance Request',
      description: data.description || null,
      assetId: data.assetId || null,
      locationId: data.locationId || null,
      categoryId: data.categoryId || null,
      assignedTo: data.assignedTo || null,
      dueDate: data.dueDate || null,
      startedAt: (data.type as any) === 'EMERGENCY' ? new Date().toISOString() : null,
      completedAt: null,
      requiredSignature: data.requiredSignature || false,
      signatureData: null,
      feedback: null,
      triggerSource: data.triggerSource || 'MANUAL',
      estimatedDuration: data.estimatedDuration || 2,
      auditReceipt: null,
      version: 1,
      createdBy: 'operator',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tasks: [
        { id: `t-${randomUUID().slice(0, 4)}`, label: 'Initial site assessment and safety check', taskType: 'PASS_FAIL', status: 'PENDING' },
        { id: `t-${randomUUID().slice(0, 4)}`, label: 'Execute mechanical repair protocol', taskType: 'CHECKLIST', status: 'PENDING' },
        { id: `t-${randomUUID().slice(0, 4)}`, label: 'Verify normal operational parameters', taskType: 'CHECKLIST', status: 'PENDING' },
      ],
      labors: [],
      partsUsed: [],
      additionalCosts: [],
      comments: [
        { id: `c-${randomUUID().slice(0, 4)}`, authorName: 'System', authorRole: 'Dispatcher', text: 'Work Order initialized in system.', timestamp: new Date().toISOString() },
      ],
    };
    this.workOrders.unshift(wo);
    return wo;
  }

  changeWoStatus(woId: string, status: string, feedback?: string): CmmsWorkOrder {
    const wo = this.workOrders.find((w) => w.id === woId);
    if (!wo) throw new Error(`Work order ${woId} not found.`);
    wo.status = status as any;
    if (feedback) wo.feedback = feedback;
    if (status === 'IN_PROGRESS' && !wo.startedAt) wo.startedAt = new Date().toISOString();
    if (status === 'COMPLETED') {
      wo.completedAt = new Date().toISOString();
      wo.auditReceipt = `sha256:${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`;
    }
    wo.version += 1;
    wo.updatedAt = new Date().toISOString();
    return wo;
  }

  updateTask(woId: string, taskId: string, status: 'PENDING' | 'PASSED' | 'FAILED' | 'DONE', value?: number, notes?: string): CmmsWorkOrder {
    const wo = this.workOrders.find((w) => w.id === woId);
    if (!wo || !wo.tasks) throw new Error(`Work order ${woId} tasks not found.`);
    const task = wo.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task ${taskId} not found.`);
    task.status = status;
    if (value !== undefined) task.value = value;
    if (notes) task.notes = notes;
    wo.updatedAt = new Date().toISOString();
    return wo;
  }

  logLabor(woId: string, technicianName: string, role: string, hours: number, ratePerHour: number, timeCategory: 'REGULAR' | 'OVERTIME' | 'HAZARD'): CmmsWorkOrder {
    const wo = this.workOrders.find((w) => w.id === woId);
    if (!wo) throw new Error(`Work order ${woId} not found.`);
    if (!wo.labors) wo.labors = [];
    wo.labors.push({
      id: `l-${randomUUID().slice(0, 6)}`,
      technicianName,
      role,
      hours,
      ratePerHour,
      timeCategory,
      loggedAt: new Date().toISOString(),
    });
    wo.updatedAt = new Date().toISOString();
    return wo;
  }

  consumePart(woId: string, partId: string, quantity: number): CmmsWorkOrder {
    const wo = this.workOrders.find((w) => w.id === woId);
    if (!wo) throw new Error(`Work order ${woId} not found.`);
    const part = this.parts.find((p) => p.id === partId);
    if (!part) throw new Error(`Part ${partId} not found.`);

    part.quantityOnHand = Math.max(0, part.quantityOnHand - quantity);
    if (!wo.partsUsed) wo.partsUsed = [];
    wo.partsUsed.push({
      id: `pu-${randomUUID().slice(0, 6)}`,
      partId,
      partNumber: part.partNumber,
      partName: part.name,
      quantity,
      unitCost: part.unitCost || 0,
      binLocation: `${part.warehouse || 'MRO'} - ${part.aisle || 'A1'}-${part.bin || 'B01'}`,
    });
    wo.updatedAt = new Date().toISOString();
    return wo;
  }

  addComment(woId: string, authorName: string, authorRole: string, text: string): CmmsWorkOrder {
    const wo = this.workOrders.find((w) => w.id === woId);
    if (!wo) throw new Error(`Work order ${woId} not found.`);
    if (!wo.comments) wo.comments = [];
    wo.comments.push({
      id: `c-${randomUUID().slice(0, 6)}`,
      authorName,
      authorRole,
      text,
      timestamp: new Date().toISOString(),
    });
    return wo;
  }

  // PM Schedules
  getSchedules(): CmmsPmSchedule[] {
    return this.schedules;
  }

  triggerPm(id: string): CmmsWorkOrder {
    const pm = this.schedules.find((s) => s.id === id);
    if (!pm) throw new Error(`PM schedule ${id} not found.`);
    const wo = this.createWorkOrder({
      title: pm.woTitleTemplate || `PM: ${pm.name}`,
      description: pm.woDescription,
      assetId: pm.assetId,
      locationId: pm.locationId,
      categoryId: pm.categoryId,
      priority: pm.woPriority as any,
      type: 'PREVENTIVE',
      assignedTo: pm.assignedTo,
      triggerSource: 'PM_SCHEDULE',
    });
    pm.lastTriggeredAt = new Date().toISOString();
    return wo;
  }

  // Meters & IoT
  getMeters(): CmmsMeter[] {
    return this.meters;
  }

  recordReading(meterId: string, value: number): CmmsMeter {
    const meter = this.meters.find((m) => m.id === meterId);
    if (!meter) throw new Error(`Meter ${meterId} not found.`);
    meter.currentValue = value;
    meter.lastReadAt = new Date().toISOString();
    meter.updatedAt = new Date().toISOString();
    return meter;
  }

  ingestIot(readings: Array<{ iotTopic: string; value: number }>) {
    let triggeredEmergency = false;
    for (const r of readings) {
      const meter = this.meters.find((m) => m.iotTopic === r.iotTopic);
      if (meter) {
        meter.currentValue = r.value;
        meter.lastReadAt = new Date().toISOString();
        if (meter.maxThreshold !== null && r.value > meter.maxThreshold) {
          triggeredEmergency = true;
          this.createWorkOrder({
            title: `CRITICAL SENSOR BREACH: ${meter.name}`,
            description: `Sensor reading ${r.value} ${meter.unit} exceeded high limit ${meter.maxThreshold} ${meter.unit}. Emergency shutdown inspection triggered.`,
            assetId: meter.assetId,
            priority: 'EMERGENCY',
            type: 'EMERGENCY',
            assignedTo: 'Lead Industrial Specialist',
            triggerSource: 'RULE_ENGINE',
          });
        }
      }
    }
    return { accepted: readings.length, triggeredEmergency };
  }

  // Parts
  getParts(): CmmsPart[] {
    return this.parts;
  }

  recordPartTx(partId: string, type: 'CONSUME' | 'ADD', quantity: number, notes?: string): CmmsPart {
    const part = this.parts.find((p) => p.id === partId);
    if (!part) throw new Error(`Part ${partId} not found.`);
    const delta = type === 'CONSUME' ? -quantity : quantity;
    part.quantityOnHand = Math.max(0, part.quantityOnHand + delta);
    part.updatedAt = new Date().toISOString();
    return part;
  }

  getMetrics(): CmmsMetrics {
    const completed = this.workOrders.filter((w) => w.status === 'COMPLETED').length;
    const open = this.workOrders.filter((w) => w.status === 'OPEN').length;
    const inProgress = this.workOrders.filter((w) => w.status === 'IN_PROGRESS').length;
    const onHold = this.workOrders.filter((w) => w.status === 'ON_HOLD').length;
    const emergencies = this.workOrders.filter((w) => w.priority === 'EMERGENCY' && w.status !== 'COMPLETED').length;
    return {
      completedCount: completed,
      openCount: open,
      inProgressCount: inProgress,
      onHoldCount: onHold,
      activeEmergencies: emergencies,
      overdueCount: 1,
      avgCycleTimeHours: 3.2,
    };
  }

  getInventoryMetrics(): CmmsInventoryMetrics {
    const lowStock = this.parts.filter((p) => p.reorderPoint !== null && p.quantityOnHand <= p.reorderPoint).length;
    const val = this.parts.reduce((sum, p) => sum + p.quantityOnHand * (p.unitCost || 0), 0);
    return {
      totalParts: this.parts.length,
      lowStockCount: lowStock,
      totalInventoryValuation: Math.round(val),
    };
  }

  getReliabilityMetrics(): CmmsReliabilityMetrics {
    return {
      overallMtbfHours: 840,
      overallMttrHours: 2.8,
      overallAvailabilityPercent: 98.4,
      ravRatioPercent: 2.4, // Maintenance cost as % of Replacement Asset Value
      mtbfTrend: [
        { month: 'Apr', mtbfHours: 680, targetHours: 800 },
        { month: 'May', mtbfHours: 720, targetHours: 800 },
        { month: 'Jun', mtbfHours: 790, targetHours: 800 },
        { month: 'Jul', mtbfHours: 740, targetHours: 800 },
        { month: 'Aug', mtbfHours: 820, targetHours: 800 },
        { month: 'Sep', mtbfHours: 840, targetHours: 800 },
      ],
      paretoFailureModes: [
        { mode: 'Bearing Wear & Lubrication Breakdown', count: 18, cumulativePercent: 44, costImpact: 28400 },
        { mode: 'Hydraulic Seal Blown / Fluid Leak', count: 11, cumulativePercent: 71, costImpact: 19800 },
        { mode: 'Electrical Overload / VFD Trip', count: 6, cumulativePercent: 86, costImpact: 9400 },
        { mode: 'Impeller Cavitation & Slurry Abrasion', count: 4, cumulativePercent: 96, costImpact: 14200 },
        { mode: 'Sensor Signal Drift / Instrument Fault', count: 2, cumulativePercent: 100, costImpact: 1800 },
      ],
      technicianUtilization: [
        { name: 'Marcus Vance', activeWos: 2, completedWos: 14, utilizationPercent: 94 },
        { name: 'Elena Rostova', activeWos: 1, completedWos: 11, utilizationPercent: 88 },
        { name: 'David Kim', activeWos: 1, completedWos: 16, utilizationPercent: 96 },
        { name: 'Carlos Mendez', activeWos: 2, completedWos: 8, utilizationPercent: 82 },
      ],
    };
  }

  // ─── ASSET CRUD ──────────────────────────────────────────────────
  updateAsset(id: string, patch: Partial<CmmsAsset>): CmmsAsset {
    const idx = this.assets.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error(`Asset ${id} not found`);
    this.assets[idx] = { ...this.assets[idx]!, ...patch, updatedAt: new Date().toISOString(), version: (this.assets[idx]!.version || 1) + 1 };
    return this.assets[idx]!;
  }

  deleteAsset(id: string): void {
    this.assets = this.assets.filter((a) => a.id !== id);
  }

  createPart(body: Partial<CmmsPart>): CmmsPart {
    const part: CmmsPart = {
      id: `part-${randomUUID().slice(0, 8)}`,
      partNumber: body.partNumber ?? `SKU-${Date.now()}`,
      name: body.name ?? 'New Part',
      description: body.description ?? null,
      category: body.category ?? 'Mechanical',
      unitOfMeasure: body.unitOfMeasure ?? 'EACH',
      unitCost: body.unitCost ?? 0,
      quantityOnHand: body.quantityOnHand ?? 0,
      minQuantity: body.minQuantity ?? 1,
      maxQuantity: body.maxQuantity ?? 100,
      reorderPoint: body.reorderPoint ?? 2,
      warehouse: body.warehouse ?? 'WH-01',
      aisle: body.aisle ?? 'A1',
      rack: body.rack ?? 'R01',
      bin: body.bin ?? 'B01',
      barcode: body.barcode ?? null,
      preferredVendor: body.preferredVendor ?? 'Motion Industries',
      leadTimeDays: body.leadTimeDays ?? 3,
      currencyCode: 'USD',
      nonStock: false,
      area: null,
      locationId: null,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.parts.push(part);
    return part;
  }

  // ─── PM SCHEDULE CRUD ─────────────────────────────────────────────
  createSchedule(body: Partial<CmmsPmSchedule>): CmmsPmSchedule {
    const sched: CmmsPmSchedule = {
      id: randomUUID(),
      name: body.name ?? 'New PM Schedule',
      description: body.description ?? '',
      assetId: body.assetId ?? 'asset-line-01',
      locationId: body.locationId ?? null,
      categoryId: body.categoryId ?? null,
      triggerType: body.triggerType ?? 'CALENDAR',
      cronExpression: body.cronExpression ?? '0 8 1 * *',
      cronTimezone: body.cronTimezone ?? 'UTC',
      meterId: body.meterId ?? null,
      meterThreshold: body.meterThreshold ?? null,
      woTitleTemplate: body.woTitleTemplate ?? body.name ?? 'PM Task',
      woDescription: body.woDescription ?? '',
      woPriority: body.woPriority ?? 'MEDIUM',
      assignedTo: body.assignedTo ?? null,
      assignedTeams: body.assignedTeams ?? [],
      isActive: body.isActive ?? true,
      lastTriggeredAt: null,
      nextDueAt: body.nextDueAt ?? null,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.schedules.push(sched);
    return sched;
  }

  updateSchedule(id: string, patch: Partial<CmmsPmSchedule>): CmmsPmSchedule {
    const idx = this.schedules.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`Schedule ${id} not found`);
    this.schedules[idx] = { ...this.schedules[idx]!, ...patch };
    return this.schedules[idx]!;
  }

  deleteSchedule(id: string): void {
    this.schedules = this.schedules.filter((s) => s.id !== id);
  }

  // ─── PART CRUD ────────────────────────────────────────────────────
  updatePart(id: string, patch: Partial<CmmsPart>): CmmsPart {
    const idx = this.parts.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Part ${id} not found`);
    this.parts[idx] = { ...this.parts[idx]!, ...patch };
    return this.parts[idx]!;
  }

  deletePart(id: string): void {
    this.parts = this.parts.filter((p) => p.id !== id);
  }

  // ─── MAINTENANCE REQUESTS ─────────────────────────────────────────
  private requests: CmmsMaintenanceRequest[] = [
    {
      id: 'req-001',
      title: 'Unusual noise from conveyor belt motor',
      description: 'Loud grinding sound from conveyor motor near Loading Bay 3. Started this morning. Needs urgent check.',
      assetId: 'asset-line-01',
      locationId: 'loc-mill-bay-2',
      priority: 'HIGH',
      status: 'PENDING',
      contact: 'John Martinez (Shift Supervisor)',
      portalId: 'portal-main',
      convertedWoId: null,
      createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
      cancelledAt: null,
      cancellationReason: null,
    },
    {
      id: 'req-002',
      title: 'Office HVAC not cooling - Floor 2',
      description: 'Air conditioning in the engineering office has been blowing warm air since yesterday afternoon.',
      assetId: null,
      locationId: null,
      priority: 'MEDIUM',
      status: 'APPROVED',
      contact: 'Sarah Chen (Engineering Manager)',
      portalId: 'portal-main',
      convertedWoId: 'wo-004',
      createdAt: new Date(Date.now() - 26 * 3600000).toISOString(),
      cancelledAt: null,
      cancellationReason: null,
    },
    {
      id: 'req-003',
      title: 'Leaking pipe near Pump Station 4',
      description: 'Small water leak from a joint near pump station 4. Not critical yet but should be addressed before next shift.',
      assetId: 'asset-slurry-01',
      locationId: null,
      priority: 'MEDIUM',
      status: 'REJECTED',
      contact: 'Tony Nguyen (Operator)',
      portalId: 'portal-main',
      convertedWoId: null,
      createdAt: new Date(Date.now() - 72 * 3600000).toISOString(),
      cancelledAt: null,
      cancellationReason: 'Investigated on-site — this is controlled process condensation, not a leak.',
    },
  ];

  getRequests(): CmmsMaintenanceRequest[] { return [...this.requests]; }

  createRequest(body: Partial<CmmsMaintenanceRequest>): CmmsMaintenanceRequest {
    const req: CmmsMaintenanceRequest = {
      id: randomUUID(),
      title: body.title ?? 'Untitled Request',
      description: body.description ?? '',
      assetId: body.assetId ?? null,
      locationId: body.locationId ?? null,
      priority: body.priority ?? 'MEDIUM',
      status: 'PENDING',
      contact: body.contact ?? '',
      portalId: body.portalId ?? 'portal-main',
      convertedWoId: null,
      createdAt: new Date().toISOString(),
      cancelledAt: null,
      cancellationReason: null,
    };
    this.requests.push(req);
    return req;
  }

  approveRequest(id: string): { request: CmmsMaintenanceRequest; workOrder: CmmsWorkOrder } {
    const req = this.requests.find((r) => r.id === id);
    if (!req) throw new Error(`Request ${id} not found`);
    const wo = this.createWorkOrder({
      title: req.title,
      description: req.description,
      type: 'REACTIVE',
      priority: req.priority as CmmsWorkOrder['priority'],
      assetId: req.assetId ?? undefined,
      locationId: req.locationId ?? undefined,
      triggerSource: 'REQUEST',
    });
    req.status = 'APPROVED';
    req.convertedWoId = wo.id;
    return { request: req, workOrder: wo };
  }

  rejectRequest(id: string, reason: string): CmmsMaintenanceRequest {
    const req = this.requests.find((r) => r.id === id);
    if (!req) throw new Error(`Request ${id} not found`);
    req.status = 'REJECTED';
    req.cancellationReason = reason;
    return req;
  }

  // ─── PEOPLE & TEAMS ───────────────────────────────────────────────
  private people: CmmsTechnician[] = [
    { id: 'tech-01', name: 'Marcus Vance', role: 'Lead Millwright', email: 'marcus.vance@plant.io', ratePerHour: 75, teamIds: ['team-grinding-ops'], phone: '+1 775-555-0101', activeWos: 2, completedWos: 14 },
    { id: 'tech-02', name: 'Elena Rostova', role: 'Electrical Technician', email: 'e.rostova@plant.io', ratePerHour: 70, teamIds: ['team-electrical'], phone: '+1 775-555-0102', activeWos: 1, completedWos: 11 },
    { id: 'tech-03', name: 'David Kim', role: 'Instrumentation Engineer', email: 'd.kim@plant.io', ratePerHour: 85, teamIds: ['team-instrumentation'], phone: '+1 775-555-0103', activeWos: 1, completedWos: 16 },
    { id: 'tech-04', name: 'Carlos Mendez', role: 'Process Operator', email: 'c.mendez@plant.io', ratePerHour: 60, teamIds: ['team-grinding-ops'], phone: '+1 775-555-0104', activeWos: 2, completedWos: 8 },
    { id: 'tech-05', name: 'Priya Sharma', role: 'Reliability Engineer', email: 'p.sharma@plant.io', ratePerHour: 90, teamIds: ['team-reliability'], phone: '+1 775-555-0105', activeWos: 0, completedWos: 22 },
  ];

  private teams: CmmsTeamRecord[] = [
    { id: 'team-grinding-ops', name: 'Grinding & Slurry Operations', description: 'Responsible for all wet grinding and slurry circuit assets', memberIds: ['tech-01', 'tech-04'], color: '#3b82f6' },
    { id: 'team-electrical', name: 'Electrical & Controls', description: 'HV/MV electrical, VFDs, control panels and instrumentation', memberIds: ['tech-02'], color: '#f59e0b' },
    { id: 'team-instrumentation', name: 'Instrumentation', description: 'Process instrumentation, analyzers, and SCADA I/O', memberIds: ['tech-03'], color: '#8b5cf6' },
    { id: 'team-reliability', name: 'Reliability Engineering', description: 'RCM, failure analysis, PM program ownership', memberIds: ['tech-05'], color: '#10b981' },
  ];

  getPeople(): CmmsTechnician[] { return [...this.people]; }
  getTeams(): CmmsTeamRecord[] { return [...this.teams]; }

  createPerson(body: Partial<CmmsTechnician>): CmmsTechnician {
    const person: CmmsTechnician = {
      id: randomUUID(),
      name: body.name ?? 'New Technician',
      role: body.role ?? 'Technician',
      email: body.email ?? '',
      ratePerHour: body.ratePerHour ?? 50,
      teamIds: body.teamIds ?? [],
      phone: body.phone ?? '',
      activeWos: 0,
      completedWos: 0,
    };
    this.people.push(person);
    return person;
  }

  createTeam(body: Partial<CmmsTeamRecord>): CmmsTeamRecord {
    const team: CmmsTeamRecord = {
      id: randomUUID(),
      name: body.name ?? 'New Team',
      description: body.description ?? '',
      memberIds: body.memberIds ?? [],
      color: body.color ?? '#6b7280',
    };
    this.teams.push(team);
    return team;
  }

  // ─── PURCHASE ORDERS ─────────────────────────────────────────────
  private purchaseOrders: CmmsPurchaseOrder[] = [
    {
      id: 'po-001',
      name: 'PO-2026-0041 – Bearing & Seal Restock',
      status: 'PENDING',
      vendorId: 'vendor-01',
      vendorName: 'Motion Industries',
      category: 'Scheduled Maintenance',
      lines: [
        { id: 'pol-01', partId: 'part-brg-001', partNumber: 'BRG-SKF-6314-C3', description: 'Deep Groove Ball Bearing 70mm', quantity: 6, unitCost: 89.50, totalCost: 537.00 },
        { id: 'pol-02', partId: 'part-seal-001', partNumber: 'SEAL-SLURRY-4IN', description: 'Tungsten Carbide Mechanical Seal 4"', quantity: 4, unitCost: 480.00, totalCost: 1920.00 },
      ],
      totalCost: 2457.00,
      shippingDueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]!,
      shippingAddress: '1420 Industrial Blvd, Elko, NV 89801',
      notes: 'Urgent — seal stock at reorder level. Expedite if possible.',
      createdAt: new Date(Date.now() - 4 * 3600000).toISOString(),
      approvedAt: null,
      approvedBy: null,
    },
    {
      id: 'po-002',
      name: 'PO-2026-0038 – Hydraulic Filter Elements Q3',
      status: 'APPROVED',
      vendorId: 'vendor-02',
      vendorName: 'Parker Hannifin',
      category: 'Preventive Maintenance',
      lines: [
        { id: 'pol-03', partId: 'part-fltr-001', partNumber: 'FLTR-HYD-10MIC', description: 'Hydraulic Filter 10 Micron', quantity: 24, unitCost: 28.75, totalCost: 690.00 },
      ],
      totalCost: 690.00,
      shippingDueDate: new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0]!,
      shippingAddress: '1420 Industrial Blvd, Elko, NV 89801',
      notes: 'Q3 quarterly bulk filter order.',
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      approvedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
      approvedBy: 'Priya Sharma',
    },
  ];

  getPurchaseOrders(): CmmsPurchaseOrder[] { return [...this.purchaseOrders]; }

  createPurchaseOrder(body: Partial<CmmsPurchaseOrder>): CmmsPurchaseOrder {
    const po: CmmsPurchaseOrder = {
      id: randomUUID(),
      name: body.name ?? `PO-${Date.now()}`,
      status: 'PENDING',
      vendorId: body.vendorId ?? null,
      vendorName: body.vendorName ?? '',
      category: body.category ?? 'General',
      lines: body.lines ?? [],
      totalCost: (body.lines ?? []).reduce((s, l) => s + l.totalCost, 0),
      shippingDueDate: body.shippingDueDate ?? null,
      shippingAddress: body.shippingAddress ?? '',
      notes: body.notes ?? '',
      createdAt: new Date().toISOString(),
      approvedAt: null,
      approvedBy: null,
    };
    this.purchaseOrders.push(po);
    return po;
  }

  approvePurchaseOrder(id: string, approver: string): CmmsPurchaseOrder {
    const po = this.purchaseOrders.find((p) => p.id === id);
    if (!po) throw new Error(`PO ${id} not found`);
    po.status = 'APPROVED';
    po.approvedAt = new Date().toISOString();
    po.approvedBy = approver;
    // Auto-restock parts
    for (const line of po.lines) {
      const partIdx = this.parts.findIndex((p) => p.id === line.partId);
      if (partIdx >= 0) {
        this.parts[partIdx]!.quantityOnHand += line.quantity;
      }
    }
    return po;
  }

  rejectPurchaseOrder(id: string): CmmsPurchaseOrder {
    const po = this.purchaseOrders.find((p) => p.id === id);
    if (!po) throw new Error(`PO ${id} not found`);
    po.status = 'REJECTED';
    return po;
  }

  // ─── VENDORS ─────────────────────────────────────────────────────
  private vendors: CmmsVendor[] = [
    { id: 'vendor-01', name: 'Motion Industries', email: 'orders@motionindustries.com', phone: '+1 800-526-9328', address: '1605 Alton Rd, Birmingham, AL 35210', hourlyRate: null, description: 'Bearings, seals, power transmission components', rating: 4.8 },
    { id: 'vendor-02', name: 'Parker Hannifin', email: 'industrial@parker.com', phone: '+1 800-272-7537', address: '6035 Parkland Blvd, Cleveland, OH 44124', hourlyRate: null, description: 'Hydraulic filters, fittings, pneumatic components', rating: 4.6 },
    { id: 'vendor-03', name: 'Flowserve Corporation', email: 'service@flowserve.com', phone: '+1 972-443-6500', address: "5215 N O'Connor Blvd, Irving, TX 75039", hourlyRate: 185, description: 'Pump seals, slurry pump overhaul, mechanical seal repair', rating: 4.9 },
  ];

  getVendors(): CmmsVendor[] { return [...this.vendors]; }

  createVendor(body: Partial<CmmsVendor>): CmmsVendor {
    const v: CmmsVendor = {
      id: randomUUID(),
      name: body.name ?? 'New Vendor',
      email: body.email ?? '',
      phone: body.phone ?? '',
      address: body.address ?? '',
      hourlyRate: body.hourlyRate ?? null,
      description: body.description ?? '',
      rating: 0,
    };
    this.vendors.push(v);
    return v;
  }

  // ─── WO HISTORY ───────────────────────────────────────────────────
  private woHistory: CmmsWoHistory[] = [
    { id: randomUUID(), woId: 'wo-001', fieldName: 'status', oldValue: 'OPEN', newValue: 'IN_PROGRESS', changedBy: 'Marcus Vance', changedAt: new Date(Date.now() - 3600000 * 5).toISOString(), note: 'Started bearing inspection after LOTO confirmed' },
    { id: randomUUID(), woId: 'wo-001', fieldName: 'assignedTo', oldValue: 'Elena Rostova', newValue: 'Marcus Vance (Lead Millwright)', changedBy: 'Plant Maintenance Supervisor', changedAt: new Date(Date.now() - 3600000 * 6).toISOString(), note: 'Reassigned to senior millwright for bearing overhaul' },
    { id: randomUUID(), woId: 'wo-003', fieldName: 'status', oldValue: 'IN_PROGRESS', newValue: 'COMPLETED', changedBy: 'David Kim', changedAt: new Date(Date.now() - 86400000 * 3).toISOString(), note: 'All thermal scans completed. No anomalies detected.' },
  ];

  getWoHistory(woId: string): CmmsWoHistory[] {
    return this.woHistory.filter((h) => h.woId === woId);
  }

  appendWoHistory(woId: string, fieldName: string, oldValue: string, newValue: string, changedBy: string, note?: string) {
    this.woHistory.push({
      id: randomUUID(),
      woId,
      fieldName,
      oldValue,
      newValue,
      changedBy,
      changedAt: new Date().toISOString(),
      note: note ?? '',
    });
  }

  // ─── ANALYTICS: WO BY STATUS / TECHNICIAN / CATEGORY ─────────────
  getWoAnalytics(): CmmsWoAnalytics {
    const byStatus = {
      OPEN: this.workOrders.filter((w) => w.status === 'OPEN').length,
      IN_PROGRESS: this.workOrders.filter((w) => w.status === 'IN_PROGRESS').length,
      ON_HOLD: this.workOrders.filter((w) => w.status === 'ON_HOLD').length,
      COMPLETED: this.workOrders.filter((w) => w.status === 'COMPLETED').length,
      CANCELLED: this.workOrders.filter((w) => w.status === 'CANCELLED').length,
    };
    const byPriority = {
      EMERGENCY: this.workOrders.filter((w) => w.priority === 'EMERGENCY').length,
      HIGH: this.workOrders.filter((w) => w.priority === 'HIGH').length,
      MEDIUM: this.workOrders.filter((w) => w.priority === 'MEDIUM').length,
      LOW: this.workOrders.filter((w) => w.priority === 'LOW').length,
      NONE: this.workOrders.filter((w) => w.priority === 'NONE').length,
    };
    const byType = {
      EMERGENCY: this.workOrders.filter((w) => w.type === 'EMERGENCY').length,
      REACTIVE: this.workOrders.filter((w) => w.type === 'REACTIVE').length,
      PREVENTIVE: this.workOrders.filter((w) => w.type === 'PREVENTIVE').length,
      INSPECTION: this.workOrders.filter((w) => w.type === 'INSPECTION').length,
    };
    return { byStatus, byPriority, byType };
  }
}

// ─── STORE-LOCAL TYPE EXTENSIONS ─────────────────────────────────────────────

export interface CmmsMaintenanceRequest {
  id: string;
  title: string;
  description: string;
  assetId: string | null;
  locationId: string | null;
  priority: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  contact: string;
  portalId: string;
  convertedWoId: string | null;
  createdAt: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

export interface CmmsTechnician {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  ratePerHour: number;
  teamIds: string[];
  activeWos: number;
  completedWos: number;
}

export interface CmmsTeamRecord {
  id: string;
  name: string;
  description: string;
  memberIds: string[];
  color: string;
}

export interface CmmsPurchaseOrder {
  id: string;
  name: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  vendorId: string | null;
  vendorName: string;
  category: string;
  lines: CmmsPOLine[];
  totalCost: number;
  shippingDueDate: string | null;
  shippingAddress: string;
  notes: string;
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
}

export interface CmmsPOLine {
  id: string;
  partId: string | null;
  partNumber: string;
  description: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface CmmsVendor {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  hourlyRate: number | null;
  description: string;
  rating: number;
}

export interface CmmsWoHistory {
  id: string;
  woId: string;
  fieldName: string;
  oldValue: string;
  newValue: string;
  changedBy: string;
  changedAt: string;
  note: string;
}

export interface CmmsWoAnalytics {
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byType: Record<string, number>;
}

export const cmmsStore = new CmmsStore();
