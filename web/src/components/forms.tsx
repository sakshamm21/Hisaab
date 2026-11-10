import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, useId, useState, type ComponentProps, type ReactNode } from 'react';

import { cn } from '../lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant; size?: 'sm' | 'md' }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'md' ? 'h-10 px-4 text-sm' : 'h-8 px-3 text-[13px]',
        variant === 'primary' && 'bg-primary text-primary-foreground hover:bg-primary-hover',
        variant === 'secondary' && 'border border-border bg-surface text-foreground hover:border-border-strong',
        variant === 'ghost' && 'text-muted hover:bg-surface-muted hover:text-foreground',
        variant === 'danger' && 'border border-expense/30 text-expense hover:bg-expense-soft',
        className,
      )}
      {...props}
    />
  );
}

const inputClass =
  'h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-ring/40';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(inputClass, 'h-auto min-h-20 py-2', className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select className={cn(inputClass, 'appearance-none pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-[13px] font-medium text-muted">
        {label}
      </label>
      <div id={id}>{children}</div>
      {hint && <p className="text-xs text-subtle">{hint}</p>}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 text-sm">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative h-6 w-10 rounded-full transition', checked ? 'bg-primary' : 'bg-border-strong')}
      >
        <span
          className={cn(
            'absolute top-0.5 size-5 rounded-full bg-white shadow transition-all',
            checked ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </button>
    </label>
  );
}

/** Amount typed in rupees ("1,250.50"), stored in paise. */
export function MoneyInput({
  value,
  onChange,
  className,
  autoFocus,
  placeholder = '0',
}: {
  value: number | null;
  onChange: (paise: number | null) => void;
  className?: string;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(value == null ? '' : String(Math.abs(value) / 100));
  useEffect(() => {
    const current = parseRupees(text);
    if (value == null ? current !== null : current !== Math.abs(value)) {
      setText(value == null ? '' : String(Math.abs(value) / 100));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className={cn('relative', className)}>
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-subtle">₹</span>
      <input
        inputMode="decimal"
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={cn(inputClass, 'num pl-7')}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseRupees(e.target.value));
        }}
      />
    </div>
  );
}

export function parseRupees(text: string): number | null {
  const clean = text.replace(/[,₹\s]/g, '');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? Math.round(Math.abs(n) * 100) : null;
}

/** A centred dialog on desktop, a bottom sheet on phones. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            className={cn(
              'flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-border bg-surface-raised shadow-[var(--shadow-overlay)] sm:rounded-3xl',
              wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
            )}
          >
            <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
              <h2 className="text-xl font-bold">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-muted hover:bg-surface-muted">
                <X className="size-4" />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div className={cn('flex w-fit gap-1 rounded-full border border-border bg-surface p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex h-8 items-center gap-2 rounded-full px-3.5 text-sm transition',
            value === o.value ? 'bg-foreground text-background' : 'text-muted hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
