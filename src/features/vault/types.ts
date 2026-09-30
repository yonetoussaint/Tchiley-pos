export type CoffreAccountId = 'especes' | 'moncash' | 'natcash';
export type CoffreKind = 'entree' | 'sortie' | 'transfert';
export type CoffrePeriod = 'jour' | 'mois' | 'annee' | 'tout';

export type CoffrePiece = {
  ref: string;
  nom: string;
  type: string;
  dataUrl?: string;
};

export type CoffreEntry = {
  id: string;
  branchId: string;
  date: Date;
  kind: CoffreKind;
  categorie: string;
  compte: CoffreAccountId;
  compteDest?: CoffreAccountId;
  montant: number;
  note?: string;
  piece?: CoffrePiece;
};
