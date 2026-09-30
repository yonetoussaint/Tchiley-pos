export type Branch = {
  id: string;
  nom: string;
  ville: string;
  adresse: string;
  gestionnaire: string;
  statut: 'Ouvert' | 'Fermé';
  ventesDuJour: number;
  alertesStock: number;
  motDePasse: string;
};