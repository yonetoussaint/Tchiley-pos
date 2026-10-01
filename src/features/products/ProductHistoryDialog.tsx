import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, ClipboardCheck, PackagePlus, ShoppingCart, SlidersHorizontal, Sparkles, Tag, Truck, X, type LucideIcon } from 'lucide-react';
import { M3_FOCUS } from '../../components/ui/focus';
import { M3StateLayer, M3_VARS } from '../../components/ui/theme';
import { fmtTime12 } from '../../shared/dates';
import { fmtHTG } from '../../shared/currency';
import { KIND_LABEL, fmtPrice, stockDelta, summarizeHistory, withStockBalance } from './history';
import type { Product, ProductHistoryEntry } from './types';

type Tab = 'all' | 'sale' | 'purchase' | 'stock' | 'price';

const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'Tout' },
  { id: 'sale', label: 'Ventes' },
  { id: 'purchase', label: 'Achats' },
  { id: 'stock', label: 'Stock' },
  { id: 'price', label: 'Prix' },
];

const KIND_ICON: Record<ProductHistoryEntry['kind'], LucideIcon> = {
  sale: ShoppingCart,
  purchase: Truck,
  restock: PackagePlus,
  manual: SlidersHorizontal,
  count: ClipboardCheck,
  price: Tag,
  created: Sparkles,
};

const PAGE = 40;

const matchesTab = (entry: ProductHistoryEntry, tab: Tab) => {
  switch (tab) {
    case 'all': return true;
    case 'sale': return entry.kind === 'sale';
    case 'purchase': return entry.kind === 'purchase';
    case 'price': return entry.kind === 'price' || entry.kind === 'created';
    case 'stock': return entry.kind !== 'price';
  }
};

const dayLabel = (date: Date) => {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (date.toDateString() === yesterday.toDateString()) return 'Hier';
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};

/* Flat step chart: the value holds until the next change. */
function StepChart({ points, label, format }: { points: { t: number; v: number }[]; label: string; format: (v: number) => string }) {
  if (points.length < 2) return null;
  const W = 320;
  const H = 72;
  const t0 = points[0].t;
  const t1 = Math.max(points[points.length - 1].t, t0 + 1);
  const values = points.map((p) => p.v);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const x = (t: number) => ((t - t0) / (t1 - t0)) * W;
  const y = (v: number) => H - 6 - ((v - lo) / span) * (H - 12);
  let d = `M${x(points[0].t).toFixed(1)} ${y(points[0].v).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` H${x(points[i].t).toFixed(1)} V${y(points[i].v).toFixed(1)}`;
  }
  return (
    <div className="rounded-2xl bg-[var(--m3-surface-container)] p-3">
      <div className="mb-1 flex items-baseline justify-between text-xs text-[var(--m3-on-surface-variant)]">
        <span>{label}</span>
        <span className="tabular-nums">{format(lo)} – {format(hi)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} className="h-[72px] w-full text-[var(--m3-primary)]">
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-[var(--m3-on-surface-variant)]">
        <span>{new Date(t0).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
        <span>{new Date(t1).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
      </div>
    </div>
  );
}

function EntryRow({ entry, unit }: { entry: ProductHistoryEntry; unit: string }) {
  const Icon = KIND_ICON[entry.kind];
  const delta = stockDelta(entry);
  const stockBefore = entry.stockAfter != null ? entry.stockAfter - delta : null;
  const isPrice = entry.kind === 'price';
  const up = isPrice && entry.to != null && entry.from != null && entry.to > entry.from;
  const pct = isPrice && entry.from ? Math.round((((entry.to ?? 0) - entry.from) / entry.from) * 100) : null;

  let title: string;
  let detail: string;
  if (isPrice) {
    title = entry.field === 'prix' ? 'Prix de vente modifié' : "Prix d'achat modifié";
    detail = entry.from == null ? `Défini à ${fmtPrice(entry.to ?? 0)}` : `${fmtPrice(entry.from)} → ${fmtPrice(entry.to ?? 0)}${pct != null ? ` (${pct > 0 ? '+' : ''}${pct}%)` : ''}`;
  } else if (entry.kind === 'sale') {
    title = `Vente ${entry.note}`;
    detail = [entry.unitPrice != null ? `${fmtPrice(entry.unitPrice)} / ${unit}` : '', entry.client].filter(Boolean).join(' · ');
  } else if (entry.kind === 'purchase') {
    title = `Achat · ${entry.note || 'Fournisseur'}`;
    detail = entry.unitPrice != null ? `${fmtPrice(entry.unitPrice)} / ${unit}` : '';
  } else if (entry.kind === 'created') {
    title = 'Produit créé';
    detail = `Vente ${fmtPrice(entry.unitPrice ?? 0)} · Achat ${fmtPrice(entry.unitCost ?? 0)}`;
  } else {
    title = entry.kind === 'restock' ? 'Réapprovisionnement' : entry.note || 'Ajustement';
    detail = (entry.kind === 'manual' || entry.kind === 'count') && entry.note ? (entry.kind === 'count' && entry.amount ? `Écart ${fmtHTG(entry.amount)}` : '') : entry.amount ? `Valeur ${fmtHTG(entry.amount)}` : '';
  }

  const tone = isPrice
    ? up ? 'text-[var(--m3-primary)]' : 'text-[var(--m3-error,#BA1A1A)]'
    : delta < 0 ? 'text-[var(--m3-error,#BA1A1A)]' : 'text-[var(--m3-primary)]';

  return (
    <li className={`flex items-start gap-3 rounded-2xl bg-[var(--m3-surface-container)] px-3 py-2.5 ${entry.cancelled ? 'opacity-60' : ''}`}>
      <span aria-hidden="true" className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]">
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm font-medium ${entry.cancelled ? 'line-through' : ''}`}>{title}</div>
        <div className="truncate text-xs text-[var(--m3-on-surface-variant)]">
          {KIND_LABEL[entry.kind]} · {fmtTime12(entry.date)}
          {entry.cancelled ? ' · Annulé' : ''}
          {detail ? ` · ${detail}` : ''}
        </div>
      </div>
      <div className="shrink-0 text-right tabular-nums">
        {isPrice ? (
          <div className={`flex items-center justify-end gap-0.5 text-sm font-semibold ${tone}`}>
            {up ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />}
            {fmtPrice(entry.to ?? 0)}
          </div>
        ) : (
          <>
            <div className={`text-sm font-semibold ${entry.cancelled ? 'line-through' : ''} ${tone}`}>
              {delta > 0 ? '+' : delta < 0 ? '−' : ''}{Math.abs(delta || entry.qty)} {unit}
            </div>
            {entry.amount > 0 && <div className="text-xs text-[var(--m3-on-surface-variant)]">{fmtHTG(entry.amount)}</div>}
          </>
        )}
        {stockBefore != null && !isPrice && !entry.cancelled && (
          <div className="text-[11px] text-[var(--m3-on-surface-variant)]">Stock {stockBefore} → {entry.stockAfter}</div>
        )}
      </div>
    </li>
  );
}

