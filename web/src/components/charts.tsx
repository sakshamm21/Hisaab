import type { ReactNode } from 'react';

import { formatMoney } from '../lib/money';

/** Fixed-order categorical slots (validated). Colour follows the entity's slot, never its rank in a filtered view. */
export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);
export const OTHER = 'var(--series-other)';

/** Axis labels: ₹850, ₹12k, ₹1.2L, ₹3.4Cr. */
export function axisMoney(paise: number) {
  const r = Math.abs(paise) / 100;
  const sign = paise < 0 ? '−' : '';
  if (r >= 1e7) return `${sign}₹${+(r / 1e7).toFixed(1)}Cr`;
  if (r >= 1e5) return `${sign}₹${+(r / 1e5).toFixed(1)}L`;
  if (r >= 1e3) return `${sign}₹${+(r / 1e3).toFixed(r >= 1e4 ? 0 : 1)}k`;
  return `${sign}₹${Math.round(r)}`;
}

export const axisProps = {
  tick: { fill: 'var(--subtle)', fontSize: 11, fontFamily: 'var(--font-mono)' },
  axisLine: false,
  tickLine: false,
} as const;

/** Tooltip card in app style. Text uses text colours; a swatch carries identity. */
export function ChartTooltip({
  active,
  label,
  rows,
  footer,
}: {
  active?: boolean;
  label?: ReactNode;
  rows: { name: string; value: number; color?: string }[];
  footer?: ReactNode;
}) {
  if (!active || !rows.length) return null;
  return (
    <div className="min-w-44 rounded-xl border border-border bg-surface-raised px-3 py-2.5 text-xs shadow-[var(--shadow-lifted)]">
      {label && <p className="mb-1.5 font-medium text-foreground">{label}</p>}
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-2">
            {r.color && <span className="size-2.5 shrink-0 rounded-sm" style={{ background: r.color }} />}
            <span className="flex-1 truncate text-muted">{r.name}</span>
            <span data-amount className="num font-medium text-foreground">{formatMoney(r.value)}</span>
          </li>
        ))}
      </ul>
      {footer && <div className="mt-1.5 border-t border-border pt-1.5 text-subtle">{footer}</div>}
    </div>
  );
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
      {items.map((i) => (
        <li key={i.name} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: i.color }} />
          {i.name}
        </li>
      ))}
    </ul>
  );
}
