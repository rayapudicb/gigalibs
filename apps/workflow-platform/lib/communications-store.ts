import { randomUUID } from 'node:crypto';

export type ChannelType = 'SMS' | 'WHATSAPP' | 'EMAIL' | 'WEBHOOK';
export type ChannelProvider = 'TWILIO' | 'AZURE_COMMUNICATION_SERVICES' | 'SMTP_SENDGRID' | 'CUSTOM_WEBHOOK';
export type ChannelStatus = 'ACTIVE' | 'PAUSED' | 'TESTING';

export interface ChannelConfig {
  id: string;
  tenantId: string;
  name: string;
  type: ChannelType;
  provider: ChannelProvider;
  status: ChannelStatus;
  senderAddress: string;
  isDefault: boolean;
  webhookUrl?: string;
  deliverySuccessRate: number;
  updatedAt: string;
}

export type ConversationStatus = 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED';

export interface Conversation {
  id: string;
  tenantId: string;
  channelId: string;
  channelType: ChannelType;
  contactName: string;
  contactAddress: string;
  subject: string;
  preview: string;
  status: ConversationStatus;
  unreadCount: number;
  lastMessageAt: string;
  tags: string[];
  sourceModule: 'AR' | 'ESIGN' | 'SPEND' | 'CMMS' | 'DIRECT';
  entityReferenceId?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  tenantId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  channelType: ChannelType;
  sender: string;
  recipient: string;
  body: string;
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'READ';
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface MessageTemplate {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  channelType: ChannelType;
  bodyTemplate: string;
  variables: string[];
  category: 'FINANCIAL' | 'SECURITY' | 'OPERATIONS' | 'MARKETING';
  active: boolean;
  updatedAt: string;
}

export interface ReachCampaign {
  id: string;
  tenantId: string;
  name: string;
  channelType: ChannelType;
  audienceCount: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  openRate: number;
  status: 'DRAFT' | 'RUNNING' | 'COMPLETED';
  createdAt: string;
}

export interface TriggerDispatchPayload {
  channelType: ChannelType;
  recipient: string;
  recipientName: string;
  sourceModule: 'AR' | 'ESIGN' | 'SPEND' | 'CMMS' | 'DIRECT';
  entityReferenceId: string;
  subject?: string;
  templateCode?: string;
  customBody?: string;
  variables?: Record<string, string>;
}

export interface TriggerDispatchResult {
  success: boolean;
  dispatchId: string;
  conversationId: string;
  messageId: string;
  channelType: ChannelType;
  recipient: string;
  deliveryStatus: 'SENT' | 'DELIVERED';
  renderedBody: string;
  timestamp: string;
}

class CommunicationsStore {
  private channels: Map<string, ChannelConfig[]> = new Map();
  private conversations: Map<string, Conversation[]> = new Map();
  private messages: Map<string, Message[]> = new Map();
  private templates: Map<string, MessageTemplate[]> = new Map();
  private campaigns: Map<string, ReachCampaign[]> = new Map();

  constructor() {
    this.seedDefaults('default');
  }

