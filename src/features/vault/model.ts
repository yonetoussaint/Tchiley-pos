import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Banknote, Plus, Smartphone } from 'lucide-react';
import type { CoffreAccountId, CoffreEntry, CoffreKind, CoffrePeriod } from './types';

export const COFFRE_ACCOUNTS: Array<{ id: CoffreAccountId; label: string; icon: typeof Banknote }> = [
  { id: 'especes', label: 'Espèces', icon: Banknote },
  { id: 'moncash', label: 'MonCash', icon: Smartphone },
  { id: 'natcash', label: 'NatCash', icon: Smartphone },
];

export const COFFRE_CATEGORIES: Record<'entree' | 'sortie', string[]> = {
  entree: ['Versement caisse', 'Renflouement', 'Remboursement client', 'Apport propriétaire', 'Solde initial', 'Autre entrée'],
  sortie: ['Achat marchandises', 'Dépense courante', 'Salaire', 'Retrait propriétaire', 'Réappro. petite caisse', 'Autre sortie'],
};

export const COFFRE_KIND_META: Record<CoffreKind, { label: string; plural: string; icon: typeof Plus }> = {
  entree: { label: 'Entrée', plural: 'Entrées', icon: ArrowDownLeft },
  sortie: { label: 'Sortie', plural: 'Sorties', icon: ArrowUpRight },
  transfert: { label: 'Transfert', plural: 'Transferts', icon: ArrowLeftRight },
};

export const COFFRE_PERIODS: Array<{ id: CoffrePeriod; label: string }> = [
  { id: 'jour', label: 'Jour' },
  { id: 'mois', label: 'Mois' },
  { id: 'annee', label: 'Année' },
  { id: 'tout', label: 'Tout' },
];

export const coffreAccountLabel = (id: CoffreAccountId) => COFFRE_ACCOUNTS.find((account) => account.id === id)?.label ?? id;

export function coffreBalances(entries: CoffreEntry[]): Record<CoffreAccountId, number> {
  const balances: Record<CoffreAccountId, number> = { especes: 0, moncash: 0, natcash: 0 };
  for (const entry of entries) {
    if (entry.kind === 'entree') balances[entry.compte] += entry.montant;
    else if (entry.kind === 'sortie') balances[entry.compte] -= entry.montant;
    else if (entry.compteDest) {
      balances[entry.compte] -= entry.montant;
      balances[entry.compteDest] += entry.montant;
    }
  }
  return balances;
}
