import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowLeft, Check, ClipboardCheck, Eye, EyeOff, Minus, Plus, ScanLine, Search, X } from 'lucide-react';
import { M3_FOCUS } from '../../components/ui/focus';
import { M3StateLayer, M3_VARS } from '../../components/ui/theme';
import { fmtHTG } from '../../shared/currency';
import { BarcodeScannerDialog } from './BarcodeScannerDialog';
import { normalizeCode } from './barcodeLookup';
import { isLargeGap, planCorrections, round2, varianceOf, type Correction, type CountDraft } from './inventory';
import type { Product } from './types';

type Props = {
  products: Product[];
  draft: CountDraft;
  setDraft: Dispatch<SetStateAction<CountDraft>>;
  /** Date of the last validated count of each product, when there is one. */
  lastCountById: Record<string, Date>;
  /** Apply the corrections; `note` is the optional reason typed on the review screen. */
  onValidate: (corrections: Correction[], note: string, countedProducts: number) => void;
  onClose: () => void;
};

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;

function CountRow({
  product,
  entry,
  blind,
  lastCount,
  onSet,
  onClear,
}: {
  product: Product;
  entry: CountDraft[string] | undefined;
  blind: boolean;
  lastCount: Date | undefined;
  onSet: (counted: number) => void;
  onClear: () => void;
}) {
  const counted = entry?.counted;
  /* Raw text only while the field is being edited, so "1." stays "1." and the −/+ buttons always show the real count. */
  const [typing, setTyping] = useState<string | null>(null);
  const text = typing ?? (counted == null ? '' : String(counted));

  const variance = entry ? varianceOf(entry) : 0;
  const large = entry ? isLargeGap(entry) : false;
  const stepBtn = `group relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--m3-surface-container-high)] text-[var(--m3-on-surface)] disabled:opacity-40 ${M3_FOCUS}`;

  const commit = (raw: string) => {
    setTyping(raw);
    const trimmed = raw.trim().replace(',', '.');
    if (trimmed === '') return onClear();
    const n = Number(trimmed);
    if (Number.isFinite(n) && n >= 0) onSet(round2(n));
  };

  return (
    <li
      data-count-row={product.id}
      className={`rounded-2xl px-3 py-3 ${counted == null ? 'bg-[var(--m3-surface-container)]' : variance === 0 ? 'bg-[var(--m3-primary-container)]/40' : 'bg-[var(--m3-surface-container-high)]'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{product.nom}</div>
          <div className="truncate text-xs text-[var(--m3-on-surface-variant)]">
            {product.categorie}
            {lastCount ? ` · compté le ${lastCount.toLocaleDateString('fr-FR')}` : ' · jamais compté'}
            {!blind && ` · système : ${product.stockFermeture} ${product.unite}`}
          </div>
        </div>
        {counted != null && (
          <div className="flex shrink-0 items-center gap-2">
            {!blind && (
              <span
                className={`inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold tabular-nums ${
                  variance === 0 ? 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]' : 'bg-[var(--m3-tertiary-container)] text-[var(--m3-on-tertiary-container)]'
                }`}
              >
                {large && <AlertTriangle size={12} aria-hidden="true" />}
                {variance === 0 ? 'Conforme' : signed(variance)}
              </span>
            )}
            {blind && <Check size={18} aria-label="Compté" className="text-[var(--m3-primary)]" />}
            <button type="button" onClick={() => { setTyping(null); onClear(); }} aria-label={`Recompter ${product.nom}`} title="Recompter" className={`group relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}>
              <M3StateLayer />
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button type="button" disabled={counted == null || counted <= 0} onClick={() => { setTyping(null); onSet(Math.max(0, round2((counted ?? 0) - 1))); }} aria-label="Moins un" className={stepBtn}>
          <M3StateLayer />
          <Minus size={20} />
        </button>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Quantité comptée, {product.nom}</span>
          <input
            type="text"
            inputMode="decimal"
            value={text}
            placeholder="—"
            onFocus={(event) => event.target.select()}
            onBlur={() => setTyping(null)}
            onChange={(event) => commit(event.target.value)}
            className={`h-12 w-full rounded-xl bg-[var(--m3-surface)] px-3 text-center text-xl font-semibold tabular-nums outline-none ring-1 ring-[var(--m3-outline)] focus:ring-2 focus:ring-[var(--m3-primary)]`}
          />
        </label>
        <button type="button" onClick={() => { setTyping(null); onSet(round2((counted ?? 0) + 1)); }} aria-label="Plus un" className={stepBtn}>
          <M3StateLayer />
          <Plus size={20} />
        </button>
        <span className="w-12 shrink-0 truncate text-xs text-[var(--m3-on-surface-variant)]">{product.unite}</span>
      </div>

      {counted == null && !blind && (
        <button
          type="button"
          onClick={() => onSet(product.stockFermeture)}
          className={`group relative mt-2 flex h-9 items-center gap-1.5 overflow-hidden rounded-full border border-[var(--m3-outline)] px-3 text-xs font-medium text-[var(--m3-primary)] ${M3_FOCUS}`}
        >
          <M3StateLayer />
          <Check size={14} aria-hidden="true" />
          Conforme au système
        </button>
      )}
    </li>
  );
}

