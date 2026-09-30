import { useEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent as ReactTouchEvent } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  MapPin,
  Menu,
  RotateCcw,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { M3_FOCUS } from './focus';
import { M3_VARS } from './theme';
import { dayKey, isSameDay } from '../../shared/dates';
import type { Branch } from '../../shared/types';

export type HeaderStat = {
  id: string;
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: 'default' | 'warn';
  onClick?: () => void;
};

export function relativeDayLabel(d: Date) {
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, now)) return "Aujourd'hui";
  if (isSameDay(d, yesterday)) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long' });
}

export function shortBranchName(b: Branch) {
  return b.nom.replace('Tchiley Construction', '').trim() || b.nom;
}

const WEEKDAY_INITIALS_FR = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export function DatePicker({
  selectedDate,
  onSelect,
  salesDays,
  block = false,
  renderTrigger,
}: {
  selectedDate: Date;
  onSelect: (date: Date) => void;
  salesDays: Set<string>;
  block?: boolean;
  renderTrigger?: (p: { open: boolean; toggle: () => void }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);
  const sheetTouchStart = (e: ReactTouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const sheetTouchEnd = (e: ReactTouchEvent) => {
    if (touchStartY.current !== null && e.changedTouches[0].clientY - touchStartY.current > 60) setOpen(false);
    touchStartY.current = null;
  };

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const leadingBlanks = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  const canGoNextMonth = new Date(year, month + 1, 1) <= today;

  const toggleOpen = () => {
    if (!open) setViewMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    setOpen((prev) => !prev);
  };

  const pickDate = (date: Date) => {
    onSelect(date);
    setOpen(false);
  };

  const m3Nav =
    'flex h-10 w-10 items-center justify-center rounded-full text-[var(--m3-on-surface-variant)] transition-colors hover:bg-[var(--m3-surface-container-highest)] active:bg-[var(--m3-surface-container-highest)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ' +
    M3_FOCUS;

  return (
    <div ref={containerRef} className={renderTrigger ? 'relative shrink-0' : block ? 'relative min-w-0 flex-1 md:flex-none' : 'relative'}>
      {renderTrigger ? renderTrigger({ open, toggle: toggleOpen }) : (
        <button
          type="button"
          onClick={toggleOpen}
          aria-haspopup="dialog"
          aria-expanded={open}
          title={selectedDate.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
          className={
            'flex items-center gap-2 whitespace-nowrap rounded-full border-0 px-4 text-sm font-medium text-[var(--m3-on-surface)] transition-colors md:h-10 ' +
            (block ? 'h-10 w-full justify-center md:w-auto ' : 'h-8 ') +
            (open
              ? 'bg-[var(--m3-secondary-container)] '
              : 'bg-[var(--m3-surface-container-high)] hover:bg-[var(--m3-surface-container-highest)] ') +
            M3_FOCUS
          }
        >
          <CalendarDays size={16} className="text-[var(--m3-primary)]" />
          <span className="capitalize">
            {selectedDate.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}
          </span>
        </button>
      )}

      {open && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="m3-scrim fixed inset-0 z-[80] bg-black/40 md:hidden"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Choisir une date"
            style={M3_VARS}
            className={
              'm3-sheet fixed inset-x-0 bottom-0 z-[81] max-h-[90vh] w-full overflow-y-auto rounded-t-[28px] bg-[var(--m3-surface-container-low)] pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 text-[var(--m3-on-surface)] shadow-[0_-8px_24px_rgba(0,0,0,0.16)] ' +
              'md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-full md:z-50 md:mt-2 md:max-h-none md:w-[328px] md:overflow-visible md:rounded-[28px] md:p-3 md:shadow-[0_8px_10px_-6px_rgba(0,0,0,0.2),0_16px_24px_2px_rgba(0,0,0,0.14)]'
            }
          >
            <div className="md:hidden" onTouchStart={sheetTouchStart} onTouchEnd={sheetTouchEnd}>
              <div className="mx-auto mb-3 mt-1 h-1 w-8 rounded-full bg-[var(--m3-outline-variant)]" />
              <div className="px-6 pb-3">
                <div className="text-xs font-medium text-[var(--m3-on-surface-variant)]">Sélectionner une date</div>
                <div className="mt-2 text-[28px] font-normal capitalize leading-9">
                  {selectedDate.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                </div>
              </div>
            </div>
            <div className="mb-1 h-px bg-[var(--m3-outline-variant)] md:hidden" />

            <div className="px-3 md:px-0">
              <div className="mb-2 flex items-center justify-between md:mb-2">
                <div className="pl-3 text-sm font-medium capitalize">
                  {viewMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                </div>
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setViewMonth(new Date(year, month - 1, 1))}
                    className={m3Nav}
                    aria-label="Mois précédent"
                  >
                    <ChevronRight size={20} className="rotate-180" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMonth(new Date(year, month + 1, 1))}
                    disabled={!canGoNextMonth}
                    className={m3Nav}
                    aria-label="Mois suivant"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>

              <div className="mb-1 grid grid-cols-7 text-center text-xs font-medium text-[var(--m3-on-surface)]">
                {WEEKDAY_INITIALS_FR.map((label, index) => (
                  <div key={index} className="flex h-10 items-center justify-center">{label}</div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {cells.map((date, index) => {
                  if (!date) return <div key={`blank-${index}`} />;
                  const isFuture = date > today;
                  const isSelected = isSameDay(date, selectedDate);
                  const isToday = isSameDay(date, today);
                  const hasSales = salesDays.has(dayKey(date));
                  return (
                    <div key={dayKey(date)} className="flex items-center justify-center">
                      <button
                        type="button"
                        disabled={isFuture}
                        onClick={() => pickDate(date)}
                        aria-label={date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        aria-pressed={isSelected}
                        className={
                          'relative flex h-10 w-10 items-center justify-center rounded-full border text-sm tabular-nums transition-colors ' +
                          M3_FOCUS + ' ' +
                          (isFuture
                            ? 'cursor-not-allowed border-transparent text-[var(--m3-on-surface)] opacity-40'
                            : isSelected
                            ? 'border-[var(--m3-primary)] bg-[var(--m3-primary)] font-medium text-[var(--m3-on-primary)]'
                            : isToday
                            ? 'border-[var(--m3-outline)] font-medium text-[var(--m3-primary)] hover:bg-[var(--m3-surface-container-highest)]'
                            : 'border-transparent hover:bg-[var(--m3-surface-container-highest)]')
                        }
                      >
                        {date.getDate()}
                        {hasSales && (
                          <span
                            className={
                              'absolute bottom-1 h-1 w-1 rounded-full ' +
                              (isSelected ? 'bg-[var(--m3-on-primary)]' : isFuture ? 'bg-[var(--m3-outline)]' : 'bg-[var(--m3-primary)]')
                            }
                          />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between gap-2 px-3 pb-1">
              <span className="flex items-center gap-1.5 pl-3 text-xs text-[var(--m3-on-surface-variant)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--m3-primary)]" />
                Jour avec ventes
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => pickDate(new Date())}
                  className={`h-10 rounded-full px-3 text-sm font-medium text-[var(--m3-primary)] hover:bg-[var(--m3-surface-container-highest)] active:bg-[var(--m3-surface-container-highest)] ${M3_FOCUS}`}
                >
                  Aujourd'hui
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className={`h-10 rounded-full px-3 text-sm font-medium text-[var(--m3-primary)] hover:bg-[var(--m3-surface-container-highest)] active:bg-[var(--m3-surface-container-highest)] ${M3_FOCUS}`}
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function DayStrip({
  selectedDate,
  onSelect,
  salesDays,
}: {
  selectedDate: Date;
  onSelect: (d: Date) => void;
  salesDays: Set<string>;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const selKey = dayKey(selectedDate);
  const todayKey = dayKey(new Date());

  const days = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const list: Date[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(t);
      d.setDate(t.getDate() - i);
      list.push(d);
    }
    if (selectedDate < list[0]) list.unshift(new Date(selectedDate));
    return list;
  }, [selKey, todayKey, selectedDate]);

  useEffect(() => {
    const box = scrollerRef.current;
    if (!box) return;
    const el = box.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!el) return;
    box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' });
  }, [selKey]);

  return (
    <div ref={scrollerRef} className="relative flex min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {days.map((d) => {
        const selected = isSameDay(d, selectedDate);
        const isToday = isSameDay(d, new Date());
        const hasSales = salesDays.has(dayKey(d));
        return (
          <button
            key={dayKey(d)}
            type="button"
            onClick={() => onSelect(d)}
            aria-pressed={selected}
            aria-label={d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            className={
              'relative flex h-12 w-[46px] shrink-0 flex-col items-center justify-center rounded-[16px] m3-press motion-reduce:transition-none ' +
              (selected
                ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]'
                : isToday
                ? 'border border-[var(--m3-outline)] text-[var(--m3-on-surface)]'
                : 'bg-[var(--m3-surface-container)] text-[var(--m3-on-surface)]') +
              ' ' + M3_FOCUS
            }
          >
            <span className="text-[11px] leading-none opacity-80">
              {d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')}
            </span>
            <span className="mt-1 text-base font-medium leading-none tabular-nums">{d.getDate()}</span>
            {hasSales && (
              <span
                className={'absolute bottom-[3px] h-1 w-1 rounded-full ' + (selected ? 'bg-[var(--m3-on-primary)]' : 'bg-[var(--m3-primary)]')}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export type BranchSwitcher = { branches: Branch[]; activeId: string; onChange: (id: string) => void };

export function BranchHeaderCards({
  branch,
  title,
  onMenu,
  date,
  stats,
  branchSwitcher,
  compact = false,
}: {
  branch: Branch;
  title: string;
  onMenu: () => void;
  compact?: boolean;
  date: {
    selectedDate: Date;
    onSelect: (d: Date) => void;
    salesDays: Set<string>;
    isToday: boolean;
  } | null;
  stats: HeaderStat[];
  branchSwitcher?: BranchSwitcher;
}) {
  const isOpen = branch.statut === 'Ouvert';
  const dot = (
    <span className={'h-2 w-2 shrink-0 rounded-full ' + (isOpen ? 'bg-[var(--m3-primary)]' : 'bg-[var(--m3-outline)]')} />
  );

  return (
    <>
      <header className="sticky top-0 z-[60] -mx-4 -mt-5 mb-3 shrink-0 border-b border-[var(--m3-outline-variant)] bg-[var(--m3-surface)] pt-[env(safe-area-inset-top)] md:hidden">
        <div className="flex h-14 items-center gap-1 px-2">
          <button
            type="button"
            onClick={onMenu}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--m3-on-surface)] active:bg-[var(--m3-surface-container-highest)] m3-press motion-reduce:transition-none ${M3_FOCUS}`}
            aria-label="Ouvrir le menu"
          >
            <Menu size={24} />
          </button>

          <div className="min-w-0 flex-1 px-1">
            <h1 className="truncate text-[22px] font-medium leading-7">{title}</h1>
            {branchSwitcher ? (
              <label className="relative -my-1 flex w-fit max-w-full items-center gap-1.5 py-1 text-xs text-[var(--m3-on-surface-variant)]">
                {dot}
                <span className="truncate">{shortBranchName(branch)}</span>
                <span className="sr-only">{branch.statut}</span>
                <ChevronDown size={14} className="shrink-0" />
                <select
                  aria-label="Changer de succursale"
                  value={branchSwitcher.activeId}
                  onChange={(event) => branchSwitcher.onChange(event.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                >
                  {branchSwitcher.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {shortBranchName(b)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-[var(--m3-on-surface-variant)]">
                {dot}
                <span className="truncate">{shortBranchName(branch)}</span>
                <span className="sr-only">{branch.statut}</span>
              </div>
            )}
          </div>

          {date && !date.isToday && (
            <button
              type="button"
              onClick={() => date.onSelect(new Date())}
              className={`mr-1 flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[var(--m3-tertiary-container)] px-3 text-sm font-medium text-[var(--m3-on-tertiary-container)] m3-press motion-reduce:transition-none ${M3_FOCUS}`}
            >
              <RotateCcw size={16} />
              Aujourd'hui
            </button>
          )}
        </div>

        {date && (
          <div className="flex items-center gap-2 px-4 pb-2">
            <DatePicker
              selectedDate={date.selectedDate}
              onSelect={date.onSelect}
              salesDays={date.salesDays}
              renderTrigger={({ open, toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  aria-haspopup="dialog"
                  aria-expanded={open}
                  aria-label="Ouvrir le calendrier"
                  className={
                    'flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[16px] text-[var(--m3-on-secondary-container)] m3-press motion-reduce:transition-none ' +
                    (open ? 'bg-[var(--m3-primary-container)]' : 'bg-[var(--m3-secondary-container)]') +
                    ' ' + M3_FOCUS
                  }
                >
                  <CalendarDays size={18} />
                  <span className="text-[11px] font-medium leading-none">
                    {date.selectedDate.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}
                  </span>
                </button>
              )}
            />
            <DayStrip selectedDate={date.selectedDate} onSelect={date.onSelect} salesDays={date.salesDays} />
          </div>
        )}
      </header>

      {!compact && stats.length > 0 && (
        <section aria-label="Chiffres clés" className="mb-4 grid shrink-0 grid-cols-2 gap-2 md:hidden">
          {stats.map((s) => {
            const Icon = s.icon;
            const warn = s.tone === 'warn';
            const cls =
              'flex min-w-0 flex-col gap-1 rounded-[20px] p-3 text-left ' +
              (warn ? 'bg-[#FFE08B] text-[#251A00]' : 'bg-[var(--m3-surface-container)]') +
              (s.onClick ? ' m3-press-card motion-reduce:transition-none ' + M3_FOCUS : '');
            const body = (
              <>
                <span className="flex items-center gap-1.5 text-xs opacity-80">
                  <Icon size={14} /> {s.label}
                </span>
                <span className="truncate text-lg font-medium leading-tight">{s.value}</span>
                {s.hint && <span className="truncate text-[11px] opacity-70">{s.hint}</span>}
              </>
            );
            return s.onClick ? (
              <button key={s.id} type="button" onClick={s.onClick} className={cls}>
                {body}
              </button>
            ) : (
              <div key={s.id} className={cls}>
                {body}
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}

export type DrawerChild = { id: string; label: string; short?: string; active: boolean; onClick: () => void };
export type DrawerItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  badge?: number;
  expanded?: boolean;
  children?: DrawerChild[];
  onClick: () => void;
};
export type DrawerGroup = { label: string; items: DrawerItem[] };
export type DrawerAction = { label: string; icon: LucideIcon; onClick: () => void };

export function MobileNavDrawer({
  open,
  onClose,
  branch,
  groups,
  stockAlerts,
  onStockAlerts,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  branch: Branch;
  groups: DrawerGroup[];
  stockAlerts: number;
  onStockAlerts: () => void;
  actions: DrawerAction[];
}) {
  const name = shortBranchName(branch);
  const isOpen = branch.statut === 'Ouvert';
  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={
          'fixed inset-0 z-[65] bg-black/40 transition-opacity duration-200 motion-reduce:transition-none md:hidden ' +
          (open ? 'opacity-100' : 'pointer-events-none opacity-0')
        }
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu de la succursale"
        aria-hidden={!open}
        className={
          'fixed inset-y-0 left-0 z-[70] flex w-80 max-w-[88vw] flex-col rounded-r-[28px] bg-[var(--m3-surface-container-low)] text-[var(--m3-on-surface)] shadow-[0_8px_10px_-6px_rgba(0,0,0,0.2),0_16px_24px_2px_rgba(0,0,0,0.14)] transition-[transform,visibility] duration-200 motion-reduce:transition-none md:hidden ' +
          (open ? 'visible translate-x-0' : 'invisible -translate-x-full')
        }
      >
        <div className="flex items-start gap-3 px-5 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--m3-primary-container)] text-lg font-medium text-[var(--m3-on-primary-container)]">
            {name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-medium leading-6">{name}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--m3-on-surface-variant)]">
              <span className={'h-2 w-2 rounded-full ' + (isOpen ? 'bg-[var(--m3-primary)]' : 'bg-[var(--m3-outline)]')} />
              {branch.statut}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--m3-on-surface-variant)] active:bg-[var(--m3-surface-container-highest)] ${M3_FOCUS}`}
            aria-label="Fermer le menu"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mx-5 mb-3 space-y-1 text-xs text-[var(--m3-on-surface-variant)]">
          <div className="flex items-center gap-1.5">
            <MapPin size={14} className="shrink-0" />
            <span className="truncate">{branch.ville}, {branch.adresse}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <UserRound size={14} className="shrink-0" />
            <span className="truncate">Responsable : {branch.gestionnaire}</span>
          </div>
        </div>

        {stockAlerts > 0 && (
          <button
            type="button"
            onClick={onStockAlerts}
            className={`mx-3 mb-1 flex shrink-0 items-center gap-3 rounded-2xl bg-[#FFE08B] px-4 py-3 text-left text-sm text-[#251A00] m3-press-card motion-reduce:transition-none ${M3_FOCUS}`}
          >
            <AlertTriangle size={18} className="shrink-0" />
            <span className="flex-1 font-medium">
              {stockAlerts} article{stockAlerts > 1 ? 's' : ''} en stock bas
            </span>
            <ChevronRight size={16} className="shrink-0" />
          </button>
        )}

        <nav aria-label="Sections" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="px-4 pb-1 pt-4 text-xs font-medium text-[var(--m3-on-surface-variant)]">{group.label}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.id} className="mb-0.5">
                    <button
                      type="button"
                      onClick={item.onClick}
                      aria-current={item.active ? 'page' : undefined}
                      aria-expanded={item.children ? !!item.expanded : undefined}
                      className={
                        'flex h-14 w-full items-center gap-3 rounded-full px-4 text-left text-sm font-medium m3-press motion-reduce:transition-none ' +
                        (item.active
                          ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
                          : 'text-[var(--m3-on-surface-variant)] active:bg-[var(--m3-surface-container-highest)]') +
                        ' ' + M3_FOCUS
                      }
                    >
                      <Icon size={22} className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {!!item.badge && (
                        <span className="rounded-full bg-[var(--m3-primary)] px-2 py-0.5 text-xs text-[var(--m3-on-primary)]">
                          {item.badge}
                        </span>
                      )}
                      {item.children && (
                        <ChevronDown size={18} className={'shrink-0 transition-transform ' + (item.expanded ? 'rotate-180' : '')} />
                      )}
                    </button>
                    {item.children && item.expanded && (
                      <div className="ml-9 mt-1 border-l-2 border-[var(--m3-outline-variant)] pl-2">
                        {item.children.map((child) => (
                          <button
                            key={child.id}
                            type="button"
                            onClick={child.onClick}
                            className={
                              'mb-0.5 flex h-12 w-full items-center rounded-full px-4 text-left text-sm ' +
                              (child.active
                                ? 'bg-[var(--m3-secondary-container)] font-medium text-[var(--m3-on-secondary-container)]'
                                : 'text-[var(--m3-on-surface-variant)] active:bg-[var(--m3-surface-container-highest)]') +
                              ' ' + M3_FOCUS
                            }
                          >
                            {child.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        {actions.length > 0 && (
          <div className="shrink-0 border-t border-[var(--m3-outline-variant)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {actions.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.label}
                  type="button"
                  onClick={a.onClick}
                  className={`flex h-12 w-full items-center gap-3 rounded-full px-4 text-left text-sm font-medium text-[var(--m3-on-surface-variant)] active:bg-[var(--m3-surface-container-highest)] ${M3_FOCUS}`}
                >
                  <Icon size={20} className="shrink-0" />
                  {a.label}
                </button>
              );
            })}
          </div>
        )}
      </aside>
    </>
  );
}
