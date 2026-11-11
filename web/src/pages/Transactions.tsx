import { CheckCheck, Filter, Plus, Search, Sparkles, Tag, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { CategoryList, CategoryPicker, useCategoryMap } from '../components/CategoryPicker';
import { Button, Dialog, Input, Select, Tabs } from '../components/forms';
import { TransactionRow } from '../components/TransactionRow';
import { Amount, Kbd, PageHeader, Skeleton, Surface } from '../components/ui';
import { useAiStatus } from '../lib/ai';
import { api, type Transaction } from '../lib/api';
import { cn } from '../lib/cn';
import { updateTransaction, useAccounts, useMoneyMutation, useTransactions, type TxFilters } from '../lib/queries';
import { isTyping, useUiActions } from '../lib/ui-actions';

const PAGE = 80;

export function Transactions() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'inbox' ? 'inbox' : 'all';
  const { openQuickAdd } = useUiActions();

  const filters: TxFilters = {
    q: params.get('q') ?? undefined,
    account_id: params.get('account') ? Number(params.get('account')) : undefined,
    category_id: params.getAll('category').map(Number),
    uncategorized: params.get('uncategorized') === '1',
    date_from: params.get('from') ?? undefined,
    date_to: params.get('to') ?? undefined,
    direction: (params.get('direction') as 'in' | 'out' | null) ?? undefined,
    tag: params.get('tag') ?? undefined,
    import_id: params.get('import') ? Number(params.get('import')) : undefined,
  };
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const inboxCount = useTransactions({ inbox: true, limit: 1 }).data?.total;

  return (
    <>
      <PageHeader
        eyebrow="Every transaction"
        title="Money in"
        accent="& out"
        actions={
          <>
            <Button onClick={openQuickAdd} variant="primary">
              <Plus className="size-4" /> Add
            </Button>
            <Link to="/import">
              <Button>
                <Upload className="size-4" /> Import
              </Button>
            </Link>
          </>
        }
      />
      <Tabs
        className="mb-5"
        value={view}
        onChange={(v) => setParams(v === 'inbox' ? { view: 'inbox' } : {})}
        options={[
          { value: 'all', label: 'All' },
          {
            value: 'inbox',
            label: (
              <>
                To review {!!inboxCount && <span className="num rounded-full bg-highlight px-1.5 text-[11px] font-semibold text-[#1a1408]">{inboxCount}</span>}
              </>
            ),
          },
        ]}
      />
      {view === 'inbox' ? <Inbox /> : <AllTransactions filters={filters} setParam={setParam} params={params} setParams={setParams} />}
    </>
  );
}

