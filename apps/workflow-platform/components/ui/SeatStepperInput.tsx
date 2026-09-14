'use client';

import React from 'react';
import { Button, Input, Text, Badge } from '@medusajs/ui';
import { MinusMini, PlusMini, UsersSolid } from '@medusajs/icons';

export interface SeatStepperInputProps {
  value: number;
  onChange: (seats: number) => void;
  min?: number;
  max?: number;
  step?: number;
  baseIncludedSeats?: number;
  costPerExtraSeatUsd?: number;
  className?: string;
  quickIncrements?: number[];
  disabled?: boolean;
  showEconomics?: boolean;
}

export function SeatStepperInput({
  value,
  onChange,
  min = 1,
  max = 5000,
  step = 1,
  baseIncludedSeats,
  costPerExtraSeatUsd = 15,
  className = '',
  quickIncrements = [5, 10, 25, 50],
  disabled = false,
  showEconomics = true,
}: SeatStepperInputProps) {
  const handleDecrement = () => {
    const next = Math.max(min, (value || min) - step);
    onChange(next);
  };

  const handleIncrement = () => {
    const next = Math.min(max, (value || min) + step);
    onChange(next);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    let num = raw === '' ? min : Number.parseInt(raw, 10);
    if (num < min) num = min;
    if (num > max) num = max;
    onChange(num);
  };

  const handleQuickAdd = (delta: number) => {
    const next = Math.min(max, (value || min) + delta);
    onChange(next);
  };

  // Economics calculation
  const extraSeats = baseIncludedSeats ? Math.max(0, value - baseIncludedSeats) : 0;
  const extraSeatTotalMonthly = extraSeats * costPerExtraSeatUsd;

  // Volume tier badge
  const getVolumeBadge = (seats: number) => {
    if (seats >= 250) return { label: '25% Scale Enterprise', color: 'purple' as const };
    if (seats >= 50) return { label: '20% Volume Discount', color: 'green' as const };
    if (seats >= 15) return { label: '10% Growth Tier', color: 'blue' as const };
    return { label: 'Standard Tier', color: 'grey' as const };
  };

  const volumeBadge = getVolumeBadge(value);

  return (
    <div className={`space-y-2 p-3 bg-ui-bg-subtle rounded-xl border border-ui-border-base ${className}`}>
      {/* Header & Volume Tier Indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-ui-fg-base">
          <UsersSolid className="w-4 h-4 text-ui-fg-muted" />
          <span>Active User Seats Quota</span>
        </div>
        <Badge color={volumeBadge.color} size="small">
          {volumeBadge.label}
        </Badge>
      </div>

      {/* Main Tactile Stepper Control */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="small"
          disabled={disabled || value <= min}
          onClick={handleDecrement}
          className="h-10 w-10 p-0 flex items-center justify-center shrink-0 border border-ui-border-base hover:bg-ui-bg-base transition-colors rounded-lg shadow-2xs"
          title={`Decrease by ${step} seat`}
        >
          <MinusMini className="h-4 w-4" />
        </Button>

        <div className="relative flex-1">
          <Input
            size="small"
            type="text"
            disabled={disabled}
            value={value}
            onChange={handleInputChange}
            className="font-mono text-center font-bold text-base h-10 px-3 bg-ui-bg-base border-ui-border-base focus:border-ui-border-interactive rounded-lg shadow-inner"
          />
          <span className="absolute right-3 top-3 text-[11px] font-semibold text-ui-fg-muted pointer-events-none uppercase tracking-wider">
            Seats
          </span>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="small"
          disabled={disabled || value >= max}
          onClick={handleIncrement}
          className="h-10 w-10 p-0 flex items-center justify-center shrink-0 border border-ui-border-base hover:bg-ui-bg-base transition-colors rounded-lg shadow-2xs"
          title={`Increase by ${step} seat`}
        >
          <PlusMini className="h-4 w-4" />
        </Button>
      </div>

      {/* Quick Increments Chips */}
      {quickIncrements && quickIncrements.length > 0 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-ui-fg-muted font-medium">Quick Presets:</span>
          <div className="flex items-center gap-1">
            {quickIncrements.map((inc) => (
              <button
                key={inc}
                type="button"
                disabled={disabled}
                onClick={() => handleQuickAdd(inc)}
                className="px-2 py-0.5 text-[10px] font-mono font-medium rounded-md bg-ui-bg-base border border-ui-border-base hover:border-ui-border-interactive hover:bg-ui-bg-subtle/80 text-ui-fg-subtle hover:text-ui-fg-base transition-all"
              >
                +{inc}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Economics / Cost Breakdown (When applicable) */}
      {showEconomics && (
        <div className="pt-2 border-t border-ui-border-base/70 flex items-center justify-between text-[11px] text-ui-fg-muted">
          <div>
            {baseIncludedSeats ? (
              <span>
                Included: <strong className="text-ui-fg-base font-mono">{baseIncludedSeats}</strong> | Extra:{' '}
                <strong className="text-ui-fg-base font-mono">{extraSeats}</strong>
              </span>
            ) : (
              <span>Unit Rate: <strong className="text-ui-fg-base font-mono">${costPerExtraSeatUsd}</strong> / user / mo</span>
            )}
          </div>
          {extraSeats > 0 && (
            <div className="text-right font-mono font-semibold text-indigo-600 dark:text-indigo-400">
              +${extraSeatTotalMonthly}/mo add-on
            </div>
          )}
        </div>
      )}
    </div>
  );
}
