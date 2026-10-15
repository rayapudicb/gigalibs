// WI-OI-120ak (S4): the shapes the Communications screen reads from the Communications service. Types only; the
// in-memory store that used to hold invented channels, conversations and campaigns is removed (D2a).
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

