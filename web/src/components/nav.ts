import {
  ArrowRightLeft,
  CalendarClock,
  ChartPie,
  LayoutDashboard,
  PiggyBank,
  Settings,
  Target,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Short hint shown in the command palette. */
  hint: string;
  /** Shown in the bottom dock on narrow screens. */
  dock?: boolean;
};

export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Track',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, hint: 'This month at a glance', dock: true },
      { to: '/transactions', label: 'Transactions', icon: ArrowRightLeft, hint: 'Every rupee in and out', dock: true },
      { to: '/budget', label: 'Budget', icon: PiggyBank, hint: 'What is left to spend', dock: true },
      { to: '/reports', label: 'Reports', icon: ChartPie, hint: 'Where the money went', dock: true },
    ],
  },
  {
    title: 'Plan',
    items: [
      { to: '/bills', label: 'Bills & subscriptions', icon: CalendarClock, hint: 'What is due next' },
      { to: '/goals', label: 'Goals', icon: Target, hint: 'Saving for something' },
      { to: '/accounts', label: 'Accounts', icon: Wallet, hint: 'Balances and net worth', dock: true },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = { to: '/settings', label: 'Settings', icon: Settings, hint: 'Categories, data, AI' };

export const ALL_NAV: NavItem[] = [...NAV_SECTIONS.flatMap((s) => s.items), SETTINGS_ITEM];
