import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Download, Plus, RotateCcw, Trash2, Wand2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { CategoryIcon } from '../components/CategoryIcon';
import { CategoryPicker } from '../components/CategoryPicker';
import { Button, Dialog, Field, Input, Select, Tabs } from '../components/forms';
import { PageHeader, SectionTitle, Surface } from '../components/ui';
import { api, type Backup, type Category } from '../lib/api';
import { useCategories, useMoneyMutation, useRules, useSettings } from '../lib/queries';
import { AiSettings } from './AiSettings';

type Tab = 'general' | 'categories' | 'rules' | 'ai' | 'data';

export function Settings() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) ?? 'general';
  return (
    <>
      <PageHeader eyebrow="Categories, data and AI" title="Your" accent="settings" />
      <Tabs
        className="mb-6 flex-wrap"
        value={tab}
        onChange={(t) => setParams({ tab: t })}
        options={[
          { value: 'general', label: 'General' },
          { value: 'categories', label: 'Categories' },
          { value: 'rules', label: 'Rules' },
          { value: 'ai', label: 'AI' },
          { value: 'data', label: 'Backups & export' },
        ]}
      />
      {tab === 'general' && <General />}
      {tab === 'categories' && <Categories />}
      {tab === 'rules' && <Rules />}
      {tab === 'ai' && <AiSettings />}
      {tab === 'data' && <Data />}
    </>
  );
}

