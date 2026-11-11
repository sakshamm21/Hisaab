import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarCheck, Inbox } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router';

import { CategoryIcon } from '../components/CategoryIcon';
import { TransactionRow } from '../components/TransactionRow';
import { Amount, PageHeader, SectionTitle, Skeleton, Surface } from '../components/ui';
import type { Budget, Summary } from '../lib/api';
import { cn } from '../lib/cn';
import { formatMoney } from '../lib/money';
import { useBudget, useSummary, useTransactions, useUpcoming } from '../lib/queries';
import { Insights } from './Insights';

export function Dashboard() {
  const { data: summary, isLoading } = useSummary();
  const { data: budget } = useBudget(summary?.month);
  const { data: recent } = useTransactions({ limit: 8 });
  const today = new Date();
  const dateLabel = today.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });

  return (
    <>
      <PageHeader
        eyebrow={summary ? `${dateLabel} · day ${summary.days_elapsed} of ${summary.days}${summary.label && !summary.label.startsWith(today.toLocaleDateString('en-IN', { month: 'long' })) ? ` · ${summary.label}` : ''}` : dateLabel}
        title="This"
        accent="month"
        description="Where your money went so far, and what's coming up."
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

      {summary && summary.days_elapsed <= 10 && (
        <Link
          to="/review"
          className="group mb-6 flex items-center gap-4 rounded-2xl border border-primary/40 bg-primary-soft px-5 py-4 transition hover:border-primary"
        >
          <CalendarCheck className="size-5 text-primary" />
          <p className="text-[15px]">A new month started. <span className="font-semibold">See how last month went</span> and plan this one.</p>
          <ArrowRight className="ml-auto size-4 text-muted transition group-hover:translate-x-0.5" />
        </Link>
      )}

      <Kpis summary={summary} budget={budget} loading={isLoading} />

      <Insights />

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Surface className="p-6 lg:col-span-3">
          <SectionTitle title="Where it" accent="went" right={<Link to="/reports" className="eyebrow hover:text-foreground">Reports →</Link>} />
          <CategoryBars summary={summary} budget={budget} />
        </Surface>
        <div className="space-y-6 lg:col-span-2">
          <UpcomingBills />
          <Surface className="p-6">
            <SectionTitle title="Recent" right={<Link to="/transactions" className="eyebrow transition hover:text-foreground">See all →</Link>} />
            <ul className="-mx-2">
              {recent?.items.map((t) => <TransactionRow key={t.id} t={t} compact />) ??
                Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="mx-2 my-2 h-11" />)}
            </ul>
          </Surface>
        </div>
      </div>
    </>
  );
}

function Change({ now, before, goodWhenDown = true }: { now: number; before: number; goodWhenDown?: boolean }) {
  if (!before) return null;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <span className="text-xs text-subtle">same as last month</span>;
  const good = goodWhenDown ? pct < 0 : pct > 0;
  const Icon = pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs', good ? 'text-income' : 'text-expense')}>
      <Icon className="size-3.5" />
      {Math.abs(pct)}% vs this point last month
    </span>
  );
}

