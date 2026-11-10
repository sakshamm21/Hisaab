import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  api,
  type Budget,
  type DetectedRecurring,
  type Goal,
  type Recurring,
  type Upcoming,
  type Account,
  type CategoryGroup,
  type Meta,
  type Page,
  type Rule,
  type Summary,
  type Transaction,
} from './api';

export const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: () => api<Meta>('/meta'), staleTime: 60_000 });

export const useSettings = () =>
  useQuery({ queryKey: ['settings'], queryFn: () => api<Record<string, string>>('/settings') });

export const useAccounts = (includeArchived = false) =>
  useQuery({
    queryKey: ['accounts', includeArchived],
    queryFn: () => api<Account[]>(`/accounts?include_archived=${includeArchived}`),
  });

export const useCategories = () =>
  useQuery({ queryKey: ['categories'], queryFn: () => api<CategoryGroup[]>('/categories'), staleTime: 60_000 });

export const useSummary = (month?: string) =>
  useQuery({
    queryKey: ['summary', month ?? 'current'],
    queryFn: () => api<Summary>(`/summary${month ? `?month=${month}` : ''}`),
  });

export const useRules = () => useQuery({ queryKey: ['rules'], queryFn: () => api<Rule[]>('/rules') });

export type TxFilters = {
  limit?: number;
  inbox?: boolean;
  q?: string;
  account_id?: number;
  category_id?: number[];
  uncategorized?: boolean;
  date_from?: string;
  date_to?: string;
  direction?: 'in' | 'out';
  tag?: string;
  import_id?: number;
};

export function toQuery(filters: Record<string, unknown>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === '' || v === false || v === null) continue;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, String(x)));
    else p.set(k, String(v));
  }
  return p.toString();
}

export const useTransactions = (filters: TxFilters = {}) =>
  useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => api<Page<Transaction>>(`/transactions?${toQuery({ limit: 50, ...filters })}`),
    placeholderData: (prev) => prev,
  });

/** Everything that depends on transactions. Call after any change to money data. */
export function useInvalidateMoney() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      ['transactions', 'transaction', 'summary', 'accounts', 'imports', 'categories', 'reports', 'budget', 'recurring', 'goals', 'insights'].map(
        (key) => qc.invalidateQueries({ queryKey: [key] }),
      ),
    );
}

/** A mutation that refreshes money data and toasts errors. */
export function useMoneyMutation<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: { success?: string | ((r: TResult) => string); onSuccess?: (r: TResult) => void } = {},
) {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result) => {
      await invalidate();
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(result) : opts.success);
      opts.onSuccess?.(result);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export const updateTransaction = (id: number, patch: Record<string, unknown>) =>
  api<Transaction>(`/transactions/${id}`, { method: 'PATCH', json: patch });

export const useBudget = (period?: string) =>
  useQuery({
    queryKey: ['budget', period],
    queryFn: () => api<Budget>(`/budget/${period}`),
    enabled: !!period,
    placeholderData: (prev) => prev,
  });

export const useRecurring = () =>
  useQuery({
    queryKey: ['recurring'],
    queryFn: () => api<{ items: Recurring[]; totals: { monthly_out: number; yearly_out: number; subscriptions_monthly: number; monthly_in: number } }>('/recurring'),
  });

export const useUpcoming = (days = 30) =>
  useQuery({ queryKey: ['recurring', 'upcoming', days], queryFn: () => api<Upcoming[]>(`/recurring/upcoming?days=${days}`) });

export const useDetected = () =>
  useQuery({ queryKey: ['recurring', 'detect'], queryFn: () => api<DetectedRecurring[]>('/recurring/detect') });

export const useGoals = () => useQuery({ queryKey: ['goals'], queryFn: () => api<Goal[]>('/goals') });
