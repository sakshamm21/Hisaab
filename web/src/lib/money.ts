const cache = new Map<string, Intl.NumberFormat>();

function formatter(locale: string, currency: string, decimals: number, compact: boolean) {
  const key = `${locale}|${currency}|${decimals}|${compact}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: compact ? 0 : decimals,
      maximumFractionDigits: compact ? 1 : decimals,
      notation: compact ? 'compact' : 'standard',
    });
    cache.set(key, f);
  }
  return f;
}

export type MoneyOptions = {
  locale?: string;
  currency?: string;
  /** Show paise only when they aren't zero (default), always, or never. */
  decimals?: 'auto' | 'always' | 'never';
  compact?: boolean;
  /** Prefix + for money in. */
  signed?: boolean;
};

/** Format an amount stored in paise. en-IN gives Indian grouping: ₹1,23,456. */
export function formatMoney(minor: number, opts: MoneyOptions = {}): string {
  const { locale = 'en-IN', currency = 'INR', decimals = 'auto', compact = false, signed = false } = opts;
  const places = decimals === 'always' ? 2 : decimals === 'never' ? 0 : minor % 100 === 0 ? 0 : 2;
  const text = formatter(locale, currency, places, compact).format(Math.abs(minor) / 100);
  if (minor < 0) return `−${text}`;
  return signed && minor > 0 ? `+${text}` : text;
}
