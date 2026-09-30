import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type ReceiptSale = {
  id: string;
  statut?: string;
  paiement: string;
  client?: string;
  date: Date;
  lignes: { qte: number; nom: string; sousTotal: number; prix: number }[];
  total: number;
  remise?: number;
  recu: number;
  monnaie: number;
};

type ReceiptModalProps = {
  sale: ReceiptSale;
  onClose: () => void;
  paymentLabel: string;
  formatCurrency: (amount: number) => string;
  creditBalance: number;
};

export function ReceiptModal({ sale, onClose, paymentLabel, formatCurrency, creditBalance }: ReceiptModalProps) {
  const cancelled = sale.statut === 'annulee';

  return createPortal(
    <div className="receipt-print fixed inset-0 z-[95] flex items-center justify-center bg-black/55 p-4">
      <div className="max-h-full w-full max-w-md overflow-y-auto border-2 border-[#16181A] bg-white p-4 shadow-[8px_8px_0_#16181A]">
        <div className="flex items-start justify-between border-b-2 border-[#16181A] pb-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#4B5560]">Ticket de vente</div>
            <div className="mt-1 font-serif text-[26px] leading-none text-[#16181A]">Tchiley</div>
          </div>
          <button onClick={onClose} className="print-close mt-1 text-[#4B5560] hover:text-[#C1440E]" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        {cancelled && (
          <div className="mt-3 border-2 border-[#C1440E] bg-[#FDF1EC] px-3 py-1.5 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-[#C1440E]">
            Vente annulée
          </div>
        )}

        <div className="mt-4 space-y-1 text-[12px] text-[#4B5560]">
          <div className="flex justify-between">
            <span>Réf.</span>
            <span className="font-semibold text-[#16181A]">{sale.id}</span>
          </div>
          <div className="flex justify-between">
            <span>Date</span>
            <span>{sale.date.toLocaleString('fr-HT')}</span>
          </div>
          <div className="flex justify-between">
            <span>Paiement</span>
            <span>{paymentLabel}</span>
          </div>
          {sale.client && (
            <div className="flex justify-between">
              <span>Client</span>
              <span className="font-semibold text-[#16181A]">{sale.client}</span>
            </div>
          )}
        </div>

        <div className="mt-5 border-t-2 border-b-2 border-[#16181A] py-3">
          <div className="mb-2 flex justify-between text-[11px] uppercase tracking-[0.18em] text-[#4B5560]">
            <span>Article</span>
            <span>Montant</span>
          </div>

          {sale.lignes.map((line, index) => (
            <div key={`${sale.id}-${index}`} className="mb-2 space-y-1 text-[13px]">
              <div className="flex justify-between gap-3">
                <span className="pr-2">{line.qte} × {line.nom}</span>
                <span>{formatCurrency(line.sousTotal)}</span>
              </div>
              <div className="text-right text-[11px] text-[#4B5560]">{formatCurrency(line.prix)} / unité</div>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2 text-[13px]">
          <div className="flex justify-between">
            <span className="text-[#4B5560]">Sous-total</span>
            <span>{formatCurrency(sale.total + (sale.remise ?? 0))}</span>
          </div>
          {(sale.remise ?? 0) > 0 && (
            <div className="flex justify-between text-[#C1440E]">
              <span>Remise</span>
              <span>- {formatCurrency(sale.remise ?? 0)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-[#c7c2b4] pt-2">
            <span className="text-[#4B5560]">Reçu</span>
            <span>{formatCurrency(sale.recu)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#4B5560]">Monnaie</span>
            <span className="font-medium text-[#2F6B4F]">{formatCurrency(sale.monnaie)}</span>
          </div>
          <div className="flex justify-between border-t-2 border-[#16181A] pt-3 font-serif text-[22px]">
            <span>Total</span>
            <span className={cancelled ? 'line-through' : ''}>{formatCurrency(sale.total)}</span>
          </div>
          {sale.paiement === 'credit' && !cancelled && (
            <div className="flex justify-between border-t border-[#c7c2b4] pt-2 text-[#C1440E]">
              <span>Solde dû</span>
              <span className="font-medium">{formatCurrency(creditBalance)}</span>
            </div>
          )}
        </div>

        <div className="print-actions mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 border-2 border-[#16181A] bg-white py-2.5 text-[14px] hover:bg-[#ECE7DC]">
            Fermer
          </button>
          <button
            onClick={() => window.print()}
            className="flex-1 border-2 border-[#16181A] bg-[#2F6B4F] py-2.5 text-[14px] font-medium text-white hover:bg-[#255a40]"
          >
            Imprimer
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
