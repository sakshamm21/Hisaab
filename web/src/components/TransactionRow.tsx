import type { Transaction } from '../lib/api';
import { cn } from '../lib/cn';
import { CategoryIcon } from './CategoryIcon';
import { Amount } from './ui';

export function TransactionRow({ t, compact = false }: { t: Transaction; compact?: boolean }) {
  const transfer = !!t.is_transfer;
  const label = transfer ? 'Transfer' : (t.category ?? 'Needs a category');
  return (
    <li className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-surface-muted/60">
      <CategoryIcon
        icon={transfer ? 'transfer' : t.category_icon}
        color={transfer ? '#8b8693' : t.category_color}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium">{t.payee || t.raw_description || 'Unknown'}</p>
        <p className="truncate text-xs text-subtle">
          <span className={cn(!t.category && !transfer && 'text-warning')}>{label}</span>
          {!compact && <> · {t.account}</>}
          {compact && (
            <> · {new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</>
          )}
        </p>
      </div>
      <Amount value={t.amount} tone="flow" signed className="text-[14px] font-medium" />
    </li>
  );
}