function General() {
  const { data: settings } = useSettings();
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);
  const save = useMoneyMutation(() => api('/settings', { method: 'PUT', json: { values: {
    currency: form.currency, locale: form.locale, month_start_day: Number(form.month_start_day),
    needs_target: Number(form.needs_target ?? 50), wants_target: Number(form.wants_target ?? 30), savings_target: Number(form.savings_target ?? 20),
  } } }), { success: 'Settings saved', onSuccess: () => qc.invalidateQueries({ queryKey: ['meta'] }) });

  return (
    <Surface className="max-w-2xl space-y-5 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Currency" hint="Used for every amount.">
          <Select value={form.currency ?? 'INR'} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            {['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY'].map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Number format" hint="en-IN groups as 1,23,456.">
          <Select value={form.locale ?? 'en-IN'} onChange={(e) => setForm({ ...form, locale: e.target.value })}>
            {['en-IN', 'en-US', 'en-GB', 'de-DE', 'fr-FR', 'ja-JP'].map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="My month starts on day" hint="Set it to your salary day (e.g. 25) and every month, budget and report runs from the 25th to the 24th.">
        <Input type="number" min={1} max={28} value={form.month_start_day ?? '1'} onChange={(e) => setForm({ ...form, month_start_day: e.target.value })} className="w-28" />
      </Field>
      <Field label="Needs / Wants / Savings target (%)" hint="The 50/30/20 rule by default. Used on the Budget page.">
        <div className="flex gap-2">
          {(['needs_target', 'wants_target', 'savings_target'] as const).map((k, i) => (
            <Input key={k} type="number" min={0} max={100} className="w-24" value={form[k] ?? [50, 30, 20][i]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          ))}
        </div>
      </Field>
      <Button variant="primary" onClick={() => save.mutate(undefined)}>Save</Button>
    </Surface>
  );
}

const COLORS = ['#7c6cf2', '#3fa06b', '#4f8fd8', '#ef7a3c', '#e0565b', '#5f7a8c', '#d1a23a', '#d45d9c', '#8a5cd6', '#c2476f', '#2fa5a5', '#e05a6d', '#4c7bd9', '#e48a5c', '#6b6f80', '#5a8f7b', '#2f9e72', '#9a7b5f', '#8b8693'];
const ICONS = ['house', 'shopping-basket', 'receipt', 'bike', 'utensils', 'fuel', 'car', 'shopping-bag', 'repeat', 'clapperboard', 'plane', 'heart-pulse', 'graduation-cap', 'gift', 'landmark', 'shield', 'trending-up', 'badge-percent', 'shapes', 'briefcase', 'laptop', 'piggy-bank', 'undo-2', 'plus'];

function Categories() {
  const { data: groups } = useCategories();
  const [editing, setEditing] = useState<Partial<Category> | null>(null);
  const [newGroup, setNewGroup] = useState('');
  const addGroup = useMoneyMutation(() => api('/category-groups', { method: 'POST', json: { name: newGroup } }), { success: 'Group added', onSuccess: () => setNewGroup('') });
  return (
    <div className="space-y-5">
      {groups?.map((g) => (
        <Surface key={g.id} className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="eyebrow">{g.name} · {g.kind}</p>
            <Button size="sm" variant="ghost" onClick={() => setEditing({ group_id: g.id, icon: 'shapes', color: COLORS[g.categories.length % COLORS.length], bucket: g.kind === 'expense' ? 'want' : null })}>
              <Plus className="size-3.5" /> Add
            </Button>
          </div>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {g.categories.map((c) => (
              <button key={c.id} onClick={() => setEditing(c)} className="flex items-center gap-3 rounded-xl p-2 text-left transition hover:bg-surface-muted">
                <CategoryIcon icon={c.icon} color={c.color} />
                <span className="flex-1 truncate text-sm">{c.name}</span>
                {c.bucket && <span className="eyebrow text-[9px]">{c.bucket}</span>}
              </button>
            ))}
          </div>
        </Surface>
      ))}
      <Surface className="flex max-w-lg gap-2 p-4">
        <Input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="New group, e.g. Pets" />
        <Button disabled={!newGroup.trim()} onClick={() => addGroup.mutate(undefined)}>Add group</Button>
      </Surface>
      <CategoryDialog value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function CategoryDialog({ value, onClose }: { value: Partial<Category> | null; onClose: () => void }) {
  const [c, setC] = useState<Partial<Category>>({});
  const [mergeInto, setMergeInto] = useState<number | null>(null);
  useEffect(() => { if (value) { setC(value); setMergeInto(null); } }, [value]);
  const save = useMoneyMutation(() => c.id
    ? api(`/categories/${c.id}`, { method: 'PATCH', json: { name: c.name, icon: c.icon, color: c.color, bucket: c.bucket ?? 'none', rollover: !!c.rollover } })
    : api('/categories', { method: 'POST', json: { group_id: c.group_id, name: c.name, icon: c.icon, color: c.color, bucket: c.bucket } }),
  { success: 'Saved', onSuccess: onClose });
  const archive = useMoneyMutation(() => api(`/categories/${c.id}`, { method: 'PATCH', json: { archived: true } }), { success: 'Category archived', onSuccess: onClose });
  const merge = useMoneyMutation(() => api<{ moved: number }>(`/categories/${c.id}/merge-into/${mergeInto}`, { method: 'POST' }), { success: (r) => `Moved ${r.moved} transactions`, onSuccess: onClose });
  return (
    <Dialog open={!!value} onClose={onClose} title={c.id ? 'Edit category' : 'New category'} footer={<>
      {c.id && <Button variant="ghost" className="mr-auto" onClick={() => archive.mutate(undefined)}><Archive className="size-4" /> Archive</Button>}
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" disabled={!c.name?.trim()} onClick={() => save.mutate(undefined)}>Save</Button>
    </>}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <CategoryIcon icon={c.icon ?? 'shapes'} color={c.color ?? '#8b8693'} className="size-11" />
          <Input autoFocus value={c.name ?? ''} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="Name" />
        </div>
        <Field label="Colour">
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((col) => <button key={col} aria-label={col} onClick={() => setC({ ...c, color: col })} className="size-7 rounded-full ring-offset-2 ring-offset-surface-raised" style={{ background: col, boxShadow: c.color === col ? `0 0 0 2px ${col}` : undefined }} />)}
          </div>
        </Field>
        <Field label="Icon">
          <div className="flex flex-wrap gap-1">
            {ICONS.map((i) => <button key={i} onClick={() => setC({ ...c, icon: i })} className={`rounded-xl p-0.5 ${c.icon === i ? 'ring-2 ring-primary' : ''}`}><CategoryIcon icon={i} color={c.color ?? '#8b8693'} className="size-8" /></button>)}
          </div>
        </Field>
        <Field label="Kind of spending" hint="Used for the Needs / Wants / Savings split.">
          <Tabs value={c.bucket ?? 'none'} onChange={(b) => setC({ ...c, bucket: b === 'none' ? null : b })} options={[{ value: 'need', label: 'Need' }, { value: 'want', label: 'Want' }, { value: 'saving', label: 'Saving' }, { value: 'none', label: 'None' }]} />
        </Field>
        {c.id && (
          <Field label="Merge into another category" hint="Moves every transaction here, then archives this one.">
            <div className="flex gap-2">
              <CategoryPicker value={mergeInto} onChange={setMergeInto} className="flex-1" />
              <Button disabled={!mergeInto} onClick={() => merge.mutate(undefined)}>Merge</Button>
            </div>
          </Field>
        )}
      </div>
    </Dialog>
  );
}

function Rules() {
  const { data: rules } = useRules();
  const [form, setForm] = useState({ field: 'payee', match: 'contains', pattern: '', set_category_id: null as number | null, set_payee: '' });
  const create = useMoneyMutation(() => api('/rules', { method: 'POST', json: form }), { success: 'Rule added', onSuccess: () => setForm({ ...form, pattern: '', set_payee: '' }) });
  const remove = useMoneyMutation((id: number) => api(`/rules/${id}`, { method: 'DELETE' }), { success: 'Rule removed' });
  const apply = useMoneyMutation(() => api<{ updated: number }>('/rules/apply', { method: 'POST' }), { success: (r) => `Categorized ${r.updated} transactions` });
  return (
    <div className="space-y-5">
      <Surface className="p-5">
        <SectionTitle title="Add a" accent="rule" right={<Button size="sm" onClick={() => apply.mutate(undefined)}><Wand2 className="size-3.5" /> Apply to uncategorized</Button>} />
        <p className="mb-4 text-sm text-muted">Rules run before anything else on every import. You rarely need them: categorizing a payee once already teaches Hisaab.</p>
        <div className="grid gap-3 sm:grid-cols-[8rem_8rem_1fr]">
          <Select value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })}><option value="payee">Payee</option><option value="description">Bank text</option></Select>
          <Select value={form.match} onChange={(e) => setForm({ ...form, match: e.target.value })}><option value="contains">contains</option><option value="equals">is exactly</option><option value="regex">matches regex</option></Select>
          <Input value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} placeholder="e.g. paytm.s1abcde" />
          <span className="self-center text-sm text-muted sm:text-right">then set</span>
          <CategoryPicker value={form.set_category_id} onChange={(id) => setForm({ ...form, set_category_id: id })} />
          <Input value={form.set_payee} onChange={(e) => setForm({ ...form, set_payee: e.target.value })} placeholder="and rename to (optional)" />
        </div>
        <Button className="mt-4" variant="primary" disabled={!form.pattern || (!form.set_category_id && !form.set_payee)} onClick={() => create.mutate(undefined)}>Add rule</Button>
      </Surface>
      <Surface className="divide-y divide-border">
        {!rules?.length && <p className="p-6 text-center text-sm text-muted">No rules yet.</p>}
        {rules?.map((r) => (
          <div key={r.id} className="flex items-center gap-3 p-4 text-sm">
            <p className="flex-1">
              If <b>{r.field === 'payee' ? 'payee' : 'bank text'}</b> {r.match === 'equals' ? 'is' : r.match === 'regex' ? 'matches' : 'contains'} <code className="rounded bg-surface-muted px-1.5">{r.pattern}</code>
              {r.category && <> → <b>{r.category}</b></>}
              {r.set_payee && <> · rename to <b>{r.set_payee}</b></>}
            </p>
            <Button size="sm" variant="ghost" aria-label="Delete rule" onClick={() => remove.mutate(r.id)}><Trash2 className="size-3.5" /></Button>
          </div>
        ))}
      </Surface>
    </div>
  );
}

