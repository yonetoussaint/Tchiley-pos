import type { PaymentMethodId } from './paymentMethods';

export type SaleLine = {
  produitId?: string;
  nom: string;
  qte: number;
  prix: number;
  sousTotal: number;
  cout?: number;
};

export type CreditPayment = {
  id: string;
  date: Date;
  montant: number;
  mode: PaymentMethodId;
};

export type SaleRecord = {
  id: string;
  date: Date;
  branchId: string;
  lignes: SaleLine[];
  total: number;
  paiement: PaymentMethodId | string;
  recu: number;
  monnaie: number;
  remise?: number;
  client?: string;
  paiementsCredit?: CreditPayment[];
  statut?: 'valide' | 'annulee';
  reference?: string;
};
