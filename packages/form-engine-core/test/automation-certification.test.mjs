import assert from 'node:assert/strict';
import {
  FormEngine,
} from '../dist/index.js';
import {
  GeofenceEngine,
  GeoCalculator,
} from '../../geofence-engine/dist/index.js';
import {
  UniversalRuleEngine,
} from '../../rule-engine-universal/dist/index.js';
import {
  ModuleRegistry,
  ModuleManifestSchema,
} from '../../module-registry/dist/index.js';

import tenancyManifest from '../../tenancy-core/module.manifest.json' with { type: 'json' };
import auditManifest from '../../audit-core/module.manifest.json' with { type: 'json' };
import rbacManifest from '../../rbac-core/module.manifest.json' with { type: 'json' };
import usersManifest from '../../users-core/module.manifest.json' with { type: 'json' };
import authManifest from '../../auth-core/module.manifest.json' with { type: 'json' };
import settingsManifest from '../../platform-settings/module.manifest.json' with { type: 'json' };
import ticketsManifest from '../../tickets-core/module.manifest.json' with { type: 'json' };
import slaManifest from '../../sla-engine/module.manifest.json' with { type: 'json' };
import invoicesManifest from '../../invoices-core/module.manifest.json' with { type: 'json' };
import ledgerManifest from '../../ledger-core/module.manifest.json' with { type: 'json' };
import billingManifest from '../../billing-core/module.manifest.json' with { type: 'json' };
import currencyManifest from '../../multi-currency/module.manifest.json' with { type: 'json' };
import formEngineManifest from '../module.manifest.json' with { type: 'json' };
import ruleEngineManifest from '../../rule-engine-universal/module.manifest.json' with { type: 'json' };
import workflowManifest from '../../workflow-engine/module.manifest.json' with { type: 'json' };
import geofenceManifest from '../../geofence-engine/module.manifest.json' with { type: 'json' };

console.log('⚡ Running GigaLibs Forms, Automations & Workflow Suite Certification...\n');

// ─── GATE 1: MANIFESTS & FULL 16-MODULE REGISTRY RESOLUTION ─────────────────
console.log('▶ Gate 1: Module Manifests & 16-Module Topological Tree Resolution...');
const all16Manifests = [
  tenancyManifest,
  auditManifest,
  rbacManifest,
  usersManifest,
  authManifest,
  settingsManifest,
  ticketsManifest,
  slaManifest,
  invoicesManifest,
  ledgerManifest,
  billingManifest,
  currencyManifest,
  formEngineManifest,
  ruleEngineManifest,
  workflowManifest,
  geofenceManifest,
];

for (const m of all16Manifests) {
  assert.doesNotThrow(() => ModuleManifestSchema.parse(m), `Manifest ${m.id} must be valid`);
}

const registry = new ModuleRegistry(all16Manifests);
assert.doesNotThrow(() => registry.assertReady(), 'All 16 modules must resolve cleanly without cycles');

const list = registry.list();
assert.equal(list.length, 16, 'All 16 platform modules must be registered');
for (const mod of list) {
  assert.equal(mod.status, 'READY', `${mod.manifest.id} must be READY`);
}
console.log(`  ✓ All 16 platform modules registered in READY state in topological order.\n`);

// ─── GATE 2: DYNAMIC FORMS STUDIO CONDITIONAL LOGIC & DDL GENERATOR ──────────
console.log('▶ Gate 2: Form Engine Conditional Logic & PostgreSQL JSONB DDL...');

const testSchema = {
  id: 'form_enterprise_onboarding',
  tenantId: 'tenant_acme',
  title: 'Enterprise Client Onboarding',
  version: 1,
  fields: [
    {
      id: 'companyName',
      name: 'companyName',
      label: 'Company Name',
      type: 'TEXT',
      validation: { required: true, minLength: 2 },
    },
    {
      id: 'planType',
      name: 'planType',
      label: 'Subscription Plan',
      type: 'SELECT',
      options: [
        { label: 'Growth Plan', value: 'growth' },
        { label: 'Enterprise Dedicated', value: 'enterprise' },
      ],
      validation: { required: true },
    },
    {
      id: 'dedicatedDbRegion',
      name: 'dedicatedDbRegion',
      label: 'Target Dedicated Cloud Region',
      type: 'TEXT',
      validation: { required: true },
      conditions: [
        {
          dependsOnFieldId: 'planType',
          operator: 'EQUALS',
          value: 'enterprise',
          action: 'SHOW',
        },
      ],
    },
  ],
  createdAt: '2026-08-30T12:00:00.000Z',
};

// 1. Conditional Visibility Test: Growth plan -> dedicatedDbRegion is HIDDEN
const growthData = { companyName: 'Stripe EU', planType: 'growth' };
assert.equal(
  FormEngine.isFieldVisible(testSchema.fields[2], growthData),
  false,
  'dedicatedDbRegion must be hidden for Growth plan',
);
const growthValidation = FormEngine.validate(testSchema, growthData);
assert.equal(growthValidation.isValid, true, 'Growth submission must be valid without hidden field');

