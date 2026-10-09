'use client';

import { useCallback, useRef, useState } from 'react';
import type { AssistantMessage } from './types';

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  }
  return `msg_${Date.now()}_${Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function useAssistantChat() {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const clearMessages = useCallback(() => {
    abort();
    setMessages([]);
    setError(null);
  }, [abort]);

  const sendMessage = useCallback(
    async (overrideText?: string) => {
      const content = (overrideText ?? input).trim();
      if (!content || isStreaming) return;

      setError(null);
      setInput('');

      const userMessageId = createId();
      const assistantMessageId = createId();

      const userMsg: AssistantMessage = {
        id: userMessageId,
        role: 'user',
        content,
        status: 'complete',
        createdAt: new Date().toISOString(),
      };

      const assistantMsg: AssistantMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch('/api/gigalibs-assistant/agent/default/run', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            threadId: 'preview-thread',
            runId: `run_${Date.now()}`,
            messages: [
              ...messages.map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
              })),
              { id: userMessageId, role: 'user', content },
            ],
            state: {},
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || `Assistant request failed with status ${response.status}`,
          );
        }

        if (!response.body) {
          throw new Error('Response body stream is not available');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let accumulatedText = '';
        let accumulatedThought = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;

            if (trimmed.startsWith('data:')) {
              const dataPayload = trimmed.replace(/^data:\s*/, '');
              try {
                const parsed = JSON.parse(dataPayload);
                if (parsed.type === 'TEXT_MESSAGE_CONTENT' && parsed.delta) {
                  accumulatedText += parsed.delta;
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId
                        ? { ...msg, content: accumulatedText }
                        : msg,
                    ),
                  );
                } else if (parsed.type === 'REASONING_CONTENT' && parsed.delta) {
                  accumulatedThought += parsed.delta;
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId
                        ? { ...msg, thought: accumulatedThought }
                        : msg,
                    ),
                  );
                }
              } catch {
                // If chunk is raw text rather than JSON
                accumulatedText += dataPayload;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: accumulatedText }
                      : msg,
                  ),
                );
              }
            } else {
              // Plain text or standard chunk fallback
              accumulatedText += trimmed;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: accumulatedText }
                    : msg,
                ),
              );
            }
          }
        }

        // Finalize assistant message
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content: accumulatedText || 'I am ready to assist you. (Synthetic Preview)',
                  status: 'complete',
                }
              : msg,
          ),
        );
      } catch (err: unknown) {
        if ((err as Error).name === 'AbortError') {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, status: 'complete' }
                : msg,
            ),
          );
        } else {
          const errorMessage = err instanceof Error ? err.message : 'Unknown assistant error';
          setError(errorMessage);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? {
                    ...msg,
                    status: 'error',
                    error: errorMessage,
                    content: msg.content || 'Failed to complete assistant generation.',
                  }
                : msg,
            ),
          );
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [input, isStreaming, messages],
  );

  return {
    messages,
    input,
    setInput,
    isStreaming,
    error,
    sendMessage,
    abort,
    clearMessages,
  };
}
