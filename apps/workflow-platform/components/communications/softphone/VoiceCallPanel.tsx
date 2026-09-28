'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Phone,
  PhoneCall,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  Delete,
  Clock,
  CheckCircle2,
  AlertCircle,
  Radio,
  X,
  RotateCcw,
} from 'lucide-react';
import { Badge, Button } from '@medusajs/ui';

export interface VoiceCallPanelProps {
  tenantId: string;
  isOpen: boolean;
  onClose: () => void;
  initialPhoneNumber?: string;
  contactName?: string;
  workOrderId?: string;
  onCallEnded?: (durationSeconds: number) => void;
}

type CallState = 'IDLE' | 'CONNECTING' | 'RINGING' | 'IN_CALL' | 'ENDED' | 'ERROR';

// Standard DTMF tone frequencies (Hz)
const DTMF_FREQUENCIES: Record<string, [number, number]> = {
  '1': [697, 1209],
  '2': [697, 1336],
  '3': [697, 1477],
  '4': [770, 1209],
  '5': [770, 1336],
  '6': [770, 1477],
  '7': [852, 1209],
  '8': [852, 1336],
  '9': [852, 1477],
  '*': [941, 1209],
  '0': [941, 1336],
  '#': [941, 1477],
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function VoiceCallPanel({
  tenantId,
  isOpen,
  onClose,
  initialPhoneNumber = '',
  contactName,
  workOrderId,
  onCallEnded,
}: VoiceCallPanelProps) {
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber);
  const [callState, setCallState] = useState<CallState>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [callAttemptId, setCallAttemptId] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (initialPhoneNumber) {
      setPhoneNumber(initialPhoneNumber);
    }
  }, [initialPhoneNumber]);

  // Handle call duration timer
  useEffect(() => {
    if (callState === 'IN_CALL') {
      timerRef.current = setInterval(() => {
        setDurationSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  // Play standard telephone DTMF dual-tone
  const playDtmfTone = useCallback((char: string) => {
    const freqs = DTMF_FREQUENCIES[char];
    if (!freqs || typeof window === 'undefined') return;

    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) audioCtxRef.current = new AudioContextClass();
      }

      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();

      const [f1, f2] = freqs;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.frequency.value = f1;
      osc2.frequency.value = f2;
      gainNode.gain.value = 0.08;

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      const now = ctx.currentTime;
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.12);
      osc2.stop(now + 0.12);
    } catch {
      // AudioContext unavailable in headless environments
    }
  }, []);

  const handleDigitPress = (digit: string) => {
    playDtmfTone(digit);
    setPhoneNumber((prev) => prev + digit);
  };

  const handleBackspace = () => {
    setPhoneNumber((prev) => prev.slice(0, -1));
  };

  const initiateCall = async () => {
    if (!phoneNumber.trim()) {
      setErrorMessage('Please enter a valid recipient phone number.');
      return;
    }

    setErrorMessage(null);
    setCallState('CONNECTING');

    try {
      // 1. Fetch authenticated token and initiate call attempt
      const res = await fetch('/api/communications/voice/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientAddress: phoneNumber,
          workOrderId,
          direction: 'OUTBOUND',
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.title || `Call placement failed: HTTP ${res.status}`);
      }

      const data = await res.json();
      setCallAttemptId(data.callAttemptId || 'call-' + Date.now());

      // Simulate ring state progressing to active WebRTC connection
      setCallState('RINGING');
      setTimeout(() => {
        setCallState('IN_CALL');
        setDurationSeconds(0);
      }, 1500);
    } catch (err: any) {
      setCallState('ERROR');
      setErrorMessage(err?.message || 'Failed to place call via telecom provider.');
    }
  };

  const hangUpCall = async () => {
    const finalDuration = durationSeconds;
    setCallState('ENDED');

    if (callAttemptId) {
      try {
        await fetch(`/api/communications/voice/calls`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callAttemptId,
            durationSeconds: finalDuration,
            status: 'COMPLETED',
          }),
        });
      } catch {
        // Logging failover
      }
    }

    if (onCallEnded) onCallEnded(finalDuration);

    setTimeout(() => {
      setCallState('IDLE');
      setDurationSeconds(0);
      setCallAttemptId(null);
    }, 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-96 flex-col border-l border-ui-border-base bg-ui-bg-base shadow-2xl transition-all duration-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-ui-border-base px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Phone className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ui-fg-base">WebRTC Softphone</h3>
            <p className="text-xs text-ui-fg-muted font-mono">
              {tenantId ? `Tenant: ${tenantId.slice(0, 8)}` : 'GigaLibs Telecom'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-ui-fg-muted hover:bg-ui-bg-subtle hover:text-ui-fg-base"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Main Body */}
      <div className="flex flex-1 flex-col justify-between p-5 overflow-y-auto">
        {/* Status Display Area */}
        <div className="rounded-xl border border-ui-border-base bg-ui-bg-subtle p-4 text-center">
          {contactName && (
            <span className="block text-xs font-semibold uppercase tracking-wider text-ui-fg-muted mb-1">
              {contactName} {workOrderId && `• ${workOrderId}`}
            </span>
          )}

          <div className="my-2 flex items-center justify-center">
            <input
              type="text"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              disabled={callState === 'IN_CALL' || callState === 'CONNECTING'}
              placeholder="+1 (555) 000-0000"
              className="w-full bg-transparent text-center font-mono text-2xl font-bold tracking-wider text-ui-fg-base focus:outline-none"
            />
          </div>

          <div className="mt-2 flex items-center justify-center gap-2">
            {callState === 'IDLE' && (
              <Badge color="grey" size="small">
                Ready to Dial
              </Badge>
            )}
            {callState === 'CONNECTING' && (
              <Badge color="orange" size="small" className="animate-pulse">
                Connecting WebRTC...
              </Badge>
            )}
            {callState === 'RINGING' && (
              <Badge color="purple" size="small" className="animate-pulse">
                Ringing Provider...
              </Badge>
            )}
            {callState === 'IN_CALL' && (
              <div className="flex items-center gap-2">
                <Badge color="green" size="small">
                  Live: {formatDuration(durationSeconds)}
                </Badge>
                {isMuted && <Badge color="red" size="small">Muted</Badge>}
                {isOnHold && <Badge color="orange" size="small">On Hold</Badge>}
              </div>
            )}
            {callState === 'ENDED' && (
              <Badge color="blue" size="small">
                Call Ended ({formatDuration(durationSeconds)})
              </Badge>
            )}
            {callState === 'ERROR' && (
              <Badge color="red" size="small">
                Error
              </Badge>
            )}
          </div>

          {errorMessage && (
            <p className="mt-2 text-xs text-rose-500">{errorMessage}</p>
          )}
        </div>

        {/* Dialpad Matrix */}
        <div className="my-4 grid grid-cols-3 gap-3">
          {[
            { digit: '1', sub: '' },
            { digit: '2', sub: 'ABC' },
            { digit: '3', sub: 'DEF' },
            { digit: '4', sub: 'GHI' },
            { digit: '5', sub: 'JKL' },
            { digit: '6', sub: 'MNO' },
            { digit: '7', sub: 'PQRS' },
            { digit: '8', sub: 'TUV' },
            { digit: '9', sub: 'WXYZ' },
            { digit: '*', sub: '' },
            { digit: '0', sub: '+' },
            { digit: '#', sub: '' },
          ].map((key) => (
            <button
              key={key.digit}
              type="button"
              onClick={() => handleDigitPress(key.digit)}
              className="flex flex-col items-center justify-center rounded-xl border border-ui-border-base bg-ui-bg-base py-3 transition-colors hover:bg-ui-bg-subtle active:scale-95"
            >
              <span className="text-xl font-bold text-ui-fg-base">{key.digit}</span>
              {key.sub && (
                <span className="text-[10px] font-semibold text-ui-fg-muted">
                  {key.sub}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Active Call Controls / Dial Action */}
        <div className="flex flex-col gap-3">
          {callState === 'IN_CALL' ? (
            <div className="flex items-center justify-around gap-2">
              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                className={`flex h-12 w-12 items-center justify-center rounded-full border transition-colors ${
                  isMuted
                    ? 'border-rose-300 bg-rose-50 text-rose-600'
                    : 'border-ui-border-base bg-ui-bg-subtle text-ui-fg-base hover:bg-ui-bg-base'
                }`}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>

              <button
                type="button"
                onClick={() => setIsOnHold(!isOnHold)}
                className={`flex h-12 w-12 items-center justify-center rounded-full border transition-colors ${
                  isOnHold
                    ? 'border-amber-300 bg-amber-50 text-amber-600'
                    : 'border-ui-border-base bg-ui-bg-subtle text-ui-fg-base hover:bg-ui-bg-base'
                }`}
                title={isOnHold ? 'Resume' : 'Hold'}
              >
                <Clock className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={hangUpCall}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg transition-transform hover:bg-rose-700 active:scale-95"
                title="Hang Up"
              >
                <PhoneOff className="h-6 w-6" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleBackspace}
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-ui-border-base text-ui-fg-muted hover:bg-ui-bg-subtle hover:text-ui-fg-base"
                title="Backspace"
              >
                <Delete className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={initiateCall}
                disabled={callState === 'CONNECTING' || callState === 'RINGING'}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 font-semibold text-white shadow-lg transition-transform hover:bg-emerald-700 active:scale-98 disabled:opacity-50"
              >
                <PhoneCall className="h-5 w-5" />
                <span>Call Technician</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
