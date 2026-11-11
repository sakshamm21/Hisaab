import { useQuery } from '@tanstack/react-query';
import { Table2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Rectangle,
  ResponsiveContainer,
  Sankey,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { CategoryIcon } from '../components/CategoryIcon';
import { axisMoney, axisProps, ChartTooltip, Legend, OTHER, SERIES } from '../components/charts';
import { Button, Select, Tabs } from '../components/forms';
import { PeriodSwitcher, shiftPeriod } from '../components/PeriodSwitcher';
import { Amount, PageHeader, SectionTitle, Skeleton, Surface } from '../components/ui';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { formatMoney } from '../lib/money';
import { useSummary } from '../lib/queries';

type Tab = 'spending' | 'cashflow' | 'trends' | 'calendar' | 'merchants' | 'compare' | 'networth' | 'tags';

const get = <T,>(path: string) => () => api<T>(path);

export function Reports() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) ?? 'spending';
  const { data: summary } = useSummary();
  const current = summary?.month;
  const period = params.get('period') ?? current;
  const setPeriod = (p: string) => setParams({ tab, period: p });

  return (
    <>
      <PageHeader
        eyebrow="Where the money went"
        title="The"
        accent="reports"
        actions={period && ['spending', 'cashflow', 'calendar', 'merchants'].includes(tab) ? <PeriodSwitcher period={period} current={current} onChange={setPeriod} /> : undefined}
      />
      <Tabs
        className="mb-6 flex-wrap"
        value={tab}
        onChange={(t) => setParams({ tab: t, ...(params.get('period') ? { period: params.get('period')! } : {}) })}
        options={[
          { value: 'spending', label: 'Spending' },
          { value: 'cashflow', label: 'Cash flow' },
          { value: 'trends', label: 'Trends' },
          { value: 'calendar', label: 'Calendar' },
          { value: 'merchants', label: 'Merchants' },
          { value: 'compare', label: 'Compare' },
          { value: 'networth', label: 'Net worth' },
          { value: 'tags', label: 'Tags' },
        ]}
      />
      {!period ? (
        <Skeleton className="h-96 rounded-3xl" />
      ) : (
        <>
          {tab === 'spending' && <Spending period={period} />}
          {tab === 'cashflow' && <CashFlow period={period} />}
          {tab === 'trends' && <Trends />}
          {tab === 'calendar' && <Calendar period={period} />}
          {tab === 'merchants' && <Merchants period={period} />}
          {tab === 'compare' && <Compare current={period} />}
          {tab === 'networth' && <NetWorth />}
          {tab === 'tags' && <Tags />}
        </>
      )}
    </>
  );
}

// ---- Spending: category bars, with a 12-month drill-down -------------------------------------

type SummaryLike = { label: string; spending: number; start: string; end: string; by_category: { id: number | null; name: string; icon: string; color: string; spent: number; count: number }[] };

