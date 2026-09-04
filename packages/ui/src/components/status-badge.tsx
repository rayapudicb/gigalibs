import * as React from 'react';
import { cn } from '../utils/cn';

export type StatusVariant = 'success' | 'warning' | 'error' | 'danger' | 'info' | 'neutral' | 'primary' | 'default';

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: StatusVariant;
  dot?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  className,
  variant = 'neutral',
  dot = true,
  children,
  ...props
}) => {
  const styles: Record<StatusVariant, { badge: string; dot: string }> = {
    success: { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    warning: { badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
    error: { badge: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
    danger: { badge: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
    info: { badge: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
    primary: { badge: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
    neutral: { badge: 'bg-slate-50 text-slate-700 border-slate-200', dot: 'bg-slate-400' },
    default: { badge: 'bg-slate-50 text-slate-700 border-slate-200', dot: 'bg-slate-400' },
  };

  const style = styles[variant] ?? styles.neutral;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border',
        style.badge,
        className,
      )}
      {...props}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', style.dot)} />}
      {children}
    </span>
  );
};
