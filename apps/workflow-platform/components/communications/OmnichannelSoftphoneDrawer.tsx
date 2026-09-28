'use client';

import React, { useState } from 'react';
import { Phone, PhoneCall, MessageSquare, Send, X, Smartphone } from 'lucide-react';
import { VoiceCallPanel } from './softphone/VoiceCallPanel';
import { DeliveryReceiptTicks } from './DeliveryReceiptTicks';

export function OmnichannelSoftphoneDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'phone' | 'whatsapp'>('phone');
  const [messages, setMessages] = useState([
    { sender: 'technician', text: 'En route to Substation 4 for transformer inspection.', time: '14:22', status: 'delivered' },
    { sender: 'dispatcher', text: 'Copy that. Work order WO-4892 is marked in-progress.', time: '14:23', status: 'read' },
  ]);
  const [inputMessage, setInputMessage] = useState('');

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;
    setMessages((prev) => [
      ...prev,
      {
        sender: 'dispatcher',
        text: inputMessage.trim(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'delivered',
      },
    ]);
    setInputMessage('');
  };

  return (
    <>
      {/* Floating Action Trigger Button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 rounded-full bg-ui-button-inverted px-4 py-3 text-ui-fg-on-inverted shadow-2xl hover:bg-ui-button-inverted-hover transition transform hover:scale-105"
          title="Open Omnichannel Communications"
        >
          <PhoneCall className="w-5 h-5 animate-pulse" />
          <span className="text-xs font-bold tracking-wide">Softphone &amp; WhatsApp</span>
        </button>
      )}

      {/* When Phone tab is active and open, render the full WebRTC VoiceCallPanel */}
      {isOpen && activeTab === 'phone' && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-xs">
          <div className="relative">
            {/* Tab switch header bar over panel */}
            <div className="absolute top-3 left-4 z-60 flex gap-1 rounded-lg bg-ui-bg-subtle p-1 border border-ui-border-base shadow-sm">
              <button
                type="button"
                onClick={() => setActiveTab('phone')}
                className="flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold bg-ui-bg-base text-emerald-600 shadow-xs"
              >
                <Phone className="h-3 w-3" /> Softphone
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('whatsapp')}
                className="flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold text-ui-fg-muted hover:text-ui-fg-base"
              >
                <MessageSquare className="h-3 w-3" /> WhatsApp
              </button>
            </div>

            <VoiceCallPanel
              tenantId="active-tenant"
              isOpen={isOpen}
              onClose={() => setIsOpen(false)}
              initialPhoneNumber="+1 (855) 444-2542"
              contactName="Senior Field Specialist"
              workOrderId="WO-4892"
            />
          </div>
        </div>
      )}

      {/* Slide-out WhatsApp Drawer */}
      {isOpen && activeTab === 'whatsapp' && (
        <div className="fixed bottom-6 right-6 z-50 w-80 sm:w-96 rounded-2xl border border-ui-border-base bg-ui-bg-base shadow-2xl overflow-hidden flex flex-col transition-all">
          {/* Header */}
          <div className="bg-zinc-900 text-white p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-emerald-500/20 text-emerald-400">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold leading-none">TextFly Omnichannel</h3>
                <p className="text-[10px] text-zinc-400 font-mono mt-0.5">WhatsApp Business API &amp; SMS</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-zinc-400 hover:text-white transition p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Mode Switcher */}
          <div className="flex border-b border-ui-border-base text-xs font-semibold bg-ui-bg-subtle">
            <button
              type="button"
              onClick={() => setActiveTab('phone')}
              className="flex-1 py-2 flex items-center justify-center gap-1.5 border-b-2 border-transparent text-ui-fg-muted hover:text-ui-fg-base transition"
            >
              <Phone className="w-3.5 h-3.5" /> WebRTC Softphone
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('whatsapp')}
              className="flex-1 py-2 flex items-center justify-center gap-1.5 border-b-2 border-emerald-600 text-emerald-600 bg-ui-bg-base font-bold transition"
            >
              <MessageSquare className="w-3.5 h-3.5" /> WhatsApp Field Chat
            </button>
          </div>

          {/* WhatsApp Field Chat Content */}
          <div className="flex flex-col h-80">
            {/* Message List */}
            <div className="flex-1 p-3 overflow-y-auto space-y-2 text-xs bg-ui-bg-subtle">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`max-w-[85%] rounded-xl p-2.5 space-y-1 ${
                    msg.sender === 'dispatcher'
                      ? 'ml-auto bg-emerald-600 text-white rounded-br-none'
                      : 'mr-auto bg-ui-bg-base border border-ui-border-base text-ui-fg-base rounded-bl-none'
                  }`}
                >
                  <p>{msg.text}</p>
                  <div className={`flex items-center justify-end gap-1 text-[9px] ${
                    msg.sender === 'dispatcher' ? 'text-emerald-100' : 'text-ui-fg-muted'
                  }`}>
                    <span>{msg.time}</span>
                    {msg.sender === 'dispatcher' && (
                      <DeliveryReceiptTicks status={msg.status} tone="onGreen" />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Input Box */}
            <div className="p-2 border-t border-ui-border-base bg-ui-bg-base flex gap-2">
              <input
                type="text"
                placeholder="Send WhatsApp dispatch..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                className="flex-1 text-xs rounded-lg border border-ui-border-base px-3 py-1.5 bg-ui-bg-subtle text-ui-fg-base focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSendMessage}
                className="p-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
