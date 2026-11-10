import { Pencil, Plus, Target } from 'lucide-react';
import { useEffect, useState } from 'react';

import { CategoryIcon } from '../components/CategoryIcon';
import { Button, Dialog, Field, Input, MoneyInput, Select, Tabs } from '../components/forms';
import { Amount, EmptyState, PageHeader, Skeleton, Surface } from '../components/ui';
import { api, type Goal } from '../lib/api';
import { cn } from '../lib/cn';
import { formatMoney } from '../lib/money';
import { useAccounts, useGoals, useMoneyMutation } from '../lib/queries';

export function Goals() {
  const { data: goals, isLoading } = useGoals();
  const [editing, setEditing] = useState<Partial<Goal> | null>(null);
  const [adding, setAdding] = useState<Goal | null>(null);
  return (
    <>
      <PageHeader
        eyebrow="Saving for something"
        title="Your"
        accent="goals"
        actions={<Button variant="primary" onClick={() => setEditing({})}><Plus className="size-4" /> New goal</Button>}
      />
      {isLoading && <Skeleton className="h-60 rounded-3xl" />}
      {goals && !goals.length && (
        <EmptyState icon={Target} title="Save with a target">
          A trip, a laptop, an emergency fund: pick an amount and a date, and Hisaab tells you how much to put aside each month.
        </EmptyState>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        {goals?.map((g) => <GoalCard key={g.id} g={g} onEdit={() => setEditing(g)} onAdd={() => setAdding(g)} />)}
      </div>
      <GoalDialog value={editing} onClose={() => setEditing(null)} />
      <ContributionDialog goal={adding} onClose={() => setAdding(null)} />
    </>
  );
}

function Ring({ value, color }: { value: number; color: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 80 80" className="size-20 -rotate-90">
      <circle cx="40" cy="40" r={r} className="fill-none stroke-surface-muted" strokeWidth="8" />
      <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value)} style={{ transition: 'stroke-dashoffset 600ms' }} />
    </svg>
  );
}

