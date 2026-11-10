import { Banknote, CreditCard, HandCoins, Landmark, LineChart, Pencil, Plus, Smartphone, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { AccountDialog, KIND_LABEL } from '../components/AccountDialog';
import { Button } from '../components/forms';
import { Amount, PageHeader, Skeleton, Surface } from '../components/ui';
import type { Account } from '../lib/api';
import { cn } from '../lib/cn';
import { useAccounts } from '../lib/queries';

const ICON: Record<Account['kind'], LucideIcon> = {
  bank: Landmark,
  cash: Banknote,
  credit_card: CreditCard,
  wallet: Smartphone,
  investment: LineChart,
  loan: HandCoins,
};

export function Accounts() {
  const [showArchived, setShowArchived] = useState(false);
  const { data: accounts, isLoading } = useAccounts(showArchived);
  const [editing, setEditing] = useState<Account | undefined>();
  const [open, setOpen] = useState(false);
  const live = (accounts ?? []).filter((a) => !a.archived);
  const netWorth = live.filter((a) => a.include_in_net_worth).reduce((s, a) => s + a.balance, 0);
  const assets = live.filter((a) => a.include_in_net_worth && a.balance > 0).reduce((s, a) => s + a.balance, 0);
  const debts = live.filter((a) => a.include_in_net_worth && a.balance < 0).reduce((s, a) => s + a.balance, 0);

  return (
    <>
      <PageHeader
        eyebrow="Balances and net worth"
        title="Your"
        accent="accounts"
        actions={
          <Button variant="primary" onClick={() => { setEditing(undefined); setOpen(true); }}>
            <Plus className="size-4" /> Add account
          </Button>
        }
      />

      <Surface className="mb-6 grid gap-6 bg-foreground p-7 text-background sm:grid-cols-[1fr_auto_auto]">
        <div>
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase opacity-60">Net worth</p>
          {isLoading ? <Skeleton className="mt-3 h-12 w-56 opacity-20" /> : <Amount value={netWorth} className="mt-2 block font-display text-5xl font-extrabold tracking-tight" />}
          <p className="mt-2 text-sm opacity-60">Everything you have, minus what you owe on cards and loans.</p>
        </div>
        <div className="sm:text-right">
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase opacity-60">You have</p>
          <Amount value={assets} className="mt-2 block font-display text-2xl font-bold" />
        </div>
        <div className="sm:text-right">
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase opacity-60">You owe</p>
          <Amount value={Math.abs(debts)} className="mt-2 block font-display text-2xl font-bold" />
        </div>
      </Surface>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-44 rounded-3xl" />)}
        {accounts?.map((a) => {
          const Icon = ICON[a.kind];
          return (
            <Surface key={a.id} className={cn('group relative p-6', a.archived && 'opacity-60')}>
              <button
                aria-label={`Edit ${a.name}`}
                onClick={() => { setEditing(a); setOpen(true); }}
                className="absolute top-4 right-4 rounded-full p-2 text-subtle opacity-0 transition group-hover:opacity-100 hover:bg-surface-muted hover:text-foreground"
              >
                <Pencil className="size-4" />
              </button>
              <Link to={`/transactions?account=${a.id}`} className="block">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                    <Icon className="size-5" strokeWidth={1.8} />
                  </span>
                  <div>
                    <p className="font-medium">{a.name}</p>
                    <p className="text-xs text-subtle">
                      {KIND_LABEL[a.kind]}
                      {a.archived ? ' · archived' : ''}
                    </p>
                  </div>
                </div>
                <Amount value={a.balance} className={cn('mt-6 block font-display text-3xl font-bold tracking-tight', a.balance < 0 && 'text-expense')} />
                <p className="num mt-1 text-xs text-subtle">
                  {a.transaction_count} transactions
                  {a.last_transaction && ` · last ${new Date(a.last_transaction).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                </p>
              </Link>
            </Surface>
          );
        })}
      </div>
      <button onClick={() => setShowArchived((s) => !s)} className="mt-6 text-sm text-muted hover:text-foreground">
        {showArchived ? 'Hide archived accounts' : 'Show archived accounts'}
      </button>

      <AccountDialog open={open} onClose={() => setOpen(false)} account={editing} />
    </>
  );
}
