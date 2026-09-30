import type { SaleRecord } from '../sales/types';

export type CashEntryType = 'consommation' | 'achat' | 'renflouement' | 'remboursement';

export type CashEntry = {
  id: string;
  branchId: string;
  date: Date;
  type: CashEntryType;
  montant: number;
  note?: string;
};

export const CASH_ENTRY_META: Record<CashEntryType, { label: string; sign: -1 | 1 }> = {
  consommation: { label: 'Consommation interne', sign: -1 },
  achat: { label: 'Achat', sign: -1 },
  renflouement: { label: 'Renflouement', sign: 1 },
  remboursement: { label: 'Remboursement', sign: 1 },
};

export type ReportPeriod = 'daily' | 'monthly' | 'annual';

export const REPORT_TABS: Array<{ id: ReportPeriod; label: string; short: string }> = [
  { id: 'daily', label: 'Rapport Journalier', short: 'J' },
  { id: 'monthly', label: 'Rapport Mensuel', short: 'M' },
  { id: 'annual', label: 'Rapport Annuel', short: 'A' },
];

export type CashSummary = {
  brut: number;
  credits: number;
  consommations: number;
  achats: number;
  renflouements: number;
  remboursements: number;
  cashNet: number;
  mobile: number;
  cashEnMain: number;
  nbVentes: number;
};

export function summarizeCash(ventes: SaleRecord[], entries: CashEntry[], inPeriod: (date: Date) => boolean): CashSummary {
  const sales = ventes.filter((sale) => sale.statut !== 'annulee' && inPeriod(sale.date));
  const brut = sales.reduce((sum, sale) => sum + sale.total, 0);
  const credits = sales.filter((sale) => sale.paiement === 'credit').reduce((sum, sale) => sum + sale.total, 0);
  const mobileSales = sales
    .filter((sale) => sale.paiement === 'moncash' || sale.paiement === 'natcash')
    .reduce((sum, sale) => sum + sale.total, 0);

  const repayments = ventes
    .filter((sale) => sale.statut !== 'annulee')
    .flatMap((sale) => sale.paiementsCredit ?? [])
    .filter((payment) => inPeriod(payment.date));
  const repaymentsTotal = repayments.reduce((sum, payment) => sum + payment.montant, 0);
  const repaymentsMobile = repayments
    .filter((payment) => payment.mode === 'moncash' || payment.mode === 'natcash')
    .reduce((sum, payment) => sum + payment.montant, 0);

  const inRange = entries.filter((entry) => inPeriod(entry.date));
  const sumOf = (type: CashEntryType) => inRange.filter((entry) => entry.type === type).reduce((sum, entry) => sum + entry.montant, 0);
  const consommations = sumOf('consommation');
  const achats = sumOf('achat');
  const renflouements = sumOf('renflouement');
  const remboursements = sumOf('remboursement') + repaymentsTotal;

  const cashNet = brut - credits - consommations - achats + renflouements + remboursements;
  const mobile = mobileSales + repaymentsMobile;
  return {
    brut,
    credits,
    consommations,
    achats,
    renflouements,
    remboursements,
    cashNet,
    mobile,
    cashEnMain: cashNet - mobile,
    nbVentes: sales.length,
  };
}
