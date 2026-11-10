import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'system';

type Preferences = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  privacy: boolean;
  togglePrivacy: () => void;
};

const Ctx = createContext<Preferences | null>(null);

function read(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: preference just isn't remembered */
  }
}

const systemDark = () => matchMedia('(prefers-color-scheme: dark)').matches;

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => read('hisaab-theme', 'system') as Theme);
  const [privacy, setPrivacy] = useState(() => read('hisaab-privacy', '0') === '1');

  useEffect(() => {
    const apply = () =>
      document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && systemDark()));
    apply();
    if (theme !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.classList.toggle('privacy', privacy);
  }, [privacy]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    write('hisaab-theme', t);
  }, []);

  const value = useMemo<Preferences>(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark'),
      privacy,
      togglePrivacy: () =>
        setPrivacy((p) => {
          write('hisaab-privacy', p ? '0' : '1');
          return !p;
        }),
    }),
    [theme, setTheme, privacy],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePreferences() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePreferences must be used inside PreferencesProvider');
  return ctx;
}
