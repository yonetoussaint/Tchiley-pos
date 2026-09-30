import { useState } from 'react';
import { X } from 'lucide-react';
import { M3_FOCUS } from '../../components/ui/focus';
import { M3StateLayer, M3_VARS } from '../../components/ui/theme';
import { PAYMENT_METHODS, type PaymentMethodId } from '../sales/paymentMethods';
import { creditBalance } from '../sales/creditUtils';
import type { SaleRecord } from '../sales/types';
import { fmtHTG } from '../../shared/currency';

export function CreditPaymentModal({
  title,
  sales,
  onClose,
  onConfirm,
}: {
  title: string;
  sales: SaleRecord[];
  onClose: () => void;
  onConfirm: (montant: number, mode: PaymentMethodId) => void;
}) {
  const balance = sales.reduce((sum, sale) => sum + creditBalance(sale), 0);
  const [montant, setMontant] = useState<string>(String(balance));
  const [mode, setMode] = useState<PaymentMethodId>('especes');
  const value = parseFloat(montant) || 0;
  const valid = value > 0 && value <= balance;
  const history = sales.length === 1 ? sales[0].paiementsCredit ?? [] : [];

  return (
    <div className="m3-scrim fixed inset-0 z-[95] flex items-center justify-center bg-black/40 p-4 ">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Encaisser un paiement"
        style={M3_VARS}
        className="m3-pop max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-[32px] bg-[var(--m3-surface-container-high)] text-[var(--m3-on-surface)] shadow-[0_8px_10px_-6px_rgba(0,0,0,0.2),0_16px_24px_2px_rgba(0,0,0,0.14)]      "
      >
        <div className="flex items-start justify-between gap-3 px-6 pb-2 pt-6    ">
          <div className="min-w-0">
            <div className="text-sm font-medium text-[var(--m3-on-surface-variant)]     ">Encaisser un paiement</div>
            <div className="mt-1 truncate text-2xl font-bold leading-8    ">{title}</div>
          </div>
          <button
            onClick={onClose}
            className={`group relative -mr-2 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)]         ${M3_FOCUS}`}
            aria-label="Fermer"
          >
            <M3StateLayer className="" />
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-4 ">
          <div className="flex items-baseline justify-between rounded-[24px] bg-[var(--m3-tertiary-container)] px-4 py-3 text-[var(--m3-on-tertiary-container)]    ">
            <span className="text-sm font-medium   ">Solde dû</span>
            <span className="text-3xl font-bold tabular-nums    ">{fmtHTG(balance)}</span>
          </div>

          <div>
            <label className="mb-1.5 block px-1 text-xs font-medium text-[var(--m3-on-surface-variant)]     ">Montant reçu (HTG)</label>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max={balance}
              value={montant}
              onChange={(event) => setMontant(event.target.value)}
              className="h-14 w-full rounded-2xl bg-[var(--m3-surface-container-highest)] px-4 text-lg font-semibold tabular-nums outline-none focus:ring-2 focus:ring-[var(--m3-primary)]           "
            />
            <div className="mt-2 flex gap-2  ">
              <button
                type="button"
                onClick={() => setMontant(String(balance))}
                className={`group relative h-9 overflow-hidden rounded-full bg-[var(--m3-secondary-container)] px-4 text-sm font-medium text-[var(--m3-on-secondary-container)] m3-press motion-reduce:transition-none            ${M3_FOCUS}`}
              >
                <M3StateLayer className="" />
                Tout payer
              </button>
              <button
                type="button"
                onClick={() => setMontant(String(Math.round(balance / 2)))}
                className={`group relative h-9 overflow-hidden rounded-full bg-[var(--m3-secondary-container)] px-4 text-sm font-medium text-[var(--m3-on-secondary-container)] m3-press motion-reduce:transition-none            ${M3_FOCUS}`}
              >
                <M3StateLayer className="" />
                Moitié
              </button>
            </div>
            {value > balance && <div className="mt-1.5 px-1 text-xs font-medium text-[#BA1A1A]     ">Le montant dépasse le solde dû.</div>}
          </div>

          <div>
            <div className="mb-1.5 px-1 text-xs font-medium text-[var(--m3-on-surface-variant)]     ">Mode de paiement</div>
            <div className="grid grid-cols-3 gap-0.5 ">
              {PAYMENT_METHODS.filter((m) => m.id !== 'credit').map((m, idx, arr) => {
                const selected = mode === m.id;
                /* Connected button group: selected = full pill, others = small inner corners. */
                const shape = selected
                  ? 'rounded-full'
                  : idx === 0
                    ? 'rounded-l-full rounded-r-lg'
                    : idx === arr.length - 1
                      ? 'rounded-r-full rounded-l-lg'
                      : 'rounded-lg';
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setMode(m.id)}
                    className={
                      `group relative h-12 overflow-hidden px-1 text-sm font-semibold m3-morph ${shape} ${M3_FOCUS} ` +
                      '        ' +
                      (selected
                        ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]  '
                        : 'bg-[var(--m3-surface-container-highest)] text-[var(--m3-on-surface)]   ')
                    }
                  >
                    <M3StateLayer className="" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {sales.length > 1 && (
            <div className="text-xs text-[var(--m3-on-surface-variant)]  ">
              Le paiement est appliqué d'abord aux ventes les plus anciennes ({sales.length} ventes impayées).
            </div>
          )}

          {history.length > 0 && (
            <div className="border-t border-[var(--m3-outline-variant)] pt-3  ">
              <div className="mb-1 text-xs font-medium text-[var(--m3-on-surface-variant)]     ">Paiements déjà reçus</div>
              {history.map((payment) => (
                <div key={payment.id} className="flex justify-between text-sm ">
                  <span>
                    {payment.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} •{' '}
                    {PAYMENT_METHODS.find((m) => m.id === payment.mode)?.label}
                  </span>
                  <span className="tabular-nums text-[var(--m3-primary)] ">{fmtHTG(payment.montant)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 px-6 pb-6 pt-2    ">
          <button
            onClick={onClose}
            className={`group relative h-12 flex-1 overflow-hidden rounded-full bg-[var(--m3-secondary-container)] text-sm font-semibold text-[var(--m3-on-secondary-container)] m3-press motion-reduce:transition-none           ${M3_FOCUS}`}
          >
            <M3StateLayer className="" />
            Annuler
          </button>
          <button
            disabled={!valid}
            onClick={() => onConfirm(value, mode)}
            className={
              `group relative h-12 flex-1 overflow-hidden rounded-full text-sm font-semibold m3-press motion-reduce:transition-none        ${M3_FOCUS} ` +
              (valid
                ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]   '
                : 'cursor-not-allowed bg-[var(--m3-surface-container-highest)] text-[var(--m3-on-surface-variant)] opacity-60   ')
            }
          >
            <M3StateLayer className="" />
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
