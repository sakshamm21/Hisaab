import { useEffect, useState } from 'react';

import { api, type Account, type AccountKind } from '../lib/api';
import { useMoneyMutation } from '../lib/queries';
import { Button, Dialog, Field, Input, MoneyInput, Select, Switch, Tabs } from './forms';

export const KIND_LABEL: Record<AccountKind, string> = {
  bank: 'Bank account',
  cash: 'Cash',
  credit_card: 'Credit card',
  wallet: 'Wallet / UPI Lite',
  investment: 'Investments',
  loan: 'Loan',
};

/** Add or edit an account. Card and loan balances are entered as what you owe. */
export function AccountDialog({ open, onClose, account }: { open: boolean; onClose: () => void; account?: Account }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('bank');
  const [balance, setBalance] = useState<number | null>(0);
  const [owe, setOwe] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [netWorth, setNetWorth] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? '');
    setKind(account?.kind ?? 'bank');
    setBalance(Math.abs(account?.opening_balance ?? 0));
    setOwe((account?.opening_balance ?? 0) < 0);
    setDate(account?.opening_date ?? new Date().toISOString().slice(0, 10));
    setNetWorth(account ? !!account.include_in_net_worth : true);
  }, [open, account]);

  const debt = kind === 'credit_card' || kind === 'loan';
  const opening = (balance ?? 0) * (owe ? -1 : 1);
  const save = useMoneyMutation(
    () =>
      account
        ? api(`/accounts/${account.id}`, { method: 'PATCH', json: { name, kind, opening_balance: opening, opening_date: date, include_in_net_worth: netWorth } })
        : api('/accounts', { method: 'POST', json: { name, kind, opening_balance: opening, opening_date: date, include_in_net_worth: netWorth } }),
    { success: account ? 'Account updated' : 'Account added', onSuccess: onClose },
  );
  const archive = useMoneyMutation(() => api(`/accounts/${account!.id}`, { method: 'PATCH', json: { archived: !account!.archived } }), {
    success: account?.archived ? 'Account restored' : 'Account archived',
    onSuccess: onClose,
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={account ? 'Edit account' : 'Add an account'}
      footer={
        <>
          {account && (
            <Button variant="ghost" className="mr-auto" onClick={() => archive.mutate(undefined)}>
              {account.archived ? 'Restore' : 'Archive'}
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim() || save.isPending} onClick={() => save.mutate(undefined)}>
            {account ? 'Save' : 'Add account'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="ICICI Savings" />
        </Field>
        <Field label="Type">
          <Select
            value={kind}
            onChange={(e) => {
              const k = e.target.value as AccountKind;
              setKind(k);
              setOwe(k === 'credit_card' || k === 'loan');
            }}
          >
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Balance on the start date" hint={debt ? 'For cards and loans, choose "I owe" and enter what is outstanding.' : 'What the account held at the start of your first statement.'}>
            <MoneyInput value={balance} onChange={setBalance} />
          </Field>
          <Field label=" ">
            <Tabs value={owe ? 'owe' : 'have'} onChange={(v) => setOwe(v === 'owe')} options={[{ value: 'have', label: 'I have' }, { value: 'owe', label: 'I owe' }]} />
          </Field>
        </div>
        <Field label="Start date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Switch checked={netWorth} onChange={setNetWorth} label="Count in net worth" />
      </div>
    </Dialog>
  );
}