  private seedDefaults(tenantId: string) {
    const ch1: ChannelConfig = {
      id: 'ch-twilio-sms-01',
      tenantId,
      name: 'Twilio Toll-Free SMS Primary',
      type: 'SMS',
      provider: 'TWILIO',
      status: 'ACTIVE',
      senderAddress: '+1 (855) 444-2542',
      isDefault: true,
      deliverySuccessRate: 99.4,
      updatedAt: '2026-09-13T10:00:00Z',
    };
    const ch2: ChannelConfig = {
      id: 'ch-acs-whatsapp-02',
      tenantId,
      name: 'Azure ACS WhatsApp Business',
      type: 'WHATSAPP',
      provider: 'AZURE_COMMUNICATION_SERVICES',
      status: 'ACTIVE',
      senderAddress: '+1 (800) 902-1144',
      isDefault: true,
      deliverySuccessRate: 98.7,
      updatedAt: '2026-09-13T10:15:00Z',
    };
    const ch3: ChannelConfig = {
      id: 'ch-sendgrid-email-03',
      tenantId,
      name: 'SendGrid Enterprise Mail Gateway',
      type: 'EMAIL',
      provider: 'SMTP_SENDGRID',
      status: 'ACTIVE',
      senderAddress: 'notifications@gigalibs.io',
      isDefault: true,
      deliverySuccessRate: 99.8,
      updatedAt: '2026-09-13T11:00:00Z',
    };
    const ch4: ChannelConfig = {
      id: 'ch-webhook-04',
      tenantId,
      name: 'ERP Event Webhook Receiver',
      type: 'WEBHOOK',
      provider: 'CUSTOM_WEBHOOK',
      status: 'ACTIVE',
      senderAddress: 'https://api.gigalibs.io/v1/webhooks/incoming',
      isDefault: false,
      deliverySuccessRate: 100.0,
      updatedAt: '2026-09-13T11:30:00Z',
    };
    this.channels.set(tenantId, [ch1, ch2, ch3, ch4]);

    const tpl1: MessageTemplate = {
      id: 'tpl-ar-01',
      tenantId,
      name: 'Accounts Receivable Invoice Notice',
      code: 'AR_INVOICE_DISPATCH',
      channelType: 'SMS',
      bodyTemplate: 'Dear {{customer_name}}, invoice {{invoice_number}} for {{amount}} is due on {{due_date}}. View and remit payment securely: {{payment_link}}',
      variables: ['customer_name', 'invoice_number', 'amount', 'due_date', 'payment_link'],
      category: 'FINANCIAL',
      active: true,
      updatedAt: '2026-09-13T12:00:00Z',
    };
    const tpl2: MessageTemplate = {
      id: 'tpl-esign-02',
      tenantId,
      name: 'E-Signature Cryptographic OTP',
      code: 'ESIGN_OTP_CHALLENGE',
      channelType: 'SMS',
      bodyTemplate: 'Your GigaLibs authentication OTP for document {{document_number}} is {{otp_code}}. Expires in 10 minutes. Do not disclose.',
      variables: ['document_number', 'otp_code'],
      category: 'SECURITY',
      active: true,
      updatedAt: '2026-09-13T12:10:00Z',
    };
    const tpl3: MessageTemplate = {
      id: 'tpl-spend-03',
      tenantId,
      name: 'Spend PO Authorization Alert',
      code: 'SPEND_APPROVAL_ALERT',
      channelType: 'EMAIL',
      bodyTemplate: 'Purchase Order {{po_number}} for {{vendor_name}} (${{amount}}) is pending your immediate executive sign-off. Review: {{approval_link}}',
      variables: ['po_number', 'vendor_name', 'amount', 'approval_link'],
      category: 'OPERATIONS',
      active: true,
      updatedAt: '2026-09-13T12:20:00Z',
    };
    const tpl4: MessageTemplate = {
      id: 'tpl-cmms-04',
      tenantId,
      name: 'CMMS Work Order Dispatched',
      code: 'CMMS_WORKORDER_DISPATCH',
      channelType: 'WHATSAPP',
      bodyTemplate: 'Work Order {{work_order_number}} [{{priority}}] assigned for {{asset_tag}} at {{location}}. Task checklist: {{task_link}}',
      variables: ['work_order_number', 'priority', 'asset_tag', 'location', 'task_link'],
      category: 'OPERATIONS',
      active: true,
      updatedAt: '2026-09-13T12:30:00Z',
    };
    this.templates.set(tenantId, [tpl1, tpl2, tpl3, tpl4]);

    const conv1: Conversation = {
      id: 'conv-001',
      tenantId,
      channelId: ch1.id,
      channelType: 'SMS',
      contactName: 'Sarah Jenkins (Acme Corp)',
      contactAddress: '+1 (415) 890-1200',
      subject: 'Invoice INV-2026-0042 Inquiries',
      preview: 'Thank you, we received the updated invoice link. Processing payment today.',
      status: 'RESOLVED',
      unreadCount: 0,
      lastMessageAt: '2026-09-13T14:22:00Z',
      tags: ['AR', 'High-Value', 'Payment-Confirmed'],
      sourceModule: 'AR',
      entityReferenceId: 'INV-2026-0042',
    };
    const conv2: Conversation = {
      id: 'conv-002',
      tenantId,
      channelId: ch1.id,
      channelType: 'SMS',
      contactName: 'Marcus Vance (Global Logistics)',
      contactAddress: '+1 (206) 555-8833',
      subject: 'Cryptographic OTP for Contract MSA-2026-09',
      preview: 'Your GigaLibs authentication OTP for document MSA-2026-09 is 894120.',
      status: 'OPEN',
      unreadCount: 1,
      lastMessageAt: '2026-09-13T15:10:00Z',
      tags: ['E-Sign', 'Security', 'OTP'],
      sourceModule: 'ESIGN',
      entityReferenceId: 'MSA-2026-09',
    };
    const conv3: Conversation = {
      id: 'conv-003',
      tenantId,
      channelId: ch2.id,
      channelType: 'WHATSAPP',
      contactName: 'Dave Cooper (Lead Technician)',
      contactAddress: '+1 (512) 981-4477',
      subject: 'Turbine Vibration Alarm WO-7821',
      preview: 'Acknowledged. Vibration sensor recalibrated on Turbine Generator 04.',
      status: 'OPEN',
      unreadCount: 0,
      lastMessageAt: '2026-09-13T15:45:00Z',
      tags: ['CMMS', 'Critical', 'Equipment-Alert'],
      sourceModule: 'CMMS',
      entityReferenceId: 'WO-7821',
    };
    this.conversations.set(tenantId, [conv1, conv2, conv3]);

    const msg1: Message = {
      id: 'msg-001',
      conversationId: 'conv-001',
      tenantId,
      direction: 'OUTBOUND',
      channelType: 'SMS',
      sender: ch1.senderAddress,
      recipient: conv1.contactAddress,
      body: 'Dear Sarah Jenkins (Acme Corp), invoice INV-2026-0042 for $42,500.00 is due on 2026-09-30. View and remit payment securely: https://pay.gigalibs.io/inv/INV-2026-0042',
      status: 'DELIVERED',
      timestamp: '2026-09-13T14:15:00Z',
    };
    const msg2: Message = {
      id: 'msg-002',
      conversationId: 'conv-001',
      tenantId,
      direction: 'INBOUND',
      channelType: 'SMS',
      sender: conv1.contactAddress,
      recipient: ch1.senderAddress,
      body: 'Thank you, we received the updated invoice link. Processing payment today.',
      status: 'READ',
      timestamp: '2026-09-13T14:22:00Z',
    };
    const msg3: Message = {
      id: 'msg-003',
      conversationId: 'conv-002',
      tenantId,
      direction: 'OUTBOUND',
      channelType: 'SMS',
      sender: ch1.senderAddress,
      recipient: conv2.contactAddress,
      body: 'Your GigaLibs authentication OTP for document MSA-2026-09 is 894120. Expires in 10 minutes. Do not disclose.',
      status: 'DELIVERED',
      timestamp: '2026-09-13T15:10:00Z',
    };
    const msg4: Message = {
      id: 'msg-004',
      conversationId: 'conv-003',
      tenantId,
      direction: 'OUTBOUND',
      channelType: 'WHATSAPP',
      sender: ch2.senderAddress,
      recipient: conv3.contactAddress,
      body: 'Work Order WO-7821 [CRITICAL] assigned for Turbine Generator 04 at Sector 7 Plant. Task checklist: https://ops.gigalibs.io/cmms/wo-7821',
      status: 'DELIVERED',
      timestamp: '2026-09-13T15:40:00Z',
    };
    const msg5: Message = {
      id: 'msg-005',
      conversationId: 'conv-003',
      tenantId,
      direction: 'INBOUND',
      channelType: 'WHATSAPP',
      sender: conv3.contactAddress,
      recipient: ch2.senderAddress,
      body: 'Acknowledged. Vibration sensor recalibrated on Turbine Generator 04.',
      status: 'READ',
      timestamp: '2026-09-13T15:45:00Z',
    };
    this.messages.set(tenantId, [msg1, msg2, msg3, msg4, msg5]);

    const cmp1: ReachCampaign = {
      id: 'cmp-001',
      tenantId,
      name: 'Q3 Enterprise AR Dunning Blast',
      channelType: 'SMS',
      audienceCount: 142,
      sentCount: 142,
      deliveredCount: 139,
      failedCount: 3,
      openRate: 94.2,
      status: 'COMPLETED',
      createdAt: '2026-09-12T09:00:00Z',
    };
    const cmp2: ReachCampaign = {
      id: 'cmp-002',
      tenantId,
      name: 'Global Vendor Portal 2FA Migration',
      channelType: 'EMAIL',
      audienceCount: 520,
      sentCount: 520,
      deliveredCount: 516,
      failedCount: 4,
      openRate: 88.5,
      status: 'COMPLETED',
      createdAt: '2026-09-13T08:30:00Z',
    };
    this.campaigns.set(tenantId, [cmp1, cmp2]);
  }

