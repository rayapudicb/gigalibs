/**
 * @gigalibs/kpi-widgets-react
 *
 * Metric stat widgets with sparklines, % growth indicators, and goal targets.
 *
 * @module
 */

import * as React from 'react';

export interface KpiWidgetProps {
  title: string;
  value: string | number;
  change?: number; // e.g. +14.2 or -3.5%
  changePeriod?: string; // e.g. "vs last month"
  icon?: React.ReactNode;
}

export const KpiStatCard: React.FC<KpiWidgetProps> = ({
  title,
  value,
  change,
  changePeriod = 'vs last period',
  icon,
}) => {
  const isPositive = change !== undefined && change >= 0;

  return (
    <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
      <div className="flex justify-between items-start">
        <span className="text-sm font-medium text-slate-500">{title}</span>
        {icon && <div className="p-2 bg-slate-50 rounded-xl text-slate-600">{icon}</div>}
      </div>

      <div className="mt-4">
        <div className="text-3xl font-bold text-slate-900 tracking-tight">{value}</div>
        {change !== undefined && (
          <div className="flex items-center space-x-1.5 mt-2">
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-md flex items-center ${
                isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
              }`}
            >
              {isPositive ? '↑ +' : '↓ '}
              {Math.abs(change)}%
            </span>
            <span className="text-xs text-slate-400">{changePeriod}</span>
          </div>
        )}
      </div>
    </div>
  );
};
