import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, CalendarCheck, Lightbulb, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useNavigate, useParams } from 'react-router';

import { CategoryIcon } from '../components/CategoryIcon';
import { Button } from '../components/forms';
import { PeriodSwitcher, shiftPeriod } from '../components/PeriodSwitcher';
import { Amount, PageHeader, SectionTitle, Skeleton, Surface } from '../components/ui';
import { useAiStatus } from '../lib/ai';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { formatMoney } from '../lib/money';
import { useMoneyMutation, useSummary } from '../lib/queries';

type Change = { id: number | null; name: string; icon: string | null; color: string | null; spent: number; usual: number; change: number };
export type ReviewData = {
  period: string;
  label: string;
  start: string;
  end: string;
  complete: boolean;
  income: number;
  spending: number;
  net: number;
  savings_rate: number | null;
  usual_spending: number;
  top_categories: { id: number | null; name: string; icon: string; color: string; spent: number }[];
  up: Change[];
  down: Change[];
  budgets: { count: number; over: { name: string; budget: number; spent: number }[]; rows: { id: number; name: string; budget: number; spent: number }[] };
  top_merchants: { payee: string; spent: number; count: number }[];
  biggest: { id: number; payee: string; amount: number; date: string; category: string | null }[];
  no_spend_days: number;
  goals: { name: string; added: number }[];
  summary_lines: string[];
  suggestions: string[];
  ai_summary?: string;
};

