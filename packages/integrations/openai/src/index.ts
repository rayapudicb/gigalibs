import OpenAI from 'openai';

export type OpenAIMessage = {
  role: 'developer' | 'system' | 'user' | 'assistant';
  content: string;
};

export interface OpenAIConfig {
  apiKey: string;
  organizationId?: string;
  projectId?: string;
  timeoutMs: number;
  maxRetries: number;
  storeResponses: boolean;
}

export interface OpenAITextRequest {
  model: string;
  messages: readonly OpenAIMessage[];
  maxOutputTokens?: number;
  temperature?: number;
}

export interface OpenAITextResult {
  id: string;
  model: string;
  status: string | null;
  outputText: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } | null;
}

export class OpenAIAdapter {
  private readonly client: OpenAI;

  constructor(private readonly config: OpenAIConfig) {
    if (!config.apiKey.trim()) throw new Error('OpenAI API key is required.');
    if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 1_000) {
      throw new Error('OpenAI timeout must be at least 1000 milliseconds.');
    }
    if (!Number.isSafeInteger(config.maxRetries) || config.maxRetries < 0 || config.maxRetries > 10) {
      throw new Error('OpenAI max retries must be between 0 and 10.');
    }
    this.client = new OpenAI({
      apiKey: config.apiKey,
      organization: config.organizationId,
      project: config.projectId,
      timeout: config.timeoutMs,
      maxRetries: config.maxRetries,
    });
  }

  async createTextResponse(request: OpenAITextRequest): Promise<OpenAITextResult> {
    const validated = this.validateRequest(request);
    const response = await this.client.responses.create({
      model: validated.model,
      input: [...validated.messages],
      store: this.config.storeResponses,
      ...(validated.maxOutputTokens === undefined
        ? {}
        : { max_output_tokens: validated.maxOutputTokens }),
      ...(validated.temperature === undefined ? {} : { temperature: validated.temperature }),
    });
    if (!response.output_text) throw new Error('OpenAI completed without a text response.');
    return {
      id: response.id,
      model: response.model,
      status: response.status ?? null,
      outputText: response.output_text,
      usage: response.usage
        ? {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : null,
    };
  }

  async *stream(request: OpenAITextRequest): AsyncGenerator<string> {
    const validated = this.validateRequest(request);
    const stream = await this.client.responses.create({
      model: validated.model,
      input: [...validated.messages],
      store: this.config.storeResponses,
      stream: true,
      ...(validated.maxOutputTokens === undefined
        ? {}
        : { max_output_tokens: validated.maxOutputTokens }),
      ...(validated.temperature === undefined ? {} : { temperature: validated.temperature }),
    });
    for await (const event of stream) {
      if (event.type === 'response.output_text.delta') yield event.delta;
      if (event.type === 'response.failed') {
        throw new Error(event.response.error?.message ?? 'OpenAI response failed.');
      }
      if (event.type === 'error') throw new Error(event.message);
    }
  }

  private validateRequest(request: OpenAITextRequest): OpenAITextRequest {
    if (!request.model.trim() || request.model.length > 200) {
      throw new Error('OpenAI model identifier is required.');
    }
    if (request.messages.length < 1 || request.messages.length > 1_000) {
      throw new Error('OpenAI input must contain between 1 and 1000 messages.');
    }
    for (const message of request.messages) {
      if (!message.content.trim() || message.content.length > 1_000_000) {
        throw new Error('OpenAI message content is empty or exceeds the adapter boundary.');
      }
    }
    if (
      request.maxOutputTokens !== undefined &&
      (!Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens < 1)
    ) {
      throw new Error('OpenAI max output tokens must be a positive integer.');
    }
    if (
      request.temperature !== undefined &&
      (!Number.isFinite(request.temperature) || request.temperature < 0 || request.temperature > 2)
    ) {
      throw new Error('OpenAI temperature must be between 0 and 2.');
    }
    return request;
  }
}
