import { Eye, EyeOff, Moon, Plus, Search, Sun, Upload } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';

import { cn } from '../lib/cn';
import { usePreferences } from '../lib/preferences';
import { useAccounts, useMeta, useSummary } from '../lib/queries';
import { isTyping, UiActionsContext, type UiActions } from '../lib/ui-actions';
import { CommandPalette } from './CommandPalette';
import { QuickAdd } from './QuickAdd';
import { TransactionEditor } from './TransactionEditor';
import { Logo } from './Logo';
import { ALL_NAV, NAV_SECTIONS, SETTINGS_ITEM, type NavItem } from './nav';
import { Kbd } from './ui';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const { data: meta } = useMeta();
  const { data: accounts, isSuccess, isFetching } = useAccounts();
  const location = useLocation();

  const actions = useMemo<UiActions>(
    () => ({
      openQuickAdd: () => setQuickAddOpen(true),
      openTransaction: (id) => setEditing(id),
      openPalette: () => setPaletteOpen(true),
    }),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'n') {
        e.preventDefault();
        setQuickAddOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // First run: no accounts yet, so set things up before anything else.
  if (isSuccess && !isFetching && accounts.length === 0 && location.pathname !== '/welcome') {
    return <Navigate to="/welcome" replace />;
  }

  return (
    <UiActionsContext.Provider value={actions}>
    <div className="min-h-dvh">
      <Sidebar onSearch={() => setPaletteOpen(true)} onAdd={() => setQuickAddOpen(true)} demo={meta?.demo ?? false} />
      <MobileTopBar onSearch={() => setPaletteOpen(true)} />

      <main className="px-4 pt-6 pb-32 sm:px-8 lg:ml-[264px] lg:px-12 lg:pt-14 lg:pb-16">
        <div className="mx-auto max-w-6xl">
          {meta?.demo && (
            <div className="mb-6 flex items-center gap-2 rounded-2xl border border-dashed border-border-strong px-4 py-2.5 text-sm text-muted lg:hidden">
              <span className="size-1.5 rounded-full bg-highlight" /> Demo data. Your real data is untouched.
            </div>
          )}
          <Outlet />
        </div>
      </main>

      <MobileDock onAdd={() => setQuickAddOpen(true)} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onQuickAdd={() => setQuickAddOpen(true)} />
      <QuickAdd open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
      <TransactionEditor id={editing} onClose={() => setEditing(null)} />
    </div>
    </UiActionsContext.Provider>
  );
}

function Sidebar({ onSearch, onAdd, demo }: { onSearch: () => void; onAdd: () => void; demo: boolean }) {
  const { data: summary } = useSummary();
  const navigate = useNavigate();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-border bg-surface/60 px-4 py-6 backdrop-blur lg:flex">
      <div className="px-2">
        <Logo />
      </div>

      <button
        onClick={onSearch}
        className="mt-7 flex h-10 items-center gap-2.5 rounded-full border border-border bg-background px-3.5 text-sm text-subtle transition hover:border-border-strong hover:text-muted"
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate whitespace-nowrap">Search or jump to…</span>
        <Kbd className="ml-auto">{isMac ? '⌘K' : 'Ctrl K'}</Kbd>
      </button>

      <nav className="mt-6 flex-1 space-y-6 overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="eyebrow px-3 pb-2">{section.title}</p>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <SideLink item={item} badge={item.to === '/transactions' ? summary?.inbox_count : undefined} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex gap-2">
          <button
            onClick={onAdd}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-primary text-sm font-medium text-primary-foreground transition hover:bg-primary-hover"
          >
            <Plus className="size-4" /> Add <Kbd className="border-transparent bg-white/15 text-current">N</Kbd>
          </button>
          <button
            onClick={() => navigate('/import')}
            title="Import a statement"
            className="flex h-10 items-center justify-center gap-2 rounded-full border border-border px-3.5 text-sm text-muted transition hover:border-border-strong hover:text-foreground"
          >
            <Upload className="size-4" /> Import
          </button>
        </div>
        <div className="flex items-center gap-1">
          <SideLink item={SETTINGS_ITEM} className="flex-1" />
          <PrivacyToggle />
          <ThemeToggle />
        </div>
        {demo && (
          <p className="flex items-center gap-2 px-3 text-xs text-subtle">
            <span className="size-1.5 rounded-full bg-highlight" /> Demo data. Your real data is untouched.
          </p>
        )}
      </div>
    </aside>
  );
}

function SideLink({ item, badge, className }: { item: NavItem; badge?: number; className?: string }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'group flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] text-muted transition',
          'hover:bg-surface-muted hover:text-foreground',
          isActive && 'bg-primary-soft font-medium text-primary-soft-foreground hover:bg-primary-soft',
          className,
        )
      }
    >
      <item.icon className="size-[18px]" strokeWidth={1.9} />
      <span className="truncate">{item.label}</span>
      {!!badge && (
        <span className="num ml-auto rounded-full bg-highlight px-2 py-0.5 text-[11px] font-semibold text-[#1a1408]">
          {badge}
        </span>
      )}
    </NavLink>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-10 place-items-center rounded-xl text-muted transition hover:bg-surface-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

function ThemeToggle() {
  const { toggleTheme } = usePreferences();
  return (
    <IconButton label="Switch light / dark" onClick={toggleTheme}>
      <Sun className="size-[18px] dark:hidden" strokeWidth={1.9} />
      <Moon className="hidden size-[18px] dark:block" strokeWidth={1.9} />
    </IconButton>
  );
}

function PrivacyToggle() {
  const { privacy, togglePrivacy } = usePreferences();
  return (
    <IconButton label={privacy ? 'Show amounts' : 'Hide amounts'} onClick={togglePrivacy}>
      {privacy ? <EyeOff className="size-[18px]" strokeWidth={1.9} /> : <Eye className="size-[18px]" strokeWidth={1.9} />}
    </IconButton>
  );
}

function MobileTopBar({ onSearch }: { onSearch: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur lg:hidden">
      <Logo />
      <div className="flex items-center gap-1">
        <IconButton label="Search" onClick={onSearch}>
          <Search className="size-[18px]" />
        </IconButton>
        <PrivacyToggle />
        <ThemeToggle />
      </div>
    </header>
  );
}

/** Sync-style floating dock, used only on narrow screens. */
function MobileDock({ onAdd }: { onAdd: () => void }) {
  const items = ALL_NAV.filter((i) => i.dock);
  return (
    <nav className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 lg:hidden">
      <ul className="flex items-center gap-1 rounded-full border border-border bg-surface-raised/90 p-1.5 shadow-[var(--shadow-lifted)] backdrop-blur">
        {items.map((item, i) => (
          <li key={item.to} className="flex items-center gap-1">
            {i === 2 && (
              <button
                onClick={onAdd}
                aria-label="Add a transaction"
                className="grid size-11 place-items-center rounded-full bg-foreground text-background"
              >
                <Plus className="size-5" />
              </button>
            )}
            <NavLink
              to={item.to}
              end={item.to === '/'}
              aria-label={item.label}
              className={({ isActive }) =>
                cn(
                  'grid size-11 place-items-center rounded-full text-muted transition',
                  isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-surface-muted',
                )
              }
            >
              <item.icon className="size-5" strokeWidth={1.9} />
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

