import { ChartPie } from 'lucide-react';

import { EmptyState, PageHeader } from '../components/ui';

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
