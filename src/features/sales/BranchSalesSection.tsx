import { Fragment, useMemo, useState } from 'react';
import { Banknote, CalendarDays, Check, Coins, Eye, Printer, Receipt, Search, ShoppingCart, Tag, TrendingUp, Undo2, UserRound, X, type LucideIcon } from 'lucide-react';
import { M3_FOCUS } from '../../components/ui/focus';
import { M3StateLayer, M3_VARS } from '../../components/ui/theme';
import type { Product } from '../products/types';
import { PAYMENT_METHODS } from './paymentMethods';
import { creditBalance, creditPaid } from './creditUtils';
import { ReceiptModal as SalesReceiptModal } from './ReceiptModal';
import type { SaleLine, SaleRecord } from './types';
import { fmtHTG } from '../../shared/currency';
import { dayKey, fmtTime12, isSameDay } from '../../shared/dates';

type SalesRangeId = 'day' | '7d' | 'month' | 'custom';

const salesStartOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const salesAddDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const toDateInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromDateInput = (value: string) => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/* `sales` = toutes les ventes de la succursale ; la période affichée est calculée ici,
   ancrée sur la date choisie dans le sélecteur de date de l'en-tête. */
export function BranchSalesSection({
  sales: allSales,
  products,
  showMargin = true,
  selectedDate,
  onCancelSale,
}: {
  sales: SaleRecord[];
  products: Product[];
  /** Affiche la marge brute (prix de vente net − prix d'achat). */
  showMargin?: boolean;
  selectedDate: Date;
  onCancelSale: (sale: SaleRecord) => void;
}) {
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [rangeId, setRangeId] = useState<SalesRangeId>('day');
  const [customFrom, setCustomFrom] = useState(() => toDateInput(salesAddDays(selectedDate, -6)));
  const [customTo, setCustomTo] = useState(() => toDateInput(selectedDate));

  const { rangeStart, rangeEnd } = useMemo(() => {
    const day = salesStartOfDay(selectedDate);
    if (rangeId === 'day') return { rangeStart: day, rangeEnd: day };
    if (rangeId === '7d') return { rangeStart: salesAddDays(day, -6), rangeEnd: day };
    if (rangeId === 'month') {
      return {
        rangeStart: new Date(day.getFullYear(), day.getMonth(), 1),
        rangeEnd: new Date(day.getFullYear(), day.getMonth() + 1, 0),
      };
    }
    let a = customFrom ? fromDateInput(customFrom) : day;
    let b = customTo ? fromDateInput(customTo) : a;
    if (a.getTime() > b.getTime()) [a, b] = [b, a];
    return { rangeStart: a, rangeEnd: b };
  }, [rangeId, selectedDate, customFrom, customTo]);

  const multiDay = !isSameDay(rangeStart, rangeEnd);
  const sales = useMemo(() => {
    const from = rangeStart.getTime();
    const to = salesAddDays(rangeEnd, 1).getTime();
    return allSales.filter((v) => v.date.getTime() >= from && v.date.getTime() < to);
  }, [allSales, rangeStart, rangeEnd]);

  const isSelectedToday = isSameDay(selectedDate, new Date());
  const rangeOptions: Array<{ id: SalesRangeId; label: string }> = [
    { id: 'day', label: isSelectedToday ? "Aujourd'hui" : 'Ce jour' },
    { id: '7d', label: '7 jours' },
    { id: 'month', label: 'Ce mois' },
    { id: 'custom', label: 'Personnalisé' },
  ];
  const shortDate = (d: Date, withYear = false) =>
    d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
  const rangeLabel = multiDay
    ? `${shortDate(rangeStart, rangeStart.getFullYear() !== rangeEnd.getFullYear())} – ${shortDate(rangeEnd, true)}`
    : selectedDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const [receiptSale, setReceiptSale] = useState<SaleRecord | null>(null);
  const [saleToCancel, setSaleToCancel] = useState<{ sale: SaleRecord; number: number } | null>(null);

  const paymentLabel = (id: string) => PAYMENT_METHODS.find((m) => m.id === id)?.label || id;
  const qtyOf = (sale: SaleRecord) => sale.lignes.reduce((n, l) => n + l.qte, 0);

  /* Marge brute d'une vente = total net (remise déduite) − Σ prix d'achat × quantité.
     Le coût figé sur la ligne (cout) est prioritaire ; sinon on retombe sur le prix d'achat actuel du produit.
     Un prix d'achat absent ou à 0 rend la marge inconnue plutôt que de la gonfler. */
  const unitCost = (l: SaleLine): number | null => {
    const unit = l.cout ?? products.find((p) => (l.produitId ? p.id === l.produitId : p.nom === l.nom))?.prixAchat;
    return unit != null && unit > 0 ? unit : null;
  };
  const marginOf = (sale: SaleRecord): { margin: number; pct: number | null } | null => {
    let cost = 0;
    for (const l of sale.lignes) {
      const unit = unitCost(l);
      if (unit == null) return null;
      cost += unit * l.qte;
    }
    const margin = sale.total - cost;
    return { margin, pct: sale.total > 0 ? (margin / sale.total) * 100 : null };
  };
  const fmtPct = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString('fr-FR')} %`;
  const fmtSigned = (n: number) => `${n < 0 ? '− ' : ''}${fmtHTG(Math.abs(n))}`;
  const marginTone = (n: number) => (n < 0 ? 'text-[#BA1A1A]' : 'text-[#2F6B4F]');

  // Number sales chronologically within each day (1 = first sale of that day), then show newest first.
  const numbered = useMemo(() => {
    const counters = new Map<string, number>();
    return [...sales]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((sale) => {
        const key = dayKey(sale.date);
        const number = (counters.get(key) ?? 0) + 1;
        counters.set(key, number);
        return { sale, number };
      })
      .reverse();
  }, [sales]);

  const query = search.trim().toLowerCase();
  const rows = numbered.filter(({ sale, number }) => {
    if (paymentFilter !== 'all' && sale.paiement !== paymentFilter) return false;
    if (!query) return true;
    const haystack = [
      String(number),
      fmtTime12(sale.date),
      paymentLabel(sale.paiement),
      sale.client ?? '',
      sale.statut === 'annulee' ? 'annulée annulee' : 'validée validee',
      String(sale.total),
      (sale.remise ?? 0) > 0 ? `remise ${sale.remise}` : '',
      ...sale.lignes.map((l) => l.nom),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });

  const countedRows = rows.filter(({ sale }) => sale.statut !== 'annulee');
  const totalQty = countedRows.reduce((sum, { sale }) => sum + qtyOf(sale), 0);
  const totalAmount = countedRows.reduce((sum, { sale }) => sum + sale.total, 0);
  const totalDiscount = countedRows.reduce((sum, { sale }) => sum + (sale.remise ?? 0), 0);
  const isFiltering = query !== '' || paymentFilter !== 'all';

  let totalMargin = 0;
  let marginBase = 0;
  let marginUnknown = 0;
  const dayStats = new Map<string, { count: number; total: number; margin: number; hasMargin: boolean }>();
  countedRows.forEach(({ sale }) => {
    const key = dayKey(sale.date);
    const cur = dayStats.get(key) ?? { count: 0, total: 0, margin: 0, hasMargin: false };
    const m = marginOf(sale);
    if (m) {
      totalMargin += m.margin;
      marginBase += sale.total;
    } else {
      marginUnknown += 1;
    }
    dayStats.set(key, {
      count: cur.count + 1,
      total: cur.total + sale.total,
      margin: cur.margin + (m?.margin ?? 0),
      hasMargin: cur.hasMargin || m != null,
    });
  });
  const marginPct = marginBase > 0 ? (totalMargin / marginBase) * 100 : null;
  const colCount = showMargin ? 11 : 10;
  const isFirstOfDay = (index: number) =>
    multiDay && (index === 0 || dayKey(rows[index - 1].sale.date) !== dayKey(rows[index].sale.date));
  const dayTitle = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const emptyText = multiDay ? 'Aucune vente pour cette période.' : 'Aucune vente pour cette date.';
  const totalLabel = isFiltering ? 'Total (résultats)' : multiDay ? 'Total de la période' : 'Total du jour';

  const printSale = (sale: SaleRecord) => {
    setReceiptSale(sale);
    window.setTimeout(() => window.print(), 150);
  };

  const paymentIcon = (id: string) => PAYMENT_METHODS.find((m) => m.id === id)?.icon ?? Banknote;
  const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? 's' : ''}`;

  const deskIconBtn = `group relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] disabled:cursor-not-allowed ${M3_FOCUS}`;

  return (
    <div
      style={M3_VARS}
      className="-mx-4 -mb-5 min-h-[calc(100dvh-8rem)] bg-[var(--m3-surface)] px-4 pb-8 pt-4 font-sans text-[var(--m3-on-surface)] sm:mx-0 sm:mb-0 sm:min-h-0 sm:bg-transparent sm:p-0"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-5">
        <div className="min-w-0">
          <h2 className="text-[32px] font-bold leading-10 tracking-tight">Ventes</h2>
          <div className="text-sm capitalize text-[var(--m3-on-surface-variant)]">{rangeLabel}</div>
        </div>
        <span className="hidden h-8 items-center rounded-full bg-[var(--m3-secondary-container)] px-3.5 text-sm font-medium tabular-nums text-[var(--m3-on-secondary-container)] sm:inline-flex" aria-live="polite">
          {plural(rows.length, 'vente')}
        </span>
      </div>

      {/* ── Période : Aujourd'hui / 7 jours / Ce mois / Personnalisé ── */}
      <div className="mb-4 space-y-3 sm:mb-5">
        <div
          role="group"
          aria-label="Choisir la période"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {rangeOptions.map((option) => {
            const selected = rangeId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setRangeId(option.id)}
                className={`group relative shrink-0 before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] ${M3_FOCUS}`}
              >
                <span
                  className={`relative flex h-10 items-center gap-2 overflow-hidden px-4 text-sm font-medium m3-morph ${
                    selected ? 'rounded-full' : 'rounded-xl'
                  } ${
                    selected
                      ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
                      : 'border border-[var(--m3-outline)] text-[var(--m3-on-surface-variant)]'
                  }`}
                >
                  <M3StateLayer />
                  {selected ? <Check size={16} /> : option.id === 'custom' ? <CalendarDays size={16} /> : null}
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>

        {rangeId === 'custom' && (
          <div className="m3-in flex flex-wrap items-center gap-3">
            {[
              { id: 'sales-from', label: 'Du', value: customFrom, set: setCustomFrom, max: customTo || undefined, min: undefined as string | undefined },
              { id: 'sales-to', label: 'Au', value: customTo, set: setCustomTo, min: customFrom || undefined, max: undefined as string | undefined },
            ].map((field) => (
              <label
                key={field.id}
                htmlFor={field.id}
                className="flex h-12 min-w-[160px] flex-1 items-center gap-3 rounded-full bg-[var(--m3-surface-container-high)] px-4 text-sm text-[var(--m3-on-surface-variant)] focus-within:ring-2 focus-within:ring-[var(--m3-primary)] sm:max-w-[240px]"
              >
                <span className="shrink-0 font-medium">{field.label}</span>
                <input
                  id={field.id}
                  type="date"
                  value={field.value}
                  min={field.min}
                  max={field.max}
                  onChange={(event) => field.set(event.target.value)}
                  className="w-full min-w-0 border-none bg-transparent text-base text-[var(--m3-on-surface)] outline-none sm:text-sm"
                />
              </label>
            ))}
          </div>
        )}
      </div>

      {/* ── Phone (M3 Expressive): summary hero, search, payment chips, sale cards ── */}
      <section
        aria-label="Résumé des ventes"
        className="m3-in mb-4 overflow-hidden rounded-[32px] bg-[var(--m3-primary-container)] p-5 text-[var(--m3-on-primary-container)] sm:hidden"
      >
        <div className="text-sm font-medium opacity-80">{totalLabel}</div>
        <div className="mt-1 text-[40px] font-bold leading-[48px] tracking-tight tabular-nums">{fmtHTG(totalAmount)}</div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-[var(--m3-primary)] px-3.5 py-1.5 text-xs font-semibold text-[var(--m3-on-primary)]">
            {plural(countedRows.length, 'vente')}
          </span>
          <span className="rounded-full bg-[var(--m3-surface-container-lowest)] px-3.5 py-1.5 text-xs font-semibold text-[var(--m3-on-surface)]">
            {plural(totalQty, 'article')}
          </span>
          {showMargin && marginBase > 0 && (
            <span className="rounded-full bg-[#D7EBDD] px-3.5 py-1.5 text-xs font-semibold text-[#0F2E1C]">
              Marge {fmtSigned(totalMargin)}
              {marginPct != null ? ` · ${fmtPct(marginPct)}` : ''}
            </span>
          )}
          {totalDiscount > 0 && (
            <span className="rounded-full bg-[var(--m3-tertiary-container)] px-3.5 py-1.5 text-xs font-semibold text-[var(--m3-on-tertiary-container)]">
              Remises − {fmtHTG(totalDiscount)}
            </span>
          )}
          {rows.length > countedRows.length && (
            <span className="rounded-full bg-[#FFDAD6] px-3.5 py-1.5 text-xs font-semibold text-[#410002]">
              {rows.length - countedRows.length} annulée{rows.length - countedRows.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </section>

      <div className="mb-3 flex h-14 items-center gap-3 rounded-full bg-[var(--m3-surface-container-high)] px-4 focus-within:ring-2 focus-within:ring-[var(--m3-primary)] sm:hidden">
        <Search className="h-6 w-6 shrink-0 text-[var(--m3-on-surface-variant)]" />
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher une vente..."
          aria-label="Rechercher une vente"
          className="w-full min-w-0 border-none bg-transparent text-base text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)]"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="Effacer la recherche"
            className={`group relative -mr-2 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}
          >
            <M3StateLayer />
            <X size={20} />
          </button>
        )}
      </div>

      <div
        role="group"
        aria-label="Filtrer par mode de paiement"
        className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden"
      >
        {[{ id: 'all', label: 'Tous', icon: null as LucideIcon | null }, ...PAYMENT_METHODS].map((method) => {
          const selected = paymentFilter === method.id;
          const Icon = method.icon;
          return (
            <button
              key={method.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setPaymentFilter(method.id)}
              className={`group relative shrink-0 before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] ${M3_FOCUS}`}
            >
              <span
                className={`relative flex h-10 items-center gap-2 overflow-hidden px-4 text-sm font-medium m3-morph ${
                  selected ? 'rounded-full' : 'rounded-xl'
                } ${
                  selected
                    ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
                    : 'border border-[var(--m3-outline)] text-[var(--m3-on-surface-variant)]'
                }`}
              >
                <M3StateLayer />
                {selected ? <Check size={16} /> : Icon ? <Icon size={16} /> : null}
                {method.label}
              </span>
            </button>
          );
        })}
      </div>

      <ul className="space-y-3 sm:hidden" aria-label="Liste des ventes">
        {rows.map(({ sale, number }, rowIndex) => {
          const cancelled = sale.statut === 'annulee';
          const PayIcon = paymentIcon(sale.paiement);
          const discount = sale.remise ?? 0;
          const pct = discount > 0 ? Math.round((discount / (sale.total + discount)) * 1000) / 10 : 0;
          const dayHeader = isFirstOfDay(rowIndex) ? dayStats.get(dayKey(sale.date)) ?? { count: 0, total: 0, margin: 0, hasMargin: false } : null;
          const saleMargin = showMargin ? marginOf(sale) : null;
          return (
            <Fragment key={sale.id}>
              {dayHeader && (
                <li className="flex items-baseline justify-between gap-3 px-2 pt-2" aria-label={`Ventes du ${dayTitle(sale.date)}`}>
                  <span className="text-sm font-semibold capitalize text-[var(--m3-on-surface)]">{dayTitle(sale.date)}</span>
                  <span className="text-xs tabular-nums text-[var(--m3-on-surface-variant)]">
                    {plural(dayHeader.count, 'vente')} · {fmtHTG(dayHeader.total)}
                    {showMargin && dayHeader.hasMargin && ` · marge ${fmtSigned(dayHeader.margin)}`}
                  </span>
                </li>
              )}
            <li
              className={
                'm3-in overflow-hidden rounded-[28px] p-4 ' +
                (cancelled ? 'bg-[var(--m3-surface-container-low)]' : 'bg-[var(--m3-surface-container)]')
              }
            >
              <div className="flex items-start gap-3">
                <div
                  className={
                    'flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] text-base font-bold tabular-nums ' +
                    (cancelled
                      ? 'bg-[#FFDAD6] text-[#410002]'
                      : 'bg-[var(--m3-tertiary-container)] text-[var(--m3-on-tertiary-container)]')
                  }
                  aria-label={`Vente numéro ${number}`}
                >
                  {number}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold tabular-nums">{fmtTime12(sale.date)}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--m3-secondary-container)] px-2.5 py-1 text-xs font-medium text-[var(--m3-on-secondary-container)]">
                      <PayIcon size={12} />
                      {paymentLabel(sale.paiement)}
                    </span>
                    <span
                      className={
                        'rounded-full px-2.5 py-1 text-xs font-medium ' +
                        (cancelled ? 'bg-[#FFDAD6] text-[#410002]' : 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]')
                      }
                    >
                      {cancelled ? 'Annulée' : 'Validée'}
                    </span>
                  </div>
                  {sale.client && (
                    <div className="mt-1.5 flex items-center gap-1 text-xs text-[var(--m3-on-surface-variant)]">
                      <UserRound size={12} className="shrink-0" />
                      <span className="truncate">{sale.client}</span>
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className={
                      'text-xl font-bold tabular-nums ' +
                      (cancelled ? 'text-[var(--m3-on-surface-variant)] line-through' : 'text-[var(--m3-primary)]')
                    }
                  >
                    {fmtHTG(sale.total)}
                  </div>
                  {discount > 0 && (
                    <div className={'mt-0.5 text-xs font-medium tabular-nums ' + (cancelled ? 'line-through' : 'text-[var(--m3-tertiary)]')}>
                      − {fmtHTG(discount)} · {pct} %
                    </div>
                  )}
                  {saleMargin && (
                    <div
                      className={
                        'mt-0.5 text-xs font-medium tabular-nums ' +
                        (cancelled ? 'text-[var(--m3-on-surface-variant)] line-through' : marginTone(saleMargin.margin))
                      }
                    >
                      Marge {fmtSigned(saleMargin.margin)}
                      {saleMargin.pct != null ? ` · ${fmtPct(saleMargin.pct)}` : ''}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 space-y-1.5 rounded-[20px] bg-[var(--m3-surface)] p-3 text-sm">
                {sale.lignes.map((ligne, lineIndex) => (
                  <div key={lineIndex} className="flex justify-between gap-3">
                    <span className={'min-w-0 ' + (cancelled ? 'line-through' : '')}>
                      <span className="font-semibold tabular-nums text-[var(--m3-on-surface-variant)]">{ligne.qte} ×</span> {ligne.nom}
                    </span>
                    <span className="shrink-0 tabular-nums text-[var(--m3-on-surface-variant)]">{fmtHTG(ligne.sousTotal)}</span>
                  </div>
                ))}
                {sale.paiement !== 'credit' && (
                  <div className="flex justify-between gap-3 border-t border-[var(--m3-outline-variant)] pt-1.5 text-xs text-[var(--m3-on-surface-variant)]">
                    <span>Reçu {fmtHTG(sale.recu)}</span>
                    <span>Monnaie {fmtHTG(sale.monnaie)}</span>
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReceiptSale(sale)}
                  className={`group relative flex h-12 flex-1 items-center justify-center gap-2 overflow-hidden rounded-full bg-[var(--m3-secondary-container)] text-sm font-semibold text-[var(--m3-on-secondary-container)] m3-press motion-reduce:transition-none ${M3_FOCUS}`}
                >
                  <M3StateLayer />
                  <Eye size={18} />
                  Voir le reçu
                </button>
                <button
                  type="button"
                  onClick={() => printSale(sale)}
                  aria-label="Imprimer le reçu"
                  className={`group relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)] m3-press motion-reduce:transition-none ${M3_FOCUS}`}
                >
                  <M3StateLayer />
                  <Printer size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setSaleToCancel({ sale, number })}
                  disabled={cancelled}
                  aria-label="Annuler la vente"
                  className={`group relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#FFDAD6] text-[#410002] m3-press motion-reduce:transition-none disabled:opacity-40 ${M3_FOCUS}`}
                >
                  <M3StateLayer />
                  <Undo2 size={18} />
                </button>
              </div>
            </li>
            </Fragment>
          );
        })}
      </ul>

      {rows.length === 0 && (
        <div className="m3-in flex flex-col items-center rounded-[32px] bg-[var(--m3-surface-container-low)] px-6 py-12 text-center sm:hidden">
          <span className="mb-4 flex h-20 w-20 -rotate-6 items-center justify-center rounded-[32px] bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]">
            <ShoppingCart size={36} />
          </span>
          <div className="text-lg font-semibold">{isFiltering ? 'Aucun résultat' : 'Aucune vente'}</div>
          <div className="mt-1 text-sm text-[var(--m3-on-surface-variant)]">
            {isFiltering ? 'Aucune vente ne correspond à votre recherche.' : emptyText}
          </div>
        </div>
      )}

      {/* ── Desktop (≥ sm): M3 summary cards, search, payment segmented filter, tonal table ── */}
      <div className="hidden space-y-5 sm:block">
        <div className={`grid grid-cols-2 gap-3 ${showMargin ? 'lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]' : 'lg:grid-cols-[1.5fr_1fr_1fr_1fr]'}`}>
          <div className="col-span-2 flex items-center gap-4 rounded-[28px] bg-[var(--m3-primary-container)] px-6 py-5 text-[var(--m3-on-primary-container)] lg:col-span-1">
            <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/40">
              <TrendingUp size={26} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium opacity-80">{totalLabel}</div>
              <div className="break-words text-[32px] font-bold leading-9 tracking-tight tabular-nums">{fmtHTG(totalAmount)}</div>
            </div>
          </div>
          {[
            { label: 'Ventes', value: String(countedRows.length), Icon: Receipt, tone: 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]' },
            { label: 'Articles vendus', value: String(totalQty), Icon: ShoppingCart, tone: 'bg-[var(--m3-surface-container)] text-[var(--m3-on-surface)]', hint: undefined as string | undefined },
            ...(showMargin
              ? [
                  {
                    label: 'Marge brute',
                    value: marginBase > 0 ? fmtSigned(totalMargin) : '—',
                    Icon: Coins,
                    tone: 'bg-[#D7EBDD] text-[#0F2E1C]',
                    hint:
                      marginBase > 0
                        ? `${marginPct != null ? fmtPct(marginPct) + ' du total' : ''}${marginUnknown > 0 ? `${marginPct != null ? ' · ' : ''}${marginUnknown} sans prix d'achat` : ''}`
                        : marginUnknown > 0
                          ? `${marginUnknown} sans prix d'achat`
                          : undefined,
                  },
                ]
              : []),
            {
              label: 'Remises',
              value: totalDiscount > 0 ? `− ${fmtHTG(totalDiscount)}` : '—',
              Icon: Tag,
              tone: 'bg-[var(--m3-tertiary-container)] text-[var(--m3-on-tertiary-container)]',
              hint: undefined as string | undefined,
            },
          ].map(({ label, value, Icon, tone, hint }) => (
            <div key={label} className={`flex items-center gap-4 rounded-[28px] px-5 py-5 ${tone}`}>
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--m3-surface)]/60">
                <Icon size={22} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm opacity-80">{label}</div>
                <div className="truncate text-2xl font-semibold leading-8 tabular-nums">{value}</div>
                {hint && <div className="truncate text-xs opacity-80">{hint}</div>}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-12 min-w-[240px] max-w-md flex-1 items-center gap-3 rounded-full bg-[var(--m3-surface-container-high)] px-4 transition-shadow focus-within:ring-2 focus-within:ring-[var(--m3-primary)] motion-reduce:transition-none">
            <Search className="h-5 w-5 shrink-0 text-[var(--m3-on-surface-variant)]" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher une vente, un article..."
              aria-label="Rechercher une vente"
              className="w-full min-w-0 border-none bg-transparent text-sm text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Effacer la recherche"
                className={`group relative -mr-2 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}
              >
                <M3StateLayer />
                <X size={18} />
              </button>
            )}
          </div>

          <div role="group" aria-label="Filtrer par mode de paiement" className="flex flex-wrap gap-2">
            {[{ id: 'all', label: 'Tous', icon: null as LucideIcon | null }, ...PAYMENT_METHODS].map((method) => {
              const selected = paymentFilter === method.id;
              const Icon = method.icon;
              return (
                <button
                  key={method.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setPaymentFilter(method.id)}
                  className={`group relative ${M3_FOCUS}`}
                >
                  <span
                    className={`relative flex h-10 items-center gap-2 overflow-hidden px-4 text-sm font-medium m3-morph ${
                      selected ? 'rounded-full' : 'rounded-xl'
                    } ${
                      selected
                        ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
                        : 'border border-[var(--m3-outline)] text-[var(--m3-on-surface-variant)]'
                    }`}
                  >
                    <M3StateLayer />
                    {selected ? <Check size={16} /> : Icon ? <Icon size={16} /> : null}
                    {method.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] bg-[var(--m3-surface-container)]">
          <div className="max-h-[62vh] overflow-auto">
            <table className={`w-full border-collapse text-left text-sm ${showMargin ? 'min-w-[1080px]' : 'min-w-[980px]'}`}>
              <thead className="sticky top-0 z-10 bg-[var(--m3-surface-container-high)] text-xs text-[var(--m3-on-surface-variant)] shadow-[0_1px_0_var(--m3-outline-variant)]">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-medium">N°</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Heure</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Articles</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Qté</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Paiement</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Remise</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
                  {showMargin && <th scope="col" className="px-4 py-3 text-right font-medium">Marge</th>}
                  <th scope="col" className="px-4 py-3 text-right font-medium">Reçu / Monnaie</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Statut</th>
                  <th scope="col" className="w-36 px-3 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ sale, number }, rowIndex) => {
                  const cancelled = sale.statut === 'annulee';
                  const PayIcon = paymentIcon(sale.paiement);
                  const discount = sale.remise ?? 0;
                  const pct = discount > 0 ? Math.round((discount / (sale.total + discount)) * 1000) / 10 : 0;
                  const dayHeader = isFirstOfDay(rowIndex) ? dayStats.get(dayKey(sale.date)) ?? { count: 0, total: 0, margin: 0, hasMargin: false } : null;
          const saleMargin = showMargin ? marginOf(sale) : null;
                  return (
                    <Fragment key={sale.id}>
                    {dayHeader && (
                      <tr className="bg-[var(--m3-surface-container-high)]">
                        <td colSpan={colCount} className="px-4 py-2.5">
                          <div className="flex items-baseline justify-between gap-4">
                            <span className="text-sm font-semibold capitalize text-[var(--m3-on-surface)]">{dayTitle(sale.date)}</span>
                            <span className="text-xs tabular-nums text-[var(--m3-on-surface-variant)]">
                              {plural(dayHeader.count, 'vente')} · <span className="font-semibold text-[var(--m3-primary)]">{fmtHTG(dayHeader.total)}</span>
                              {showMargin && dayHeader.hasMargin && (
                                <>
                                  {' · marge '}
                                  <span className={'font-semibold ' + marginTone(dayHeader.margin)}>{fmtSigned(dayHeader.margin)}</span>
                                </>
                              )}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                    <tr
                      className={
                        'border-b border-[var(--m3-outline-variant)]/60 align-top transition-colors last:border-b-0 motion-reduce:transition-none ' +
                        (cancelled ? 'bg-[var(--m3-surface-container-low)] text-[var(--m3-on-surface-variant)]' : 'hover:bg-[var(--m3-surface-container-high)]')
                      }
                    >
                      <td className="px-4 py-3">
                        <span
                          className={
                            'flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold tabular-nums ' +
                            (cancelled ? 'bg-[#FFDAD6] text-[#410002]' : 'bg-[var(--m3-tertiary-container)] text-[var(--m3-on-tertiary-container)]')
                          }
                        >
                          {number}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">{fmtTime12(sale.date)}</td>
                      <td className="min-w-[240px] px-4 py-3">
                        <div className="space-y-0.5">
                          {sale.lignes.map((ligne, lineIndex) => (
                            <div key={lineIndex} className="flex justify-between gap-4">
                              <span className={cancelled ? 'line-through' : ''}>
                                <span className="tabular-nums text-[var(--m3-on-surface-variant)]">{ligne.qte} ×</span> {ligne.nom}
                              </span>
                              <span className="tabular-nums text-[var(--m3-on-surface-variant)]">{fmtHTG(ligne.sousTotal)}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{qtyOf(sale)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[var(--m3-secondary-container)] px-3 text-xs font-medium text-[var(--m3-on-secondary-container)]">
                          <PayIcon size={14} />
                          {paymentLabel(sale.paiement)}
                        </span>
                        {sale.client && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-[var(--m3-on-surface-variant)]">
                            <UserRound size={12} className="shrink-0" />
                            <span className="max-w-[140px] truncate">{sale.client}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {discount > 0 ? (
                          <div className={cancelled ? 'line-through' : 'text-[var(--m3-tertiary)]'}>
                            <div className="font-medium">− {fmtHTG(discount)}</div>
                            <div className="text-xs">{pct} %</div>
                          </div>
                        ) : (
                          <span className="text-[var(--m3-on-surface-variant)]">—</span>
                        )}
                      </td>
                      <td
                        className={
                          'whitespace-nowrap px-4 py-3 text-right text-base font-semibold tabular-nums ' +
                          (cancelled ? 'line-through' : 'text-[var(--m3-primary)]')
                        }
                      >
                        {fmtHTG(sale.total)}
                      </td>
                      {showMargin && (
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                          {saleMargin ? (
                            <div className={cancelled ? 'line-through' : marginTone(saleMargin.margin)}>
                              <div className="font-medium">{fmtSigned(saleMargin.margin)}</div>
                              {saleMargin.pct != null && <div className="text-xs">{fmtPct(saleMargin.pct)}</div>}
                            </div>
                          ) : (
                            <span title="Prix d'achat inconnu" className="text-[var(--m3-on-surface-variant)]">
                              —
                            </span>
                          )}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-4 py-3 text-right text-xs tabular-nums text-[var(--m3-on-surface-variant)]">
                        {sale.paiement === 'credit' ? (
                          '—'
                        ) : (
                          <>
                            <div>{fmtHTG(sale.recu)}</div>
                            <div>{fmtHTG(sale.monnaie)}</div>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            'inline-flex h-7 items-center rounded-full px-3 text-xs font-medium ' +
                            (cancelled ? 'bg-[#FFDAD6] text-[#410002]' : 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]')
                          }
                        >
                          {cancelled ? 'Annulée' : 'Validée'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" onClick={() => setReceiptSale(sale)} className={deskIconBtn} aria-label="Voir le reçu" title="Voir le reçu">
                            <M3StateLayer />
                            <Eye size={18} />
                          </button>
                          <button type="button" onClick={() => printSale(sale)} className={deskIconBtn} aria-label="Imprimer le reçu" title="Imprimer le reçu">
                            <M3StateLayer />
                            <Printer size={18} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setSaleToCancel({ sale, number })}
                            disabled={cancelled}
                            className={`${deskIconBtn} ${cancelled ? 'opacity-40' : 'text-[#BA1A1A]'}`}
                            aria-label="Annuler la vente"
                            title={cancelled ? 'Vente déjà annulée' : 'Annuler / rembourser la vente'}
                          >
                            <M3StateLayer />
                            <Undo2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    </Fragment>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={colCount} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]">
                          <ShoppingCart size={28} />
                        </span>
                        <span className="text-base font-medium">
                          {isFiltering ? 'Aucune vente ne correspond à votre recherche.' : emptyText}
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {receiptSale && <SalesReceiptModal sale={receiptSale} onClose={() => setReceiptSale(null)} paymentLabel={PAYMENT_METHODS.find((method) => method.id === receiptSale.paiement)?.label || receiptSale.paiement} formatCurrency={fmtHTG} creditBalance={creditBalance(receiptSale)} />}

      {saleToCancel && (
        <div className="m3-scrim fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={`Annuler la vente n° ${saleToCancel.number}`}
            style={M3_VARS}
            className="m3-pop w-full max-w-sm rounded-[32px] bg-[var(--m3-surface-container-high)] p-6 text-[var(--m3-on-surface)] shadow-[0_8px_10px_-6px_rgba(0,0,0,0.2),0_16px_24px_2px_rgba(0,0,0,0.14)]"
          >
            <span className="mb-4 flex h-14 w-14 -rotate-6 items-center justify-center rounded-[20px] bg-[#FFDAD6] text-[#410002]">
              <Undo2 size={26} />
            </span>
            <div className="text-2xl font-bold leading-8">Annuler la vente n° {saleToCancel.number} ?</div>
            <p className="mt-3 text-sm leading-5 text-[var(--m3-on-surface-variant)]">
              {fmtHTG(saleToCancel.sale.total)} • {qtyOf(saleToCancel.sale)} article{qtyOf(saleToCancel.sale) !== 1 ? 's' : ''}.
              Le stock sera remis en inventaire et la vente ne comptera plus dans les totaux.
            </p>
            {saleToCancel.sale.paiement === 'credit' && creditPaid(saleToCancel.sale) > 0 && (
              <p className="mt-3 rounded-2xl bg-[var(--m3-tertiary-container)] px-4 py-3 text-sm text-[var(--m3-on-tertiary-container)]">
                {fmtHTG(creditPaid(saleToCancel.sale))} ont déjà été payés sur ce crédit : pensez à les rembourser au client.
              </p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
              <button
                onClick={() => setSaleToCancel(null)}
                className={`group relative h-12 flex-1 overflow-hidden rounded-full bg-[var(--m3-secondary-container)] text-sm font-semibold text-[var(--m3-on-secondary-container)] m3-press motion-reduce:transition-none ${M3_FOCUS}`}
              >
                <M3StateLayer />
                Retour
              </button>
              <button
                onClick={() => {
                  onCancelSale(saleToCancel.sale);
                  setSaleToCancel(null);
                }}
                className={`group relative h-12 flex-1 overflow-hidden rounded-full bg-[#BA1A1A] text-sm font-semibold text-white m3-press motion-reduce:transition-none ${M3_FOCUS}`}
              >
                <M3StateLayer />
                Annuler la vente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
