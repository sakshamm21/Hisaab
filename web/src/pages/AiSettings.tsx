import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Cloud, Download, HardDrive, KeyRound, Plug, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button, Field, Input, Tabs } from '../components/forms';
import { SectionTitle, Surface } from '../components/ui';
import { streamPost, useAiStatus, type AiStatus } from '../lib/ai';
import { api } from '../lib/api';
import { cn } from '../lib/cn';

type LiveModel = { id: string; name: string; free: boolean; price_in: number; price_out: number; context: number };
type Provider = AiStatus['provider'];

export function AiSettings() {
  const { data: status } = useAiStatus();
  const qc = useQueryClient();
  const [provider, setProvider] = useState<Provider>('openrouter');
  const [model, setModel] = useState('');
  const [key, setKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (status) {
      setProvider(status.provider);
      setModel(status.model);
      setBaseUrl(status.provider === 'openrouter' ? '' : status.base_url);
    }
  }, [status]);

  async function save(next: Partial<{ provider: Provider; model: string; key: string | null; base_url: string }> = {}) {
    const body = { provider, model, base_url: baseUrl, key: key ? key : null, ...next };
    try {
      await api('/ai/settings', { method: 'PUT', json: body });
      setKey('');
      await qc.invalidateQueries({ queryKey: ['ai'] });
      toast.success('AI settings saved');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function test() {
    setTesting(true);
    try {
      const r = await api<{ reply: string; model: string }>('/ai/test', { method: 'POST' });
      toast.success(`Connected to ${r.model}. It said: “${r.reply}”`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-5">
      <Surface className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle title="The" accent="assistant" />
          {status && (
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs', status.ready ? 'bg-income-soft text-income' : 'bg-surface-muted text-muted')}>
              {status.ready ? <><CheckCircle2 className="size-3.5" /> Ready · {status.model}</> : 'Not set up'}
            </span>
          )}
        </div>
        <p className="mb-5 max-w-2xl text-sm text-muted">
          Optional. Ask questions about your money from anywhere with <kbd className="rounded border border-border px-1 font-mono text-[11px]">Ctrl/⌘ J</kbd>.
          The assistant only sees small summaries from your data, never your statements or database. People you pay are sent as “Person A”.
        </p>
        <Tabs
          value={provider}
          onChange={(p) => {
            setProvider(p);
            setModel(p === status?.provider ? status.model : p === 'openrouter' ? 'google/gemma-4-31b-it:free' : '');
            setBaseUrl(p === 'ollama' ? 'http://127.0.0.1:11434' : '');
          }}
          options={[
            { value: 'openrouter', label: <><Cloud className="size-3.5" /> OpenRouter</> },
            { value: 'ollama', label: <><HardDrive className="size-3.5" /> Offline</> },
            { value: 'custom', label: <><Plug className="size-3.5" /> Custom</> },
          ]}
        />

        {provider === 'openrouter' && (
          <div className="mt-5 space-y-5">
            <Field
              label="Your OpenRouter API key"
              hint={
                <>
                  Free at <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-primary underline">openrouter.ai/keys</a>.
                  Stored in a private file on this computer, never in your database or backups.
                  {status?.key_from_env && ' Currently read from the OPENROUTER_API_KEY environment variable.'}
                </>
              }
            >
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
                  <Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={status?.provider === 'openrouter' && status.key ? `Saved: ${status.key}` : 'sk-or-v1-…'} className="pl-9" />
                </div>
                <Button variant="primary" onClick={() => save()} disabled={!key && provider === status?.provider && model === status?.model}>Save</Button>
                {status?.provider === 'openrouter' && status.key && !status.key_from_env && (
                  <Button variant="ghost" aria-label="Remove key" onClick={() => save({ key: '' })}><Trash2 className="size-4" /></Button>
                )}
              </div>
            </Field>
            <ModelPicker value={model} onChange={(m) => { setModel(m); save({ model: m }); }} recommended={status?.recommended ?? []} />
          </div>
        )}

        {provider === 'ollama' && <Offline current={status?.provider === 'ollama' ? status.model : ''} onUse={(m) => { setModel(m); save({ provider: 'ollama', model: m, base_url: baseUrl || 'http://127.0.0.1:11434' }); }} />}

        {provider === 'custom' && (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Base URL" hint="Any OpenAI-compatible API, e.g. http://localhost:1234/v1 for LM Studio.">
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…/v1" />
            </Field>
            <Field label="Model name"><Input value={model} onChange={(e) => setModel(e.target.value)} /></Field>
            <Field label="API key (if needed)"><Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={status?.provider === 'custom' && status.key ? `Saved: ${status.key}` : ''} /></Field>
            <div className="flex items-end"><Button variant="primary" disabled={!baseUrl || !model} onClick={() => save()}>Save</Button></div>
          </div>
        )}

        {status?.ready && (
          <Button className="mt-6" onClick={test} disabled={testing}>{testing ? 'Testing…' : 'Test the connection'}</Button>
        )}
      </Surface>
      <SentLog />
    </div>
  );
}

function ModelPicker({ value, onChange, recommended }: { value: string; onChange: (m: string) => void; recommended: AiStatus['recommended'] }) {
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const { data } = useQuery({ queryKey: ['ai', 'models'], queryFn: () => api<{ models: LiveModel[]; error?: string }>('/ai/models'), enabled: showAll, staleTime: 3_600_000 });
  const filtered = (data?.models ?? []).filter((m) => `${m.id} ${m.name}`.toLowerCase().includes(q.toLowerCase())).slice(0, 60);
  const tier = { free: 'Free', cheap: 'Cheap', best: 'Best' } as const;
  return (
    <div>
      <p className="mb-2 text-[13px] font-medium text-muted">Model</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {recommended.map((m) => (
          <button key={m.id} onClick={() => onChange(m.id)} className={cn('rounded-2xl border p-3 text-left transition', value === m.id ? 'border-primary bg-primary-soft' : 'border-border hover:border-border-strong')}>
            <p className="flex items-center gap-2 text-sm font-medium">
              {m.label}
              <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] uppercase', m.tier === 'free' ? 'bg-income-soft text-income' : 'bg-surface-muted text-muted')}>{tier[m.tier]}</span>
            </p>
            <p className="mt-1 text-xs text-subtle">{m.why}</p>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-subtle">
        Free models allow about 50 requests a day (a question takes 2–4) until you've bought $10 of OpenRouter credit once. If the chosen model is busy, Hisaab falls back to another free one.
      </p>
      <button className="mt-3 text-sm text-primary hover:underline" onClick={() => setShowAll((s) => !s)}>{showAll ? 'Hide other models' : 'Choose any other model…'}</button>
      {showAll && (
        <div className="mt-3 rounded-2xl border border-border">
          <div className="relative border-b border-border">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search models that can use tools…" className="h-10 w-full bg-transparent pl-9 text-sm outline-none" />
          </div>
          <ul className="max-h-72 overflow-y-auto p-1">
            {!data && <li className="p-3 text-sm text-subtle">Loading OpenRouter's list…</li>}
            {data?.error && <li className="p-3 text-sm text-warning">{data.error}</li>}
            {filtered.map((m) => (
              <li key={m.id}>
                <button onClick={() => onChange(m.id)} className={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-surface-muted', value === m.id && 'bg-primary-soft')}>
                  <span className="min-w-0 flex-1 truncate">{m.id}</span>
                  <span className="shrink-0 text-xs text-subtle">{m.free ? 'free' : `$${m.price_in}/$${m.price_out} per M`}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type OfflineStatus = { running: boolean; version?: string; models?: { name: string; size_gb: number }[]; install: Record<string, string>; recommended: AiStatus['offline'] };

function Offline({ current, onUse }: { current: string; onUse: (m: string) => void }) {
  const { data, refetch } = useQuery({ queryKey: ['ai', 'offline'], queryFn: () => api<OfflineStatus>('/ai/offline') });
  const [progress, setProgress] = useState<Record<string, { percent: number | null; status: string }>>({});
  const installed = new Set(data?.models?.map((m) => m.name) ?? []);

  async function download(model: string) {
    setProgress((p) => ({ ...p, [model]: { percent: 0, status: 'starting' } }));
    try {
      await streamPost<{ status: string; percent: number | null; message?: string }>('/ai/offline/pull', { model }, (e) => {
        if (e.status === 'error') throw new Error(e.message);
        setProgress((p) => ({ ...p, [model]: { percent: e.percent ?? p[model]?.percent ?? null, status: e.status } }));
      });
      toast.success(`${model} downloaded`);
      await refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setProgress((p) => {
        const n = { ...p };
        delete n[model];
        return n;
      });
    }
  }

  return (
    <div className="mt-5 space-y-4">
      <p className="text-sm text-muted">Runs on your computer through <a className="text-primary underline" href="https://ollama.com" target="_blank" rel="noreferrer">Ollama</a>, so nothing leaves it. Best with a graphics card; on a laptop without one, answers can take a minute. Nothing is downloaded until you click Download.</p>
      {!data ? null : !data.running ? (
        <div className="rounded-2xl border border-warning/40 bg-warning-soft p-4 text-sm">
          <p className="font-medium">Ollama isn't running</p>
          <p className="mt-1 text-muted">Install it, start it, then come back:</p>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {Object.entries(data.install).map(([os, cmd]) => <li key={os}><span className="text-subtle">{os}:</span> {cmd}</li>)}
          </ul>
          <Button size="sm" className="mt-3" onClick={() => refetch()}>Check again</Button>
        </div>
      ) : (
        <>
          <p className="text-xs text-income">Ollama {data.version} is running.</p>
          <ul className="space-y-2">
            {data.recommended.map((m) => {
              const p = progress[m.id];
              const have = installed.has(m.id) || installed.has(`${m.id}:latest`);
              return (
                <li key={m.id} className={cn('flex flex-wrap items-center gap-3 rounded-2xl border p-3', current === m.id ? 'border-primary bg-primary-soft' : 'border-border')}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{m.label} <span className="text-xs text-subtle">· {m.size_gb} GB</span></p>
                    <p className="text-xs text-subtle">For: {m.needs}</p>
                    {p && (
                      <div className="mt-2 h-1.5 rounded-full bg-surface-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${p.percent ?? 5}%` }} /></div>
                    )}
                  </div>
                  {have ? (
                    <Button size="sm" variant={current === m.id ? 'secondary' : 'primary'} disabled={current === m.id} onClick={() => onUse(m.id)}>{current === m.id ? 'In use' : 'Use'}</Button>
                  ) : (
                    <Button size="sm" disabled={!!p} onClick={() => download(m.id)}><Download className="size-3.5" /> {p ? `${p.percent ?? 0}%` : 'Download'}</Button>
                  )}
                </li>
              );
            })}
          </ul>
          {data.models && data.models.length > 0 && (
            <p className="text-xs text-subtle">Already installed: {data.models.map((m) => (
              <button key={m.name} className="mr-2 underline" onClick={() => onUse(m.name)}>{m.name}</button>
            ))}</p>
          )}
        </>
      )}
    </div>
  );
}

function SentLog() {
  const [open, setOpen] = useState(false);
  const { data, refetch } = useQuery({ queryKey: ['ai', 'log'], queryFn: () => api<{ id: number; created_at: string; provider: string; model: string; purpose: string; payload: string }[]>('/ai/log'), enabled: open });
  return (
    <Surface className="p-6">
      <div className="flex items-center justify-between">
        <SectionTitle title="What was" accent="sent" />
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Show'}</Button>
          {open && <Button size="sm" variant="ghost" onClick={async () => { await api('/ai/log', { method: 'DELETE' }); refetch(); }}><Trash2 className="size-3.5" /> Clear</Button>}
        </div>
      </div>
      <p className="text-sm text-muted">Every request to an AI provider, exactly as sent (the last 200).</p>
      {open && (
        <ul className="mt-4 max-h-96 space-y-2 overflow-y-auto">
          {!data?.length && <li className="text-sm text-subtle">Nothing sent yet.</li>}
          {data?.map((r) => (
            <li key={r.id}>
              <details className="rounded-xl border border-border p-3 text-xs">
                <summary className="cursor-pointer">{new Date(r.created_at + 'Z').toLocaleString('en-IN')} · {r.purpose} · {r.provider} · {r.model}</summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] text-muted">{r.payload}</pre>
              </details>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}
