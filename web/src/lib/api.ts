export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(`/api${path}`, {
    ...rest,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    headers: json !== undefined ? { 'Content-Type': 'application/json', ...rest.headers } : rest.headers,
  });
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* not JSON */
    }
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg).join(', ')
          : ((detail as { message?: string })?.message ?? 'Something went wrong');
    throw new ApiError(res.status, message, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type Meta = {
  version: string;
  demo: boolean;
  settings: { currency: string; locale: string; month_start_day: number; theme: string };
};

export type AccountKind = 'bank' | 'cash' | 'credit_card' | 'wallet' | 'investment' | 'loan';

export type Account = {
  id: number;
  name: string;
  kind: AccountKind;
  currency: string;
  balance: number;
  opening_balance: number;
  opening_date: string;
  transaction_count: number;
  include_in_net_worth: number;
  archived: number;
  last_transaction: string | null;
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
  transfer_id: string | null;
  transfer_account_id: number | null;
  transfer_account: string | null;
  reviewed: number;
  is_person: number;
  exclude_from_reports: number;
  import_id: number | null;
  split_count: number;
  account_id: number;
  account: string;
  category_id: number | null;
  category: string | null;
  category_icon: string | null;
  category_color: string | null;
  splits?: Split[];
};

export type Split = {
  id: number;
  amount: number;
  category_id: number | null;
  notes: string;
  category: string | null;
  category_icon: string | null;
  category_color: string | null;
};

export type Page<T> = { total: number; net?: number; items: T[] };

export type Category = {
  id: number;
  group_id: number;
  name: string;
  icon: string;
  color: string;
  bucket: 'need' | 'want' | 'saving' | null;
  rollover: number;
  archived: number;
  transaction_count: number;
};

export type CategoryGroup = {
  id: number;
  name: string;
  kind: 'expense' | 'income';
  categories: Category[];
};

export type CategorySpend = {
  id: number | null;
  name: string;
  icon: string;
  color: string;
  spent: number;
  count: number;
};

export type PeriodInfo = {
  period: string;
  start: string;
  end: string;
  days: number;
  days_elapsed: number;
  days_left: number;
  is_current: boolean;
  label: string;
};

export type Summary = PeriodInfo & {
  month: string;
  previous: { income: number; spending: number; spending_to_date: number };
  income: number;
  spending: number;
  net: number;
  savings_rate: number | null;
  transaction_count: number;
  by_category: CategorySpend[];
  inbox_count: number;
};

export type Rule = {
  id: number;
  field: 'payee' | 'description';
  match: 'contains' | 'equals' | 'regex';
  pattern: string;
  set_category_id: number | null;
  set_payee: string | null;
  category: string | null;
  priority: number;
};

export type PreviewRow = {
  index: number;
  date: string;
  amount: number;
  payee: string;
  description: string;
  category_id: number | null;
  category_source: 'rule' | 'memory' | 'known' | null;
  kind: string;
  is_person: boolean;
  reference: string;
  fingerprint: string;
  duplicate: boolean;
  match_id: number | null;
  transfer_account_id: number | null;
  balance: number | null;
  balance_ok: boolean;
  skip?: boolean;
  user_set?: boolean;
};

export type ImportPreview = {
  format: string;
  period: [string, string] | null;
  account_hint: string;
  warnings: string[];
  rows: PreviewRow[];
  counts: { total: number; duplicates: number; categorized: number; balance_mismatches: number };
};

export type ImportRecord = {
  id: number;
  file_name: string;
  account: string;
  account_id: number;
  rows: number;
  imported: number;
  skipped: number;
  format: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
};

export type Backup = { name: string; size: number; created: string; kind: string };

export type BudgetCategory = {
  id: number;
  name: string;
  icon: string;
  color: string;
  bucket: 'need' | 'want' | 'saving' | null;
  rollover: number;
  budgeted: number;
  carry: number;
  spent: number;
  available: number;
  average: number;
  last: number;
  has_budget: boolean;
};

export type Budget = PeriodInfo & {
  groups: { id: number; name: string; categories: BudgetCategory[] }[];
  totals: {
    budgeted: number;
    spent: number;
    income: number;
    available: number;
    unbudgeted_spend: number;
    safe_per_day: number | null;
    to_budget: number;
  };
  split: {
    actual: Record<'need' | 'want' | 'saving', number>;
    base: number;
    targets: Record<'need' | 'want' | 'saving', number>;
  };
};

export type Cadence = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type Recurring = {
  id: number;
  name: string;
  payee: string;
  kind: 'bill' | 'subscription' | 'income';
  amount: number;
  cadence: Cadence;
  interval: number;
  next_due: string;
  last_paid: string | null;
  category_id: number | null;
  category: string | null;
  category_icon: string | null;
  category_color: string | null;
  account_id: number | null;
  account: string | null;
  auto_post: number;
  active: number;
  notes: string;
  monthly_cost: number;
};

export type Upcoming = {
  recurring_id: number;
  name: string;
  amount: number;
  date: string;
  kind: Recurring['kind'];
  category: string | null;
  category_icon: string | null;
  category_color: string | null;
  status: 'overdue' | 'today' | 'upcoming';
  days: number;
};

export type DetectedRecurring = {
  payee: string;
  name: string;
  amount: number;
  cadence: Cadence;
  next_due: string;
  last_paid: string;
  kind: Recurring['kind'];
  category_id: number | null;
  category: string | null;
  account_id: number | null;
  occurrences: number;
  monthly_cost: number;
};

export type Goal = {
  id: number;
  name: string;
  target_amount: number;
  target_date: string | null;
  starting_amount: number;
  account_id: number | null;
  icon: string;
  color: string;
  notes: string;
  archived: number;
  saved: number;
  remaining: number;
  progress: number;
  pace_per_month: number;
  needed_per_month: number | null;
  months_left: number | null;
  on_track: boolean | null;
  projected_date: string | null;
  entries: { id: number; date: string; amount: number }[];
};
