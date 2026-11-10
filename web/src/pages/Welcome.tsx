import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { Button, Field, Input, MoneyInput, Select, Switch } from '../components/forms';
import { Logo } from '../components/Logo';
import { Surface } from '../components/ui';
import { api } from '../lib/api';

/** First run: a bank account, optional cash and card, and the month start day. About a minute. */
export function Welcome() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [bank, setBank] = useState('ICICI Savings');
  const [bankBalance, setBankBalance] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [cash, setCash] = useState(true);
  const [cashBalance, setCashBalance] = useState<number | null>(null);
  const [card, setCard] = useState(false);
  const [cardName, setCardName] = useState('Credit card');
  const [monthStart, setMonthStart] = useState('1');
  const [busy, setBusy] = useState(false);

  async function finish(goImport: boolean) {
    setBusy(true);
    try {
      await api('/settings', { method: 'PUT', json: { values: { month_start_day: Number(monthStart), onboarded: 1 } } });
      await api('/accounts', { method: 'POST', json: { name: bank, kind: 'bank', opening_balance: bankBalance ?? 0, opening_date: startDate } });
      if (cash) await api('/accounts', { method: 'POST', json: { name: 'Cash', kind: 'cash', opening_balance: cashBalance ?? 0, opening_date: startDate } });
      if (card) await api('/accounts', { method: 'POST', json: { name: cardName, kind: 'credit_card', opening_balance: 0, opening_date: startDate } });
      await qc.invalidateQueries();
      navigate(goImport ? '/import' : '/');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl py-6">
      <Logo />
      <h1 className="mt-10 text-5xl leading-[0.95] font-extrabold">
        Let's set up your <span className="font-serif font-normal italic text-primary">hisaab</span>
      </h1>
      <p className="mt-4 text-muted">A minute now, then import a statement and see where your money went. Everything stays on this computer.</p>

      <Surface className="mt-8 space-y-5 p-6">
        <p className="eyebrow">Your main bank account</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><Input value={bank} onChange={(e) => setBank(e.target.value)} /></Field>
          <Field label="Balance on the start date"><MoneyInput value={bankBalance} onChange={setBankBalance} /></Field>
        </div>
        <Field label="Start date" hint="Use the first day of the oldest statement you'll import, and its opening balance above.">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <div className="space-y-3 border-t border-border pt-5">
          <Switch checked={cash} onChange={setCash} label="I also spend cash" />
          {cash && <Field label="Cash in hand"><MoneyInput value={cashBalance} onChange={setCashBalance} /></Field>}
          <Switch checked={card} onChange={setCard} label="I have a credit card" />
          {card && <Field label="Card name"><Input value={cardName} onChange={(e) => setCardName(e.target.value)} /></Field>}
        </div>
        <div className="border-t border-border pt-5">
          <Field label="My month starts on" hint="Most people pick the 1st. If your salary lands on the 25th, pick 25 and every month runs 25th to 24th.">
            <Select value={monthStart} onChange={(e) => setMonthStart(e.target.value)} className="w-40">
              {Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}{['st', 'nd', 'rd'][((i + 1) % 10) - 1] && ![11, 12, 13].includes(i + 1) ? ['st', 'nd', 'rd'][((i + 1) % 10) - 1] : 'th'}</option>)}
            </Select>
          </Field>
        </div>
      </Surface>

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button disabled={busy || !bank.trim()} onClick={() => finish(false)}><Check className="size-4" /> Done</Button>
        <Button variant="primary" disabled={busy || !bank.trim()} onClick={() => finish(true)}>
          Import a statement <ArrowRight className="size-4" />
        </Button>
      </div>
      <p className="mt-8 text-center text-xs text-subtle">Just looking around? Run <code>hisaab --demo</code> for sample data.</p>
    </div>
  );
}
