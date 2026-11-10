import { Command } from 'cmdk';
import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { Category } from '../lib/api';
import { cn } from '../lib/cn';
import { useCategories } from '../lib/queries';
import { CategoryIcon } from './CategoryIcon';

export function useCategoryMap() {
  const { data } = useCategories();
  const map = new Map<number, Category & { kind: string; group: string }>();
  data?.forEach((g) => g.categories.forEach((c) => map.set(c.id, { ...c, kind: g.kind, group: g.name })));
  return map;
}

/** A searchable list of categories, grouped. Used inline (triage) or inside a popover. */
export function CategoryList({
  onPick,
  autoFocus = true,
  income,
}: {
  onPick: (id: number) => void;
  autoFocus?: boolean;
  /** Show income categories first for money in. */
  income?: boolean;
}) {
  const { data: groups } = useCategories();
  // Money in shows income categories first; money out shows spending first. Otherwise keep the saved order.
  const all = groups ?? [];
  const ordered = income === undefined ? all : [...all.filter((g) => (g.kind === 'income') === income), ...all.filter((g) => (g.kind === 'income') !== income)];
  return (
    <Command loop className="w-full">
      <Command.Input
        autoFocus={autoFocus}
        placeholder="Find a category…"
        className="h-10 w-full border-b border-border bg-transparent px-3 text-sm outline-none placeholder:text-subtle"
      />
      <Command.List className="max-h-72 overflow-y-auto p-1.5">
        <Command.Empty className="p-4 text-center text-sm text-muted">No category matches.</Command.Empty>
        {ordered.map((g) => (
          <Command.Group
            key={g.id}
            heading={g.name}
            className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1"
          >
            {g.categories.map((c) => (
              <Command.Item
                key={c.id}
                value={`${c.name} ${g.name}`}
                onSelect={() => onPick(c.id)}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm data-[selected=true]:bg-primary-soft"
              >
                <CategoryIcon icon={c.icon} color={c.color} className="size-7 rounded-lg" />
                {c.name}
              </Command.Item>
            ))}
          </Command.Group>
        ))}
      </Command.List>
    </Command>
  );
}

/** A button showing the current category that opens a searchable picker. */
export function CategoryPicker({
  value,
  onChange,
  income,
  placeholder = 'Choose a category',
  className,
}: {
  value: number | null;
  onChange: (id: number) => void;
  income?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const map = useCategoryMap();
  const current = value ? map.get(value) : undefined;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false));
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc, true);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center gap-2.5 rounded-xl border border-border bg-background px-2 text-left text-sm transition hover:border-border-strong"
      >
        {current ? (
          <>
            <CategoryIcon icon={current.icon} color={current.color} className="size-7 rounded-lg" />
            <span className="truncate">{current.name}</span>
          </>
        ) : (
          <span className="px-1 text-subtle">{placeholder}</span>
        )}
        <ChevronDown className="ml-auto size-4 shrink-0 text-subtle" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1.5 w-full min-w-64 overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-[var(--shadow-lifted)]">
          <CategoryList
            income={income}
            onPick={(id) => {
              onChange(id);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
