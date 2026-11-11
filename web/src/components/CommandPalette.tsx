import { Command } from 'cmdk';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarCheck, Eye, EyeOff, Moon, Plus, Search, Sparkles, Sun, Upload } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router';

import { usePreferences } from '../lib/preferences';
import { ALL_NAV } from './nav';
import { Kbd } from './ui';

export function CommandPalette({
  open,
  onOpenChange,
  onQuickAdd,
  onAsk,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onQuickAdd: () => void;
  onAsk: () => void;
}) {
  const navigate = useNavigate();
  const { toggleTheme, privacy, togglePrivacy } = usePreferences();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      } else if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[14vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onMouseDown={(e) => e.target === e.currentTarget && onOpenChange(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
            className="w-full max-w-xl overflow-hidden rounded-3xl border border-border bg-surface-raised shadow-[var(--shadow-overlay)]"
          >
            <Command label="Command palette" loop filter={filter}>
              <div className="flex items-center gap-3 border-b border-border px-5">
                <Search className="size-4 text-subtle" />
                <Command.Input
                  autoFocus
                  placeholder="Jump to a page or run a command…"
                  className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle"
                />
                <Kbd>esc</Kbd>
              </div>
              <Command.List className="max-h-[50vh] overflow-y-auto p-2">
                <Command.Empty className="px-4 py-8 text-center text-sm text-muted">Nothing matches.</Command.Empty>
                <Group heading="Do">
                  <Item value="Add a transaction" keywords={['new', 'expense', 'quick add']} onSelect={() => run(onQuickAdd)}>
                    <Plus className="size-4 text-muted" />
                    <span>Add a transaction</span>
                    <Kbd className="ml-auto">N</Kbd>
                  </Item>
                  <Item value="Ask about your money" keywords={['ai', 'assistant', 'question', 'chat']} onSelect={() => run(onAsk)}>
                    <Sparkles className="size-4 text-muted" />
                    <span>Ask about your money</span>
                  </Item>
                  <Item value="Month in review" keywords={['last month', 'summary', 'review']} onSelect={() => run(() => navigate('/review'))}>
                    <CalendarCheck className="size-4 text-muted" />
                    <span>Last month in review</span>
                  </Item>
                  <Item value="Import a statement" keywords={['upload', 'pdf', 'csv', 'bank']} onSelect={() => run(() => navigate('/import'))}>
                    <Upload className="size-4 text-muted" />
                    <span>Import a statement</span>
                  </Item>
                </Group>
                <Group heading="Go to">
                  {ALL_NAV.map((item) => (
                    <Item key={item.to} value={item.label} keywords={[item.hint]} onSelect={() => run(() => navigate(item.to))}>
                      <item.icon className="size-4 text-muted" />
                      <span>{item.label}</span>
                      <span className="ml-auto text-xs text-subtle">{item.hint}</span>
                    </Item>
                  ))}
                </Group>
                <Group heading="Preferences">
                  <Item value="Switch light / dark" keywords={['theme', 'mode', 'appearance']} onSelect={() => run(toggleTheme)}>
                    <Sun className="size-4 text-muted dark:hidden" />
                    <Moon className="hidden size-4 text-muted dark:block" />
                    <span>Switch light / dark</span>
                  </Item>
                  <Item value="Privacy" keywords={['hide amounts', 'show amounts', 'blur']} onSelect={() => run(togglePrivacy)}>
                    {privacy ? <Eye className="size-4 text-muted" /> : <EyeOff className="size-4 text-muted" />}
                    <span>{privacy ? 'Show amounts' : 'Hide amounts (privacy)'}</span>
                  </Item>
                </Group>
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-2"
    >
      {children}
    </Command.Group>
  );
}

/**
 * Predictable matching: every word typed must appear in the item's name or keywords.
 * Matches in the name rank above matches only in keywords. (cmdk's default fuzzy scoring
 * ranked "Goals" above "Switch light / dark" for "light".)
 */
function filter(value: string, search: string, keywords: string[] = []) {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const name = value.toLowerCase();
  const all = `${name} ${keywords.join(' ').toLowerCase()}`;
  if (!words.every((w) => all.includes(w))) return 0;
  if (name.startsWith(words[0] ?? '')) return 1;
  return words.every((w) => name.includes(w)) ? 0.8 : 0.5;
}

function Item({
  children,
  value,
  keywords,
  onSelect,
}: {
  children: ReactNode;
  value: string;
  keywords?: string[];
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={value}
      keywords={keywords}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm data-[selected=true]:bg-primary-soft data-[selected=true]:text-primary-soft-foreground"
    >
      {children}
    </Command.Item>
  );
}