// 2. Conditional Visibility Test: Enterprise plan -> dedicatedDbRegion is SHOWN & REQUIRED
const entDataIncomplete = { companyName: 'Tesla Energy', planType: 'enterprise' };
assert.equal(
  FormEngine.isFieldVisible(testSchema.fields[2], entDataIncomplete),
  true,
  'dedicatedDbRegion must be visible for Enterprise plan',
);
const entValidationIncomplete = FormEngine.validate(testSchema, entDataIncomplete);
assert.equal(entValidationIncomplete.isValid, false, 'Enterprise submission must require dedicatedDbRegion');

const entDataComplete = { companyName: 'Tesla Energy', planType: 'enterprise', dedicatedDbRegion: 'us-east-1' };
const entValidationComplete = FormEngine.validate(testSchema, entDataComplete);
assert.equal(entValidationComplete.isValid, true, 'Complete enterprise submission must pass validation');

// 3. PostgreSQL JSONB DDL Generation Check
const ddl = FormEngine.generatePostgresDdl();
assert.ok(ddl.includes('CREATE TABLE IF NOT EXISTS forms'), 'DDL must create forms table');
assert.ok(ddl.includes('USING GIN (data)'), 'DDL must create PostgreSQL GIN index on data JSONB');

console.log('  ✓ FormEngine declarative schemas, conditional branching (SHOW_IF), and PostgreSQL DDL verified.\n');

// ─── GATE 3: UNIVERSAL RULE ENGINE (JSON AST) ────────────────────────────────
console.log('▶ Gate 3: Universal Rule Engine Boolean AST Evaluation...');

const ruleEngine = new UniversalRuleEngine();
ruleEngine.addRule({
  id: 'rule_vip_discount',
  name: 'VIP High Value Discount',
  conditions: {
    all: [
      { fact: 'user.isVip', operator: 'equal', value: true },
      { fact: 'cart.total', operator: 'greaterThan', value: 1000 },
    ],
  },
  actions: [
    { type: 'APPLY_DISCOUNT', payload: { percent: 20 } },
  ],
  priority: 10,
});

const vipMatchingFacts = { user: { isVip: true }, cart: { total: 2500 } };
const vipResults = ruleEngine.evaluate(vipMatchingFacts);
assert.equal(vipResults.length, 1, 'Rule must match VIP user with cart > 1000');
assert.equal(vipResults[0].actionsToExecute[0].type, 'APPLY_DISCOUNT', 'Action must be APPLY_DISCOUNT');

const nonVipFacts = { user: { isVip: false }, cart: { total: 2500 } };
const nonVipResults = ruleEngine.evaluate(nonVipFacts);
assert.equal(nonVipResults.length, 0, 'Rule must NOT match non-VIP user');

console.log('  ✓ Universal Rule AST evaluator, nested boolean logic, and dynamic fact extraction verified.\n');

// ─── GATE 4: HAVERSINE DISTANCE & POINT-IN-POLYGON GEOFENCING ────────────────
console.log('▶ Gate 4: Geofence Engine & Geodesic Distance Calculations...');

const nyc = { latitude: 40.7128, longitude: -74.006 };
const london = { latitude: 51.5074, longitude: -0.1278 };

// Haversine NYC to London distance ~ 5,570 km
const distanceNycLondon = GeoCalculator.haversineDistance(nyc, london);
assert.ok(
  distanceNycLondon > 5560 && distanceNycLondon < 5590,
  `Distance (${distanceNycLondon.toFixed(1)} km) must be accurate within 5,570 km`,
);

// Circular Geofence: 5000 km threshold from NYC -> London is Outside
const fence5000km = { id: 'fence_1', name: 'NYC 5000km Radius', center: nyc, radiusKm: 5000 };
assert.equal(
  GeofenceEngine.isInsideRadius(london, fence5000km),
  false,
  'London must be outside 5000km NYC radius',
);

// Circular Geofence: 6000 km threshold from NYC -> London is Inside
const fence6000km = { id: 'fence_2', name: 'NYC 6000km Radius', center: nyc, radiusKm: 6000 };
assert.equal(
  GeofenceEngine.isInsideRadius(london, fence6000km),
  true,
  'London must be inside 6000km NYC radius',
);

// Ray-Casting Point-in-Polygon
const squarePolygon = [
  { latitude: 10, longitude: 10 },
  { latitude: 10, longitude: 20 },
  { latitude: 20, longitude: 20 },
  { latitude: 20, longitude: 10 },
];
assert.equal(
  GeofenceEngine.isInsidePolygon({ latitude: 15, longitude: 15 }, squarePolygon),
  true,
  'Point (15, 15) must be inside polygon',
);
assert.equal(
  GeofenceEngine.isInsidePolygon({ latitude: 25, longitude: 25 }, squarePolygon),
  false,
  'Point (25, 25) must be outside polygon',
);

console.log('  ✓ Geodesic Haversine calculations and Ray-Casting Point-in-Polygon containment verified.\n');

console.log('════════════════════════════════════════════════════════════════════════');
console.log('🏆 ALL FORMS, AUTOMATIONS & WORKFLOW CERTIFICATION GATES PASSED!');
console.log('════════════════════════════════════════════════════════════════════════\n');
