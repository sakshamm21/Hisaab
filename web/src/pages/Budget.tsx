import { CalendarRange, Copy, Repeat, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { CategoryIcon } from '../components/CategoryIcon';
import { Button, MoneyInput } from '../components/forms';
import { PeriodSwitcher } from '../components/PeriodSwitcher';
import { Amount, PageHeader, SectionTitle, Skeleton, Surface } from '../components/ui';
import { api, type Budget as BudgetData, type BudgetCategory } from '../lib/api';
import { cn } from '../lib/cn';
import { formatMoney } from '../lib/money';
import { useBudget, useMoneyMutation, useSummary } from '../lib/queries';

export function Budget() {
  const { data: summary } = useSummary();
  const current = summary?.month;
  const [chosen, setChosen] = useState<string | null>(null);
  const period = chosen ?? current;
  const { data: budget, isLoading } = useBudget(period);

  const fill = useMoneyMutation(
    (mode: 'average' | 'last' | 'copy') => api<{ changed: number }>(`/budget/${period}/fill`, { method: 'POST', json: { mode } }),
    { success: (r) => (r.changed ? `Set ${r.changed} budgets` : 'Nothing to fill: every category already has a budget') },
  );

  const hasBudgets = budget?.groups.some((g) => g.categories.some((c) => c.has_budget));

  return (
    <>
      <PageHeader
        eyebrow={budget ? `${budget.label}${budget.is_current ? ` · ${budget.days_left} days left` : ''}` : 'What is left to spend'}
        title="Your"
        accent="budget"
        actions={period && <PeriodSwitcher period={period} label={budget?.label} current={current} onChange={setChosen} />}
      />

      {isLoading || !budget ? (
        <Skeleton className="h-96 rounded-3xl" />
      ) : (
        <>
          <Totals b={budget} />

          {!hasBudgets && (
            <Surface className="mb-6 flex flex-wrap items-center gap-4 border-primary/40 p-5">
              <Sparkles className="size-5 text-primary" />
              <p className="flex-1 text-sm">
                No budget for this month yet. Start from what you actually spend: Hisaab rounds your last 3 months up to the next ₹100.
              </p>
              <Button variant="primary" onClick={() => fill.mutate('average')}>
                Use my 3-month average
              </Button>
              <Button onClick={() => fill.mutate('copy')}>
                <Copy className="size-4" /> Copy last month
              </Button>
            </Surface>
          )}

          <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
            <Surface className="overflow-hidden">
              <div className="eyebrow hidden grid-cols-[1fr_8rem_6.5rem_7rem] gap-3 border-b border-border px-5 py-3 sm:grid">
                <span>Category</span>
                <span className="text-right">Budget</span>
                <span className="text-right">Spent</span>
                <span className="text-right">Left</span>
              </div>
              {budget.groups.map((g) => (
                <div key={g.id}>
                  <p className="eyebrow bg-surface-muted/50 px-5 py-2">{g.name}</p>
                  {g.categories.map((c) => (
                    <Row key={c.id} c={c} period={budget.period} />
                  ))}
                </div>
              ))}
            </Surface>
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-1 xl:content-start">
              <Split b={budget} />
              {hasBudgets && (
                <Surface className="p-5">
                  <p className="eyebrow mb-3">Quick fill</p>
                  <div className="flex flex-col gap-2">
                    <Button size="sm" onClick={() => fill.mutate('average')}>
                      <CalendarRange className="size-3.5" /> Empty ones from 3-month average
                    </Button>
                    <Button size="sm" onClick={() => fill.mutate('copy')}>
                      <Copy className="size-3.5" /> Empty ones from last month
                    </Button>
                  </div>
                  <p className="mt-3 text-xs text-subtle">
                    Turn on <Repeat className="inline size-3" /> rollover for a category to carry unspent money forward, e.g. for yearly insurance.
                  </p>
                </Surface>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Totals({ b }: { b: BudgetData }) {
  const t = b.totals;
  const cards = [
    { label: 'Budgeted', value: t.budgeted, hint: t.income ? `${formatMoney(t.to_budget)} of income not budgeted` : 'No income yet this month' },
    { label: 'Spent', value: t.spent, hint: t.unbudgeted_spend ? `${formatMoney(t.unbudgeted_spend)} outside any budget` : 'All within budgeted categories' },
    { label: 'Left in budgets', value: t.available, hint: t.available < 0 ? 'Over budget overall' : 'Across categories with a budget', tone: t.available < 0 ? 'text-expense' : '' },
  ];
  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Surface key={c.label} className="p-5">
          <p className="eyebrow">{c.label}</p>
          <Amount value={c.value} className={cn('mt-2 block font-display text-3xl font-bold', c.tone)} />
          <p className="mt-1 text-xs text-subtle">{c.hint}</p>
        </Surface>
      ))}
      <Surface className="bg-primary p-5 text-primary-foreground">
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase opacity-75">Safe to spend</p>
        {t.safe_per_day == null ? (
          <p className="mt-2 font-display text-3xl font-bold">—</p>
        ) : (
          <Amount value={t.safe_per_day} className="mt-2 block font-display text-3xl font-bold" />
        )}
        <p className="mt-1 text-xs opacity-75">{t.safe_per_day == null ? 'Only for the current month' : `a day for the ${b.days_left} days left`}</p>
      </Surface>
    </div>
  );
}

function Row({ c, period }: { c: BudgetCategory; period: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<number | null>(c.budgeted || null);
  const save = useMoneyMutation((amount: number) => api(`/budget/${period}/${c.id}`, { method: 'PUT', json: { amount } }), {
    onSuccess: () => setEditing(false),
  });
  const rollover = useMoneyMutation(() => api(`/categories/${c.id}`, { method: 'PATCH', json: { rollover: !c.rollover } }), {
    success: c.rollover ? 'Rollover off' : 'Unspent money will roll over',
  });
  const total = c.budgeted + c.carry;
  const pct = total > 0 ? Math.min(c.spent / total, 1) : c.spent > 0 ? 1 : 0;
  const over = c.available < 0;
  const quiet = !c.has_budget && !c.spent;

  return (
    <div className={cn('grid grid-cols-[1fr_auto] items-center gap-3 border-b border-border/60 px-5 py-3 last:border-0 sm:grid-cols-[1fr_8rem_6.5rem_7rem]', quiet && 'opacity-55 hover:opacity-100')}>
      <div className="flex min-w-40 items-center gap-3">
        <CategoryIcon icon={c.icon} color={c.color} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Link to={`/transactions?category=${c.id}`} className="truncate text-sm font-medium hover:underline">
              {c.name}
            </Link>
            <button title={c.rollover ? 'Rollover is on' : 'Turn on rollover'} onClick={() => rollover.mutate(undefined)} className={cn('rounded p-0.5', c.rollover ? 'text-primary' : 'text-subtle opacity-0 hover:opacity-100 group-hover:opacity-100 focus:opacity-100')}>
              <Repeat className="size-3" />
            </button>
          </div>
          {(c.has_budget || c.spent > 0) && (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <div className={cn('h-full rounded-full transition-all', over ? 'bg-expense' : pct > 0.85 ? 'bg-warning' : 'bg-income')} style={{ width: `${pct * 100}%` }} />
            </div>
          )}
          {c.carry !== 0 && <p className="mt-1 text-[11px] text-subtle">{c.carry > 0 ? '+' : ''}{formatMoney(c.carry)} rolled over</p>}
        </div>
      </div>
      <div className="text-right">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(value ?? 0);
            }}
          >
            <MoneyInput autoFocus value={value} onChange={setValue} className="[&_input]:h-8 [&_input]:text-right" />
          </form>
        ) : (
          <button onClick={() => setEditing(true)} className="num w-full rounded-lg px-2 py-1 text-right text-sm hover:bg-surface-muted" title={c.average ? `3-month average ${formatMoney(c.average)}` : undefined}>
            {c.has_budget ? <Amount value={c.budgeted} /> : <span className="text-subtle">{c.average ? `avg ${formatMoney(c.average)}` : 'Set'}</span>}
          </button>
        )}
      </div>
      <Amount value={c.spent} className="hidden text-right text-sm text-muted sm:block" />
      <div className="hidden text-right sm:block">
        {c.has_budget || c.carry ? <Amount value={c.available} className={cn('text-sm font-semibold', over ? 'text-expense' : 'text-income')} /> : <span className="text-sm text-subtle">—</span>}
      </div>
    </div>
  );
}

