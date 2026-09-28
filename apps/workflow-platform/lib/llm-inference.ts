// LLM_INFERENCE node handler.
// Supports: openai, anthropic, groq (cloud) and ollama (local self-hosted).
// Fails closed with LlmProviderUnavailableError when API keys or hosts are missing.

export interface LlmConfig {
  provider: 'openai' | 'anthropic' | 'groq' | 'ollama';
  model: string;
  prompt_template: string;
  output_schema?: Record<string, unknown>;
  temperature?: number;
  max_tokens?: number;
}

/** Fills {{field}} references in a prompt template from context data. */
function renderTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = context[key];
    return val !== undefined ? (typeof val === 'object' ? JSON.stringify(val) : String(val)) : `{{${key}}}`;
  });
}

export class LlmProviderUnavailableError extends Error {
  readonly code = 'DEPENDENCY_UNAVAILABLE';
  readonly status = 503;
  constructor(message: string) {
    super(message);
    this.name = 'LlmProviderUnavailableError';
  }
}

async function callOpenAi(config: LlmConfig, prompt: string): Promise<Record<string, unknown>> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new LlmProviderUnavailableError('Configuration required: OPENAI_API_KEY is not configured');
  }

  const systemPrompt = config.output_schema
    ? `You are a JSON extraction engine. Always respond with valid JSON matching this schema: ${JSON.stringify(config.output_schema)}. No markdown, no explanation.`
    : 'You are a helpful assistant that returns concise, structured JSON responses.';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model ?? 'gpt-4o-mini',
      temperature: config.temperature ?? 0.2,
      max_tokens: config.max_tokens ?? 512,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
      ...(config.output_schema ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? '{}';
  try { return JSON.parse(content); } catch { return { raw: content }; }
}

async function callAnthropic(config: LlmConfig, prompt: string): Promise<Record<string, unknown>> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new LlmProviderUnavailableError('Configuration required: ANTHROPIC_API_KEY is not configured');
  }

  const systemPrompt = config.output_schema
    ? `Return only valid JSON matching this schema: ${JSON.stringify(config.output_schema)}. No markdown fences.`
    : 'Return concise, structured JSON.';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model ?? 'claude-haiku-4-5',
      max_tokens: config.max_tokens ?? 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json() as { content?: Array<{ text?: string }> };
  const content = data.content?.[0]?.text ?? '{}';
  try { return JSON.parse(content); } catch { return { raw: content }; }
}

async function callGroq(config: LlmConfig, prompt: string): Promise<Record<string, unknown>> {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new LlmProviderUnavailableError('Configuration required: GROQ_API_KEY is not configured');
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model ?? 'llama-3.1-8b-instant',
      temperature: config.temperature ?? 0.1,
      max_tokens: config.max_tokens ?? 512,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? '{}';
  try { return JSON.parse(content); } catch { return { raw: content }; }
}

async function callOllama(config: LlmConfig, prompt: string): Promise<Record<string, unknown>> {
  const host = process.env.OLLAMA_HOST;
  if (!host) {
    throw new LlmProviderUnavailableError('Configuration required: OLLAMA_HOST is not configured');
  }
  try {
    const res = await fetch(`${host}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.model ?? 'llama3.2', prompt, stream: false, format: 'json' }),
    });
    const data = await res.json() as { response?: string };
    try { return JSON.parse(data.response ?? '{}'); } catch { return { raw: data.response }; }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new LlmProviderUnavailableError(`Ollama host ${host} connection failed: ${msg}`);
  }
}

export async function callLlm(
  config: LlmConfig,
  context: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const prompt = renderTemplate(config.prompt_template, context);

  switch (config.provider) {
    case 'anthropic': return callAnthropic(config, prompt);
    case 'groq':      return callGroq(config, prompt);
    case 'ollama':    return callOllama(config, prompt);
    case 'openai':
    default:          return callOpenAi(config, prompt);
  }
}
