import { z } from 'zod';
import type { AgentToolSpec } from './index.js';

// WI-OI-120bc (Giga AI Companion, capability 2 — marketing "Giga Campaign"): the pure core of a marketing campaign.
// A campaign drafts content per channel, targets an audience, is approved, scheduled, and sent. Everything here is
// pure and testable (no stack): the content/campaign status machine and, most importantly, the SEND-READINESS guard
// that refuses to send an unapproved, empty, mistargeted or already-sent campaign. Audience sizing, drafting and the
// actual send are tools (runtime). The `marketing:*` permissions are new to this capability and join the catalogue
// when the module is built.

export const MARKETING_CHANNELS = ['EMAIL', 'SMS', 'PUSH', 'IN_APP'] as const;
export const MarketingChannelSchema = z.enum(MARKETING_CHANNELS);
export type MarketingChannel = z.infer<typeof MarketingChannelSchema>;

export const MarketingContentStatusSchema = z.enum(['DRAFT', 'APPROVED']);
export type MarketingContentStatus = z.infer<typeof MarketingContentStatusSchema>;

/** A content piece for one channel. `subject` is for channels that have one (email). */
export interface MarketingContent {
  readonly channel: MarketingChannel;
  readonly subject: string | null;
  readonly body: string;
  readonly status: MarketingContentStatus;
}

/** Who the campaign targets — segment ids to include/exclude, and an estimated size once a tool has computed it. */
export interface MarketingAudience {
  readonly includeSegmentIds: readonly string[];
  readonly excludeSegmentIds: readonly string[];
  readonly estimatedSize: number | null;
}

export const MarketingCampaignStatusSchema = z.enum([
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'SCHEDULED',
  'SENDING',
  'SENT',
  'FAILED',
  'CANCELLED',
]);
export type MarketingCampaignStatus = z.infer<typeof MarketingCampaignStatusSchema>;

export interface MarketingCampaign {
  readonly id: string;
  readonly name: string;
  readonly brief: string;
  readonly channels: readonly MarketingChannel[];
  readonly content: readonly MarketingContent[];
  readonly audience: MarketingAudience;
  readonly scheduledFor: string | null;
  readonly status: MarketingCampaignStatus;
  readonly createdBy: string;
}

export interface SendReadiness {
  readonly ok: boolean;
  /** Every reason the campaign may not be sent yet (empty when ok). */
  readonly reasons: readonly string[];
}

const SETTLED: ReadonlySet<MarketingCampaignStatus> = new Set(['SENT', 'FAILED', 'CANCELLED']);

/**
 * Whether a campaign may be sent, with every blocking reason. This is the hard gate before any send tool runs: the
 * campaign must be approved or scheduled (and not already sending/sent), every targeted channel must have APPROVED
 * content, and the audience must include at least one segment and a non-zero estimated size once known. Pure — it
 * decides nothing about *when*, only whether it is safe at all.
 */
export function campaignSendReadiness(campaign: MarketingCampaign): SendReadiness {
  const reasons: string[] = [];
  if (campaign.status === 'SENDING' || campaign.status === 'SENT') {
    reasons.push('the campaign has already been sent');
  } else if (campaign.status !== 'APPROVED' && campaign.status !== 'SCHEDULED') {
    reasons.push('the campaign is not approved');
  }
  if (campaign.channels.length === 0) reasons.push('no channel is selected');
  for (const channel of campaign.channels) {
    const piece = campaign.content.find((c) => c.channel === channel);
    if (!piece) reasons.push(`no content for ${channel}`);
    else if (piece.status !== 'APPROVED') reasons.push(`content for ${channel} is not approved`);
  }
  if (campaign.audience.includeSegmentIds.length === 0) reasons.push('the audience is empty');
  if (campaign.audience.estimatedSize === 0) reasons.push('the audience estimate is zero');
  return { ok: reasons.length === 0, reasons };
}

/** The transitions the marketing campaign accepts. */
export type MarketingCampaignEvent =
  | { readonly type: 'SUBMIT_FOR_REVIEW' }
  | { readonly type: 'APPROVE' }
  | { readonly type: 'SCHEDULE'; readonly at: string }
  | { readonly type: 'START_SENDING' }
  | { readonly type: 'SENT' }
  | { readonly type: 'FAIL' }
  | { readonly type: 'CANCEL' };

/** True once the campaign can no longer change on its own. */
export function isMarketingCampaignSettled(status: MarketingCampaignStatus): boolean {
  return SETTLED.has(status);
}

/**
 * The pure marketing-campaign state machine. Never mutates its input, refuses to move a settled campaign, and only
 * allows START_SENDING once {@link campaignSendReadiness} is satisfied — so the sending path cannot be entered for an
 * unapproved, empty or already-sent campaign even if asked.
 */
export function advanceMarketingCampaign(
  campaign: MarketingCampaign,
  event: MarketingCampaignEvent,
): MarketingCampaign {
  if (isMarketingCampaignSettled(campaign.status)) return campaign;
  switch (event.type) {
    case 'SUBMIT_FOR_REVIEW':
      return campaign.status === 'DRAFT' ? { ...campaign, status: 'IN_REVIEW' } : campaign;
    case 'APPROVE':
      return campaign.status === 'IN_REVIEW' ? { ...campaign, status: 'APPROVED' } : campaign;
    case 'SCHEDULE':
      return campaign.status === 'APPROVED'
        ? { ...campaign, status: 'SCHEDULED', scheduledFor: event.at }
        : campaign;
    case 'START_SENDING':
      return campaignSendReadiness(campaign).ok ? { ...campaign, status: 'SENDING' } : campaign;
    case 'SENT':
      return campaign.status === 'SENDING' ? { ...campaign, status: 'SENT' } : campaign;
    case 'FAIL':
      return campaign.status === 'SENDING' ? { ...campaign, status: 'FAILED' } : campaign;
    case 'CANCEL':
      return { ...campaign, status: 'CANCELLED' };
  }
}

/**
 * The marketing tools the Companion may call. Sending is gated on its own `marketing:send` permission — separate from
 * `marketing:write` — so drafting/scheduling never implies the authority to actually send to people.
 */
export const MARKETING_TOOLS: readonly AgentToolSpec[] = [
  {
    name: 'marketing.audience.estimate',
    description: 'Estimate the audience size for a set of include/exclude segments.',
    input: {
      type: 'object',
      properties: {
        includeSegmentIds: { type: 'array', items: { type: 'string' } },
        excludeSegmentIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['includeSegmentIds'],
    },
    requiresPermission: 'marketing:read',
  },
  {
    name: 'marketing.content.draft',
    description:
      'Draft content for a channel from the campaign brief (returns a DRAFT piece for review).',
    input: {
      type: 'object',
      properties: {
        channel: { type: 'string', enum: [...MARKETING_CHANNELS] },
        brief: { type: 'string' },
      },
      required: ['channel', 'brief'],
    },
    requiresPermission: 'marketing:write',
  },
  {
    name: 'marketing.campaign.schedule',
    description: 'Schedule an approved campaign to send at a time.',
    input: {
      type: 'object',
      properties: { campaignId: { type: 'string' }, at: { type: 'string', format: 'date-time' } },
      required: ['campaignId', 'at'],
    },
    requiresPermission: 'marketing:write',
  },
  {
    name: 'marketing.campaign.send',
    description: 'Send a ready campaign. Refused unless it passes the send-readiness guard.',
    input: {
      type: 'object',
      properties: { campaignId: { type: 'string' } },
      required: ['campaignId'],
    },
    requiresPermission: 'marketing:send',
  },
];
