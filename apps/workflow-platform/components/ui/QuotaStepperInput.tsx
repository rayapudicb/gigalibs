'use client';

import React from 'react';
import { Button, Input, Text } from '@medusajs/ui';
import { MinusMini, PlusMini } from '@medusajs/icons';

export interface QuotaStepperInputProps {
  value: number;
  onChange: (val: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  className?: string;
  quickSteps?: number[];
  disabled?: boolean;
}

export function QuotaStepperInput({
  value,
  onChange,
  step = 100,
  min = 0,
  max,
  unit,
  className = '',
  quickSteps = [100, 500, 1000],
  disabled = false,
}: QuotaStepperInputProps) {
  const handleDecrement = () => {
    const next = Math.max(min, (value || 0) - step);
    onChange(next);
  };

  const handleIncrement = () => {
    const next = max !== undefined ? Math.min(max, (value || 0) + step) : (value || 0) + step;
    onChange(next);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    let num = raw === '' ? 0 : Number.parseInt(raw, 10);
    if (min !== undefined && num < min) num = min;
    if (max !== undefined && num > max) num = max;
    onChange(num);
  };

  const handleQuickAdd = (delta: number) => {
    const next = max !== undefined ? Math.min(max, (value || 0) + delta) : (value || 0) + delta;
    onChange(Math.max(min, next));
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="secondary"
          size="small"
          disabled={disabled || value <= min}
          onClick={handleDecrement}
          className="h-8 w-8 p-0 flex items-center justify-center shrink-0 border border-ui-border-base"
          title={`Decrease by ${step}`}
        >
          <MinusMini className="h-4 w-4" />
        </Button>

        <div className="relative flex-1">
          <Input
            size="small"
            type="text"
            disabled={disabled}
            value={value.toLocaleString()}
            onChange={handleInputChange}
            className="font-mono text-center font-bold text-xs h-8 pr-8"
          />
          {unit && (
            <span className="absolute right-2 top-1.5 text-[10px] text-ui-fg-muted font-mono pointer-events-none">
              {unit}
            </span>
          )}
        </div>

        <Button
          type="button"
          variant="secondary"
          size="small"
          disabled={disabled || (max !== undefined && value >= max)}
          onClick={handleIncrement}
          className="h-8 w-8 p-0 flex items-center justify-center shrink-0 border border-ui-border-base"
          title={`Increase by ${step}`}
        >
          <PlusMini className="h-4 w-4" />
        </Button>
      </div>

      {quickSteps && quickSteps.length > 0 && (
        <div className="flex items-center gap-1">
          <Text className="text-[10px] text-ui-fg-subtle mr-0.5">Quick add:</Text>
          {quickSteps.map((qs) => (
            <button
              key={qs}
              type="button"
              disabled={disabled}
              onClick={() => handleQuickAdd(qs)}
              className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-ui-bg-subtle hover:bg-ui-bg-base border border-ui-border-base text-ui-fg-muted hover:text-ui-fg-base transition-colors"
            >
              +{qs >= 1000 ? `${qs / 1000}k` : qs}
            </button>
          ))}
          <button
            type="button"
            disabled={disabled || value === 0}
            onClick={() => onChange(0)}
            className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-ui-bg-subtle hover:bg-rose-50 border border-ui-border-base text-rose-600 transition-colors ml-auto"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
