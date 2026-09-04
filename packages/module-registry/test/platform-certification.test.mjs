import assert from 'node:assert/strict';
import {
  ModuleRegistry,
  ModuleManifestSchema,
} from '../dist/index.js';

import tenancyManifest from '../../tenancy-core/module.manifest.json' with { type: 'json' };
import auditManifest from '../../audit-core/module.manifest.json' with { type: 'json' };
import rbacManifest from '../../rbac-core/module.manifest.json' with { type: 'json' };
import usersManifest from '../../users-core/module.manifest.json' with { type: 'json' };
import authManifest from '../../auth-core/module.manifest.json' with { type: 'json' };
import settingsManifest from '../../platform-settings/module.manifest.json' with { type: 'json' };
import ticketsManifest from '../../tickets-core/module.manifest.json' with { type: 'json' };
import slaManifest from '../../sla-engine/module.manifest.json' with { type: 'json' };

console.log('🏛️ Running GigaLibs Platform Foundation Certification Suite...\n');

const allManifests = [
  tenancyManifest,
  auditManifest,
  rbacManifest,
  usersManifest,
  authManifest,
  settingsManifest,
  ticketsManifest,
  slaManifest,
];

console.log(`📦 Loaded ${allManifests.length} Platform Module Manifests:`);
allManifests.forEach((m) => console.log(`   • [${m.id}] v${m.version} - ${m.name}`));
console.log();

// ─── GATE 1: ZOD SCHEMA COMPLIANCE ───────────────────────────────────────────
console.log('▶ Gate 1: Validating all module manifests against ModuleManifestSchema...');
for (const manifest of allManifests) {
  assert.doesNotThrow(
    () => ModuleManifestSchema.parse(manifest),
    `Manifest '${manifest.id}' must conform to ModuleManifestSchema`,
  );
}
console.log(`  ✓ All ${allManifests.length} manifests strictly comply with ModuleManifestSchema.\n`);

// ─── GATE 2: REGISTRY TOPOLOGICAL RESOLUTION & DEPENDENCY RESOLUTION ─────────
console.log('▶ Gate 2: Registering modules into Platform Kernel ModuleRegistry...');
const registry = new ModuleRegistry(allManifests);

assert.doesNotThrow(
  () => registry.assertReady(),
  'All required module dependencies must resolve cleanly across the platform',
);

const registeredList = registry.list();
assert.equal(registeredList.length, allManifests.length, 'All modules must be registered');

for (const mod of registeredList) {
  assert.equal(mod.status, 'READY', `Module '${mod.manifest.id}' must be in READY state`);
  assert.equal(mod.problems.length, 0, `Module '${mod.manifest.id}' must have 0 problems`);
}

console.log('  ✓ Topological dependency resolution succeeded without cycles:');
registeredList.forEach((mod, idx) => {
  console.log(`    ${idx + 1}. ${mod.manifest.id} (Status: ${mod.status})`);
});
console.log();

// ─── GATE 3: ISOLATED DISABLE / ENABLE LIFECYCLE ─────────────────────────────
console.log('▶ Gate 3: Dynamic module disable/enable lifecycle...');
registry.disable('gigalibs.tickets');
const disabledTicket = registry.get('gigalibs.tickets');
assert.equal(disabledTicket?.status, 'DISABLED', 'gigalibs.tickets must be DISABLED');

registry.enable('gigalibs.tickets');
const reEnabledTicket = registry.get('gigalibs.tickets');
assert.equal(reEnabledTicket?.status, 'READY', 'gigalibs.tickets must return to READY');
console.log('  ✓ Dynamic module disable/enable lifecycle verified.\n');

console.log('════════════════════════════════════════════════════════════════════════');
console.log('🏆 ALL PLATFORM FOUNDATION MODULES CERTIFIED & READY FOR PRODUCTION');
console.log('════════════════════════════════════════════════════════════════════════\n');
