import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, CircleCheck, Lightbulb, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { Surface } from '../components/ui';
import { api } from '../lib/api';
import { cn } from '../lib/cn';

export type Insight = { id: string; kind: string; severity: 'good' | 'info' | 'warn'; title: string; body: string; link: string };

const ICON = { good: CircleCheck, info: Lightbulb, warn: AlertTriangle };
const STYLE = {
  good: 'text-income bg-income-soft',
  info: 'text-primary-soft-foreground bg-primary-soft',
  warn: 'text-warning bg-warning-soft',
};

function readDismissed(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem('hisaab-dismissed') ?? '[]');
  } catch {
    return [];
  }
}

/** Insight cards on the dashboard: computed in Python from your own history, no AI needed. */
export function Insights() {
  const { data } = useQuery({ queryKey: ['insights'], queryFn: () => api<{ items: Insight[] }>('/insights') });
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const items = (data?.items ?? []).filter((i) => !dismissed.includes(i.title)).slice(0, 4);
  if (!items.length) return null;
  const hide = (title: string) => {
    const next = [...dismissed, title];
    setDismissed(next);
    try {
      sessionStorage.setItem('hisaab-dismissed', JSON.stringify(next));
    } catch {
      /* fine: just not remembered */
    }
  };
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      {items.map((i) => {
        const Icon = ICON[i.severity];
        return (
          <Surface key={i.id} className="group relative flex gap-4 p-5">
            <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', STYLE[i.severity])}>
              <Icon className="size-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{i.title}</p>
              <p data-amount className="mt-0.5 text-sm text-muted">{i.body}</p>
              <Link to={i.link} className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                Look <ArrowRight className="size-3" />
              </Link>
            </div>
            <button aria-label="Dismiss" onClick={() => hide(i.title)} className="absolute top-3 right-3 rounded-full p-1 text-subtle opacity-0 group-hover:opacity-100 hover:bg-surface-muted">
              <X className="size-3.5" />
            </button>
          </Surface>
        );
      })}
    </div>
  );
}
