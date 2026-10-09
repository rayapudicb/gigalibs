'use client';

import React, { useState } from 'react';
import { Badge, Button, StatusBadge } from '@medusajs/ui';
import { CheckCircle2, Clock, AlertTriangle, ShieldCheck, Save, Send } from 'lucide-react';

export interface InspectionCheckItem {
  id: string;
  tag: string;
  title: string;
  criteria: string;
  completed: boolean;
  reading?: string;
  unit?: string;
}

const INITIAL_ITEMS: InspectionCheckItem[] = [
  {
    id: 'chk-1',
    tag: 'ZONE-ABC-01',
    title: 'LOTO & Perimeter Safety',
    criteria: 'Barriers intact, safety permits active & signed',
    completed: true,
  },
  {
    id: 'chk-2',
    tag: 'PUMP-FP-101',
    title: 'Feed Pump FP-101 Vibration Analysis',
    criteria: 'Radial vibration threshold < 2.8 mm/s RMS',
    completed: false,
    reading: '1.4',
    unit: 'mm/s',
  },
  {
    id: 'chk-3',
    tag: 'HE-HX-20',
    title: 'Heat Exchanger HX-20 Oil Level',
    criteria: 'Sight glass nominal between 45% and 65%',
    completed: false,
  },
  {
    id: 'chk-4',
    tag: 'PRV-304',
    title: 'Pressure Relief Valve Seal Integrity',
    criteria: 'Lead seal intact, pressure gauge steady at 4.2 bar',
    completed: false,
  },
  {
    id: 'chk-5',
    tag: 'ESD-ABC-09',
    title: 'Emergency Trip & Interlock Switch',
    criteria: 'Functional push-button test & indicator lamp active',
    completed: false,
  },
];

export function DailyInspectionChecklistCard() {
  const [items, setItems] = useState<InspectionCheckItem[]>(INITIAL_ITEMS);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  const completedCount = items.filter((i) => i.completed).length;
  const progressPercent = Math.round((completedCount / items.length) * 100);

  const handleToggle = (id: string) => {
    if (isSubmitted) return;
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item)),
    );
    setSavedFeedback(null);
  };

  const handleReadingChange = (id: string, value: string) => {
    if (isSubmitted) return;
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, reading: value } : item)),
    );
  };

  const handleSaveProgress = () => {
    setSavedFeedback(`Progress saved: ${completedCount}/${items.length} checks recorded in CMMS`);
    setTimeout(() => setSavedFeedback(null), 4000);
  };

  const handleSubmit = () => {
    setIsSubmitted(true);
    setSavedFeedback('Inspection INSP-2026-ABC-09 verified and committed to CMMS.');
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-base shadow-sm">
      {/* Header */}
      <div className="border-b border-ui-border-subtle bg-ui-bg-subtle/80 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-ui-fg-interactive" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-ui-fg-base">
              Daily Inspection Checklist
            </h4>
            <span className="rounded bg-ui-bg-component px-1.5 py-0.5 text-[10px] font-mono font-semibold text-ui-fg-subtle">
              Unit ABC
            </span>
          </div>
          <StatusBadge color={isSubmitted ? 'green' : completedCount > 0 ? 'blue' : 'grey'}>
            {isSubmitted ? 'SUBMITTED' : `${progressPercent}% COMPLETED`}
          </StatusBadge>
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-ui-fg-muted">
          <span>Form ID: <strong className="font-mono text-ui-fg-base">INSP-2026-ABC-09</strong></span>
          <span>PM Schedule: <strong className="font-mono text-ui-fg-base">PMS-412</strong></span>
        </div>

        {/* Progress Bar */}
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-ui-bg-component">
          <div
            className="h-full bg-ui-fg-interactive transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Checklist Items */}
      <div className="divide-y divide-ui-border-subtle px-4 py-1">
        {items.map((item, index) => (
          <div
            key={item.id}
            className={`flex items-start justify-between gap-3 py-2.5 transition-colors ${
              item.completed ? 'bg-ui-bg-subtle/30' : ''
            }`}
          >
            <div className="flex items-start gap-2.5">
              <input
                type="checkbox"
                id={item.id}
                checked={item.completed}
                disabled={isSubmitted}
                onChange={() => handleToggle(item.id)}
                className="mt-0.5 h-4 w-4 rounded border-ui-border-base text-ui-fg-interactive focus:ring-ui-border-interactive cursor-pointer disabled:cursor-not-allowed"
              />
              <div>
                <label
                  htmlFor={item.id}
                  className={`text-xs font-semibold cursor-pointer ${
                    item.completed ? 'line-through text-ui-fg-muted' : 'text-ui-fg-base'
                  }`}
                >
                  {index + 1}. {item.title}
                </label>
                <p className="text-[11px] text-ui-fg-muted">{item.criteria}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="rounded border border-ui-border-subtle bg-ui-bg-subtle px-1.5 py-0.5 font-mono text-[10px] text-ui-fg-subtle">
                {item.tag}
              </span>
              {item.unit && (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={item.reading || ''}
                    disabled={isSubmitted}
                    onChange={(e) => handleReadingChange(item.id, e.target.value)}
                    className="h-6 w-14 rounded border border-ui-border-base bg-ui-bg-field px-1.5 text-right font-mono text-[11px] text-ui-fg-base focus:border-ui-border-interactive focus:outline-none"
                  />
                  <span className="text-[10px] text-ui-fg-muted">{item.unit}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer & Actions */}
      <div className="border-t border-ui-border-subtle bg-ui-bg-subtle/40 px-4 py-2.5 flex items-center justify-between">
        {savedFeedback ? (
          <p className="text-[11px] font-medium text-ui-fg-interactive flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> {savedFeedback}
          </p>
        ) : (
          <p className="text-[11px] text-ui-fg-muted">
            {completedCount} of {items.length} items checked
          </p>
        )}

        <div className="flex items-center gap-2">
          {!isSubmitted && (
            <>
              <button
                type="button"
                onClick={handleSaveProgress}
                className="inline-flex items-center gap-1 rounded-md border border-ui-border-base bg-ui-bg-base px-2.5 py-1 text-xs font-medium text-ui-fg-base hover:bg-ui-bg-base-hover transition-colors cursor-pointer"
              >
                <Save className="h-3 w-3" /> Save
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={completedCount === 0}
                className="inline-flex items-center gap-1 rounded-md bg-ui-button-inverted px-3 py-1 text-xs font-medium text-ui-fg-on-inverted hover:bg-ui-button-inverted-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-3 w-3" /> Submit
              </button>
            </>
          )}
          {isSubmitted && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-ui-fg-interactive">
              <CheckCircle2 className="h-4 w-4" /> Finalized
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
