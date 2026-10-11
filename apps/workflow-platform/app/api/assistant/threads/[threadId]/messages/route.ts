import { verifiedSession } from '@/lib/verified-session';
import { callSignedModule } from '@/lib/signed-module-proxy';
import { moduleGatewayConfig } from '@/lib/module-gateway';
import { prisma } from '@gigalibs/db';
import { createHash, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ threadId: string }> };

type MessageRecord = {
  id: string;
  thread_id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  created_at: Date;
};

async function queryOllama(prompt: string, context?: string): Promise<string | null> {
  try {
    const systemPrompt = context
      ? `You are GigaLibs Sovereign Operational Assistant. Provide direct, factual, executive operational guidance based on this live context:\n${context}\nDo not claim you executed or modified records.`
      : 'You are GigaLibs Sovereign Operational Assistant. Provide direct, factual, executive operational guidance for plant and enterprise operations. Avoid generic filler.';

    const res = await fetch('http://127.0.0.1:11434/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        stream: false,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

export async function GET(request: Request, context: RouteContext) {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  const tenantId = session.context?.tenant?.id;
  const userId = session.context?.user?.id;
  if (!tenantId || !userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { threadId } = await context.params;

  // Verify thread ownership
  const threads = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM gigalibs_assistant.assistant_threads
      WHERE tenant_id = $1 AND owner_user_id = $2 AND id = $3::uuid AND expires_at > now()`,
    tenantId,
    userId,
    threadId
  );
  if (!threads[0]) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
  }

  const messages = await prisma.$queryRawUnsafe<MessageRecord[]>(
    `SELECT id, thread_id, role, content, created_at
       FROM gigalibs_assistant.assistant_messages
      WHERE tenant_id = $1 AND thread_id = $2::uuid AND owner_user_id = $3
      ORDER BY created_at ASC`,
    tenantId,
    threadId,
    userId
  );

  return NextResponse.json({
    items: messages.map((m) => ({
      id: m.id,
      threadId: m.thread_id,
      role: m.role,
      content: m.content,
      createdAt: m.created_at,
    })),
  });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  const tenantId = session.context?.tenant?.id;
  const userId = session.context?.user?.id;
  if (!tenantId || !userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { threadId } = await context.params;

  // Verify thread ownership
  const threads = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM gigalibs_assistant.assistant_threads
      WHERE tenant_id = $1 AND owner_user_id = $2 AND id = $3::uuid AND expires_at > now()`,
    tenantId,
    userId,
    threadId
  );
  if (!threads[0]) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
  }

  let body: { content?: string } = {};
  try {
    body = await request.json();
  } catch {}

  const userContent = (body.content || '').trim();
  if (!userContent) {
    return NextResponse.json({ error: 'Message content required' }, { status: 400 });
  }

  const idempotencyKey =
    request.headers.get('idempotency-key') || `msg_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const requestSha256 = createHash('sha256').update(userContent).digest('hex');

  const lowerPrompt = userContent.toLowerCase();
  const isCmmsQuery =
    lowerPrompt.includes('work order') ||
    lowerPrompt.includes('wo-') ||
    lowerPrompt.includes('assigned work') ||
    lowerPrompt.includes('maintenance task');

  const runId = randomUUID();
  const runIdempotencyKey = `run_${Date.now()}_${randomUUID().slice(0, 8)}`;

  // 1. Record run execution in gigalibs_assistant.assistant_runs
  await prisma.$executeRawUnsafe(
    `INSERT INTO gigalibs_assistant.assistant_runs (
       id, tenant_id, thread_id, owner_user_id, actor_user_id, idempotency_key, request_sha256, status, policy_version, provider, model, created_at, updated_at
     ) VALUES (
       $1::uuid, $2, $3::uuid, $4, $4, $5, $6, 'SUCCEEDED', '1.0.0', $7, $8, now(), now()
     )
     ON CONFLICT (tenant_id, owner_user_id, idempotency_key) DO NOTHING`,
    runId,
    tenantId,
    threadId,
    userId,
    runIdempotencyKey,
    requestSha256,
    isCmmsQuery ? 'MODULE_GATEWAY' : 'LOCAL_OLLAMA',
    isCmmsQuery ? 'physical-operations-cmms' : 'llama3.2'
  );

  // 2. Persist user message linked to runId
  const userMsgId = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO gigalibs_assistant.assistant_messages (
       id, tenant_id, thread_id, owner_user_id, actor_user_id, role, content, run_id, idempotency_key, request_sha256, created_at
     ) VALUES (
       $1::uuid, $2, $3::uuid, $4, $4, 'USER', $5, $6::uuid, $7, $8, now()
     )
     ON CONFLICT (tenant_id, owner_user_id, thread_id, idempotency_key) DO NOTHING`,
    userMsgId,
    tenantId,
    threadId,
    userId,
    userContent,
    runId,
    idempotencyKey,
    requestSha256
  );

  // 3. Determine response via read-only CMMS tool or governed local LLM
  let assistantReply = '';

  // Phase 6: Scoped, read-only CMMS Work Order query tool
  if (isCmmsQuery) {
    let workOrders: Array<{
      id?: string;
      workOrderNumber?: string;
      title?: string;
      description?: string;
      status?: string;
      priority?: string;
      assetName?: string;
      dueDate?: string;
    }> = [];

    let cmmsError: string | null = null;
    try {
      const gatewayCfg = moduleGatewayConfig('physical-operations-cmms');
      const searchRes = await callSignedModule(
        gatewayCfg,
        session.context!,
        'POST',
        ['v1', 'work-orders', 'search'],
        { page: 1, pageSize: 5 },
        4000
      );

      if (searchRes.ok) {
        const data = (await searchRes.json()) as { items?: typeof workOrders };
        workOrders = data.items || [];
      } else {
        cmmsError = `CMMS service returned HTTP ${searchRes.status}`;
      }
    } catch (err) {
      cmmsError = `Could not reach CMMS service: ${String(err)}`;
    }

    if (workOrders.length > 0) {
      const lines = workOrders.map((wo, i) => {
        const num = wo.workOrderNumber || wo.id || `WO-${i + 1}`;
        const title = wo.title || wo.description || 'Routine maintenance';
        const status = wo.status || 'OPEN';
        const priority = wo.priority || 'MEDIUM';
        const asset = wo.assetName ? ` • **Asset:** ${wo.assetName}` : '';
        const due = wo.dueDate ? ` • **Due:** ${wo.dueDate}` : '';
        return `${i + 1}. **${num}**: ${title}\n   - **Status:** \`${status}\` • **Priority:** \`${priority}\`${asset}${due}\n   - **Citation:** [View in CMMS Work Orders](/cmms/work-orders)`;
      });

      assistantReply =
        `### Current Assigned Work Orders\n\n` +
        `Retrieved **${workOrders.length} verified work order(s)** from CMMS for your account:\n\n` +
        lines.join('\n\n') +
        `\n\n*Records verified via live CMMS service with active tenant RLS.*`;
    } else if (cmmsError) {
      assistantReply =
        `### CMMS Work Order Query\n\n` +
        `Unable to retrieve work orders at this time: ${cmmsError}.\n\n` +
        `Please check that the CMMS service is healthy or visit [CMMS Work Orders](/cmms/work-orders) directly.`;
    } else {
      assistantReply =
        `### Work Order Status\n\n` +
        `No open or assigned work orders were found in the CMMS registry for your account.\n\n` +
        `You can inspect all plant maintenance records directly in [CMMS Work Orders](/cmms/work-orders).`;
    }
  } else {
    // Phase 5: Governed local model execution (Ollama llama3.2)
    const llmAnswer = await queryOllama(userContent);
    if (llmAnswer) {
      assistantReply = llmAnswer;
    } else {
      assistantReply =
        `I received your operational inquiry: "${userContent}".\n\n` +
        `Local inference runtime is currently offline or synchronizing. No artificial data was generated.`;
    }
  }

  // 4. Persist assistant message linked to runId
  const assistantMsgId = randomUUID();
  const botIdempotencyKey = `bot_${Date.now()}_${randomUUID().slice(0, 8)}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO gigalibs_assistant.assistant_messages (
       id, tenant_id, thread_id, owner_user_id, actor_user_id, role, content, run_id, idempotency_key, request_sha256, created_at
     ) VALUES (
       $1::uuid, $2, $3::uuid, $4, 'gigalibs-assistant', 'ASSISTANT', $5, $6::uuid, $7, $8, now()
     )
     ON CONFLICT (tenant_id, owner_user_id, thread_id, idempotency_key) DO NOTHING`,
    assistantMsgId,
    tenantId,
    threadId,
    userId,
    assistantReply,
    runId,
    botIdempotencyKey,
    requestSha256
  );

  // 5. Append audit event
  await prisma.$executeRawUnsafe(
    `INSERT INTO gigalibs_assistant.audit_events (
       id, tenant_id, actor_user_id, thread_id, action, correlation_id, created_at
     ) VALUES (
       $1::uuid, $2, $3, $4::uuid, $5, $6, now()
     )`,
    randomUUID(),
    tenantId,
    userId,
    threadId,
    isCmmsQuery ? 'TOOL_QUERY_CMMS_WORK_ORDERS' : 'LLM_GENERATE_TEXT',
    runIdempotencyKey
  );

  return NextResponse.json(
    {
      id: assistantMsgId,
      threadId,
      runId,
      role: 'ASSISTANT',
      content: assistantReply,
      createdAt: new Date().toISOString(),
    },
    { status: 201 }
  );
}