/** The monthly ritual: what happened, what changed, and next month's budget in one place. */
export function Review() {
  const { period: param } = useParams();
  const navigate = useNavigate();
  const { data: summary } = useSummary();
  const latest = summary ? shiftPeriod(summary.month, -1) : undefined;
  const period = param ?? latest;
  const { data } = useQuery({ queryKey: ['review', period], queryFn: () => api<ReviewData>(`/review/${period}`), enabled: !!period });
  const next = period ? shiftPeriod(period, 1) : '';
  const { data: ai } = useAiStatus();
  const [aiText, setAiText] = useState<Record<string, string>>({});
  const [writing, setWriting] = useState(false);
  async function writeUp() {
    setWriting(true);
    try {
      const r = await api<{ text: string }>(`/ai/review/${period}`, { method: 'POST' });
      setAiText((t) => ({ ...t, [period!]: r.text }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setWriting(false);
    }
  }
  const plan = useMoneyMutation(() => api<{ changed: number }>(`/budget/${next}/fill`, { method: 'POST', json: { mode: 'average' } }), {
    success: (r) => (r.changed ? `Set ${r.changed} budgets for next month` : 'Next month already has budgets'),
    onSuccess: () => navigate('/budget'),
  });

  return (
    <>
      <PageHeader
        eyebrow={data ? `${data.start} → ${data.end}${data.complete ? '' : ' · still in progress'}` : 'Month in review'}
        title={data?.label.split(' ')[0] ?? 'Month'}
        accent="in review"
        actions={period && <PeriodSwitcher period={period} label={data?.label} onChange={(p) => navigate(`/review/${p}`)} />}
      />
      {!data ? (
        <Skeleton className="h-96 rounded-3xl" />
      ) : (
        <div className="space-y-6">
          <Surface className="p-6 sm:p-8">
            <div className="grid gap-6 sm:grid-cols-4">
              {[
                ['Came in', data.income, ''],
                ['Went out', data.spending, ''],
                ['Kept', data.net, data.net < 0 ? 'text-expense' : 'text-income'],
              ].map(([l, v, c]) => (
                <div key={String(l)}>
                  <p className="eyebrow">{l}</p>
                  <Amount value={Number(v)} className={cn('mt-1 block font-display text-3xl font-bold', String(c))} />
                </div>
              ))}
              <div>
                <p className="eyebrow">Savings rate</p>
                <p data-amount className="num mt-1 font-display text-3xl font-bold">{data.savings_rate == null ? '—' : `${Math.round(data.savings_rate * 100)}%`}</p>
              </div>
            </div>
            <div className="mt-8 space-y-2 border-t border-border pt-6 text-[17px] leading-relaxed">
              {aiText[data.period] ? <p data-amount>{aiText[data.period]}</p> : data.summary_lines.map((l) => <p key={l} data-amount>{l}</p>)}
            </div>
            {ai?.ready && (
              <Button size="sm" variant="ghost" className="mt-3" onClick={writeUp} disabled={writing}>
                <Sparkles className="size-3.5" /> {writing ? 'Writing…' : aiText[data.period] ? 'Write it again' : 'Write it up with AI'}
              </Button>
            )}
          </Surface>

          <div className="grid gap-6 lg:grid-cols-2">
            <Surface className="p-6">
              <SectionTitle title="What" accent="changed" />
              <p className="mb-4 text-xs text-subtle">Compared with your usual month (median of the 3 before).</p>
              {!data.up.length && !data.down.length && <p className="text-sm text-muted">Nothing moved much. A steady month.</p>}
              <ul className="space-y-3">
                {[...data.up, ...data.down].map((c) => (
                  <li key={`${c.id}`} className="flex items-center gap-3 text-sm">
                    <CategoryIcon icon={c.icon} color={c.color} className="size-8" />
                    <span className="flex-1">{c.name}<span className="block text-xs text-subtle" data-amount>{formatMoney(c.spent)} vs usual {formatMoney(c.usual)}</span></span>
                    <span className={cn('num inline-flex items-center gap-0.5 font-medium', c.change > 0 ? 'text-expense' : 'text-income')} data-amount>
                      {c.change > 0 ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
                      {formatMoney(Math.abs(c.change))}
                    </span>
                  </li>
                ))}
              </ul>
            </Surface>

            <Surface className="p-6">
              <SectionTitle title="Your" accent="budgets" />
              {!data.budgets.count ? (
                <p className="text-sm text-muted">No budgets were set for this month.</p>
              ) : (
                <ul className="space-y-2.5">
                  {data.budgets.rows.map((b) => {
                    const pct = b.budget ? b.spent / b.budget : 0;
                    return (
                      <li key={b.id} className="text-sm">
                        <div className="flex justify-between"><span>{b.name}</span><span className={cn('num', b.spent > b.budget && 'text-expense')} data-amount>{formatMoney(b.spent)} / {formatMoney(b.budget)}</span></div>
                        <div className="mt-1 h-1.5 rounded-full bg-surface-muted"><div className={cn('h-full rounded-full', pct > 1 ? 'bg-expense' : 'bg-income')} style={{ width: `${Math.min(pct, 1) * 100}%` }} /></div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Surface>

            <Surface className="p-6">
              <SectionTitle title="Where it" accent="went" />
              <ul className="space-y-2 text-sm">
                {data.top_merchants.map((m) => (
                  <li key={m.payee} className="flex justify-between gap-3"><span className="truncate">{m.payee} <span className="text-xs text-subtle">{m.count}×</span></span><Amount value={m.spent} /></li>
                ))}
              </ul>
              <p className="eyebrow mt-5 mb-2">Biggest payments</p>
              <ul className="space-y-2 text-sm">
                {data.biggest.map((b) => (
                  <li key={b.id} className="flex justify-between gap-3"><span className="truncate">{b.payee} <span className="text-xs text-subtle">{b.date}</span></span><Amount value={b.amount} /></li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-subtle">{data.no_spend_days} no-spend days{data.goals.length ? ` · ${data.goals.map((g) => `${formatMoney(g.added)} to ${g.name}`).join(', ')}` : ''}</p>
            </Surface>

            <Surface className="border-primary/40 p-6">
              <SectionTitle title="For next" accent="month" />
              <ul className="space-y-3">
                {data.suggestions.map((s) => (
                  <li key={s} className="flex gap-3 text-sm"><Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" /><span data-amount>{s}</span></li>
                ))}
              </ul>
              <Button variant="primary" className="mt-6" onClick={() => plan.mutate(undefined)}>
                <CalendarCheck className="size-4" /> Plan next month's budget
              </Button>
              <p className="mt-2 text-xs text-subtle">Fills any empty budgets from your 3-month average. You can adjust each one after.</p>
            </Surface>
          </div>
        </div>
      )}
    </>
  );
}
