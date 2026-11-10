import {
  ArrowRightLeft,
  BadgePercent,
  Bike,
  Briefcase,
  Car,
  Circle,
  CircleHelp,
  Clapperboard,
  Fuel,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  PiggyBank,
  Plane,
  Plus,
  Receipt,
  Repeat,
  Shapes,
  Shield,
  ShoppingBag,
  ShoppingBasket,
  TrendingUp,
  Undo2,
  Utensils,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '../lib/cn';

// Category icons are stored by lucide name in the database. Only the ones we offer are bundled.
const ICONS: Record<string, LucideIcon> = {
  'badge-percent': BadgePercent,
  bike: Bike,
  briefcase: Briefcase,
  car: Car,
  circle: Circle,
  'circle-help': CircleHelp,
  clapperboard: Clapperboard,
  fuel: Fuel,
  gift: Gift,
  'graduation-cap': GraduationCap,
  'heart-pulse': HeartPulse,
  house: House,
  landmark: Landmark,
  laptop: Laptop,
  'piggy-bank': PiggyBank,
  plane: Plane,
  plus: Plus,
  receipt: Receipt,
  repeat: Repeat,
  shapes: Shapes,
  shield: Shield,
  'shopping-bag': ShoppingBag,
  'shopping-basket': ShoppingBasket,
  'trending-up': TrendingUp,
  'undo-2': Undo2,
  utensils: Utensils,
  transfer: ArrowRightLeft,
};

export function CategoryIcon({
  icon,
  color,
  className,
}: {
  icon: string | null;
  color: string | null;
  className?: string;
}) {
  const Icon = ICONS[icon ?? ''] ?? CircleHelp;
  const c = color ?? '#8b8693';
  return (
    <span
      className={cn('grid size-9 shrink-0 place-items-center rounded-xl', className)}
      style={{ backgroundColor: `color-mix(in srgb, ${c} 16%, transparent)`, color: c }}
    >
      <Icon className="size-[18px]" strokeWidth={1.9} />
    </span>
  );
}
