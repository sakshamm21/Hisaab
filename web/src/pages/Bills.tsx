import { Check, Pencil, Plus, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { CategoryIcon } from '../components/CategoryIcon';
import { CategoryPicker } from '../components/CategoryPicker';
import { Button, Dialog, Field, Input, MoneyInput, Select, Switch, Tabs } from '../components/forms';
import { Amount, PageHeader, SectionTitle, Skeleton, Surface } from '../components/ui';
import { api, type Cadence, type DetectedRecurring, type Recurring } from '../lib/api';
import { cn } from '../lib/cn';
import { formatMoney } from '../lib/money';
import { useAccounts, useDetected, useMoneyMutation, useRecurring, useUpcoming } from '../lib/queries';

const CADENCE: Record<Cadence, string> = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };

function dueLabel(days: number) {
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

export function Bills() {
  const { data } = useRecurring();
  const { data: upcoming } = useUpcoming(30);
  const [editing, setEditing] = useState<Partial<Recurring> | null>(null);

  return (
    <>
      <PageHeader
        eyebrow="What's due next"
        title="Bills &"
        accent="subscriptions"
        actions={
          <Button variant="primary" onClick={() => setEditing({})}>
            <Plus className="size-4" /> Add
          </Button>
        }
      />

      {data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Surface className="p-5">
            <p className="eyebrow">Regular money out</p>
            <Amount value={data.totals.monthly_out} className="mt-2 block font-display text-3xl font-bold" />
            <p className="mt-1 text-xs text-subtle">a month · <Amount value={data.totals.yearly_out} /> a year</p>
          </Surface>
          <Surface className="p-5">
            <p className="eyebrow">Subscriptions</p>
            <Amount value={data.totals.subscriptions_monthly} className="mt-2 block font-display text-3xl font-bold" />
            <p className="mt-1 text-xs text-subtle">a month · <Amount value={data.totals.subscriptions_monthly * 12} /> a year</p>
          </Surface>
          <Surface className="p-5">
            <p className="eyebrow">Regular money in</p>
            <Amount value={data.totals.monthly_in} className="mt-2 block font-display text-3xl font-bold text-income" />
            <p className="mt-1 text-xs text-subtle">a month</p>
          </Surface>
        </div>
      )}

      <Detected />

      <div className="grid gap-6 lg:grid-cols-2">
        <Surface className="p-5">
          <SectionTitle title="Next" accent="30 days" />
          {!upcoming ? (
            <Skeleton className="h-48" />
          ) : !upcoming.length ? (
            <p className="py-10 text-center text-sm text-muted">Nothing due in the next 30 days.</p>
          ) : (
            <ul className="space-y-1">
              {upcoming.map((u) => (
                <li key={`${u.recurring_id}-${u.date}`} className="flex items-center gap-3 rounded-xl px-2 py-2">
                  <div className={cn('w-12 shrink-0 rounded-xl py-1 text-center', u.status === 'overdue' ? 'bg-expense-soft text-expense' : u.days <= 3 ? 'bg-warning-soft' : 'bg-surface-muted')}>
                    <p className="eyebrow text-[9px] text-current">{new Date(u.date).toLocaleDateString('en-IN', { month: 'short' })}</p>
                    <p className="num font-display text-lg leading-none font-bold">{new Date(u.date).getDate()}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{u.name}</p>
                    <p className={cn('text-xs', u.status === 'overdue' ? 'text-expense' : 'text-subtle')}>{dueLabel(u.days)}</p>
                  </div>
                  <Amount value={u.amount} signed tone="flow" className="text-sm font-medium" />
                </li>
              ))}
            </ul>
          )}
        </Surface>

        <Surface className="p-5">
          <SectionTitle title="Everything" accent="regular" />
          {!data ? (
            <Skeleton className="h-48" />
          ) : !data.items.length ? (
            <p className="py-10 text-center text-sm text-muted">Nothing yet. Add rent, SIPs and subscriptions, or confirm what Hisaab spots.</p>
          ) : (
            <ul className="space-y-1">
              {data.items.map((r) => (
                <li key={r.id} className={cn('group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-muted/60', !r.active && 'opacity-50')}>
                  <CategoryIcon icon={r.category_icon} color={r.category_color} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {r.name} <span className="eyebrow ml-1 text-[9px]">{r.kind}</span>
                    </p>
                    <p className="text-xs text-subtle">
                      Every {r.interval > 1 ? `${r.interval} ` : ''}{CADENCE[r.cadence]}{r.interval > 1 ? 's' : ''} · next {new Date(r.next_due).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      {r.last_paid && ` · paid ${new Date(r.last_paid).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <Amount value={r.amount} signed tone="flow" className="text-sm font-medium" />
                    {r.cadence !== 'monthly' && <p className="text-[11px] text-subtle">{formatMoney(r.monthly_cost)}/mo</p>}
                  </div>
                  <button aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)} className="rounded-full p-1.5 text-subtle opacity-0 group-hover:opacity-100 hover:text-foreground">
                    <Pencil className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Surface>
      </div>

      <RecurringDialog value={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function Detected() {
  const { data } = useDetected();
  const confirm = useMoneyMutation(
    (d: DetectedRecurring) =>
      api('/recurring', {
        method: 'POST',
        json: { name: d.name, payee: d.payee, kind: d.kind, amount: d.amount, cadence: d.cadence, next_due: d.next_due, category_id: d.category_id, account_id: d.account_id },
      }),
    { success: 'Tracking it' },
  );
  const dismiss = useMoneyMutation((payee: string) => api('/recurring/dismiss', { method: 'POST', json: { payee } }));
  if (!data?.length) return null;
  return (
    <Surface className="mb-6 border-primary/40 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <p className="font-medium">Hisaab spotted {data.length} regular payment{data.length > 1 ? 's' : ''}</p>
      </div>
      <ul className="divide-y divide-border">
        {data.map((d) => (
          <li key={d.payee} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{d.name}</p>
              <p className="text-xs text-subtle">
                {formatMoney(Math.abs(d.amount))} every {CADENCE[d.cadence]} · seen {d.occurrences} times · {d.kind}
              </p>
            </div>
            <Button size="sm" variant="primary" onClick={() => confirm.mutate(d)}>
              <Check className="size-3.5" /> Track
            </Button>
            <Button size="sm" variant="ghost" aria-label="Not regular" onClick={() => dismiss.mutate(d.payee)}>
              <X className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </Surface>
  );
}

function RecurringDialog({ value, onClose }: { value: Partial<Recurring> | null; onClose: () => void }) {
  const { data: accounts } = useAccounts();
  const [r, setR] = useState<Partial<Recurring>>({});
  const [incoming, setIncoming] = useState(false);
  useEffect(() => {
    if (value) {
      setR({ kind: 'bill', cadence: 'monthly', interval: 1, next_due: new Date().toISOString().slice(0, 10), active: 1, ...value });
      setIncoming((value.amount ?? -1) > 0);
    }
  }, [value]);
  const body = () => ({
    name: r.name, payee: r.payee || r.name, kind: incoming ? 'income' : r.kind === 'income' ? 'bill' : r.kind,
    amount: Math.abs(r.amount ?? 0) * (incoming ? 1 : -1), cadence: r.cadence, interval: r.interval ?? 1,
    next_due: r.next_due, category_id: r.category_id, account_id: r.account_id, auto_post: !!r.auto_post, notes: r.notes ?? '', active: !!r.active,
  });
  const save = useMoneyMutation(() => (r.id ? api(`/recurring/${r.id}`, { method: 'PUT', json: body() }) : api('/recurring', { method: 'POST', json: body() })), {
    success: 'Saved',
    onSuccess: onClose,
  });
  const remove = useMoneyMutation(() => api(`/recurring/${r.id}`, { method: 'DELETE' }), { success: 'Removed', onSuccess: onClose });
  return (
    <Dialog
      open={!!value}
      onClose={onClose}
      title={r.id ? 'Edit regular payment' : 'Add a regular payment'}
      footer={
        <>
          {r.id && <Button variant="danger" className="mr-auto" onClick={() => remove.mutate(undefined)}>Remove</Button>}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!r.name || !r.amount} onClick={() => save.mutate(undefined)}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Name"><Input autoFocus value={r.name ?? ''} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="Netflix" /></Field>
          <Field label="Type">
            <Tabs value={incoming ? 'income' : r.kind === 'subscription' ? 'subscription' : 'bill'} onChange={(k) => { setIncoming(k === 'income'); setR({ ...r, kind: k }); }}
              options={[{ value: 'bill', label: 'Bill' }, { value: 'subscription', label: 'Sub' }, { value: 'income', label: 'Income' }]} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount"><MoneyInput value={r.amount ? Math.abs(r.amount) : null} onChange={(v) => setR({ ...r, amount: v ?? 0 })} /></Field>
          <Field label="Next due"><Input type="date" value={r.next_due ?? ''} onChange={(e) => setR({ ...r, next_due: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Every">
            <div className="flex gap-2">
              <Input type="number" min={1} max={24} className="w-16" value={r.interval ?? 1} onChange={(e) => setR({ ...r, interval: Number(e.target.value) || 1 })} />
              <Select value={r.cadence} onChange={(e) => setR({ ...r, cadence: e.target.value as Cadence })}>
                <option value="weekly">week(s)</option>
                <option value="monthly">month(s)</option>
                <option value="yearly">year(s)</option>
              </Select>
            </div>
          </Field>
          <Field label="Category"><CategoryPicker value={r.category_id ?? null} onChange={(id) => setR({ ...r, category_id: id })} income={incoming} /></Field>
        </div>
        <Field label="Paid from" hint="Hisaab marks it paid when a matching transaction shows up.">
          <Select value={r.account_id ?? ''} onChange={(e) => setR({ ...r, account_id: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Any account</option>
            {accounts?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="Payee text to match" hint="Defaults to the name. Use the payee as it appears on your statement.">
          <Input value={r.payee ?? ''} onChange={(e) => setR({ ...r, payee: e.target.value })} placeholder={r.name} />
        </Field>
        <Switch checked={!!r.auto_post} onChange={(v) => setR({ ...r, auto_post: v ? 1 : 0 })} label="Add it automatically when due (for cash payments that won't appear on a statement)" />
        {r.id && <Switch checked={!!r.active} onChange={(v) => setR({ ...r, active: v ? 1 : 0 })} label="Active" />}
      </div>
    </Dialog>
  );
}
