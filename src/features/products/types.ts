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
};

export type ProductMovementKind = 'sale' | 'purchase' | 'restock' | 'manual';

export type ProductHistoryEntry = {
  id: string;
  branchId: string;
  productId: string;
  date: Date;
  kind: ProductMovementKind;
  qty: number;
  note: string;
  amount: number;
};

export type ProductMovement = ProductHistoryEntry;