function GoalCard({ g, onEdit, onAdd }: { g: Goal; onEdit: () => void; onAdd: () => void }) {
  const done = g.remaining === 0;
  return (
    <Surface className="group relative p-6">
      <button aria-label={`Edit ${g.name}`} onClick={onEdit} className="absolute top-4 right-4 rounded-full p-2 text-subtle opacity-0 group-hover:opacity-100 hover:bg-surface-muted">
        <Pencil className="size-4" />
      </button>
      <div className="flex items-center gap-5">
        <div className="relative">
          <Ring value={g.progress} color={g.color} />
          <span className="num absolute inset-0 grid place-items-center text-sm font-semibold">{Math.round(g.progress * 100)}%</span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CategoryIcon icon={g.icon} color={g.color} className="size-7 rounded-lg" />
            <p className="truncate text-lg font-semibold">{g.name}</p>
          </div>
          <p className="mt-1 text-sm">
            <Amount value={g.saved} className="font-semibold" /> <span className="text-subtle">of <Amount value={g.target_amount} /></span>
          </p>
          {g.target_date && <p className="text-xs text-subtle">by {new Date(g.target_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
        {done ? (
          <p className="col-span-2 font-medium text-income">Reached. Well done.</p>
        ) : (
          <>
            <div>
              <p className="eyebrow">{g.needed_per_month != null ? 'Needed a month' : 'Left to save'}</p>
              <Amount value={g.needed_per_month ?? g.remaining} className="mt-1 block font-semibold" />
            </div>
            <div>
              <p className="eyebrow">Your pace</p>
              <p className={cn('mt-1 font-semibold', g.on_track === false && 'text-warning', g.on_track && 'text-income')}>
                {g.pace_per_month ? `${formatMoney(g.pace_per_month)}/mo` : g.account_id ? 'Follows the account' : 'No savings yet'}
              </p>
              {g.projected_date && <p className="text-[11px] text-subtle">at this pace: {new Date(g.projected_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</p>}
            </div>
          </>
        )}
      </div>
      {!g.account_id && !done && (
        <Button size="sm" className="mt-4" onClick={onAdd}>
          <Plus className="size-3.5" /> Add money
        </Button>
      )}
    </Surface>
  );
}

const ICONS = ['target', 'plane', 'shield', 'laptop', 'house', 'gift', 'graduation-cap', 'car', 'heart-pulse', 'piggy-bank'];
const COLORS = ['#5b45e0', '#2fa5a5', '#3fa06b', '#ef7a3c', '#d45d9c', '#4f8fd8', '#d1a23a'];

function GoalDialog({ value, onClose }: { value: Partial<Goal> | null; onClose: () => void }) {
  const { data: accounts } = useAccounts();
  const [g, setG] = useState<Partial<Goal>>({});
  const [mode, setMode] = useState<'manual' | 'account'>('manual');
  useEffect(() => {
    if (value) {
      setG({ icon: 'target', color: COLORS[0], starting_amount: 0, ...value });
      setMode(value.account_id ? 'account' : 'manual');
    }
  }, [value]);
  const body = () => ({
    name: g.name, target_amount: g.target_amount, target_date: g.target_date || null, starting_amount: mode === 'manual' ? g.starting_amount ?? 0 : 0,
    account_id: mode === 'account' ? g.account_id : null, icon: g.icon, color: g.color, notes: g.notes ?? '', archived: !!g.archived,
  });
  const save = useMoneyMutation(() => (g.id ? api(`/goals/${g.id}`, { method: 'PUT', json: body() }) : api('/goals', { method: 'POST', json: body() })), { success: 'Saved', onSuccess: onClose });
  const remove = useMoneyMutation(() => api(`/goals/${g.id}`, { method: 'DELETE' }), { success: 'Goal deleted', onSuccess: onClose });
  return (
    <Dialog open={!!value} onClose={onClose} title={g.id ? 'Edit goal' : 'New goal'} footer={<>
      {g.id && <Button variant="danger" className="mr-auto" onClick={() => confirm('Delete this goal?') && remove.mutate(undefined)}>Delete</Button>}
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" disabled={!g.name || !g.target_amount || (mode === 'account' && !g.account_id)} onClick={() => save.mutate(undefined)}>Save</Button>
    </>}>
      <div className="space-y-4">
        <Field label="What for"><Input autoFocus value={g.name ?? ''} onChange={(e) => setG({ ...g, name: e.target.value })} placeholder="Goa trip" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target"><MoneyInput value={g.target_amount ?? null} onChange={(v) => setG({ ...g, target_amount: v ?? 0 })} /></Field>
          <Field label="By (optional)"><Input type="date" value={g.target_date ?? ''} onChange={(e) => setG({ ...g, target_date: e.target.value })} /></Field>
        </div>
        <Field label="Track progress by">
          <Tabs value={mode} onChange={setMode} options={[{ value: 'manual', label: 'Adding money myself' }, { value: 'account', label: "An account's balance" }]} />
        </Field>
        {mode === 'manual' ? (
          <Field label="Already saved"><MoneyInput value={g.starting_amount ?? null} onChange={(v) => setG({ ...g, starting_amount: v ?? 0 })} /></Field>
        ) : (
          <Field label="Account" hint="e.g. a separate savings account or FD for this goal">
            <Select value={g.account_id ?? ''} onChange={(e) => setG({ ...g, account_id: Number(e.target.value) || null })}>
              <option value="">Choose</option>
              {accounts?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        )}
        <div className="flex flex-wrap gap-1.5">
          {ICONS.map((i) => <button key={i} onClick={() => setG({ ...g, icon: i })} className={cn('rounded-xl p-0.5', g.icon === i && 'ring-2 ring-primary')}><CategoryIcon icon={i} color={g.color ?? COLORS[0]} className="size-8" /></button>)}
        </div>
        <div className="flex gap-1.5">
          {COLORS.map((c) => <button key={c} aria-label={c} onClick={() => setG({ ...g, color: c })} className="size-7 rounded-full" style={{ background: c, boxShadow: g.color === c ? `0 0 0 2px var(--surface-raised), 0 0 0 4px ${c}` : undefined }} />)}
        </div>
      </div>
    </Dialog>
  );
}

function ContributionDialog({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const [amount, setAmount] = useState<number | null>(null);
  const [out, setOut] = useState(false);
  useEffect(() => { setAmount(goal?.needed_per_month ?? null); setOut(false); }, [goal]);
  const save = useMoneyMutation(() => api(`/goals/${goal!.id}/entries`, { method: 'POST', json: { amount: (amount ?? 0) * (out ? -1 : 1) } }), {
    success: out ? 'Taken out' : 'Added to the goal',
    onSuccess: onClose,
  });
  return (
    <Dialog open={!!goal} onClose={onClose} title={goal?.name ?? ''} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!amount} onClick={() => save.mutate(undefined)}>Save</Button></>}>
      <div className="space-y-4">
        <Tabs value={out ? 'out' : 'in'} onChange={(v) => setOut(v === 'out')} options={[{ value: 'in', label: 'Put money in' }, { value: 'out', label: 'Take money out' }]} />
        <MoneyInput autoFocus value={amount} onChange={setAmount} />
        {goal?.entries.length ? (
          <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
            {goal.entries.map((e) => (
              <li key={e.id} className="flex justify-between text-muted">
                <span>{new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <Amount value={e.amount} signed />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Dialog>
  );
}