export function InventoryCountDialog({ products, draft, setDraft, lastCountById, onValidate, onClose }: Props) {
  const [step, setStep] = useState<'count' | 'review'>('count');
  const [rayon, setRayon] = useState<string>('Tous');
  const [query, setQuery] = useState('');
  const [onlyTodo, setOnlyTodo] = useState(false);
  const [blind, setBlind] = useState(true);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !scanOpen) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, scanOpen]);

  const total = products.length;
  const countedIds = products.filter((p) => draft[p.id]).length;
  const corrections = useMemo(() => planCorrections(draft, products), [draft, products]);
  const netValue = corrections.reduce((sum, c) => sum + c.value, 0);
  const lossValue = corrections.filter((c) => c.value < 0).reduce((sum, c) => sum + c.value, 0);
  const gainValue = corrections.filter((c) => c.value > 0).reduce((sum, c) => sum + c.value, 0);

  /* A rayon (shelf area) is a product category. */
  const rayons = useMemo(() => {
    const map = new Map<string, { total: number; counted: number }>();
    products.forEach((p) => {
      const row = map.get(p.categorie) ?? { total: 0, counted: 0 };
      row.total += 1;
      if (draft[p.id]) row.counted += 1;
      map.set(p.categorie, row);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'));
  }, [products, draft]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (rayon !== 'Tous' && p.categorie !== rayon) return false;
      if (onlyTodo && draft[p.id]) return false;
      if (!q) return true;
      return p.nom.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q) || (p.codeBarres ?? '').toLowerCase().includes(q);
    });
  }, [products, rayon, onlyTodo, query, draft]);

  const setCounted = (product: Product, counted: number) =>
    setDraft((prev) => ({ ...prev, [product.id]: { counted, expected: prev[product.id]?.expected ?? product.stockFermeture } }));
  const clearCounted = (id: string) =>
    setDraft((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const handleScanned = (code: string) => {
    setScanOpen(false);
    const key = normalizeCode(code);
    const match = products.find((p) => p.codeBarres && normalizeCode(p.codeBarres) === key);
    if (!match) {
      setScanMessage(`Code ${code} : aucun produit correspondant.`);
      return;
    }
    setScanMessage('');
    setRayon('Tous');
    setOnlyTodo(false);
    setQuery('');
    window.setTimeout(() => {
      const row = document.querySelector<HTMLElement>(`[data-count-row="${match.id}"]`);
      row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      row?.querySelector('input')?.focus();
    }, 60);
  };

  const pillBtn = `group relative flex h-12 items-center justify-center gap-2 overflow-hidden rounded-full px-5 text-sm font-semibold ${M3_FOCUS}`;

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
        aria-labelledby="inventory-title"
        className="m3-dialog flex h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-[var(--m3-surface-container-low)] text-[var(--m3-on-surface)] shadow-[0_8px_24px_rgba(0,0,0,0.2)] sm:h-[90dvh] sm:max-w-[680px] sm:rounded-[28px]"
      >
        {/* Header */}
        <div className="shrink-0 px-6 pb-3 pt-3 sm:pt-6">
          <div aria-hidden="true" className="mx-auto mb-3 h-1 w-8 rounded-full bg-[var(--m3-on-surface-variant)] opacity-40 sm:hidden" />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 id="inventory-title" className="text-2xl leading-8">{step === 'count' ? 'Inventaire' : 'Vérification'}</h3>
              <p className="text-sm text-[var(--m3-on-surface-variant)]">
                {step === 'count' ? 'Comptez ce qui est réellement en rayon.' : 'Contrôlez les écarts avant de corriger le stock.'}
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="Fermer (le comptage est conservé)" className={`group relative -mr-2 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}>
              <M3StateLayer />
              <X size={20} />
            </button>
          </div>

          <div className="mt-3">
            <div className="flex items-baseline justify-between text-xs text-[var(--m3-on-surface-variant)]">
              <span className="tabular-nums">{countedIds} / {total} produits comptés</span>
              <span className="tabular-nums">{total > 0 ? Math.round((countedIds / total) * 100) : 0}%</span>
            </div>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={countedIds} className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--m3-surface-container-highest,var(--m3-surface-container-high))]">
              <div className="h-full rounded-full bg-[var(--m3-primary)] transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${total > 0 ? (countedIds / total) * 100 : 0}%` }} />
            </div>
          </div>

          {step === 'count' && (
            <>
              <div className="mt-3 flex items-center gap-2">
                <div className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-full bg-[var(--m3-surface-container-high)] px-4 focus-within:ring-2 focus-within:ring-[var(--m3-primary)]">
                  <Search className="h-5 w-5 shrink-0 text-[var(--m3-on-surface-variant)]" aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Nom, SKU ou code-barres"
                    aria-label="Rechercher un produit à compter"
                    className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[var(--m3-on-surface-variant)]"
                  />
                </div>
                <button type="button" onClick={() => { setScanMessage(''); setScanOpen(true); }} aria-label="Scanner un code-barres" title="Scanner" className={`group relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)] ${M3_FOCUS}`}>
                  <M3StateLayer />
                  <ScanLine size={22} />
                </button>
              </div>
              {scanMessage && <p role="status" className="mt-2 px-1 text-xs text-[var(--m3-error,#BA1A1A)]">{scanMessage}</p>}

              <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Rayons">
                {[['Tous', { total, counted: countedIds }] as const, ...rayons].map(([name, c]) => (
                  <button
                    key={name}
                    type="button"
                    role="tab"
                    aria-selected={rayon === name}
                    onClick={() => setRayon(name)}
                    className={`relative flex h-9 shrink-0 items-center gap-1.5 overflow-hidden px-3.5 text-sm font-medium ${M3_FOCUS} ${
                      rayon === name
                        ? 'rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
                        : 'rounded-xl border border-[var(--m3-outline)] text-[var(--m3-on-surface-variant)]'
                    }`}
                  >
                    <M3StateLayer />
                    {c.counted === c.total && c.total > 0 && <Check size={14} aria-hidden="true" />}
                    {name}
                    <span className="tabular-nums opacity-70">{c.counted}/{c.total}</span>
                  </button>
                ))}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" aria-pressed={blind} onClick={() => setBlind((v) => !v)} className={`group relative flex h-9 items-center gap-1.5 overflow-hidden rounded-full border border-[var(--m3-outline)] px-3 text-xs font-medium text-[var(--m3-primary)] ${M3_FOCUS}`}>
                  <M3StateLayer />
                  {blind ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                  {blind ? 'Stock système masqué' : 'Stock système visible'}
                </button>
                <button type="button" aria-pressed={onlyTodo} onClick={() => setOnlyTodo((v) => !v)} className={`group relative flex h-9 items-center gap-1.5 overflow-hidden rounded-full border border-[var(--m3-outline)] px-3 text-xs font-medium ${onlyTodo ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]' : 'text-[var(--m3-primary)]'} ${M3_FOCUS}`}>
                  <M3StateLayer />
                  {onlyTodo && <Check size={14} aria-hidden="true" />}
                  Reste à compter
                </button>
              </div>
            </>
          )}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
          {step === 'count' ? (
            visible.length === 0 ? (
              <p className="py-12 text-center text-sm text-[var(--m3-on-surface-variant)]">
                {onlyTodo && !query ? 'Tout est compté dans ce rayon.' : 'Aucun produit ne correspond.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {visible.map((product) => (
                  <CountRow
                    key={product.id}
                    product={product}
                    entry={draft[product.id]}
                    blind={blind}
                    lastCount={lastCountById[product.id]}
                    onSet={(n) => setCounted(product, n)}
                    onClear={() => clearCounted(product.id)}
                  />
                ))}
              </ul>
            )
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['Comptés', `${countedIds} / ${total}`],
                  ['Écarts', String(corrections.length)],
                  ['Écart net', fmtHTG(netValue)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-[var(--m3-surface-container)] px-3 py-2.5">
                    <div className="text-xs text-[var(--m3-on-surface-variant)]">{label}</div>
                    <div className="mt-0.5 truncate text-sm font-semibold tabular-nums">{value}</div>
                  </div>
                ))}
              </div>
              {corrections.length > 0 && (
                <p className="px-1 text-xs text-[var(--m3-on-surface-variant)]">
                  Manque : <span className="font-semibold tabular-nums text-[var(--m3-error,#BA1A1A)]">{fmtHTG(lossValue)}</span> · Surplus : <span className="font-semibold tabular-nums text-[var(--m3-primary)]">{fmtHTG(gainValue)}</span> · valeurs au prix d'achat.
                </p>
              )}

              {corrections.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]"><ClipboardCheck size={28} /></span>
                  <span className="text-base font-medium">Aucun écart</span>
                  <span className="text-sm text-[var(--m3-on-surface-variant)]">Le stock compté correspond au stock du système.</span>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {corrections.map((c) => {
                    const entry = draft[c.product.id];
                    const large = entry ? isLargeGap(entry) : false;
                    return (
                      <li key={c.product.id} className="flex items-center gap-3 rounded-2xl bg-[var(--m3-surface-container)] px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                            {large && <AlertTriangle size={14} aria-label="Écart important : à recompter ?" className="shrink-0 text-[#7B5800]" />}
                            <span className="truncate">{c.product.nom}</span>
                          </div>
                          <div className="text-xs text-[var(--m3-on-surface-variant)] tabular-nums">
                            Système {c.expected} → compté {c.counted} {c.product.unite}
                            {c.delta !== c.variance && ` (stock ramené à ${c.newStock})`}
                          </div>
                        </div>
                        <div className="shrink-0 text-right tabular-nums">
                          <div className={`text-sm font-semibold ${c.variance < 0 ? 'text-[var(--m3-error,#BA1A1A)]' : 'text-[var(--m3-primary)]'}`}>{signed(c.variance)} {c.product.unite}</div>
                          <div className="text-xs text-[var(--m3-on-surface-variant)]">{fmtHTG(c.value)}</div>
                        </div>
                        <button type="button" onClick={() => { setStep('count'); clearCounted(c.product.id); setRayon('Tous'); setQuery(c.product.nom); }} className={`group relative shrink-0 overflow-hidden rounded-full px-3 py-2 text-xs font-medium text-[var(--m3-primary)] ${M3_FOCUS}`}>
                          <M3StateLayer />
                          Recompter
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {total - countedIds > 0 && (
                <p className="rounded-2xl bg-[var(--m3-surface-container)] px-3 py-2.5 text-xs text-[var(--m3-on-surface-variant)]">
                  {total - countedIds} produit{total - countedIds > 1 ? 's' : ''} non compté{total - countedIds > 1 ? 's' : ''} : leur stock reste inchangé.
                </p>
              )}

              <label className="block rounded-xl bg-[var(--m3-surface)] px-3 pb-1 pt-2 ring-1 ring-[var(--m3-outline)] focus-within:ring-2 focus-within:ring-[var(--m3-primary)]">
                <span className="block text-xs text-[var(--m3-on-surface-variant)]">Note (facultatif)</span>
                <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex. inventaire de fin de mois" maxLength={80} className="h-8 w-full bg-transparent p-0 text-base outline-none" />
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center gap-2 border-t border-[var(--m3-outline-variant)] px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {step === 'count' ? (
            <>
              <button
                type="button"
                disabled={countedIds === 0}
                onClick={() => setDraft({})}
                className={`${pillBtn} -ml-2 px-4 text-[var(--m3-error,#BA1A1A)] disabled:opacity-40`}
              >
                <M3StateLayer />
                Tout effacer
              </button>
              <div className="flex-1" />
              <button
                type="button"
                disabled={countedIds === 0}
                onClick={() => setStep('review')}
                className={`${pillBtn} bg-[var(--m3-primary)] text-[var(--m3-on-primary)] disabled:opacity-40`}
              >
                <M3StateLayer />
                <ClipboardCheck size={18} />
                Vérifier ({countedIds})
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setStep('count')} className={`${pillBtn} -ml-2 px-4 text-[var(--m3-primary)]`}>
                <M3StateLayer />
                <ArrowLeft size={18} />
                Retour
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => onValidate(corrections, note.trim(), countedIds)}
                className={`${pillBtn} bg-[var(--m3-primary)] text-[var(--m3-on-primary)]`}
              >
                <M3StateLayer />
                <Check size={18} />
                {corrections.length === 0 ? 'Terminer' : `Valider · ${corrections.length} correction${corrections.length > 1 ? 's' : ''}`}
              </button>
            </>
          )}
        </div>
      </div>

      {scanOpen && <BarcodeScannerDialog title="Scanner un produit à compter" onDetected={handleScanned} onClose={() => setScanOpen(false)} />}
    </div>,
    document.body
  );
}
