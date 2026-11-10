import type { LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '../lib/cn';
import { formatMoney } from '../lib/money';
import { useMeta } from '../lib/queries';

/** A rounded card. */
export function Surface({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn('rounded-3xl border border-border bg-surface shadow-[var(--shadow-soft)]', className)}
      {...props}
    />
  );
}

/**
 * Page title in the Sync editorial style: a mono eyebrow, a heavy display title
 * with one serif-italic accent word, and an optional line of description.
 */
export function PageHeader({
  eyebrow,
  title,
  accent,
  description,
  actions,
}: {
  eyebrow: ReactNode;
  title: string;
  accent: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6 pb-8">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-3 text-5xl leading-[0.95] font-extrabold sm:text-6xl">
          {title} <span className="font-serif font-normal italic text-primary">{accent}</span>
        </h1>
        {description && <p className="mt-4 max-w-xl text-[15px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ title, accent, right }: { title: string; accent?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <h2 className="text-2xl font-bold">
        {title} {accent && <span className="font-serif font-normal italic text-primary">{accent}</span>}
      </h2>
      {right}
    </div>
  );
}

/** An amount in the user's currency. `tone` colours money in green and money out red. */
export function Amount({
  value,
  tone = 'plain',
  signed,
  compact,
  className,
}: {
  value: number;
  tone?: 'plain' | 'flow';
  signed?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const { data: meta } = useMeta();
  const text = formatMoney(value, {
    locale: meta?.settings.locale,
    currency: meta?.settings.currency,
    signed,
    compact,
  });
  return (
    <span
      data-amount
      className={cn('num', tone === 'flow' && (value > 0 ? 'text-income' : value < 0 && 'text-foreground'), className)}
    >
      {text}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  badge,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  badge?: string;
}) {
  return (
    <Surface className="flex flex-col items-center px-6 py-20 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary-soft-foreground">
        <Icon className="size-6" strokeWidth={1.75} />
      </span>
      {badge && <span className="eyebrow mt-6 rounded-full border border-border px-3 py-1">{badge}</span>}
      <h2 className="mt-4 text-2xl font-bold">{title}</h2>
      <p className="mt-2 max-w-md text-[15px] text-muted">{children}</p>
    </Surface>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-surface-muted', className)} />;
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'rounded-md border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-muted',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
