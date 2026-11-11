import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '../lib/cn';

export function shiftPeriod(label: string, n: number) {
  const [y, m] = label.split('-').map(Number);
  const index = y * 12 + (m - 1) + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function monthName(period: string) {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function PeriodSwitcher({
  period,
  label,
  current,
  onChange,
  className,
}: {
  period: string;
  label?: string;
  current?: string;
  onChange: (p: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-1 rounded-full border border-border bg-surface p-1', className)}>
      <button aria-label="Previous month" onClick={() => onChange(shiftPeriod(period, -1))} className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-36 px-2 text-center text-sm font-medium">{label ?? monthName(period)}</span>
      <button aria-label="Next month" onClick={() => onChange(shiftPeriod(period, 1))} className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground">
        <ChevronRight className="size-4" />
      </button>
      {current && current !== period && (
        <button onClick={() => onChange(current)} className="rounded-full px-3 text-xs text-primary hover:underline">
          This month
        </button>
      )}
    </div>
  );
}
