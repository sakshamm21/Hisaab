import { useEffect, useState } from 'react';

import { api, type Transaction } from '../lib/api';
import { formatMoney } from '../lib/money';
import { useAccounts, useMoneyMutation } from '../lib/queries';
import { CategoryPicker } from './CategoryPicker';
import { Button, Dialog, Field, Input, MoneyInput, Select, Tabs } from './forms';

type Parsed = { amount: number | null; payee: string; date: string; category_id: number | null; tags: string };

const today = () => new Date().toISOString().slice(0, 10);

/** Type "450 zomato" and press Enter. Everything it guessed can be changed before saving. */
export function QuickAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: accounts } = useAccounts();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<Parsed>({ amount: null, payee: '', date: today(), category_id: null, tags: '' });
  const [touched, setTouched] = useState<Set<keyof Parsed>>(new Set());
  const [accountId, setAccountId] = useState<number | null>(null);
  const [incoming, setIncoming] = useState(false);

  useEffect(() => {
    if (open) {
      setText('');
      setTouched(new Set());
      setParsed({ amount: null, payee: '', date: today(), category_id: null, tags: '' });
      setIncoming(false);
    }
  }, [open]);

  useEffect(() => {
    if (accountId == null && accounts?.length) {
      // Cash is the usual thing to add by hand; otherwise the first account.
      setAccountId((accounts.find((a) => a.kind === 'cash') ?? accounts[0]).id);
    }
  }, [accounts, accountId]);

  useEffect(() => {
    if (!text.trim()) return;
    const handle = setTimeout(async () => {
      const p = await api<Parsed>('/quick-add/parse', { method: 'POST', json: { text } });
      setParsed((cur) => {
        const next = { ...cur };
        (Object.keys(p) as (keyof Parsed)[]).forEach((k) => {
          if (!touched.has(k)) (next as Record<string, unknown>)[k] = k === 'amount' && p.amount != null ? Math.abs(p.amount) : p[k];
        });
        return next;
      });
      if (p.amount != null && !touched.has('amount')) setIncoming(p.amount > 0);
    }, 180);
    return () => clearTimeout(handle);
  }, [text, touched]);

  const set = <K extends keyof Parsed>(k: K, v: Parsed[K]) => {
    setTouched((t) => new Set(t).add(k));
    setParsed((p) => ({ ...p, [k]: v }));
  };

  const save = useMoneyMutation(
    () =>
      api<Transaction>('/transactions', {
        method: 'POST',
        json: {
          account_id: accountId,
          date: parsed.date,
          amount: (parsed.amount ?? 0) * (incoming ? 1 : -1),
          payee: parsed.payee,
          category_id: parsed.category_id,
          tags: parsed.tags,
        },
      }),
    { success: (t) => `Added ${formatMoney(t.amount, { signed: true })} · ${t.payee || 'transaction'}`, onSuccess: onClose },
  );
  const canSave = !!parsed.amount && accountId != null;

  return (
    <Dialog open={open} onClose={onClose} title="Add a transaction">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) save.mutate(undefined);
        }}
      >
        <Field label="Type it like you'd say it" hint='e.g. "450 zomato", "+2k freelance", "120 auto yesterday #trip"'>
          <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="450 zomato" className="h-12 text-base" />
        </Field>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Amount">
            <MoneyInput value={parsed.amount} onChange={(v) => set('amount', v)} />
          </Field>
          <Field label="Direction">
            <Tabs
              value={incoming ? 'in' : 'out'}
              onChange={(v) => {
                setTouched((t) => new Set(t).add('amount'));
                setIncoming(v === 'in');
              }}
              options={[
                { value: 'out', label: 'Out' },
                { value: 'in', label: 'In' },
              ]}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Payee">
            <Input value={parsed.payee} onChange={(e) => set('payee', e.target.value)} />
          </Field>
          <Field label="Date">
            <Input type="date" value={parsed.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <CategoryPicker value={parsed.category_id} onChange={(v) => set('category_id', v)} income={incoming} />
          </Field>
          <Field label="Account">
            <Select value={accountId ?? ''} onChange={(e) => setAccountId(Number(e.target.value))}>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex justify-end pt-1">
          <Button type="submit" variant="primary" disabled={!canSave || save.isPending}>
            {save.isPending ? 'Adding…' : 'Add'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
