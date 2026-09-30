import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Barcode, Check, Hash, Minus, Pencil, Printer, Trash2, Undo2, X } from 'lucide-react';
import { M3_FOCUS } from '../../components/ui/focus';
import { M3StateLayer, M3_VARS } from '../../components/ui/theme';
import { CATEGORIES } from './constants';
import { belowCost, bulkPatch, plural, type BulkEditInput, type PriceMode } from './bulkOps';
import type { Product } from './types';

/* ------------------------------------------------------------------------ Checkbox */

/** Visual-only checkbox mark (for rows that are already a button). */
export function SelectMark({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[2px] border-2 ${
        checked ? 'border-[var(--m3-primary)] bg-[var(--m3-primary)] text-[var(--m3-on-primary)]' : 'border-[var(--m3-on-surface-variant)]'
      }`}
    >
      {checked && <Check size={13} strokeWidth={3} />}
    </span>
  );
}

type SelectBoxProps = {
  checked: boolean;
  indeterminate?: boolean;
  onToggle: () => void;
  label: string;
};

export function SelectBox({ checked, indeterminate = false, onToggle, label }: SelectBoxProps) {
  const on = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={`group relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full ${M3_FOCUS}`}
    >
      <M3StateLayer />
      <span
        aria-hidden="true"
        className={`flex h-[18px] w-[18px] items-center justify-center rounded-[2px] border-2 ${
          on ? 'border-[var(--m3-primary)] bg-[var(--m3-primary)] text-[var(--m3-on-primary)]' : 'border-[var(--m3-on-surface-variant)]'
        }`}
      >
        {indeterminate ? <Minus size={13} strokeWidth={3} /> : checked ? <Check size={13} strokeWidth={3} /> : null}
      </span>
    </button>
  );
}

/* ---------------------------------------------------------------------------- Dock */

export type Snack = { message: string; undo?: () => void };

type BulkDockProps = {
  active: boolean;
  count: number;
  visibleTotal: number;
  needCodes: number;
  needSkus: number;
  snack: Snack | null;
  onSnackClose: () => void;
  onExit: () => void;
  onToggleAll: () => void;
  onGenerateCodes: () => void;
  onGenerateSkus: () => void;
  onLabels: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

/* Floating selection bar (+ snackbar with undo). Sits above the bottom nav on phones. */
export function BulkDock({
  active,
  count,
  visibleTotal,
  needCodes,
  needSkus,
  snack,
  onSnackClose,
  onExit,
  onToggleAll,
  onGenerateCodes,
  onGenerateSkus,
  onLabels,
  onEdit,
  onDelete,
}: BulkDockProps) {
  useEffect(() => {
    if (!snack) return;
    const timer = window.setTimeout(onSnackClose, 8000);
    return () => window.clearTimeout(timer);
  }, [snack, onSnackClose]);

  if (!active && !snack) return null;

  const none = count === 0;
  const act = `group relative flex h-11 shrink-0 items-center gap-2 overflow-hidden rounded-full px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${M3_FOCUS}`;

  return createPortal(
    <div
      style={M3_VARS}
      className="pointer-events-none fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 sm:bottom-6"
    >
      {snack && (
        <div
          role="status"
          className="pointer-events-auto flex w-full max-w-[560px] items-center gap-2 rounded-2xl bg-[var(--m3-on-surface)] py-1 pl-4 pr-1 text-sm text-[var(--m3-surface)] shadow-[0_3px_8px_3px_rgba(0,0,0,0.15)]"
        >
          <span className="min-w-0 flex-1 py-2">{snack.message}</span>
          {snack.undo && (
            <button
              type="button"
              onClick={snack.undo}
              className={`group relative flex h-10 shrink-0 items-center gap-1.5 overflow-hidden rounded-full px-3 font-semibold text-[var(--m3-primary-container)] ${M3_FOCUS}`}
            >
              <M3StateLayer />
              <Undo2 size={16} aria-hidden="true" />
              Annuler
            </button>
          )}
          <button
            type="button"
            onClick={onSnackClose}
            aria-label="Fermer"
            className={`group relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full ${M3_FOCUS}`}
          >
            <M3StateLayer />
            <X size={18} />
          </button>
        </div>
      )}

      {active && (
        <div
          role="toolbar"
          aria-label="Actions groupées"
          className="pointer-events-auto w-full max-w-[720px] rounded-[28px] bg-[var(--m3-surface-container-highest)] p-2 text-[var(--m3-on-surface)] shadow-[0_3px_8px_3px_rgba(0,0,0,0.15),0_1px_3px_rgba(0,0,0,0.3)]"
        >
          <div className="flex items-center gap-1">
            <button type="button" onClick={onExit} aria-label="Quitter la sélection" className={`group relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full ${M3_FOCUS}`}>
              <M3StateLayer />
              <X size={22} />
            </button>
            <div className="min-w-0 flex-1 text-base font-medium" aria-live="polite">
              {none ? 'Aucun produit sélectionné' : plural(count, 'sélectionné')}
            </div>
            <button type="button" onClick={onToggleAll} disabled={visibleTotal === 0} className={`${act} text-[var(--m3-primary)]`}>
              <M3StateLayer />
              {count === visibleTotal && visibleTotal > 0 ? 'Aucun' : 'Tout'}
            </button>
          </div>

          <div className="mt-1 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:justify-center">
            <button type="button" onClick={onGenerateCodes} disabled={none} className={`${act} bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]`}>
              <M3StateLayer />
              <Barcode size={18} aria-hidden="true" />
              Codes-barres
              {needCodes > 0 && <span className="rounded-full bg-[var(--m3-primary)] px-1.5 text-xs tabular-nums text-[var(--m3-on-primary)]">{needCodes}</span>}
            </button>
            <button type="button" onClick={onGenerateSkus} disabled={none} className={`${act} bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]`}>
              <M3StateLayer />
              <Hash size={18} aria-hidden="true" />
              SKU
              {needSkus > 0 && <span className="rounded-full bg-[var(--m3-primary)] px-1.5 text-xs tabular-nums text-[var(--m3-on-primary)]">{needSkus}</span>}
            </button>
            <button type="button" onClick={onLabels} disabled={none} className={`${act} border border-[var(--m3-outline)] text-[var(--m3-primary)]`}>
              <M3StateLayer />
              <Printer size={18} aria-hidden="true" />
              Étiquettes
            </button>
            <button type="button" onClick={onEdit} disabled={none} className={`${act} border border-[var(--m3-outline)] text-[var(--m3-primary)]`}>
              <M3StateLayer />
              <Pencil size={18} aria-hidden="true" />
              Modifier
            </button>
            <button type="button" onClick={onDelete} disabled={none} className={`${act} text-[var(--m3-error,#BA1A1A)]`}>
              <M3StateLayer />
              <Trash2 size={18} aria-hidden="true" />
              Supprimer
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

/* --------------------------------------------------------------------- Bulk edit */

type BulkEditDialogProps = {
  products: Product[];
  categories: string[];
  onApply: (message: string, patches: { id: string; patch: Partial<Product> }[]) => void;
  onClose: () => void;
};

const PRICE_MODES: { id: PriceMode; label: string }[] = [
  { id: 'none', label: 'Inchangé' },
  { id: 'increase', label: 'Hausse %' },
  { id: 'decrease', label: 'Baisser %' },
  { id: 'set', label: 'Fixer (HTG)' },
];

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

const fieldShell =
  'block min-w-0 rounded-xl bg-[var(--m3-surface)] px-4 pb-1.5 pt-2 ring-1 ring-[var(--m3-outline)] transition-shadow focus-within:ring-2 focus-within:ring-[var(--m3-primary)]';

export function BulkEditDialog({ products, categories, onApply, onClose }: BulkEditDialogProps) {
  useEscape(onClose);
  const [categorie, setCategorie] = useState('');
  const [priceMode, setPriceMode] = useState<PriceMode>('none');
  const [priceText, setPriceText] = useState('');
  const [seuilText, setSeuilText] = useState('');

  const options = useMemo(() => {
    const base = (CATEGORIES as readonly string[]).filter((c) => c !== 'Tout');
    return Array.from(new Set([...base, ...categories]));
  }, [categories]);

  const input: BulkEditInput = {
    categorie,
    priceMode,
    priceValue: Number(priceText.replace(',', '.')) || 0,
    seuil: seuilText.trim() === '' ? null : Math.max(0, Math.floor(Number(seuilText) || 0)),
  };

  const plan = useMemo(() => {
    const entries = products.map((product) => ({ product, patch: bulkPatch(product, input) }));
    const changed = entries.filter((entry) => Object.keys(entry.patch).length > 0);
    const underCost = changed.filter((entry) => belowCost(entry.product, entry.patch));
    return { changed, underCost };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, categorie, priceMode, priceText, seuilText]);

  const priceNeedsValue = priceMode !== 'none' && input.priceValue <= 0;
  const decreaseTooBig = priceMode === 'decrease' && input.priceValue >= 100;
  const blocked = priceNeedsValue || decreaseTooBig || plan.underCost.length > 0;
  const canApply = plan.changed.length > 0 && !blocked;

  const apply = () => {
    if (!canApply) return;
    onApply(`${plural(plan.changed.length, 'produit modifié', 'produits modifiés')}`, plan.changed.map(({ product, patch }) => ({ id: product.id, patch })));
    onClose();
  };

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
        aria-labelledby="bulk-edit-title"
        className="m3-dialog max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] bg-[var(--m3-surface-container-low)] px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 text-[var(--m3-on-surface)] shadow-[0_8px_24px_rgba(0,0,0,0.2)] sm:max-w-[480px] sm:rounded-[28px] sm:pb-6 sm:pt-6"
      >
        <div aria-hidden="true" className="mx-auto mb-4 h-1 w-8 rounded-full bg-[var(--m3-on-surface-variant)] opacity-40 sm:hidden" />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 id="bulk-edit-title" className="text-2xl leading-8">Modifier en groupe</h3>
            <p className="text-sm text-[var(--m3-on-surface-variant)]">{plural(products.length, 'produit')} · les champs vides restent inchangés.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className={`group relative -mr-2 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}>
            <M3StateLayer />
            <X size={20} />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <label className={fieldShell}>
            <span className="block text-xs leading-4 text-[var(--m3-on-surface-variant)]">Catégorie</span>
            <select value={categorie} onChange={(event) => setCategorie(event.target.value)} className="h-8 w-full bg-transparent p-0 text-base text-[var(--m3-on-surface)] outline-none">
              <option value="">Ne pas changer</option>
              {options.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <div>
            <div className="mb-2 text-xs font-medium tracking-[0.03em] text-[var(--m3-on-surface-variant)]">Prix de vente</div>
            <div role="group" aria-label="Type d'ajustement du prix" className="grid grid-cols-2 gap-1 sm:grid-cols-4">
              {PRICE_MODES.map((mode) => {
                const on = priceMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPriceMode(mode.id)}
                    className={`group relative flex h-10 items-center justify-center overflow-hidden rounded-full px-2 text-sm font-medium m3-morph ${M3_FOCUS} ${
                      on ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]' : 'border border-[var(--m3-outline)] text-[var(--m3-on-surface-variant)]'
                    }`}
                  >
                    <M3StateLayer />
                    {mode.label}
                  </button>
                );
              })}
            </div>
            {priceMode !== 'none' && (
              <label className={`${fieldShell} mt-2`}>
                <span className="block text-xs leading-4 text-[var(--m3-on-surface-variant)]">{priceMode === 'set' ? 'Nouveau prix (HTG)' : 'Pourcentage'}</span>
                <input
                  value={priceText}
                  onChange={(event) => setPriceText(event.target.value)}
                  inputMode="decimal"
                  autoFocus
                  placeholder={priceMode === 'set' ? 'ex. 250' : 'ex. 10'}
                  className="h-8 w-full bg-transparent p-0 text-base tabular-nums text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)]"
                />
              </label>
            )}
          </div>

          <label className={fieldShell}>
            <span className="block text-xs leading-4 text-[var(--m3-on-surface-variant)]">Seuil d'alerte</span>
            <input
              value={seuilText}
              onChange={(event) => setSeuilText(event.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric"
              placeholder="Ne pas changer"
              className="h-8 w-full bg-transparent p-0 text-base tabular-nums text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)]"
            />
          </label>
        </div>

        {(priceNeedsValue || decreaseTooBig || plan.underCost.length > 0) && (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-2xl bg-[var(--m3-error-container,#FFDAD6)] px-4 py-3 text-sm text-[var(--m3-on-error-container,#410002)]">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              {priceNeedsValue
                ? 'Entrez une valeur supérieure à 0 pour le prix.'
                : decreaseTooBig
                  ? 'La baisse doit être inférieure à 100 %.'
                  : `${plural(plan.underCost.length, 'produit')} passerai${plan.underCost.length > 1 ? 'ent' : 't'} sous le prix d'achat (ex. « ${plan.underCost[0].product.nom} »). Ajustez le prix.`}
            </span>
          </div>
        )}

        <p className="mt-4 text-sm text-[var(--m3-on-surface-variant)]" aria-live="polite">
          {plan.changed.length === 0 ? 'Aucune modification pour le moment.' : `${plural(plan.changed.length, 'produit sera modifié', 'produits seront modifiés')}. Vous pourrez annuler juste après.`}
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={`group relative h-10 overflow-hidden rounded-full px-4 text-sm font-medium text-[var(--m3-primary)] ${M3_FOCUS}`}>
            <M3StateLayer />
            Annuler
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!canApply}
            className={`group relative h-10 overflow-hidden rounded-full bg-[var(--m3-primary)] px-6 text-sm font-medium text-[var(--m3-on-primary)] disabled:cursor-not-allowed disabled:opacity-40 ${M3_FOCUS}`}
          >
            <M3StateLayer />
            Appliquer
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------- Bulk delete */

