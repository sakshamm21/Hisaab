import { Check, Split } from 'lucide-react';

import type { Transaction } from '../lib/api';
import { cn } from '../lib/cn';
import { useUiActions } from '../lib/ui-actions';
import { CategoryIcon } from './CategoryIcon';
import { Amount } from './ui';

export function TransactionRow({
  t,
  compact = false,
  selected,
  onToggleSelect,
  active,
}: {
  t: Transaction;
  compact?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  active?: boolean;
}) {
  const { openTransaction } = useUiActions();
  const transfer = !!t.is_transfer;
  const label = transfer
    ? `Transfer ${t.amount < 0 ? 'to' : 'from'} ${t.transfer_account ?? 'another account'}`
    : t.split_count
      ? `Split into ${t.split_count}`
      : (t.category ?? 'Needs a category');
  return (
    <li
      data-active={active || undefined}
      className={cn(
        'group flex items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-surface-muted/60',
        active && 'bg-primary-soft hover:bg-primary-soft',
        selected && 'bg-primary-soft/70',
      )}
    >
      {onToggleSelect && (
        <button
          onClick={onToggleSelect}
          aria-label={selected ? 'Deselect' : 'Select'}
          className={cn(
            'grid size-5 shrink-0 place-items-center rounded-md border transition',
            selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong opacity-0 group-hover:opacity-100',
          )}
        >
          {selected && <Check className="size-3.5" strokeWidth={3} />}
        </button>
      )}
      <button onClick={() => openTransaction(t.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <CategoryIcon
          icon={transfer ? 'transfer' : t.split_count ? null : t.category_icon}
          color={transfer || t.split_count ? '#8b8693' : t.category_color}
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-[14px] font-medium">
            {t.payee || t.raw_description || 'Unknown'}
            {!!t.split_count && <Split className="size-3.5 text-subtle" />}
            {!t.reviewed && <span className="size-1.5 shrink-0 rounded-full bg-highlight" title="Waiting for review" />}
          </p>
          <p className="truncate text-xs text-subtle">
            <span className={cn(!t.category && !transfer && !t.split_count && 'text-warning')}>{label}</span>
            {!compact && <> · {t.account}</>}
            {compact && <> · {new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</>}
            {!compact && t.tags && <span className="text-primary"> · {t.tags.split(' ').map((x) => `#${x}`).join(' ')}</span>}
            {!!t.exclude_from_reports && <> · not in reports</>}
          </p>
        </div>
        <Amount
          value={t.amount}
          tone="flow"
          signed
          className={cn('text-[14px] font-medium', transfer && 'text-subtle')}
        />
      </button>
    </li>
  );
}
