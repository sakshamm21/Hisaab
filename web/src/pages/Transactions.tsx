import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { TransactionRow } from '../components/TransactionRow';
import { Amount, PageHeader, Skeleton, Surface } from '../components/ui';
import type { Transaction } from '../lib/api';
import { cn } from '../lib/cn';
import { useTransactions } from '../lib/queries';

const PAGE = 60;

export function Transactions() {
  const [params, setParams] = useSearchParams();
  const inbox = params.get('view') === 'inbox';
  const [limit, setLimit] = useState(PAGE);
  const { data, isLoading, isFetching } = useTransactions({ limit, inbox });
  const all = useTransactions({ limit: 1 });
  const inboxCount = useTransactions({ limit: 1, inbox: true });

  const days = useMemo(() => groupByDay(data?.items ?? []), [data]);

  const tabs = [
    { key: 'all', label: 'All', count: all.data?.total },
    { key: 'inbox', label: 'To review', count: inboxCount.data?.total },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Every transaction"
        title="Money in"
        accent="& out"
        description="Search, filters, quick add and statement import arrive in Phase 1."
      />

      <div className="mb-5 flex gap-1 rounded-full border border-border bg-surface p-1 w-fit">
        {tabs.map((tab) => {
          const active = (tab.key === 'inbox') === inbox;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setLimit(PAGE);
                setParams(tab.key === 'inbox' ? { view: 'inbox' } : {});
              }}
              className={cn(
                'flex h-9 items-center gap-2 rounded-full px-4 text-sm transition',
                active ? 'bg-foreground text-background' : 'text-muted hover:text-foreground',
              )}
            >
              {tab.label}
              {tab.count !== undefined && <span className="num text-xs opacity-70">{tab.count}</span>}
            </button>
          );
        })}
      </div>

      <Surface className="p-3 sm:p-4">
        {isLoading && Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="m-2 h-12" />)}
        {!isLoading && !days.length && (
          <p className="py-16 text-center text-sm text-muted">
            {inbox ? 'All caught up. Nothing to review.' : 'No transactions yet.'}
          </p>
        )}
        {days.map(([day, items]) => (
          <section key={day} className="mb-2">
            <div className="flex items-baseline justify-between px-2 pt-3 pb-1">
              <h3 className="eyebrow">{formatDay(day)}</h3>
              <Amount
                value={items.filter((t) => !t.is_transfer).reduce((s, t) => s + t.amount, 0)}
                signed
                className="text-xs text-subtle"
              />
            </div>
            <ul>
              {items.map((t) => (
                <TransactionRow key={t.id} t={t} />
              ))}
            </ul>
          </section>
        ))}
        {data && data.items.length < data.total && (
          <button
            onClick={() => setLimit((l) => l + PAGE)}
            disabled={isFetching}
            className="mx-auto mt-2 mb-1 block h-10 rounded-full border border-border px-5 text-sm text-muted transition hover:border-border-strong hover:text-foreground disabled:opacity-50"
          >
            {isFetching ? 'Loading…' : `Show more (${data.total - data.items.length} left)`}
          </button>
        )}
      </Surface>
    </>
  );
}

function groupByDay(items: Transaction[]): [string, Transaction[]][] {
  const map = new Map<string, Transaction[]>();
  for (const t of items) map.set(t.date, [...(map.get(t.date) ?? []), t]);
  return [...map.entries()];
}

function formatDay(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
