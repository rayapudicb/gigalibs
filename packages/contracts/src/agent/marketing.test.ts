import { describe, expect, it } from 'vitest';
import {
  MARKETING_TOOLS,
  type MarketingCampaign,
  advanceMarketingCampaign,
  campaignSendReadiness,
  toolsForPermissions,
} from './index.js';

// WI-OI-120bc (Giga AI Companion, capability 2): the marketing campaign's send-safety guard and status machine.

const ready: MarketingCampaign = {
  id: 'm1',
  name: 'October re-engagement',
  brief: 'Win back lapsed users.',
  channels: ['EMAIL'],
  content: [{ channel: 'EMAIL', subject: 'We miss you', body: '...', status: 'APPROVED' }],
  audience: { includeSegmentIds: ['lapsed-90d'], excludeSegmentIds: [], estimatedSize: 1200 },
  scheduledFor: null,
  status: 'APPROVED',
  createdBy: 'user-1',
};

describe('campaignSendReadiness', () => {
  it('allows a fully approved, targeted campaign', () => {
    expect(campaignSendReadiness(ready)).toEqual({ ok: true, reasons: [] });
  });

  it('blocks unapproved content', () => {
    const r = campaignSendReadiness({
      ...ready,
      content: [{ channel: 'EMAIL', subject: 'x', body: 'y', status: 'DRAFT' }],
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('content for EMAIL is not approved');
  });

  it('blocks an empty or zero audience, a missing channel, and a not-approved status', () => {
    expect(
      campaignSendReadiness({
        ...ready,
        audience: { includeSegmentIds: [], excludeSegmentIds: [], estimatedSize: null },
      }).reasons,
    ).toContain('the audience is empty');
    expect(
      campaignSendReadiness({ ...ready, audience: { ...ready.audience, estimatedSize: 0 } })
        .reasons,
    ).toContain('the audience estimate is zero');
    expect(campaignSendReadiness({ ...ready, channels: ['SMS'] }).reasons).toContain(
      'no content for SMS',
    );
    expect(campaignSendReadiness({ ...ready, status: 'DRAFT' }).reasons).toContain(
      'the campaign is not approved',
    );
  });

  it('blocks a campaign already sent', () => {
    expect(campaignSendReadiness({ ...ready, status: 'SENT' }).reasons).toContain(
      'the campaign has already been sent',
    );
  });
});

describe('advanceMarketingCampaign', () => {
  it('walks DRAFT → IN_REVIEW → APPROVED → SCHEDULED', () => {
    let c: MarketingCampaign = { ...ready, status: 'DRAFT' };
    c = advanceMarketingCampaign(c, { type: 'SUBMIT_FOR_REVIEW' });
    expect(c.status).toBe('IN_REVIEW');
    c = advanceMarketingCampaign(c, { type: 'APPROVE' });
    expect(c.status).toBe('APPROVED');
    c = advanceMarketingCampaign(c, { type: 'SCHEDULE', at: '2026-11-01T09:00:00Z' });
    expect(c.status).toBe('SCHEDULED');
    expect(c.scheduledFor).toBe('2026-11-01T09:00:00Z');
  });

  it('enters SENDING only when send-readiness passes', () => {
    expect(advanceMarketingCampaign(ready, { type: 'START_SENDING' }).status).toBe('SENDING');
    const notReady: MarketingCampaign = { ...ready, status: 'DRAFT' };
    expect(advanceMarketingCampaign(notReady, { type: 'START_SENDING' }).status).toBe('DRAFT');
  });

  it('refuses to move a settled campaign and never mutates its input', () => {
    const sent: MarketingCampaign = { ...ready, status: 'SENT' };
    expect(advanceMarketingCampaign(sent, { type: 'CANCEL' })).toBe(sent);
    const moved = advanceMarketingCampaign(
      { ...ready, status: 'DRAFT' },
      { type: 'SUBMIT_FOR_REVIEW' },
    );
    expect(moved.status).toBe('IN_REVIEW');
  });
});

describe('MARKETING_TOOLS least privilege', () => {
  it('separates send from write', () => {
    const writer = toolsForPermissions(MARKETING_TOOLS, ['marketing:read', 'marketing:write']).map(
      (t) => t.name,
    );
    expect(writer).toContain('marketing.content.draft');
    expect(writer).not.toContain('marketing.campaign.send'); // send needs marketing:send
    const sender = toolsForPermissions(MARKETING_TOOLS, ['marketing:send']).map((t) => t.name);
    expect(sender).toEqual(['marketing.campaign.send']);
  });
});
