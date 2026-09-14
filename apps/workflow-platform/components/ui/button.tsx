import * as React from 'react';
import { cn } from './utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'transparent' | 'danger';
  size?: 'small' | 'base' | 'large';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      variant = 'secondary',
      size = 'base',
      isLoading = false,
      disabled,
      ...props
    },
    ref,
  ) => {
    const variantClasses = {
      primary:
        'bg-zinc-900 text-white hover:bg-zinc-800 shadow-xs border border-zinc-900',
      secondary:
        'bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-50 shadow-xs',
      transparent:
        'bg-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
      danger:
        'bg-rose-600 text-white hover:bg-rose-700 shadow-xs border border-rose-600',
    }[variant];

    const sizeClasses = {
      small: 'h-7 px-2.5 text-xs gap-1.5 rounded-md font-medium',
      base: 'h-8 px-3 text-sm gap-2 rounded-md font-medium',
      large: 'h-10 px-4 text-sm gap-2.5 rounded-lg font-semibold',
    }[size];

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'inline-flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer',
          variantClasses,
          sizeClasses,
          className,
        )}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin -ml-0.5 h-3.5 w-3.5 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
