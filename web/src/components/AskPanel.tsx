import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp, Check, Eraser, Loader2, Search, Sparkles, X } from 'lucide-react';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';

import { streamPost, useAiStatus, type AiEvent } from '../lib/ai';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { formatMoney } from '../lib/money';
import { useMoneyMutation } from '../lib/queries';
import { Kbd } from './ui';

type Proposal = Extract<AiEvent, { type: 'proposal' }>;
type Message = { role: 'user' | 'assistant'; text: string; tools: string[]; proposals: Proposal[]; error?: string; pending?: boolean };

const STARTERS = [
  'Where did my money go last month?',
  'How much have I spent on food delivery this month?',
  'Can I afford a ₹40,000 phone next month?',
  'Which subscriptions am I paying for?',
  'How does this month compare with last month?',
];

/** Minimal formatting for answers: **bold** and "- " / "1. " lists. */
function Rich({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      out.push(
        <ul key={`l${out.length}`} className="my-1 list-disc space-y-0.5 pl-5">
          {list.map((l, i) => <li key={i}>{inline(l)}</li>)}
        </ul>,
      );
      list = [];
    }
  };
  lines.forEach((l, i) => {
    const m = l.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/);
    if (m) list.push(m[1]);
    else {
      flush();
      if (l.trim()) out.push(<p key={i} className="my-1">{inline(l)}</p>);
    }
  });
  flush();
  return <>{out}</>;
}

function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}

