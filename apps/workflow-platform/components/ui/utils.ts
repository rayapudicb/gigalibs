import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export type StatusColor = 'green' | 'blue' | 'orange' | 'red' | 'purple' | 'grey';

export function getStatusColorClass(color: StatusColor = 'grey') {
  switch (color) {
    case 'green':
      return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    case 'blue':
      return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'orange':
      return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    case 'red':
      return 'bg-rose-500/10 text-rose-600 border-rose-500/20';
    case 'purple':
      return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
    case 'grey':
    default:
      return 'bg-zinc-500/10 text-zinc-600 border-zinc-500/20';
  }
}
