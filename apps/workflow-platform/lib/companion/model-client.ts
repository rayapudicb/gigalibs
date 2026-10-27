import type { AgentMessage, ModelClient } from '@gigalibs/contracts';
import { type LlmConfig, callLlm } from '../llm-inference';

// WI-OI-120bc (Giga AI Companion): the real ModelClient, backed by the existing multi-provider llm-inference helper.
// It defaults to the LOCAL, air-gapped Ollama (llama3.2) that the platform already ships for generative UI — no cloud
// key, no external egress — and can be pointed at a cloud provider by options when one is configured. Each turn it
// renders the system prompt + transcript and asks for exactly one AgentDecision JSON object; runCompanion validates it.

export interface CompanionModelOptions {
  readonly provider?: LlmConfig['provider'];
  readonly model?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
}

const DECISION_TEMPLATE = [
  '{{system}}',
  '',
  '--- Conversation so far ---',
  '{{transcript}}',
  '',
  '--- Your turn ---',
  'Reply with ONLY the next decision as a single JSON object whose "kind" is one of',
  '"plan", "tool_calls", "show", "ask" or "done". No prose, no markdown fences.',
].join('\n');

/** Build the Companion's ModelClient. Defaults to local Ollama `llama3.2` (needs `OLLAMA_HOST`); fails closed if it is unset. */
export function createCompanionModelClient(options: CompanionModelOptions = {}): ModelClient {
  const provider = options.provider ?? 'ollama';
  const model = options.model ?? 'llama3.2';
  return {
    async decide(system: string, messages: readonly AgentMessage[]): Promise<unknown> {
      const transcript = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
      const config: LlmConfig = {
        provider,
        model,
        temperature: options.temperature ?? 0.1,
        max_tokens: options.maxTokens ?? 1024,
        prompt_template: DECISION_TEMPLATE,
      };
      return callLlm(config, { system, transcript });
    },
  };
}
