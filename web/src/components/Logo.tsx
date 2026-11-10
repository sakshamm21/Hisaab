import { cn } from '../lib/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn('size-8', className)}>
      <rect width="64" height="64" rx="18" className="fill-primary" />
      <path
        d="M20 18v28M44 18v28M20 32h24"
        className="stroke-primary-foreground"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="49" cy="15" r="5" className="fill-highlight" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-[22px] font-bold tracking-tight">
        hisaab<span className="text-primary">.</span>
      </span>
    </span>
  );
}
