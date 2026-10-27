import type { AgentToolCall, AgentToolResult, ToolExecutor } from '@gigalibs/contracts';

// WI-OI-120bc (Giga AI Companion): the ToolExecutor — turns a tool call into a real backend request. The route injects
// a `caller` carrying the signed-in user's auth and the control-plane base URL, so a tool runs as the person (the
// least-privilege filter already decided WHICH tools are offered). Only tools with a verified backend route are bound
// here; any other offered tool returns an honest "not wired yet" failure rather than a fabricated call. Bindings grow
// as module HTTP surfaces are confirmed.

export interface CompanionHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly data: unknown;
}

/** The authenticated HTTP caller the route provides. */
export type CompanionHttpCaller = (
  method: 'GET' | 'POST',
  path: string,
  init?: { readonly query?: Record<string, string | undefined>; readonly body?: unknown },
) => Promise<CompanionHttpResponse>;

interface ToolBinding {
  readonly method: 'GET' | 'POST';
  readonly build: (args: Record<string, unknown>) => {
    readonly path: string;
    readonly query?: Record<string, string | undefined>;
    readonly body?: unknown;
  };
  readonly summarize: (data: unknown) => string;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

// Bound to control-plane routes verified this session (WI-OI-015 metering, M-CUR exchange-rate store).
const BINDINGS: Record<string, ToolBinding> = {
  'billing.usage.statement': {
    method: 'GET',
    build: (a) => ({
      path: '/usage/statement',
      query: { plan: str(a.plan), period: str(a.period) },
    }),
    summarize: (d) => {
      const s = (d ?? {}) as { periodKey?: string; plan?: string; totalAmountMinor?: number };
      return `Usage statement for ${s.periodKey ?? 'this period'} on ${s.plan ?? 'the plan'}: total ${s.totalAmountMinor ?? 0} minor units.`;
    },
  },
  'currency.rates.table': {
    method: 'GET',
    build: (a) => ({ path: '/currency/exchange-rates/table', query: { base: str(a.base) } }),
    summarize: (d) => {
      const s = (d ?? {}) as { base?: string; rates?: readonly unknown[] };
      return `Exchange-rate table for base ${s.base ?? '?'}: ${s.rates?.length ?? 0} rate(s).`;
    },
  },
};

/** Build a ToolExecutor over an authenticated caller. Unknown/unbound tools fail with a clear reason, never a guess. */
export function createCompanionToolExecutor(caller: CompanionHttpCaller): ToolExecutor {
  return {
    async execute(call: AgentToolCall): Promise<AgentToolResult> {
      const binding = BINDINGS[call.tool];
      if (!binding) {
        return {
          callId: call.id,
          ok: false,
          summary: `Tool "${call.tool}" is not wired to a backend yet.`,
        };
      }
      const req = binding.build(call.arguments);
      try {
        const res = await caller(binding.method, req.path, { query: req.query, body: req.body });
        if (!res.ok) {
          return {
            callId: call.id,
            ok: false,
            summary: `${call.tool} failed (HTTP ${res.status}).`,
          };
        }
        const data =
          res.data && typeof res.data === 'object'
            ? (res.data as Record<string, unknown>)
            : undefined;
        return { callId: call.id, ok: true, summary: binding.summarize(res.data), data };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { callId: call.id, ok: false, summary: `${call.tool} could not run: ${msg}` };
      }
    },
  };
}
