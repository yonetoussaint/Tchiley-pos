import { ALL_BRANCHES, type Product, type ProductMovement } from '../products/types';

export type InventoryLine = {
  productId: string;
  nom: string;
  unite: string;
  /** Signed stock change applied by the count. */
  delta: number;
  /** Signed value of the change at purchase price (negative = loss). */
  value: number;
};

export type InventorySession = {
  id: string;
  date: Date;
  /** Optional note typed when validating, without the "Inventaire jj/mm/aaaa" prefix. */
  note: string;
  lines: InventoryLine[];
  loss: number;
  gain: number;
  net: number;
  cancelled: boolean;
};

export type InventoryTotals = { sessions: number; products: number; loss: number; gain: number; net: number };

const noteOf = (raw: string) => raw.replace(/^Inventaire \d{1,2}\/\d{1,2}\/\d{4}\s*·?\s*/, '').trim();

/** Value of one entry at the purchase price in force when it was recorded (signed like the stock change). */
const valueOf = (entry: ProductMovement, delta: number) => (entry.unitCost != null ? delta * entry.unitCost : Math.sign(delta) * entry.amount);

/**
 * Validated inventory counts of a branch that fall in the period, newest first. An undone count stays in the
 * list but is flagged `cancelled` and left out of the totals, since its corrections were reversed.
 */
export function summarizeInventory(
  movements: ProductMovement[],
  products: Product[],
  branchId: string,
  inPeriod: (date: Date) => boolean
): { sessions: InventorySession[]; totals: InventoryTotals } {
  const names = new Map(products.map((p) => [p.id, p]));
  const bySession = new Map<string, ProductMovement[]>();

  movements
    .filter((m) => m.kind === 'count' && (m.branchId === branchId || m.branchId === ALL_BRANCHES))
    .forEach((m) => {
      /* Entries without a session id (older data) are grouped by the moment they were validated. */
      const id = m.session ?? `t-${m.date.getTime()}`;
      bySession.set(id, [...(bySession.get(id) ?? []), m]);
    });

  const sessions: InventorySession[] = [];
  bySession.forEach((entries, id) => {
    const original = entries.filter((e) => !e.reversal);
    if (original.length === 0) return;
    const date = original.reduce((first, e) => (e.date < first ? e.date : first), original[0].date);
    if (!inPeriod(date)) return;

    const lines: InventoryLine[] = original.map((e) => {
      const delta = e.delta ?? 0;
      const product = names.get(e.productId);
      return { productId: e.productId, nom: product?.nom ?? 'Produit supprimé', unite: product?.unite ?? '', delta, value: valueOf(e, delta) };
    });
    lines.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

    const loss = lines.filter((l) => l.value < 0).reduce((sum, l) => sum + l.value, 0);
    const gain = lines.filter((l) => l.value > 0).reduce((sum, l) => sum + l.value, 0);
    sessions.push({
      id,
      date,
      note: noteOf(original[0].note),
      lines,
      loss,
      gain,
      net: loss + gain,
      cancelled: entries.some((e) => e.reversal),
    });
  });

  sessions.sort((a, b) => b.date.getTime() - a.date.getTime());
  const live = sessions.filter((s) => !s.cancelled);
  const totals: InventoryTotals = {
    sessions: live.length,
    products: live.reduce((sum, s) => sum + s.lines.length, 0),
    loss: live.reduce((sum, s) => sum + s.loss, 0),
    gain: live.reduce((sum, s) => sum + s.gain, 0),
    net: live.reduce((sum, s) => sum + s.net, 0),
  };
  return { sessions, totals };
}
