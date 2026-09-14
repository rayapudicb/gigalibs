import * as React from 'react';
import { cn, getStatusColorClass, type StatusColor } from './utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: StatusColor;
  size?: 'small' | 'base';
  dot?: boolean;
}

export function Badge({
  children,
  className,
  color = 'grey',
  size = 'base',
  dot = false,
  ...props
}: BadgeProps) {
  const dotColorClass = {
    green: 'bg-emerald-500',
    blue: 'bg-blue-500',
    orange: 'bg-amber-500',
    red: 'bg-rose-500',
    purple: 'bg-purple-500',
    grey: 'bg-zinc-400',
  }[color];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-mono font-medium tracking-tight uppercase',
        size === 'small' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs',
        getStatusColorClass(color),
        className,
      )}
      {...props}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full animate-pulse', dotColorClass)} />}
      {children}
    </span>
  );
}
