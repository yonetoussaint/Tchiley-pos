import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Banknote, Check, FileClock, Package, Plus, Receipt, Search, Smartphone, Trash2, Truck, Undo2, X, type LucideIcon } from 'lucide-react';
import { M3_FOCUS } from '../../components/ui/focus';
import { M3StateLayer, M3_VARS } from '../../components/ui/theme';
import type { Product } from '../products/types';
import type { PaymentMethodId } from '../sales/paymentMethods';
import type { PurchaseLine, PurchaseRecord } from './types';
import { fmtHTG } from '../../shared/currency';
import { fmtTime12, isSameDay } from '../../shared/dates';

const PURCHASE_PAYMENTS: Array<{ id: PaymentMethodId; label: string; icon: typeof Banknote }> = [
  { id: 'especes', label: 'Espèces', icon: Banknote },
  { id: 'moncash', label: 'MonCash', icon: Smartphone },
  { id: 'natcash', label: 'NatCash', icon: Smartphone },
  { id: 'credit', label: 'Crédit fournisseur', icon: FileClock },
];

const MOCK_SUPPLIERS: Record<string, string[]> = {
  'gros-morne': ['Quincaillerie Nationale', 'Ciment Maya', 'Acier Haïti SA'],
  'saint-marc': ['Ciment Maya', 'Distribution Artibonite', 'Plomberie Express'],
  'majuin': ['Brasserie Nationale', 'Import Caraïbes', 'Grossiste Delmas'],
  'oreste': ['Électro Plus', 'Acier Haïti SA', 'Plomberie Express'],
};

export function buildMockPurchases(initialProducts: Product[], branchInventorySeed: Record<string, string[]>, historyDays: number): PurchaseRecord[] {
  let seed = 20260930;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const now = new Date();
  const out: PurchaseRecord[] = [];

  Object.entries(branchInventorySeed).forEach(([branchId, productIds]) => {
    const branchProducts = initialProducts.filter((p) => productIds.includes(p.id));
    const suppliers = MOCK_SUPPLIERS[branchId] ?? ['Fournisseur'];
    let daysAgo = randInt(0, 3);
    while (daysAgo < historyDays) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 7 + randInt(0, 6), randInt(0, 59));
      if (date.getTime() <= now.getTime()) {
        const chosen = [...branchProducts].sort(() => rand() - 0.5).slice(0, randInt(1, 3));
        const lignes: PurchaseLine[] = chosen.map((p) => {
          const qte = p.prixAchat < 150 ? randInt(60, 300) : randInt(10, 60);
          return { produitId: p.id, nom: p.nom, unite: p.unite, qte, coutUnitaire: p.prixAchat, sousTotal: qte * p.prixAchat };
        });
        const pool: PaymentMethodId[] = ['especes', 'especes', 'moncash', 'natcash', 'credit'];
        out.push({
          id: `A${date.getTime()}-${out.length}`,
          branchId,
          date,
          fournisseur: suppliers[randInt(0, suppliers.length - 1)],
          reference: rand() < 0.6 ? `FAC-${randInt(1000, 9999)}` : undefined,
          lignes,
          total: lignes.reduce((s, l) => s + l.sousTotal, 0),
          paiement: pool[randInt(0, pool.length - 1)],
        });
      }
      daysAgo += randInt(3, 9);
    }
  });
  return out.sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** Adds (sign = 1) or removes (sign = -1) the purchased quantities from stock. */
export function applyPurchaseToProducts(products: Product[], lignes: PurchaseLine[], sign: 1 | -1, updateCost: boolean): Product[] {
  return products.map((product) => {
    const mine = lignes.filter((l) => l.produitId === product.id);
    if (mine.length === 0) return product;
    const qty = mine.reduce((n, l) => n + l.qte, 0);
    return {
      ...product,
      stockFermeture: Math.max(product.stockFermeture + sign * qty, 0),
      prixAchat: updateCost && sign === 1 ? mine[mine.length - 1].coutUnitaire : product.prixAchat,
    };
  });
}