function Spending({ period }: { period: string }) {
  const { data } = useQuery({ queryKey: ['summary', period], queryFn: get<SummaryLike>(`/summary?month=${period}`) });
  const [open, setOpen] = useState<number | null>(null);
  if (!data) return <Skeleton className="h-96 rounded-3xl" />;
  const max = Math.max(...data.by_category.map((c) => c.spent), 1);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
      <Surface className="p-6">
        <SectionTitle title={formatMoney(data.spending)} accent={`spent · ${data.label}`} />
        {!data.by_category.length && <p className="py-10 text-center text-sm text-muted">No spending this month.</p>}
        <ul className="space-y-1">
          {data.by_category.map((c) => (
            <li key={c.id ?? 'none'}>
              <button onClick={() => c.id && setOpen(c.id)} className={cn('flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-surface-muted/60', open === c.id && 'bg-primary-soft')}>
                <CategoryIcon icon={c.icon} color={c.color} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{c.name}</span>
                    <span className="flex items-baseline gap-2">
                      <span className="num text-xs text-subtle">{Math.round((c.spent / data.spending) * 100)}%</span>
                      <Amount value={c.spent} className="font-medium" />
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-surface-muted">
                    <div className="h-full rounded-full" style={{ width: `${(c.spent / max) * 100}%`, background: c.color }} />
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </Surface>
      <div>{open ? <CategoryDetail id={open} onClose={() => setOpen(null)} /> : <Surface className="p-6 text-sm text-muted">Pick a category to see its last 12 months and where the money went.</Surface>}</div>
    </div>
  );
}

type CategoryReport = { category: { name: string; icon: string; color: string }; months: { label: string; total: number }[]; budget: number | null; merchants: { payee: string; spent: number; count: number }[] };

function CategoryDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ['reports', 'category', id], queryFn: get<CategoryReport>(`/reports/category/${id}`) });
  if (!data) return <Skeleton className="h-96 rounded-3xl" />;
  const avg = Math.round(data.months.reduce((s, m) => s + m.total, 0) / data.months.length);
  return (
    <Surface className="p-5 lg:sticky lg:top-14">
      <div className="flex items-center gap-3">
        <CategoryIcon icon={data.category.icon} color={data.category.color} />
        <p className="flex-1 font-semibold">{data.category.name}</p>
        <button aria-label="Close" onClick={onClose} className="rounded-full p-1 text-subtle hover:bg-surface-muted"><X className="size-4" /></button>
      </div>
      <p className="mt-3 text-xs text-subtle">12 months · average <Amount value={avg} className="text-foreground" /> a month</p>
      <div className="mt-2 h-40">
        <ResponsiveContainer>
          <BarChart data={data.months} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" {...axisProps} interval={2} />
            <YAxis {...axisProps} tickFormatter={axisMoney} width={44} />
            <Tooltip cursor={{ fill: 'var(--surface-muted)' }} content={({ active, payload, label }) => <ChartTooltip active={active} label={label} rows={payload?.map((p) => ({ name: 'Spent', value: Number(p.value) })) ?? []} />} />
            <Bar dataKey="total" fill={data.category.color} radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="eyebrow mt-5 mb-2">Top places, last 12 months</p>
      <ul className="space-y-1.5 text-sm">
        {data.merchants.map((m) => (
          <li key={m.payee} className="flex justify-between gap-3">
            <Link to={`/transactions?q=${encodeURIComponent(m.payee)}`} className="truncate hover:underline">{m.payee}</Link>
            <span className="shrink-0 text-muted"><span className="num text-xs text-subtle">{m.count}× </span><Amount value={m.spent} /></span>
          </li>
        ))}
      </ul>
    </Surface>
  );
}

// ---- Cash flow (Sankey) ------------------------------------------------------------------------

type Flow = { start: string; end: string; income: number; spending: number; nodes: { name: string; kind: string }[]; links: { source: number; target: number; value: number }[] };

