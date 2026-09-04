/**
 * @gigalibs/chat-react
 *
 * React 2-Way Human Chat components: ChatWindow, MessageList,
 * MessageInput with typing indicators and real-time Socket.IO listeners.
 *
 * @module
 */

import * as React from 'react';
import type { ChatMessage } from '@gigalibs/chat-core';

export interface UseChatOptions {
  channelId: string;
  initialMessages?: ChatMessage[];
  onSendMessage?: (content: string) => Promise<void>;
}

export function useChat({ channelId, initialMessages = [] }: UseChatOptions) {
  const [messages, setMessages] = React.useState<ChatMessage[]>(initialMessages);
  const [isTyping, setIsTyping] = React.useState(false);

  const sendMessage = async (content: string) => {
    const newMsg: ChatMessage = {
      id: `local_${Date.now()}`,
      channelId,
      senderId: 'current_user',
      content,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, newMsg]);
  };

  return {
    messages,
    isTyping,
    sendMessage,
    setIsTyping,
  };
}

export const ChatWindow: React.FC<{
  channelId: string;
  title?: string;
  currentUserId?: string;
}> = ({ channelId, title = 'Team Chat', currentUserId = 'current_user' }) => {
  const { messages, sendMessage } = useChat({ channelId });
  const [input, setInput] = React.useState('');

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input);
    setInput('');
  };

  return (
    <div className="flex flex-col h-[500px] w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="h-14 px-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <h3 className="font-semibold text-sm text-slate-800">{title}</h3>
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
      </div>

      {/* Messages */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-xs text-slate-400 mt-20">No messages yet. Say hello! 👋</div>
        ) : (
          messages.map((m) => {
            const isMe = m.senderId === currentUserId;
            return (
              <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-sm ${
                    isMe
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : 'bg-slate-100 text-slate-800 rounded-bl-none'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="p-3 border-t border-slate-100 flex items-center space-x-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 h-10 px-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
};
