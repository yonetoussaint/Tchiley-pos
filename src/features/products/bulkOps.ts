import type { Product } from './types';

/* ------------------------------------------------------------------------------ SKU */

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** 3-letter prefix from the category: "Quincaillerie" -> QUI, "Blocs & Briques" -> BLO. */
export function skuPrefix(categorie: string): string {
  const word = stripAccents(categorie).toUpperCase().match(/[A-Z]{3,}/)?.[0];
  return word ? word.slice(0, 3) : 'PRD';
}

/**
 * SKUs like QUI-0001, numbered per prefix and continuing after the highest one already used,
 * so generated SKUs never collide with existing ones (or with each other).
 */
export function generateSkus(targets: { id: string; categorie: string }[], existing: Iterable<string>): { id: string; sku: string }[] {
  const used = new Set<string>();
  const maxByPrefix = new Map<string, number>();
  for (const raw of existing) {
    const sku = raw.trim().toUpperCase();
    if (!sku) continue;
    used.add(sku);
    const m = sku.match(/^([A-Z0-9]+)-(\d+)$/);
    if (m) maxByPrefix.set(m[1], Math.max(maxByPrefix.get(m[1]) ?? 0, Number(m[2])));
  }
  return targets.map(({ id, categorie }) => {
    const prefix = skuPrefix(categorie);
    let n = (maxByPrefix.get(prefix) ?? 0) + 1;
    let sku = `${prefix}-${String(n).padStart(4, '0')}`;
    while (used.has(sku)) {
      n += 1;
      sku = `${prefix}-${String(n).padStart(4, '0')}`;
    }
    used.add(sku);
    maxByPrefix.set(prefix, n);
    return { id, sku };
  });
}

/* ------------------------------------------------------------------------ Bulk edit */

export type PriceMode = 'none' | 'increase' | 'decrease' | 'set';

export type BulkEditInput = {
  /** Empty string = leave the category alone. */
  categorie: string;
  priceMode: PriceMode;
  /** Percentage for increase/decrease, HTG for set. */
  priceValue: number;
  /** null = leave the alert threshold alone. */
  seuil: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function bulkPatch(product: Product, input: BulkEditInput): Partial<Product> {
  const patch: Partial<Product> = {};
  if (input.categorie && input.categorie !== product.categorie) patch.categorie = input.categorie;

  if (input.priceMode !== 'none' && input.priceValue > 0) {
    let prix = product.prix;
    if (input.priceMode === 'increase') prix = product.prix * (1 + input.priceValue / 100);
    else if (input.priceMode === 'decrease') prix = product.prix * (1 - input.priceValue / 100);
    else prix = input.priceValue;
    prix = round2(Math.max(0, prix));
    if (prix !== product.prix) patch.prix = prix;
  }

  if (input.seuil !== null && input.seuil !== product.seuil) patch.seuil = Math.max(0, input.seuil);
  return patch;
}

/** Products that would end up selling below their purchase price after the edit. */
export function belowCost(product: Product, patch: Partial<Product>): boolean {
  const prix = patch.prix ?? product.prix;
  return product.prixAchat > 0 && prix < product.prixAchat;
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n > 1 ? pluralWord : word}`;
}