function CashFlow({ period }: { period: string }) {
  const [months, setMonths] = useState(1);
  const { data } = useQuery({ queryKey: ['reports', 'cashflow', period, months], queryFn: get<Flow>(`/reports/cashflow?period=${period}&months=${months}`) });
  const groupColor = useMemo(() => {
    const map = new Map<string, string>();
    data?.nodes.filter((n) => n.kind === 'group').forEach((n, i) => map.set(n.name, i < 8 ? SERIES[i] : OTHER));
    return map;
  }, [data]);
  if (!data) return <Skeleton className="h-[520px] rounded-3xl" />;
  if (!data.links.length) return <Surface className="py-20 text-center text-sm text-muted">No income or spending in this period.</Surface>;

  const parentGroup = (index: number): string | undefined => {
    const n = data.nodes[index];
    if (n.kind === 'group') return n.name;
    if (n.kind === 'category') {
      const l = data.links.find((x) => x.target === index);
      return l ? data.nodes[l.source].name : undefined;
    }
    return undefined;
  };
  const colorOf = (index: number) => {
    const n = data.nodes[index];
    if (n.kind === 'income') return n.name === 'From savings' ? 'var(--expense)' : 'var(--income)';
    if (n.kind === 'hub') return 'var(--muted)';
    if (n.kind === 'saved') return 'var(--income)';
    return groupColor.get(parentGroup(index) ?? '') ?? OTHER;
  };
  const height = Math.max(420, data.nodes.length * 22);

  return (
    <Surface className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          <Amount value={data.income} className="font-semibold text-foreground" /> came in, <Amount value={data.spending} className="font-semibold text-foreground" /> went out
          <span className="text-subtle"> · {data.start} to {data.end}</span>
        </p>
        <Select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="w-40">
          <option value={1}>This month</option>
          <option value={3}>Last 3 months</option>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
        </Select>
      </div>
      <div className="overflow-x-auto">
        <div style={{ height, minWidth: 720 }}>
          <ResponsiveContainer>
            <Sankey
              data={{ nodes: data.nodes, links: data.links }}
              nodePadding={14}
              nodeWidth={10}
              iterations={64}
              margin={{ top: 8, right: 170, bottom: 8, left: 120 }}
              link={(props: { sourceX: number; targetX: number; sourceY: number; targetY: number; sourceControlX: number; targetControlX: number; linkWidth: number; index: number; payload: { target: { index?: number } & { name: string } } }) => {
                const { sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload } = props;
                const target = data.nodes.findIndex((n) => n.name === payload.target.name);
                // Flows into "Money in" take the income source's colour; everything else takes its destination's.
                const source = data.nodes.findIndex((n) => n.name === (payload as unknown as { source: { name: string } }).source.name);
                const tint = data.nodes[target]?.kind === 'hub' ? colorOf(source) : colorOf(target);
                return (
                  <path
                    d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
                    fill="none"
                    stroke={tint}
                    strokeOpacity={0.3}
                    strokeWidth={Math.max(linkWidth, 1)}
                  />
                );
              }}
              node={(props: { x: number; y: number; width: number; height: number; index: number; payload: { name: string; value: number } }) => {
                const { x, y, width, height: h, index, payload } = props;
                const kind = data.nodes[index]?.kind;
                const leftSide = kind === 'income';
                return (
                  <g>
                    <Rectangle x={x} y={y} width={width} height={Math.max(h, 2)} fill={colorOf(index)} radius={2} />
                    <text x={leftSide ? x - 8 : x + width + 8} y={y + h / 2} textAnchor={leftSide ? 'end' : 'start'} dominantBaseline="middle" className="fill-foreground text-[12px]">
                      {payload.name}
                      <tspan className="fill-subtle num" dx={6} data-amount>{axisMoney(payload.value)}</tspan>
                    </text>
                  </g>
                );
              }}
            >
              <Tooltip content={({ active, payload }) => {
                const p = payload?.[0]?.payload as { source?: { name: string }; target?: { name: string }; name?: string; value?: number } | undefined;
                if (!p) return null;
                const name = p.source && p.target ? `${p.source.name} → ${p.target.name}` : (p.name ?? '');
                return <ChartTooltip active={active} rows={[{ name, value: Number(p.value ?? payload?.[0]?.value ?? 0) }]} />;
              }} />
            </Sankey>
          </ResponsiveContainer>
        </div>
      </div>
      <p className="mt-3 text-xs text-subtle">Transfers between your accounts aren't counted. Hover a flow for its amount.</p>
    </Surface>
  );
}

// ---- Trends (stacked bars by category, with a table view) -------------------------------------

type TrendData = { months: { period: string; label: string; income: number; spending: number; by_category: Record<string, number> }[]; categories: { id: number | null; name: string; total: number }[]; average_spending: number; average_income: number };

