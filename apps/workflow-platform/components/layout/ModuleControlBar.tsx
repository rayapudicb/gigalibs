'use client';

import React from 'react';

export interface ViewOption<T extends string = string> {
  id: T;
  label: string;
  badge?: number | string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface ModuleControlBarProps<T extends string = string> {
  views: ViewOption<T>[];
  activeView: T;
  onViewChange: (viewId: T) => void;
  actions?: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}

/**
 * Standard Enterprise Module Control Bar (Zone 2)
 *
 * Left: Segmented pill controls for view switching with counts/badges.
 * Right: Primary and secondary context action buttons.
 */
export function ModuleControlBar<T extends string = string>({
  views,
  activeView,
  onViewChange,
  actions,
  className = '',
  ariaLabel = 'Module view switcher',
}: ModuleControlBarProps<T>) {
  return (
    <div
      className={`mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-4 ${className}`}
    >
      {/* LEFT: Uniform Segmented Pill Switcher */}
      <nav className="flex flex-wrap items-center gap-2" aria-label={ariaLabel}>
        {views.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              onClick={() => onViewChange(item.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                item.disabled
                  ? 'cursor-not-allowed opacity-40 border border-zinc-200 bg-zinc-50 text-zinc-400'
                  : isActive
                  ? 'bg-zinc-950 text-white shadow-sm ring-1 ring-zinc-950 font-semibold'
                  : 'border border-zinc-200 bg-white text-zinc-700 shadow-xs hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950'
              }`}
            >
              {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
              <span>{item.label}</span>
              {item.badge !== undefined ? (
                <span
                  className={`ml-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                    isActive
                      ? 'bg-zinc-800 text-zinc-200'
                      : 'bg-zinc-100 text-zinc-600'
                  }`}
                >
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* RIGHT: Context Action Suite */}
      {actions ? (
        <div className="flex flex-wrap items-center gap-2.5">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
