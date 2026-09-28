'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Phone, Volume2, AlertCircle, Loader2 } from 'lucide-react';
import { Badge } from '@medusajs/ui';

export interface CallRecordingPanelProps {
  tenantId: string;
  callAttemptId: string;
  recordingUrl?: string | null;
  durationSeconds?: number;
  transcriptText?: string | null;
  callerAddress?: string;
  recipientAddress?: string;
  hideNoRecordingMessage?: boolean;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function CallRecordingPanel({
  tenantId,
  callAttemptId,
  recordingUrl,
  durationSeconds = 0,
  transcriptText,
  callerAddress,
  recipientAddress,
  hideNoRecordingMessage = false,
}: CallRecordingPanelProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(durationSeconds);
  const [audioError, setAudioError] = useState<string | null>(null);

  useEffect(() => {
    setTotalDuration(durationSeconds);
  }, [durationSeconds]);

  const togglePlayback = () => {
    if (!audioRef.current || !recordingUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          setAudioError(err instanceof Error ? err.message : 'Playback error');
          setIsPlaying(false);
        });
    }
  };

  const onTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      if (Number.isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
        setTotalDuration(audioRef.current.duration);
      }
    }
  };

  const onEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  if (!recordingUrl) {
    if (hideNoRecordingMessage) return null;
    return (
      <div className="flex items-center gap-2 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-3 text-xs text-ui-fg-muted">
        <Volume2 className="h-4 w-4 shrink-0 text-ui-fg-muted" />
        <span>No audio recording available for this call attempt ({callAttemptId}).</span>
      </div>
    );
  }

  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-4 shadow-sm">
      <div className="flex items-center justify-between pb-3 border-b border-ui-border-base">
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-emerald-600" />
          <span className="text-sm font-semibold text-ui-fg-base">
            Call Recording
          </span>
          {callerAddress && recipientAddress && (
            <span className="text-xs text-ui-fg-muted font-mono">
              {callerAddress} → {recipientAddress}
            </span>
          )}
        </div>
        <Badge color="green" size="small">
          {formatTime(totalDuration)}
        </Badge>
      </div>

      <audio
        ref={audioRef}
        src={recordingUrl}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
        onError={() => setAudioError('Unable to stream audio recording.')}
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlayback}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ui-bg-interactive text-ui-fg-on-color transition-colors hover:bg-ui-bg-interactive-hover"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
        </button>

        <div className="flex flex-1 flex-col gap-1">
          <div className="flex justify-between text-xs text-ui-fg-muted font-mono">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(totalDuration)}</span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-ui-bg-subtle">
            <div
              className="h-full bg-emerald-500 transition-all duration-100"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {audioError && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-500">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{audioError}</span>
        </div>
      )}

      {transcriptText && (
        <div className="mt-3 rounded-lg bg-ui-bg-subtle p-2.5">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-ui-fg-muted mb-1">
            STT Transcription
          </span>
          <p className="text-xs text-ui-fg-subtle italic leading-relaxed">
            "{transcriptText}"
          </p>
        </div>
      )}
    </div>
  );
}