  private ensureTenant(tenantId: string) {
    if (!this.channels.has(tenantId)) {
      this.seedDefaults(tenantId);
    }
  }

  public listChannels(tenantId: string): ChannelConfig[] {
    this.ensureTenant(tenantId);
    return this.channels.get(tenantId) || [];
  }

  public createChannel(tenantId: string, input: Partial<ChannelConfig>): ChannelConfig {
    this.ensureTenant(tenantId);
    const channels = this.channels.get(tenantId) || [];
    const newChan: ChannelConfig = {
      id: `ch-${randomUUID().slice(0, 8)}`,
      tenantId,
      name: input.name || 'New Communications Channel',
      type: input.type || 'SMS',
      provider: input.provider || 'TWILIO',
      status: input.status || 'ACTIVE',
      senderAddress: input.senderAddress || '+1 (800) 555-0100',
      isDefault: Boolean(input.isDefault),
      webhookUrl: input.webhookUrl,
      deliverySuccessRate: 100.0,
      updatedAt: new Date().toISOString(),
    };
    channels.push(newChan);
    this.channels.set(tenantId, channels);
    return newChan;
  }

  public listConversations(tenantId: string): Conversation[] {
    this.ensureTenant(tenantId);
    return (this.conversations.get(tenantId) || []).sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
    );
  }

