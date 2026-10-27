import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCompanionModelClient } from '../lib/companion/model-client';
import { LlmProviderUnavailableError } from '../lib/llm-inference';

// WI-OI-120bc (Giga AI Companion): the local-Ollama ModelClient adapter. The HTTP boundary is stubbed — no live model
// needed — to prove it calls the local endpoint with the system + transcript and returns the parsed decision, and
// fails closed when the local host is not configured.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('createCompanionModelClient (local Ollama)', () => {
  it('posts the system + transcript to the local Ollama and returns the parsed decision', async () => {
    vi.stubEnv('OLLAMA_HOST', 'http://127.0.0.1:11434');
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ response: JSON.stringify({ kind: 'done', summary: 'All set.' }) }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = createCompanionModelClient();
    const decision = await client.decide('SYSTEM PROMPT', [{ role: 'user', content: 'hi there' }]);

    expect(decision).toEqual({ kind: 'done', summary: 'All set.' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:11434/api/generate');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('llama3.2');
    expect(body.format).toBe('json');
    expect(body.prompt).toContain('SYSTEM PROMPT');
    expect(body.prompt).toContain('USER: hi there');
  });

  it('fails closed when the local host is not configured', async () => {
    vi.stubEnv('OLLAMA_HOST', '');
    const client = createCompanionModelClient();
    await expect(client.decide('S', [])).rejects.toBeInstanceOf(LlmProviderUnavailableError);
  });
});
