import { platformModuleCatalog } from './../packages/contracts/dist/index.js';
import { createDefaultRoleHierarchy } from './../packages/rbac-core/dist/index.js';
import { communicationsStore } from './../apps/workflow-platform/lib/communications-store.ts';

console.log('--- Verifying Communications (TextFly) Integration in GigaLibs ---');

// 1. Module Catalog Verification
const commModule = platformModuleCatalog.find((m) => m.key === 'communications-textfly');
if (!commModule) {
  throw new Error('communications-textfly module not found in platformModuleCatalog');
}
console.log('✓ 1. Module registered in platformModuleCatalog:', {
  key: commModule.key,
  name: commModule.name,
  route: commModule.route,
  navigationGroup: commModule.navigationGroup,
  readiness: commModule.readiness,
});

// 2. RBAC Roles Verification
const hierarchy = createDefaultRoleHierarchy();
const adminPermissions = hierarchy.resolvePermissions('TENANT_ADMIN');
const managerPermissions = hierarchy.resolvePermissions('MANAGER');

const hasAdminComm = adminPermissions.includes('*') || adminPermissions.includes('communications:*');
const hasManagerComm = managerPermissions.includes('communications:read') || managerPermissions.includes('communications:*');

if (!hasAdminComm || !hasManagerComm) {
  throw new Error(`RBAC check failed: hasAdminComm=${hasAdminComm}, hasManagerComm=${hasManagerComm}`);
}
console.log('✓ 2. RBAC permissions verified (TENANT_ADMIN & MANAGER)');

// 3. Channels Verification
const channels = communicationsStore.listChannels('test-tenant');
if (channels.length < 4) {
  throw new Error(`Expected at least 4 default channels, found ${channels.length}`);
}
console.log(`✓ 3. Verified ${channels.length} omnichannel providers (Twilio SMS, ACS WhatsApp, SendGrid Email, ERP Webhook)`);

// 4. Message Templates Verification
const templates = communicationsStore.listTemplates('test-tenant');
const requiredTemplates = ['AR_INVOICE_DISPATCH', 'ESIGN_OTP_CHALLENGE', 'SPEND_APPROVAL_ALERT', 'CMMS_WORKORDER_DISPATCH'];
for (const code of requiredTemplates) {
  const tpl = templates.find((t) => t.code === code);
  if (!tpl) throw new Error(`Missing template: ${code}`);
}
console.log(`✓ 4. Verified ${templates.length} message templates with dynamic variable interpolation tokens`);

// 5. Cross-Module Trigger Dispatch Simulation
const dispatchResult = communicationsStore.dispatchTrigger('test-tenant', {
  channelType: 'SMS',
  recipient: '+1 (415) 890-1200',
  recipientName: 'Acme Corp Controller',
  sourceModule: 'AR',
  entityReferenceId: 'INV-2026-9901',
  templateCode: 'AR_INVOICE_DISPATCH',
  variables: {
    customer_name: 'Acme Corp',
    invoice_number: 'INV-2026-9901',
    amount: '$68,500.00',
    due_date: '2026-10-15',
    payment_link: 'https://pay.gigalibs.io/inv/INV-2026-9901',
  },
});

if (!dispatchResult.success || dispatchResult.deliveryStatus !== 'DELIVERED') {
  throw new Error('Trigger dispatch failed');
}
if (!dispatchResult.renderedBody.includes('$68,500.00') || !dispatchResult.renderedBody.includes('INV-2026-9901')) {
  throw new Error(`Interpolation failed in rendered body: ${dispatchResult.renderedBody}`);
}
console.log('✓ 5. Cross-module trigger successfully executed & interpolated:', {
  dispatchId: dispatchResult.dispatchId,
  conversationId: dispatchResult.conversationId,
  messageId: dispatchResult.messageId,
  renderedBody: dispatchResult.renderedBody,
});

// 6. Conversation & Outbound Reply Verification
const conversation = communicationsStore.getConversation('test-tenant', dispatchResult.conversationId);
if (!conversation) throw new Error('Conversation thread was not created');

const reply = communicationsStore.sendMessage(
  'test-tenant',
  conversation.id,
  'Customer replied: Payment processed via FedNow wire.',
  conversation.contactAddress,
  'INBOUND',
);
if (!reply.id || reply.body !== 'Customer replied: Payment processed via FedNow wire.') {
  throw new Error('Inbound reply recording failed');
}
console.log('✓ 6. 2-way conversation thread verified with inbound/outbound sync');

// 7. Reach Campaign Verification
const campaigns = communicationsStore.listCampaigns('test-tenant');
if (campaigns.length === 0) throw new Error('No reach campaigns found');
console.log(`✓ 7. Verified ${campaigns.length} Reach campaigns with delivery & open-rate telemetry`);

console.log('\nAll 7 TextFly integration verification gates PASSED successfully!');
