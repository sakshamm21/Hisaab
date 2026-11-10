import { ArrowRight, Inbox } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router';

import { CategoryIcon } from '../components/CategoryIcon';
import { TransactionRow } from '../components/TransactionRow';
import { Amount, PageHeader, SectionTitle, Skeleton, Surface } from '../components/ui';
import type { Summary } from '../lib/api';
import { cn } from '../lib/cn';
import { useSummary, useTransactions } from '../lib/queries';

function monthProgress(today = new Date()) {
  const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return { day: today.getDate(), days };
}

export function Dashboard() {
  const { data: summary, isLoading } = useSummary();
  const { data: recent } = useTransactions({ limit: 8 });
  const today = new Date();
  const { day, days } = monthProgress(today);
  const dateLabel = today.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });

  return (
    <>
      <PageHeader
        eyebrow={`${dateLabel} · Day ${day} of ${days}`}
        title="This"
        accent="month"
        description="Where your money went so far, and what's waiting for you."
      />

      {!!summary?.inbox_count && (
        <Link
          to="/transactions?view=inbox"
          className="group mb-6 flex items-center gap-4 rounded-2xl border border-highlight/50 bg-warning-soft px-5 py-4 transition hover:border-highlight"
        >
          <Inbox className="size-5 text-warning" />
          <p className="text-[15px]">
            <span className="num font-semibold">{summary.inbox_count}</span> new transactions to review
          </p>
          <ArrowRight className="ml-auto size-4 text-muted transition group-hover:translate-x-0.5" />
        </Link>
      )}

      <Kpis summary={summary} loading={isLoading} />

      <div className="mt-10 grid gap-6 lg:grid-cols-5">
        <Surface className="p-6 lg:col-span-3">
          <SectionTitle title="Where it" accent="went" right={<span className="eyebrow">Top categories</span>} />
          <CategoryBars summary={summary} />
        </Surface>

        <Surface className="p-6 lg:col-span-2">
          <SectionTitle
            title="Recent"
            right={
              <Link to="/transactions" className="eyebrow transition hover:text-foreground">
                See all →
              </Link>
            }
          />
          <ul className="-mx-2">
            {recent?.items.map((t) => <TransactionRow key={t.id} t={t} compact />) ??
              Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="mx-2 my-2 h-11" />)}
          </ul>
        </Surface>
      </div>
    </>
  );
}

function Kpis({ summary, loading }: { summary?: Summary; loading: boolean }) {
  const cards = [
    { label: 'Spent', value: summary?.spending, hint: summary ? `${summary.transaction_count} transactions` : '' },
    { label: 'Came in', value: summary?.income, hint: 'Salary, interest, refunds' },
    {
      label: 'Left over',
      value: summary?.net,
      hint: summary && summary.net < 0 ? 'Spending more than came in' : 'Income minus spending',
    },
  ];
  const rate = summary?.savings_rate;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c, i) => (
        <motion.div
          key={c.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.3 }}
        >
          <Surface className="h-full p-5">
            <p className="eyebrow">{c.label}</p>
            {loading || c.value === undefined ? (
              <Skeleton className="mt-3 h-9 w-32" />
            ) : (
              <Amount
                value={c.value}
                className={cn(
                  'mt-2 block font-display text-[34px] leading-tight font-bold tracking-tight',
                  c.label === 'Left over' && (c.value < 0 ? 'text-expense' : 'text-income'),
                )}
              />
            )}
            <p className="mt-1 text-xs text-subtle">{c.hint}</p>
          </Surface>
        </motion.div>
      ))}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.3 }}>
        <Surface className="h-full bg-primary p-5 text-primary-foreground">
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase opacity-75">Savings rate</p>
          <p data-amount className="num mt-2 font-display text-[34px] leading-tight font-bold">
            {rate == null ? '—' : `${Math.round(rate * 100)}%`}
          </p>
          <p className="mt-1 text-xs opacity-75">Of what came in, kept</p>
        </Surface>
      </motion.div>
    </div>
  );
}

function CategoryBars({ summary }: { summary?: Summary }) {
  if (!summary) return <Skeleton className="h-64" />;
  const top = summary.by_category.slice(0, 7);
  const max = Math.max(...top.map((c) => c.spent), 1);
  if (!top.length) return <p className="py-10 text-center text-sm text-muted">No spending yet this month.</p>;
  return (
    <ul className="space-y-4">
      {top.map((c, i) => (
        <li key={c.id ?? 'none'} className="flex items-center gap-3">
          <CategoryIcon icon={c.icon} color={c.color} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium">{c.name}</span>
              <span className="flex items-baseline gap-2">
                <span className="num text-xs text-subtle">{Math.round((c.spent / summary.spending) * 100)}%</span>
                <Amount value={c.spent} className="font-medium" />
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: c.color }}
                initial={{ width: 0 }}
                animate={{ width: `${(c.spent / max) * 100}%` }}
                transition={{ delay: 0.1 + i * 0.04, duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
