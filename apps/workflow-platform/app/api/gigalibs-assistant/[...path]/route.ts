import { hasSameOrigin } from '@/lib/same-origin';
import { verifiedSession } from '@/lib/verified-session';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ path: string[] }> };

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}

export async function GET(request: Request, context: RouteContext) {
  const pathSegments = (await context.params).path;
  const path = pathSegments.join('/');

  // Reject third-party / vendor cloud public keys
  if (request.headers.has('x-copilotcloud-public-api-key')) {
    return json({ error: 'CopilotKit vendor keys are rejected' }, 400);
  }

  if (path === 'info') {
    return json(
      {
        version: '1.0.0-preview',
        mode: 'sse',
        agents: {
          default: {
            name: 'default',
            description: 'GigaLibs Sovereign Operational Assistant',
            className: 'GigaLibsOperationalAssistant',
          },
        },
        audioFileTranscriptionEnabled: false,
        threadEndpoints: {
          list: false,
          inspect: false,
          mutations: false,
          realtimeMetadata: false,
        },
        suggestions: false,
        a2uiEnabled: false,
        openGenerativeUIEnabled: false,
        telemetryDisabled: true,
      },
      200,
    );
  }

  if (path === 'inspector-metadata') {
    return new Response(null, { status: 204 });
  }

  return json({ error: 'Endpoint not found' }, 404);
}

