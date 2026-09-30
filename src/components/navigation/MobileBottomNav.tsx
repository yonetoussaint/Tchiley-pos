import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { M3_FOCUS } from '../ui/focus';

export type MobileTab = {
  id: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  badge?: number;
  badgeTone?: 'default' | 'warn';
  onClick: () => void;
};

type MobileBottomNavProps = {
  tabs: MobileTab[];
  moreActive: boolean;
  onMore: () => void;
};

export function MobileBottomNav({ tabs, moreActive, onMore }: MobileBottomNavProps) {
  const all: MobileTab[] = [
    ...tabs,
    { id: 'plus', label: 'Plus', icon: MoreHorizontal, active: moreActive, onClick: onMore },
  ];

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-50 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-start gap-1 border-t border-[var(--m3-outline-variant)] bg-[var(--m3-surface-container)] px-2 pt-2 md:hidden"
    >
      {all.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={tab.onClick}
            aria-current={tab.active ? 'page' : undefined}
            className={`flex h-14 min-w-0 flex-1 flex-col items-center gap-1 text-xs font-medium ${
              tab.active ? 'text-[var(--m3-on-surface)]' : 'text-[var(--m3-on-surface-variant)]'
            } ${M3_FOCUS}`}
          >
            <span
              className={
                'relative flex h-8 w-16 items-center justify-center rounded-full m3-morph ' +
                (tab.active ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]' : '')
              }
            >
              <Icon size={22} />
              {!!tab.badge && (
                <span
                  className={
                    'absolute right-2 top-0 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium ' +
                    (tab.badgeTone === 'warn' ? 'bg-[#BA1A1A] text-white' : 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]')
                  }
                >
                  {tab.badge}
                </span>
              )}
            </span>
            <span className="max-w-full truncate">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
