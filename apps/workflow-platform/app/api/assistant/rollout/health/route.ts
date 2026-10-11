import { NextResponse } from 'next/server';
import {
  getAssistantCircuitBreakerStatus,
  getAssistantSLOMetrics,
  triggerEmergencyHalt,
  resetCircuitBreaker,
} from '@/lib/assistant-rollout';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const circuitBreaker = getAssistantCircuitBreakerStatus();
  const metrics = getAssistantSLOMetrics();

  const statusCode = circuitBreaker.halted ? 503 : 200;

  return NextResponse.json(
    {
      service: 'gigalibs-assistant-rollout',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      gate: 'G6_G7_CONTROLLED_PRODUCTION_ROLLOUT',
      status: metrics.status,
      circuitBreaker,
      sloMetrics: metrics,
      modelRuntime: {
        engine: 'Ollama',
        model: 'llama3.2:3b',
        endpoint: 'http://127.0.0.1:11434',
        egressEnforced: 'AIRGAP_ZERO_EGRESS',
      },
    },
    { status: statusCode },
  );
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as { action?: string; reason?: string };
    if (body.action === 'HALT') {
      triggerEmergencyHalt(body.reason ?? 'Manual operational halt invoked');
      return NextResponse.json({ status: 'HALTED', reason: body.reason });
    }
    if (body.action === 'RESUME') {
      resetCircuitBreaker();
      return NextResponse.json({ status: 'RESUMED' });
    }
    return NextResponse.json({ error: 'Unknown action; supported: HALT, RESUME' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
