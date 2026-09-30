import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Minus, Plus, Printer, Search, Sparkles, X } from 'lucide-react';
import { M3_FOCUS } from '../../components/ui/focus';
import { M3StateLayer, M3_VARS } from '../../components/ui/theme';
import { generateInternalCode } from './barcodeGen';
import { LABEL_FORMATS, labelCss, labelsMarkup, printLabels, type LabelFormat, type LabelItem } from './labelPrint';
import type { Product } from './types';

type Assignment = { id: string; code: string };

type LabelPrintDialogProps = {
  products: Product[];
  /** Products ticked when the dialog opens (e.g. the one whose "Étiquette" button was tapped). */
  initialIds: string[];
  /** Persist generated codes on their products. */
  onApplyCodes: (assignments: Assignment[]) => void;
  onClose: () => void;
};

const hasCode = (product: Product) => Boolean(product.codeBarres?.trim());

export function LabelPrintDialog({ products, initialIds, onApplyCodes, onClose }: LabelPrintDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialIds));
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [format, setFormat] = useState<LabelFormat>('sheet');
  const [showPrice, setShowPrice] = useState(true);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const missingCount = useMemo(() => products.filter((p) => !hasCode(p)).length, [products]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (onlyMissing && hasCode(p)) return false;
      if (!q) return true;
      return p.nom.toLowerCase().includes(q) || p.categorie.toLowerCase().includes(q) || (p.codeBarres ?? '').toLowerCase().includes(q);
    });
  }, [products, query, onlyMissing]);

  const selectedProducts = useMemo(() => products.filter((p) => selected.has(p.id)), [products, selected]);
  const selectedMissing = selectedProducts.filter((p) => !hasCode(p));
  const copiesOf = (id: string) => copies[id] ?? 1;

  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((p) => next.delete(p.id));
      else visible.forEach((p) => next.add(p.id));
      return next;
    });

  const setCopiesFor = (id: string, value: number) => setCopies((prev) => ({ ...prev, [id]: Math.min(99, Math.max(1, value)) }));

  /* Internal codes for the given products, unique against every code in use. */
  const makeAssignments = (targets: Product[]): Assignment[] => {
    const inUse = products.map((p) => p.codeBarres ?? '');
    const out: Assignment[] = [];
    targets.forEach((p) => {
      const code = generateInternalCode([...inUse, ...out.map((a) => a.code)]);
      out.push({ id: p.id, code });
    });
    return out;
  };

  const buildItems = (assigned: Record<string, string>): LabelItem[] =>
    selectedProducts.map((p) => ({
      nom: p.nom,
      categorie: p.categorie,
      prix: p.prix,
      unite: p.unite,
      code: assigned[p.id] ?? (p.codeBarres ?? '').trim(),
      copies: copiesOf(p.id),
    }));

  const generateSelected = () => {
    if (!selectedMissing.length) return;
    onApplyCodes(makeAssignments(selectedMissing));
  };

  const handlePrint = () => {
    if (!selectedProducts.length) return;
    const assignments = makeAssignments(selectedMissing);
    if (assignments.length) onApplyCodes(assignments);
    const assigned = Object.fromEntries(assignments.map((a) => [a.id, a.code]));
    printLabels(buildItems(assigned), { format, showPrice });
  };

  /* Live preview of the first selected label (shows the code it would get if it has none yet). */
  const first = selectedProducts[0];
  const previewItem: LabelItem | null = first
    ? {
        nom: first.nom,
        categorie: first.categorie,
        prix: first.prix,
        unite: first.unite,
        code: hasCode(first) ? (first.codeBarres ?? '').trim() : makeAssignments([first])[0].code,
        copies: 1,
      }
    : null;

  const total = selectedProducts.reduce((sum, p) => sum + copiesOf(p.id), 0);
  const iconBtn = `group relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-primary)] ${M3_FOCUS}`;

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
        aria-labelledby="label-dialog-title"
        className="m3-dialog flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-[var(--m3-surface-container-low)] text-[var(--m3-on-surface)] shadow-[0_8px_24px_rgba(0,0,0,0.2)] sm:max-h-[90dvh] sm:max-w-[640px] sm:rounded-[28px]"
      >
        {/* Header */}
        <div className="shrink-0 px-6 pb-3 pt-3 sm:pt-6">
          <div aria-hidden="true" className="mx-auto mb-3 h-1 w-8 rounded-full bg-[var(--m3-on-surface-variant)] opacity-40 sm:hidden" />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 id="label-dialog-title" className="text-2xl leading-8">Étiquettes code-barres</h3>
              <p className="text-sm text-[var(--m3-on-surface-variant)]">Pour les rayons : sable, blocs, fer et autres articles sans code.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Fermer" className={`group relative -mr-2 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}>
              <M3StateLayer />
              <X size={20} />
            </button>
          </div>

          <div className="mt-3 flex h-12 items-center gap-3 rounded-full bg-[var(--m3-surface-container-high)] px-4 focus-within:ring-2 focus-within:ring-[var(--m3-primary)]">
            <Search className="h-5 w-5 shrink-0 text-[var(--m3-on-surface-variant)]" aria-hidden="true" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un produit..."
              className="w-full min-w-0 border-none bg-transparent text-sm outline-none placeholder:text-[var(--m3-on-surface-variant)]"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {[
              { id: false, label: 'Tous', count: products.length },
              { id: true, label: 'Sans code', count: missingCount },
            ].map((chip) => {
              const on = onlyMissing === chip.id;
              return (
                <button key={String(chip.id)} type="button" aria-pressed={on} onClick={() => setOnlyMissing(chip.id)} className={`group relative shrink-0 ${M3_FOCUS}`}>
                  <span
                    className={`relative flex h-9 items-center gap-2 overflow-hidden px-3.5 text-sm font-medium m3-morph ${
                      on
                        ? 'rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
                        : 'rounded-xl border border-[var(--m3-outline)] text-[var(--m3-on-surface-variant)]'
                    }`}
                  >
                    <M3StateLayer />
                    {on && <Check size={16} aria-hidden="true" />}
                    {chip.label}
                    <span className="text-xs tabular-nums opacity-70">{chip.count}</span>
                  </span>
                </button>
              );
            })}
            <div className="flex-1" />
            <button type="button" onClick={toggleAllVisible} disabled={!visible.length} className={`group relative h-9 overflow-hidden rounded-full px-3 text-sm font-medium text-[var(--m3-primary)] disabled:opacity-40 ${M3_FOCUS}`}>
              <M3StateLayer />
              {allVisibleSelected ? 'Désélectionner' : 'Tout sélectionner'}
            </button>
          </div>
        </div>

        {/* Product list */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
          {visible.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-[var(--m3-on-surface-variant)]">
              {onlyMissing ? 'Tous les produits ont déjà un code.' : 'Aucun produit trouvé.'}
            </p>
          )}
          <ul className="space-y-1">
            {visible.map((p) => {
              const on = selected.has(p.id);
              const code = (p.codeBarres ?? '').trim();
              return (
                <li key={p.id} className={`flex items-center gap-1 rounded-2xl pr-2 ${on ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]' : ''}`}>
                  <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(p.id)} className={`group relative flex min-h-[56px] min-w-0 flex-1 items-center gap-3 overflow-hidden rounded-2xl px-3 py-2 text-left ${M3_FOCUS}`}>
                    <M3StateLayer />
                    <span
                      aria-hidden="true"
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border-2 ${on ? 'border-[var(--m3-primary)] bg-[var(--m3-primary)] text-[var(--m3-on-primary)]' : 'border-[var(--m3-outline)]'}`}
                    >
                      {on && <Check size={14} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.nom || 'Sans nom'}</span>
                      <span className="block truncate text-xs tabular-nums text-[var(--m3-on-surface-variant)]">
                        {code ? code : <span className="font-medium text-[#7B5800]">Pas de code — sera généré</span>}
                        <span className="text-[var(--m3-on-surface-variant)]"> · {p.categorie}</span>
                      </span>
                    </span>
                  </button>
                  {on && (
                    <div className="flex shrink-0 items-center" role="group" aria-label={`Nombre d'étiquettes pour ${p.nom}`}>
                      <button type="button" onClick={() => setCopiesFor(p.id, copiesOf(p.id) - 1)} disabled={copiesOf(p.id) <= 1} aria-label="Moins d'étiquettes" className={`${iconBtn} disabled:opacity-30`}>
                        <M3StateLayer />
                        <Minus size={18} />
                      </button>
                      <span className="w-7 text-center text-sm font-semibold tabular-nums" aria-live="polite">{copiesOf(p.id)}</span>
                      <button type="button" onClick={() => setCopiesFor(p.id, copiesOf(p.id) + 1)} aria-label="Plus d'étiquettes" className={iconBtn}>
                        <M3StateLayer />
                        <Plus size={18} />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Options, preview and actions */}
        <div className="shrink-0 space-y-3 border-t border-[var(--m3-outline-variant)] px-6 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:pb-5">
          {selectedMissing.length > 0 && (
            <div className="flex items-center gap-3 rounded-2xl bg-[var(--m3-tertiary-container)] px-4 py-2.5 text-sm text-[var(--m3-on-tertiary-container)]">
              <span className="min-w-0 flex-1">
                {selectedMissing.length} produit{selectedMissing.length > 1 ? 's' : ''} sans code : un code interne est créé et enregistré à l'impression.
              </span>
              <button type="button" onClick={generateSelected} className={`group relative flex h-9 shrink-0 items-center gap-1.5 overflow-hidden rounded-full px-3 text-sm font-semibold ${M3_FOCUS}`}>
                <M3StateLayer />
                <Sparkles size={16} aria-hidden="true" />
                Générer
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <div role="group" aria-label="Format des étiquettes" className="flex min-w-0 flex-1 gap-0.5">
              {LABEL_FORMATS.map((f, idx) => {
                const on = format === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFormat(f.id)}
                    className={`group relative flex min-h-12 flex-1 flex-col items-center justify-center overflow-hidden px-2 text-sm font-semibold m3-morph ${M3_FOCUS} ${
                      on ? 'rounded-full bg-[var(--m3-primary)] text-[var(--m3-on-primary)]' : `${idx === 0 ? 'rounded-l-full rounded-r-lg' : 'rounded-r-full rounded-l-lg'} bg-[var(--m3-surface-container-high)]`
                    }`}
                  >
                    <M3StateLayer />
                    <span>{f.label}</span>
                    <span className="text-[10px] font-normal opacity-75">{f.hint}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" role="switch" aria-checked={showPrice} onClick={() => setShowPrice((v) => !v)} className={`group relative flex h-12 items-center gap-3 overflow-hidden rounded-full px-3 text-sm font-medium ${M3_FOCUS}`}>
              <M3StateLayer />
              <span
                aria-hidden="true"
                className={`flex h-6 w-10 items-center rounded-full px-0.5 transition-colors ${showPrice ? 'bg-[var(--m3-primary)]' : 'border-2 border-[var(--m3-outline)]'}`}
              >
                <span className={`h-4 w-4 rounded-full transition-transform ${showPrice ? 'translate-x-4 bg-[var(--m3-on-primary)]' : 'bg-[var(--m3-outline)]'}`} />
              </span>
              Prix
            </button>
          </div>

          {previewItem && (
            <div className="flex items-center gap-4 rounded-2xl bg-[var(--m3-surface-container)] p-3">
              <style>{labelCss(format)}</style>
              <div className="shrink-0 overflow-hidden rounded-sm shadow-[0_1px_3px_rgba(0,0,0,0.3)]" dangerouslySetInnerHTML={{ __html: labelsMarkup([previewItem], { format, showPrice }) }} />
              <p className="min-w-0 text-xs text-[var(--m3-on-surface-variant)]">Aperçu de la première étiquette. Les pointillés servent de repère de découpe.</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className={`group relative h-12 overflow-hidden rounded-full border border-[var(--m3-outline)] px-6 text-sm font-medium text-[var(--m3-primary)] ${M3_FOCUS}`}>
              <M3StateLayer />
              Fermer
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={selectedProducts.length === 0}
              className={`group relative flex h-12 items-center gap-2 overflow-hidden rounded-full bg-[var(--m3-primary)] px-6 text-sm font-semibold text-[var(--m3-on-primary)] disabled:cursor-not-allowed disabled:opacity-40 ${M3_FOCUS}`}
            >
              <M3StateLayer />
              <Printer size={18} aria-hidden="true" />
              {selectedProducts.length === 0 ? 'Imprimer' : `Imprimer ${total} étiquette${total > 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
