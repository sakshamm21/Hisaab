import { useQuery } from '@tanstack/react-query';
import { ArrowRightLeft, Plus, Split as SplitIcon, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { api, type Transaction } from '../lib/api';
import { formatMoney } from '../lib/money';
import { updateTransaction, useAccounts, useMoneyMutation } from '../lib/queries';
import { CategoryPicker } from './CategoryPicker';
import { Button, Dialog, Field, Input, MoneyInput, Select, Switch, Tabs } from './forms';

type Mode = 'category' | 'transfer' | 'split';
type Part = { amount: number | null; category_id: number | null };

export function TransactionEditor({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { data: t } = useQuery({
    queryKey: ['transaction', id],
    queryFn: () => api<Transaction>(`/transactions/${id}`),
    enabled: id != null,
  });
  return (
    <Dialog open={id != null} onClose={onClose} title="Edit transaction">
      {t ? <EditorForm key={t.id} t={t} onDone={onClose} /> : <div className="h-64" />}
    </Dialog>
  );
}

function EditorForm({ t, onDone }: { t: Transaction; onDone: () => void }) {
  const { data: accounts } = useAccounts();
  const [payee, setPayee] = useState(t.payee);
  const [amount, setAmount] = useState<number | null>(Math.abs(t.amount));
  const [incoming, setIncoming] = useState(t.amount > 0);
  const [date, setDate] = useState(t.date);
  const [accountId, setAccountId] = useState(t.account_id);
  const [categoryId, setCategoryId] = useState<number | null>(t.category_id);
  const [notes, setNotes] = useState(t.notes);
  const [tags, setTags] = useState(t.tags ? t.tags.split(' ').map((x) => `#${x}`).join(' ') : '');
  const [exclude, setExclude] = useState(!!t.exclude_from_reports);
  const [mode, setMode] = useState<Mode>(t.is_transfer ? 'transfer' : t.split_count ? 'split' : 'category');
  const [transferTo, setTransferTo] = useState<number | null>(t.transfer_account_id);
  const [parts, setParts] = useState<Part[]>(
    t.splits?.length
      ? t.splits.map((s) => ({ amount: Math.abs(s.amount), category_id: s.category_id }))
      : [
          { amount: Math.abs(t.amount), category_id: t.category_id },
          { amount: null, category_id: null },
        ],
  );
  useEffect(() => {
    setTransferTo(t.transfer_account_id);
  }, [t.transfer_account_id]);

  const signed = (amount ?? 0) * (incoming ? 1 : -1);
  const partsTotal = parts.reduce((s, p) => s + (p.amount ?? 0), 0);
  const splitOk = mode !== 'split' || partsTotal === Math.abs(signed);

  const save = useMoneyMutation(
    async () => {
      const patch: Record<string, unknown> = {};
      if (payee !== t.payee) patch.payee = payee;
      if (signed !== t.amount) patch.amount = signed;
      if (date !== t.date) patch.date = date;
      if (accountId !== t.account_id) patch.account_id = accountId;
      if (notes !== t.notes) patch.notes = notes;
      if (tags !== t.tags) patch.tags = tags;
      if (exclude !== !!t.exclude_from_reports) patch.exclude_from_reports = exclude;
      if (mode === 'transfer' && transferTo !== t.transfer_account_id) patch.transfer_account_id = transferTo ?? 0;
      if (mode !== 'transfer' && t.is_transfer) patch.transfer_account_id = 0;
      if (mode === 'category' && categoryId !== t.category_id) {
        if (categoryId) patch.category_id = categoryId;
        else patch.clear_category = true;
      }
      if (!t.reviewed) patch.reviewed = true;
      if (Object.keys(patch).length) await updateTransaction(t.id, patch);
      if (mode === 'split') {
        await api(`/transactions/${t.id}/splits`, {
          method: 'PUT',
          json: { parts: parts.filter((p) => p.amount).map((p) => ({ amount: (p.amount ?? 0) * (incoming ? 1 : -1), category_id: p.category_id })) },
        });
      } else if (t.split_count) {
        await api(`/transactions/${t.id}/splits`, { method: 'PUT', json: { parts: [] } });
      }
    },
    { success: 'Saved', onSuccess: onDone },
  );

  const remove = useMoneyMutation(() => api(`/transactions/${t.id}`, { method: 'DELETE' }), {
    success: 'Deleted',
    onSuccess: onDone,
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (splitOk && amount) save.mutate(undefined);
      }}
    >
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="Amount">
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="Direction">
          <Tabs
            value={incoming ? 'in' : 'out'}
            onChange={(v) => setIncoming(v === 'in')}
            options={[
              { value: 'out', label: 'Out' },
              { value: 'in', label: 'In' },
            ]}
          />
        </Field>
      </div>
      <Field label="Payee">
        <Input value={payee} onChange={(e) => setPayee(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Account">
          <Select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))}>
            {accounts?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Tabs
        value={mode}
        onChange={setMode}
        options={[
          { value: 'category', label: 'Category' },
          { value: 'transfer', label: <><ArrowRightLeft className="size-3.5" /> Transfer</> },
          { value: 'split', label: <><SplitIcon className="size-3.5" /> Split</> },
        ]}
      />
      {mode === 'category' && <CategoryPicker value={categoryId} onChange={setCategoryId} income={incoming} />}
      {mode === 'transfer' && (
        <Field label={incoming ? 'Money came from' : 'Money went to'} hint="Transfers between your own accounts never count as spending or income.">
          <Select value={transferTo ?? ''} onChange={(e) => setTransferTo(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Choose an account</option>
            {accounts?.filter((a) => a.id !== accountId).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {mode === 'split' && (
        <div className="space-y-2">
          {parts.map((p, i) => (
            <div key={i} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-2">
              <MoneyInput value={p.amount} onChange={(v) => setParts((ps) => ps.map((x, j) => (j === i ? { ...x, amount: v } : x)))} />
              <CategoryPicker value={p.category_id} onChange={(c) => setParts((ps) => ps.map((x, j) => (j === i ? { ...x, category_id: c } : x)))} />
              <button type="button" aria-label="Remove part" onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))} className="p-2 text-subtle hover:text-expense">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between text-xs">
            <Button type="button" size="sm" variant="ghost" onClick={() => setParts((ps) => [...ps, { amount: null, category_id: null }])}>
              <Plus className="size-3.5" /> Add part
            </Button>
            <span className={splitOk ? 'text-subtle' : 'text-expense'}>
              {formatMoney(partsTotal)} of {formatMoney(Math.abs(signed))}
              {!splitOk && ` · ${formatMoney(Math.abs(signed) - partsTotal)} left`}
            </span>
          </div>
        </div>
      )}

      <Field label="Notes">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </Field>
      <Field label="Tags" hint="Group spending across categories, e.g. #goa-trip">
        <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="#tag" />
      </Field>
      <Switch checked={exclude} onChange={setExclude} label="Leave out of reports (e.g. reimbursed by work)" />

      {t.raw_description && (
        <p className="rounded-xl bg-surface-muted px-3 py-2 font-mono text-[11px] break-all text-subtle">{t.raw_description}</p>
      )}

      <div className="flex items-center justify-between gap-2 pt-2">
        <Button
          type="button"
          variant="danger"
          onClick={() => confirm('Delete this transaction?') && remove.mutate(undefined)}
        >
          <Trash2 className="size-4" /> Delete
        </Button>
        <Button type="submit" variant="primary" disabled={!amount || !splitOk || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
