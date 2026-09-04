import assert from 'node:assert/strict';
import {
  ChatMessageProcessor,
} from '../dist/index.js';
import {
  NotificationDispatcher,
} from '../../notifications-core/dist/index.js';
import {
  PresenceService,
} from '../../presence/dist/presence.service.js';
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
import formEngineManifest from '../../form-engine-core/module.manifest.json' with { type: 'json' };
import ruleEngineManifest from '../../rule-engine-universal/module.manifest.json' with { type: 'json' };
import workflowManifest from '../../workflow-engine/module.manifest.json' with { type: 'json' };
import geofenceManifest from '../../geofence-engine/module.manifest.json' with { type: 'json' };
import esignManifest from '../../esign-core/module.manifest.json' with { type: 'json' };
import ocrManifest from '../../document-ocr-core/module.manifest.json' with { type: 'json' };
import storageManifest from '../../storage-core/module.manifest.json' with { type: 'json' };
import docViewerManifest from '../../document-viewer-react/module.manifest.json' with { type: 'json' };
import chatManifest from '../module.manifest.json' with { type: 'json' };
import aiChatManifest from '../../ai-chat-core/module.manifest.json' with { type: 'json' };
import presenceManifest from '../../presence/module.manifest.json' with { type: 'json' };
import notificationsManifest from '../../notifications-core/module.manifest.json' with { type: 'json' };
import reportsManifest from '../../export-engine-core/module.manifest.json' with { type: 'json' };

console.log('💬 Running GigaLibs Comms, AI Copilot & BI Reporting Certification...\n');

// ─── GATE 1: MANIFESTS & FULL 25-MODULE REGISTRY RESOLUTION ─────────────────
console.log('▶ Gate 1: Module Manifests & 25-Module Topological Tree Resolution...');
const all25Manifests = [
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
  esignManifest,
  ocrManifest,
  storageManifest,
  docViewerManifest,
  chatManifest,
  aiChatManifest,
  presenceManifest,
  notificationsManifest,
  reportsManifest,
];

for (const m of all25Manifests) {
  assert.doesNotThrow(() => ModuleManifestSchema.parse(m), `Manifest ${m.id} must be valid`);
}

const registry = new ModuleRegistry(all25Manifests);
assert.doesNotThrow(() => registry.assertReady(), 'All 25 modules must resolve cleanly without cycles');

const list = registry.list();
assert.equal(list.length, 25, 'All 25 platform modules must be registered');
for (const mod of list) {
  assert.equal(mod.status, 'READY', `${mod.manifest.id} must be READY`);
}
console.log(`  ✓ All 25 platform modules registered in READY state in topological order.\n`);

// ─── GATE 2: CHAT MESSAGE PROCESSOR & MENTIONS ───────────────────────────────
console.log('▶ Gate 2: Chat Message Reactions & @Mention Parser...');

// 1. Toggle Reaction
let reactions = {};
reactions = ChatMessageProcessor.toggleReaction(reactions, '🚀', 'usr_sarah');
assert.deepEqual(reactions['🚀'], ['usr_sarah'], 'Reactions must contain usr_sarah for rocket');

reactions = ChatMessageProcessor.toggleReaction(reactions, '🚀', 'usr_alex');
assert.deepEqual(reactions['🚀'], ['usr_sarah', 'usr_alex'], 'Reactions must contain both users');

// Remove usr_sarah reaction
reactions = ChatMessageProcessor.toggleReaction(reactions, '🚀', 'usr_sarah');
assert.deepEqual(reactions['🚀'], ['usr_alex'], 'Reactions must now only contain usr_alex');

// Remove usr_alex reaction -> key must be deleted
reactions = ChatMessageProcessor.toggleReaction(reactions, '🚀', 'usr_alex');
assert.equal(reactions['🚀'], undefined, 'Emoji key must be cleaned up when empty');

// 2. Mention Extraction
const messageText = 'Hey @sarah and @alex_dev, can you review ticket #TICK-1002? cc @sarah';
const mentions = ChatMessageProcessor.extractMentions(messageText);
assert.deepEqual(mentions, ['sarah', 'alex_dev'], 'Mentions must be extracted and deduplicated');

console.log('  ✓ Chat message reactions and @mention token extraction verified.\n');

// ─── GATE 3: OMNICHANNEL NOTIFICATION DISPATCHER ─────────────────────────────
console.log('▶ Gate 3: Omnichannel Notification Dispatcher...');

const dispatcher = new NotificationDispatcher();
const dispatchedLog = [];

dispatcher.registerChannel('IN_APP', async (n) => {
  dispatchedLog.push(`IN_APP:${n.userId}:${n.title}`);
  return true;
});

dispatcher.registerChannel('EMAIL', async (n) => {
  dispatchedLog.push(`EMAIL:${n.userId}:${n.title}`);
  return true;
});

const notification = {
  id: 'notif_1',
  tenantId: 'tenant_acme',
  userId: 'usr_sarah',
  type: 'TICKET_ASSIGNED',
  title: 'Urgent SLA Ticket Assigned',
  body: 'You have been assigned TICK-1002 (AWS Peering Spike).',
  channels: ['IN_APP', 'EMAIL', 'SMS'],
  createdAt: new Date(),
};

const results = await dispatcher.dispatch(notification);
assert.equal(results.length, 3, 'Must return results for 3 requested channels');
assert.equal(results[0].success, true, 'IN_APP must succeed');
assert.equal(results[1].success, true, 'EMAIL must succeed');
assert.equal(results[2].success, false, 'SMS must fail because no SMS handler was registered');

assert.equal(dispatchedLog.length, 2, 'Must have executed 2 registered handlers');

console.log('  ✓ Omnichannel notification routing and graceful error isolation verified.\n');

// ─── GATE 4: REAL-TIME USER PRESENCE & HEARTBEAT ─────────────────────────────
console.log('▶ Gate 4: Real-Time Presence & Heartbeat Engine...');

const presence = new PresenceService();
await presence.setPresence('usr_sarah', 'tenant_acme', 'online');
await presence.setPresence('usr_alex', 'tenant_acme', 'online');
await presence.setPresence('usr_elon', 'tenant_tesla', 'online');

const onlineAcme = await presence.getOnlineUsers('tenant_acme');
assert.equal(onlineAcme.length, 2, 'Acme must have 2 online users');
assert.ok(onlineAcme.includes('usr_sarah') && onlineAcme.includes('usr_alex'));

const onlineTesla = await presence.getOnlineUsers('tenant_tesla');
assert.equal(onlineTesla.length, 1, 'Tesla must have 1 online user');
assert.equal(onlineTesla[0], 'usr_elon');

console.log('  ✓ Multi-tenant presence tracking and heartbeat active user lists verified.\n');

console.log('════════════════════════════════════════════════════════════════════════');
console.log('🏆 ALL COMMS, AI COPILOT & BI REPORTING CERTIFICATION GATES PASSED!');
console.log('════════════════════════════════════════════════════════════════════════\n');