type BulkDeleteDialogProps = {
  products: Product[];
  onConfirm: () => void;
  onClose: () => void;
};

export function BulkDeleteDialog({ products, onConfirm, onClose }: BulkDeleteDialogProps) {
  useEscape(onClose);
  const preview = products.slice(0, 3).map((p) => `« ${p.nom || 'Sans nom'} »`);
  const rest = products.length - preview.length;
  return createPortal(
    <div
      role="presentation"
      style={M3_VARS}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/[0.32] p-6"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="bulk-delete-title"
        aria-describedby="bulk-delete-desc"
        className="m3-dialog w-full max-w-[312px] rounded-[28px] bg-[var(--m3-surface-container-high)] p-6 text-[var(--m3-on-surface)] shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
      >
        <span aria-hidden="true" className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--m3-error-container,#FFDAD6)] text-[var(--m3-error,#BA1A1A)]">
          <Trash2 size={24} />
        </span>
        <h3 id="bulk-delete-title" className="text-center text-2xl leading-8">Supprimer {plural(products.length, 'produit')} ?</h3>
        <p id="bulk-delete-desc" className="mt-3 text-center text-sm leading-5 text-[var(--m3-on-surface-variant)]">
          {preview.join(', ')}
          {rest > 0 ? ` et ${rest} autre${rest > 1 ? 's' : ''}` : ''} seront retirés de l'inventaire. Cette action est définitive.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" autoFocus onClick={onClose} className={`group relative h-10 overflow-hidden rounded-full px-4 text-sm font-medium text-[var(--m3-primary)] ${M3_FOCUS}`}>
            <M3StateLayer />
            Annuler
          </button>
          <button type="button" onClick={onConfirm} className={`group relative h-10 overflow-hidden rounded-full px-4 text-sm font-medium text-[var(--m3-error,#BA1A1A)] ${M3_FOCUS}`}>
            <M3StateLayer />
            Supprimer
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
