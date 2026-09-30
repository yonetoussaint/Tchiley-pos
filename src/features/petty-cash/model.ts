import type { CoffreEntry } from '../vault/types';
import { makeMockRand, mockDateAt } from '../../shared/mockData';
import type { PettyCount, PettyEntry } from './types';

export const DEFAULT_PETTY_FLOAT = 10000;
export const PETTY_REAPPRO_CATEGORY = 'Réappro. petite caisse';

export const PETTY_CATEGORIES = [
  'Transport',
  'Eau et café',
  'Carburant',
  'Fournitures bureau',
  'Nettoyage',
  'Petites réparations',
  'Recharge / communication',
  'Autre dépense',
];

export const pettyBalance = (entries: PettyEntry[]) =>
  entries.reduce((sum, entry) => sum + (entry.kind === 'reappro' ? entry.montant : -entry.montant), 0);

export function buildMockPetty(branchIds: string[], historyDays: number, mockEnabled: boolean): { petty: PettyEntry[]; coffre: CoffreEntry[]; counts: PettyCount[] } {
  const result = { petty: [] as PettyEntry[], coffre: [] as CoffreEntry[], counts: [] as PettyCount[] };
  if (!mockEnabled) return result;
  const { rand, randInt, roundTo } = makeMockRand(20260930);
  const notesByCategory: Record<string, string[]> = {
    Transport: ['Moto-taxi livraison', 'Tap-tap fournisseur', 'Course urgente'],
    'Eau et café': ['Bidon eau 5 gal', 'Café équipe', 'Sachets eau'],
    Carburant: ['Essence génératrice', 'Gazoline moto'],
    'Fournitures bureau': ['Cahier et stylos', 'Papier facture', 'Encre tampon'],
    Nettoyage: ['Savon et Clorox', 'Balai et seau'],
    'Petites réparations': ['Cadenas et clous', 'Ampoule', 'Réparation brouette'],
    'Recharge / communication': ['Recharge Digicel', 'Recharge Natcom'],
    'Autre dépense': ['Divers', 'Dépannage'],
  };

  branchIds.forEach((branchId) => {
    let balance = 0;
    const addPetty = (daysAgo: number, hour: number, entry: Omit<PettyEntry, 'id' | 'branchId' | 'date'>) => {
      result.petty.push({ id: `PM${result.petty.length}`, branchId, date: mockDateAt(daysAgo, hour, randInt(0, 59)), ...entry });
    };
    const replenish = (daysAgo: number, note: string) => {
      const amount = roundTo(DEFAULT_PETTY_FLOAT - balance, 50);
      if (amount <= 0) return;
      const coffreId = `FP${result.coffre.length}`;
      const date = mockDateAt(daysAgo, 8, randInt(0, 30));
      result.coffre.push({
        id: coffreId,
        piece: {
          ref: `BON-${String(result.coffre.length + 1).padStart(4, '0')}`,
          nom: `BON-${String(result.coffre.length + 1).padStart(4, '0')}.svg`,
          type: 'image/svg+xml',
        },
        branchId,
        date,
        kind: 'sortie',
        categorie: PETTY_REAPPRO_CATEGORY,
        compte: 'especes',
        montant: amount,
        note: 'Réapprovisionnement petite caisse',
      });
      result.petty.push({
        id: `PM${result.petty.length}`,
        branchId,
        date,
        kind: 'reappro',
        categorie: PETTY_REAPPRO_CATEGORY,
        montant: amount,
        note,
        coffreId,
      });
      balance += amount;
    };

    const first = historyDays - 1;
    replenish(first, 'Fonds initial');

    for (let daysAgo = first; daysAgo >= 0; daysAgo--) {
      const dayOfWeek = new Date(Date.now() - daysAgo * 86400000).getDay();
      if (dayOfWeek !== 0 && rand() < 0.75) {
        const count = randInt(1, 2);
        for (let index = 0; index < count; index++) {
          const categorie = PETTY_CATEGORIES[randInt(0, PETTY_CATEGORIES.length - 1)];
          const notes = notesByCategory[categorie];
          const montant = roundTo(randInt(100, 650), 25);
          if (montant > balance) replenish(daysAgo, 'Fonds insuffisant, complément');
          balance -= montant;
          addPetty(daysAgo, randInt(9, 17), {
            kind: 'depense',
            categorie,
            montant,
            note: notes[randInt(0, notes.length - 1)],
            recu: rand() < 0.8 ? `R-${randInt(1000, 9999)}` : undefined,
          });
        }
      }
      if (balance < 2000 && dayOfWeek !== 0) replenish(daysAgo, 'Réapprovisionnement');

      if (daysAgo % 7 === 0 && daysAgo < first) {
        const deltas = [0, 0, 0, 0, -50, -100, 25];
        const delta = deltas[randInt(0, deltas.length - 1)];
        result.counts.push({
          id: `PC${result.counts.length}`,
          branchId,
          date: mockDateAt(daysAgo, 18, randInt(0, 30)),
          theorique: balance,
          compte: balance + delta,
          ecart: delta,
          note: delta === 0 ? undefined : delta < 0 ? 'Reçu manquant' : 'Monnaie non rendue',
        });
      }
    }
  });

  return result;
}