function AllTransactions({
  filters,
  setParam,
  params,
  setParams,
}: {
  filters: TxFilters;
  setParam: (k: string, v: string | null) => void;
  params: URLSearchParams;
  setParams: (p: URLSearchParams) => void;
}) {
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState(filters.q ?? '');
  const { data, isLoading, isFetching } = useTransactions({ ...filters, limit });
  const { data: accounts } = useAccounts();
  const categories = useCategoryMap();

  useEffect(() => {
    const h = setTimeout(() => search !== (filters.q ?? '') && setParam('q', search || null), 250);
    return () => clearTimeout(h);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setSelected(new Set());
  }, [params]);

  const days = useMemo(() => groupByDay(data?.items ?? []), [data]);
  const active = [...params.keys()].filter((k) => k !== 'q').length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search payee, notes, description…" className="pl-9" />
        </div>
        <Button onClick={() => setShowFilters((s) => !s)} className={cn(active && 'border-primary text-primary')}>
          <Filter className="size-4" /> Filters {active > 0 && <span className="num">{active}</span>}
        </Button>
        {active > 0 && (
          <Button variant="ghost" onClick={() => setParams(new URLSearchParams(filters.q ? { q: filters.q } : {}))}>
            <X className="size-4" /> Clear
          </Button>
        )}
      </div>

      {showFilters && (
        <Surface className="mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={filters.account_id ?? ''} onChange={(e) => setParam('account', e.target.value || null)}>
            <option value="">All accounts</option>
            {accounts?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <CategoryPicker
            value={filters.category_id?.[0] ?? null}
            onChange={(id) => setParam('category', String(id))}
            placeholder="Any category"
          />
          <Select value={filters.direction ?? (filters.uncategorized ? 'uncat' : '')} onChange={(e) => {
            const v = e.target.value;
            const next = new URLSearchParams(params);
            next.delete('direction');
            next.delete('uncategorized');
            if (v === 'in' || v === 'out') next.set('direction', v);
            if (v === 'uncat') next.set('uncategorized', '1');
            setParams(next);
          }}>
            <option value="">Money in and out</option>
            <option value="out">Money out</option>
            <option value="in">Money in</option>
            <option value="uncat">Needs a category</option>
          </Select>
          <div className="flex gap-2">
            <Input type="date" value={filters.date_from ?? ''} onChange={(e) => setParam('from', e.target.value || null)} aria-label="From" />
            <Input type="date" value={filters.date_to ?? ''} onChange={(e) => setParam('to', e.target.value || null)} aria-label="To" />
          </div>
          {(filters.category_id?.length || filters.tag || filters.import_id) ? (
            <p className="text-xs text-muted sm:col-span-2 lg:col-span-4">
              {filters.category_id?.map((c) => categories.get(c)?.name).join(', ')}
              {filters.tag && ` #${filters.tag}`}
              {filters.import_id && ` · from import #${filters.import_id}`}
            </p>
          ) : null}
        </Surface>
      )}

      {data && (
        <p className="mb-3 flex items-center justify-between px-1 text-xs text-subtle">
          <span className="num">{data.total} transactions</span>
          {data.net !== undefined && active + (filters.q ? 1 : 0) > 0 && (
            <span>
              Net <Amount value={data.net} signed className="font-medium text-foreground" />
            </span>
          )}
        </p>
      )}

      {selected.size > 0 && <BulkBar ids={[...selected]} onDone={() => setSelected(new Set())} />}

      <Surface className="p-3 sm:p-4">
        {isLoading && Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="m-2 h-12" />)}
        {!isLoading && !days.length && <p className="py-16 text-center text-sm text-muted">No transactions match.</p>}
        {days.map(([day, items]) => (
          <section key={day} className="mb-2">
            <div className="flex items-baseline justify-between px-2 pt-3 pb-1">
              <h3 className="eyebrow">{formatDay(day)}</h3>
              <Amount value={items.filter((t) => !t.is_transfer).reduce((s, t) => s + t.amount, 0)} signed className="text-xs text-subtle" />
            </div>
            <ul>
              {items.map((t) => (
                <TransactionRow
                  key={t.id}
                  t={t}
                  selected={selected.has(t.id)}
                  onToggleSelect={() =>
                    setSelected((s) => {
                      const n = new Set(s);
                      if (n.has(t.id)) n.delete(t.id);
                      else n.add(t.id);
                      return n;
                    })
                  }
                />
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

function BulkBar({ ids, onDone }: { ids: number[]; onDone: () => void }) {
  const [picking, setPicking] = useState(false);
  const bulk = useMoneyMutation((body: Record<string, unknown>) => api<{ updated: number }>('/transactions/bulk', { method: 'POST', json: { ids, ...body } }), {
    success: (r) => `Updated ${r.updated}`,
    onSuccess: onDone,
  });
  return (
    <div className="sticky top-20 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/40 bg-surface-raised p-2 pl-4 shadow-[var(--shadow-lifted)] lg:top-4">
      <span className="num text-sm font-medium">{ids.length} selected</span>
      <div className="relative ml-auto flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setPicking((p) => !p)}>
          <Tag className="size-3.5" /> Categorize
        </Button>
        <Button size="sm" onClick={() => bulk.mutate({ reviewed: true })}>
          <CheckCheck className="size-3.5" /> Mark reviewed
        </Button>
        <Button size="sm" variant="danger" onClick={() => confirm(`Delete ${ids.length} transactions?`) && bulk.mutate({ delete: true })}>
          <Trash2 className="size-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          <X className="size-3.5" />
        </Button>
        {picking && (
          <div className="absolute top-10 right-0 z-30 w-72 overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-[var(--shadow-lifted)]">
            <CategoryList onPick={(id) => { setPicking(false); bulk.mutate({ category_id: id }); }} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Review inbox: new imports and anything uncategorized.
 * Keyboard: j/k move, c (or Enter) choose a category, a accept as is, e open the full editor.
 */
function Inbox() {
  const { data, isLoading } = useTransactions({ inbox: true, limit: 200 });
  const [index, setIndex] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const { openTransaction } = useUiActions();
  const items = data?.items ?? [];
  const current: Transaction | undefined = items[Math.min(index, items.length - 1)];

  const categorize = useMoneyMutation(({ id, category_id }: { id: number; category_id: number }) =>
    updateTransaction(id, { category_id, reviewed: true }),
  );
  const accept = useMoneyMutation((id: number) => updateTransaction(id, { reviewed: true }));
  const acceptAll = useMoneyMutation(
    () => api('/transactions/bulk', { method: 'POST', json: { ids: items.filter((t) => t.category_id || t.is_transfer).map((t) => t.id), reviewed: true } }),
    { success: 'Marked the categorized ones as reviewed' },
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || !current || e.metaKey || e.ctrlKey || document.querySelector('[role=dialog]')) return;
      if (e.key === 'j' || e.key === 'ArrowDown') setIndex((i) => Math.min(i + 1, items.length - 1));
      else if (e.key === 'k' || e.key === 'ArrowUp') setIndex((i) => Math.max(i - 1, 0));
      else if (e.key === 'c' || e.key === 'Enter') panel.current?.querySelector('input')?.focus();
      else if (e.key === 'a') accept.mutate(current.id);
      else if (e.key === 'e') openTransaction(current.id);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    document.querySelector('[data-active]')?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  if (isLoading) return <Skeleton className="h-64" />;
  if (!items.length) {
    return (
      <Surface className="py-20 text-center">
        <CheckCheck className="mx-auto size-8 text-income" />
        <h2 className="mt-4 text-2xl font-bold">All caught up</h2>
        <p className="mt-1 text-sm text-muted">New imports and anything without a category will show up here.</p>
      </Surface>
    );
  }

  const sameCount = current ? items.filter((t) => t.payee === current.payee).length : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <Surface className="p-3 sm:p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2 text-xs text-subtle">
          <span>
            <Kbd>J</Kbd> <Kbd>K</Kbd> move · <Kbd>C</Kbd> category · <Kbd>A</Kbd> accept · <Kbd>E</Kbd> edit
          </span>
          <span className="flex gap-1">
            <AiSuggest />
            <Button size="sm" variant="ghost" onClick={() => acceptAll.mutate(undefined)}>
              <CheckCheck className="size-3.5" /> Accept all categorized
            </Button>
          </span>
        </div>
        <ul>
          {items.map((t, i) => (
            <div key={t.id} onMouseDown={() => setIndex(i)}>
              <TransactionRow t={t} active={i === index} />
            </div>
          ))}
        </ul>
      </Surface>

      {current && (
        <div ref={panel} className="lg:sticky lg:top-14 lg:self-start">
          <Surface className="overflow-hidden">
            <div className="border-b border-border p-5">
              <p className="eyebrow">Categorize</p>
              <p className="mt-2 truncate text-lg font-semibold">{current.payee}</p>
              <Amount value={current.amount} signed tone="flow" className="font-display text-2xl font-bold" />
              {current.raw_description && <p className="mt-2 font-mono text-[10px] break-all text-subtle">{current.raw_description}</p>}
              {sameCount > 1 && <p className="mt-2 text-xs text-muted">Your choice applies to all {sameCount} from {current.payee} here, and future ones.</p>}
            </div>
            <CategoryList
              key={current.id}
              autoFocus={false}
              income={current.amount > 0}
              onPick={(category_id) => {
                (document.activeElement as HTMLElement | null)?.blur();
                const same = items.filter((t) => t.payee === current.payee).map((t) => t.id);
                if (same.length > 1) {
                  api('/transactions/bulk', { method: 'POST', json: { ids: same, category_id } }).then(() => categorize.mutate({ id: current.id, category_id }));
                } else categorize.mutate({ id: current.id, category_id });
              }}
            />
          </Surface>
        </div>
      )}
    </div>
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

type Suggestion = { payee: string; category_id: number; category: string; count: number };

/** Ask the AI to suggest categories for unknown merchants. Only merchant names are sent. */
function AiSuggest() {
  const { data: status } = useAiStatus();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<(Suggestion & { keep: boolean })[] | null>(null);
  const apply = useMoneyMutation(
    async () => {
      for (const s of items!.filter((x) => x.keep)) {
        await api('/transactions/categorize-payee', { method: 'POST', json: { payee: s.payee, category_id: s.category_id, only_uncategorized: true } });
      }
    },
    { success: 'Categorized, and remembered for next time', onSuccess: () => setItems(null) },
  );
  if (!status?.ready) return null;
  async function run() {
    setLoading(true);
    try {
      const r = await api<{ suggestions: Suggestion[] }>('/ai/categorize', { method: 'POST' });
      if (!r.suggestions.length) toast.info('No confident suggestions. The rest are probably small shops or people.');
      else setItems(r.suggestions.map((s) => ({ ...s, keep: true })));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <Button size="sm" variant="ghost" onClick={run} disabled={loading}>
        <Sparkles className="size-3.5" /> {loading ? 'Asking…' : 'Suggest with AI'}
      </Button>
      <Dialog open={!!items} onClose={() => setItems(null)} title="AI suggestions" footer={<>
        <Button onClick={() => setItems(null)}>Cancel</Button>
        <Button variant="primary" disabled={!items?.some((x) => x.keep) || apply.isPending} onClick={() => apply.mutate(undefined)}>Apply {items?.filter((x) => x.keep).length}</Button>
      </>}>
        <p className="mb-3 text-sm text-muted">Only merchant names were sent; payments to people weren't. Untick any that look wrong.</p>
        <ul className="divide-y divide-border">
          {items?.map((s, i) => (
            <li key={s.payee} className="flex items-center gap-3 py-2 text-sm">
              <input type="checkbox" checked={s.keep} onChange={(e) => setItems((xs) => xs!.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))} aria-label={`Apply to ${s.payee}`} />
              <span className="flex-1 truncate">{s.payee} <span className="text-xs text-subtle">{s.count}×</span></span>
              <span className="text-primary">{s.category}</span>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
