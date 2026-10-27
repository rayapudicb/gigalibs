import type { AgentToolCall, AgentToolResult, ToolExecutor } from '@gigalibs/contracts';

// WI-OI-120bc (Giga AI Companion): the ToolExecutor — turns a tool call into a real backend request. Two targets:
// CONTROL-plane routes (via the injected control caller, carrying the user's token through authenticatedUpstream) and
// MODULE routes (via the injected module caller, which signs a per-module platform-context token through the module
// gateway). The least-privilege filter already chose WHICH tools are offered; the module also enforces the permission
// server-side. Only tools with a verified backend route are bound here; any other offered tool fails honestly.

export interface CompanionHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly data: unknown;
}

/** Calls a CONTROL-plane route with the user's token. */
export type CompanionHttpCaller = (
  method: 'GET' | 'POST',
  path: string,
  init?: { readonly query?: Record<string, string | undefined>; readonly body?: unknown },
) => Promise<CompanionHttpResponse>;

/** Calls a MODULE route (e.g. CMMS) through the signed module gateway, as the user. */
export type CompanionModuleCaller = (
  module: string,
  method: 'GET' | 'POST',
  segments: readonly string[],
  body?: unknown,
) => Promise<CompanionHttpResponse>;

type ToolBinding =
  | {
      readonly target: 'control';
      readonly method: 'GET' | 'POST';
      readonly build: (args: Record<string, unknown>) => {
        readonly path: string;
        readonly query?: Record<string, string | undefined>;
        readonly body?: unknown;
      };
      readonly summarize: (data: unknown) => string;
    }
  | {
      readonly target: 'module';
      readonly module: string;
      readonly method: 'GET' | 'POST';
      readonly build: (args: Record<string, unknown>) => {
        readonly segments: readonly string[];
        readonly body?: unknown;
      };
      readonly summarize: (data: unknown) => string;
    };

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const CMMS = 'physical-operations-cmms';

const BINDINGS: Record<string, ToolBinding> = {
  'billing.usage.statement': {
    target: 'control',
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
    target: 'control',
    method: 'GET',
    build: (a) => ({ path: '/currency/exchange-rates/table', query: { base: str(a.base) } }),
    summarize: (d) => {
      const s = (d ?? {}) as { base?: string; rates?: readonly unknown[] };
      return `Exchange-rate table for base ${s.base ?? '?'}: ${s.rates?.length ?? 0} rate(s).`;
    },
  },
  'cmms.workOrders.search': {
    target: 'module',
    module: CMMS,
    method: 'POST',
    build: (a) => ({
      segments: ['v1', 'work-orders', 'search'],
      body: { unitId: str(a.unitId), status: str(a.status), assetId: str(a.assetId) },
    }),
    summarize: (d) => {
      const s = (d ?? {}) as { rows?: readonly unknown[]; items?: readonly unknown[] };
      return `Found ${s.rows?.length ?? s.items?.length ?? 0} work order(s).`;
    },
  },
  'cmms.workOrders.create': {
    target: 'module',
    module: CMMS,
    method: 'POST',
    build: (a) => ({
      segments: ['v1', 'work-orders'],
      body: {
        title: str(a.title),
        assetId: str(a.assetId),
        priority: str(a.priority),
        description: str(a.description),
      },
    }),
    summarize: (d) => {
      const s = (d ?? {}) as { id?: string; number?: string; reference?: string };
      return `Work order created${s.number || s.reference || s.id ? ` (${s.number ?? s.reference ?? s.id})` : ''}.`;
    },
  },
};

const asData = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;

/** Build a ToolExecutor over a control caller (and, when available, a module caller). Unbound tools fail honestly. */
export function createCompanionToolExecutor(
  control: CompanionHttpCaller,
  moduleCaller?: CompanionModuleCaller,
): ToolExecutor {
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
      try {
        let res: CompanionHttpResponse;
        if (binding.target === 'control') {
          const req = binding.build(call.arguments);
          res = await control(binding.method, req.path, { query: req.query, body: req.body });
        } else {
          if (!moduleCaller) {
            return {
              callId: call.id,
              ok: false,
              summary: `${call.tool} needs the module gateway, which is not configured here.`,
            };
          }
          const req = binding.build(call.arguments);
          res = await moduleCaller(binding.module, binding.method, req.segments, req.body);
        }
        if (!res.ok) {
          return {
            callId: call.id,
            ok: false,
            summary: `${call.tool} failed (HTTP ${res.status}).`,
          };
        }
        return {
          callId: call.id,
          ok: true,
          summary: binding.summarize(res.data),
          data: asData(res.data),
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { callId: call.id, ok: false, summary: `${call.tool} could not run: ${msg}` };
      }
    },
  };
}