  public getConversation(tenantId: string, id: string): Conversation | undefined {
    this.ensureTenant(tenantId);
    return (this.conversations.get(tenantId) || []).find((c) => c.id === id);
  }

  public listMessages(tenantId: string, conversationId?: string): Message[] {
    this.ensureTenant(tenantId);
    const all = this.messages.get(tenantId) || [];
    if (!conversationId) return all;
    return all
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  public sendMessage(
    tenantId: string,
    conversationId: string,
    body: string,
    sender: string,
    direction: 'INBOUND' | 'OUTBOUND' = 'OUTBOUND',
  ): Message {
    this.ensureTenant(tenantId);
    const conv = this.getConversation(tenantId, conversationId);
    const newMsg: Message = {
      id: `msg-${randomUUID().slice(0, 8)}`,
      conversationId,
      tenantId,
      direction,
      channelType: conv ? conv.channelType : 'SMS',
      sender,
      recipient: conv ? conv.contactAddress : 'Target',
      body,
      status: 'DELIVERED',
      timestamp: new Date().toISOString(),
    };
    const msgs = this.messages.get(tenantId) || [];
    msgs.push(newMsg);
    this.messages.set(tenantId, msgs);

    if (conv) {
      conv.preview = body;
      conv.lastMessageAt = newMsg.timestamp;
      conv.status = 'OPEN';
    }
    return newMsg;
  }

  public listTemplates(tenantId: string): MessageTemplate[] {
    this.ensureTenant(tenantId);
    return this.templates.get(tenantId) || [];
  }

  public createTemplate(tenantId: string, input: Partial<MessageTemplate>): MessageTemplate {
    this.ensureTenant(tenantId);
    const templates = this.templates.get(tenantId) || [];
    const tpl: MessageTemplate = {
      id: `tpl-${randomUUID().slice(0, 8)}`,
      tenantId,
      name: input.name || 'Untitled Template',
      code: input.code || `TPL_${Date.now()}`,
      channelType: input.channelType || 'SMS',
      bodyTemplate: input.bodyTemplate || '',
      variables: input.variables || [],
      category: input.category || 'OPERATIONS',
      active: true,
      updatedAt: new Date().toISOString(),
    };
    templates.push(tpl);
    this.templates.set(tenantId, templates);
    return tpl;
  }

  public listCampaigns(tenantId: string): ReachCampaign[] {
    this.ensureTenant(tenantId);
    return this.campaigns.get(tenantId) || [];
  }

  public createCampaign(tenantId: string, input: Partial<ReachCampaign>): ReachCampaign {
    this.ensureTenant(tenantId);
    const campaigns = this.campaigns.get(tenantId) || [];
    const audience = input.audienceCount || 100;
    const cmp: ReachCampaign = {
      id: `cmp-${randomUUID().slice(0, 8)}`,
      tenantId,
      name: input.name || 'New Reach Campaign',
      channelType: input.channelType || 'SMS',
      audienceCount: audience,
      sentCount: audience,
      deliveredCount: Math.floor(audience * 0.98),
      failedCount: Math.ceil(audience * 0.02),
      openRate: 91.5,
      status: 'COMPLETED',
      createdAt: new Date().toISOString(),
    };
    campaigns.push(cmp);
    this.campaigns.set(tenantId, campaigns);
    return cmp;
  }

  public dispatchTrigger(tenantId: string, payload: TriggerDispatchPayload): TriggerDispatchResult {
    this.ensureTenant(tenantId);
    const channels = this.listChannels(tenantId);
    const channel = channels.find((c) => c.type === payload.channelType && c.status === 'ACTIVE') || channels[0];

    // Check if template requested
    let renderedBody = payload.customBody || '';
    if (payload.templateCode) {
      const tpls = this.listTemplates(tenantId);
      const tpl = tpls.find((t) => t.code === payload.templateCode);
      if (tpl) {
        renderedBody = tpl.bodyTemplate;
        if (payload.variables) {
          for (const [k, v] of Object.entries(payload.variables)) {
            renderedBody = renderedBody.replaceAll(`{{${k}}}`, v);
          }
        }
      }
    }

    // Find or create conversation
    const conversations = this.conversations.get(tenantId) || [];
    let conv = conversations.find((c) => c.entityReferenceId === payload.entityReferenceId);
    if (!conv) {
      conv = {
        id: `conv-${randomUUID().slice(0, 8)}`,
        tenantId,
        channelId: channel?.id || 'ch-01',
        channelType: payload.channelType,
        contactName: payload.recipientName,
        contactAddress: payload.recipient,
        subject: payload.subject || `${payload.sourceModule} Alert: ${payload.entityReferenceId}`,
        preview: renderedBody,
        status: 'OPEN',
        unreadCount: 0,
        lastMessageAt: new Date().toISOString(),
        tags: [payload.sourceModule, 'Cross-Module-Trigger'],
        sourceModule: payload.sourceModule,
        entityReferenceId: payload.entityReferenceId,
      };
      conversations.unshift(conv);
      this.conversations.set(tenantId, conversations);
    }

    // Append outbound message
    const msg = this.sendMessage(tenantId, conv.id, renderedBody, channel?.senderAddress || 'GigaLibs', 'OUTBOUND');

    return {
      success: true,
      dispatchId: `disp-${randomUUID()}`,
      conversationId: conv.id,
      messageId: msg.id,
      channelType: payload.channelType,
      recipient: payload.recipient,
      deliveryStatus: 'DELIVERED',
      renderedBody,
      timestamp: msg.timestamp,
    };
  }
}

export const communicationsStore = new CommunicationsStore();
