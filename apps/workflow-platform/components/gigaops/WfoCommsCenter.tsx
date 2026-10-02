'use client';

import { workforceApi } from '@/lib/workforce-api';
import type { WfoNotificationRecordV1 } from '@gigalibs/contracts';
import {
  Alert,
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  StatusBadge,
  Table,
  Text,
} from '@medusajs/ui';
import { useCallback, useEffect, useState } from 'react';

export function WfoCommsCenter() {
  const [history, setHistory] = useState<WfoNotificationRecordV1[]>([]);
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [sending, setSending] = useState(false);
  const [actionAlert, setActionAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form state
  const [channel, setChannel] = useState<'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH'>('IN_APP');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipientWorkerId, setRecipientWorkerId] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await workforceApi.wfoListCommsHistory({
        channel: channelFilter || undefined,
        limit: 50,
      });
      setHistory(data || []);
    } catch (err: any) {
      console.error('Failed to load comms history:', err);
    } finally {
      setLoading(false);
    }
  }, [channelFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !body) return;

    try {
      setSending(true);
      const res = await workforceApi.wfoSendMessage({
        channel,
        subject,
        body,
        recipientWorkerId: recipientWorkerId || undefined,
        eventType: 'BROADCAST',
      });
      setActionAlert({
        type: 'success',
        message: `Message sent successfully to ${res.sentCount} recipient(s) via ${channel}.`,
      });
      setShowCompose(false);
      setSubject('');
      setBody('');
      setRecipientWorkerId('');
      await loadData();
    } catch (err: any) {
      setActionAlert({
        type: 'error',
        message: err.message || 'Failed to dispatch communication.',
      });
    } finally {
      setSending(false);
    }
  };

  const getChannelColor = (ch: string) => {
    switch (ch) {
      case 'SMS':
        return 'green';
      case 'EMAIL':
        return 'blue';
      case 'PUSH':
        return 'purple';
      default:
        return 'grey';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Heading level="h2" className="text-xl font-bold">Frontline Communications Center</Heading>
          <Text className="text-ui-fg-subtle text-sm">
            Targeted notifications, schedule alerts, SMS/Push broadcast, and delivery tracking.
          </Text>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-ui-bg-subtle p-1 rounded-md border border-ui-border-base gap-1">
            {['', 'IN_APP', 'SMS', 'EMAIL', 'PUSH'].map((ch) => (
              <Button
                key={ch || 'ALL'}
                size="small"
                variant={channelFilter === ch ? 'primary' : 'transparent'}
                onClick={() => setChannelFilter(ch)}
              >
                {ch || 'All Channels'}
              </Button>
            ))}
          </div>
          <Button size="small" variant="secondary" onClick={() => setShowCompose(true)}>
            Compose Broadcast
          </Button>
        </div>
      </div>

      {actionAlert && (
        <Alert variant={actionAlert.type === 'success' ? 'success' : 'error'}>
          {actionAlert.message}
        </Alert>
      )}

      {/* History Table */}
      <Container className="p-0 overflow-hidden border border-ui-border-base rounded-lg bg-ui-bg-base">
        <div className="p-4 border-b border-ui-border-base flex justify-between items-center">
          <div>
            <Heading level="h3" className="text-base font-semibold">Communication Audit Log</Heading>
            <Text className="text-xs text-ui-fg-subtle">Real-time status of outgoing messages and alerts</Text>
          </div>
          <Badge color="grey">{history.length} Messages Logged</Badge>
        </div>

        {loading ? (
          <div className="p-8 text-center text-ui-fg-muted text-sm">Loading communication logs...</div>
        ) : history.length === 0 ? (
          <div className="p-8 text-center text-ui-fg-muted text-sm">No communications logged yet.</div>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Recipient</Table.HeaderCell>
                <Table.HeaderCell>Channel</Table.HeaderCell>
                <Table.HeaderCell>Event</Table.HeaderCell>
                <Table.HeaderCell>Subject</Table.HeaderCell>
                <Table.HeaderCell>Message</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Sent At</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {history.map((item) => (
                <Table.Row key={item.id} className="hover:bg-ui-bg-subtle-hover">
                  <Table.Cell className="font-medium">{item.recipientName || item.recipientWorkerId?.slice(0, 8) || 'All Assigned'}</Table.Cell>
                  <Table.Cell><Badge color={getChannelColor(item.channel) as any}>{item.channel}</Badge></Table.Cell>
                  <Table.Cell className="text-xs text-ui-fg-muted">{item.eventType}</Table.Cell>
                  <Table.Cell className="font-semibold text-xs">{item.subject}</Table.Cell>
                  <Table.Cell className="text-xs text-ui-fg-subtle max-w-xs truncate">{item.body}</Table.Cell>
                  <Table.Cell>
                    <StatusBadge color={item.deliveryStatus === 'DELIVERED' ? 'green' : 'orange'}>
                      {item.deliveryStatus}
                    </StatusBadge>
                  </Table.Cell>
                  <Table.Cell className="text-xs text-ui-fg-muted">{new Date(item.sentAt).toLocaleString()}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Container>

      {/* Modal: Compose Broadcast */}
      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Container className="w-full max-w-md p-6 bg-ui-bg-base border border-ui-border-base rounded-xl shadow-xl space-y-4">
            <div className="flex justify-between items-center border-b border-ui-border-base pb-3">
              <Heading level="h3" className="text-base font-bold">Compose Frontline Message</Heading>
              <Button size="small" variant="transparent" onClick={() => setShowCompose(false)}>✕</Button>
            </div>

            <form onSubmit={handleSend} className="space-y-4">
              <div>
                <Label className="text-xs font-semibold">Delivery Channel</Label>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  {(['IN_APP', 'SMS', 'EMAIL', 'PUSH'] as const).map((ch) => (
                    <Button
                      key={ch}
                      size="small"
                      type="button"
                      variant={channel === ch ? 'primary' : 'secondary'}
                      onClick={() => setChannel(ch)}
                    >
                      {ch}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Subject / Title</Label>
                <Input
                  className="mt-1"
                  placeholder="e.g. Schedule Update for Saturday"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Message Body</Label>
                <textarea
                  className="mt-1 w-full rounded-md border border-ui-border-base bg-ui-bg-field p-2 text-sm outline-none focus:border-ui-border-interactive min-h-[100px]"
                  placeholder="Type your message text here..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Specific Worker ID (Optional)</Label>
                <Input
                  className="mt-1"
                  placeholder="Leave empty to broadcast to active roster"
                  value={recipientWorkerId}
                  onChange={(e) => setRecipientWorkerId(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-ui-border-base">
                <Button size="small" variant="secondary" onClick={() => setShowCompose(false)} type="button">
                  Cancel
                </Button>
                <Button size="small" variant="primary" type="submit" disabled={sending}>
                  {sending ? 'Sending...' : 'Dispatch Message'}
                </Button>
              </div>
            </form>
          </Container>
        </div>
      )}
    </div>
  );
}