function Kpis({ summary, budget, loading }: { summary?: Summary; budget?: Budget; loading: boolean }) {
  const safe = budget?.totals.safe_per_day;
  const cards = [
    { label: 'Spent', value: summary?.spending, extra: summary && <Change now={summary.spending} before={summary.previous.spending_to_date} /> },
    { label: 'Came in', value: summary?.income, extra: <span className="text-xs text-subtle">Salary, interest, refunds</span> },
    {
      label: 'Left over',
      value: summary?.net,
      extra: <span className="text-xs text-subtle">{summary?.savings_rate != null ? `${Math.round(summary.savings_rate * 100)}% of income kept` : 'Income minus spending'}</span>,
    },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c, i) => (
        <motion.div key={c.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.3 }}>
          <Surface className="h-full p-5">
            <p className="eyebrow">{c.label}</p>
            {loading || c.value === undefined ? (
              <Skeleton className="mt-3 h-9 w-32" />
            ) : (
              <Amount
                value={c.value}
                className={cn('mt-2 block font-display text-[34px] leading-tight font-bold tracking-tight', c.label === 'Left over' && (c.value < 0 ? 'text-expense' : 'text-income'))}
              />
            )}
            <div className="mt-1">{c.extra}</div>
          </Surface>
        </motion.div>
      ))}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.3 }}>
        <Link to="/budget">
          <Surface className="h-full bg-primary p-5 text-primary-foreground transition hover:brightness-105">
            <p className="font-mono text-[11px] tracking-[0.18em] uppercase opacity-75">Safe to spend today</p>
            {safe == null ? <p className="mt-2 font-display text-[34px] font-bold">—</p> : <Amount value={safe} className="mt-2 block font-display text-[34px] leading-tight font-bold" />}
            <p className="mt-1 text-xs opacity-75">{summary ? `a day for the ${summary.days_left} days left` : ''}</p>
          </Surface>
        </Link>
      </motion.div>
    </div>
  );
}

function CategoryBars({ summary, budget }: { summary?: Summary; budget?: Budget }) {
  if (!summary) return <Skeleton className="h-64" />;
  const budgets = new Map(budget?.groups.flatMap((g) => g.categories).map((c) => [c.id, c]));
  const top = summary.by_category.slice(0, 7);
  if (!top.length) return <p className="py-10 text-center text-sm text-muted">No spending yet this month.</p>;
  const max = Math.max(...top.map((c) => Math.max(c.spent, budgets.get(c.id ?? -1)?.budgeted ?? 0)), 1);
  return (
    <ul className="space-y-4">
      {top.map((c, i) => {
        const b = c.id != null ? budgets.get(c.id) : undefined;
        const over = b?.has_budget && c.spent > b.budgeted + b.carry;
        return (
          <li key={c.id ?? 'none'}>
            <Link to={c.id ? `/transactions?category=${c.id}&from=${summary.start}&to=${summary.end}` : `/transactions?uncategorized=1&from=${summary.start}&to=${summary.end}`} className="flex items-center gap-3">
              <CategoryIcon icon={c.icon} color={c.color} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{c.name}</span>
                  <span className="flex items-baseline gap-2">
                    {b?.has_budget && <span className={cn('num text-xs', over ? 'text-expense' : 'text-subtle')}>of {formatMoney(b.budgeted + b.carry)}</span>}
                    <Amount value={c.spent} className="font-medium" />
                  </span>
                </div>
                <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-surface-muted">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: over ? 'var(--expense)' : c.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(c.spent / max) * 100}%` }}
                    transition={{ delay: 0.1 + i * 0.04, duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
                  />
                  {b?.has_budget && <div className="absolute top-0 h-full w-0.5 bg-foreground/50" style={{ left: `${Math.min(((b.budgeted + b.carry) / max) * 100, 99.5)}%` }} />}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function UpcomingBills() {
  const { data } = useUpcoming(14);
  if (!data?.length) return null;
  const total = data.filter((u) => u.amount < 0).reduce((s, u) => s + u.amount, 0);
  return (
    <Surface className="p-6">
      <SectionTitle title="Coming" accent="up" right={<Link to="/bills" className="eyebrow hover:text-foreground">Bills →</Link>} />
      <ul className="space-y-2">
        {data.slice(0, 5).map((u) => (
          <li key={`${u.recurring_id}-${u.date}`} className="flex items-center gap-3 text-sm">
            <span className={cn('num w-14 shrink-0 text-xs', u.status === 'overdue' ? 'text-expense' : 'text-subtle')}>
              {u.days < 0 ? 'overdue' : u.days === 0 ? 'today' : u.days === 1 ? 'tomorrow' : `in ${u.days}d`}
            </span>
            <span className="flex-1 truncate">{u.name}</span>
            <Amount value={u.amount} signed tone="flow" className="font-medium" />
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-border pt-3 text-xs text-subtle">
        <Amount value={-total} /> going out in the next 14 days
      </p>
    </Surface>
  );
}
