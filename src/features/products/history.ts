import type { PurchaseRecord } from '../purchases/types';
import type { SaleRecord } from '../sales/types';
import { ALL_BRANCHES, type Product, type ProductHistoryEntry, type ProductMovement, type ProductPriceField } from './types';

/** Edits to the same field within this window are merged into a single history entry. */
const COALESCE_MS = 2 * 60 * 1000;

/* ------------------------------------------------------------------ Building the timeline */

type BuildInput = {
  branchId: string;
  products: Product[];
  /** Every sale of the branch, cancelled ones included. */
  sales: SaleRecord[];
  achats: PurchaseRecord[];
  movements: ProductMovement[];
};

/** All history of every product of a branch, newest first: sales, purchases, restocks, corrections, price edits. */
export function buildProductHistory({ branchId, products, sales, achats, movements }: BuildInput): Record<string, ProductHistoryEntry[]> {
  const map: Record<string, ProductHistoryEntry[]> = {};
  const add = (productId: string, entry: ProductHistoryEntry) => {
    (map[productId] ??= []).push(entry);
  };
  const byName = new Map(products.map((p) => [p.nom.toLowerCase(), p.id]));

  sales.forEach((sale) => {
    sale.lignes.forEach((line, index) => {
      const productId = line.produitId ?? byName.get(line.nom.toLowerCase());
      if (!productId) return;
      add(productId, {
        id: `sale-${sale.id}-${index}`,
        branchId: sale.branchId,
        productId,
        date: sale.date,
        kind: 'sale',
        qty: line.qte,
        note: sale.id,
        amount: line.sousTotal,
        unitPrice: line.prix,
        unitCost: line.cout,
        cancelled: sale.statut === 'annulee',
        client: sale.client?.trim() || undefined,
      });
    });
  });

  achats
    .filter((purchase) => purchase.branchId === branchId)
    .forEach((purchase) => {
      purchase.lignes.forEach((line, index) => {
        add(line.produitId, {
          id: `purchase-${purchase.id}-${index}`,
          branchId: purchase.branchId,
          productId: line.produitId,
          date: purchase.date,
          kind: 'purchase',
          qty: line.qte,
          note: purchase.fournisseur,
          amount: line.sousTotal,
          unitPrice: line.coutUnitaire,
          cancelled: purchase.statut === 'annulee',
        });
      });
    });

  movements
    .filter((entry) => entry.branchId === branchId || entry.branchId === ALL_BRANCHES)
    .forEach((entry) => add(entry.productId, entry));

  Object.values(map).forEach((entries) => entries.sort((a, b) => b.date.getTime() - a.date.getTime()));
  return map;
}

/* ------------------------------------------------------------------------- Stock maths */

/** Effect of an entry on the stock (cancelled sales/purchases net out to zero). */
export function stockDelta(entry: ProductHistoryEntry): number {
  if (entry.cancelled || entry.kind === 'price') return 0;
  if (entry.delta != null) return entry.delta;
  return entry.kind === 'sale' ? -entry.qty : entry.qty;
}

/**
 * Stock level after each entry, rebuilt backwards from the current stock.
 * `entries` must be sorted newest first.
 */
export function withStockBalance(entries: ProductHistoryEntry[], currentStock: number): ProductHistoryEntry[] {
  let running = currentStock;
  return entries.map((entry) => {
    const stockAfter = running;
    running -= stockDelta(entry);
    return { ...entry, stockAfter };
  });
}

/* ------------------------------------------------------------------------------ Totals */

export type ProductHistoryStats = {
  soldQty: number;
  soldRevenue: number;
  soldProfit: number;
  boughtQty: number;
  boughtCost: number;
  lastPurchase: ProductHistoryEntry | null;
  lastSale: ProductHistoryEntry | null;
  priceChanges: number;
};