function Split({ b }: { b: BudgetData }) {
  const { actual, base, targets } = b.split;
  const rows = [
    { key: 'need' as const, label: 'Needs', color: 'bg-[#4f8fd8]' },
    { key: 'want' as const, label: 'Wants', color: 'bg-[#ef7a3c]' },
    { key: 'saving' as const, label: 'Savings', color: 'bg-income' },
  ];
  return (
    <Surface className="p-5">
      <SectionTitle title="Needs, wants," accent="savings" />
      <p className="mb-4 text-xs text-subtle">Share of {b.totals.income ? 'income' : 'spending'} so far, against your target.</p>
      <div className="space-y-4">
        {rows.map((r) => {
          const pct = base > 0 ? Math.round((actual[r.key] / base) * 100) : 0;
          const target = targets[r.key];
          const off = r.key === 'saving' ? pct < target : pct > target;
          return (
            <div key={r.key}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">{r.label}</span>
                <span className="num">
                  <span className={cn(off && 'text-warning')}>{pct}%</span> <span className="text-subtle">/ {target}%</span>
                </span>
              </div>
              <div className="relative mt-1.5 h-2 rounded-full bg-surface-muted">
                <div className={cn('h-full rounded-full', r.color)} style={{ width: `${Math.min(pct, 100)}%` }} />
                <div className="absolute top-[-3px] h-[14px] w-0.5 rounded bg-foreground/60" style={{ left: `${target}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-subtle">Savings counts money put into investments, like a SIP. Change targets in Settings.</p>
    </Surface>
  );
}
