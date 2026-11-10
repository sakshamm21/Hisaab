import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileUp, Undo2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { CategoryPicker } from '../components/CategoryPicker';
import { Button, Field, Select } from '../components/forms';
import { Amount, PageHeader, SectionTitle, Surface } from '../components/ui';
import { api, ApiError, type ImportPreview, type ImportRecord, type PreviewRow } from '../lib/api';
import { cn } from '../lib/cn';
import { useAccounts, useMoneyMutation } from '../lib/queries';

type Mapping = { date?: number; description?: number; amount?: number; withdrawal?: number; deposit?: number; balance?: number };

export function Import() {
  const { data: accounts } = useAccounts();
  const [accountId, setAccountId] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [columns, setColumns] = useState<string[] | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ import_id: number; imported: number; skipped: number } | null>(null);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const account = accountId ?? accounts?.find((a) => a.kind === 'bank')?.id ?? accounts?.[0]?.id ?? null;

  async function load(f: File, map?: Mapping) {
    if (!account) return toast.error('Add an account first');
    setFile(f);
    setLoading(true);
    setResult(null);
    try {
      const qs = new URLSearchParams({ account_id: String(account), filename: f.name });
      if (map) qs.set('mapping', JSON.stringify(map));
      const p = await api<ImportPreview>(`/imports/preview?${qs}`, { method: 'POST', body: f });
      setPreview(p);
      setRows(p.rows);
      setColumns(null);
    } catch (e) {
      const err = e as ApiError;
      const cols = (err.detail as { columns?: string[] })?.columns;
      if (cols) {
        setColumns(cols);
        setPreview(null);
      } else toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  const commit = useMoneyMutation(
    () => api<{ import_id: number; imported: number; skipped: number }>('/imports/commit', {
      method: 'POST',
      json: { account_id: account, filename: file?.name, format: preview?.format, period: preview?.period, rows },
    }),
    {
      success: (r) => `Imported ${r.imported} transactions`,
      onSuccess: (r) => {
        setResult(r);
        setPreview(null);
      },
    },
  );

  const fresh = rows.filter((r) => !r.duplicate);
  const keeping = fresh.filter((r) => !r.skip);
  const uncategorized = keeping.filter((r) => !r.category_id && !r.transfer_account_id).length;
  const visible = showDuplicates ? rows : fresh;
  const update = (index: number, patch: Partial<PreviewRow>) => setRows((rs) => rs.map((r) => (r.index === index ? { ...r, ...patch } : r)));

  return (
    <>
      <PageHeader
        eyebrow="Statements in, categories out"
        title="Import a"
        accent="statement"
        description="ICICI savings statement PDF, or a CSV / Excel export from any bank. Nothing is saved until you press Import, duplicates are skipped, and every import can be undone."
      />

      {result && (
        <Surface className="mb-6 flex flex-wrap items-center gap-4 p-5">
          <CheckCircle2 className="size-6 text-income" />
          <p className="flex-1">
            <span className="font-semibold">Imported {result.imported}</span>
            {result.skipped > 0 && <span className="text-muted"> · skipped {result.skipped} (duplicates or left out)</span>}
          </p>
          <Link to="/transactions?view=inbox">
            <Button variant="primary">Review new transactions</Button>
          </Link>
        </Surface>
      )}

      {!preview && (
        <Surface className="mb-8 p-6">
          <div className="grid gap-4 sm:grid-cols-[16rem_1fr]">
            <Field label="Into account">
              <Select value={account ?? ''} onChange={(e) => setAccountId(Number(e.target.value))}>
                {accounts?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) load(f);
              }}
              onClick={() => input.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border-strong px-6 py-10 text-center transition hover:border-primary hover:bg-primary-soft"
            >
              <FileUp className="size-7 text-primary" />
              <p className="font-medium">{loading ? 'Reading…' : 'Drop a statement here, or click to choose'}</p>
              <p className="text-xs text-subtle">PDF (ICICI) · CSV · XLSX · read on this computer only</p>
              <input
                ref={input}
                type="file"
                accept=".pdf,.csv,.txt,.xlsx"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && load(e.target.files[0])}
              />
            </div>
          </div>

          {columns && file && (
            <div className="mt-6 rounded-2xl border border-warning/40 bg-warning-soft p-5">
              <p className="font-medium">Which columns are which?</p>
              <p className="mt-1 text-sm text-muted">We couldn't recognise this file's columns. Pick them once.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {(['date', 'description', 'amount', 'withdrawal', 'deposit', 'balance'] as const).map((key) => (
                  <Field key={key} label={{ date: 'Date', description: 'Description', amount: 'Amount (signed)', withdrawal: 'Withdrawal / debit', deposit: 'Deposit / credit', balance: 'Balance (optional)' }[key]}>
                    <Select value={mapping[key] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value === '' ? undefined : Number(e.target.value) }))}>
                      <option value="">—</option>
                      {columns.map((c, i) => (
                        <option key={i} value={i}>
                          {c || `Column ${i + 1}`}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ))}
              </div>
              <Button className="mt-4" variant="primary" onClick={() => load(file, mapping)}>
                Read the file
              </Button>
            </div>
          )}
        </Surface>
      )}

      {preview && (
        <>
          <Surface className="mb-4 p-5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span className="font-medium">{file?.name}</span>
              {preview.period && (
                <span className="text-muted">
                  {preview.period[0]} → {preview.period[1]}
                </span>
              )}
              <span className="num">{fresh.length} new</span>
              {preview.counts.duplicates > 0 && (
                <button className="num text-muted underline-offset-2 hover:underline" onClick={() => setShowDuplicates((s) => !s)}>
                  {preview.counts.duplicates} already in Hisaab {showDuplicates ? '(hide)' : '(show)'}
                </button>
              )}
              {preview.format === 'icici_pdf' || preview.rows.some((r) => r.balance != null) ? (
                preview.counts.balance_mismatches === 0 ? (
                  <span className="flex items-center gap-1.5 text-income">
                    <CheckCircle2 className="size-4" /> Every row matches the running balance
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-expense">
                    <AlertTriangle className="size-4" /> {preview.counts.balance_mismatches} rows don't match the balance
                  </span>
                )
              ) : null}
            </div>
            {preview.warnings.map((w) => (
              <p key={w} className="mt-2 text-sm text-warning">
                {w}
              </p>
            ))}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">
                {uncategorized > 0
                  ? `${uncategorized} without a category will wait in your review inbox. Set any you like now; your choices are remembered.`
                  : 'Everything has a category.'}
              </p>
              <div className="flex gap-2">
                <Button onClick={() => setPreview(null)}>Cancel</Button>
                <Button variant="primary" disabled={!keeping.length || commit.isPending} onClick={() => commit.mutate(undefined)}>
                  {commit.isPending ? 'Importing…' : `Import ${keeping.length}`}
                </Button>
              </div>
            </div>
          </Surface>

          <Surface className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="eyebrow border-b border-border text-left">
                  <th className="w-10 p-3"></th>
                  <th className="p-3 font-normal">Date</th>
                  <th className="p-3 font-normal">Payee</th>
                  <th className="w-64 p-3 font-normal">Category</th>
                  <th className="p-3 text-right font-normal">Amount</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.index} className={cn('border-b border-border/60 last:border-0', (r.skip || r.duplicate) && 'opacity-40', !r.balance_ok && 'bg-expense-soft')}>
                    <td className="p-3">
                      <input type="checkbox" disabled={r.duplicate} checked={!r.skip && !r.duplicate} onChange={(e) => update(r.index, { skip: !e.target.checked })} aria-label="Import this row" />
                    </td>
                    <td className="num p-3 whitespace-nowrap text-muted">{r.date}</td>
                    <td className="max-w-72 p-3">
                      <input
                        value={r.payee}
                        onChange={(e) => update(r.index, { payee: e.target.value })}
                        className="w-full truncate rounded-md bg-transparent px-1 font-medium outline-none focus:bg-background"
                      />
                      <p className="truncate px-1 font-mono text-[10px] text-subtle" title={r.description}>
                        {r.match_id ? 'Same as one you added by hand (kept, linked) · ' : r.duplicate ? 'Already imported · ' : ''}
                        {r.description}
                      </p>
                    </td>
                    <td className="p-3">
                      {r.transfer_account_id ? (
                        <span className="flex items-center justify-between gap-2 text-xs text-muted">
                          Transfer to {accounts?.find((a) => a.id === r.transfer_account_id)?.name}
                          <button className="underline" onClick={() => update(r.index, { transfer_account_id: null })}>
                            not a transfer
                          </button>
                        </span>
                      ) : (
                        <CategoryPicker
                          value={r.category_id}
                          income={r.amount > 0}
                          placeholder={r.is_person ? 'Person: what was it for?' : 'Leave for review'}
                          onChange={(id) => {
                            // Apply to every row with the same payee that has no category yet.
                            setRows((rs) => rs.map((x) => (x.index === r.index || (x.payee === r.payee && !x.category_id) ? { ...x, category_id: id, user_set: true, category_source: 'memory' } : x)));
                          }}
                        />
                      )}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <Amount value={r.amount} signed tone="flow" className="font-medium" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>
        </>
      )}

      <History />
    </>
  );
}

function History() {
  const { data: imports } = useQuery({ queryKey: ['imports'], queryFn: () => api<ImportRecord[]>('/imports') });
  const undo = useMoneyMutation((id: number) => api<{ removed: number }>(`/imports/${id}`, { method: 'DELETE' }), {
    success: (r) => `Removed ${r.removed} transactions`,
  });
  if (!imports?.length) return null;
  return (
    <div className="mt-10">
      <SectionTitle title="Past" accent="imports" />
      <Surface className="divide-y divide-border">
        {imports.map((i) => (
          <div key={i.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{i.file_name}</p>
              <p className="text-xs text-subtle">
                {i.account} · {i.period_start ? `${i.period_start} → ${i.period_end}` : ''} · {new Date(i.created_at + 'Z').toLocaleString('en-IN')}
              </p>
            </div>
            <Link to={`/transactions?import=${i.id}`} className="num text-muted hover:text-foreground">
              {i.imported} imported
            </Link>
            <Button size="sm" variant="ghost" onClick={() => confirm(`Undo this import? Its ${i.imported} transactions will be removed.`) && undo.mutate(i.id)}>
              <Undo2 className="size-3.5" /> Undo
            </Button>
          </div>
        ))}
      </Surface>
    </div>
  );
}
