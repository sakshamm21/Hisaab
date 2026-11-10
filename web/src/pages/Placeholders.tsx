import { CalendarClock, ChartPie, PiggyBank, Target } from 'lucide-react';

import { EmptyState, PageHeader } from '../components/ui';

export function Budget() {
  return (
    <>
      <PageHeader eyebrow="What's left to spend" title="Your" accent="budget" />
      <EmptyState icon={PiggyBank} title="Plan the month ahead" badge="Phase 2">
        Set a budget per category from your own averages, see what's left each day, and roll unspent money
        forward.
      </EmptyState>
    </>
  );
}

export function Reports() {
  return (
    <>
      <PageHeader eyebrow="Where the money went" title="The" accent="reports" />
      <EmptyState icon={ChartPie} title="See the whole picture" badge="Phase 3">
        Cash flow from income to every category, 12-month trends, a daily spending calendar, top merchants and
        month-to-month comparisons.
      </EmptyState>
    </>
  );
}

export function Bills() {
  return (
    <>
      <PageHeader eyebrow="What's due next" title="Bills &" accent="subscriptions" />
      <EmptyState icon={CalendarClock} title="Never miss a due date" badge="Phase 2">
        Rent, SIPs, recharges and subscriptions in one calendar, with the monthly and yearly cost of each.
      </EmptyState>
    </>
  );
}

export function Goals() {
  return (
    <>
      <PageHeader eyebrow="Saving for something" title="Your" accent="goals" />
      <EmptyState icon={Target} title="Save with a target" badge="Phase 2">
        Pick an amount and a date, and Hisaab tells you how much to put aside each month.
      </EmptyState>
    </>
  );
}