function Data() {
  const { data: backups, refetch } = useQuery({ queryKey: ['backups'], queryFn: () => api<Backup[]>('/backups') });
  const file = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const make = useMoneyMutation(() => api('/backups', { method: 'POST' }), { success: 'Backup saved', onSuccess: () => refetch() });
  async function restore(f: File) {
    if (!confirm('Replace all your data with this backup? Your current data is backed up first.')) return;
    try {
      const r = await api<{ previous_data_saved_as: string }>('/backups/restore', { method: 'POST', body: f });
      toast.success(`Restored. Your previous data was saved as ${r.previous_data_saved_as}`);
      await qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Surface className="p-5">
        <SectionTitle title="Your" accent="backups" right={<Button size="sm" variant="primary" onClick={() => make.mutate(undefined)}>Back up now</Button>} />
        <p className="mb-4 text-sm text-muted">Hisaab saves a copy every day you open it and keeps the last 14. Copy one to a pen drive or cloud folder now and then.</p>
        <ul className="max-h-80 divide-y divide-border overflow-y-auto text-sm">
          {backups?.map((b) => (
            <li key={b.name} className="flex items-center justify-between gap-3 py-2">
              <span className="truncate">{new Date(b.created).toLocaleString('en-IN')} <span className="text-subtle">· {b.kind} · {(b.size / 1024).toFixed(0)} KB</span></span>
              <a href={`/api/backups/${encodeURIComponent(b.name)}`} download className="text-muted hover:text-foreground" aria-label="Download backup"><Download className="size-4" /></a>
            </li>
          ))}
        </ul>
        <Button className="mt-4" onClick={() => file.current?.click()}><RotateCcw className="size-4" /> Restore from a backup file…</Button>
        <input ref={file} type="file" accept=".db" className="hidden" onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
      </Surface>
      <Surface className="p-5">
        <SectionTitle title="Export" accent="your data" />
        <p className="mb-4 text-sm text-muted">Your data is yours. Take it to a spreadsheet or anywhere else.</p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/export/transactions.csv" download><Button><Download className="size-4" /> Transactions (CSV)</Button></a>
          <a href="/api/export/all.json" download><Button><Download className="size-4" /> Everything (JSON)</Button></a>
        </div>
      </Surface>
    </div>
  );
}
