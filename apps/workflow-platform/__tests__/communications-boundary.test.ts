import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getComm, POST as postComm, PATCH as patchComm } from '../app/api/communications/[...path]/route';
import { verifiedSession } from '../lib/verified-session';
import { communicationsStore } from '../lib/communications-store';
import { rateCommunicationsUsage } from '@gigalibs/contracts';

vi.mock('../lib/verified-session', () => ({
  verifiedSession: vi.fn(),
}));

describe('Omnichannel Communications & Metering Security Boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('denies unauthenticated GET /api/communications/channels with HTTP 401', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(verifiedSession).mockResolvedValue({
      response: NextResponse.json(
        { detail: 'Authentication required.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      ),
    } as any);

    const req = new Request('https://platform.example.invalid/api/communications/channels', {
      method: 'GET',
    });
    const res = await getComm(req, { params: Promise.resolve({ path: ['channels'] }) });

    expect(res.status).toBe(401);
  });

  it('denies requests if tenant lacks communications module entitlement', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      response: null,
      context: {
        user: { id: 'usr-1', email: 'user@example.com' },
        tenant: { id: 'tenant-no-comm', features: ['analytics'] },
        permissions: ['communications:read'],
        platformRoles: [],
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/communications/channels', {
      method: 'GET',
    });
    const res = await getComm(req, { params: Promise.resolve({ path: ['channels'] }) });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toContain('Omnichannel Communications module is not enabled');
  });

  it('allows authorized tenant to retrieve WebRTC voice token', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      response: null,
      context: {
        user: { id: 'usr-tech-01', email: 'tech@example.com' },
        tenant: { id: 'tenant-acme', features: ['communications-textfly'] },
        permissions: ['communications:read', 'communications:write'],
        platformRoles: [],
      },
    } as any);

    const req = new Request('https://platform.example.invalid/api/communications/voice/token', {
      method: 'GET',
    });
    const res = await getComm(req, { params: Promise.resolve({ path: ['voice', 'token'] }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe('TWILIO');
    expect(body.token).toContain('webrtc-auth-token-tenant-a');
    expect(body.identity).toBe('client:usr-tech-01');
    expect(body.expiresIn).toBe(3600);
  });

  it('places an outbound voice call attempt and updates call duration', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      response: null,
      context: {
        user: { id: 'usr-dispatcher', email: 'dispatcher@example.com' },
        tenant: { id: 'tenant-acme', features: ['communications-textfly'] },
        permissions: ['communications:read', 'communications:write'],
        platformRoles: [],
      },
    } as any);

    // 1. Initiate outbound call
    const postReq = new Request('https://platform.example.invalid/api/communications/voice/calls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://platform.example.invalid',
        Host: 'platform.example.invalid',
      },
      body: JSON.stringify({
        recipientAddress: '+1 (555) 444-1234',
        direction: 'OUTBOUND',
      }),
    });

    const postRes = await postComm(postReq, { params: Promise.resolve({ path: ['voice', 'calls'] }) });
    expect(postRes.status).toBe(201);
    const postBody = await postRes.json();
    expect(postBody.callAttemptId).toBeDefined();
    expect(postBody.attempt.recipientAddress).toBe('+1 (555) 444-1234');
    expect(postBody.attempt.status).toBe('IN_PROGRESS');

    // 2. Patch completed call attempt with duration
    const patchReq = new Request('https://platform.example.invalid/api/communications/voice/calls', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://platform.example.invalid',
        Host: 'platform.example.invalid',
      },
      body: JSON.stringify({
        callAttemptId: postBody.callAttemptId,
        durationSeconds: 145,
        status: 'COMPLETED',
        recordingUrl: 'https://telecom.gigalibs.io/recordings/rec-145.wav',
        transcriptText: 'Pump pressure stabilized on line 3.',
      }),
    });

    const patchRes = await patchComm(patchReq, { params: Promise.resolve({ path: ['voice', 'calls'] }) });
    expect(patchRes.status).toBe(200);
    const patchBody = await patchRes.json();
    expect(patchBody.attempt.status).toBe('COMPLETED');
    expect(patchBody.attempt.durationSeconds).toBe(145);
    expect(patchBody.attempt.transcriptText).toBe('Pump pressure stabilized on line 3.');
  });

  it('calculates communications usage metrics and rating quote', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      response: null,
      context: {
        user: { id: 'usr-finance', email: 'finance@example.com' },
        tenant: { id: 'tenant-acme', features: ['communications-textfly'] },
        permissions: ['communications:read', 'communications:write'],
        platformRoles: [],
      },
    } as any);

    // Seed call attempt
    communicationsStore.recordCallAttempt('tenant-acme', {
      recipientAddress: '+1 (555) 000-1111',
      durationSeconds: 180,
      status: 'COMPLETED',
    });

    // Fetch metering usage
    const usageReq = new Request('https://platform.example.invalid/api/communications/metering/usage', {
      method: 'GET',
    });
    const usageRes = await getComm(usageReq, { params: Promise.resolve({ path: ['metering', 'usage'] }) });
    expect(usageRes.status).toBe(200);
    const usageBody = await usageRes.json();
    expect(usageBody.metrics).toBeDefined();
    expect(usageBody.metrics.voiceCalls).toBeGreaterThanOrEqual(1);

    // Fetch tiered rating quote
    const quoteReq = new Request('https://platform.example.invalid/api/communications/metering/quote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://platform.example.invalid',
        Host: 'platform.example.invalid',
      },
      body: JSON.stringify({
        includePlatformFee: true,
        includeIsolationAddon: true,
      }),
    });
    const quoteRes = await postComm(quoteReq, { params: Promise.resolve({ path: ['metering', 'quote'] }) });
    expect(quoteRes.status).toBe(200);
    const quoteBody = await quoteRes.json();
    expect(quoteBody.quote.subtotalUsd).toBeGreaterThanOrEqual(278); // $79 platform + $199 isolation
    expect(quoteBody.quote.lineItems.some((i: any) => i.key === 'platform_base')).toBe(true);
    expect(quoteBody.quote.lineItems.some((i: any) => i.key === 'isolation_addon')).toBe(true);
  });
});
