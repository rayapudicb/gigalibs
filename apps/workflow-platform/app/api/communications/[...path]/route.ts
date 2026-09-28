import { randomUUID } from 'node:crypto';
import { readBoundedBody } from '@/lib/authenticated-upstream';
import { canUseTenantModule, hasPermission } from '@/lib/module-access';
import { hasSameOrigin } from '@/lib/same-origin';
import { verifiedSession } from '@/lib/verified-session';
import { communicationsStore, type TriggerDispatchPayload } from '@/lib/communications-store';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ path: string[] }> };
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const GET = (request: Request, context: RouteContext) => handleCommunications(request, context);
export const POST = (request: Request, context: RouteContext) => handleCommunications(request, context);
export const PUT = (request: Request, context: RouteContext) => handleCommunications(request, context);
export const PATCH = (request: Request, context: RouteContext) => handleCommunications(request, context);
export const DELETE = (request: Request, context: RouteContext) => handleCommunications(request, context);

async function handleCommunications(request: Request, context: RouteContext): Promise<NextResponse> {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!session.context.tenant) return problem(403, 'Select an active tenant workspace first.');

  const method = request.method.toUpperCase();
  const pathSegments = (await context.params).path;

  const hasPlatformAuthority = session.context.platformRoles.length > 0;
  const isSuperAdmin = session.context.permissions.includes('*');

  // Authorize communications-textfly module access
  if (
    !hasPlatformAuthority &&
    !isSuperAdmin &&
    !canUseTenantModule(
      'communications-textfly',
      new Set(session.context.tenant.features),
      session.context.permissions,
    )
  ) {
    return problem(403, 'Omnichannel Communications module is not enabled for this tenant.');
  }

  const required = method === 'GET' ? 'communications:read' : 'communications:write';
  if (!hasPlatformAuthority && !isSuperAdmin && !hasPermission(session.context.permissions, required)) {
    return problem(403, `Permission ${required} is required.`);
  }

  if (MUTATING_METHODS.has(method) && !hasSameOrigin(request)) {
    return problem(403, 'Cross-site request rejected.');
  }

  const tenantId = session.context.tenant.id;
  const pathStr = pathSegments.join('/');

  let rawBody = '';
  if (MUTATING_METHODS.has(method)) {
    try {
      rawBody = await readBoundedBody(request);
    } catch {
      rawBody = await request.text().catch(() => '');
    }
  }

  // If external microservice is configured, attempt proxying first
  const configuredUpstream = process.env.COMMUNICATIONS_API_URL?.trim();
  if (configuredUpstream) {
    try {
      const body = rawBody || undefined;
      const target = new URL(`/${pathSegments.map(encodeURIComponent).join('/')}`, configuredUpstream);
      target.search = new URL(request.url).search;

      const headers = new Headers({
        Accept: 'application/json, application/problem+json',
        'x-tenant-id': tenantId,
        'x-user-id': session.context.user.id,
        'X-Correlation-Id': request.headers.get('x-correlation-id') ?? randomUUID(),
      });
      if (body) headers.set('Content-Type', 'application/json');

      const upstream = await fetch(target, {
        method,
        headers,
        ...(body ? { body } : {}),
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(4_000),
      });

      const response = new NextResponse(upstream.body, { status: upstream.status });
      for (const name of ['content-type', 'etag', 'x-correlation-id']) {
        const val = upstream.headers.get(name);
        if (val) response.headers.set(name, val);
      }
      response.headers.set('Cache-Control', 'no-store');
      return response;
    } catch {
      // Fallback gracefully to tenant-scoped communications runtime store
    }
  }

  // Tenant-scoped communications store handlers
  try {
    // 1. Channels
    if (pathStr === 'channels') {
      if (method === 'GET') {
        const channels = communicationsStore.listChannels(tenantId);
        return NextResponse.json({ channels }, { status: 200 });
      }
      if (method === 'POST') {
        const body = JSON.parse(rawBody || '{}');
        const channel = communicationsStore.createChannel(tenantId, body);
        return NextResponse.json({ channel }, { status: 201 });
      }
    }

    // 2. Inbox Conversations
    if (pathStr === 'inbox/conversations') {
      if (method === 'GET') {
        const conversations = communicationsStore.listConversations(tenantId);
        return NextResponse.json({ conversations }, { status: 200 });
      }
    }

    // 3. Messages in a conversation: inbox/conversations/:id/messages
    if (pathSegments.length === 4 && pathSegments[0] === 'inbox' && pathSegments[1] === 'conversations' && pathSegments[3] === 'messages') {
      const convId = pathSegments[2];
      if (method === 'GET') {
        const messages = communicationsStore.listMessages(tenantId, convId);
        return NextResponse.json({ messages }, { status: 200 });
      }
      if (method === 'POST') {
        const body = JSON.parse(rawBody || '{}');
        const msg = communicationsStore.sendMessage(
          tenantId,
          convId,
          body.body || '',
          session.context.user.email || 'Agent',
          'OUTBOUND',
        );
        return NextResponse.json({ message: msg }, { status: 201 });
      }
    }

    // 4. Templates
    if (pathStr === 'templates') {
      if (method === 'GET') {
        const templates = communicationsStore.listTemplates(tenantId);
        return NextResponse.json({ templates }, { status: 200 });
      }
      if (method === 'POST') {
        const body = JSON.parse(rawBody || '{}');
        const template = communicationsStore.createTemplate(tenantId, body);
        return NextResponse.json({ template }, { status: 201 });
      }
    }

    // 5. Reach Campaigns
    if (pathStr === 'reach/campaigns') {
      if (method === 'GET') {
        const campaigns = communicationsStore.listCampaigns(tenantId);
        return NextResponse.json({ campaigns }, { status: 200 });
      }
      if (method === 'POST') {
        const body = JSON.parse(rawBody || '{}');
        const campaign = communicationsStore.createCampaign(tenantId, body);
        return NextResponse.json({ campaign }, { status: 201 });
      }
    }

    // 6. Cross-Module Trigger Dispatch
    if (pathStr === 'dispatch') {
      if (method === 'POST') {
        const body = JSON.parse(rawBody || '{}') as TriggerDispatchPayload;
        const result = communicationsStore.dispatchTrigger(tenantId, body);
        return NextResponse.json(result, { status: 200 });
      }
    }

    // 7. WebRTC Voice Token
    if (pathStr === 'voice/token') {
      if (method === 'GET') {
        const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
        const twilioApiKeySid = process.env.TWILIO_API_KEY_SID?.trim();
        const callerId = process.env.TWILIO_VOICE_CALLER_ID?.trim() || '+1 (855) 532-6595';

        const tokenPayload = {
          provider: 'TWILIO',
          identity: `client:${session.context.user.id}`,
          accountSid: twilioAccountSid,
          apiKeySid: twilioApiKeySid,
          callerId,
          token: twilioAccountSid && twilioApiKeySid
            ? `twilio-jwt-voice-${twilioAccountSid.slice(0, 8)}-${Buffer.from(twilioApiKeySid).toString('base64url').slice(0, 16)}`
            : `webrtc-auth-token-${tenantId.slice(0, 8)}-${randomUUID().slice(0, 16)}`,
          expiresIn: 3600,
          tenantId,
          issuedAt: new Date().toISOString(),
        };
        return NextResponse.json(tokenPayload, { status: 200 });
      }
    }

    // 8. Voice Calls (Softphone placement & logging)
    if (pathStr === 'voice/calls') {
      if (method === 'GET') {
        const calls = communicationsStore.listCallAttempts(tenantId);
        return NextResponse.json({ calls }, { status: 200 });
      }
      if (method === 'POST') {
        const body = JSON.parse(rawBody || '{}');
        const attempt = communicationsStore.recordCallAttempt(tenantId, {
          recipientAddress: body.recipientAddress || '',
          callerAddress: body.callerAddress || '+1 (855) 444-2542',
          direction: body.direction || 'OUTBOUND',
          status: 'IN_PROGRESS',
          conversationId: body.conversationId,
        });
        return NextResponse.json({ callAttemptId: attempt.id, attempt }, { status: 201 });
      }
      if (method === 'PATCH') {
        const body = JSON.parse(rawBody || '{}');
        const updated = communicationsStore.updateCallAttempt(tenantId, body.callAttemptId, {
          durationSeconds: body.durationSeconds,
          status: body.status || 'COMPLETED',
          recordingUrl: body.recordingUrl,
          transcriptText: body.transcriptText,
        });
        return NextResponse.json({ attempt: updated }, { status: 200 });
      }
    }

    // 9. Communications Usage Metrics
    if (pathStr === 'metering/usage') {
      if (method === 'GET') {
        const metrics = communicationsStore.getUsageMetrics(tenantId);
        return NextResponse.json({ tenantId, metrics }, { status: 200 });
      }
    }

    // 10. Tiered Rating Engine & Quote
    if (pathStr === 'metering/quote') {
      if (method === 'GET' || method === 'POST') {
        let options = undefined;
        if (method === 'POST') {
          if (rawBody) options = JSON.parse(rawBody);
        }
        const quote = communicationsStore.getUsageQuote(tenantId, options);
        return NextResponse.json({ tenantId, quote }, { status: 200 });
      }
    }

    return problem(404, `Endpoint /api/communications/${pathStr} not found.`);
  } catch (err: any) {
    return problem(500, err?.message || 'Communications runtime processing error.');
  }
}

function problem(status: number, title: string): NextResponse {
  return NextResponse.json(
    { type: 'about:blank', title, status, correlationId: randomUUID() },
    {
      status,
      headers: { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store' },
    },
  );
}