export function AskPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: status } = useAiStatus();
  const [messages, setMessages] = useState<Message[]>([]);
  const [thread, setThread] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setInput('');
    setBusy(true);
    setMessages((m) => [...m, { role: 'user', text: question, tools: [], proposals: [] }, { role: 'assistant', text: '', tools: [], proposals: [], pending: true }]);
    const update = (fn: (m: Message) => Message) => setMessages((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);
    abort.current = new AbortController();
    try {
      await streamPost<AiEvent>('/ai/chat', { message: question, thread_id: thread }, (e) => {
        if (e.type === 'thread') setThread(e.thread_id);
        else if (e.type === 'text') update((m) => ({ ...m, text: m.text + e.delta }));
        else if (e.type === 'tool') update((m) => ({ ...m, tools: [...m.tools, e.label] }));
        else if (e.type === 'proposal') update((m) => ({ ...m, proposals: [...m.proposals, e] }));
        else if (e.type === 'done') update((m) => ({ ...m, text: e.text || m.text, pending: false }));
        else if (e.type === 'error') update((m) => ({ ...m, error: e.message, pending: false }));
      }, abort.current.signal);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') update((m) => ({ ...m, error: (err as Error).message, pending: false }));
    } finally {
      update((m) => ({ ...m, pending: false }));
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/20 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-surface-raised shadow-[var(--shadow-overlay)]"
          >
            <header className="flex items-center gap-3 border-b border-border px-5 py-4">
              <span className="grid size-8 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground"><Sparkles className="size-4" /></span>
              <div className="flex-1">
                <p className="font-display text-lg leading-none font-bold">Ask <span className="font-serif font-normal italic text-primary">hisaab</span></p>
                {status?.ready && <p className="mt-1 truncate text-[11px] text-subtle">{status.model}</p>}
              </div>
              {messages.length > 0 && (
                <button aria-label="New conversation" title="New conversation" onClick={() => { abort.current?.abort(); setMessages([]); setThread(null); }} className="rounded-full p-1.5 text-subtle hover:bg-surface-muted"><Eraser className="size-4" /></button>
              )}
              <button aria-label="Close" onClick={onClose} className="rounded-full p-1.5 text-subtle hover:bg-surface-muted"><X className="size-4" /></button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {status && !status.ready ? (
                <div className="mt-10 text-center">
                  <Sparkles className="mx-auto size-8 text-primary" />
                  <p className="mt-4 font-semibold">Set up the assistant</p>
                  <p className="mt-1 text-sm text-muted">Add your OpenRouter key (free models work) or download an offline model. Everything else in Hisaab works without it.</p>
                  <Link to="/settings?tab=ai" onClick={onClose} className="mt-5 inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">Open AI settings</Link>
                </div>
              ) : !messages.length ? (
                <div className="mt-4">
                  <p className="text-sm text-muted">Ask about your own money. Answers come from your data; people you pay are hidden as "Person A".</p>
                  <div className="mt-5 space-y-2">
                    {STARTERS.map((s) => (
                      <button key={s} onClick={() => ask(s)} className="block w-full rounded-xl border border-border px-3.5 py-2.5 text-left text-sm transition hover:border-primary hover:bg-primary-soft">{s}</button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {messages.map((m, i) =>
                    m.role === 'user' ? (
                      <div key={i} className="ml-10 rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm text-primary-foreground">{m.text}</div>
                    ) : (
                      <div key={i} className="text-[14px] leading-relaxed">
                        {m.tools.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {[...new Set(m.tools)].map((t) => (
                              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-muted"><Search className="size-3" /> {t}</span>
                            ))}
                          </div>
                        )}
                        <div data-amount><Rich text={m.text} /></div>
                        {m.pending && !m.text && <p className="flex items-center gap-2 text-sm text-subtle"><Loader2 className="size-4 animate-spin" /> Looking at your data…</p>}
                        {m.error && <p className="mt-1 rounded-xl bg-expense-soft px-3 py-2 text-sm text-expense">{m.error}</p>}
                        {m.proposals.map((p, j) => <ProposalCard key={j} p={p} />)}
                      </div>
                    ),
                  )}
                  <div ref={bottom} />
                </div>
              )}
            </div>

            {status?.ready && (
              <form
                className="border-t border-border p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(input);
                }}
              >
                <div className="flex items-end gap-2 rounded-2xl border border-border bg-background p-2 focus-within:border-primary">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        ask(input);
                      }
                    }}
                    placeholder="Ask about your money…"
                    className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-subtle"
                  />
                  <button type="submit" aria-label="Send" disabled={busy || !input.trim()} className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                  </button>
                </div>
                <p className="mt-1.5 px-1 text-[11px] text-subtle">
                  <Kbd>Enter</Kbd> send · AI can make mistakes; numbers link back to your data.
                </p>
              </form>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function ProposalCard({ p }: { p: Proposal }) {
  const [done, setDone] = useState(false);
  const apply = useMoneyMutation(
    async () => {
      if (p.kind === 'budget') await api(`/budget/${p.period}/${p.category_id}`, { method: 'PUT', json: { amount: p.amount } });
      if (p.kind === 'recategorize') await api('/transactions/categorize-payee', { method: 'POST', json: { payee: p.payee, category_id: p.category_id } });
      if (p.kind === 'rule') {
        await api('/rules', { method: 'POST', json: { field: 'payee', match: 'contains', pattern: p.pattern, set_category_id: p.category_id } });
        await api('/rules/apply', { method: 'POST' });
      }
    },
    { success: 'Done', onSuccess: () => setDone(true) },
  );
  const text =
    p.kind === 'budget'
      ? `Set the ${p.category} budget to ${formatMoney(p.amount ?? 0)} for ${p.period}`
      : p.kind === 'recategorize'
        ? `Move ${p.count} transaction${p.count === 1 ? '' : 's'} from ${p.payee} to ${p.category}`
        : `Always put payees containing "${p.pattern}" in ${p.category}`;
  return (
    <div className={cn('mt-3 flex items-center gap-3 rounded-2xl border p-3 text-sm', done ? 'border-income/40 bg-income-soft' : 'border-primary/40 bg-primary-soft')}>
      <p className="flex-1">{text}</p>
      {done ? (
        <span className="flex items-center gap-1 text-income"><Check className="size-4" /> Applied</span>
      ) : (
        <button onClick={() => apply.mutate(undefined)} disabled={apply.isPending} className="h-8 rounded-full bg-primary px-3 text-[13px] font-medium text-primary-foreground">Apply</button>
      )}
    </div>
  );
}
