import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from 'react';
import { Badge as SwappyBadge } from './ui/badge';
import { Button as SwappyButton } from './ui/button';
import { Card as SwappyCard } from './ui/card';
import {
  Table as SwappyTable,
  TableBody as SwappyTableBody,
  TableCell as SwappyTableCell,
  TableHead as SwappyTableHead,
  TableHeader as SwappyTableHeader,
  TableRow as SwappyTableRow,
} from './ui/table';
import { cn } from './ui/utils';

export {
  SwappyTable as Table,
  SwappyTableHeader as TableHeader,
  SwappyTableBody as TableBody,
  SwappyTableRow as TableRow,
  SwappyTableHead as TableHead,
  SwappyTableCell as TableCell,
};

type BadgeColor = 'blue' | 'green' | 'orange' | 'red' | 'grey' | 'purple';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  color?: BadgeColor;
  children: ReactNode;
}

export function Badge({ color = 'grey', children, className, ...props }: BadgeProps) {
  return (
    <SwappyBadge color={color} className={className} {...props}>
      {children}
    </SwappyBadge>
  );
}

export function StatusBadge(props: BadgeProps) {
  return <SwappyBadge dot {...props} />;
}

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  size?: 'small' | 'large' | 'base';
  variant?: 'primary' | 'secondary' | 'transparent' | 'danger';
  isLoading?: boolean;
}

export function Button({
  type = 'button',
  size = 'base',
  variant = 'secondary',
  children,
  className,
  isLoading,
  ...props
}: ButtonProps) {
  return (
    <SwappyButton
      type={type}
      size={size}
      variant={variant}
      className={className}
      isLoading={isLoading}
      {...props}
    >
      {children}
    </SwappyButton>
  );
}

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Container({ className, children, ...props }: ContainerProps) {
  return (
    <SwappyCard className={cn('p-6 shadow-xs border border-zinc-200 bg-white', className)} {...props}>
      {children}
    </SwappyCard>
  );
}

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  level: 'h1' | 'h2' | 'h3';
  children: ReactNode;
}

export function Heading({ level, children, className, ...props }: HeadingProps) {
  if (level === 'h1') {
    return (
      <h1 className={cn('text-xl font-bold tracking-tight text-zinc-900', className)} {...props}>
        {children}
      </h1>
    );
  }
  if (level === 'h2') {
    return (
      <h2 className={cn('text-base font-semibold tracking-tight text-zinc-900', className)} {...props}>
        {children}
      </h2>
    );
  }
  return (
    <h3 className={cn('text-sm font-semibold tracking-tight text-zinc-900', className)} {...props}>
      {children}
    </h3>
  );
}

export interface TextProps extends HTMLAttributes<HTMLParagraphElement> {
  size?: 'small' | 'base' | 'xsmall';
  weight?: 'regular' | 'plus';
  children: ReactNode;
}

export function Text({
  size = 'base',
  weight = 'regular',
  className,
  children,
  ...props
}: TextProps) {
  const sizeClass = {
    xsmall: 'text-[11px] leading-4',
    small: 'text-xs leading-4',
    base: 'text-sm leading-5',
  }[size];

  return (
    <p
      className={cn(
        sizeClass,
        weight === 'plus' ? 'font-semibold' : 'font-normal',
        'text-zinc-700',
        className,
      )}
      {...props}
    >
      {children}
    </p>
  );
}
