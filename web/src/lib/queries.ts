import { useQuery } from '@tanstack/react-query';

import { api, type Account, type Meta, type Page, type Summary, type Transaction } from './api';

export const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: () => api<Meta>('/meta'), staleTime: Infinity });

export const useAccounts = () => useQuery({ queryKey: ['accounts'], queryFn: () => api<Account[]>('/accounts') });

export const useSummary = (month?: string) =>
  useQuery({
    queryKey: ['summary', month ?? 'current'],
    queryFn: () => api<Summary>(`/summary${month ? `?month=${month}` : ''}`),
  });

export const useTransactions = (opts: { limit?: number; inbox?: boolean } = {}) => {
  const { limit = 50, inbox = false } = opts;
  return useQuery({
    queryKey: ['transactions', { limit, inbox }],
    queryFn: () => api<Page<Transaction>>(`/transactions?limit=${limit}&inbox=${inbox}`),
    placeholderData: (prev) => prev,
  });
};
