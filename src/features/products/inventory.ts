import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { Product } from './types';

/** One counted product: what was found on the shelf, and what the system said at that moment. */
export type CountEntry = { counted: number; expected: number };
export type CountDraft = Record<string, CountEntry>;

export type Correction = {
  product: Product;
  counted: number;
  expected: number;
  /** Counted − expected: what the shelf is missing (<0) or has too much of (>0). */
  variance: number;
  /** Stock change actually applied (differs from `variance` only when it would go below 0). */
  delta: number;
  newStock: number;
  /** Value of the gap at purchase price, signed like `variance`. */
  value: number;
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const varianceOf = (entry: CountEntry) => round2(entry.counted - entry.expected);

/**
 * Corrections to apply when validating. The gap is measured against the stock the system had
 * when the product was counted and added to today's stock, so sales or purchases that happened
 * while counting are kept. Products without a gap produce nothing.
 */
export function planCorrections(draft: CountDraft, products: Product[]): Correction[] {
  const out: Correction[] = [];
  products.forEach((product) => {
    const entry = draft[product.id];
    if (!entry) return;
    const variance = varianceOf(entry);
    if (variance === 0) return;
    const newStock = Math.max(0, round2(product.stockFermeture + variance));
    const delta = round2(newStock - product.stockFermeture);
    out.push({ product, counted: entry.counted, expected: entry.expected, variance, delta, newStock, value: round2(variance * product.prixAchat) });
  });
  return out.sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || Math.abs(b.variance) - Math.abs(a.variance));
}

/** A gap worth counting twice: at least 20% of the expected quantity, or any gap on a product the system had at zero. */
export function isLargeGap(entry: CountEntry): boolean {
  const gap = Math.abs(varianceOf(entry));
  if (gap === 0) return false;
  return entry.expected <= 0 ? true : gap / entry.expected >= 0.2;
}

/* --------------------------------------------------------------------- Draft persistence */

const key = (branchId: string) => `tchiley-count-draft:${branchId}`;

export function loadDraft(branchId: string): CountDraft {
  try {
    const raw = window.localStorage.getItem(key(branchId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CountDraft;
    const clean: CountDraft = {};
    Object.entries(parsed).forEach(([id, e]) => {
      if (e && Number.isFinite(e.counted) && Number.isFinite(e.expected)) clean[id] = { counted: e.counted, expected: e.expected };
    });
    return clean;
  } catch {
    return {};
  }
}

export function saveDraft(branchId: string, draft: CountDraft): void {
  try {
    if (Object.keys(draft).length === 0) window.localStorage.removeItem(key(branchId));
    else window.localStorage.setItem(key(branchId), JSON.stringify(draft));
  } catch {
    /* storage unavailable or full: the count simply isn't kept across reloads */
  }
}

/** Count in progress for a branch: survives closing the dialog and reloading the page, and follows the branch switcher. */
export function useCountDraft(branchId: string): [CountDraft, Dispatch<SetStateAction<CountDraft>>] {
  const [state, setState] = useState(() => ({ branchId, draft: loadDraft(branchId) }));

  let current = state;
  if (state.branchId !== branchId) {
    current = { branchId, draft: loadDraft(branchId) };
    setState(current);
  }

  useEffect(() => {
    saveDraft(state.branchId, state.draft);
  }, [state]);

  const setDraft = useCallback<Dispatch<SetStateAction<CountDraft>>>(
    (action) =>
      setState((prev) => {
        const base = prev.branchId === branchId ? prev.draft : loadDraft(branchId);
        return { branchId, draft: typeof action === 'function' ? action(base) : action };
      }),
    [branchId]
  );

  return [current.draft, setDraft];
}
