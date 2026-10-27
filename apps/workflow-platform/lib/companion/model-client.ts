import type { AgentMessage, ModelClient } from '@gigalibs/contracts';
import { type LlmConfig, LlmProviderUnavailableError, callLlm } from '../llm-inference';

// WI-OI-120bc (Giga AI Companion): the real ModelClient. For the LOCAL Ollama (default, no cloud key) it calls
// /api/generate with a JSON SCHEMA as `format` — Ollama's structured output then forces the model to emit a decision
// with a valid "kind", instead of free-form JSON that never parses. Set OLLAMA_MODEL to a stronger model
// (qwen2.5:7b, llama3.1:8b) for better field-filling. Cloud providers go through the shared llm-inference helper.

export interface CompanionModelOptions {
  readonly provider?: LlmConfig['provider'];
  readonly model?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
}

// Ollama structured-output schema: shallow but it REQUIRES a valid `kind`, which is what the model kept getting wrong.
// parseAgentDecision does the full validation afterwards.
const DECISION_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['plan', 'tool_calls', 'navigate', 'show', 'ask', 'done'] },
    summary: { type: 'string' },
    question: { type: 'string' },
    screen: { type: 'string' },
    reason: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, tool: { type: 'string' } },
        required: ['title'],
      },
    },
    calls: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          tool: { type: 'string' },
          arguments: { type: 'object' },
        },
        required: ['tool'],
      },
    },
    ui: { type: 'object' },
  },
  required: ['kind'],
} as const;

const DECISION_TEMPLATE = [
  '{{system}}',
  '',
  '--- Conversation so far ---',
  '{{transcript}}',
  '',
  '--- Your turn ---',
  'Reply with ONLY the next decision as a single JSON object with a "kind" field.',
].join('\n');

/**
 * Build the Companion's ModelClient. Defaults to local Ollama, model from `OLLAMA_MODEL` (else `llama3.2`), needs
 * `OLLAMA_HOST`; fails closed if it is unset.
 */
export function createCompanionModelClient(options: CompanionModelOptions = {}): ModelClient {
  const provider = options.provider ?? 'ollama';
  const model = options.model ?? process.env.OLLAMA_MODEL ?? 'llama3.2';
  const temperature = options.temperature ?? 0.1;
  return {
    async decide(system: string, messages: readonly AgentMessage[]): Promise<unknown> {
      const transcript = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n');

      if (provider === 'ollama') {
        const host = process.env.OLLAMA_HOST;
        if (!host) {
          throw new LlmProviderUnavailableError('OLLAMA_HOST is not configured');
        }
        const prompt = [
          system,
          '',
          '--- Conversation so far ---',
          transcript,
          '',
          '--- Your turn ---',
          'Return one decision as a JSON object with a "kind" field.',
        ].join('\n');
        let res: Response;
        try {
          res = await fetch(`${host}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              prompt,
              stream: false,
              format: DECISION_SCHEMA,
              options: { temperature },
            }),
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new LlmProviderUnavailableError(`Ollama host ${host} connection failed: ${msg}`);
        }
        const data = (await res.json().catch(() => ({}))) as { response?: string; error?: string };
        if (!res.ok)
          return { raw: `ollama HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}` };
        if (data.error) return { raw: `ollama error: ${data.error}` };
        const text = (data.response ?? '').trim();
        if (!text) return { raw: `ollama returned an empty response (model=${model})` };
        try {
          return JSON.parse(text);
        } catch {
          return { raw: text.slice(0, 300) };
        }
      }

      // Cloud providers (when configured) through the shared helper.
      const config: LlmConfig = {
        provider,
        model,
        temperature,
        max_tokens: options.maxTokens ?? 1024,
        prompt_template: DECISION_TEMPLATE,
      };
      return callLlm(config, { system, transcript });
    },
  };
}
