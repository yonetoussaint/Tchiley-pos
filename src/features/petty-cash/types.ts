export type PettyKind = 'depense' | 'reappro';

export type PettyEntry = {
  id: string;
  branchId: string;
  date: Date;
  kind: PettyKind;
  categorie: string;
  montant: number;
  note?: string;
  recu?: string;
  coffreId?: string;
};

export type PettyCount = {
  id: string;
  branchId: string;
  date: Date;
  theorique: number;
  compte: number;
  ecart: number;
  note?: string;
};
