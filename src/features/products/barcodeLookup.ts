import { CATEGORIES } from './constants';

export type CodeInfo = {
  nom: string;
  categorie?: string;
};

/**
 * Normalise a code for comparison: UPC-A (12 digits) and EAN-13 differ only by a
 * leading zero, so numeric codes are compared without leading zeros.
 */
export function normalizeCode(raw: string): string {
  const code = raw.trim();
  return /^\d+$/.test(code) ? code.replace(/^0+/, '') : code.toLowerCase();
}

const OFF_URL = 'https://world.openfoodfacts.org/api/v2/product';

type OffResponse = {
  status?: number;
  product?: {
    product_name?: string;
    product_name_fr?: string;
    brands?: string;
    quantity?: string;
    categories_tags?: string[];
  };
};

/**
 * Best-effort lookup of a retail barcode (EAN/UPC) in Open Food Facts.
 * Only covers food and drinks; returns null for anything else, on network
 * errors, on timeout or when aborted. Never throws.
 */
export async function lookupProductByCode(code: string, signal?: AbortSignal): Promise<CodeInfo | null> {
  if (!/^\d{8,14}$/.test(code)) return null;

  const timeout = new AbortController();
  const timer = window.setTimeout(() => timeout.abort(), 5000);
  const onAbort = () => timeout.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const fields = 'product_name,product_name_fr,brands,quantity,categories_tags';
    const res = await fetch(`${OFF_URL}/${code}.json?fields=${fields}`, { signal: timeout.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as OffResponse;
    const product = data.status === 1 ? data.product : undefined;
    if (!product) return null;

    const base = (product.product_name_fr || product.product_name || '').trim();
    if (!base) return null;
    const brand = (product.brands ?? '').split(',')[0]?.trim() ?? '';
    const quantity = (product.quantity ?? '').trim();
    const parts = [base];
    if (brand && !base.toLowerCase().includes(brand.toLowerCase())) parts.push(brand);
    if (quantity && !base.toLowerCase().includes(quantity.toLowerCase())) parts.push(quantity);

    // Open Food Facts only contains food and drinks, so map to the two matching categories.
    const tags = product.categories_tags ?? [];
    const isDrink = tags.includes('en:beverages');
    const categorie = isDrink ? 'Boissons Gazeuse' : 'Produits alimentaires';

    return {
      nom: parts.join(' '),
      categorie: (CATEGORIES as readonly string[]).includes(categorie) ? categorie : undefined,
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
