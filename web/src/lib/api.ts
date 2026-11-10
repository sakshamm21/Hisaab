export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return res.json() as Promise<T>;
}

export type Meta = {
  version: string;
  demo: boolean;
  settings: { currency: string; locale: string; month_start_day: number; theme: string };
};

export type Account = {
  id: number;
  name: string;
  kind: 'bank' | 'cash' | 'credit_card' | 'wallet' | 'investment' | 'loan';
  currency: string;
  balance: number;
  transaction_count: number;
  include_in_net_worth: number;
};

export type Transaction = {
  id: number;
  date: string;
  amount: number;
  payee: string;
  raw_description: string;
  notes: string;
  tags: string;
  is_transfer: number;
  reviewed: number;
  account_id: number;
  account: string;
  category_id: number | null;
  category: string | null;
  category_icon: string | null;
  category_color: string | null;
};

export type Page<T> = { total: number; items: T[] };

export type CategorySpend = {
  id: number | null;
  name: string;
  icon: string;
  color: string;
  spent: number;
  count: number;
};

export type Summary = {
  month: string;
  income: number;
  spending: number;
  net: number;
  savings_rate: number | null;
  transaction_count: number;
  by_category: CategorySpend[];
  inbox_count: number;
};
