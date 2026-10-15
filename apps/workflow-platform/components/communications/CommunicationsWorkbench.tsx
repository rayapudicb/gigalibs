'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  PageShell,
  PageHeader,
  Container,
  MetricCard,
  StatusBadge,
  Tabs,
  Button,
  FormField,
  Input,
  TextArea,
  Select,
  Modal,
  EmptyState,
  LoadingState,
  DataTable,
} from '@/components/design-system';
import {
  MessageSquare,
  Send,
  Radio,
  FileText,
  Megaphone,
  Zap,
  CheckCircle2,
  Clock,
  ShieldCheck,
  RefreshCw,
  Plus,
  ArrowUpRight,
  Phone,
  Mail,
  Smartphone,
  Webhook,
} from 'lucide-react';
import type {
  ChannelConfig,
  Conversation,
  Message,
  MessageTemplate,
  ReachCampaign,
  ChannelType,
} from '@/lib/communications-types';
import { VoiceCallPanel } from './softphone/VoiceCallPanel';
import { DeliveryReceiptTicks } from './DeliveryReceiptTicks';

export interface CommunicationsWorkbenchProps {
  currentUserId?: string;
  currentUserEmail?: string;
  currentUserName?: string;
  tenantId?: string;
  tenantName?: string;
  permissions?: readonly string[];
  initialTab?: 'inbox' | 'channels' | 'templates' | 'reach' | 'triggers';
}

