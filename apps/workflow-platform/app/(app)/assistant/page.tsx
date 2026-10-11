'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import {
  Bot,
  Send,
  Plus,
  MessageSquare,
  Clock,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  Sparkles,
  RefreshCw,
  Cpu,
} from 'lucide-react';
import { StatusBadge } from '@medusajs/ui';

interface Thread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  threadId: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
}

function renderFormattedContent(text: string) {
  // Parse markdown links [text](url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const label = match[1];
    const href = match[2];
    parts.push(
      <Link
        key={`${match.index}-${href}`}
        href={href}
        className="inline-flex items-center gap-1 font-medium text-ui-tag-blue-icon underline hover:text-ui-fg-interactive"
      >
        {label}
        <ExternalLink className="inline h-3 w-3" />
      </Link>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return <span className="whitespace-pre-wrap">{parts}</span>;
}

export default function AssistantPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  // Load threads
  const loadThreads = async () => {
    setLoadingThreads(true);
    setPolicyError(null);
    setError(null);
    try {
      const res = await fetch('/api/assistant/threads', { cache: 'no-store' });
      if (res.status === 503) {
        const data = await res.json().catch(() => ({}));
        setPolicyError(
          data.error ||
            'Assistant Policy Required: This tenant does not have an active published Assistant policy in Configuration Studio.'
        );
        setLoadingThreads(false);
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to load threads (${res.status})`);
      }
      const data = await res.json();
      const items: Thread[] = data.items || [];
      setThreads(items);
      if (items.length > 0 && !activeThreadId) {
        setActiveThreadId(items[0].id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading threads');
    } finally {
      setLoadingThreads(false);
    }
  };

  useEffect(() => {
    loadThreads();
  }, []);

  // Load messages when activeThreadId changes
  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }

    let isMounted = true;
    const fetchMessages = async () => {
      setLoadingMessages(true);
      setError(null);
      try {
        const res = await fetch(`/api/assistant/threads/${activeThreadId}/messages`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`Failed to load messages (${res.status})`);
        const data = await res.json();
        if (isMounted) {
          setMessages(data.items || []);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Error loading messages');
        }
      } finally {
        if (isMounted) setLoadingMessages(false);
      }
    };

    fetchMessages();
    return () => {
      isMounted = false;
    };
  }, [activeThreadId]);

  // Create new thread
  const handleCreateThread = async (initialTitle?: string) => {
    setError(null);
    try {
      const res = await fetch('/api/assistant/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: initialTitle || `Operations Session ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create thread');
      }
      const newThread: Thread = await res.json();
      setThreads((prev) => [newThread, ...prev]);
      setActiveThreadId(newThread.id);
      setMessages([]);
      return newThread.id;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error creating conversation');
      return null;
    }
  };

  // Send message
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend ?? inputValue).trim();
    if (!text || sending) return;

    setInputValue('');
    setError(null);
    setSending(true);

    let targetThreadId = activeThreadId;
    if (!targetThreadId) {
      const createdId = await handleCreateThread(
        text.slice(0, 32) + (text.length > 32 ? '...' : '')
      );
      if (!createdId) {
        setSending(false);
        return;
      }
      targetThreadId = createdId;
    }

    // Optimistic user message
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      threadId: targetThreadId,
      role: 'USER',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`/api/assistant/threads/${targetThreadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const botReply: Message = await res.json();
      setMessages((prev) => [...prev, botReply]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const suggestions = [
    'Please check my assigned work orders in CMMS',
    'What open maintenance tasks exist in the plant?',
    'What is the recommended viscosity index for heavy pump bearings?',
    'Review asset vibration standards according to ISO 10816',
  ];

  if (policyError) {
    return (
      <main className="mx-auto max-w-4xl p-8 text-ui-fg-base">
        <div className="rounded-xl border border-ui-border-error/40 bg-ui-bg-base p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-6 w-6 text-ui-fg-error shrink-0" />
            <div>
              <h1 className="text-lg font-semibold text-ui-fg-base">Tenant Policy Inactive</h1>
              <p className="mt-2 text-sm text-ui-fg-muted">{policyError}</p>
              <div className="mt-4 flex items-center gap-3">
                <Link
                  href="/configuration"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-ui-button-inverted px-3 py-1.5 text-xs font-medium text-ui-fg-on-inverted hover:bg-ui-button-inverted-hover"
                >
                  Open Configuration Studio
                </Link>
                <button
                  type="button"
                  onClick={loadThreads}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ui-border-base bg-ui-bg-base px-3 py-1.5 text-xs font-medium text-ui-fg-base hover:bg-ui-bg-subtle"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden bg-ui-bg-subtle text-ui-fg-base">
      {/* Thread Sidebar */}
      <aside aria-label="Conversation threads" className="flex w-72 flex-col border-r border-ui-border-base bg-ui-bg-base shrink-0">
        <div className="flex h-14 items-center justify-between border-b border-ui-border-base px-4">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-ui-fg-base" />
            <h2 className="text-sm font-semibold tracking-tight">Conversations</h2>
          </div>
          <button
            type="button"
            onClick={() => handleCreateThread()}
            title="Start new conversation"
            aria-label="Start new conversation"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-ui-border-base text-ui-fg-muted hover:bg-ui-bg-subtle hover:text-ui-fg-base transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingThreads ? (
            <div className="p-4 text-xs text-ui-fg-muted">Loading private threads...</div>
          ) : threads.length === 0 ? (
            <div className="p-4 text-center text-xs text-ui-fg-muted">
              No private threads found.
              <button
                type="button"
                onClick={() => handleCreateThread()}
                className="mt-2 block w-full rounded-md bg-ui-button-neutral px-2 py-1 text-xs text-ui-fg-base hover:bg-ui-bg-subtle-hover"
              >
                Create First Thread
              </button>
            </div>
          ) : (
            threads.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveThreadId(t.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                  activeThreadId === t.id
                    ? 'bg-ui-bg-subtle font-medium text-ui-fg-base border border-ui-border-base shadow-xs'
                    : 'text-ui-fg-muted hover:bg-ui-bg-subtle/50 hover:text-ui-fg-base'
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="truncate flex-1">{t.title}</span>
              </button>
            ))
          )}
        </div>

        {/* Sidebar Footer Metadata */}
        <div className="border-t border-ui-border-base p-3 text-[11px] text-ui-fg-muted bg-ui-bg-subtle/30">
          <div className="flex items-center gap-1.5 font-medium">
            <ShieldCheck className="h-3.5 w-3.5 text-ui-tag-green-icon" />
            <span>Sovereign & Isolated</span>
          </div>
          <p className="mt-1 text-[10px] text-ui-fg-muted/80">
            Encrypted RLS PostgreSQL persistence. Zero external egress.
          </p>
        </div>
      </aside>

      {/* Main Conversation Canvas */}
      <section aria-label="Conversation workspace" className="flex flex-1 flex-col min-w-0 bg-ui-bg-base">
        {/* Header Bar */}
        <header className="flex h-14 items-center justify-between border-b border-ui-border-base px-6">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-ui-fg-base truncate">
              {threads.find((t) => t.id === activeThreadId)?.title || 'Operational Intelligence Assistant'}
            </h1>
            <div className="flex items-center gap-2">
              <StatusBadge color="green">Local llama3.2</StatusBadge>
              <StatusBadge color="blue">CMMS Grounded</StatusBadge>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-ui-fg-muted">
            <Cpu className="h-3.5 w-3.5 text-ui-tag-green-icon" />
            <span>0-Byte Egress</span>
          </div>
        </header>

        {/* Message Thread Viewport */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="rounded-lg border border-ui-border-error/50 bg-ui-bg-error/10 p-3 text-xs text-ui-fg-error flex items-center justify-between">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="font-bold underline ml-2"
              >
                Dismiss
              </button>
            </div>
          )}

          {loadingMessages ? (
            <div className="flex h-32 items-center justify-center text-xs text-ui-fg-muted">
              Loading conversation history...
            </div>
          ) : messages.length === 0 ? (
            <div className="mx-auto max-w-xl py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-ui-bg-subtle text-ui-fg-base border border-ui-border-base shadow-xs mb-4">
                <Sparkles className="h-6 w-6 text-ui-fg-interactive" />
              </div>
              <h2 className="text-base font-semibold text-ui-fg-base">
                Operational Assistant
              </h2>
              <p className="mt-2 text-xs text-ui-fg-muted leading-relaxed">
                Directly connected to verified CMMS work order records and sovereign local inference.
                Answers are grounded in live records with real citations.
              </p>

              <div className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2 text-left">
                {suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(s)}
                    className="rounded-xl border border-ui-border-base bg-ui-bg-base p-3 text-xs text-ui-fg-base hover:bg-ui-bg-subtle hover:border-ui-border-interactive/40 transition-all shadow-xs"
                  >
                    💡 {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-3.5 max-w-3xl ${
                  m.role === 'USER' ? 'ml-auto flex-row-reverse' : ''
                }`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-semibold shadow-xs ${
                    m.role === 'USER'
                      ? 'bg-ui-bg-subtle text-ui-fg-base border border-ui-border-base'
                      : 'bg-ui-button-inverted text-ui-fg-on-inverted'
                  }`}
                >
                  {m.role === 'USER' ? 'U' : <Bot className="h-4 w-4" />}
                </div>

                <div
                  className={`flex flex-col rounded-2xl p-4 text-xs leading-relaxed shadow-xs ${
                    m.role === 'USER'
                      ? 'bg-ui-button-inverted text-ui-fg-on-inverted rounded-tr-xs max-w-lg'
                      : 'bg-ui-bg-subtle/80 text-ui-fg-base border border-ui-border-base rounded-tl-xs flex-1'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 mb-1.5 opacity-70 text-[10px]">
                    <span className="font-semibold uppercase tracking-wider">
                      {m.role === 'USER' ? 'You' : 'GigaLibs Sovereign Assistant'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {new Date(m.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <div className="text-xs">{renderFormattedContent(m.content)}</div>
                </div>
              </div>
            ))
          )}

          {sending && (
            <div className="flex gap-3.5 max-w-3xl">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-ui-button-inverted text-ui-fg-on-inverted shadow-xs">
                <Bot className="h-4 w-4 animate-spin" />
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-ui-bg-subtle/80 border border-ui-border-base p-4 text-xs text-ui-fg-muted">
                <span className="h-2 w-2 rounded-full bg-ui-fg-interactive animate-pulse" />
                <span>Consulting CMMS and sovereign local model...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Composer */}
        <div className="border-t border-ui-border-base bg-ui-bg-base p-4">
          <div className="mx-auto max-w-3xl">
            <div className="relative flex items-center rounded-2xl border border-ui-border-base bg-ui-bg-subtle/50 px-4 py-2 focus-within:border-ui-border-interactive focus-within:ring-1 focus-within:ring-ui-border-interactive shadow-xs">
              <textarea
                aria-label="Ask about work orders or operational guidelines"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about work orders or operational guidelines (e.g., 'Check my assigned work orders')..."
                rows={1}
                className="flex-1 resize-none bg-transparent text-xs text-ui-fg-base placeholder:text-ui-fg-muted focus:outline-none min-h-[28px] max-h-32"
              />
              <button
                type="button"
                disabled={sending || !inputValue.trim()}
                onClick={() => handleSendMessage()}
                title="Send message"
                aria-label="Send message"
                className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-ui-button-inverted text-ui-fg-on-inverted disabled:opacity-30 hover:bg-ui-button-inverted-hover transition-all"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] text-ui-fg-muted">
              Sovereign Operational Intelligence • Verified Live CMMS Records • Encrypted Private Persistence
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
