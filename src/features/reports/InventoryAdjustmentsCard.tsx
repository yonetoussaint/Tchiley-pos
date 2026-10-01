import { useMemo, useState } from 'react';
import { ChevronDown, ClipboardCheck } from 'lucide-react';
import { M3_FOCUS } from '../../components/ui/focus';
import { M3StateLayer } from '../../components/ui/theme';
import { fmtHTG } from '../../shared/currency';
import { fmtTime12 } from '../../shared/dates';
import type { Product, ProductMovement } from '../products/types';
import { summarizeInventory } from './inventoryAdjustments';
import type { ReportPeriod } from './cash';

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;

/**
 * Stock corrections made by physical counts during the report period. These move the stock and the
 * value of the stock, never the cash: they are listed apart from the cash report on purpose.
 */
export function InventoryAdjustmentsCard({
  period,
  selectedDate,
  branchId,
  movements,
  products,
}: {
  period: ReportPeriod;
  selectedDate: Date;
  branchId: string;
  movements: ProductMovement[];
  products: Product[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const day = selectedDate.getDate();

  const { sessions, totals } = useMemo(() => {
    const inPeriod =
      period === 'daily'
        ? (d: Date) => d.getFullYear() === year && d.getMonth() === month && d.getDate() === day
        : period === 'monthly'
          ? (d: Date) => d.getFullYear() === year && d.getMonth() === month
          : (d: Date) => d.getFullYear() === year;
    return summarizeInventory(movements, products, branchId, inPeriod);
  }, [movements, products, branchId, period, year, month, day]);

  if (sessions.length === 0) return null;

  const periodWord = period === 'daily' ? 'du jour' : period === 'monthly' ? 'du mois' : "de l'année";

  return (
    <section aria-labelledby="inv-adj-title" className="rounded-[28px] bg-[var(--m3-surface-container-low)] p-4 text-[var(--m3-on-surface)] sm:p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]">
          <ClipboardCheck size={20} />
        </span>
        <div className="min-w-0">
          <h3 id="inv-adj-title" className="text-base font-medium">Écarts d'inventaire {periodWord}</h3>
          <p className="text-xs text-[var(--m3-on-surface-variant)]">Corrections de stock après comptage physique. Valeurs au prix d'achat, sans effet sur la caisse.</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          ['Manque', fmtHTG(totals.loss), 'text-[var(--m3-error,#BA1A1A)]'],
          ['Surplus', fmtHTG(totals.gain), 'text-[var(--m3-primary)]'],
          ['Impact net', fmtHTG(totals.net), totals.net < 0 ? 'text-[var(--m3-error,#BA1A1A)]' : 'text-[var(--m3-on-surface)]'],
        ].map(([label, value, tone]) => (
          <div key={label} className="min-w-0 rounded-2xl bg-[var(--m3-surface-container)] px-3 py-2.5">
            <div className="text-xs text-[var(--m3-on-surface-variant)]">{label}</div>
            <div className={`mt-0.5 truncate text-sm font-semibold tabular-nums ${tone}`}>{value}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 px-1 text-xs text-[var(--m3-on-surface-variant)]">
        Un manque est une perte de marchandise (casse, vol, erreur) : il réduit le bénéfice réel même s'il ne change pas l'argent en caisse.
      </p>

      <ul className="mt-3 space-y-2">
        {sessions.map((session) => {
          const open = openId === session.id;
          return (
            <li key={session.id} className={`overflow-hidden rounded-2xl bg-[var(--m3-surface-container)] ${session.cancelled ? 'opacity-60' : ''}`}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : session.id)}
                className={`group relative flex w-full items-center gap-3 overflow-hidden px-3 py-3 text-left ${M3_FOCUS}`}
              >
                <M3StateLayer />
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-sm font-medium ${session.cancelled ? 'line-through' : ''}`}>
                    {period === 'daily' ? fmtTime12(session.date) : session.date.toLocaleDateString('fr-FR')}
                    {session.note ? ` · ${session.note}` : ''}
                  </div>
                  <div className="text-xs text-[var(--m3-on-surface-variant)]">
                    {session.lines.length} correction{session.lines.length > 1 ? 's' : ''}
                    {session.cancelled ? ' · Annulé, stock rétabli' : ''}
                  </div>
                </div>
                <div className={`shrink-0 text-sm font-semibold tabular-nums ${session.cancelled ? 'line-through' : session.net < 0 ? 'text-[var(--m3-error,#BA1A1A)]' : ''}`}>{fmtHTG(session.net)}</div>
                <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-[var(--m3-on-surface-variant)] transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <ul className="space-y-1 border-t border-[var(--m3-outline-variant)] px-3 py-2">
                  {session.lines.map((line) => (
                    <li key={line.productId} className="flex items-center justify-between gap-3 py-1 text-xs">
                      <span className="min-w-0 truncate">{line.nom}</span>
                      <span className="shrink-0 tabular-nums">
                        <span className={line.delta < 0 ? 'text-[var(--m3-error,#BA1A1A)]' : 'text-[var(--m3-primary)]'}>{signed(line.delta)} {line.unite}</span>
                        <span className="ml-2 text-[var(--m3-on-surface-variant)]">{fmtHTG(line.value)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
