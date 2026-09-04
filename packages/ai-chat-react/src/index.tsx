/**
 * @gigalibs/ai-chat-react
 *
 * ChatGPT-Style conversational AI React components with real-time
 * Server-Sent Events (SSE) streaming token renderers.
 *
 * @module
 */

import * as React from 'react';
import type { AIMessage } from '@gigalibs/ai-chat-core';

export function useAIChat({ apiUrl = 'http://localhost:3000' } = {}) {
  const [messages, setMessages] = React.useState<AIMessage[]>([]);
  const [isStreaming, setIsStreaming] = React.useState(false);

  const sendMessage = async (prompt: string, conversationId = 'default') => {
    const userMsg: AIMessage = { role: 'user', content: prompt };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);

    const assistantMsg: AIMessage = { role: 'assistant', content: '' };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const response = await fetch(`${apiUrl}/ai-chat/conversations/${conversationId}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data:')) {
            try {
              const data = JSON.parse(line.replace('data:', '').trim());
              if (data.token) {
                setMessages((prev) => {
                  const copy = [...prev];
                  const last = copy[copy.length - 1];
                  if (last && last.role === 'assistant') {
                    last.content += data.token;
                  }
                  return copy;
                });
              }
            } catch {
              // ignore malformed chunks
            }
          }
        }
      }
    } catch {
      // Stream error
    } finally {
      setIsStreaming(false);
    }
  };

  return { messages, isStreaming, sendMessage };
}

export const AIChatWindow: React.FC<{ apiUrl?: string; title?: string }> = ({
  apiUrl,
  title = 'AI Assistant',
}) => {
  const { messages, isStreaming, sendMessage } = useAIChat({ apiUrl });
  const [input, setInput] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    sendMessage(input);
    setInput('');
  };

  return (
    <div className="flex flex-col h-[550px] w-full max-w-xl bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="h-14 px-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <h3 className="font-semibold text-sm">{title}</h3>
        </div>
        <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded">GPT-4o</span>
      </div>

      <div className="flex-1 p-5 overflow-y-auto space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-xs text-slate-400 mt-28">
            How can I assist you with your project today? 🤖
          </div>
        ) : (
          messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : 'bg-slate-100 text-slate-800 rounded-bl-none'
                }`}
              >
                {m.content || (isStreaming && idx === messages.length - 1 ? 'Thinking...' : '')}
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-100 flex items-center space-x-2 bg-slate-50/50">
        <input
          type="text"
          value={input}
          disabled={isStreaming}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything..."
          className="flex-1 h-11 px-4 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
        <button
          type="submit"
          disabled={isStreaming}
          className="h-11 px-5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium text-sm rounded-xl transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
};
