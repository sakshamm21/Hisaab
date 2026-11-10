import { Banknote, CreditCard, Landmark, LineChart, Smartphone, HandCoins, type LucideIcon } from 'lucide-react';

import { Amount, PageHeader, Skeleton, Surface } from '../components/ui';
import type { Account } from '../lib/api';
import { useAccounts } from '../lib/queries';

const KIND: Record<Account['kind'], { label: string; icon: LucideIcon }> = {
  bank: { label: 'Bank account', icon: Landmark },
  cash: { label: 'Cash', icon: Banknote },
  credit_card: { label: 'Credit card', icon: CreditCard },
  wallet: { label: 'Wallet', icon: Smartphone },
  investment: { label: 'Investments', icon: LineChart },
  loan: { label: 'Loan', icon: HandCoins },
};

export function Accounts() {
  const { data: accounts, isLoading } = useAccounts();
  const netWorth = (accounts ?? []).filter((a) => a.include_in_net_worth).reduce((s, a) => s + a.balance, 0);

  return (
    <>
      <PageHeader
        eyebrow="Balances and net worth"
        title="Your"
        accent="accounts"
        description="Adding and editing accounts arrives in Phase 1."
      />

      <Surface className="mb-6 bg-foreground p-7 text-background">
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase opacity-60">Net worth</p>
        {isLoading ? (
          <Skeleton className="mt-3 h-12 w-56 opacity-20" />
        ) : (
          <Amount value={netWorth} className="mt-2 block font-display text-5xl font-extrabold tracking-tight" />
        )}
        <p className="mt-2 text-sm opacity-60">Everything you have, minus what you owe on cards and loans.</p>
      </Surface>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-40 rounded-3xl" />)}
        {accounts?.map((a) => {
          const kind = KIND[a.kind];
          return (
            <Surface key={a.id} className="p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                  <kind.icon className="size-5" strokeWidth={1.8} />
                </span>
                <div>
                  <p className="font-medium">{a.name}</p>
                  <p className="text-xs text-subtle">{kind.label}</p>
                </div>
              </div>
              <Amount
                value={a.balance}
                className={`mt-6 block font-display text-3xl font-bold tracking-tight ${a.balance < 0 ? 'text-expense' : ''}`}
              />
              <p className="num mt-1 text-xs text-subtle">{a.transaction_count} transactions</p>
            </Surface>
          );
        })}
      </div>
    </>
  );
}