export function summarizeHistory(entries: ProductHistoryEntry[], fallbackCost: number): ProductHistoryStats {
  const stats: ProductHistoryStats = {
    soldQty: 0, soldRevenue: 0, soldProfit: 0, boughtQty: 0, boughtCost: 0, lastPurchase: null, lastSale: null, priceChanges: 0,
  };
  entries.forEach((entry) => {
    if (entry.kind === 'price') stats.priceChanges += 1;
    if (entry.cancelled) return;
    if (entry.kind === 'sale') {
      stats.soldQty += entry.qty;
      stats.soldRevenue += entry.amount;
      stats.soldProfit += entry.amount - entry.qty * (entry.unitCost ?? fallbackCost);
      stats.lastSale ??= entry;
    } else if (entry.kind === 'purchase') {
      stats.boughtQty += entry.qty;
      stats.boughtCost += entry.amount;
      stats.lastPurchase ??= entry;
    }
  });
  return stats;
}

/* -------------------------------------------------------------------- Recording changes */

let counter = 0;
const newId = (prefix: string) => `${prefix}-${Date.now()}-${(counter += 1)}`;

/**
 * Add a movement to the log. Entries carrying a `coalesceKey` merge with the latest entry
 * of the same key recorded within the last two minutes: manual stock corrections add their
 * deltas up, price edits keep the first `from` and the last `to`. An edit that ends up
 * back where it started removes the entry altogether.
 */
export function recordMovement(prev: ProductMovement[], entry: ProductMovement): ProductMovement[] {
  const key = entry.coalesceKey;
  if (!key) return [{ ...entry, id: entry.id || newId(entry.kind) }, ...prev];

  const at = prev.findIndex((m) => m.coalesceKey === key && entry.date.getTime() - m.date.getTime() <= COALESCE_MS);
  if (at === -1) return [{ ...entry, id: entry.id || newId(entry.kind) }, ...prev];

  const existing = prev[at];
  let merged: ProductMovement;
  if (entry.kind === 'price') {
    if (existing.from === entry.to) return prev.filter((_, i) => i !== at);
    merged = { ...existing, to: entry.to, date: entry.date };
  } else {
    const delta = (existing.delta ?? 0) + (entry.delta ?? 0);
    if (delta === 0) return prev.filter((_, i) => i !== at);
    merged = { ...existing, delta, qty: Math.abs(delta), date: entry.date };
  }
  return [merged, ...prev.filter((_, i) => i !== at)];
}

/** Price edits and new products found by comparing two snapshots of the product list. */
export function diffProducts(before: Product[], after: Product[], now = new Date()): ProductMovement[] {
  const old = new Map(before.map((p) => [p.id, p]));
  const out: ProductMovement[] = [];
  const fields: [ProductPriceField, string][] = [['prix', 'Prix de vente'], ['prixAchat', "Prix d'achat"]];

  after.forEach((product) => {
    const prev = old.get(product.id);
    if (!prev) {
      out.push({
        id: newId('created'),
        branchId: ALL_BRANCHES,
        productId: product.id,
        date: now,
        kind: 'created',
        qty: product.stockFermeture,
        delta: product.stockFermeture,
        note: 'Produit créé',
        amount: 0,
        unitPrice: product.prix,
        unitCost: product.prixAchat,
      });
      return;
    }
    fields.forEach(([field, label]) => {
      if (prev[field] === product[field]) return;
      out.push({
        id: newId('price'),
        branchId: ALL_BRANCHES,
        productId: product.id,
        date: now,
        kind: 'price',
        qty: 0,
        amount: 0,
        field,
        from: prev[field],
        to: product[field],
        note: label,
        coalesceKey: `price-${product.id}-${field}`,
      });
    });
  });
  return out;
}

/* ----------------------------------------------------------------------------- Display */

export const KIND_LABEL: Record<ProductHistoryEntry['kind'], string> = {
  sale: 'Vente',
  purchase: 'Achat',
  restock: 'Réappro.',
  manual: 'Ajustement',
  count: 'Inventaire',
  price: 'Prix',
  created: 'Création',
};

export const fmtPrice = (n: number) =>
  new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 2 }).format(n) + ' HTG';
