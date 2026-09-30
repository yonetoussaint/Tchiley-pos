import { CupSoda, Package, Wheat, Wrench } from 'lucide-react';

export const CATEGORIES = [
  'Tout',
  'Ciment & Béton',
  'Fer & Acier',
  'Blocs & Briques',
  'Plomberie',
  'Peinture',
  'Bois',
  'Électricité',
  'Outils',
  'Quincaillerie',
  'Boissons Gazeuse',
  'Produits alimentaires',
] as const;

export function categoryIcon(categorie: string) {
  if (categorie === 'Quincaillerie') return Wrench;
  if (categorie === 'Boissons Gazeuse') return CupSoda;
  if (categorie === 'Produits alimentaires') return Wheat;
  return Package;
}