export function ProductHistoryDialog({ product, entries, onClose }: { product: Product; entries: ProductHistoryEntry[]; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('all');
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const enriched = useMemo(() => withStockBalance(entries, product.stockFermeture), [entries, product.stockFermeture]);
  const stats = useMemo(() => summarizeHistory(entries, product.prixAchat), [entries, product.prixAchat]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: 0, sale: 0, purchase: 0, stock: 0, price: 0 };
    enriched.forEach((e) => TABS.forEach((t) => { if (matchesTab(e, t.id)) c[t.id] += 1; }));
    return c;
  }, [enriched]);

  const visible = useMemo(() => enriched.filter((e) => matchesTab(e, tab)), [enriched, tab]);
  const shown = visible.slice(0, limit);

  /* Chart series, oldest first. */
  const stockSeries = useMemo(() => {
    const moves = enriched.filter((e) => e.kind !== 'price' && !e.cancelled && stockDelta(e) !== 0).reverse();
    if (moves.length === 0) return [];
    const first = moves[0];
    const pts = [{ t: first.date.getTime() - 1, v: (first.stockAfter ?? 0) - stockDelta(first) }];
    moves.forEach((m) => pts.push({ t: m.date.getTime(), v: m.stockAfter ?? 0 }));
    pts.push({ t: Date.now(), v: product.stockFermeture });
    return pts;
  }, [enriched, product.stockFermeture]);

  const priceSeries = useMemo(() => {
    const edits = enriched.filter((e) => e.kind === 'price' && e.field === 'prix').reverse();
    if (edits.length === 0) return [];
    const pts = [{ t: edits[0].date.getTime() - 1, v: edits[0].from ?? edits[0].to ?? 0 }];
    edits.forEach((e) => pts.push({ t: e.date.getTime(), v: e.to ?? 0 }));
    pts.push({ t: Date.now(), v: product.prix });
    return pts;
  }, [enriched, product.prix]);

  const tiles: [string, string][] = [
    ['Vendu', `${stats.soldQty} ${product.unite}`],
    ["Chiffre d'affaires", fmtHTG(stats.soldRevenue)],
    ['Bénéfice', fmtHTG(stats.soldProfit)],
    ['Acheté', `${stats.boughtQty} ${product.unite}`],
    ["Coût d'achat", fmtHTG(stats.boughtCost)],
    ['Stock actuel', `${product.stockFermeture} ${product.unite}`],
  ];

  let lastDay = '';

  return createPortal(
    <div
      role="presentation"
      style={M3_VARS}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/[0.32] sm:items-center sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-history-title"
        className="m3-dialog flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-[var(--m3-surface-container-low)] text-[var(--m3-on-surface)] shadow-[0_8px_24px_rgba(0,0,0,0.2)] sm:max-h-[90dvh] sm:max-w-[640px] sm:rounded-[28px]"
      >
        <div className="shrink-0 px-6 pb-3 pt-3 sm:pt-6">
          <div aria-hidden="true" className="mx-auto mb-3 h-1 w-8 rounded-full bg-[var(--m3-on-surface-variant)] opacity-40 sm:hidden" />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 id="product-history-title" className="truncate text-2xl leading-8">Historique</h3>
              <p className="truncate text-sm text-[var(--m3-on-surface-variant)]">{product.nom}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Fermer" className={`group relative -mr-2 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}>
              <M3StateLayer />
              <X size={20} />
            </button>
          </div>
          <div role="tablist" aria-label="Type d'historique" className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => { setTab(t.id); setLimit(PAGE); }}
                className={`relative flex h-9 shrink-0 items-center gap-1.5 overflow-hidden px-3.5 text-sm font-medium ${M3_FOCUS} ${
                  tab === t.id
                    ? 'rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
                    : 'rounded-xl border border-[var(--m3-outline)] text-[var(--m3-on-surface-variant)]'
                }`}
              >
                <M3StateLayer />
                {t.label}
                <span className="tabular-nums opacity-70">{counts[t.id]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {(tab === 'all' || tab === 'sale' || tab === 'purchase') && (
            <div className="grid grid-cols-3 gap-2">
              {tiles.map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-[var(--m3-surface-container)] px-3 py-2.5">
                  <div className="truncate text-xs text-[var(--m3-on-surface-variant)]">{label}</div>
                  <div className="mt-0.5 truncate text-sm font-semibold tabular-nums">{value}</div>
                </div>
              ))}
            </div>
          )}

          {(tab === 'all' || tab === 'stock') && <StepChart points={stockSeries} label="Niveau de stock" format={(v) => `${v}`} />}
          {tab === 'price' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-[var(--m3-surface-container)] px-3 py-2.5">
                  <div className="text-xs text-[var(--m3-on-surface-variant)]">Prix de vente</div>
                  <div className="mt-0.5 text-sm font-semibold tabular-nums">{fmtPrice(product.prix)}</div>
                </div>
                <div className="rounded-2xl bg-[var(--m3-surface-container)] px-3 py-2.5">
                  <div className="text-xs text-[var(--m3-on-surface-variant)]">Prix d'achat</div>
                  <div className="mt-0.5 text-sm font-semibold tabular-nums">{fmtPrice(product.prixAchat)}</div>
                </div>
              </div>
              <StepChart points={priceSeries} label="Prix de vente" format={fmtPrice} />
            </>
          )}

          {shown.length === 0 ? (
            <p className="py-10 text-center text-sm text-[var(--m3-on-surface-variant)]">
              {tab === 'price' ? 'Aucun changement de prix enregistré depuis la mise en place du suivi.' : 'Aucun mouvement pour ce produit.'}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {shown.map((entry) => {
                const label = dayLabel(entry.date);
                const header = label !== lastDay;
                lastDay = label;
                return (
                  <li key={entry.id} className="list-none">
                    {header && <div className="mb-1.5 mt-3 px-1 text-xs font-medium capitalize text-[var(--m3-on-surface-variant)] first:mt-0">{label}</div>}
                    <ul><EntryRow entry={entry} unit={product.unite} /></ul>
                  </li>
                );
              })}
            </ul>
          )}

          {visible.length > shown.length && (
            <button
              type="button"
              onClick={() => setLimit((n) => n + PAGE)}
              className={`group relative flex h-12 w-full items-center justify-center overflow-hidden rounded-full border border-[var(--m3-outline)] text-sm font-medium text-[var(--m3-primary)] ${M3_FOCUS}`}
            >
              <M3StateLayer />
              Voir plus ({visible.length - shown.length})
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