function PurchaseSheet({
  products,
  suppliers,
  defaultDate,
  onAdd,
  onClose,
}: {
  products: Product[];
  suppliers: string[];
  defaultDate: Date;
  onAdd: (purchase: Omit<PurchaseRecord, 'id' | 'branchId'>) => void;
  onClose: () => void;
}) {
  type DraftLine = { key: number; produitId: string; qte: string; cout: string };
  const [fournisseur, setFournisseur] = useState('');
  const [reference, setReference] = useState('');
  const [paiement, setPaiement] = useState<PaymentMethodId>('especes');
  const [note, setNote] = useState('');
  const [dateStr, setDateStr] = useState(() => {
    const d = defaultDate;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [lines, setLines] = useState<DraftLine[]>([{ key: 1, produitId: '', qte: '', cout: '' }]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const patchLine = (key: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pickProduct = (key: number, produitId: string) => {
    const product = products.find((p) => p.id === produitId);
    patchLine(key, { produitId, cout: product ? String(product.prixAchat) : '' });
  };

  const parsed = lines.map((l) => ({ ...l, q: Number(l.qte), c: Number(l.cout) }));
  const lineValid = (l: (typeof parsed)[number]) => l.produitId !== '' && l.q > 0 && Number.isFinite(l.c) && l.c >= 0 && l.cout !== '';
  const total = parsed.filter(lineValid).reduce((s, l) => s + l.q * l.c, 0);
  const valid = fournisseur.trim() !== '' && parsed.length > 0 && parsed.every(lineValid);

  const submit = () => {
    if (!valid) return;
    const [y, m, d] = dateStr.split('-').map(Number);
    const when = new Date();
    if (y && m && d) when.setFullYear(y, m - 1, d);
    const lignes: PurchaseLine[] = parsed.map((l) => {
      const product = products.find((p) => p.id === l.produitId)!;
      return { produitId: product.id, nom: product.nom, unite: product.unite, qte: l.q, coutUnitaire: l.c, sousTotal: l.q * l.c };
    });
    onAdd({
      date: when,
      fournisseur: fournisseur.trim(),
      reference: reference.trim() || undefined,
      note: note.trim() || undefined,
      paiement,
      lignes,
      total: lignes.reduce((s, l) => s + l.sousTotal, 0),
    });
    onClose();
  };

  const field =
    'block min-w-0 rounded-xl bg-[var(--m3-surface)] px-4 pb-1.5 pt-2 ring-1 ring-[var(--m3-outline)] transition-shadow focus-within:ring-2 focus-within:ring-[var(--m3-primary)] motion-reduce:transition-none';
  const input = 'h-8 w-full min-w-0 bg-transparent p-0 text-base text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)]';
  const label = 'block text-xs leading-4 text-[var(--m3-on-surface-variant)]';

  return createPortal(
    <>
      <div aria-hidden="true" onClick={onClose} className="m3-scrim fixed inset-0 z-[80] bg-black/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nouvel achat"
        style={M3_VARS}
        className="m3-sheet fixed inset-x-0 bottom-0 z-[81] max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-[var(--m3-surface-container-low)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 text-[var(--m3-on-surface)] shadow-[0_-8px_24px_rgba(0,0,0,0.16)] sm:inset-x-auto sm:inset-y-0 sm:bottom-auto sm:right-0 sm:h-full sm:max-h-none sm:w-[520px] sm:max-w-full sm:rounded-l-[28px] sm:rounded-tr-none sm:px-6 sm:pt-6 sm:shadow-[-8px_0_24px_rgba(0,0,0,0.16)] sm:[animation:m3-side-in_.4s_var(--m3-spring-effects)]"
      >
        <div className="mx-auto mb-3 mt-1 h-1 w-8 rounded-full bg-[var(--m3-outline-variant)] sm:hidden" />
        <div className="px-2 pb-3">
          <div className="text-xs font-medium text-[var(--m3-on-surface-variant)]">Achats</div>
          <div className="mt-1 text-[24px] font-normal leading-8">Nouvel achat</div>
        </div>

        <div className="space-y-2">
          <label className={field}>
            <span className={label}>Fournisseur</span>
            <input
              type="text"
              list="achats-fournisseurs"
              value={fournisseur}
              onChange={(e) => setFournisseur(e.target.value)}
              className={input}
              autoComplete="off"
            />
            <datalist id="achats-fournisseurs">
              {suppliers.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={field}>
              <span className={label}>Date</span>
              <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} className={input} />
            </label>
            <label className={field}>
              <span className={label}>N° facture (optionnel)</span>
              <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} className={input} />
            </label>
          </div>
        </div>

        <div className="mt-4 px-2 text-sm font-medium">Articles achetés</div>
        <div className="mt-2 space-y-2">
          {parsed.map((l, index) => {
            const product = products.find((p) => p.id === l.produitId);
            return (
              <div key={l.key} className="space-y-2 rounded-[20px] bg-[var(--m3-surface-container)] p-3">
                <div className="flex items-start gap-2">
                  <label className={field + ' flex-1'}>
                    <span className={label}>Produit</span>
                    <select value={l.produitId} onChange={(e) => pickProduct(l.key, e.target.value)} className={input}>
                      <option value="">Choisir…</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nom}
                        </option>
                      ))}
                    </select>
                  </label>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                      aria-label={`Retirer la ligne ${index + 1}`}
                      className={`group relative mt-1 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}
                    >
                      <M3StateLayer />
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className={field}>
                    <span className={label}>Quantité{product ? ` (${product.unite})` : ''}</span>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={l.qte}
                      onChange={(e) => patchLine(l.key, { qte: e.target.value })}
                      className={input + ' tabular-nums'}
                    />
                  </label>
                  <label className={field}>
                    <span className={label}>Coût unitaire (HTG)</span>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={l.cout}
                      onChange={(e) => patchLine(l.key, { cout: e.target.value })}
                      className={input + ' tabular-nums'}
                    />
                  </label>
                </div>
                {lineValid(l) && (
                  <div className="px-1 text-right text-sm tabular-nums text-[var(--m3-on-surface-variant)]">
                    Sous-total <span className="font-semibold text-[var(--m3-on-surface)]">{fmtHTG(l.q * l.c)}</span>
                  </div>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setLines((prev) => [...prev, { key: Math.max(...prev.map((x) => x.key)) + 1, produitId: '', qte: '', cout: '' }])}
            className={`group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-full border border-[var(--m3-outline)] text-sm font-medium text-[var(--m3-primary)] m3-press motion-reduce:transition-none ${M3_FOCUS}`}
          >
            <M3StateLayer />
            <Plus size={18} /> Ajouter un article
          </button>
        </div>

        <div className="mt-4 px-2 text-sm font-medium">Paiement</div>
        <div role="group" aria-label="Mode de paiement" className="mt-2 grid grid-cols-2 gap-2">
          {PURCHASE_PAYMENTS.map((m) => {
            const selected = paiement === m.id;
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setPaiement(m.id)}
                className={
                  'flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-medium m3-press motion-reduce:transition-none ' +
                  M3_FOCUS +
                  ' ' +
                  (selected
                    ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
                    : 'border border-[var(--m3-outline)] text-[var(--m3-on-surface-variant)]')
                }
              >
                {selected ? <Check size={16} className="shrink-0" /> : <Icon size={16} className="shrink-0" />}
                <span className="truncate">{m.label}</span>
              </button>
            );
          })}
        </div>

        <label className={field + ' mt-3'}>
          <span className={label}>Note (optionnel)</span>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={input} />
        </label>

        <div className="mt-4 flex items-baseline justify-between rounded-[20px] bg-[var(--m3-primary-container)] px-5 py-3 text-[var(--m3-on-primary-container)]">
          <span className="text-sm font-medium">Total de l'achat</span>
          <span className="text-2xl font-bold tabular-nums">{fmtHTG(total)}</span>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className={`h-12 shrink-0 rounded-full px-6 text-sm font-medium text-[var(--m3-primary)] active:bg-[var(--m3-surface-container-highest)] ${M3_FOCUS}`}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid}
            className={
              `group relative flex h-12 flex-1 items-center justify-center gap-2 overflow-hidden rounded-full text-sm font-medium m3-press motion-reduce:transition-none ${M3_FOCUS} ` +
              (valid
                ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]'
                : 'cursor-not-allowed bg-[var(--m3-surface-container-highest)] text-[var(--m3-outline)]')
            }
          >
            {valid && <M3StateLayer />}
            <Check size={18} /> Enregistrer l'achat
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

export function BranchPurchasesSection({
  branchProducts,
  purchases,
  selectedDate,
  onAdd,
  onCancel,
}: {
  branchProducts: Product[];
  purchases: PurchaseRecord[];
  selectedDate: Date;
  onAdd: (purchase: Omit<PurchaseRecord, 'id' | 'branchId'>) => void;
  onCancel: (purchase: PurchaseRecord) => void;
}) {
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<'day' | 'month' | 'all'>('month');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toCancel, setToCancel] = useState<PurchaseRecord | null>(null);

  const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? 's' : ''}`;
  const paymentMeta = (id: string) => PURCHASE_PAYMENTS.find((m) => m.id === id);
  const qtyOf = (p: PurchaseRecord) => p.lignes.reduce((n, l) => n + l.qte, 0);
  const fmtDate = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

  const periodLabel =
    period === 'day'
      ? selectedDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : period === 'month'
        ? selectedDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
        : 'Tout l’historique';

  const suppliers = useMemo(() => Array.from(new Set(purchases.map((p) => p.fournisseur))).sort(), [purchases]);

  const query = search.trim().toLowerCase();
  const rows = purchases.filter((p) => {
    if (period === 'day' && !isSameDay(p.date, selectedDate)) return false;
    if (period === 'month' && (p.date.getMonth() !== selectedDate.getMonth() || p.date.getFullYear() !== selectedDate.getFullYear())) return false;
    if (paymentFilter !== 'all' && p.paiement !== paymentFilter) return false;
    if (!query) return true;
    return [p.fournisseur, p.reference ?? '', p.note ?? '', paymentMeta(p.paiement)?.label ?? '', ...p.lignes.map((l) => l.nom)]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });

  const counted = rows.filter((p) => p.statut !== 'annulee');
  const totalSpent = counted.reduce((s, p) => s + p.total, 0);
  const totalQty = counted.reduce((s, p) => s + qtyOf(p), 0);
  const onCredit = counted.filter((p) => p.paiement === 'credit').reduce((s, p) => s + p.total, 0);
  const isFiltering = query !== '' || paymentFilter !== 'all';

  const chips = [{ id: 'all', label: 'Tous', icon: null as LucideIcon | null }, ...PURCHASE_PAYMENTS];
  const periods: Array<['day' | 'month' | 'all', string]> = [['day', 'Jour'], ['month', 'Mois'], ['all', 'Tout']];

  const searchBox = (
    <div className="flex h-14 items-center gap-3 rounded-full bg-[var(--m3-surface-container-high)] px-4 focus-within:ring-2 focus-within:ring-[var(--m3-primary)] sm:h-12">
      <Search className="h-6 w-6 shrink-0 text-[var(--m3-on-surface-variant)] sm:h-5 sm:w-5" />
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher un fournisseur, un article..."
        aria-label="Rechercher un achat"
        className="w-full min-w-0 border-none bg-transparent text-base text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)] sm:text-sm"
      />
      {search && (
        <button
          type="button"
          onClick={() => setSearch('')}
          aria-label="Effacer la recherche"
          className={`group relative -mr-2 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] sm:h-9 sm:w-9 ${M3_FOCUS}`}
        >
          <M3StateLayer />
          <X size={20} />
        </button>
      )}
    </div>
  );

  const periodControl = (
    <div role="group" aria-label="Période" className="grid h-12 w-full max-w-[300px] grid-cols-3 gap-0.5">
      {periods.map(([id, text], idx) => {
        const selected = period === id;
        const shape = selected ? 'rounded-full' : idx === 0 ? 'rounded-l-full rounded-r-lg' : idx === 2 ? 'rounded-r-full rounded-l-lg' : 'rounded-lg';
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            onClick={() => setPeriod(id)}
            className={`group relative flex items-center justify-center gap-1.5 overflow-hidden text-sm font-semibold m3-morph ${shape} ${M3_FOCUS} ${
              selected ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]' : 'bg-[var(--m3-surface-container-high)] text-[var(--m3-on-surface)]'
            }`}
          >
            <M3StateLayer />
            {selected && <Check size={16} />}
            {text}
          </button>
        );
      })}
    </div>
  );

  const chipRow = (
    <div role="group" aria-label="Filtrer par mode de paiement" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
      {chips.map((method) => {
        const selected = paymentFilter === method.id;
        const Icon = method.icon;
        return (
          <button key={method.id} type="button" aria-pressed={selected} onClick={() => setPaymentFilter(method.id)} className={`group relative shrink-0 ${M3_FOCUS}`}>
            <span
              className={`relative flex h-10 items-center gap-2 overflow-hidden px-4 text-sm font-medium m3-morph ${selected ? 'rounded-full' : 'rounded-xl'} ${
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
  );

  const statusChip = (cancelled: boolean) => (
    <span
      className={
        'inline-flex h-7 items-center rounded-full px-3 text-xs font-medium ' +
        (cancelled ? 'bg-[#FFDAD6] text-[#410002]' : 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]')
      }
    >
      {cancelled ? 'Annulé' : 'Enregistré'}
    </span>
  );

  const emptyState = (
    <div className="flex flex-col items-center gap-1 px-6 py-12 text-center">
      <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]">
        <Truck size={28} />
      </span>
      <span className="text-base font-medium">{isFiltering ? 'Aucun achat ne correspond à votre recherche.' : 'Aucun achat pour cette période.'}</span>
      {!isFiltering && <span className="text-sm text-[var(--m3-on-surface-variant)]">Enregistrez vos achats de marchandises pour suivre vos coûts.</span>}
    </div>
  );

  const deskIconBtn = `group relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] disabled:cursor-not-allowed ${M3_FOCUS}`;

  return (
    <div
      style={M3_VARS}
      className="-mx-4 -mb-5 min-h-[calc(100dvh-8rem)] bg-[var(--m3-surface)] px-4 pb-28 pt-4 font-sans text-[var(--m3-on-surface)] sm:mx-0 sm:mb-0 sm:min-h-0 sm:bg-transparent sm:p-0"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-5">
        <div className="min-w-0">
          <h2 className="text-[32px] font-bold leading-10 tracking-tight">Achats</h2>
          <div className="text-sm capitalize text-[var(--m3-on-surface-variant)]">{periodLabel}</div>
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className={`group relative hidden h-12 items-center gap-2 overflow-hidden rounded-full bg-[var(--m3-primary)] px-6 text-sm font-semibold text-[var(--m3-on-primary)] sm:flex ${M3_FOCUS}`}
        >
          <M3StateLayer />
          <Plus size={18} />
          Nouvel achat
        </button>
      </div>

      {/* ── Phone ── */}
      <section
        aria-label="Résumé des achats"
        className="m3-in mb-4 overflow-hidden rounded-[32px] bg-[var(--m3-primary-container)] p-5 text-[var(--m3-on-primary-container)] sm:hidden"
      >
        <div className="text-sm font-medium opacity-80">{isFiltering ? 'Total acheté (résultats)' : 'Total acheté'}</div>
        <div className="mt-1 text-[40px] font-bold leading-[48px] tracking-tight tabular-nums">{fmtHTG(totalSpent)}</div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-[var(--m3-primary)] px-3.5 py-1.5 text-xs font-semibold text-[var(--m3-on-primary)]">{plural(counted.length, 'achat')}</span>
          <span className="rounded-full bg-[var(--m3-surface-container-lowest)] px-3.5 py-1.5 text-xs font-semibold text-[var(--m3-on-surface)]">{plural(totalQty, 'unité')}</span>
          {onCredit > 0 && (
            <span className="rounded-full bg-[var(--m3-tertiary-container)] px-3.5 py-1.5 text-xs font-semibold text-[var(--m3-on-tertiary-container)]">
              À crédit {fmtHTG(onCredit)}
            </span>
          )}
        </div>
      </section>

      <div className="space-y-3 sm:hidden">
        {periodControl}
        {searchBox}
        {chipRow}
      </div>

      <ul className="mt-4 space-y-3 sm:hidden" aria-label="Liste des achats">
        {rows.map((p) => {
          const cancelled = p.statut === 'annulee';
          const meta = paymentMeta(p.paiement);
          const PayIcon = meta?.icon ?? Banknote;
          return (
            <li key={p.id} className={'m3-in overflow-hidden rounded-[28px] p-4 ' + (cancelled ? 'bg-[var(--m3-surface-container-low)]' : 'bg-[var(--m3-surface-container)]')}>
              <div className="flex items-start gap-3">
                <div
                  className={
                    'flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] ' +
                    (cancelled ? 'bg-[#FFDAD6] text-[#410002]' : 'bg-[var(--m3-tertiary-container)] text-[var(--m3-on-tertiary-container)]')
                  }
                >
                  <Truck size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-semibold">{p.fournisseur}</div>
                  <div className="text-xs tabular-nums text-[var(--m3-on-surface-variant)]">
                    {fmtDate(p.date)} · {fmtTime12(p.date)}
                    {p.reference ? ` · ${p.reference}` : ''}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--m3-secondary-container)] px-2.5 py-1 text-xs font-medium text-[var(--m3-on-secondary-container)]">
                      <PayIcon size={12} />
                      {meta?.label ?? p.paiement}
                    </span>
                    {statusChip(cancelled)}
                  </div>
                </div>
                <div className={'shrink-0 text-right text-xl font-bold tabular-nums ' + (cancelled ? 'text-[var(--m3-on-surface-variant)] line-through' : 'text-[var(--m3-primary)]')}>
                  {fmtHTG(p.total)}
                </div>
              </div>
              <div className="mt-3 space-y-1.5 rounded-[20px] bg-[var(--m3-surface)] p-3 text-sm">
                {p.lignes.map((l, i) => (
                  <div key={i} className="flex justify-between gap-3">
                    <span className={'min-w-0 ' + (cancelled ? 'line-through' : '')}>
                      <span className="font-semibold tabular-nums text-[var(--m3-on-surface-variant)]">{l.qte} ×</span> {l.nom}
                      <span className="block text-xs text-[var(--m3-on-surface-variant)]">à {fmtHTG(l.coutUnitaire)} / {l.unite}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-[var(--m3-on-surface-variant)]">{fmtHTG(l.sousTotal)}</span>
                  </div>
                ))}
                {p.note && <div className="border-t border-[var(--m3-outline-variant)] pt-1.5 text-xs text-[var(--m3-on-surface-variant)]">{p.note}</div>}
              </div>
              <div className="mt-3 flex">
                <button
                  type="button"
                  onClick={() => setToCancel(p)}
                  disabled={cancelled}
                  className={`group relative flex h-12 flex-1 items-center justify-center gap-2 overflow-hidden rounded-full bg-[#FFDAD6] text-sm font-semibold text-[#410002] m3-press motion-reduce:transition-none disabled:opacity-40 ${M3_FOCUS}`}
                >
                  <M3StateLayer />
                  <Undo2 size={18} />
                  Annuler l'achat
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {rows.length === 0 && <div className="m3-in mt-4 rounded-[32px] bg-[var(--m3-surface-container-low)] sm:hidden">{emptyState}</div>}

      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className={`group fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 shrink-0 items-center justify-center gap-3 overflow-hidden rounded-[20px] bg-[var(--m3-primary-container)] px-6 text-base font-semibold tracking-[0.01em] text-[var(--m3-on-primary-container)] shadow-[0_3px_8px_3px_rgba(0,0,0,0.15),0_1px_3px_rgba(0,0,0,0.3)] m3-press motion-reduce:transition-none sm:hidden ${M3_FOCUS}`}
      >
        <M3StateLayer />
        <Plus className="h-6 w-6" />
        Achat
      </button>

      {/* ── Desktop (≥ sm) ── */}
      <div className="hidden space-y-5 sm:block">
        <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-3">
          <div className="flex items-center gap-4 rounded-[28px] bg-[var(--m3-primary-container)] px-6 py-5 text-[var(--m3-on-primary-container)]">
            <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/40">
              <Truck size={26} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium opacity-80">{isFiltering ? 'Total acheté (résultats)' : 'Total acheté'}</div>
              <div className="break-words text-[32px] font-bold leading-9 tracking-tight tabular-nums">{fmtHTG(totalSpent)}</div>
            </div>
          </div>
          {[
            { label: 'Achats', value: String(counted.length), Icon: Receipt, tone: 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]' },
            { label: 'Unités achetées', value: String(totalQty), Icon: Package, tone: 'bg-[var(--m3-surface-container)] text-[var(--m3-on-surface)]' },
            { label: 'À crédit', value: onCredit > 0 ? fmtHTG(onCredit) : '—', Icon: FileClock, tone: 'bg-[var(--m3-tertiary-container)] text-[var(--m3-on-tertiary-container)]' },
          ].map(({ label: l, value, Icon, tone }) => (
            <div key={l} className={`flex items-center gap-4 rounded-[28px] px-5 py-5 ${tone}`}>
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--m3-surface)]/60">
                <Icon size={22} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm opacity-80">{l}</div>
                <div className="truncate text-2xl font-semibold leading-8 tabular-nums">{value}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[240px] max-w-md flex-1">{searchBox}</div>
          <div className="w-[260px] max-w-full">{periodControl}</div>
          {chipRow}
          <div className="ml-auto text-sm tabular-nums text-[var(--m3-on-surface-variant)]" aria-live="polite">
            {plural(rows.length, 'achat')}
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] bg-[var(--m3-surface-container)]">
          <div className="max-h-[62vh] overflow-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--m3-surface-container-high)] text-xs text-[var(--m3-on-surface-variant)] shadow-[0_1px_0_var(--m3-outline-variant)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Date</th>
                  <th scope="col" className="px-4 py-3 font-medium">Fournisseur</th>
                  <th scope="col" className="px-4 py-3 font-medium">Articles</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Qté</th>
                  <th scope="col" className="px-4 py-3 font-medium">Paiement</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
                  <th scope="col" className="px-4 py-3 font-medium">Statut</th>
                  <th scope="col" className="w-20 px-3 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const cancelled = p.statut === 'annulee';
                  const meta = paymentMeta(p.paiement);
                  const PayIcon = meta?.icon ?? Banknote;
                  return (
                    <tr
                      key={p.id}
                      className={
                        'border-b border-[var(--m3-outline-variant)]/60 align-top transition-colors last:border-b-0 motion-reduce:transition-none ' +
                        (cancelled ? 'bg-[var(--m3-surface-container-low)] text-[var(--m3-on-surface-variant)]' : 'hover:bg-[var(--m3-surface-container-high)]')
                      }
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="tabular-nums">{fmtDate(p.date)}</div>
                        <div className="text-xs tabular-nums text-[var(--m3-on-surface-variant)]">{fmtTime12(p.date)}</div>
                      </td>
                      <td className="max-w-[220px] px-4 py-3">
                        <div className="truncate font-medium">{p.fournisseur}</div>
                        {p.reference && <div className="text-xs text-[var(--m3-on-surface-variant)]">{p.reference}</div>}
                      </td>
                      <td className="min-w-[260px] px-4 py-3">
                        <div className="space-y-0.5">
                          {p.lignes.map((l, i) => (
                            <div key={i} className="flex justify-between gap-4">
                              <span className={cancelled ? 'line-through' : ''}>
                                <span className="tabular-nums text-[var(--m3-on-surface-variant)]">{l.qte} ×</span> {l.nom}
                                <span className="ml-1 text-xs text-[var(--m3-on-surface-variant)]">@ {fmtHTG(l.coutUnitaire)}</span>
                              </span>
                              <span className="tabular-nums text-[var(--m3-on-surface-variant)]">{fmtHTG(l.sousTotal)}</span>
                            </div>
                          ))}
                        </div>
                        {p.note && <div className="mt-1 text-xs text-[var(--m3-on-surface-variant)]">{p.note}</div>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{qtyOf(p)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[var(--m3-secondary-container)] px-3 text-xs font-medium text-[var(--m3-on-secondary-container)]">
                          <PayIcon size={14} />
                          {meta?.label ?? p.paiement}
                        </span>
                      </td>
                      <td className={'whitespace-nowrap px-4 py-3 text-right text-base font-semibold tabular-nums ' + (cancelled ? 'line-through' : 'text-[var(--m3-primary)]')}>
                        {fmtHTG(p.total)}
                      </td>
                      <td className="px-4 py-3">{statusChip(cancelled)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => setToCancel(p)}
                            disabled={cancelled}
                            className={`${deskIconBtn} ${cancelled ? 'opacity-40' : 'text-[#BA1A1A]'}`}
                            aria-label="Annuler l'achat"
                            title={cancelled ? 'Achat déjà annulé' : "Annuler l'achat"}
                          >
                            <M3StateLayer />
                            <Undo2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8}>{emptyState}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {sheetOpen && <PurchaseSheet products={branchProducts} suppliers={suppliers} defaultDate={selectedDate} onAdd={onAdd} onClose={() => setSheetOpen(false)} />}

      {toCancel && (
        <div className="m3-scrim fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Annuler l'achat"
            style={M3_VARS}
            className="m3-pop w-full max-w-sm rounded-[32px] bg-[var(--m3-surface-container-high)] p-6 text-[var(--m3-on-surface)] shadow-[0_8px_10px_-6px_rgba(0,0,0,0.2),0_16px_24px_2px_rgba(0,0,0,0.14)]"
          >
            <span className="mb-4 flex h-14 w-14 -rotate-6 items-center justify-center rounded-[20px] bg-[#FFDAD6] text-[#410002]">
              <Undo2 size={26} />
            </span>
            <div className="text-2xl font-bold leading-8">Annuler cet achat ?</div>
            <p className="mt-3 text-sm leading-5 text-[var(--m3-on-surface-variant)]">
              {toCancel.fournisseur} • {fmtHTG(toCancel.total)} • {plural(qtyOf(toCancel), 'unité')}. Les quantités seront retirées du stock et l'achat ne comptera plus dans les totaux.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
              <button
                onClick={() => setToCancel(null)}
                className={`group relative h-12 flex-1 overflow-hidden rounded-full bg-[var(--m3-secondary-container)] text-sm font-semibold text-[var(--m3-on-secondary-container)] m3-press motion-reduce:transition-none ${M3_FOCUS}`}
              >
                <M3StateLayer />
                Retour
              </button>
              <button
                onClick={() => {
                  onCancel(toCancel);
                  setToCancel(null);
                }}
                className={`group relative h-12 flex-1 overflow-hidden rounded-full bg-[#BA1A1A] text-sm font-semibold text-white m3-press motion-reduce:transition-none ${M3_FOCUS}`}
              >
                <M3StateLayer />
                Annuler l'achat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




