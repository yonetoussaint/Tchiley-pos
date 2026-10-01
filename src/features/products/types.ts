export type Product = {
  id: string;
  nom: string;
  categorie: string;
  prix: number;
  prixAchat: number;
  stockOuverture: number;
  stockFermeture: number;
  seuil: number;
  unite: string;
  image?: string;
  /** EAN/UPC barcode or QR payload, used to find the product by scan. */
  codeBarres?: string;
  /** Internal stock-keeping reference, e.g. QUI-0001. */
  sku?: string;
};

export type ProductMovementKind = 'sale' | 'purchase' | 'restock' | 'manual' | 'count' | 'price' | 'created';

export type ProductPriceField = 'prix' | 'prixAchat';

/** Branch id used for entries that concern the product itself (price edits, creation), not one branch. */
export const ALL_BRANCHES = '*';

export type ProductHistoryEntry = {
  id: string;
  branchId: string;
  productId: string;
  date: Date;
  kind: ProductMovementKind;
  /** Absolute quantity moved (0 for price entries). */
  qty: number;
  note: string;
  amount: number;
  /** Signed stock change, when it can't be inferred from `kind` (manual corrections, creation). */
  delta?: number;
  /** Sale price / purchase cost per unit at the time of the movement. */
  unitPrice?: number;
  /** Cost of goods per unit at the time of a sale (when recorded). */
  unitCost?: number;
  /** Price entries: which price changed and its old/new value (`from` is null on creation). */
  field?: ProductPriceField;
  from?: number | null;
  to?: number;
  /** Sale or purchase that was cancelled afterwards: shown struck through, no effect on stock or totals. */
  cancelled?: boolean;
  client?: string;
  /** Rapid successive edits with the same key merge into one entry (typing in a live field). */
  coalesceKey?: string;
  /** Stock level right after this entry (filled in by `withStockBalance`). */
  stockAfter?: number;
};

export type ProductMovement = ProductHistoryEntry;