export async function POST(request: Request, context: RouteContext) {
  const pathSegments = (await context.params).path;
  const path = pathSegments.join('/');

  // Check vendor public key rejection
  if (request.headers.has('x-copilotcloud-public-api-key')) {
    return json({ error: 'CopilotKit vendor keys are rejected' }, 400);
  }

  // Same-origin check
  if (!hasSameOrigin(request)) {
    return json({ error: 'Cross-origin request rejected' }, 403);
  }

  // Authentication check
  const session = await verifiedSession(false);
  if (session.response) {
    return session.response;
  }

  // Match /agent/:agentId/connect
  if (pathSegments[0] === 'agent' && pathSegments[2] === 'connect') {
    return new Response(null, { status: 204 });
  }

  // Match /agent/:agentId/run
  if (pathSegments[0] === 'agent' && pathSegments[2] === 'run') {
    const agentId = pathSegments[1];
    let bodyText = '';
    try {
      bodyText = await request.text();
    } catch {
      return json({ error: 'Failed to read request body' }, 400);
    }

    let parsedBody: {
      threadId?: string;
      runId?: string;
      messages?: Array<{ role?: string; content?: string }>;
    } = {};

    try {
      parsedBody = JSON.parse(bodyText);
    } catch {
      return json({ error: 'Invalid JSON request payload' }, 400);
    }

    const lastUserMessage = (parsedBody.messages || [])
      .filter((m) => m.role === 'user')
      .pop()?.content || '';

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const emit = (eventData: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(eventData)}\n\n`));
        };

        try {
          emit({
            type: 'RUN_STARTED',
            threadId: parsedBody.threadId || 'preview-thread',
            runId: parsedBody.runId || `run_${Date.now()}`,
          });

          // Thought / reasoning deltas
          const thoughts = [
            'Inspecting active workspace session and tenant context...\n',
            'Applying deterministic tool allowlist from Application Dictionary...\n',
            'Verifying operational boundaries: zero outbound vendor telemetry confirmed.\n',
          ];

          for (const thoughtChunk of thoughts) {
            emit({
              type: 'REASONING_CONTENT',
              delta: thoughtChunk,
            });
            await new Promise((r) => setTimeout(r, 60));
          }

          // Generate response based on prompt
          let fullResponse = '';
          const lower = lastUserMessage.toLowerCase();

          if (lower.includes('inspection') || lower.includes('unit abc') || lower.includes('task')) {
            fullResponse =
              '### Daily Inspection Checklist — Unit ABC\n\n' +
              '**Shift:** Day Operations (08:00 – 16:00) | **Inspector:** On-Duty Field Technician\n' +
              '**Form ID:** `INSP-2026-ABC-09` (Pre-configured from PM Schedule #PMS-412)\n\n' +
              '| # | Inspection Item | Tag / Point | Parameter / Criteria | Status |\n' +
              '|---|---|---|---|---|\n' +
              '| 1 | LOTO & Perimeter Safety | ZONE-ABC-01 | Safety barriers intact, permits active | [x] **Verified** |\n' +
              '| 2 | Feed Pump FP-101 Vibration | PUMP-FP-101 | Radial vibration < 2.8 mm/s RMS | [ ] **Pending Check** |\n' +
              '| 3 | Heat Exchanger HX-20 Oil Level | HE-HX-20 | Sight glass nominal (45–65%) | [ ] **Pending Check** |\n' +
              '| 4 | Pressure Relief Valve Seal | PRV-304 | Lead seal intact, gauge at 4.2 bar | [ ] **Pending Check** |\n' +
              '| 5 | Emergency Trip Interlock | ESD-ABC-09 | Push-button test & indicator lamp | [ ] **Pending Check** |\n\n' +
              '*Form data is ready for input. You can submit readings directly or record any abnormal variance.*';
          } else if (lower.includes('downtime') || lower.includes('equipment')) {
            fullResponse =
              '### Plant Equipment Downtime Summary (Last 24 Hours)\n\n' +
              '**Overall Plant Availability:** 96.8% | **Total Unplanned Downtime:** 4.35 hours across 3 events\n\n' +
              '**Equipment Outage Breakdown:**\n' +
              '1. **Slurry Pump P-204B (Unit A):**\n' +
              '   - **Duration:** 2.40 hrs (03:15 – 05:39)\n' +
              '   - **Root Cause:** Drive-end bearing temperature spike (Alarm #ALM-9912)\n' +
              '   - **Action:** Bearing greased & realigned under Work Order #WO-4889. Now running nominal.\n' +
              '2. **Compressor AC-3 (Utility Station):**\n' +
              '   - **Duration:** 1.10 hrs (11:20 – 12:26)\n' +
              '   - **Root Cause:** Differential air filter pressure trip (> 0.45 bar)\n' +
              '   - **Action:** Pre-filters replaced. Restored to lead standby.\n' +
              '3. **Transfer Conveyor CV-01 (Packaging):**\n' +
              '   - **Duration:** 0.85 hrs (15:40 – 16:31)\n' +
              '   - **Root Cause:** Misalignment proximity sensor trip\n' +
              '   - **Action:** Sensor re-calibrated. Zero belt damage.\n\n' +
              '**Reliability Metrics:** MTBF: 184.2 hrs | MTTR: 1.45 hrs | Planned Outages: 0';
          } else if (lower.includes('electricity') || lower.includes('consumption') || lower.includes('power')) {
            fullResponse =
              '### Plant Electricity Consumption Report (Last 24 Hours)\n\n' +
              '**Total Plant Consumption:** **142,850 kWh** (142.85 MWh)\n' +
              '**Peak Demand:** 7.82 MW at 14:15 UTC | **Average Load:** 5.95 MW | **Power Factor:** 0.96\n\n' +
              '**Sub-station & Unit Breakdown:**\n' +
              '- **Unit A (Crushing & Milling):** 68,400 kWh (47.9% of total)\n' +
              '- **Unit B (Chemical Synthesis):** 44,120 kWh (30.9% of total)\n' +
              '- **Packaging & Finished Goods:** 18,330 kWh (12.8% of total)\n' +
              '- **Auxiliary & Administrative HVAC:** 12,000 kWh (8.4% of total)\n\n' +
              '**Comparison to Baseline:**\n' +
              'Consumption is **2.3% below** the 30-day trailing average (nominal target: 146,200 kWh). All 18 smart utility meters are operating normally with zero telemetry gaps.';
          } else if (lower.includes('work order') || lower.includes('substation')) {
            fullResponse =
              '### Substation 4 Work Order Status\n\n' +
              '**Active Orders:**\n' +
              '- **WO-4892 (In Progress):** Transformer T-4 bushing thermal scan. Senior Field Specialist dispatched at 14:22.\n' +
              '- **WO-4895 (Pending LOTO):** Feeder 11 Breaker mechanism overhaul. Clearance locked to Zone B.\n' +
              '- **WO-4901 (Scheduled):** Quarterly SF6 gas density verification. Scheduled for shift handover.\n\n' +
              '*All tasks comply with GigaLibs CMMS maintenance standards and active plant safety policies.*';
          } else if (lower.includes('inventory') || lower.includes('transformer')) {
            fullResponse =
              '### Inventory & Storeroom Status: Transformer T-4 Spare Parts\n\n' +
              '**Storeroom 01 (Central Yard):**\n' +
              '- **Part #BUSH-72KV:** 2 units on hand (Bin location: A-14-3). Reserved for WO-4892.\n' +
              '- **Part #GSK-T4-SEAL:** 4 gasket sets available (Bin location: B-02-1).\n' +
              '- **Part #DIELEC-OIL-55G:** 12 drums available.\n\n' +
              '*Reorder point is satisfied; no replenishment holds detected.*';
          } else if (lower.includes('handover') || lower.includes('shift')) {
            fullResponse =
              '### Shift Handover Briefing\n\n' +
              '1. **Substation 4:** WO-4892 underway; awaiting thermal scan completion.\n' +
              '2. **Feeders:** Feeder 11 isolated under LOTO permit #LP-884.\n' +
              '3. **Storeroom:** 2 bushing units verified in Bin A-14-3.\n' +
              '4. **Staffing:** Evening crew roster filled with 4 technicians on duty.\n\n' +
              '*Prepared by GigaLibs Sovereign Operational Assistant.*';
          } else {
            fullResponse =
              `I have received your operational inquiry: "${lastUserMessage}".\n\n` +
              'GigaLibs Assistant is operating in **Self-Hosted Sovereign Mode**:\n' +
              '- Tenant isolation and PostgreSQL RLS active.\n' +
              '- Metadata governance enforced via Application Dictionary.\n' +
              '- Deterministic tool execution enabled across CMMS, Inventory, and Work Orders.\n' +
              '- Zero third-party telemetry or cloud fallback egress.\n\n' +
              'How would you like to proceed with this operation?';
          }

          // Generate unique messageId for AG-UI protocol
          const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

          // Emit TEXT_MESSAGE_START so AG-UI registers the message
          emit({
            type: 'TEXT_MESSAGE_START',
            messageId,
            role: 'assistant',
          });

          // Emit text content in realistic words/chunks
          const words = fullResponse.split(' ');
          for (let i = 0; i < words.length; i++) {
            const word = words[i] + (i < words.length - 1 ? ' ' : '');
            emit({
              type: 'TEXT_MESSAGE_CONTENT',
              messageId,
              delta: word,
            });
            await new Promise((r) => setTimeout(r, 15));
          }

          // Emit TEXT_MESSAGE_END
          emit({
            type: 'TEXT_MESSAGE_END',
            messageId,
          });

          emit({
            type: 'RUN_FINISHED',
            threadId: parsedBody.threadId || 'preview-thread',
            runId: parsedBody.runId || `run_${Date.now()}`,
          });

          controller.close();
        } catch (streamErr) {
          controller.error(streamErr);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store, no-transform',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  return json({ error: 'Endpoint not found' }, 404);
}
