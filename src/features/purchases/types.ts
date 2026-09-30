import type { PaymentMethodId } from '../sales/paymentMethods';

export type PurchaseLine = {
  produitId: string;
  nom: string;
  unite: string;
  qte: number;
  coutUnitaire: number;
  sousTotal: number;
};

export type PurchaseRecord = {
  id: string;
  branchId: string;
  date: Date;
  fournisseur: string;
  reference?: string;
  lignes: PurchaseLine[];
  total: number;
  paiement: PaymentMethodId;
  note?: string;
  statut?: 'valide' | 'annulee';
};