function Trends() {
  const [months, setMonths] = useState(12);
  const [table, setTable] = useState(false);
  const { data } = useQuery({ queryKey: ['reports', 'trends', months], queryFn: get<TrendData>(`/reports/trends?months=${months}`) });
  if (!data) return <Skeleton className="h-96 rounded-3xl" />;
  // Top 7 categories over the whole window keep their slot; the rest fold into Other.
  const top = data.categories.slice(0, 7);
  const series = [...top.map((c, i) => ({ key: `c${c.id}`, id: c.id, name: c.name, color: SERIES[i] })), { key: 'other', id: -1, name: 'Other', color: OTHER }];
  const rows = data.months.map((m) => {
    const row: Record<string, number | string> = { label: m.label, income: m.income, spending: m.spending };
    let other = m.spending;
    for (const s of series.slice(0, -1)) {
      const v = Math.max(m.by_category[String(s.id)] ?? 0, 0);
      row[s.key] = v;
      other -= v;
    }
    row.other = Math.max(other, 0);
    return row;
  });

  return (
    <Surface className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Average month: <Amount value={data.average_spending} className="font-semibold text-foreground" /> spent, <Amount value={data.average_income} className="font-semibold text-foreground" /> in
        </p>
        <div className="flex gap-2">
          <Select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="w-36">
            <option value={6}>6 months</option>
            <option value={12}>12 months</option>
            <option value={24}>24 months</option>
          </Select>
          <Button size="md" onClick={() => setTable((t) => !t)}><Table2 className="size-4" /> {table ? 'Chart' : 'Table'}</Button>
        </div>
      </div>
      <Legend items={series.map((s) => ({ name: s.name, color: s.color }))} />
      {table ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead><tr className="eyebrow border-b border-border"><th className="py-2 text-left font-normal">Category</th>{rows.map((r) => <th key={String(r.label)} className="px-2 py-2 font-normal">{r.label}</th>)}</tr></thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.key} className="border-b border-border/50">
                  <td className="py-1.5 text-left">{s.name}</td>
                  {rows.map((r) => <td key={String(r.label)} className="num px-2 text-muted" data-amount>{axisMoney(Number(r[s.key]))}</td>)}
                </tr>
              ))}
              <tr className="font-medium"><td className="py-1.5 text-left">Total spent</td>{rows.map((r) => <td key={String(r.label)} className="num px-2" data-amount>{axisMoney(Number(r.spending))}</td>)}</tr>
              <tr className="text-income"><td className="py-1.5 text-left">Came in</td>{rows.map((r) => <td key={String(r.label)} className="num px-2" data-amount>{axisMoney(Number(r.income))}</td>)}</tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 h-80">
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} tickFormatter={axisMoney} width={52} />
              <Tooltip
                cursor={{ fill: 'var(--surface-muted)', opacity: 0.6 }}
                content={({ active, payload, label }) => (
                  <ChartTooltip
                    active={active}
                    label={label}
                    rows={[...(payload ?? [])].reverse().filter((p) => Number(p.value) > 0).map((p) => ({ name: series.find((s) => s.key === p.dataKey)?.name ?? '', value: Number(p.value), color: String(p.color) }))}
                    footer={payload?.[0] && <>Spent {formatMoney(Number(payload[0].payload.spending))} · in {formatMoney(Number(payload[0].payload.income))}</>}
                  />
                )}
              />
              {series.map((s, i) => (
                <Bar key={s.key} dataKey={s.key} stackId="s" fill={s.color} stroke="var(--surface)" strokeWidth={2} radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={36} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Surface>
  );
}

// ---- Calendar heatmap ---------------------------------------------------------------------------

type CalendarData = { start: string; end: string; days: Record<string, { spent: number; count: number }>; by_weekday: number[]; max: number };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Calendar({ period }: { period: string }) {
  const { data } = useQuery({ queryKey: ['reports', 'calendar', period], queryFn: get<CalendarData>(`/reports/calendar?months=3&period=${period}`) });
  const [hover, setHover] = useState<string | null>(null);
  if (!data) return <Skeleton className="h-96 rounded-3xl" />;
  // Sequential scale: one hue, light to dark, 5 steps (quantiles would hide rent day; use a capped linear scale).
  const cap = Math.max(data.max * 0.6, 1);
  const level = (v: number) => (v <= 0 ? 0 : Math.min(4, Math.ceil((v / cap) * 4)));
  const shades = ['var(--surface-muted)', 'color-mix(in srgb, var(--series-1) 25%, var(--surface))', 'color-mix(in srgb, var(--series-1) 50%, var(--surface))', 'color-mix(in srgb, var(--series-1) 75%, var(--surface))', 'var(--series-1)'];

  const start = new Date(`${data.start}T00:00:00`);
  const end = new Date(`${data.end}T00:00:00`);
  const monthsList: { key: string; title: string; cells: (string | null)[] }[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let m = monthsList.find((x) => x.key === key);
    if (!m) {
      m = { key, title: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }), cells: Array((d.getDay() + 6) % 7).fill(null) };
      monthsList.push(m);
    }
    m.cells.push(iso(d));
  }
  const hovered = hover ? data.days[hover] : undefined;
  const maxWeekday = Math.max(...data.by_weekday, 1);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <Surface className="p-6">
        <div className="mb-4 flex items-center justify-between gap-3 text-sm">
          <p className="text-muted">Spending per day · darker means more</p>
          <p className="num text-right" data-amount>
            {hover ? <>{new Date(`${hover}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}: <b>{formatMoney(hovered?.spent ?? 0)}</b>{hovered ? ` · ${hovered.count} payments` : ''}</> : <span className="text-subtle">Hover a day</span>}
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {monthsList.map((m) => (
            <div key={m.key}>
              <p className="eyebrow mb-2">{m.title}</p>
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map((w) => <span key={w} className="text-center font-mono text-[9px] text-subtle">{w[0]}</span>)}
                {m.cells.map((day, i) =>
                  day ? (
                    <Link
                      key={day}
                      to={`/transactions?from=${day}&to=${day}`}
                      onMouseEnter={() => setHover(day)}
                      onMouseLeave={() => setHover(null)}
                      aria-label={`${day}: ${formatMoney(data.days[day]?.spent ?? 0)}`}
                      className={cn('aspect-square rounded-[5px] ring-offset-1 ring-offset-surface transition hover:ring-2 hover:ring-foreground/40', day === iso(new Date()) && 'ring-2 ring-primary')}
                      style={{ background: shades[level(data.days[day]?.spent ?? 0)] }}
                    />
                  ) : (
                    <span key={`b${i}`} />
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-1.5 text-[11px] text-subtle">
          Less {shades.map((s, i) => <span key={i} className="size-3 rounded-[3px]" style={{ background: s }} />)} More
        </div>
      </Surface>
      <Surface className="p-6">
        <SectionTitle title="By" accent="weekday" />
        <p className="mb-4 text-xs text-subtle">Average spent on each day of the week</p>
        <ul className="space-y-2.5">
          {data.by_weekday.map((v, i) => (
            <li key={i} className="grid grid-cols-[2.5rem_1fr_4.5rem] items-center gap-2 text-sm">
              <span className="text-muted">{WEEKDAYS[i]}</span>
              <div className="h-2 rounded-full bg-surface-muted"><div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: `${(v / maxWeekday) * 100}%` }} /></div>
              <span className="num text-right text-xs" data-amount>{axisMoney(v)}</span>
            </li>
          ))}
        </ul>
      </Surface>
    </div>
  );
}

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---- Merchants ---------------------------------------------------------------------------------

type MerchantData = { start: string; end: string; items: { payee: string; spent: number; count: number; average: number; last: string; category: string | null; icon: string | null; color: string | null; is_person: number }[] };

function Merchants({ period }: { period: string }) {
  const [months, setMonths] = useState(3);
  const { data } = useQuery({ queryKey: ['reports', 'merchants', period, months], queryFn: get<MerchantData>(`/reports/merchants?months=${months}&period=${period}&limit=40`) });
  if (!data) return <Skeleton className="h-96 rounded-3xl" />;
  const max = Math.max(...data.items.map((m) => m.spent), 1);
  return (
    <Surface className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Who you pay most · {data.start} to {data.end}</p>
        <Select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="w-40">
          <option value={1}>This month</option>
          <option value={3}>3 months</option>
          <option value={6}>6 months</option>
          <option value={12}>12 months</option>
        </Select>
      </div>
      <ul className="divide-y divide-border/60">
        {data.items.map((m, i) => (
          <li key={m.payee} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-3 py-2.5">
            <span className="num text-xs text-subtle">{i + 1}</span>
            <Link to={`/transactions?q=${encodeURIComponent(m.payee)}`} className="flex min-w-0 items-center gap-3">
              <CategoryIcon icon={m.icon} color={m.color} className="size-8" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.payee}</p>
                <div className="mt-1 h-1.5 rounded-full bg-surface-muted"><div className="h-full rounded-full" style={{ width: `${(m.spent / max) * 100}%`, background: m.color ?? OTHER }} /></div>
              </div>
            </Link>
            <div className="text-right">
              <Amount value={m.spent} className="text-sm font-semibold" />
              <p className="num text-[11px] text-subtle">{m.count}× · avg {formatMoney(m.average)}</p>
            </div>
          </li>
        ))}
      </ul>
    </Surface>
  );
}

// ---- Compare two months ------------------------------------------------------------------------

type CompareData = { a: { period: string; label: string; income: number; spending: number }; b: { period: string; label: string; income: number; spending: number }; categories: { id: number | null; name: string; icon: string; color: string; a: number; b: number; change: number }[] };

function Compare({ current }: { current: string }) {
  const [b, setB] = useState(current);
  const [a, setA] = useState(shiftPeriod(current, -1));
  const { data } = useQuery({ queryKey: ['reports', 'compare', a, b], queryFn: get<CompareData>(`/reports/compare?a=${a}&b=${b}`) });
  return (
    <Surface className="p-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <PeriodSwitcher period={a} label={data?.a.label} onChange={setA} />
        <span className="text-sm text-muted">compared with</span>
        <PeriodSwitcher period={b} label={data?.b.label} onChange={setB} />
      </div>
      {!data ? (
        <Skeleton className="h-80" />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[['Spent', data.a.spending, data.b.spending, true], ['Came in', data.a.income, data.b.income, false]].map(([label, x, y, downGood]) => {
              const diff = Number(y) - Number(x);
              return (
                <div key={String(label)} className="col-span-1 sm:col-span-2">
                  <p className="eyebrow">{label}</p>
                  <p className="mt-1 text-sm"><Amount value={Number(x)} className="text-muted" /> → <Amount value={Number(y)} className="font-display text-xl font-bold" /></p>
                  <p className={cn('num text-xs', diff === 0 ? 'text-subtle' : (diff < 0) === downGood ? 'text-income' : 'text-expense')} data-amount>{diff > 0 ? '+' : ''}{formatMoney(diff)}</p>
                </div>
              );
            })}
          </div>
          <Legend items={[{ name: data.a.label, color: OTHER }, { name: data.b.label, color: 'var(--series-1)' }]} />
          <ul className="mt-4 space-y-3">
            {data.categories.map((c) => {
              const max = Math.max(...data.categories.map((x) => Math.max(x.a, x.b)), 1);
              return (
                <li key={c.id ?? 'none'} className="grid grid-cols-[1fr_6rem] items-center gap-3 sm:grid-cols-[12rem_1fr_6rem]">
                  <span className="flex items-center gap-2 truncate text-sm"><CategoryIcon icon={c.icon} color={c.color} className="size-7 rounded-lg" />{c.name}</span>
                  <div className="col-span-2 row-start-2 space-y-1 sm:col-span-1 sm:row-start-auto">
                    <div className="h-2 rounded-full" style={{ width: `${(Math.max(c.a, 0) / max) * 100}%`, background: OTHER }} title={`${data.a.label}: ${formatMoney(c.a)}`} />
                    <div className="h-2 rounded-full" style={{ width: `${(Math.max(c.b, 0) / max) * 100}%`, background: 'var(--series-1)' }} title={`${data.b.label}: ${formatMoney(c.b)}`} />
                  </div>
                  <span className={cn('num text-right text-sm font-medium', c.change > 0 ? 'text-expense' : c.change < 0 ? 'text-income' : 'text-subtle')} data-amount>
                    {c.change > 0 ? '+' : ''}{formatMoney(c.change)}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Surface>
  );
}

// ---- Net worth ---------------------------------------------------------------------------------

type NetWorthData = { points: { label: string; assets: number; debts: number; net: number }[] };

function NetWorth() {
  const { data } = useQuery({ queryKey: ['reports', 'networth'], queryFn: get<NetWorthData>('/reports/networth?months=12') });
  if (!data) return <Skeleton className="h-96 rounded-3xl" />;
  const last = data.points.at(-1);
  const first = data.points[0];
  return (
    <Surface className="p-6">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="text-sm text-muted">Net worth now <Amount value={last?.net ?? 0} className="font-display text-2xl font-bold text-foreground" /></p>
        {first && last && <p className={cn('num text-sm', last.net >= first.net ? 'text-income' : 'text-expense')} data-amount>{last.net >= first.net ? '+' : ''}{formatMoney(last.net - first.net)} in 12 months</p>}
      </div>
      <div className="h-80">
        <ResponsiveContainer>
          <AreaChart data={data.points} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} tickFormatter={axisMoney} width={56} />
            <Tooltip
              cursor={{ stroke: 'var(--border-strong)' }}
              content={({ active, payload, label }) => {
                const p = payload?.[0]?.payload as NetWorthData['points'][number] | undefined;
                return p ? <ChartTooltip active={active} label={label} rows={[{ name: 'Net worth', value: p.net, color: 'var(--series-1)' }, { name: 'You have', value: p.assets }, { name: 'You owe', value: -p.debts }]} /> : null;
              }}
            />
            <Area type="monotone" dataKey="net" stroke="var(--series-1)" strokeWidth={2} fill="url(#nw)" activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-xs text-subtle">Month-end balance of every account counted in net worth (Accounts page).</p>
    </Surface>
  );
}

// ---- Tags --------------------------------------------------------------------------------------

function Tags() {
  const { data } = useQuery({ queryKey: ['reports', 'tags'], queryFn: get<{ tag: string; spent: number; income: number; count: number; first: string; last: string }[]>('/reports/tags') });
  if (!data) return <Skeleton className="h-60 rounded-3xl" />;
  if (!data.length) return <Surface className="py-16 text-center text-sm text-muted">No tags yet. Add #tags to transactions (like #goa-trip) to total spending across categories.</Surface>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((t) => (
        <Link key={t.tag} to={`/transactions?tag=${encodeURIComponent(t.tag)}`}>
          <Surface className="p-5 transition hover:border-border-strong">
            <p className="font-medium text-primary">#{t.tag}</p>
            <Amount value={t.spent} className="mt-2 block font-display text-2xl font-bold" />
            <p className="mt-1 text-xs text-subtle">{t.count} transactions · {t.first} → {t.last}</p>
          </Surface>
        </Link>
      ))}
    </div>
  );
}