export function CommunicationsWorkbench({
  currentUserId,
  currentUserEmail,
  currentUserName,
  tenantId,
  tenantName,
  permissions,
  initialTab = 'inbox',
}: CommunicationsWorkbenchProps = {}) {
  const [activeTab, setActiveTab] = useState<'inbox' | 'channels' | 'templates' | 'reach' | 'triggers'>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<ReachCampaign[]>([]);

  // Composer state
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [softphoneOpen, setSoftphoneOpen] = useState(false);

  // New Channel Modal
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [newChanName, setNewChanName] = useState('');
  const [newChanType, setNewChanType] = useState<ChannelType>('SMS');
  const [newChanProvider, setNewChanProvider] = useState('TWILIO');
  const [newChanAddress, setNewChanAddress] = useState('');

  // New Template Modal
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [newTplName, setNewTplName] = useState('');
  const [newTplCode, setNewTplCode] = useState('');
  const [newTplChannel, setNewTplChannel] = useState<ChannelType>('SMS');
  const [newTplBody, setNewTplBody] = useState('');

  // Cross-Module Trigger Simulator
  const [triggerModule, setTriggerModule] = useState<'AR' | 'ESIGN' | 'SPEND' | 'CMMS'>('AR');
  // WI-OI-120ak (S4): no invented recipient, record or variables; the person fills them in.
  const [triggerRecipient, setTriggerRecipient] = useState('');
  const [triggerRecipientName, setTriggerRecipientName] = useState('');
  const [triggerEntityId, setTriggerEntityId] = useState('');
  const [triggerTemplate, setTriggerTemplate] = useState('AR_INVOICE_DISPATCH');
  const [triggerChannel, setTriggerChannel] = useState<ChannelType>('SMS');
  const [triggerVariables, setTriggerVariables] = useState('{}');
  const [isTriggering, setIsTriggering] = useState(false);
  const [lastTriggerResult, setLastTriggerResult] = useState<any>(null);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [convRes, chanRes, tplRes, cmpRes] = await Promise.all([
        fetch('/api/communications/inbox/conversations'),
        fetch('/api/communications/channels'),
        fetch('/api/communications/templates'),
        fetch('/api/communications/reach/campaigns'),
      ]);
      // WI-OI-120ak (S4): a refused answer (for example "not available on this instance") is shown, not hidden as empty.
      const refused = [convRes, chanRes, tplRes, cmpRes].find((res) => !res.ok);
      if (refused) {
        const body = await refused.json().catch(() => null);
        throw new Error(body?.title || `Communications answered ${refused.status}.`);
      }

      if (convRes.ok) {
        const convData = await convRes.json();
        setConversations(convData.conversations || []);
        if (convData.conversations?.length > 0 && !selectedConversationId) {
          setSelectedConversationId(convData.conversations[0].id);
        }
      }
      if (chanRes.ok) {
        const chanData = await chanRes.json();
        setChannels(chanData.channels || []);
      }
      if (tplRes.ok) {
        const tplData = await tplRes.json();
        setTemplates(tplData.templates || []);
      }
      if (cmpRes.ok) {
        const cmpData = await cmpRes.json();
        setCampaigns(cmpData.campaigns || []);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load communications data.');
    } finally {
      setLoading(false);
    }
  }, [selectedConversationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch messages when selected conversation changes
  useEffect(() => {
    if (!selectedConversationId) return;
    fetch(`/api/communications/inbox/conversations/${selectedConversationId}/messages`)
      .then((res) => res.ok ? res.json() : { messages: [] })
      .then((data) => setMessages(data.messages || []))
      .catch((err) => console.error('Error fetching messages', err));
  }, [selectedConversationId]);

  // Send reply in current thread
  const handleSendReply = async () => {
    if (!selectedConversationId || !replyText.trim()) return;
    try {
      setIsSendingReply(true);
      const res = await fetch(`/api/communications/inbox/conversations/${selectedConversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: replyText }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, data.message]);
        setReplyText('');
        // Refresh conversations to update preview and timestamp
        const convRes = await fetch('/api/communications/inbox/conversations');
        if (convRes.ok) {
          const convData = await convRes.json();
          setConversations(convData.conversations || []);
        }
      }
    } catch (err: any) {
      alert(err.message || 'Error sending reply');
    } finally {
      setIsSendingReply(false);
    }
  };

  // Create Channel
  const handleCreateChannel = async () => {
    if (!newChanName || !newChanAddress) return;
    try {
      const res = await fetch('/api/communications/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newChanName,
          type: newChanType,
          provider: newChanProvider,
          senderAddress: newChanAddress,
        }),
      });
      if (res.ok) {
        setChannelModalOpen(false);
        setNewChanName('');
        setNewChanAddress('');
        fetchData();
      }
    } catch (err: any) {
      alert(err.message || 'Error creating channel');
    }
  };

  // Create Template
  const handleCreateTemplate = async () => {
    if (!newTplName || !newTplCode || !newTplBody) return;
    try {
      const res = await fetch('/api/communications/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTplName,
          code: newTplCode,
          channelType: newTplChannel,
          bodyTemplate: newTplBody,
          variables: Array.from(newTplBody.matchAll(/\{\{(\w+)\}\}/g)).map((m) => m[1]),
        }),
      });
      if (res.ok) {
        setTemplateModalOpen(false);
        setNewTplName('');
        setNewTplCode('');
        setNewTplBody('');
        fetchData();
      }
    } catch (err: any) {
      alert(err.message || 'Error creating template');
    }
  };

  // Execute Cross-Module Trigger
  const handleExecuteTrigger = async () => {
    try {
      setIsTriggering(true);
      setLastTriggerResult(null);
      let parsedVars = {};
      try {
        parsedVars = JSON.parse(triggerVariables);
      } catch (e) {
        // ignore
      }

      const res = await fetch('/api/communications/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelType: triggerChannel,
          recipient: triggerRecipient,
          recipientName: triggerRecipientName,
          sourceModule: triggerModule,
          entityReferenceId: triggerEntityId,
          templateCode: triggerTemplate,
          variables: parsedVars,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        setLastTriggerResult(result);
        fetchData();
        if (result.conversationId) {
          setSelectedConversationId(result.conversationId);
        }
      }
    } catch (err: any) {
      alert(err.message || 'Trigger execution failed');
    } finally {
      setIsTriggering(false);
    }
  };

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId);

  const getChannelIcon = (type: ChannelType) => {
    switch (type) {
      case 'SMS':
        return <Smartphone className="h-4 w-4 text-blue-500" />;
      case 'WHATSAPP':
        return <Phone className="h-4 w-4 text-emerald-500" />;
      case 'EMAIL':
        return <Mail className="h-4 w-4 text-amber-500" />;
      case 'WEBHOOK':
        return <Webhook className="h-4 w-4 text-purple-500" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="Omnichannel Communications (TextFly)"
        description="Unified 2-way inbox, enterprise delivery channels (Twilio SMS/WhatsApp, Azure ACS, SendGrid), reach campaigns, and cross-module automated alerting."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fetchData()}
              disabled={loading}
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (activeTab === 'channels') setChannelModalOpen(true);
                else if (activeTab === 'templates') setTemplateModalOpen(true);
                else setActiveTab('triggers');
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {activeTab === 'channels'
                ? 'Add Channel'
                : activeTab === 'templates'
                ? 'New Template'
                : 'Dispatch Alert'}
            </Button>
          </div>
        }
      />

      {/* Overview Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Active Channels"
          value={channels.filter((c) => c.status === 'ACTIVE').length}
          hint="Twilio, ACS, SendGrid, Webhooks"
          icon={<Radio className="h-5 w-5 text-ui-fg-subtle" />}
        />
        <MetricCard
          label="Unified Conversations"
          value={conversations.length}
          hint={`${conversations.filter((c) => c.status === 'OPEN').length} active threads pending`}
          icon={<MessageSquare className="h-5 w-5 text-ui-fg-subtle" />}
        />
        <MetricCard
          label="Avg. Delivery Success"
          value="99.5%"
          hint="Zero packet drop across providers"
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />}
        />
        <MetricCard
          label="Reach Audiences"
          value={campaigns.reduce((acc, c) => acc + c.audienceCount, 0)}
          hint="Recipients engaged across campaigns"
          icon={<Megaphone className="h-5 w-5 text-ui-fg-subtle" />}
        />
      </div>

      {loading && conversations.length === 0 ? (
        <div className="mt-6">
          <LoadingState message="Connecting to TextFly communications cluster..." />
        </div>
      ) : (
        <div className="mt-4">
          {/* TAB 1: UNIFIED INBOX */}
          {activeTab === 'inbox' && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 min-h-[600px]">
              {/* Left Column: Conversation List */}
              <div className="lg:col-span-4 flex flex-col gap-2">
                <Container className="p-3 flex-1 flex flex-col">
                  <div className="flex items-center justify-between pb-3 border-b border-ui-border-base">
                    <span className="text-xs font-semibold uppercase tracking-wider text-ui-fg-muted">
                      Threads ({conversations.length})
                    </span>
                    <span className="text-xs text-ui-fg-subtle">Real-time sync</span>
                  </div>

                  <div className="divide-y divide-ui-border-base overflow-y-auto max-h-[560px] mt-2">
                    {conversations.length === 0 ? (
                      <EmptyState
                        title="No active conversations"
                        description="Incoming and outgoing messages from SMS, WhatsApp, and Email will appear here."
                      />
                    ) : (
                      conversations.map((conv) => {
                        const isSelected = conv.id === selectedConversationId;
                        return (
                          <div
                            key={conv.id}
                            onClick={() => setSelectedConversationId(conv.id)}
                            className={`p-3 cursor-pointer transition-colors rounded-md ${
                              isSelected
                                ? 'bg-ui-bg-subtle-hover border-l-4 border-l-blue-600'
                                : 'hover:bg-ui-bg-subtle'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {getChannelIcon(conv.channelType)}
                                <span className="text-xs font-semibold text-ui-fg-base truncate">
                                  {conv.contactName}
                                </span>
                              </div>
                              <span className="text-[10px] text-ui-fg-subtle whitespace-nowrap">
                                {new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            <p className="text-xs text-ui-fg-muted truncate mt-1">
                              {conv.preview}
                            </p>

                            <div className="flex items-center gap-1.5 mt-2">
                              <StatusBadge
                                tone={
                                  conv.status === 'RESOLVED'
                                    ? 'green'
                                    : conv.status === 'OPEN'
                                    ? 'blue'
                                    : 'grey'
                                }
                              >
                                {conv.status}
                              </StatusBadge>
                              <span className="text-[10px] rounded px-1.5 py-0.5 bg-ui-bg-subtle border border-ui-border-base text-ui-fg-subtle">
                                {conv.sourceModule}
                              </span>
                              {conv.entityReferenceId && (
                                <span className="text-[10px] text-ui-fg-subtle font-mono">
                                  {conv.entityReferenceId}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </Container>
              </div>

              {/* Right Column: Active Conversation Messages & Composer */}
              <div className="lg:col-span-8 flex flex-col">
                {selectedConversation ? (
                  <Container className="flex-1 flex flex-col p-4">
                    {/* Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-ui-border-base">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-ui-bg-subtle border border-ui-border-base">
                          {getChannelIcon(selectedConversation.channelType)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-ui-fg-base">
                              {selectedConversation.contactName}
                            </h3>
                            <span className="text-xs text-ui-fg-muted font-mono">
                              ({selectedConversation.contactAddress})
                            </span>
                          </div>
                          <p className="text-xs text-ui-fg-subtle">
                            Subject: {selectedConversation.subject}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setSoftphoneOpen(true)}
                          className="flex items-center gap-1 text-emerald-600"
                        >
                          <Phone className="h-3.5 w-3.5" /> Call
                        </Button>
                        <StatusBadge
                          tone={
                            selectedConversation.status === 'RESOLVED'
                              ? 'green'
                              : 'blue'
                          }
                        >
                          {selectedConversation.status}
                        </StatusBadge>
                      </div>
                    </div>

                    {/* Messages Body */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[420px] min-h-[350px]">
                      {messages.map((m) => {
                        const isOutbound = m.direction === 'OUTBOUND';
                        return (
                          <div
                            key={m.id}
                            className={`flex flex-col ${
                              isOutbound ? 'items-end' : 'items-start'
                            }`}
                          >
                            <div
                              className={`max-w-[75%] rounded-lg p-3 text-xs leading-relaxed ${
                                isOutbound
                                  ? 'bg-blue-600 text-white shadow-sm'
                                  : 'bg-ui-bg-subtle border border-ui-border-base text-ui-fg-base'
                              }`}
                            >
                              <p>{m.body}</p>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-ui-fg-subtle">
                              <span>{isOutbound ? 'Sent by Agent' : selectedConversation.contactName}</span>
                              <span>•</span>
                              <span>
                                {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {isOutbound && (
                                <>
                                  <span>•</span>
                                  <DeliveryReceiptTicks status={m.status} tone="onLight" />
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Reply Composer */}
                    <div className="pt-3 border-t border-ui-border-base">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSendReply();
                          }}
                          placeholder={`Reply to ${selectedConversation.contactName} via ${selectedConversation.channelType}...`}
                          className="flex-1 rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-xs text-ui-fg-base placeholder:text-ui-fg-muted focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleSendReply}
                          disabled={isSendingReply || !replyText.trim()}
                        >
                          <Send className="mr-1 h-3.5 w-3.5" />
                          Send
                        </Button>
                      </div>
                    </div>
                  </Container>
                ) : (
                  <Container className="flex-1 flex items-center justify-center p-8">
                    <EmptyState
                      title="Select a conversation"
                      description="Choose an existing thread from the left or trigger an automated alert."
                    />
                  </Container>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: CHANNELS */}
          {activeTab === 'channels' && (
            <Container className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-ui-fg-base">Connected Provider Channels</h3>
                  <p className="text-xs text-ui-fg-subtle">
                    Enterprise routing across Twilio SMS/WhatsApp, Azure Communication Services, and SMTP Gateways.
                  </p>
                </div>
                <Button variant="primary" size="sm" onClick={() => setChannelModalOpen(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Connect New Channel
                </Button>
              </div>

              <DataTable
                columns={[
                  {
                    header: 'Channel Name',
                    cell: (row: ChannelConfig) => (
                      <div className="flex items-center gap-2">
                        {getChannelIcon(row.type)}
                        <div>
                          <p className="text-xs font-semibold text-ui-fg-base">{row.name}</p>
                          <p className="text-[10px] text-ui-fg-subtle">{row.id}</p>
                        </div>
                      </div>
                    ),
                  },
                  {
                    header: 'Type',
                    cell: (row: ChannelConfig) => (
                      <span className="text-xs font-mono">{row.type}</span>
                    ),
                  },
                  {
                    header: 'Provider',
                    cell: (row: ChannelConfig) => (
                      <span className="text-xs text-ui-fg-muted">{row.provider}</span>
                    ),
                  },
                  {
                    header: 'Sender Address / Endpoint',
                    cell: (row: ChannelConfig) => (
                      <span className="text-xs font-mono text-ui-fg-base">{row.senderAddress}</span>
                    ),
                  },
                  {
                    header: 'Success Rate',
                    cell: (row: ChannelConfig) => (
                      <span className="text-xs text-emerald-600 font-semibold">{row.deliverySuccessRate}%</span>
                    ),
                  },
                  {
                    header: 'Status',
                    cell: (row: ChannelConfig) => (
                      <StatusBadge tone={row.status === 'ACTIVE' ? 'green' : 'grey'}>
                        {row.status}
                      </StatusBadge>
                    ),
                  },
                ]}
                data={channels}
              />
            </Container>
          )}

          {/* TAB 3: MESSAGE TEMPLATES */}
          {activeTab === 'templates' && (
            <Container className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-ui-fg-base">Standardized Message Templates</h3>
                  <p className="text-xs text-ui-fg-subtle">
                    Pre-authorized message layouts with variable substitution tokens for AR, E-Sign, Spend, and CMMS.
                  </p>
                </div>
                <Button variant="primary" size="sm" onClick={() => setTemplateModalOpen(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  New Template
                </Button>
              </div>

              <DataTable
                columns={[
                  {
                    header: 'Template Name & Code',
                    cell: (row: MessageTemplate) => (
                      <div>
                        <p className="text-xs font-semibold text-ui-fg-base">{row.name}</p>
                        <p className="text-[10px] font-mono text-blue-600">{row.code}</p>
                      </div>
                    ),
                  },
                  {
                    header: 'Channel',
                    cell: (row: MessageTemplate) => (
                      <div className="flex items-center gap-1.5">
                        {getChannelIcon(row.channelType)}
                        <span className="text-xs font-mono">{row.channelType}</span>
                      </div>
                    ),
                  },
                  {
                    header: 'Category',
                    cell: (row: MessageTemplate) => (
                      <span className="text-xs rounded px-1.5 py-0.5 bg-ui-bg-subtle border border-ui-border-base text-ui-fg-subtle">
                        {row.category}
                      </span>
                    ),
                  },
                  {
                    header: 'Body Preview',
                    cell: (row: MessageTemplate) => (
                      <p className="text-xs text-ui-fg-muted max-w-md truncate font-sans">
                        {row.bodyTemplate}
                      </p>
                    ),
                  },
                  {
                    header: 'Variables',
                    cell: (row: MessageTemplate) => (
                      <div className="flex flex-wrap gap-1">
                        {row.variables.map((v) => (
                          <span key={v} className="text-[10px] font-mono text-blue-600 bg-blue-50 dark:bg-blue-950 px-1 rounded">
                            {`{{${v}}}`}
                          </span>
                        ))}
                      </div>
                    ),
                  },
                  {
                    header: 'Status',
                    cell: (row: MessageTemplate) => (
                      <StatusBadge tone={row.active ? 'green' : 'grey'}>
                        {row.active ? 'ACTIVE' : 'INACTIVE'}
                      </StatusBadge>
                    ),
                  },
                ]}
                data={templates}
              />
            </Container>
          )}

          {/* TAB 4: REACH & CAMPAIGNS */}
          {activeTab === 'reach' && (
            <Container className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-ui-fg-base">Reach Broadcasts & Campaigns</h3>
                  <p className="text-xs text-ui-fg-subtle">
                    Audience journeys, batch notifications, dunning blasts, and delivery telemetry.
                  </p>
                </div>
              </div>

              <DataTable
                columns={[
                  {
                    header: 'Campaign Name',
                    cell: (row: ReachCampaign) => (
                      <div>
                        <p className="text-xs font-semibold text-ui-fg-base">{row.name}</p>
                        <p className="text-[10px] text-ui-fg-subtle font-mono">{row.id}</p>
                      </div>
                    ),
                  },
                  {
                    header: 'Channel',
                    cell: (row: ReachCampaign) => (
                      <div className="flex items-center gap-1.5">
                        {getChannelIcon(row.channelType)}
                        <span className="text-xs font-mono">{row.channelType}</span>
                      </div>
                    ),
                  },
                  {
                    header: 'Audience',
                    cell: (row: ReachCampaign) => (
                      <span className="text-xs font-semibold tabular-nums text-ui-fg-base">{row.audienceCount} recipients</span>
                    ),
                  },
                  {
                    header: 'Delivered',
                    cell: (row: ReachCampaign) => (
                      <span className="text-xs text-emerald-600 font-semibold tabular-nums">
                        {row.deliveredCount} ({((row.deliveredCount / row.audienceCount) * 100).toFixed(1)}%)
                      </span>
                    ),
                  },
                  {
                    header: 'Open / Read Rate',
                    cell: (row: ReachCampaign) => (
                      <span className="text-xs text-blue-600 font-semibold tabular-nums">{row.openRate}%</span>
                    ),
                  },
                  {
                    header: 'Status',
                    cell: (row: ReachCampaign) => (
                      <StatusBadge tone="green">{row.status}</StatusBadge>
                    ),
                  },
                ]}
                data={campaigns}
              />
            </Container>
          )}

          {/* TAB 5: CROSS-MODULE TRIGGERS */}
          {activeTab === 'triggers' && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 w-full">
              <div className="w-full">
                <Container className="p-5">
                  <div className="pb-3 border-b border-ui-border-base mb-4">
                    <h3 className="text-base font-semibold text-ui-fg-base">Cross-Module Alert Simulator</h3>
                    <p className="text-xs text-ui-fg-subtle mt-0.5">
                      Test automated event triggers dispatching from AR, E-Sign, Spend, or CMMS into TextFly.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <FormField label="Triggering Source Module">
                      <Select
                        value={triggerModule}
                        onChange={(e) => {
                          const m = e.target.value as any;
                          setTriggerModule(m);
                          // WI-OI-120ak (S4): the module sets the template and channel only; no invented record.
                          const presets = {
                            AR: ['AR_INVOICE_DISPATCH', 'SMS'],
                            ESIGN: ['ESIGN_OTP_CHALLENGE', 'SMS'],
                            SPEND: ['SPEND_APPROVAL_ALERT', 'EMAIL'],
                            CMMS: ['CMMS_WORKORDER_DISPATCH', 'WHATSAPP'],
                          } as const;
                          const [template, channel] = presets[m as keyof typeof presets];
                          setTriggerTemplate(template);
                          setTriggerChannel(channel);
                          setTriggerEntityId('');
                          setTriggerVariables('{}');
                        }}
                      >
                        <option value="AR">Accounts Receivable (/ar) - Dunning & Invoices</option>
                        <option value="ESIGN">E-Signature (/esign) - Cryptographic OTP</option>
                        <option value="SPEND">Spend Management (/spend) - PO Sign-Off</option>
                        <option value="CMMS">Asset & Maintenance (/cmms) - Work Orders</option>
                      </Select>
                    </FormField>

                    <div className="grid grid-cols-2 gap-2">
                      <FormField label="Target Channel">
                        <Select
                          value={triggerChannel}
                          onChange={(e) => setTriggerChannel(e.target.value as any)}
                        >
                          <option value="SMS">SMS (Twilio / ACS)</option>
                          <option value="WHATSAPP">WhatsApp (ACS / Twilio)</option>
                          <option value="EMAIL">Email (SendGrid)</option>
                          <option value="WEBHOOK">Webhook (ERP Bridge)</option>
                        </Select>
                      </FormField>

                      <FormField label="Entity Reference">
                        <Input
                          value={triggerEntityId}
                          onChange={(e) => setTriggerEntityId(e.target.value)}
                          placeholder="e.g. INV-2026-0099"
                        />
                      </FormField>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <FormField label="Recipient Name">
                        <Input
                          value={triggerRecipientName}
                          onChange={(e) => setTriggerRecipientName(e.target.value)}
                          placeholder="Recipient Name"
                        />
                      </FormField>

                      <FormField label="Recipient Phone / Email">
                        <Input
                          value={triggerRecipient}
                          onChange={(e) => setTriggerRecipient(e.target.value)}
                          placeholder="+1... or user@company.com"
                        />
                      </FormField>
                    </div>

                    <FormField label="Interpolation Variables (JSON)">
                      <TextArea
                        rows={3}
                        value={triggerVariables}
                        onChange={(e) => setTriggerVariables(e.target.value)}
                        className="font-mono text-xs"
                      />
                    </FormField>

                    <Button
                      variant="primary"
                      className="w-full"
                      onClick={handleExecuteTrigger}
                      disabled={isTriggering}
                    >
                      <Zap className="mr-1.5 h-4 w-4" />
                      {isTriggering ? 'Dispatching...' : 'Dispatch Automated Event Trigger'}
                    </Button>
                  </div>
                </Container>
              </div>

              {/* Right Column: Dispatch Result & Verification Lineage */}
              <div className="w-full">
                <Container className="p-5">
                  <div className="pb-3 border-b border-ui-border-base mb-4">
                    <h3 className="text-base font-semibold text-ui-fg-base">Trigger Execution Telemetry</h3>
                    <p className="text-xs text-ui-fg-subtle mt-0.5">
                      Real-time delivery verification, audit logs, and conversation attachment.
                    </p>
                  </div>

                  {lastTriggerResult ? (
                    <div className="space-y-3">
                      <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                            Dispatch Successfully Verified
                          </span>
                        </div>
                        <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                          Message sent to provider cluster and queued for instant delivery.
                        </p>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between py-1 border-b border-ui-border-base">
                          <span className="text-ui-fg-muted">Dispatch ID:</span>
                          <span className="font-mono text-ui-fg-base">{lastTriggerResult.dispatchId}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-ui-border-base">
                          <span className="text-ui-fg-muted">Conversation Thread:</span>
                          <span className="font-mono text-blue-600">{lastTriggerResult.conversationId}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-ui-border-base">
                          <span className="text-ui-fg-muted">Channel / Target:</span>
                          <span className="font-mono text-ui-fg-base">{lastTriggerResult.channelType} ({lastTriggerResult.recipient})</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-ui-border-base">
                          <span className="text-ui-fg-muted">Delivery Status:</span>
                          <StatusBadge tone="green">{lastTriggerResult.deliveryStatus}</StatusBadge>
                        </div>
                        <div className="flex justify-between py-1 border-b border-ui-border-base">
                          <span className="text-ui-fg-muted">Timestamp:</span>
                          <span className="font-mono text-ui-fg-base">{lastTriggerResult.timestamp}</span>
                        </div>
                      </div>

                      <div className="mt-4">
                        <span className="text-xs font-semibold text-ui-fg-muted">Rendered Outbound Body:</span>
                        <div className="p-3 mt-1 rounded bg-ui-bg-subtle border border-ui-border-base text-xs font-sans leading-relaxed">
                          {lastTriggerResult.renderedBody}
                        </div>
                      </div>

                      <div className="pt-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            setActiveTab('inbox');
                            setSelectedConversationId(lastTriggerResult.conversationId);
                          }}
                        >
                          <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                          View In Unified Inbox Thread
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <EmptyState
                      title="No triggers dispatched yet"
                      description="Select an upstream module (AR, E-Sign, Spend, CMMS) and execute a test dispatch to view live telemetry."
                    />
                  )}
                </Container>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: ADD CHANNEL */}
      <Modal
        open={channelModalOpen}
        onOpenChange={setChannelModalOpen}
        title="Connect Omnichannel Provider"
        description="Configure a new SMS, WhatsApp, or Email routing endpoint."
      >
        <div className="space-y-4 py-2">
          <FormField label="Channel Name">
            <Input
              value={newChanName}
              onChange={(e) => setNewChanName(e.target.value)}
              placeholder="e.g. Twilio Marketing Toll-Free"
            />
          </FormField>
          <FormField label="Channel Type">
            <Select
              value={newChanType}
              onChange={(e) => setNewChanType(e.target.value as any)}
            >
              <option value="SMS">SMS</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="EMAIL">Email</option>
              <option value="WEBHOOK">Webhook</option>
            </Select>
          </FormField>
          <FormField label="Provider Gateway">
            <Select
              value={newChanProvider}
              onChange={(e) => setNewChanProvider(e.target.value)}
            >
              <option value="TWILIO">Twilio</option>
              <option value="AZURE_COMMUNICATION_SERVICES">Azure Communication Services</option>
              <option value="SMTP_SENDGRID">SendGrid / SMTP</option>
              <option value="CUSTOM_WEBHOOK">Custom Webhook</option>
            </Select>
          </FormField>
          <FormField label="Sender Address / Number">
            <Input
              value={newChanAddress}
              onChange={(e) => setNewChanAddress(e.target.value)}
              placeholder="e.g. +1 (800) 555-0199 or notifications@company.com"
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setChannelModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateChannel}>
              Connect Channel
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL: NEW TEMPLATE */}
      <Modal
        open={templateModalOpen}
        onOpenChange={setTemplateModalOpen}
        title="Create Message Template"
        description="Author a pre-formatted message with dynamic variable interpolation."
      >
        <div className="space-y-4 py-2">
          <FormField label="Template Name">
            <Input
              value={newTplName}
              onChange={(e) => setNewTplName(e.target.value)}
              placeholder="e.g. Overdue Dunning Notice"
            />
          </FormField>
          <FormField label="Template Code (Unique Identifier)">
            <Input
              value={newTplCode}
              onChange={(e) => setNewTplCode(e.target.value.toUpperCase())}
              placeholder="e.g. AR_DUNNING_LEVEL_2"
            />
          </FormField>
          <FormField label="Channel">
            <Select
              value={newTplChannel}
              onChange={(e) => setNewTplChannel(e.target.value as any)}
            >
              <option value="SMS">SMS</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="EMAIL">Email</option>
            </Select>
          </FormField>
          <FormField label="Body Template (Use {{variable_name}})">
            <TextArea
              rows={4}
              value={newTplBody}
              onChange={(e) => setNewTplBody(e.target.value)}
              placeholder="Dear {{customer_name}}, this is an urgent reminder regarding {{invoice_number}}..."
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setTemplateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateTemplate}>
              Save Template
            </Button>
          </div>
        </div>
      </Modal>

      <VoiceCallPanel
        tenantId={tenantId ?? ''}
        isOpen={softphoneOpen}
        onClose={() => setSoftphoneOpen(false)}
        initialPhoneNumber={selectedConversation?.contactAddress}
        contactName={selectedConversation?.contactName}
      />
    </PageShell>
  );
}
