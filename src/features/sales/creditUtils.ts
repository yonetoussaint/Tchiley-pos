import type { SaleRecord } from './types';

export const creditPaid = (sale: SaleRecord) => (sale.paiementsCredit ?? []).reduce((sum, payment) => sum + payment.montant, 0);
export const creditBalance = (sale: SaleRecord) => Math.max(sale.total - creditPaid(sale), 0);
