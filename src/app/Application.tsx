import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import '../App.css';
import { MobileBottomNav, type MobileTab } from '../components/navigation/MobileBottomNav';
import { M3_FOCUS } from '../components/ui/focus';
import { M3_CSS, M3StateLayer, M3_STATUS, M3_VARS } from '../components/ui/theme';
import { DashboardView as FeatureDashboardView } from '../features/dashboard/DashboardView';
import { CATEGORIES } from '../features/products/constants';
import { BranchProductsSection } from '../features/products/BranchProductsSection';
import { BranchCreditsSection } from '../features/credits/BranchCreditsSection';
import type { Product, ProductHistoryEntry, ProductMovement } from '../features/products/types';
import type { Branch } from '../shared/types';
import type { PurchaseRecord } from '../features/purchases/types';
import { applyPurchaseToProducts, BranchPurchasesSection, buildMockPurchases } from '../features/purchases/BranchPurchasesSection';
import { PAYMENT_METHODS, type PaymentMethodId } from '../features/sales/paymentMethods';
import { creditBalance } from '../features/sales/creditUtils';
import type { CreditPayment, SaleLine, SaleRecord } from '../features/sales/types';
import { ReceiptModal as SalesReceiptModal } from '../features/sales/ReceiptModal';
import { BranchSalesSection } from '../features/sales/BranchSalesSection';
import { REPORT_TABS, type CashEntry, type CashEntryType, type ReportPeriod } from '../features/reports/cash';
import { BranchReportsSection } from '../features/reports/BranchReportsSection';
import { BranchCoffreSection } from '../features/vault/BranchCoffreSection';
import { BranchPetiteCaisseSection } from '../features/petty-cash/BranchPetiteCaisseSection';
import { buildMockPetty, DEFAULT_PETTY_FLOAT, PETTY_REAPPRO_CATEGORY } from '../features/petty-cash/model';
import type { PettyCount, PettyEntry } from '../features/petty-cash/types';
import { fmtHTG } from '../shared/currency';
import { dayKey, isSameDay } from '../shared/dates';
import { makeMockRand, MOCK_HISTORY_DAYS, mockDateAt, USE_MOCK_SALES } from '../shared/mockData';
import { coffreBalances } from '../features/vault/model';
import type { CoffreAccountId, CoffreEntry, CoffreKind } from '../features/vault/types';
import { useIsPhone } from '../shared/useIsPhone';
import {
  BranchHeaderCards,
  DatePicker,
  MobileNavDrawer,
  relativeDayLabel,
  shortBranchName,
  type BranchSwitcher,
  type DrawerAction,
  type DrawerGroup,
  type DrawerItem,
  type HeaderStat,
} from '../components/ui/appChrome';
import {
  ShoppingCart, Boxes, Gauge, AlertTriangle,
  Plus, Minus, Trash2, X, Search, Printer, ChevronRight,
  Smartphone, FileClock, Check, Menu, BarChart3,
  Users, Loader2, CalendarDays, Eye, EyeOff, ChevronDown,
  Vault, ArrowLeftRight, Coins, Package, Receipt, ExternalLink, Copy,
  MapPin, UserRound, TrendingUp, LogOut, KeyRound, Lock, Store, Truck
} from 'lucide-react';

/* =========================================================================
   DESIGN TOKENS
   Industrial materials-yard palette — concrete, rebar rust, steel, safety.
   Zero border-radius / hard borders throughout (house style).
   -------------------------------------------------------------------------
   --c-ink       #16181A   near-black steel, sidebar / primary text
   --c-concrete  #ECE7DC   warm concrete beige, app background
   --c-paper     #FBFAF6   card / surface background
   --c-steel     #4B5560   steel blue-grey, secondary text / borders
   --c-rust      #C1440E   rebar rust — primary action / brand accent
   --c-caution   #F2B705   safety yellow — warnings, low stock
   --c-ok        #2F6B4F   confirm green — success, paid
   ========================================================================= */

type CartItem = {
  id: string;
  qte: number;
};

type CartLine = CartItem & {
  produit: Product;
  sousTotal: number;
};

/* Onglets de gestion (mêmes sections que le panneau propriétaire, limitées à la succursale du vendeur). */
type ManagementView = 'rapports' | 'produits' | 'ventes' | 'achats' | 'credits' | 'coffre' | 'petitecaisse';

type View = 'vente' | 'dashboard' | ManagementView;

const MANAGEMENT_VIEWS: ManagementView[] = ['rapports', 'produits', 'ventes', 'achats', 'credits', 'coffre', 'petitecaisse'];
const isManagementView = (v: View): v is ManagementView => (MANAGEMENT_VIEWS as string[]).includes(v);

type UserRole = 'owner' | 'seller';

type User = {
  id: string;
  name: string;
  password: string;
  profilePic: string;
  role: UserRole;
  branchId: string | null;
};

type VenteViewProps = {
  isReadOnly?: boolean;
  categorie: string;
  setCategorie: Dispatch<SetStateAction<string>>;
  categories: string[];
  recherche: string;
  setRecherche: Dispatch<SetStateAction<string>>;
  produits: Product[];
  basculerProduit: (produit: Product) => void;
  lignesPanier: CartLine[];
  changerQte: (id: string, delta: number) => void;
  retirerDuPanier: (id: string) => void;
  viderPanier: () => void;
  totalPanier: number;
  ouvrirCheckout: () => void;
};

type CheckoutModalProps = {
  lignesPanier: CartLine[];
  totalPanier: number;
  fermer: () => void;
  finaliserVente: (paiement: string, montantRecu: number, remise: number, client?: string, reference?: string) => void;
  clientsConnus?: string[];
};

const bottleIcon = (fill: string, cap = '#2b2e31') =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 90'><path d='M15 0h10v9l4 8v68a5 5 0 0 1-5 5H16a5 5 0 0 1-5-5V17l4-8z' fill='${fill}'/><rect x='15' y='0' width='10' height='7' fill='${cap}'/><rect x='11' y='30' width='18' height='8' fill='rgba(255,255,255,0.25)'/></svg>`
  )}`;

const canIcon = (fill: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 50 80'><rect x='8' y='4' width='34' height='72' rx='7' fill='${fill}'/><rect x='8' y='4' width='34' height='11' rx='5' fill='rgba(255,255,255,0.3)'/><ellipse cx='25' cy='76' rx='17' ry='4' fill='rgba(0,0,0,0.15)'/></svg>`
  )}`;

const INITIAL_PRODUCTS: Product[] = [
  { id: 'p01', nom: 'Ciment Gris 50kg', categorie: 'Ciment & Béton', prix: 650, prixAchat: 500, stockOuverture: 240, stockFermeture: 240, seuil: 50, unite: 'sac' },
  { id: 'p02', nom: 'Ciment Blanc 50kg', categorie: 'Ciment & Béton', prix: 950, prixAchat: 700, stockOuverture: 38, stockFermeture: 38, seuil: 40, unite: 'sac' },
  { id: 'p03', nom: 'Sable de Rivière', categorie: 'Ciment & Béton', prix: 1200, prixAchat: 800, stockOuverture: 60, stockFermeture: 60, seuil: 15, unite: 'brouette' },
  { id: 'p04', nom: 'Gravier 3/4', categorie: 'Ciment & Béton', prix: 1400, prixAchat: 900, stockOuverture: 45, stockFermeture: 45, seuil: 15, unite: 'brouette' },
  { id: 'p05', nom: 'Fer 3/8" x 20p', categorie: 'Fer & Acier', prix: 425, prixAchat: 300, stockOuverture: 310, stockFermeture: 310, seuil: 60, unite: 'barre' },
  { id: 'p06', nom: 'Fer 1/2" x 20p', categorie: 'Fer & Acier', prix: 610, prixAchat: 450, stockOuverture: 22, stockFermeture: 22, seuil: 30, unite: 'barre' },
  { id: 'p07', nom: 'Fil de Ligature', categorie: 'Fer & Acier', prix: 185, prixAchat: 120, stockOuverture: 90, stockFermeture: 90, seuil: 20, unite: 'rouleau' },
  { id: 'p08', nom: 'Bloc 4"', categorie: 'Blocs & Briques', prix: 68, prixAchat: 40, stockOuverture: 1400, stockFermeture: 1400, seuil: 200, unite: 'unité' },
  { id: 'p09', nom: 'Bloc 6"', categorie: 'Blocs & Briques', prix: 95, prixAchat: 60, stockOuverture: 860, stockFermeture: 860, seuil: 200, unite: 'unité' },
  { id: 'p10', nom: 'Bloc 8"', categorie: 'Blocs & Briques', prix: 120, prixAchat: 80, stockOuverture: 15, stockFermeture: 15, seuil: 100, unite: 'unité' },
  { id: 'p11', nom: 'Tuyau PVC 4" x 10p', categorie: 'Plomberie', prix: 780, prixAchat: 500, stockOuverture: 54, stockFermeture: 54, seuil: 15, unite: 'tuyau' },
  { id: 'p12', nom: 'Tuyau PVC 1/2" x 10p', categorie: 'Plomberie', prix: 210, prixAchat: 150, stockOuverture: 120, stockFermeture: 120, seuil: 25, unite: 'tuyau' },
  { id: 'p13', nom: 'Robinet Standard', categorie: 'Plomberie', prix: 540, prixAchat: 300, stockOuverture: 33, stockFermeture: 33, seuil: 10, unite: 'unité' },
  { id: 'p14', nom: 'Peinture Latex Blanc 1gal', categorie: 'Peinture', prix: 1650, prixAchat: 1100, stockOuverture: 28, stockFermeture: 28, seuil: 10, unite: 'gallon' },
  { id: 'p15', nom: 'Peinture à Huile 1gal', categorie: 'Peinture', prix: 1950, prixAchat: 1300, stockOuverture: 8, stockFermeture: 8, seuil: 10, unite: 'gallon' },
  { id: 'p16', nom: 'Planche Sapin 1x12', categorie: 'Bois', prix: 495, prixAchat: 300, stockOuverture: 76, stockFermeture: 76, seuil: 20, unite: 'planche' },
  { id: 'p17', nom: 'Chevron 2x4x12', categorie: 'Bois', prix: 610, prixAchat: 400, stockOuverture: 40, stockFermeture: 40, seuil: 20, unite: 'pièce' },
  { id: 'p18', nom: 'Fil Électrique #12 (100p)', categorie: 'Électricité', prix: 3200, prixAchat: 2000, stockOuverture: 12, stockFermeture: 12, seuil: 5, unite: 'rouleau' },
  { id: 'p19', nom: 'Disjoncteur 20A', categorie: 'Électricité', prix: 385, prixAchat: 200, stockOuverture: 47, stockFermeture: 47, seuil: 15, unite: 'unité' },
  { id: 'p20', nom: 'Truelle de Maçon', categorie: 'Outils', prix: 320, prixAchat: 200, stockOuverture: 25, stockFermeture: 25, seuil: 8, unite: 'unité' },
  { id: 'p21', nom: 'Pelle Carrée', categorie: 'Outils', prix: 610, prixAchat: 400, stockOuverture: 19, stockFermeture: 19, seuil: 8, unite: 'unité' },
  { id: 'p22', nom: 'Cadenas 40mm', categorie: 'Quincaillerie', prix: 350, prixAchat: 220, stockOuverture: 60, stockFermeture: 60, seuil: 15, unite: 'unité' },
  { id: 'p23', nom: 'Charnières 3"', categorie: 'Quincaillerie', prix: 95, prixAchat: 55, stockOuverture: 120, stockFermeture: 120, seuil: 30, unite: 'paire' },
  { id: 'p24', nom: 'Vis à Bois Assorties (bte)', categorie: 'Quincaillerie', prix: 275, prixAchat: 170, stockOuverture: 45, stockFermeture: 45, seuil: 10, unite: 'boîte' },
  { id: 'p25', nom: 'Marteau de Menuisier', categorie: 'Quincaillerie', prix: 480, prixAchat: 300, stockOuverture: 22, stockFermeture: 22, seuil: 8, unite: 'unité' },
  { id: 'p26', nom: 'Ruban Adhésif Toilé', categorie: 'Quincaillerie', prix: 150, prixAchat: 90, stockOuverture: 70, stockFermeture: 70, seuil: 15, unite: 'rouleau' },
  { id: 'p27', nom: 'Ampoule LED 9W', categorie: 'Quincaillerie', prix: 165, prixAchat: 100, stockOuverture: 90, stockFermeture: 90, seuil: 20, unite: 'unité' },
  { id: 'p28', nom: 'Coca-Cola 20oz', categorie: 'Boissons Gazeuse', prix: 100, prixAchat: 65, stockOuverture: 240, stockFermeture: 240, seuil: 48, unite: 'bouteille', image: bottleIcon('#C1440E') },
  { id: 'p29', nom: 'Sprite 20oz', categorie: 'Boissons Gazeuse', prix: 100, prixAchat: 65, stockOuverture: 180, stockFermeture: 180, seuil: 48, unite: 'bouteille', image: bottleIcon('#2F6B4F') },
  { id: 'p30', nom: 'Cola Couronne 12oz', categorie: 'Boissons Gazeuse', prix: 60, prixAchat: 35, stockOuverture: 300, stockFermeture: 300, seuil: 60, unite: 'bouteille', image: canIcon('#8B1E1E') },
  { id: 'p31', nom: 'Eau Culligan 500ml', categorie: 'Boissons Gazeuse', prix: 35, prixAchat: 20, stockOuverture: 400, stockFermeture: 400, seuil: 80, unite: 'bouteille', image: bottleIcon('#BFE3F5', '#4B5560') },
  { id: 'p32', nom: 'Jus Tampico 1L', categorie: 'Boissons Gazeuse', prix: 150, prixAchat: 95, stockOuverture: 96, stockFermeture: 96, seuil: 20, unite: 'bouteille', image: bottleIcon('#F2A93B') },
  { id: 'p33', nom: 'Riz Importé 25lb', categorie: 'Produits alimentaires', prix: 1450, prixAchat: 1150, stockOuverture: 40, stockFermeture: 40, seuil: 10, unite: 'sac' },
  { id: 'p34', nom: 'Farine de Blé 5lb', categorie: 'Produits alimentaires', prix: 280, prixAchat: 200, stockOuverture: 65, stockFermeture: 65, seuil: 15, unite: 'sac' },
  { id: 'p35', nom: 'Huile Végétale 1gal', categorie: 'Produits alimentaires', prix: 950, prixAchat: 700, stockOuverture: 30, stockFermeture: 30, seuil: 8, unite: 'gallon' },
  { id: 'p36', nom: 'Sucre Blanc 5lb', categorie: 'Produits alimentaires', prix: 320, prixAchat: 240, stockOuverture: 55, stockFermeture: 55, seuil: 12, unite: 'sac' },
  { id: 'p37', nom: 'Spaghetti (paquet)', categorie: 'Produits alimentaires', prix: 110, prixAchat: 75, stockOuverture: 140, stockFermeture: 140, seuil: 25, unite: 'paquet' },
  { id: 'p38', nom: 'Lait en Poudre 400g', categorie: 'Produits alimentaires', prix: 385, prixAchat: 280, stockOuverture: 48, stockFermeture: 48, seuil: 10, unite: 'boîte' },
];

const BRANCH_INVENTORY_SEED: Record<string, string[]> = {
  'gros-morne': ['p01', 'p03', 'p05', 'p08', 'p11'],
  'saint-marc': ['p02', 'p04', 'p06', 'p09', 'p13'],
  'majuin': ['p22', 'p23', 'p24', 'p25', 'p26', 'p27', 'p28', 'p29', 'p30', 'p31', 'p32', 'p33', 'p34', 'p35', 'p36', 'p37', 'p38'],
  'oreste': ['p07', 'p10', 'p12', 'p18', 'p19'],
};

const MOCK_CLIENTS: Record<string, string[]> = {
  'gros-morne': ['Jean Baptiste', 'Marie-Claire Joseph', 'Entreprise Dorival', 'Pierre Louis', 'Wilner Étienne'],
  'saint-marc': ['Fritz Desrosiers', 'Rose-Marie Charles', 'Construction Saint-Marc SA', 'Kensley Auguste', 'Mme Lucienne Paul'],
  'majuin': ['Jocelyn Pierre', 'Nadège Michel', 'Ti Jak Peinture', 'Ronald Célestin', 'Guerline Jean'],
  'oreste': ['Evens Toussaint', 'Carline Noël', 'Électricité Oreste', 'Mackenson Thomas', 'Ludy Fils-Aimé'],
};

function buildMockSales(): SaleRecord[] {
  if (!USE_MOCK_SALES) return [];
  const paymentPool: PaymentMethodId[] = ['especes', 'especes', 'especes', 'moncash', 'natcash', 'credit'];
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const sales: SaleRecord[] = [];
  let seed = 20260927;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

  Object.entries(BRANCH_INVENTORY_SEED).forEach(([branchId, productIds]) => {
    const branchProducts = INITIAL_PRODUCTS.filter((p) => productIds.includes(p.id));
    for (let daysAgo = 0; daysAgo < MOCK_HISTORY_DAYS; daysAgo++) {
      if (daysAgo > 0 && rand() < 0.12) continue;
      const salesCount = randInt(3, 7);
      for (let i = 0; i < salesCount; i++) {
        let minutesOfDay = 7 * 60 + randInt(0, 599);
        if (daysAgo === 0 && minutesOfDay > nowMinutes) minutesOfDay = randInt(0, Math.max(nowMinutes, 1));
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 0, minutesOfDay);
        const chosen = [...branchProducts].sort(() => rand() - 0.5).slice(0, randInt(1, 3));
        const lignes: SaleLine[] = chosen.map((produit) => {
          const qte = produit.prix < 150 ? randInt(10, 60) : randInt(1, 5);
          return { produitId: produit.id, nom: produit.nom, qte, prix: produit.prix, sousTotal: qte * produit.prix, cout: produit.prixAchat };
        });
        const subtotal = lignes.reduce((sum, l) => sum + l.sousTotal, 0);
        const discountPct = rand() < 0.25 ? [5, 10, 15][randInt(0, 2)] : 0;
        const remise = discountPct ? Math.round((subtotal * discountPct) / 100 / 5) * 5 : 0;
        const total = subtotal - remise;
        const paiement = paymentPool[randInt(0, paymentPool.length - 1)];
        const recu = paiement === 'especes' ? Math.ceil(total / 500) * 500 : paiement === 'credit' ? 0 : total;
        let client: string | undefined;
        let paiementsCredit: CreditPayment[] | undefined;
        if (paiement === 'credit') {
          const names = MOCK_CLIENTS[branchId] ?? [];
          client = names[randInt(0, names.length - 1)];
          paiementsCredit = [];
          const roll = rand();
          if (roll < 0.6) {
            const montant = roll < 0.3 ? total : Math.round((total * (0.3 + rand() * 0.4)) / 5) * 5;
            const payDate = new Date(Math.min(date.getTime() + randInt(1, 5) * 86400000, now.getTime()));
            if (montant > 0 && payDate.getTime() > date.getTime()) {
              const modes: PaymentMethodId[] = ['especes', 'moncash', 'natcash'];
              paiementsCredit.push({ id: `P${payDate.getTime()}-${sales.length}`, date: payDate, montant, mode: modes[randInt(0, 2)] });
            }
          }
        }
        sales.push({
          id: `V${date.getTime()}-${sales.length}`,
          date,
          branchId,
          lignes,
          total,
          remise,
          paiement,
          recu,
          monnaie: paiement === 'especes' ? recu - total : 0,
          client,
          paiementsCredit,
          statut: 'valide',
        });
      }
    }
  });
  return sales;
}

function buildMockCashEntries(): CashEntry[] {
  const entries: CashEntry[] = [];
  const push = (branchId: string, daysAgo: number, type: CashEntryType, montant: number, note: string) => {
    entries.push({
      id: `cash-${entries.length}`,
      branchId,
      date: mockDateAt(daysAgo, 9 + (entries.length % 3), 0),
      type,
      montant,
      note,
    });
  };

  Object.keys(BRANCH_INVENTORY_SEED).forEach((branchId) => {
    for (let daysAgo = 0; daysAgo < 20; daysAgo++) {
      const s = (daysAgo + branchId.length) % 4;
      if (s === 0) push(branchId, daysAgo, 'renflouement', 1500 + daysAgo * 100, 'Vente du jour');
      if (s === 1) push(branchId, daysAgo, 'consommation', 900 + daysAgo * 75, 'Frais divers');
      if (s === 2) push(branchId, daysAgo, 'remboursement', 2300 + daysAgo * 120, 'Paiement mobile');
      if (s === 3) push(branchId, daysAgo, 'achat', 1100 + daysAgo * 90, 'Achat local');
    }
  });

  return entries;
}

function buildMockCoffreEntries(): CoffreEntry[] {
  const { rand, randInt, roundTo } = makeMockRand(20260929);
  const out: CoffreEntry[] = [];
  const add = (
    branchId: string,
    daysAgo: number,
    kind: CoffreKind,
    categorie: string,
    compte: CoffreAccountId,
    montant: number,
    note?: string,
    compteDest?: CoffreAccountId
  ) =>
    out.push({
      id: `FM${out.length}`,
      piece: {
        ref: `PJ-${String(out.length + 1).padStart(4, '0')}`,
        nom: `PJ-${String(out.length + 1).padStart(4, '0')}.svg`,
        type: 'image/svg+xml',
      },
      branchId,
      date: mockDateAt(daysAgo, randInt(8, 18), randInt(0, 59)),
      kind,
      categorie,
      compte,
      compteDest,
      montant,
      note,
    });

  Object.keys(BRANCH_INVENTORY_SEED).forEach((branchId) => {
    const first = MOCK_HISTORY_DAYS - 1;
    add(branchId, first, 'entree', 'Solde initial', 'especes', 60000, 'Ouverture du coffre');
    add(branchId, first, 'entree', 'Solde initial', 'moncash', 15000, 'Solde MonCash de départ');
    add(branchId, first, 'entree', 'Solde initial', 'natcash', 8000, 'Solde NatCash de départ');
    add(branchId, first, 'entree', 'Apport propriétaire', 'especes', 100000, 'Capital de démarrage');

    for (let daysAgo = first - 1; daysAgo >= 0; daysAgo--) {
      const dow = new Date(Date.now() - daysAgo * 86400000).getDay();
      if (dow !== 0) {
        add(branchId, daysAgo, 'entree', 'Versement caisse', 'especes', roundTo(randInt(3000, 11000), 250), 'Versement de fin de journée');
        if (rand() < 0.5) add(branchId, daysAgo, 'entree', 'Versement caisse', 'moncash', roundTo(randInt(1500, 6000), 250), 'Paiements MonCash du jour');
        if (rand() < 0.3) add(branchId, daysAgo, 'entree', 'Versement caisse', 'natcash', roundTo(randInt(1000, 4000), 250), 'Paiements NatCash du jour');
      }
      if (rand() < 0.5) {
        const label = ['Transport', 'Électricité', 'Eau', 'Internet', 'Entretien local'][randInt(0, 4)];
        add(branchId, daysAgo, 'sortie', 'Dépense courante', 'especes', roundTo(randInt(300, 2500), 50), label);
      }
      if (daysAgo % 7 === 2) {
        add(branchId, daysAgo, 'sortie', 'Achat marchandises', 'especes', roundTo(randInt(15000, 40000), 500), 'Réapprovisionnement fournisseur');
      }
      if (daysAgo % 14 === 5) {
        add(branchId, daysAgo, 'sortie', 'Salaire', 'especes', roundTo(randInt(12000, 18000), 500), 'Paie du personnel');
      }
      if (daysAgo % 30 === 9) {
        add(branchId, daysAgo, 'sortie', 'Retrait propriétaire', 'especes', roundTo(randInt(15000, 30000), 1000), 'Retrait personnel');
      }
      if (daysAgo % 10 === 4) {
        add(branchId, daysAgo, 'transfert', 'Transfert entre comptes', 'moncash', roundTo(randInt(2000, 5000), 250), 'Retrait MonCash en espèces', 'especes');
      }
      if (daysAgo % 21 === 11) {
        add(branchId, daysAgo, 'transfert', 'Transfert entre comptes', 'natcash', roundTo(randInt(1500, 3500), 250), 'Retrait NatCash en espèces', 'especes');
      }
      if (daysAgo % 45 === 20) {
        add(branchId, daysAgo, 'sortie', 'Dépense courante', 'moncash', roundTo(randInt(800, 2000), 50), 'Recharge et frais mobile');
      }
    }
  });
  return out;
}

/* ---------- Petite caisse (petty cash: fixed float for small daily expenses) ---------- */
const NAV_ITEMS: Array<{ id: View; label: string; icon: typeof ShoppingCart }> = [
  { id: 'vente', label: 'Vente', icon: ShoppingCart },
  { id: 'dashboard', label: 'Tableau de Bord', icon: Gauge },
  { id: 'rapports', label: 'Rapports', icon: BarChart3 },
  { id: 'produits', label: 'Produits', icon: Package },
  { id: 'ventes', label: 'Ventes', icon: Receipt },
  { id: 'achats', label: 'Achats', icon: Truck },
  { id: 'credits', label: 'Crédits', icon: FileClock },
  { id: 'coffre', label: 'Coffre', icon: Vault },
  { id: 'petitecaisse', label: 'Petite caisse', icon: Coins },
];

const SUCURSALES: Branch[] = [
  {
    id: 'gros-morne',
    nom: 'Tchiley Construction Gros-Morne',
    ville: 'Gros-Morne',
    adresse: 'Désarmes',
    gestionnaire: 'Jean A.',
    statut: 'Ouvert',
    ventesDuJour: 18,
    alertesStock: 4,
    motDePasse: '1234',
  },
  {
    id: 'saint-marc',
    nom: 'Tchiley Construction Saint-Marc',
    ville: 'Saint-Marc',
    adresse: 'Chemin 9',
    gestionnaire: 'Michel R.',
    statut: 'Ouvert',
    ventesDuJour: 12,
    alertesStock: 2,
    motDePasse: '1234',
  },
  {
    id: 'majuin',
    nom: 'Tchiley Construction Majuin',
    ville: 'Majuin',
    adresse: 'Central',
    gestionnaire: 'Samuel D.',
    statut: 'Ouvert',
    ventesDuJour: 9,
    alertesStock: 3,
    motDePasse: '1234',
  },
  {
    id: 'oreste',
    nom: 'Tchiley Construction Oreste',
    ville: 'Oreste',
    adresse: 'Quartier Oreste',
    gestionnaire: 'Louis F.',
    statut: 'Ouvert',
    ventesDuJour: 7,
    alertesStock: 2,
    motDePasse: '1234',
  },
];

const OWNER_PASSWORD = '1234';

const INITIAL_USERS: User[] = [
  {
    id: 'owner-1',
    name: 'Propriétaire Tchiley',
    password: OWNER_PASSWORD,
    profilePic: 'https://ui-avatars.com/api/?name=Owner&background=C1440E&color=fff&size=128',
    role: 'owner',
    branchId: null,
  },
  {
    id: 'seller-gros-morne',
    name: 'Jean A.',
    password: '1234',
    profilePic: 'https://ui-avatars.com/api/?name=Jean+A&background=16181A&color=fff&size=128',
    role: 'seller',
    branchId: 'gros-morne',
  },
  {
    id: 'seller-saint-marc',
    name: 'Michel R.',
    password: '1234',
    profilePic: 'https://ui-avatars.com/api/?name=Michel+R&background=4B5560&color=fff&size=128',
    role: 'seller',
    branchId: 'saint-marc',
  },
];

function GestionMateriaux() {
  const [view, setView] = useState<View>('vente');
  const [menuOpen, setMenuOpen] = useState<boolean>(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 1100px)').matches
  );
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !window.matchMedia('(min-width: 768px)').matches) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);
  const closeMenuOnMobile = () => {
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 768px)').matches) setMenuOpen(false);
  };
  const [appRoute, setAppRoute] = useState<'admin' | 'user' | 'sellerBoard'>('admin');
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [pendingBranchId, setPendingBranchId] = useState<string | null>(null);
  const [branchPasswordInput, setBranchPasswordInput] = useState<string>('');
  const [branchPasswordError, setBranchPasswordError] = useState<string>('');
  const [ownerAccess, setOwnerAccess] = useState<boolean>(false);
  const [ownerPasswordInput, setOwnerPasswordInput] = useState<string>('');
  const [ownerPasswordError, setOwnerPasswordError] = useState<string>('');
  const [ownerModalOpen, setOwnerModalOpen] = useState<boolean>(false);
  const [isReadOnly, setIsReadOnly] = useState<boolean>(false);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [productMovements, setProductMovements] = useState<ProductMovement[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [categorie, setCategorie] = useState<string>('Tout');
  const [recherche, setRecherche] = useState<string>('');
  const [ventes, setVentes] = useState<SaleRecord[]>(() => buildMockSales());
  const [achats, setAchats] = useState<PurchaseRecord[]>(() => buildMockPurchases(INITIAL_PRODUCTS, BRANCH_INVENTORY_SEED, MOCK_HISTORY_DAYS));
  const [cashEntries, setCashEntries] = useState<CashEntry[]>(() => buildMockCashEntries());
  const [pettySeed] = useState(() => buildMockPetty(Object.keys(BRANCH_INVENTORY_SEED), MOCK_HISTORY_DAYS, USE_MOCK_SALES));
  const [coffreEntries, setCoffreEntries] = useState<CoffreEntry[]>(() => [...buildMockCoffreEntries(), ...pettySeed.coffre]);
  const [pettyEntries, setPettyEntries] = useState<PettyEntry[]>(() => pettySeed.petty);
  const [pettyCounts, setPettyCounts] = useState<PettyCount[]>(() => pettySeed.counts);
  const [pettyFloats, setPettyFloats] = useState<Record<string, number>>({});
  const ventesValides = useMemo(() => ventes.filter((v) => v.statut !== 'annulee'), [ventes]);
  const clientsConnus = useMemo(
    () => Array.from(new Set(ventes.map((v) => v.client?.trim()).filter((c): c is string => !!c))).sort(),
    [ventes]
  );
  const [checkoutOuvert, setCheckoutOuvert] = useState<boolean>(false);
  const [lastReceipt, setLastReceipt] = useState<SaleRecord | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('daily');
  const [reportsOpen, setReportsOpen] = useState<boolean>(false);
  const [branchInventoryIds, setBranchInventoryIds] = useState<Record<string, string[]>>(BRANCH_INVENTORY_SEED);

  /* Chaque succursale ne vend que les articles qui lui sont assignés (BRANCH_INVENTORY_SEED). */
  const produitsBranche = useMemo(() => {
    if (!selectedBranchId) return products;
    const ids = branchInventoryIds[selectedBranchId];
    if (!ids) return products;
    return products.filter((p) => ids.includes(p.id));
  }, [products, selectedBranchId, branchInventoryIds]);

  const salesDays = useMemo(
    () => new Set(ventes.filter((v) => v.branchId === selectedBranchId).map((v) => dayKey(v.date))),
    [ventes, selectedBranchId]
  );

  /* Catégories réellement en vente dans cette succursale (ex : Majuin ne propose que
     Quincaillerie / Boissons Gazeuse / Produits alimentaires) — pilote les filtres rapides. */
  const categoriesBranche = useMemo(() => {
    const presentes = new Set(produitsBranche.map((p) => p.categorie));
    return ['Tout', ...CATEGORIES.filter((c) => c !== 'Tout' && presentes.has(c))];
  }, [produitsBranche]);

  useEffect(() => {
    setCategorie('Tout');
    setSelectedDate(new Date());
  }, [selectedBranchId]);

  const produitsStockBas = useMemo(
    () => produitsBranche.filter((p) => p.stockFermeture <= p.seuil),
    [produitsBranche]
  );

  const produitsFiltres = useMemo(() => {
    return produitsBranche.filter((p) => {
      const okCat = categorie === 'Tout' || p.categorie === categorie;
      const okRech = p.nom.toLowerCase().includes(recherche.toLowerCase());
      return okCat && okRech;
    });
  }, [produitsBranche, categorie, recherche]);

  const lignesPanier = useMemo<CartLine[]>(() => {
    return cart.flatMap((item) => {
      const produit = products.find((p) => p.id === item.id);
      if (!produit) return [];
      return [{ ...item, produit, sousTotal: produit.prix * item.qte }];
    });
  }, [cart, products]);

  const totalPanier = lignesPanier.reduce((s, l) => s + l.sousTotal, 0);
  const nbArticlesPanier = cart.reduce((s, i) => s + i.qte, 0);

  const brancheActuelle = SUCURSALES.find((s) => s.id === selectedBranchId) ?? SUCURSALES[0];

  const shiftSelectedDate = (offset: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + offset);
    setSelectedDate(next);
  };
  const isCurrentDateSelected = selectedDate.toDateString() === new Date().toDateString();

  /* Clicking a product card selects it (qty 1) or deselects it.
     Quantities are adjusted from the cart panel only. */
  function basculerProduit(produit: Product) {
    if (produit.stockFermeture <= 0) return;
    setCart((prev) => {
      const existe = prev.some((i) => i.id === produit.id);
      if (existe) return prev.filter((i) => i.id !== produit.id);
      return [...prev, { id: produit.id, qte: 1 }];
    });
  }

  function changerQte(id: string, delta: number) {
    setCart((prev) => {
      const produit = products.find((p) => p.id === id);
      return prev
        .map((i) => {
          if (i.id !== id) return i;
          const nouvelleQte = i.qte + delta;
          const max = produit ? produit.stockFermeture : nouvelleQte;
          return { ...i, qte: Math.min(Math.max(nouvelleQte, 0), max) };
        })
        .filter((i) => i.qte > 0);
    });
  }

  function retirerDuPanier(id: string) {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }

  function viderPanier() {
    setCart([]);
  }

  function finaliserVente(paiement: string, montantRecu: number, remiseMontant = 0, client?: string, reference?: string) {
    if (lignesPanier.length === 0) return;
    if (!selectedBranchId) return;

    const remise = Math.min(Math.max(remiseMontant, 0), totalPanier);
    const totalNet = totalPanier - remise;
    const recu = montantRecu != null ? montantRecu : totalNet;
    const vente: SaleRecord = {
      id: 'V' + Date.now(),
      date: new Date(),
      branchId: selectedBranchId,
      lignes: lignesPanier.map((l) => ({
        produitId: l.produit.id,
        nom: l.produit.nom,
        qte: l.qte,
        prix: l.produit.prix,
        sousTotal: l.sousTotal,
        cout: l.produit.prixAchat,
      })),
      total: totalNet,
      remise,
      paiement,
      recu,
      monnaie: paiement === 'especes' ? Math.max(recu - totalNet, 0) : 0,
      client: paiement === 'credit' ? client?.trim() || undefined : undefined,
      paiementsCredit: paiement === 'credit' ? [] : undefined,
      reference: reference || undefined,
    };
    setVentes((prev) => [vente, ...prev]);
    setProducts((prev) =>
      prev.map((p) => {
        const ligne = cart.find((i) => i.id === p.id);
        return ligne ? { ...p, stockFermeture: p.stockFermeture - ligne.qte } : p;
      })
    );
    setLastReceipt(vente);
    setCart([]);
    setCheckoutOuvert(false);
    window.setTimeout(() => window.print(), 120);
  }

  const venteAujourdhui = ventesValides.filter((v) => {
    const auj = new Date();
    return (
      v.date.getDate() === auj.getDate() &&
      v.date.getMonth() === auj.getMonth() &&
      v.date.getFullYear() === auj.getFullYear()
    );
  });
  const totalAujourdhui = venteAujourdhui.reduce((s, v) => s + v.total, 0);

  const meilleuresVentes = useMemo(() => {
    const compte: Record<string, number> = {};
    ventesValides.forEach((v) =>
      v.lignes.forEach((l) => {
        compte[l.nom] = (compte[l.nom] || 0) + l.qte;
      })
    );
    return Object.entries(compte)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [ventesValides]);

  const brancheEnAttente = SUCURSALES.find((branch) => branch.id === pendingBranchId) ?? null;

  const goToRoute = (route: 'admin' | 'user') => {
    const destination = route === 'admin' ? '/admin' : '/user';
    if (window.location.pathname.toLowerCase() !== destination) {
      window.history.pushState({}, '', destination);
    }
    setAppRoute(route);
  };

  useEffect(() => {
    const currentPath = window.location.pathname.toLowerCase();
    if (currentPath === '/admin') {
      setAppRoute('admin');
      return;
    }

    if (currentPath === '/user') {
      setAppRoute('user');
      return;
    }

    window.history.replaceState({}, '', '/admin');
    setAppRoute('admin');
  }, []);

  const ouvrirSuccursale = (branchId: string) => {
    const branche = SUCURSALES.find((item) => item.id === branchId);
    if (!branche) return;

    if (ownerAccess) {
      setSelectedBranchId(branchId);
      setAppRoute('admin');
      setIsReadOnly(true);
      goToRoute('admin');
      return;
    }

    setIsReadOnly(false);
    setPendingBranchId(branchId);
    setBranchPasswordInput('');
    setBranchPasswordError('');
  };

  const validerAccesProprietaire = () => {
    if (ownerPasswordInput.trim() === OWNER_PASSWORD) {
      setOwnerAccess(true);
      setOwnerModalOpen(false);
      setOwnerPasswordInput('');
      setOwnerPasswordError('');
      setAppRoute('admin');
      setSelectedBranchId(null);
      goToRoute('admin');
      return;
    }

    setOwnerPasswordError('Mot de passe propriétaire incorrect.');
  };

  const validerAccesSuccursale = () => {
    if (!brancheEnAttente) return;

    if (brancheEnAttente.motDePasse === branchPasswordInput.trim()) {
      setSelectedBranchId(brancheEnAttente.id);
      setAppRoute('sellerBoard');
      setPendingBranchId(null);
      setBranchPasswordInput('');
      setBranchPasswordError('');
      return;
    }

    setBranchPasswordError('Mot de passe incorrect. Veuillez réessayer.');
  };

  if (appRoute === 'admin') {
    if (!ownerAccess) {
      return (
        <OwnerAccessModal
          passwordValue={ownerPasswordInput}
          setPasswordValue={setOwnerPasswordInput}
          errorMessage={ownerPasswordError}
          onClose={() => {
            setOwnerPasswordInput('');
            setOwnerPasswordError('');
            goToRoute('user');
          }}
          onConfirm={validerAccesProprietaire}
        />
      );
    }

    return (
      <OwnerBoard
        users={users}
        setUsers={setUsers}
        setProducts={setProducts}
        onBackToBranches={() => {
          setOwnerAccess(false);
          setSelectedBranchId(null);
          goToRoute('user');
        }}
        branches={SUCURSALES}
        ventes={ventes}
        setVentes={setVentes}
        achats={achats}
        setAchats={setAchats}
        cashEntries={cashEntries}
        setCashEntries={setCashEntries}
        coffreEntries={coffreEntries}
        setCoffreEntries={setCoffreEntries}
        pettyEntries={pettyEntries}
        setPettyEntries={setPettyEntries}
        pettyCounts={pettyCounts}
        setPettyCounts={setPettyCounts}
        pettyFloats={pettyFloats}
        setPettyFloats={setPettyFloats}
        productMovements={productMovements}
        setProductMovements={setProductMovements}
        products={products}
        selectedBranchId={selectedBranchId}
        branchInventoryIds={branchInventoryIds}
        setBranchInventoryIds={setBranchInventoryIds}
      />
    );
  }

  if (appRoute === 'user' || !selectedBranchId) {
    return (
      <>
        <BranchSelectionView
          branches={SUCURSALES}
          onSelect={ouvrirSuccursale}
          ownerAccess={ownerAccess}
          onOwnerLogin={() => {
            setOwnerPasswordInput('');
            setOwnerPasswordError('');
            goToRoute('admin');
          }}
          onOwnerLogout={() => {
            setOwnerAccess(false);
            setOwnerPasswordInput('');
            setOwnerPasswordError('');
          }}
        />
        {ownerModalOpen && (
          <OwnerAccessModal
            passwordValue={ownerPasswordInput}
            setPasswordValue={setOwnerPasswordInput}
            errorMessage={ownerPasswordError}
            onClose={() => {
              setOwnerModalOpen(false);
              setOwnerPasswordInput('');
              setOwnerPasswordError('');
            }}
            onConfirm={validerAccesProprietaire}
          />
        )}
        {brancheEnAttente && (
          <BranchAccessModal
            branch={brancheEnAttente}
            passwordValue={branchPasswordInput}
            setPasswordValue={setBranchPasswordInput}
            errorMessage={branchPasswordError}
            onClose={() => {
              setPendingBranchId(null);
              setBranchPasswordInput('');
              setBranchPasswordError('');
            }}
            onConfirm={validerAccesSuccursale}
          />
        )}
      </>
    );
  }

  const drawerGroups: DrawerGroup[] = MOBILE_GROUPS_VENDOR.map(({ label, ids }) => ({
          label,
          items: ids.map((id): DrawerItem => {
            const nav = NAV_ITEMS.find((n) => n.id === id)!;
            const active = view === id;
            const isReports = id === 'rapports';
            return {
              id,
              label: nav.label,
              icon: nav.icon,
              active,
              badge: id === 'vente' ? nbArticlesPanier : undefined,
              expanded: isReports ? reportsOpen && active : undefined,
              children: isReports
                ? REPORT_TABS.map((tab) => ({
                    id: tab.id,
                    label: tab.label,
                    short: tab.short,
                    active: reportPeriod === tab.id,
                    onClick: () => {
                      setReportPeriod(tab.id);
                      closeMenuOnMobile();
                    },
                  }))
                : undefined,
              onClick: () => {
                if (isReports) setReportsOpen(active ? !reportsOpen : true);
                else {
                  setReportsOpen(false);
                  closeMenuOnMobile();
                }
                setView(id);
              },
            };
          }),
        }));

  return (
    <div style={M3_VARS} className="flex h-screen w-full flex-col overflow-hidden bg-[var(--m3-surface)] font-sans text-[var(--m3-on-surface)] md:flex-row">
      <DesktopSidebar
        collapsed={!menuOpen}
        onToggle={() => setMenuOpen((prev) => !prev)}
        title="Gestion de Magasin"
        subtitle="Espace vendeur"
        groups={drawerGroups}
        stockAlerts={produitsStockBas.length}
        onStockAlerts={() => {
          setReportsOpen(false);
          setView('produits');
        }}
        actions={[{ label: 'Changer de succursale', icon: ArrowLeftRight, onClick: () => setSelectedBranchId(null) }]}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col px-4 py-5 md:p-0">
        {/* Branch header — mobile: separate cards */}
        {(() => {
          const ventesDuJour = ventesValides.filter(
            (v) => v.branchId === selectedBranchId && isSameDay(v.date, selectedDate)
          );
          const totalDuJour = ventesDuJour.reduce((s, v) => s + v.total, 0);
          const headerStats: HeaderStat[] = [
                {
                  id: 'ventes',
                  label: 'Ventes',
                  value: fmtHTG(totalDuJour),
                  hint: relativeDayLabel(selectedDate),
                  icon: TrendingUp,
                  onClick: () => setView('ventes'),
                },
                {
                  id: 'transactions',
                  label: 'Transactions',
                  value: String(ventesDuJour.length),
                  hint: ventesDuJour.length ? 'Panier moyen ' + fmtHTG(totalDuJour / ventesDuJour.length) : 'Aucune vente',
                  icon: Receipt,
                  onClick: () => setView('ventes'),
                },
                {
                  id: 'stock',
                  label: 'Alertes stock',
                  value: String(produitsStockBas.length),
                  hint: produitsStockBas.length ? 'À réapprovisionner' : 'Tout est OK',
                  icon: AlertTriangle,
                  tone: produitsStockBas.length ? 'warn' : 'default',
                  onClick: () => setView('produits'),
                },
                {
                  id: 'panier',
                  label: 'Panier en cours',
                  value: nbArticlesPanier ? fmtHTG(totalPanier) : '—',
                  hint: nbArticlesPanier ? nbArticlesPanier + ' article(s)' : 'Vide',
                  icon: ShoppingCart,
                  onClick: () => setView('vente'),
                },
          ];
          return (
            <>
            <BranchHeaderCards
              branch={brancheActuelle}
              compact={view !== 'dashboard'}
              title={NAV_ITEMS.find((n) => n.id === view)?.label ?? ''}
              onMenu={() => setMenuOpen(true)}
              date={
                isManagementView(view)
                  ? {
                      selectedDate,
                      onSelect: setSelectedDate,
                      salesDays,
                      isToday: isCurrentDateSelected,
                    }
                  : null
              }
              stats={headerStats}
            />
            <DesktopTopBar
              branch={brancheActuelle}
              stats={headerStats}
              date={
                isManagementView(view)
                  ? { selectedDate, onSelect: setSelectedDate, salesDays, isToday: isCurrentDateSelected, onShift: shiftSelectedDate }
                  : null
              }
            />
            </>
          );
        })()}

        <div className="flex min-h-0 flex-1 items-start gap-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
          {isManagementView(view) ? (
            <main className="min-h-0 min-w-0 flex-1 self-stretch overflow-y-auto pb-2 pr-2 md:px-8 md:pb-8">
              <BranchManagementSections
                view={view}
                branch={brancheActuelle}
                selectedDate={selectedDate}
                reportPeriod={reportPeriod}
                setReportPeriod={setReportPeriod}
                products={products}
                setProducts={setProducts}
                branchProductIds={branchInventoryIds[brancheActuelle.id] ?? []}
                setBranchInventoryIds={setBranchInventoryIds}
                ventes={ventes}
                setVentes={setVentes}
                achats={achats}
                setAchats={setAchats}
                productMovements={productMovements}
                setProductMovements={setProductMovements}
                cashEntries={cashEntries}
                setCashEntries={setCashEntries}
                coffreEntries={coffreEntries}
                setCoffreEntries={setCoffreEntries}
                pettyEntries={pettyEntries}
                setPettyEntries={setPettyEntries}
                pettyCounts={pettyCounts}
                setPettyCounts={setPettyCounts}
                pettyFloats={pettyFloats}
                setPettyFloats={setPettyFloats}
              />
            </main>
          ) : (
          <main
            className={
              view === 'dashboard'
                ? 'flex min-h-0 min-w-0 flex-1 flex-col self-stretch overflow-hidden md:mx-8 md:mb-6'
                : 'flex min-h-0 min-w-0 flex-1 flex-col self-stretch overflow-hidden border-2 border-[#16181A] bg-[#FBFAF6] shadow-[6px_6px_0_#16181A] md:mx-8 md:mb-6 md:rounded-[28px] md:border md:border-[var(--m3-outline-variant)] md:shadow-none'
            }
          >
            {view === 'vente' && (
              <VenteView
                isReadOnly={isReadOnly}
                categorie={categorie}
                setCategorie={setCategorie}
                categories={categoriesBranche}
                recherche={recherche}
                setRecherche={setRecherche}
                produits={produitsFiltres}
                basculerProduit={basculerProduit}
                lignesPanier={lignesPanier}
                changerQte={changerQte}
                retirerDuPanier={retirerDuPanier}
                viderPanier={viderPanier}
                totalPanier={totalPanier}
                ouvrirCheckout={() => setCheckoutOuvert(true)}
              />
            )}

            {view === 'dashboard' && (
              <DashboardView
                totalAujourdhui={totalAujourdhui}
                nbVentesAujourdhui={venteAujourdhui.length}
                produitsStockBas={produitsStockBas}
                meilleuresVentes={meilleuresVentes}
              />
            )}
          </main>
          )}
        </div>
      </div>

      <MobileNavDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        branch={brancheActuelle}
        stockAlerts={produitsStockBas.length}
        onStockAlerts={() => {
          setReportsOpen(false);
          setView('produits');
          closeMenuOnMobile();
        }}
        groups={drawerGroups}
        actions={[{ label: 'Changer de succursale', icon: ArrowLeftRight, onClick: () => setSelectedBranchId(null) }]}
      />
      <MobileBottomNav
        tabs={MOBILE_TABS_VENDOR.map((id): MobileTab => {
          const nav = NAV_ITEMS.find((n) => n.id === id)!;
          return {
            id,
            label: MOBILE_TAB_LABELS[id] ?? nav.label,
            icon: nav.icon,
            active: view === id,
            badge: id === 'vente' ? nbArticlesPanier : id === 'produits' ? produitsStockBas.length : undefined,
            badgeTone: id === 'produits' ? 'warn' : 'default',
            onClick: () => {
              setReportsOpen(id === 'rapports');
              setView(id);
            },
          };
        })}
        moreActive={!MOBILE_TABS_VENDOR.includes(view)}
        onMore={() => setMenuOpen(true)}
      />

      {checkoutOuvert && (
        <CheckoutModal
          lignesPanier={lignesPanier}
          totalPanier={totalPanier}
          fermer={() => setCheckoutOuvert(false)}
          finaliserVente={finaliserVente}
          clientsConnus={clientsConnus}
        />
      )}

      {lastReceipt && <SalesReceiptModal sale={lastReceipt} onClose={() => setLastReceipt(null)} paymentLabel={PAYMENT_METHODS.find((method) => method.id === lastReceipt.paiement)?.label || lastReceipt.paiement} formatCurrency={fmtHTG} creditBalance={creditBalance(lastReceipt)} />}
    </div>
  );
}

/* =========================================================================
   OWNER / ADMIN AREA
   Navigation model: the branches are a top-level tab bar (always visible).
   Whichever branch tab is active, a hamburger button reveals that branch's
   own section menu (Tableau de Bord / Produits / Rapports / Utilisateurs).
   ========================================================================= */

type OwnerSection = 'dashboard' | 'products' | 'sales' | 'purchases' | 'credits' | 'coffre' | 'petitecaisse' | 'reports' | 'users';

const OWNER_SECTIONS: Array<{ id: OwnerSection; label: string; icon: typeof Gauge }> = [
  { id: 'dashboard', label: 'Tableau de Bord', icon: Gauge },
  { id: 'products', label: 'Produits', icon: Boxes },
  { id: 'sales', label: 'Ventes', icon: ShoppingCart },
  { id: 'purchases', label: 'Achats', icon: Truck },
  { id: 'credits', label: 'Crédits', icon: FileClock },
  { id: 'coffre', label: 'Coffre', icon: Vault },
  { id: 'petitecaisse', label: 'Petite caisse', icon: Coins },
  { id: 'reports', label: 'Rapports', icon: BarChart3 },
  { id: 'users', label: 'Utilisateurs', icon: Users },
];
/* =========================================================================
   MOBILE APP CHROME (< md)
   · one sticky app bar: menu · titre de la section · succursale
   · a day strip (+ calendar bottom sheet) replaces the old "Journée" card
   · a bottom navigation bar holds the four main destinations
   · a modal drawer holds everything else, grouped, with identity + actions
   Desktop (≥ md) uses DesktopSidebar / DesktopTopBar (defined below).
   ========================================================================= */
/* Mobile grouping of destinations (drawer) and the four bottom-bar tabs. */
const MOBILE_GROUPS_VENDOR: Array<{ label: string; ids: View[] }> = [
  { label: 'Caisse', ids: ['vente', 'ventes', 'credits'] },
  { label: 'Pilotage', ids: ['dashboard', 'rapports', 'produits', 'achats'] },
  { label: 'Trésorerie', ids: ['coffre', 'petitecaisse'] },
];
const MOBILE_TABS_VENDOR: View[] = ['vente', 'dashboard', 'produits', 'rapports'];

const MOBILE_GROUPS_OWNER: Array<{ label: string; ids: OwnerSection[] }> = [
  { label: 'Pilotage', ids: ['dashboard', 'reports'] },
  { label: 'Activité', ids: ['sales', 'credits', 'products', 'purchases'] },
  { label: 'Trésorerie', ids: ['coffre', 'petitecaisse'] },
  { label: 'Équipe', ids: ['users'] },
];
const MOBILE_TABS_OWNER: OwnerSection[] = ['dashboard', 'sales', 'products', 'reports'];
const MOBILE_TAB_LABELS: Record<string, string> = { dashboard: 'Accueil', rapports: 'Rapports', reports: 'Rapports' };

/* =========================================================================
   DESKTOP APP CHROME (≥ md) — Material 3
   · navigation drawer that collapses to a rail (grouped destinations, badges, report sub-tabs)
   · top bar: branch identity · key figures · day controls (+ branch tabs for the owner)
   Shared by the seller board and the owner board; phones keep the mobile chrome above.
   ========================================================================= */
function DesktopSidebar({
  collapsed,
  onToggle,
  title,
  subtitle,
  groups,
  stockAlerts,
  onStockAlerts,
  actions,
}: {
  collapsed: boolean;
  onToggle: () => void;
  title: string;
  subtitle: string;
  groups: DrawerGroup[];
  stockAlerts: number;
  onStockAlerts: () => void;
  actions: DrawerAction[];
}) {
  return (
    <aside
      aria-label="Navigation principale"
      className={
        'hidden shrink-0 flex-col bg-[var(--m3-surface-container-low)] transition-[width] duration-200 motion-reduce:transition-none md:flex ' +
        (collapsed ? 'w-[88px]' : 'w-[288px]')
      }
    >
      <div className="flex h-20 shrink-0 items-center gap-2 px-4">
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Ouvrir le menu' : 'Réduire le menu'}
          aria-expanded={!collapsed}
          className={`group relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}
        >
          <M3StateLayer />
          <Menu size={24} />
        </button>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold leading-6">{title}</div>
            <div className="truncate text-xs text-[var(--m3-on-surface-variant)]">{subtitle}</div>
          </div>
        )}
      </div>

      <nav aria-label="Sections" className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 [scrollbar-width:thin]">
        {groups.map((group, groupIndex) => (
          <div key={group.label} className={groupIndex > 0 ? 'mt-2' : ''}>
            {collapsed ? (
              groupIndex > 0 && <div className="mx-3 mb-2 h-px bg-[var(--m3-outline-variant)]" />
            ) : (
              <div className="px-4 pb-1 pt-3 text-xs font-medium tracking-[0.03em] text-[var(--m3-on-surface-variant)]">{group.label}</div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const hasChildren = !!item.children;
                return (
                  <div key={item.id}>
                    <button
                      type="button"
                      onClick={item.onClick}
                      title={collapsed ? item.label : undefined}
                      aria-label={item.label}
                      aria-current={item.active ? 'page' : undefined}
                      aria-expanded={hasChildren ? !!item.expanded : undefined}
                      className={
                        'group relative flex h-14 w-full items-center overflow-hidden rounded-full text-sm font-medium tracking-[0.01em] ' +
                        (collapsed ? 'justify-center ' : 'gap-3 px-4 ') +
                        (item.active
                          ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)] '
                          : 'text-[var(--m3-on-surface-variant)] ') +
                        M3_FOCUS
                      }
                    >
                      <M3StateLayer />
                      <Icon size={24} className="shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {!collapsed && hasChildren && (
                        <ChevronDown
                          size={18}
                          aria-hidden="true"
                          className={'ml-auto shrink-0 transition-transform motion-reduce:transition-none ' + (item.expanded ? 'rotate-180' : '')}
                        />
                      )}
                      {!!item.badge &&
                        (collapsed ? (
                          <span className="absolute right-2 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--m3-primary)] px-1 text-[10px] font-medium text-[var(--m3-on-primary)]">
                            {item.badge}
                          </span>
                        ) : (
                          <span className="ml-auto flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--m3-primary)] px-2 text-xs font-medium tabular-nums text-[var(--m3-on-primary)]">
                            {item.badge}
                          </span>
                        ))}
                    </button>

                    {collapsed && item.expanded && item.children && (
                      <div className="m3-in mt-1 space-y-0.5">
                        {item.children.map((child) => (
                          <button
                            key={child.id}
                            type="button"
                            onClick={child.onClick}
                            title={child.label}
                            aria-label={child.label}
                            aria-current={child.active ? 'true' : undefined}
                            className={
                              'group relative flex h-9 w-full items-center justify-center overflow-hidden rounded-full text-xs font-medium ' +
                              (child.active
                                ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)] '
                                : 'text-[var(--m3-on-surface-variant)] ') +
                              M3_FOCUS
                            }
                          >
                            <M3StateLayer />
                            {child.short ?? child.label.slice(0, 3)}
                          </button>
                        ))}
                      </div>
                    )}
                    {!collapsed && item.expanded && item.children && (
                      <div className="m3-in ml-7 mt-1 space-y-0.5 border-l border-[var(--m3-outline-variant)] pl-3">
                        {item.children.map((child) => (
                          <button
                            key={child.id}
                            type="button"
                            onClick={child.onClick}
                            aria-current={child.active ? 'true' : undefined}
                            className={
                              'group relative flex h-10 w-full items-center overflow-hidden rounded-full px-4 text-left text-sm ' +
                              (child.active
                                ? 'bg-[var(--m3-secondary-container)] font-medium text-[var(--m3-on-secondary-container)] '
                                : 'text-[var(--m3-on-surface-variant)] ') +
                              M3_FOCUS
                            }
                          >
                            <M3StateLayer />
                            {child.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-1 px-4 pb-4 pt-2">
        {stockAlerts > 0 &&
          (collapsed ? (
            <button
              type="button"
              onClick={onStockAlerts}
              title={`${stockAlerts} article(s) en stock bas`}
              aria-label={`${stockAlerts} article(s) en stock bas`}
              className={`group relative mb-1 flex h-14 w-full items-center justify-center overflow-hidden rounded-2xl ${M3_STATUS.low.bg} ${M3_STATUS.low.fg} ${M3_FOCUS}`}
            >
              <M3StateLayer />
              <AlertTriangle size={22} />
              <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#251A00] px-1 text-[10px] font-medium text-white">
                {stockAlerts}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onStockAlerts}
              className={`group relative mb-1 flex w-full items-center gap-3 overflow-hidden rounded-2xl px-4 py-3 text-left ${M3_STATUS.low.bg} ${M3_STATUS.low.fg} ${M3_FOCUS}`}
            >
              <M3StateLayer />
              <AlertTriangle size={22} className="shrink-0" />
              <span className="text-sm font-medium leading-5">
                {stockAlerts} article{stockAlerts > 1 ? 's' : ''} en stock bas
              </span>
              <ChevronRight size={18} className="ml-auto shrink-0" />
            </button>
          ))}
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              title={collapsed ? action.label : undefined}
              aria-label={action.label}
              className={
                'group relative flex h-12 w-full items-center overflow-hidden rounded-full text-sm font-medium text-[var(--m3-on-surface-variant)] ' +
                (collapsed ? 'justify-center ' : 'gap-3 px-4 ') +
                M3_FOCUS
              }
            >
              <M3StateLayer />
              <Icon size={22} className="shrink-0" />
              {!collapsed && <span className="truncate">{action.label}</span>}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function DesktopTopBar({
  branch,
  stats,
  date,
  branchSwitcher,
}: {
  branch: Branch;
  stats: HeaderStat[];
  date: {
    selectedDate: Date;
    onSelect: (d: Date) => void;
    salesDays: Set<string>;
    isToday: boolean;
    onShift: (offset: number) => void;
  } | null;
  branchSwitcher?: BranchSwitcher;
}) {
  const isOpen = branch.statut === 'Ouvert';
  const navBtn = `group relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--m3-surface-container-high)] text-[var(--m3-on-surface)] disabled:cursor-not-allowed disabled:opacity-40 ${M3_FOCUS}`;
  return (
    <header className="hidden shrink-0 bg-[var(--m3-surface)] px-8 pb-3 pt-5 md:sticky md:top-0 md:z-30 md:block">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-[28px] font-medium leading-9 tracking-tight">{branch.nom}</h1>
            <span
              className={
                'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium ' +
                (isOpen
                  ? 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]'
                  : 'bg-[var(--m3-surface-container-highest)] text-[var(--m3-on-surface-variant)]')
              }
            >
              <span className={'h-2 w-2 rounded-full ' + (isOpen ? 'bg-[var(--m3-primary)]' : 'bg-[var(--m3-outline)]')} />
              {branch.statut}
            </span>
          </div>
          <div className="truncate text-sm text-[var(--m3-on-surface-variant)]">
            {branch.ville} · {branch.adresse} · Responsable : {branch.gestionnaire}
          </div>
        </div>

        <div className="hidden items-center gap-2 xl:flex">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            const warn = stat.tone === 'warn';
            return (
              <button
                key={stat.id}
                type="button"
                onClick={stat.onClick}
                title={stat.hint}
                className={
                  'group relative items-center gap-2.5 overflow-hidden rounded-2xl px-3 py-1.5 text-left ' +
                  (index >= 3 ? 'hidden 2xl:flex ' : 'flex ') +
                  (warn
                    ? `${M3_STATUS.low.bg} ${M3_STATUS.low.fg} `
                    : 'bg-[var(--m3-surface-container)] text-[var(--m3-on-surface)] ') +
                  M3_FOCUS
                }
              >
                <M3StateLayer />
                <Icon size={18} className="shrink-0 opacity-80" />
                <span>
                  <span className="block text-[11px] leading-4 opacity-70">{stat.label}</span>
                  <span className="block text-sm font-semibold leading-5 tabular-nums">{stat.value}</span>
                </span>
              </button>
            );
          })}
        </div>

        {date ? (
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => date.onShift(-1)} className={navBtn} aria-label="Jour précédent">
              <M3StateLayer />
              <ChevronRight size={20} className="rotate-180" />
            </button>
            <DatePicker selectedDate={date.selectedDate} onSelect={date.onSelect} salesDays={date.salesDays} />
            <button type="button" onClick={() => date.onShift(1)} disabled={date.isToday} className={navBtn} aria-label="Jour suivant">
              <M3StateLayer />
              <ChevronRight size={20} />
            </button>
          </div>
        ) : (
          <div className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-[var(--m3-surface-container-high)] px-4 text-sm font-medium">
            <CalendarDays size={16} className="text-[var(--m3-primary)]" />
            {new Date().toLocaleDateString('fr-HT', { day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
        )}
      </div>

      {branchSwitcher && (
        <div
          role="tablist"
          aria-label="Succursales"
          className="mt-4 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {branchSwitcher.branches.map((b) => {
            const selected = b.id === branchSwitcher.activeId;
            return (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => branchSwitcher.onChange(b.id)}
                className={`group relative shrink-0 ${M3_FOCUS}`}
              >
                <span
                  className={`relative flex h-9 items-center gap-2 overflow-hidden px-4 text-sm font-medium m3-morph ${
                    selected ? 'rounded-full' : 'rounded-xl'
                  } ${
                    selected
                      ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
                      : 'border border-[var(--m3-outline)] text-[var(--m3-on-surface-variant)]'
                  }`}
                >
                  <M3StateLayer />
                  {selected && <Check size={16} />}
                  {shortBranchName(b)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}


function OwnerBoard({
  users,
  setUsers,
  setProducts,
  onBackToBranches,
  branches,
  ventes,
  setVentes,
  achats,
  setAchats,
  cashEntries,
  setCashEntries,
  coffreEntries,
  setCoffreEntries,
  pettyEntries,
  setPettyEntries,
  pettyCounts,
  setPettyCounts,
  pettyFloats,
  setPettyFloats,
  productMovements,
  setProductMovements,
  products,
  selectedBranchId,
  branchInventoryIds,
  setBranchInventoryIds,
}: {
  users: User[];
  setUsers: Dispatch<SetStateAction<User[]>>;
  setProducts: Dispatch<SetStateAction<Product[]>>;
  onBackToBranches: () => void;
  branches: Branch[];
  ventes: SaleRecord[];
  setVentes: Dispatch<SetStateAction<SaleRecord[]>>;
  achats: PurchaseRecord[];
  setAchats: Dispatch<SetStateAction<PurchaseRecord[]>>;
  cashEntries: CashEntry[];
  setCashEntries: Dispatch<SetStateAction<CashEntry[]>>;
  coffreEntries: CoffreEntry[];
  setCoffreEntries: Dispatch<SetStateAction<CoffreEntry[]>>;
  pettyEntries: PettyEntry[];
  setPettyEntries: Dispatch<SetStateAction<PettyEntry[]>>;
  pettyCounts: PettyCount[];
  setPettyCounts: Dispatch<SetStateAction<PettyCount[]>>;
  pettyFloats: Record<string, number>;
  setPettyFloats: Dispatch<SetStateAction<Record<string, number>>>;
  productMovements: ProductMovement[];
  setProductMovements: Dispatch<SetStateAction<ProductMovement[]>>;
  products: Product[];
  selectedBranchId: string | null;
  branchInventoryIds: Record<string, string[]>;
  setBranchInventoryIds: Dispatch<SetStateAction<Record<string, string[]>>>;
}) {
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('daily');
  const [reportsOpen, setReportsOpen] = useState<boolean>(false);
  const [activeBranchId, setActiveBranchId] = useState<string>(selectedBranchId ?? branches[0]?.id ?? '');
  const [menuOpen, setMenuOpen] = useState<boolean>(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 1100px)').matches
  );
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !window.matchMedia('(min-width: 768px)').matches) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);
  const closeMenuOnMobile = () => {
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 768px)').matches) setMenuOpen(false);
  };
  const [activeSection, setActiveSection] = useState<OwnerSection>('dashboard');

  const [inventorySearch, setInventorySearch] = useState<string>('');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState<string>('Tout');
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState<'all' | 'low' | 'normal'>('all');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [historyProductId, setHistoryProductId] = useState<string | null>(null);
  const [restockByProduct, setRestockByProduct] = useState<Record<string, number>>({});

  useEffect(() => {
    if (selectedBranchId) setActiveBranchId(selectedBranchId);
  }, [selectedBranchId]);

  const activeBranch = branches.find((b) => b.id === activeBranchId) ?? branches[0] ?? null;

  const branchProductIds = branchInventoryIds[activeBranchId] ?? [];
  const branchProducts = useMemo(
    () =>
      branchProductIds
        .map((id) => products.find((p) => p.id === id))
        .filter((p): p is Product => Boolean(p)),
    [branchProductIds, products]
  );
  const branchVentesAll = useMemo(
    () => ventes.filter((v) => v.branchId === activeBranchId),
    [ventes, activeBranchId]
  );
  const branchVentes = useMemo(
    () => branchVentesAll.filter((v) => v.statut !== 'annulee'),
    [branchVentesAll]
  );
  const salesDays = useMemo(() => new Set(branchVentesAll.map((v) => dayKey(v.date))), [branchVentesAll]);
  const branchUsers = users.filter((u) => u.branchId === activeBranchId);

  const salesToday = branchVentes.filter((v) => isSameDay(v.date, selectedDate));
  const stockAlertCount = branchProducts.filter((p) => p.stockFermeture <= p.seuil).length;
  const totalRevenueBranch = branchVentes.reduce((sum, v) => sum + v.total, 0);
  const lowStockProducts = branchProducts.filter((p) => p.stockFermeture <= p.seuil).slice(0, 5);
  const recentSales = [...branchVentes].slice(0, 4);

  const soldByProductToday = useMemo(() => {
    const totals: Record<string, number> = {};
    branchVentes.forEach((vente) => {
      if (!isSameDay(vente.date, selectedDate)) return;
      vente.lignes.forEach((ligne) => {
        const product = products.find((item) => item.nom.toLowerCase() === ligne.nom.toLowerCase());
        const key = product?.id ?? ligne.nom.toLowerCase();
        totals[key] = (totals[key] ?? 0) + ligne.qte;
      });
    });
    return totals;
  }, [branchVentes, products, selectedDate]);

  const updateProduct = (productId: string, patch: Partial<Product>) => {
    setProducts((prev) => prev.map((product) => (product.id === productId ? { ...product, ...patch } : product)));
  };

  const updateUser = (userId: string, patch: Partial<User>) => {
    setUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, ...patch } : user)));
  };

  const handleAddProduct = (draft: Partial<Product> = {}) => {
    const branchName = activeBranch?.nom ?? 'Succursale';
    const createdId = `p${Date.now()}`;
    const normalizedDraft = {
      nom: (draft.nom ?? `${branchName} - Nouveau produit`).trim() || `${branchName} - Nouveau produit`,
      categorie: draft.categorie || 'Autre',
      prix: Number(draft.prix) || 0,
      prixAchat: Number(draft.prixAchat) || 0,
      stockOuverture: Math.max(0, Number(draft.stockOuverture) || 0),
      stockFermeture: Math.max(0, Number(draft.stockFermeture) || 0),
      seuil: Math.max(0, Number(draft.seuil) || 5),
      unite: draft.unite?.trim() || 'unité',
      codeBarres: draft.codeBarres?.trim() || undefined,
      sku: draft.sku?.trim() || undefined,
    };
    const newProduct: Product = { id: createdId, ...normalizedDraft };

    setProducts((prev) => [newProduct, ...prev]);
    setBranchInventoryIds((prev) => ({
      ...prev,
      [activeBranchId]: [createdId, ...(prev[activeBranchId] ?? [])],
    }));
  };

  const handleRestockProduct = (product: Product) => {
    const qty = restockByProduct[product.id] ?? 0;
    if (qty <= 0) return;

    updateProduct(product.id, { stockFermeture: product.stockFermeture + qty });
    setProductMovements((prev) => [
      {
        id: `restock-${Date.now()}-${product.id}`,
        branchId: activeBranchId,
        productId: product.id,
        date: new Date(),
        kind: 'restock',
        qty,
        note: 'Réapprovisionnement',
        amount: Number((qty * product.prixAchat).toFixed(2)),
      },
      ...prev,
    ]);
    setRestockByProduct((prev) => ({ ...prev, [product.id]: 0 }));
  };

  const handleDeleteProduct = (product: Product) => {
    setProducts((prev) => prev.filter((item) => item.id !== product.id));
    setBranchInventoryIds((prev) => ({
      ...prev,
      [activeBranchId]: (prev[activeBranchId] ?? []).filter((id) => id !== product.id),
    }));
    setRestockByProduct((prev) => {
      const next = { ...prev };
      delete next[product.id];
      return next;
    });
  };

  const handleCancelSale = (sale: SaleRecord) => {
    if (sale.statut === 'annulee') return;
    setVentes((prev) => prev.map((v) => (v.id === sale.id ? { ...v, statut: 'annulee' } : v)));
    setProducts((prev) =>
      prev.map((product) => {
        const qty = sale.lignes
          .filter((l) => (l.produitId ? l.produitId === product.id : l.nom === product.nom))
          .reduce((sum, l) => sum + l.qte, 0);
        return qty > 0 ? { ...product, stockFermeture: product.stockFermeture + qty } : product;
      })
    );
  };

  const handleAddPurchase = (purchase: Omit<PurchaseRecord, 'id' | 'branchId'>) => {
    setAchats((prev) => [{ ...purchase, id: `A${Date.now()}`, branchId: activeBranchId }, ...prev]);
    setProducts((prev) => applyPurchaseToProducts(prev, purchase.lignes, 1, true));
  };

  const handleCancelPurchase = (purchase: PurchaseRecord) => {
    if (purchase.statut === 'annulee') return;
    setAchats((prev) => prev.map((a) => (a.id === purchase.id ? { ...a, statut: 'annulee' } : a)));
    setProducts((prev) => applyPurchaseToProducts(prev, purchase.lignes, -1, false));
  };

  const handleCreditPayment = (targets: SaleRecord[], montant: number, mode: PaymentMethodId) => {
    const now = new Date();
    let remaining = montant;
    const additions: Record<string, CreditPayment> = {};
    [...targets]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .forEach((sale) => {
        if (remaining <= 0) return;
        const pay = Math.min(creditBalance(sale), remaining);
        if (pay > 0) {
          additions[sale.id] = { id: `P${now.getTime()}-${sale.id}`, date: now, montant: pay, mode };
          remaining -= pay;
        }
      });
    setVentes((prev) =>
      prev.map((v) =>
        additions[v.id] ? { ...v, paiementsCredit: [...(v.paiementsCredit ?? []), additions[v.id]] } : v
      )
    );
  };

  const handleViewHistory = (product: Product) => {
    setHistoryProductId((prev) => (prev === product.id ? null : product.id));
  };

  const shiftSelectedDate = (offset: number) => {
    const nextDate = new Date(selectedDate);
    nextDate.setDate(nextDate.getDate() + offset);
    setSelectedDate(nextDate);
  };

  const isCurrentDateSelected = selectedDate.toDateString() === new Date().toDateString();
  const selectedHistoryProduct = branchProducts.find((p) => p.id === historyProductId) ?? null;
  const productHistoryById = useMemo(() => {
    const map: Record<string, ProductHistoryEntry[]> = {};
    const add = (productId: string, entry: ProductHistoryEntry) => {
      if (!map[productId]) map[productId] = [];
      map[productId].push(entry);
    };

    branchVentesAll.forEach((sale) => {
      sale.lignes.forEach((line, index) => {
        const productId = line.produitId ?? products.find((item) => item.nom.toLowerCase() === line.nom.toLowerCase())?.id;
        if (!productId) return;
        add(productId, {
          id: `sale-${sale.id}-${index}`,
          branchId: sale.branchId,
          productId,
          date: sale.date,
          kind: 'sale',
          qty: line.qte,
          note: sale.id,
          amount: line.sousTotal,
        });
      });
    });

    achats
      .filter((purchase) => purchase.branchId === activeBranchId)
      .forEach((purchase) => {
        purchase.lignes.forEach((line, index) => {
          add(line.produitId, {
            id: `purchase-${purchase.id}-${index}`,
            branchId: purchase.branchId,
            productId: line.produitId,
            date: purchase.date,
            kind: 'purchase',
            qty: line.qte,
            note: purchase.fournisseur,
            amount: line.sousTotal,
          });
        });
      });

    productMovements
      .filter((entry) => entry.branchId === activeBranchId)
      .forEach((entry) => {
        add(entry.productId, entry);
      });

    Object.values(map).forEach((entries) => entries.sort((a, b) => b.date.getTime() - a.date.getTime()));
    return map;
  }, [achats, activeBranchId, branchVentesAll, productMovements, products]);

  const productMetricsById = useMemo(() => {
    const now = Date.now();
    const windowMs = 30 * 24 * 60 * 60 * 1000;
    const metrics: Record<string, { velocity: number; daysLeft: number | null; sales30: number }> = {};

    branchProducts.forEach((product) => {
      const sales30 = (productHistoryById[product.id] ?? []).filter(
        (entry) => entry.kind === 'sale' && entry.date.getTime() >= now - windowMs
      ).reduce((sum, entry) => sum + entry.qty, 0);
      const velocity = sales30 / 30;
      const daysLeft = velocity > 0 ? product.stockFermeture / velocity : null;
      metrics[product.id] = { velocity, daysLeft, sales30 };
    });

    return metrics;
  }, [branchProducts, productHistoryById]);

  const selectBranchTab = (branchId: string) => {
    setActiveBranchId(branchId);
    setActiveSection('dashboard');
  };

  const selectSection = (section: OwnerSection) => {
    setActiveSection(section);
  };

  if (!activeBranch) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#ECE7DC] text-[#16181A]">
        <div className="border-2 border-[#16181A] bg-[#FBFAF6] p-6 text-sm">Aucune succursale disponible.</div>
      </div>
    );
  }

  const drawerGroups: DrawerGroup[] = MOBILE_GROUPS_OWNER.map(({ label, ids }) => ({
          label,
          items: ids.map((id): DrawerItem => {
            const section = OWNER_SECTIONS.find((s) => s.id === id)!;
            const active = activeSection === id;
            const isReports = id === 'reports';
            return {
              id,
              label: section.label,
              icon: section.icon,
              active,
              expanded: isReports ? reportsOpen && active : undefined,
              children: isReports
                ? REPORT_TABS.map((tab) => ({
                    id: tab.id,
                    label: tab.label,
                    short: tab.short,
                    active: reportPeriod === tab.id,
                    onClick: () => {
                      setReportPeriod(tab.id);
                      closeMenuOnMobile();
                    },
                  }))
                : undefined,
              onClick: () => {
                if (isReports) setReportsOpen(active ? !reportsOpen : true);
                else {
                  setReportsOpen(false);
                  closeMenuOnMobile();
                }
                selectSection(id);
              },
            };
          }),
        }));

  const headerStats: HeaderStat[] = [
            {
              id: 'ventes',
              label: 'Ventes',
              value: fmtHTG(salesToday.reduce((s, v) => s + v.total, 0)),
              hint: relativeDayLabel(selectedDate),
              icon: TrendingUp,
              onClick: () => selectSection('sales'),
            },
            {
              id: 'transactions',
              label: 'Transactions',
              value: String(salesToday.length),
              hint: salesToday.length
                ? 'Panier moyen ' + fmtHTG(salesToday.reduce((s, v) => s + v.total, 0) / salesToday.length)
                : 'Aucune vente',
              icon: Receipt,
              onClick: () => selectSection('sales'),
            },
            {
              id: 'stock',
              label: 'Alertes stock',
              value: String(stockAlertCount),
              hint: stockAlertCount ? 'À réapprovisionner' : 'Tout est OK',
              icon: AlertTriangle,
              tone: stockAlertCount ? 'warn' : 'default',
              onClick: () => selectSection('products'),
            },
            {
              id: 'produits',
              label: 'Produits',
              value: String(branchProducts.length),
              hint: 'En catalogue',
              icon: Boxes,
              onClick: () => selectSection('products'),
            },
  ];

  return (
    <div style={M3_VARS} className="min-h-screen w-full bg-[var(--m3-surface)] text-[var(--m3-on-surface)] md:flex md:h-screen md:overflow-hidden">
      <DesktopSidebar
        collapsed={!menuOpen}
        onToggle={() => setMenuOpen((prev) => !prev)}
        title="Administration"
        subtitle="Panneau propriétaire"
        groups={drawerGroups}
        stockAlerts={stockAlertCount}
        onStockAlerts={() => {
          setReportsOpen(false);
          selectSection('products');
        }}
        actions={[{ label: "Quitter l'administration", icon: LogOut, onClick: onBackToBranches }]}
      />
      <div className="min-w-0 flex-1 md:overflow-y-auto">
      <DesktopTopBar
        branch={activeBranch}
        stats={headerStats}
        date={{ selectedDate, onSelect: setSelectedDate, salesDays, isToday: isCurrentDateSelected, onShift: shiftSelectedDate }}
        branchSwitcher={{ branches, activeId: activeBranchId, onChange: selectBranchTab }}
      />
      <div className="px-4 py-5 pb-[calc(5rem+env(safe-area-inset-bottom))] md:px-8 md:pb-8 md:pt-2">
        {/* Active branch header — mobile: sticky app bar + day strip */}
        <BranchHeaderCards
          branch={activeBranch}
          compact={activeSection !== 'dashboard'}
          title={OWNER_SECTIONS.find((s) => s.id === activeSection)?.label ?? ''}
          onMenu={() => setMenuOpen(true)}
          branchSwitcher={{ branches, activeId: activeBranchId, onChange: selectBranchTab }}
          date={{
            selectedDate,
            onSelect: setSelectedDate,
            salesDays,
            isToday: isCurrentDateSelected,
          }}
          stats={headerStats}
        />

        <div className="flex flex-col items-stretch gap-3">
          <main className="w-full min-w-0 flex-1 space-y-5">
            {activeSection === 'dashboard' && (
              <BranchDashboardSection
                branch={activeBranch}
                branchProducts={branchProducts}
                salesToday={salesToday}
                totalRevenue={totalRevenueBranch}
                stockAlertCount={stockAlertCount}
                lowStockProducts={lowStockProducts}
                recentSales={recentSales}
              />
            )}

            {activeSection === 'products' && (
              <BranchProductsSection
                branchId={activeBranchId}
                branchProducts={branchProducts}
                inventorySearch={inventorySearch}
                setInventorySearch={setInventorySearch}
                inventoryCategoryFilter={inventoryCategoryFilter}
                setInventoryCategoryFilter={setInventoryCategoryFilter}
                inventoryStatusFilter={inventoryStatusFilter}
                setInventoryStatusFilter={setInventoryStatusFilter}
                soldByProductToday={soldByProductToday}
                restockByProduct={restockByProduct}
                setRestockByProduct={setRestockByProduct}
                selectedHistoryProduct={selectedHistoryProduct}
                productHistoryById={productHistoryById}
                productMetricsById={productMetricsById}
                onAddProduct={handleAddProduct}
                onUpdateProduct={updateProduct}
                onRestockProduct={handleRestockProduct}
                onDeleteProduct={handleDeleteProduct}
                onRecordMovement={(entry) => setProductMovements((prev) => [{ ...entry, id: `M${Date.now()}-${entry.productId}` }, ...prev])}
                onViewHistory={handleViewHistory}
              />
            )}

            {activeSection === 'sales' && (
              <BranchSalesSection sales={branchVentesAll} products={products} selectedDate={selectedDate} onCancelSale={handleCancelSale} />
            )}

            {activeSection === 'purchases' && (
              <BranchPurchasesSection
                branchProducts={branchProducts}
                purchases={achats.filter((a) => a.branchId === activeBranchId)}
                selectedDate={selectedDate}
                onAdd={handleAddPurchase}
                onCancel={handleCancelPurchase}
              />
            )}

            {activeSection === 'credits' && (
              <BranchCreditsSection sales={branchVentes} onPay={handleCreditPayment} />
            )}

            {activeSection === 'coffre' && (
              <BranchCoffreSection
                branch={activeBranch}
                selectedDate={selectedDate}
                ventes={branchVentesAll}
                cashEntries={cashEntries.filter((e) => e.branchId === activeBranchId)}
                entries={coffreEntries.filter((e) => e.branchId === activeBranchId)}
                onAdd={(entry) =>
                  setCoffreEntries((prev) => [{ ...entry, id: `F${Date.now()}`, branchId: activeBranchId }, ...prev])
                }
                onDelete={(id) => setCoffreEntries((prev) => prev.filter((e) => e.id !== id))}
                onSetPiece={(id, piece) =>
                  setCoffreEntries((prev) => prev.map((e) => (e.id === id ? { ...e, piece } : e)))
                }
              />
            )}

            {activeSection === 'petitecaisse' && (
              <BranchPetiteCaisseSection
                branch={activeBranch}
                selectedDate={selectedDate}
                entries={pettyEntries.filter((e) => e.branchId === activeBranchId)}
                counts={pettyCounts.filter((c) => c.branchId === activeBranchId)}
                fixedFloat={pettyFloats[activeBranchId] ?? DEFAULT_PETTY_FLOAT}
                setFixedFloat={(value) => setPettyFloats((prev) => ({ ...prev, [activeBranchId]: value }))}
                coffreEspeces={coffreBalances(coffreEntries.filter((e) => e.branchId === activeBranchId)).especes}
                onAdd={(entry, fromCoffre) => {
                  const stamp = Date.now();
                  let coffreId: string | undefined;
                  if (entry.kind === 'reappro' && fromCoffre) {
                    coffreId = `F${stamp}`;
                    setCoffreEntries((prev) => [
                      {
                        id: coffreId as string,
                        branchId: activeBranchId,
                        date: entry.date,
                        kind: 'sortie',
                        categorie: PETTY_REAPPRO_CATEGORY,
                        compte: 'especes',
                        montant: entry.montant,
                        note: 'Réapprovisionnement petite caisse',
                        piece: { ref: `BON-${stamp}`, nom: `bon-reappro-${stamp}.svg`, type: 'image/svg+xml' },
                      },
                      ...prev,
                    ]);
                  }
                  setPettyEntries((prev) => [{ ...entry, id: `PC${stamp}`, branchId: activeBranchId, coffreId }, ...prev]);
                }}
                onDelete={(id) => {
                  const target = pettyEntries.find((e) => e.id === id);
                  if (target?.coffreId) setCoffreEntries((prev) => prev.filter((e) => e.id !== target.coffreId));
                  setPettyEntries((prev) => prev.filter((e) => e.id !== id));
                }}
                onAddCount={(count) =>
                  setPettyCounts((prev) => [{ ...count, id: `PK${Date.now()}`, branchId: activeBranchId }, ...prev])
                }
                onDeleteCount={(id) => setPettyCounts((prev) => prev.filter((c) => c.id !== id))}
              />
            )}

            {activeSection === 'reports' && (
              <BranchReportsSection
                branch={activeBranch}
                period={reportPeriod}
                setPeriod={setReportPeriod}
                selectedDate={selectedDate}
                ventes={branchVentesAll}
                entries={cashEntries.filter((e) => e.branchId === activeBranchId)}
                products={branchProducts}
                onAddEntry={(entry) =>
                  setCashEntries((prev) => [{ ...entry, id: `C${Date.now()}`, branchId: activeBranchId }, ...prev])
                }
                onDeleteEntry={(id) => setCashEntries((prev) => prev.filter((e) => e.id !== id))}
              />
            )}

            {activeSection === 'users' && (
              <BranchUsersSection branchUsers={branchUsers} onUpdateUser={updateUser} />
            )}
          </main>
        </div>
      </div>
      </div>

      <MobileNavDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        branch={activeBranch}
        stockAlerts={stockAlertCount}
        onStockAlerts={() => {
          setReportsOpen(false);
          selectSection('products');
          closeMenuOnMobile();
        }}
        groups={drawerGroups}
        actions={[{ label: "Quitter l'administration", icon: LogOut, onClick: onBackToBranches }]}
      />
      <MobileBottomNav
        tabs={MOBILE_TABS_OWNER.map((id): MobileTab => {
          const section = OWNER_SECTIONS.find((s) => s.id === id)!;
          return {
            id,
            label: MOBILE_TAB_LABELS[id] ?? section.label,
            icon: section.icon,
            active: activeSection === id,
            badge: id === 'products' ? stockAlertCount : undefined,
            badgeTone: 'warn',
            onClick: () => {
              setReportsOpen(id === 'reports');
              selectSection(id);
            },
          };
        })}
        moreActive={!MOBILE_TABS_OWNER.includes(activeSection)}
        onMore={() => setMenuOpen(true)}
      />
    </div>
  );
}

/* =========================================================================
   Sections de gestion du panneau vendeur — réutilise les mêmes composants
   Branch*Section que le panneau propriétaire, limités à une seule succursale.
   ========================================================================= */
function BranchManagementSections({
  view,
  branch,
  selectedDate,
  reportPeriod,
  setReportPeriod,
  products,
  setProducts,
  branchProductIds,
  setBranchInventoryIds,
  ventes,
  setVentes,
  achats,
  setAchats,
  productMovements,
  setProductMovements,
  cashEntries,
  setCashEntries,
  coffreEntries,
  setCoffreEntries,
  pettyEntries,
  setPettyEntries,
  pettyCounts,
  setPettyCounts,
  pettyFloats,
  setPettyFloats,
}: {
  view: ManagementView;
  branch: Branch;
  selectedDate: Date;
  reportPeriod: ReportPeriod;
  setReportPeriod: Dispatch<SetStateAction<ReportPeriod>>;
  products: Product[];
  setProducts: Dispatch<SetStateAction<Product[]>>;
  branchProductIds: string[];
  setBranchInventoryIds: Dispatch<SetStateAction<Record<string, string[]>>>;
  ventes: SaleRecord[];
  setVentes: Dispatch<SetStateAction<SaleRecord[]>>;
  achats: PurchaseRecord[];
  setAchats: Dispatch<SetStateAction<PurchaseRecord[]>>;
  productMovements: ProductMovement[];
  setProductMovements: Dispatch<SetStateAction<ProductMovement[]>>;
  cashEntries: CashEntry[];
  setCashEntries: Dispatch<SetStateAction<CashEntry[]>>;
  coffreEntries: CoffreEntry[];
  setCoffreEntries: Dispatch<SetStateAction<CoffreEntry[]>>;
  pettyEntries: PettyEntry[];
  setPettyEntries: Dispatch<SetStateAction<PettyEntry[]>>;
  pettyCounts: PettyCount[];
  setPettyCounts: Dispatch<SetStateAction<PettyCount[]>>;
  pettyFloats: Record<string, number>;
  setPettyFloats: Dispatch<SetStateAction<Record<string, number>>>;
}) {
  const branchId = branch.id;
  const [inventorySearch, setInventorySearch] = useState<string>('');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState<string>('Tout');
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState<'all' | 'low' | 'normal'>('all');
  const [historyProductId, setHistoryProductId] = useState<string | null>(null);
  const [restockByProduct, setRestockByProduct] = useState<Record<string, number>>({});

  const branchProducts = useMemo(
    () =>
      branchProductIds
        .map((id) => products.find((p) => p.id === id))
        .filter((p): p is Product => Boolean(p)),
    [branchProductIds, products]
  );
  const branchVentesAll = useMemo(() => ventes.filter((v) => v.branchId === branchId), [ventes, branchId]);
  const branchVentes = useMemo(() => branchVentesAll.filter((v) => v.statut !== 'annulee'), [branchVentesAll]);
  const selectedHistoryProduct = branchProducts.find((p) => p.id === historyProductId) ?? null;
  const productHistoryById = useMemo(() => {
    const map: Record<string, ProductHistoryEntry[]> = {};
    const add = (productId: string, entry: ProductHistoryEntry) => {
      if (!map[productId]) map[productId] = [];
      map[productId].push(entry);
    };

    branchVentesAll.forEach((sale) => {
      sale.lignes.forEach((line, index) => {
        const productId = line.produitId ?? products.find((item) => item.nom.toLowerCase() === line.nom.toLowerCase())?.id;
        if (!productId) return;
        add(productId, {
          id: `sale-${sale.id}-${index}`,
          branchId: sale.branchId,
          productId,
          date: sale.date,
          kind: 'sale',
          qty: line.qte,
          note: sale.id,
          amount: line.sousTotal,
        });
      });
    });

    achats
      .filter((purchase) => purchase.branchId === branchId)
      .forEach((purchase) => {
        purchase.lignes.forEach((line, index) => {
          add(line.produitId, {
            id: `purchase-${purchase.id}-${index}`,
            branchId: purchase.branchId,
            productId: line.produitId,
            date: purchase.date,
            kind: 'purchase',
            qty: line.qte,
            note: purchase.fournisseur,
            amount: line.sousTotal,
          });
        });
      });

    const restockEntries = productMovements.filter((entry) => entry.branchId === branchId);
    restockEntries.forEach((entry) => add(entry.productId, entry));

    Object.values(map).forEach((entries) => entries.sort((a, b) => b.date.getTime() - a.date.getTime()));
    return map;
  }, [achats, branchId, branchVentesAll, productMovements, products]);

  const productMetricsById = useMemo(() => {
    const now = Date.now();
    const windowMs = 30 * 24 * 60 * 60 * 1000;
    const metrics: Record<string, { velocity: number; daysLeft: number | null; sales30: number }> = {};

    branchProducts.forEach((product) => {
      const sales30 = (productHistoryById[product.id] ?? []).filter(
        (entry) => entry.kind === 'sale' && entry.date.getTime() >= now - windowMs
      ).reduce((sum, entry) => sum + entry.qty, 0);
      const velocity = sales30 / 30;
      const daysLeft = velocity > 0 ? product.stockFermeture / velocity : null;
      metrics[product.id] = { velocity, daysLeft, sales30 };
    });

    return metrics;
  }, [branchProducts, productHistoryById]);

  const soldByProductToday = useMemo(() => {
    const totals: Record<string, number> = {};
    branchVentes.forEach((vente) => {
      if (!isSameDay(vente.date, selectedDate)) return;
      vente.lignes.forEach((ligne) => {
        const product = products.find((item) => item.nom.toLowerCase() === ligne.nom.toLowerCase());
        const key = product?.id ?? ligne.nom.toLowerCase();
        totals[key] = (totals[key] ?? 0) + ligne.qte;
      });
    });
    return totals;
  }, [branchVentes, products, selectedDate]);

  const updateProduct = (productId: string, patch: Partial<Product>) => {
    setProducts((prev) => prev.map((product) => (product.id === productId ? { ...product, ...patch } : product)));
  };

  const handleAddProduct = (draft: Partial<Product> = {}) => {
    const createdId = `p${Date.now()}`;
    const normalizedDraft = {
      nom: (draft.nom ?? `${branch.nom} - Nouveau produit`).trim() || `${branch.nom} - Nouveau produit`,
      categorie: draft.categorie || 'Autre',
      prix: Number(draft.prix) || 0,
      prixAchat: Number(draft.prixAchat) || 0,
      stockOuverture: Math.max(0, Number(draft.stockOuverture) || 0),
      stockFermeture: Math.max(0, Number(draft.stockFermeture) || 0),
      seuil: Math.max(0, Number(draft.seuil) || 5),
      unite: draft.unite?.trim() || 'unité',
      codeBarres: draft.codeBarres?.trim() || undefined,
      sku: draft.sku?.trim() || undefined,
    };
    const newProduct: Product = { id: createdId, ...normalizedDraft };
    setProducts((prev) => [newProduct, ...prev]);
    setBranchInventoryIds((prev) => ({ ...prev, [branchId]: [createdId, ...(prev[branchId] ?? [])] }));
  };

  const handleRestockProduct = (product: Product) => {
    const qty = restockByProduct[product.id] ?? 0;
    if (qty <= 0) return;
    updateProduct(product.id, { stockFermeture: product.stockFermeture + qty });
    setProductMovements((prev) => [
      {
        id: `restock-${Date.now()}-${product.id}`,
        branchId: branchId,
        productId: product.id,
        date: new Date(),
        kind: 'restock',
        qty,
        note: 'Réapprovisionnement',
        amount: Number((qty * product.prixAchat).toFixed(2)),
      },
      ...prev,
    ]);
    setRestockByProduct((prev) => ({ ...prev, [product.id]: 0 }));
  };

  const handleDeleteProduct = (product: Product) => {
    setProducts((prev) => prev.filter((item) => item.id !== product.id));
    setBranchInventoryIds((prev) => ({
      ...prev,
      [branchId]: (prev[branchId] ?? []).filter((id) => id !== product.id),
    }));
    setRestockByProduct((prev) => {
      const next = { ...prev };
      delete next[product.id];
      return next;
    });
  };

  const handleCancelSale = (sale: SaleRecord) => {
    if (sale.statut === 'annulee') return;
    setVentes((prev) => prev.map((v) => (v.id === sale.id ? { ...v, statut: 'annulee' } : v)));
    setProducts((prev) =>
      prev.map((product) => {
        const qty = sale.lignes
          .filter((l) => (l.produitId ? l.produitId === product.id : l.nom === product.nom))
          .reduce((sum, l) => sum + l.qte, 0);
        return qty > 0 ? { ...product, stockFermeture: product.stockFermeture + qty } : product;
      })
    );
  };

  const handleAddPurchase = (purchase: Omit<PurchaseRecord, 'id' | 'branchId'>) => {
    setAchats((prev) => [{ ...purchase, id: `A${Date.now()}`, branchId: branchId }, ...prev]);
    setProducts((prev) => applyPurchaseToProducts(prev, purchase.lignes, 1, true));
  };

  const handleCancelPurchase = (purchase: PurchaseRecord) => {
    if (purchase.statut === 'annulee') return;
    setAchats((prev) => prev.map((a) => (a.id === purchase.id ? { ...a, statut: 'annulee' } : a)));
    setProducts((prev) => applyPurchaseToProducts(prev, purchase.lignes, -1, false));
  };

  const handleCreditPayment = (targets: SaleRecord[], montant: number, mode: PaymentMethodId) => {
    const now = new Date();
    let remaining = montant;
    const additions: Record<string, CreditPayment> = {};
    [...targets]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .forEach((sale) => {
        if (remaining <= 0) return;
        const pay = Math.min(creditBalance(sale), remaining);
        if (pay > 0) {
          additions[sale.id] = { id: `P${now.getTime()}-${sale.id}`, date: now, montant: pay, mode };
          remaining -= pay;
        }
      });
    setVentes((prev) =>
      prev.map((v) =>
        additions[v.id] ? { ...v, paiementsCredit: [...(v.paiementsCredit ?? []), additions[v.id]] } : v
      )
    );
  };

  return (
    <div className="space-y-5">
      {view === 'produits' && (
        <BranchProductsSection
          branchId={branchId}
          branchProducts={branchProducts}
          inventorySearch={inventorySearch}
          setInventorySearch={setInventorySearch}
          inventoryCategoryFilter={inventoryCategoryFilter}
          setInventoryCategoryFilter={setInventoryCategoryFilter}
          inventoryStatusFilter={inventoryStatusFilter}
          setInventoryStatusFilter={setInventoryStatusFilter}
          soldByProductToday={soldByProductToday}
          restockByProduct={restockByProduct}
          setRestockByProduct={setRestockByProduct}
          selectedHistoryProduct={selectedHistoryProduct}
          productHistoryById={productHistoryById}
          productMetricsById={productMetricsById}
          onAddProduct={handleAddProduct}
          onUpdateProduct={updateProduct}
          onRestockProduct={handleRestockProduct}
          onDeleteProduct={handleDeleteProduct}
          onRecordMovement={(entry) => setProductMovements((prev) => [{ ...entry, id: `M${Date.now()}-${entry.productId}` }, ...prev])}
          onViewHistory={(product) => setHistoryProductId((prev) => (prev === product.id ? null : product.id))}
        />
      )}

      {view === 'ventes' && (
        <BranchSalesSection sales={branchVentesAll} products={products} selectedDate={selectedDate} onCancelSale={handleCancelSale} />
      )}

      {view === 'achats' && (
        <BranchPurchasesSection
          branchProducts={branchProducts}
          purchases={achats.filter((a) => a.branchId === branchId)}
          selectedDate={selectedDate}
          onAdd={handleAddPurchase}
          onCancel={handleCancelPurchase}
        />
      )}

      {view === 'credits' && <BranchCreditsSection sales={branchVentes} onPay={handleCreditPayment} />}

      {view === 'coffre' && (
        <BranchCoffreSection
          branch={branch}
          selectedDate={selectedDate}
          ventes={branchVentesAll}
          cashEntries={cashEntries.filter((e) => e.branchId === branchId)}
          entries={coffreEntries.filter((e) => e.branchId === branchId)}
          onAdd={(entry) => setCoffreEntries((prev) => [{ ...entry, id: `F${Date.now()}`, branchId }, ...prev])}
          onDelete={(id) => setCoffreEntries((prev) => prev.filter((e) => e.id !== id))}
          onSetPiece={(id, piece) =>
            setCoffreEntries((prev) => prev.map((e) => (e.id === id ? { ...e, piece } : e)))
          }
        />
      )}

      {view === 'petitecaisse' && (
        <BranchPetiteCaisseSection
          branch={branch}
          selectedDate={selectedDate}
          entries={pettyEntries.filter((e) => e.branchId === branchId)}
          counts={pettyCounts.filter((c) => c.branchId === branchId)}
          fixedFloat={pettyFloats[branchId] ?? DEFAULT_PETTY_FLOAT}
          setFixedFloat={(value) => setPettyFloats((prev) => ({ ...prev, [branchId]: value }))}
          coffreEspeces={coffreBalances(coffreEntries.filter((e) => e.branchId === branchId)).especes}
          onAdd={(entry, fromCoffre) => {
            const stamp = Date.now();
            let coffreId: string | undefined;
            if (entry.kind === 'reappro' && fromCoffre) {
              coffreId = `F${stamp}`;
              setCoffreEntries((prev) => [
                {
                  id: coffreId as string,
                  branchId,
                  date: entry.date,
                  kind: 'sortie',
                  categorie: PETTY_REAPPRO_CATEGORY,
                  compte: 'especes',
                  montant: entry.montant,
                  note: 'Réapprovisionnement petite caisse',
                  piece: { ref: `BON-${stamp}`, nom: `bon-reappro-${stamp}.svg`, type: 'image/svg+xml' },
                },
                ...prev,
              ]);
            }
            setPettyEntries((prev) => [{ ...entry, id: `PC${stamp}`, branchId, coffreId }, ...prev]);
          }}
          onDelete={(id) => {
            const target = pettyEntries.find((e) => e.id === id);
            if (target?.coffreId) setCoffreEntries((prev) => prev.filter((e) => e.id !== target.coffreId));
            setPettyEntries((prev) => prev.filter((e) => e.id !== id));
          }}
          onAddCount={(count) =>
            setPettyCounts((prev) => [{ ...count, id: `PK${Date.now()}`, branchId }, ...prev])
          }
          onDeleteCount={(id) => setPettyCounts((prev) => prev.filter((c) => c.id !== id))}
        />
      )}

      {view === 'rapports' && (
        <BranchReportsSection
          branch={branch}
          period={reportPeriod}
          setPeriod={setReportPeriod}
          selectedDate={selectedDate}
          ventes={branchVentesAll}
          entries={cashEntries.filter((e) => e.branchId === branchId)}
          products={branchProducts}
          onAddEntry={(entry) => setCashEntries((prev) => [{ ...entry, id: `C${Date.now()}`, branchId }, ...prev])}
          onDeleteEntry={(id) => setCashEntries((prev) => prev.filter((e) => e.id !== id))}
        />
      )}
    </div>
  );
}

function BranchDashboardSection({
  branch,
  branchProducts,
  salesToday,
  totalRevenue,
  stockAlertCount,
  lowStockProducts,
  recentSales,
}: {
  branch: Branch;
  branchProducts: Product[];
  salesToday: SaleRecord[];
  totalRevenue: number;
  stockAlertCount: number;
  lowStockProducts: Product[];
  recentSales: SaleRecord[];
}) {
  const alertTone = stockAlertCount > 0 ? `${M3_STATUS.low.bg} ${M3_STATUS.low.fg}` : 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]';

  return (
    <div style={M3_VARS} className="space-y-4 font-sans text-[var(--m3-on-surface)]">
      <div className="hidden md:block">
        <h2 className="text-[32px] font-bold leading-10 tracking-tight">Tableau de bord</h2>
        <p className="truncate text-sm text-[var(--m3-on-surface-variant)]">
          {branch.ville} · {branch.adresse} · {branchProducts.length} article{branchProducts.length !== 1 ? 's' : ''} en inventaire
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <section className="col-span-2 flex items-center gap-4 rounded-[28px] bg-[var(--m3-primary-container)] p-5 text-[var(--m3-on-primary-container)] md:order-2 md:col-span-1">
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/40">
            <TrendingUp size={24} />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium opacity-80">Revenu total</div>
            <div className="break-words text-[28px] font-bold leading-9 tracking-tight tabular-nums">{fmtHTG(totalRevenue)}</div>
          </div>
        </section>
        <div className="min-w-0 rounded-[28px] bg-[var(--m3-surface-container)] p-5 md:order-1">
          <div className="flex items-center gap-1.5 text-sm text-[var(--m3-on-surface-variant)]">
            <Receipt size={14} /> Ventes du jour
          </div>
          <div className="mt-1 truncate text-[28px] font-bold leading-9 tracking-tight tabular-nums">{salesToday.length}</div>
        </div>
        <div className={'min-w-0 rounded-[28px] p-5 md:order-3 ' + alertTone}>
          <div className="flex items-center gap-1.5 text-sm opacity-80">
            <AlertTriangle size={14} /> Stock bas
          </div>
          <div className="mt-1 truncate text-[28px] font-bold leading-9 tracking-tight tabular-nums">{stockAlertCount}</div>
        </div>
      </div>

      {/* Branch details (phone: the header already names the branch) */}
      <div className="flex items-center gap-3 rounded-[20px] bg-[var(--m3-surface-container-low)] px-4 py-3 md:hidden">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]">
          <MapPin size={18} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{branch.ville} · {branch.adresse}</div>
          <div className="text-xs text-[var(--m3-on-surface-variant)]">
            {branchProducts.length} article{branchProducts.length !== 1 ? 's' : ''} en inventaire
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Low stock */}
        <section className="rounded-[28px] bg-[var(--m3-surface-container-low)] p-4 md:p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-medium">Alertes stock bas</h3>
            {stockAlertCount > 0 && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums ${M3_STATUS.low.bg} ${M3_STATUS.low.fg}`}>{stockAlertCount}</span>
            )}
          </div>
          {lowStockProducts.length === 0 ? (
            <div className="mt-3 flex items-center gap-3 rounded-[20px] bg-[var(--m3-primary-container)] px-4 py-3 text-sm text-[var(--m3-on-primary-container)]">
              <Check size={18} className="shrink-0" /> Tous les stocks sont à un niveau sain.
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-[var(--m3-outline-variant)]">
              {lowStockProducts.map((product) => {
                const out = product.stockFermeture <= 0;
                const tone = out ? M3_STATUS.out : M3_STATUS.low;
                return (
                  <li key={product.id} className="flex items-center gap-3 py-2.5">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone.bg} ${tone.fg}`}>
                      <AlertTriangle size={18} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{product.nom}</span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${tone.bg} ${tone.fg}`}>
                      {out ? 'Rupture' : `${product.stockFermeture} en stock`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Recent sales */}
        <section className="rounded-[28px] bg-[var(--m3-surface-container-low)] p-4 md:p-5">
          <h3 className="text-base font-medium">Ventes récentes</h3>
          {recentSales.length === 0 ? (
            <div className="mt-3 rounded-[20px] bg-[var(--m3-surface-container)] px-4 py-6 text-center text-sm text-[var(--m3-on-surface-variant)]">
              Aucune vente enregistrée pour l&apos;instant.
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-[var(--m3-outline-variant)]">
              {recentSales.map((sale) => (
                <li key={sale.id} className="flex items-center gap-3 py-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]">
                    <Receipt size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{sale.id}</div>
                    <div className="text-xs text-[var(--m3-on-surface-variant)]">{sale.date.toLocaleDateString('fr-HT')}</div>
                  </div>
                  <div className="shrink-0 text-sm font-medium tabular-nums">{fmtHTG(sale.total)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/* =========================================================================
   MATERIAL 3 EXPRESSIVE — mobile UI
   Expressive = vivid tonal colour (incl. tertiary), larger corner radii,
   shape-morphing controls (pill → rounded square on press / selection),
   spring-based motion and emphasised (heavier) type.
   Colour roles (container / on-container pairs) are exposed as CSS custom
   properties on the section root, so the whole phone UI can be re-tinted by
   swapping a palette ("dynamic colour", user-controlled). Desktop keeps the
   house style: every M3 class below is only applied below the `sm` breakpoint.
   ========================================================================= */



/* =========================================================================
   ACHATS — everything the company buys in order to sell.
   Recording a purchase adds the quantities to stock and updates the product's cost price;
   cancelling one takes the quantities back out.
   ========================================================================= */


function BranchUserCard({
  user,
  onUpdateUser,
}: {
  user: User;
  onUpdateUser: (userId: string, patch: Partial<User>) => void;
}) {
  const [showPwd, setShowPwd] = useState(false);
  const field =
    'block min-w-0 rounded-xl bg-[var(--m3-surface)] px-4 pb-1.5 pt-2 ring-1 ring-[var(--m3-outline)] transition-shadow focus-within:ring-2 focus-within:ring-[var(--m3-primary)] motion-reduce:transition-none';
  const input = 'h-8 w-full min-w-0 bg-transparent p-0 text-base text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)]';
  const label = 'block text-xs leading-4 text-[var(--m3-on-surface-variant)]';

  return (
    <li className="rounded-[28px] bg-[var(--m3-surface-container)] p-4 md:p-5">
      <div className="mb-4 flex items-center gap-3">
        {user.profilePic ? (
          <img src={user.profilePic} alt="" className="h-14 w-14 shrink-0 rounded-full bg-[var(--m3-surface-container-high)] object-cover" />
        ) : (
          <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]">
            <UserRound size={26} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-medium">{user.name || 'Sans nom'}</div>
          <span className="mt-1 inline-flex items-center gap-1 rounded-lg bg-[var(--m3-secondary-container)] px-2 py-0.5 text-xs font-medium text-[var(--m3-on-secondary-container)]">
            <Store size={12} /> Vendeur
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <label className={field}>
          <span className={label}>Nom</span>
          <input
            value={user.name}
            onChange={(event) => onUpdateUser(user.id, { name: event.target.value })}
            autoComplete="off"
            className={input}
          />
        </label>

        <label className={field + ' relative pr-14'}>
          <span className={label}>Mot de passe</span>
          <input
            type={showPwd ? 'text' : 'password'}
            value={user.password}
            onChange={(event) => onUpdateUser(user.id, { password: event.target.value })}
            autoComplete="new-password"
            className={input}
          />
          <button
            type="button"
            onClick={() => setShowPwd((v) => !v)}
            aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            aria-pressed={showPwd}
            className={`group absolute right-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}
          >
            <M3StateLayer />
            {showPwd ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </label>
      </div>
    </li>
  );
}

function BranchUsersSection({
  branchUsers,
  onUpdateUser,
}: {
  branchUsers: User[];
  onUpdateUser: (userId: string, patch: Partial<User>) => void;
}) {
  return (
    <div style={M3_VARS} className="space-y-4 font-sans text-[var(--m3-on-surface)]">
      <div className="hidden md:block">
        <h2 className="text-[32px] font-bold leading-10 tracking-tight">Utilisateurs</h2>
        <p className="text-sm text-[var(--m3-on-surface-variant)]">
          {branchUsers.length} vendeur{branchUsers.length !== 1 ? 's' : ''} dans cette succursale
        </p>
      </div>
      <p className="px-1 text-sm text-[var(--m3-on-surface-variant)] md:hidden">
        {branchUsers.length} vendeur{branchUsers.length !== 1 ? 's' : ''} dans cette succursale
      </p>

      {branchUsers.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-[28px] bg-[var(--m3-surface-container-low)] px-4 py-14 text-center">
          <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]">
            <Users size={28} />
          </span>
          <span className="text-base font-medium">Aucun vendeur assigné à cette succursale.</span>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {branchUsers.map((user) => (
            <BranchUserCard key={user.id} user={user} onUpdateUser={onUpdateUser} />
          ))}
        </ul>
      )}
    </div>
  );
}

/* Password dialog shared by the owner and branch entrances.
   Phone (< sm): Material 3 Expressive dialog — tonal surface, XL corners, icon badge, filled field, pill actions.
   Desktop (≥ sm): the original hard-bordered house style, unchanged. */
function AccessDialog({
  eyebrow,
  title,
  description,
  fieldLabel,
  accent,
  passwordValue,
  setPasswordValue,
  errorMessage,
  onClose,
  onConfirm,
}: {
  eyebrow: string;
  title: string;
  description: string;
  fieldLabel: string;
  accent: 'ink' | 'rust';
  passwordValue: string;
  setPasswordValue: Dispatch<SetStateAction<string>>;
  errorMessage: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const confirmDesktop =
    accent === 'rust'
      ? 'sm:border-[#16181A] sm:bg-[#C1440E] sm:hover:bg-[#a83a0c]'
      : 'sm:border-[#16181A] sm:bg-[#16181A] sm:hover:bg-[#2b2e31]';
  return (
    <div className="m3-scrim fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 sm:bg-black/60">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={M3_VARS}
        className="m3-pop w-full max-w-md rounded-[32px] bg-[var(--m3-surface-container-high)] text-[var(--m3-on-surface)] shadow-[0_8px_10px_-6px_rgba(0,0,0,0.2),0_16px_24px_2px_rgba(0,0,0,0.14)] sm:rounded-none sm:border-2 sm:border-[#16181A] sm:bg-[#FBFAF6] sm:text-[#16181A] sm:shadow-none"
      >
        <div className="flex items-start justify-between gap-3 px-6 pb-2 pt-6 sm:items-center sm:border-b-2 sm:border-[#16181A] sm:px-5 sm:py-4">
          <div className="min-w-0">
            <span className="mb-4 flex h-14 w-14 -rotate-6 items-center justify-center rounded-[20px] bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)] sm:hidden">
              <Lock size={26} />
            </span>
            <div className="text-sm font-medium text-[var(--m3-on-surface-variant)] sm:text-[11px] sm:font-normal sm:uppercase sm:tracking-[0.2em] sm:text-[#4B5560]">{eyebrow}</div>
            <div className="mt-1 text-2xl font-bold leading-8 sm:font-serif sm:font-normal sm:leading-normal">{title}</div>
          </div>
          <button
            onClick={onClose}
            className={`group relative -mr-2 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] sm:mr-0 sm:mt-0 sm:h-auto sm:w-auto sm:overflow-visible sm:rounded-none sm:text-[#4B5560] sm:hover:text-[#C1440E] ${M3_FOCUS}`}
            aria-label="Fermer"
          >
            <M3StateLayer className="sm:hidden" />
            <X size={20} className="sm:h-[18px] sm:w-[18px]" />
          </button>
        </div>

        <div className="px-6 pb-6 pt-2 sm:px-5 sm:py-5">
          <div className="mb-4 text-sm leading-5 text-[var(--m3-on-surface-variant)] sm:mb-3 sm:text-[13px] sm:leading-normal sm:text-[#4B5560]">
            {description}
          </div>
          <label className="mb-1.5 block px-1 text-xs font-medium text-[var(--m3-on-surface-variant)] sm:mb-1 sm:px-0 sm:text-[12px] sm:font-normal sm:uppercase sm:tracking-wide sm:text-[#4B5560]">
            {fieldLabel}
          </label>
          <input
            type="password"
            value={passwordValue}
            onChange={(e) => setPasswordValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onConfirm()}
            placeholder="••••••••"
            autoFocus
            className="h-14 w-full rounded-2xl bg-[var(--m3-surface-container-highest)] px-4 text-base outline-none focus:ring-2 focus:ring-[var(--m3-primary)] sm:h-auto sm:rounded-none sm:border-2 sm:border-[#16181A] sm:bg-white sm:px-3 sm:py-2 sm:text-sm sm:focus:border-[#C1440E] sm:focus:ring-0"
          />

          {errorMessage && (
            <div
              role="alert"
              className="mt-3 rounded-2xl bg-[#FFDAD6] px-4 py-3 text-sm font-medium text-[#410002] sm:rounded-none sm:border-2 sm:border-[#C1440E] sm:bg-[#FDF1EC] sm:px-3 sm:py-2 sm:text-[12px] sm:font-normal sm:text-[#C1440E]"
            >
              {errorMessage}
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:mt-5 sm:flex-row">
            <button
              onClick={onClose}
              className={`group relative h-12 flex-1 overflow-hidden rounded-full bg-[var(--m3-secondary-container)] text-sm font-semibold text-[var(--m3-on-secondary-container)] m3-press motion-reduce:transition-none sm:h-auto sm:rounded-none sm:border-2 sm:border-[#16181A] sm:bg-white sm:py-2.5 sm:text-[14px] sm:font-normal sm:text-[#16181A] sm:hover:bg-[#ECE7DC] ${M3_FOCUS}`}
            >
              <M3StateLayer className="sm:hidden" />
              Annuler
            </button>
            <button
              onClick={onConfirm}
              className={`group relative h-12 flex-1 overflow-hidden rounded-full bg-[var(--m3-primary)] text-sm font-semibold text-[var(--m3-on-primary)] m3-press motion-reduce:transition-none sm:h-auto sm:rounded-none sm:border-2 sm:py-2.5 sm:text-[14px] sm:font-medium sm:text-white ${confirmDesktop} ${M3_FOCUS}`}
            >
              <M3StateLayer className="sm:hidden" />
              Ouvrir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OwnerAccessModal({
  passwordValue,
  setPasswordValue,
  errorMessage,
  onClose,
  onConfirm,
}: {
  passwordValue: string;
  setPasswordValue: Dispatch<SetStateAction<string>>;
  errorMessage: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <AccessDialog
      eyebrow="Accès propriétaire"
      title="Panneau principal"
      description="Entrez le mot de passe du propriétaire pour accéder à l’ensemble du système."
      fieldLabel="Mot de passe propriétaire"
      accent="ink"
      passwordValue={passwordValue}
      setPasswordValue={setPasswordValue}
      errorMessage={errorMessage}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

function BranchAccessModal({
  branch,
  passwordValue,
  setPasswordValue,
  errorMessage,
  onClose,
  onConfirm,
}: {
  branch: Branch;
  passwordValue: string;
  setPasswordValue: Dispatch<SetStateAction<string>>;
  errorMessage: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <AccessDialog
      eyebrow="Accès sécurisé"
      title={branch.nom}
      description="Entrez le mot de passe pour accéder à cette succursale."
      fieldLabel="Mot de passe"
      accent="rust"
      passwordValue={passwordValue}
      setPasswordValue={setPasswordValue}
      errorMessage={errorMessage}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

function BranchSelectionView({
  branches,
  onSelect,
  ownerAccess,
  onOwnerLogin,
  onOwnerLogout,
}: {
  branches: Branch[];
  onSelect: (id: string) => void;
  ownerAccess: boolean;
  onOwnerLogin: () => void;
  onOwnerLogout: () => void;
}) {
  const phone = useIsPhone();
  if (phone) {
    return (
      <BranchSelectionPhone
        branches={branches}
        onSelect={onSelect}
        ownerAccess={ownerAccess}
        onOwnerLogin={onOwnerLogin}
        onOwnerLogout={onOwnerLogout}
      />
    );
  }
  return (
    <div className="branch-page min-h-screen w-full px-6 py-8 text-[#16181A]">
      <div className="w-full">
        <div className="branch-hero mb-8 flex flex-col gap-4 border-2 border-[#16181A] bg-[#FBFAF6] p-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-[#4B5560]">Plateforme de gestion</div>
            <h1 className="mt-3 font-serif text-4xl leading-tight md:text-5xl">Choisir une succursale</h1>
            <p className="mt-2 max-w-2xl text-sm text-[#4B5560]">
              Sélectionnez le point de vente Tchiley pour ouvrir la caisse, gérer le stock et suivre les ventes.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={ownerAccess ? onOwnerLogout : onOwnerLogin}
              className={
                'border-2 px-3 py-2 text-[11px] uppercase tracking-[0.18em] ' +
                (ownerAccess
                  ? 'border-[#2F6B4F] bg-[#E9F5EF] text-[#2F6B4F]'
                  : 'border-[#16181A] bg-[#16181A] text-[#FBFAF6] hover:bg-[#2b2e31]')
              }
            >
              {ownerAccess ? 'Propriétaire actif' : 'Accès propriétaire'}
            </button>

            <div className="branch-stat border-2 border-[#16181A] bg-[#16181A] px-4 py-3 text-left text-[#FBFAF6] shadow-[6px_6px_0_#C1440E]">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#c7ccd1]">Actifs</div>
              <div className="mt-1 font-serif text-2xl leading-none">{branches.length}</div>
              <div className="mt-1 text-[12px] text-[#dfe2e5]">succursales</div>
            </div>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {branches.map((branch) => (
            <button
              key={branch.id}
              onClick={() => onSelect(branch.id)}
              className="branch-card group flex h-full flex-col border-2 border-[#16181A] bg-[#FBFAF6] p-5 text-left shadow-[8px_8px_0_#16181A] transition-all duration-200 hover:-translate-y-1 hover:shadow-[10px_10px_0_#C1440E]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="font-serif text-2xl leading-tight text-[#16181A]">{branch.nom}</div>
                <span
                  className={
                    'branch-badge border-2 px-2 py-0.5 text-[10px] uppercase tracking-wide ' +
                    (branch.statut === 'Ouvert'
                      ? 'border-[#2F6B4F] bg-[#E9F5EF] text-[#2F6B4F]'
                      : 'border-[#4B5560] bg-[#F3F4F6] text-[#4B5560]')
                  }
                >
                  {branch.statut}
                </span>
              </div>

              <div className="mt-4 space-y-1 border-l-2 border-[#16181A] pl-3 text-[13px] text-[#4B5560]">
                <div className="font-medium text-[#16181A]">{branch.ville}</div>
                <div>{branch.adresse}</div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 text-[12px]">
                <div className="branch-metric border-2 border-[#16181A] bg-[#ECE7DC] p-3">
                  <div className="text-[#4B5560]">Ventes</div>
                  <div className="mt-1 font-serif text-2xl">{branch.ventesDuJour}</div>
                </div>
                <div className="branch-metric border-2 border-[#16181A] bg-[#ECE7DC] p-3">
                  <div className="text-[#4B5560]">Alertes</div>
                  <div className="mt-1 font-serif text-2xl">{branch.alertesStock}</div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between text-[12px] uppercase tracking-wide text-[#4B5560]">
                <span>Gestionnaire</span>
                <span className="font-medium text-[#16181A]">{branch.gestionnaire}</span>
              </div>

              <div className="mt-5 flex items-center justify-between border-t-2 border-[#16181A] pt-3 text-[13px] font-medium">
                <span>Ouvrir</span>
                <span className="group-hover:translate-x-1 transition-transform duration-200">→</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Phone entrance (< sm): Material 3 Expressive.
   Rendered instead of the desktop layout so none of the hard-bordered `branch-*` styles leak onto the phone. */
function BranchSelectionPhone({
  branches,
  onSelect,
  ownerAccess,
  onOwnerLogin,
  onOwnerLogout,
}: {
  branches: Branch[];
  onSelect: (id: string) => void;
  ownerAccess: boolean;
  onOwnerLogin: () => void;
  onOwnerLogout: () => void;
}) {
  return (
    <div
      style={M3_VARS}
      className="min-h-screen w-full bg-[var(--m3-surface)] px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-[var(--m3-on-surface)]"
    >
      <header className="m3-in mb-6">
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-14 w-14 -rotate-6 items-center justify-center rounded-[20px] bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]">
            <Store size={26} />
          </span>
          <button
            onClick={ownerAccess ? onOwnerLogout : onOwnerLogin}
            aria-pressed={ownerAccess}
            className={
              `group relative flex h-10 items-center gap-2 overflow-hidden rounded-full px-4 text-sm font-semibold m3-press motion-reduce:transition-none ${M3_FOCUS} ` +
              (ownerAccess
                ? 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]'
                : 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]')
            }
          >
            <M3StateLayer />
            {ownerAccess ? <Check size={18} /> : <KeyRound size={18} />}
            {ownerAccess ? 'Propriétaire actif' : 'Accès propriétaire'}
          </button>
        </div>

        <div className="mt-6 text-sm font-medium text-[var(--m3-on-surface-variant)]">Plateforme de gestion</div>
        <h1 className="mt-1 text-[32px] font-bold leading-10">Choisir une succursale</h1>
        <p className="mt-2 text-sm leading-5 text-[var(--m3-on-surface-variant)]">
          Sélectionnez le point de vente Tchiley pour ouvrir la caisse, gérer le stock et suivre les ventes.
        </p>

        <div className="mt-4 inline-flex items-baseline gap-2 rounded-full bg-[var(--m3-tertiary-container)] px-4 py-2 text-[var(--m3-on-tertiary-container)]">
          <span className="text-xl font-bold tabular-nums">{branches.length}</span>
          <span className="text-sm font-medium">succursales actives</span>
        </div>
      </header>

      <div className="grid gap-3">
        {branches.map((branch, index) => {
          const open = branch.statut === 'Ouvert';
          const alerts = branch.alertesStock > 0;
          return (
            <button
              key={branch.id}
              onClick={() => onSelect(branch.id)}
              style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'both' }}
              className={`m3-in m3-press-card group relative flex w-full flex-col overflow-hidden rounded-[28px] bg-[var(--m3-surface-container-low)] p-5 text-left ${M3_FOCUS}`}
            >
              <M3StateLayer />
              <div className="flex items-start justify-between gap-3">
                <div className="text-xl font-bold leading-7">{branch.nom}</div>
                <span
                  className={
                    'shrink-0 rounded-full px-3 py-1 text-xs font-semibold ' +
                    (open
                      ? `${M3_STATUS.ok.bg} ${M3_STATUS.ok.fg}`
                      : 'bg-[var(--m3-surface-container-highest)] text-[var(--m3-on-surface-variant)]')
                  }
                >
                  {branch.statut}
                </span>
              </div>

              <div className="mt-3 flex items-start gap-2 text-sm text-[var(--m3-on-surface-variant)]">
                <MapPin size={16} className="mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold text-[var(--m3-on-surface)]">{branch.ville}</div>
                  <div>{branch.adresse}</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-[20px] bg-[var(--m3-secondary-container)] px-4 py-3 text-[var(--m3-on-secondary-container)]">
                  <div className="text-xs font-medium">Ventes</div>
                  <div className="mt-0.5 text-2xl font-bold tabular-nums">{branch.ventesDuJour}</div>
                </div>
                <div
                  className={
                    'rounded-[20px] px-4 py-3 ' +
                    (alerts
                      ? `${M3_STATUS.low.bg} ${M3_STATUS.low.fg}`
                      : 'bg-[var(--m3-surface-container-highest)] text-[var(--m3-on-surface)]')
                  }
                >
                  <div className="flex items-center gap-1 text-xs font-medium">
                    {alerts && <AlertTriangle size={12} />}
                    Alertes
                  </div>
                  <div className="mt-0.5 text-2xl font-bold tabular-nums">{branch.alertesStock}</div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2 text-sm text-[var(--m3-on-surface-variant)]">
                  <UserRound size={16} className="shrink-0" />
                  <span className="truncate font-medium text-[var(--m3-on-surface)]">{branch.gestionnaire}</span>
                </div>
                <span className="flex h-10 shrink-0 items-center gap-1 rounded-full bg-[var(--m3-primary)] pl-4 pr-3 text-sm font-semibold text-[var(--m3-on-primary)]">
                  Ouvrir
                  <ChevronRight size={18} />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VenteView({
  isReadOnly,
  categorie,
  setCategorie,
  categories,
  recherche,
  setRecherche,
  produits,
  basculerProduit,
  lignesPanier,
  changerQte,
  retirerDuPanier,
  viderPanier,
  totalPanier,
  ouvrirCheckout,
}: VenteViewProps) {
  return (
    <div className="flex flex-1 overflow-hidden">
      <section className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b-2 border-[#16181A] bg-[#FBFAF6] px-6 py-4">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4B5560]"
            />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher un article…"
              className="w-full border-2 border-[#16181A] bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#C1440E]"
            />
          </div>
          <div className="ml-auto text-sm text-[#4B5560]">
            {produits.length} article{produits.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto border-b-2 border-[#16181A] bg-[#FBFAF6] px-6 py-3">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategorie(c)}
              className={
                'shrink-0 border-2 px-3 py-1.5 text-[13px] whitespace-nowrap ' +
                (categorie === c
                  ? 'border-[#16181A] bg-[#16181A] text-white'
                  : 'border-[#16181A] bg-white text-[#16181A] hover:bg-[#ECE7DC]')
              }
            >
              {c}
            </button>
          ))}
        </div>

        <div className="grid flex-1 auto-rows-max grid-cols-2 gap-2 overflow-y-auto p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {produits.map((p) => {
            const stockBas = p.stockFermeture <= p.seuil;
            const epuise = p.stockFermeture <= 0;
            const selectionne = lignesPanier.some((l) => l.id === p.id);
            return (
              <button
                key={p.id}
                disabled={epuise || isReadOnly}
                onClick={() => basculerProduit(p)}
                aria-pressed={selectionne}
                className={
                  'relative flex aspect-square min-w-0 flex-col border-2 p-2 text-left transition-colors ' +
                  (epuise || isReadOnly
                    ? 'cursor-not-allowed opacity-40 border-[#16181A] bg-[#FBFAF6]'
                    : selectionne
                      ? 'border-[#C1440E] bg-white'
                      : 'border-[#16181A] bg-[#FBFAF6] hover:border-[#C1440E] hover:bg-white active:bg-[#ECE7DC]')
                }
              >
                {selectionne && (
                  <span className="absolute right-0 top-0 z-10 flex h-5 w-5 items-center justify-center bg-[#C1440E] text-white">
                    <Check size={13} strokeWidth={3} />
                  </span>
                )}
                <div className="min-h-0 flex-1">
                  {p.image && (
                    <div className="flex h-full w-full items-center justify-center border border-[#c7c2b4] bg-white">
                      <img src={p.image} alt={p.nom} className="max-h-full max-w-full object-contain p-1" />
                    </div>
                  )}
                </div>
                <div className="mt-1 truncate text-[9px] uppercase tracking-wide text-[#4B5560]">{p.categorie}</div>
                <div className="line-clamp-2 text-[12px] font-medium leading-tight">{p.nom}</div>
                <div className="mt-0.5 font-serif text-[14px] leading-tight">{fmtHTG(p.prix)}</div>
                <div className="mt-0.5 flex items-center gap-1 text-[10px] leading-tight">
                  <span className={stockBas ? 'text-[#C1440E]' : 'text-[#4B5560]'}>
                    {p.stockFermeture} {p.unite}{p.stockFermeture !== 1 ? 's' : ''} en stock
                  </span>
                </div>
              </button>
            );
          })}
          {produits.length === 0 && (
            <div className="col-span-full py-16 text-center text-sm text-[#4B5560]">
              Aucun article ne correspond à la recherche.
            </div>
          )}
        </div>
      </section>

      <aside className="flex w-[340px] shrink-0 flex-col border-l-2 border-[#16181A] bg-[#FBFAF6]">
        <div className="flex items-center justify-between border-b-2 border-[#16181A] px-5 py-4">
          <div className="flex items-center gap-2">
            <ShoppingCart size={17} />
            <span className="text-[15px] font-medium">Vente en cours</span>
          </div>
          {lignesPanier.length > 0 && (
            <button onClick={viderPanier} className="text-[12px] text-[#4B5560] hover:text-[#C1440E]">
              Vider
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {lignesPanier.length === 0 ? (
            <div className="mt-10 text-center text-sm text-[#4B5560]">
              Le panier est vide.<br />Touchez un article pour le sélectionner.
            </div>
          ) : (
            lignesPanier.map((l) => (
              <div key={l.id} className="mb-3 border-2 border-[#16181A] bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[13px] font-medium leading-snug">{l.produit.nom}</div>
                  <button onClick={() => retirerDuPanier(l.id)} disabled={isReadOnly} className="shrink-0 text-[#4B5560] hover:text-[#C1440E] disabled:opacity-50">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center border-2 border-[#16181A]">
                    <button onClick={() => changerQte(l.id, -1)} disabled={isReadOnly} className="px-2 py-1 hover:bg-[#ECE7DC] disabled:opacity-50">
                      <Minus size={13} />
                    </button>
                    <span className="min-w-[2rem] px-1 text-center text-[13px]">{l.qte}</span>
                    <button onClick={() => changerQte(l.id, 1)} disabled={isReadOnly} className="px-2 py-1 hover:bg-[#ECE7DC] disabled:opacity-50">
                      <Plus size={13} />
                    </button>
                  </div>
                  <div className="text-[14px] font-serif">{fmtHTG(l.sousTotal)}</div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t-2 border-[#16181A] px-5 py-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] text-[#4B5560]">Total</span>
            <span className="font-serif text-2xl">{fmtHTG(totalPanier)}</span>
          </div>
          <button
            disabled={lignesPanier.length === 0 || isReadOnly}
            onClick={ouvrirCheckout}
            className={
              'mt-3 flex w-full items-center justify-center gap-2 border-2 border-[#16181A] py-3 text-[14px] font-medium ' +
              (lignesPanier.length === 0 || isReadOnly
                ? 'cursor-not-allowed bg-[#d8d3c6] text-[#8b8f87]'
                : 'bg-[#C1440E] text-white hover:bg-[#a83a0c]')
            }
          >
            {isReadOnly ? 'Mode lecture seule' : 'Encaisser'}
            {!isReadOnly && <ChevronRight size={16} />}
          </button>
        </div>
      </aside>
    </div>
  );
}

/* Passerelle MonCash : les fonctions Edge Supabase (moncash-create-deposit, moncash-status, moncash-webhook)
   créent le paiement et suivent son statut. Le client règle sur son téléphone (QR / WhatsApp) ou sur ce terminal. */

/* Liaison téléphone (Supabase Realtime) : le téléphone garde la page /terminal ouverte.
   Le POS lui envoie le lien MonCash par un canal Broadcast privé (nom = code de jumelage),
   et la page /terminal redirige le navigateur du téléphone vers MonCash.
   Aucune table SQL : uniquement Realtime Broadcast + Presence. */
const SB_URL: string = String((import.meta as any).env?.VITE_SUPABASE_URL ?? '');
const SB_KEY: string = String((import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ?? '');
const PHONE_ENABLED = SB_URL !== '' && SB_KEY !== '';
// Optionnel : domaines autorisés pour la redirection (ex. "moncashbutton.digicelgroup.com"). Vide = tout https.
const PHONE_ALLOWED_HOSTS: string[] = String((import.meta as any).env?.VITE_PHONE_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

let sbClient: SupabaseClient | null = null;
function getSb(): SupabaseClient | null {
  if (!PHONE_ENABLED) return null;
  if (!sbClient) sbClient = createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return sbClient;
}

const PAIR_KEY = 'phonePairCode';
const PAIR_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans I, L, O, 0, 1
const codeValide = (c: string) => /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{10}$/.test(c);
function nouveauCode(): string {
  const b = new Uint32Array(10);
  crypto.getRandomValues(b);
  return Array.from(b, (n) => PAIR_ALPHABET[n % PAIR_ALPHABET.length]).join('');
}
function lireCode(): string {
  try {
    const c = localStorage.getItem(PAIR_KEY) ?? '';
    return codeValide(c) ? c : '';
  } catch {
    return '';
  }
}
function ecrireCode(c: string) {
  try {
    if (c) localStorage.setItem(PAIR_KEY, c);
    else localStorage.removeItem(PAIR_KEY);
  } catch {
    /* stockage indisponible */
  }
}
const canalPour = (code: string) => `moncash-pos:${code}`;
const hoteAutorise = (h: string) =>
  PHONE_ALLOWED_HOSTS.length === 0 || PHONE_ALLOWED_HOSTS.some((a) => h === a || h.endsWith('.' + a));

type TelEtat = 'unknown' | 'ready' | 'nodevice' | 'offline' | 'nopair';

/* Côté POS : rejoint le canal du code, suit la présence du téléphone et envoie les liens. */
function usePhoneLink(code: string) {
  const [tel, setTel] = useState<TelEtat>(code ? 'unknown' : 'nopair');
  const chRef = useRef<RealtimeChannel | null>(null);
  const attente = useRef(new Map<string, () => void>());

  useEffect(() => {
    const sb = getSb();
    if (!code) {
      setTel('nopair');
      return;
    }
    if (!sb) {
      setTel('offline');
      return;
    }
    let dead = false;
    setTel('unknown');
    const ch = sb.channel(canalPour(code), { config: { broadcast: { self: false } } });
    const refresh = () => {
      const tous = Object.values(ch.presenceState() as Record<string, any[]>).flat();
      setTel(tous.some((p) => p?.role === 'phone') ? 'ready' : 'nodevice');
    };
    ch.on('presence', { event: 'sync' }, refresh)
      .on('broadcast', { event: 'ack' }, ({ payload }) => attente.current.get(String(payload?.id))?.())
      .subscribe(async (status) => {
        if (dead) return;
        if (status === 'SUBSCRIBED') {
          await ch.track({ role: 'pos' });
          refresh();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setTel('offline');
        }
      });
    chRef.current = ch;
    return () => {
      dead = true;
      chRef.current = null;
      void sb.removeChannel(ch);
    };
  }, [code]);

  // Envoie le lien et attend l'accusé de réception du téléphone (5 s max).
  async function ouvrir(url: string): Promise<void> {
    const ch = chRef.current;
    if (!ch) throw new Error('Aucun téléphone jumelé.');
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    let timer = 0;
    const recu = new Promise<void>((resolve, reject) => {
      timer = window.setTimeout(
        () => reject(new Error("Le téléphone n'a pas répondu. La page /terminal est-elle ouverte et l'écran allumé ?")),
        5000
      );
      attente.current.set(id, resolve);
    });
    try {
      const r = await ch.send({ type: 'broadcast', event: 'open', payload: { id, url } });
      if (r !== 'ok') throw new Error('Envoi impossible (réseau).');
      await recu;
    } finally {
      window.clearTimeout(timer);
      attente.current.delete(id);
    }
  }

  return { tel, ouvrir };
}

type MonCashEtat = 'idle' | 'creating' | 'waiting' | 'failed' | 'expired';

function MonCashPanel({
  montant,
  onPaid,
  onLock,
}: {
  montant: number;
  onPaid: (transactionId: string) => void;
  onLock: (locked: boolean) => void;
}) {
  const [etat, setEtat] = useState<MonCashEtat>('idle');
  const [lien, setLien] = useState('');
  const [orderId, setOrderId] = useState('');
  const [erreur, setErreur] = useState('');
  const [copie, setCopie] = useState(false);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const [code, setCode] = useState<string>(lireCode);
  const [showPair, setShowPair] = useState(false);
  const { tel, ouvrir } = usePhoneLink(code);
  const [telMsg, setTelMsg] = useState('');
  const [autoTel, setAutoTel] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mcAutoPhone') !== '0';
    } catch {
      return true;
    }
  });

  function genererCode() {
    const c = nouveauCode();
    ecrireCode(c);
    setCode(c);
    setShowPair(true);
  }

  async function ouvrirSurTelephone(u: string) {
    setTelMsg('');
    try {
      await ouvrir(u);
      setTelMsg('Lien ouvert sur le téléphone.');
    } catch (e) {
      setTelMsg(e instanceof Error ? e.message : "Impossible d'ouvrir le lien sur le téléphone.");
    }
  }

  function basculerAutoTel(v: boolean) {
    setAutoTel(v);
    try {
      localStorage.setItem('mcAutoPhone', v ? '1' : '0');
    } catch {
      /* stockage indisponible */
    }
  }

  async function creer() {
    setEtat('creating');
    setErreur('');
    try {
      const sb = getSb();
      if (!sb) throw new Error('Supabase non configuré (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).');

      const { data, error } = await sb.functions.invoke('moncash-create-deposit', {
        body: { amount: Math.round(montant) },
      });
      if (error || !data?.paymentUrl) {
        let detail = '';
        try {
          const body = await (error as any)?.context?.json?.();
          detail = body?.error ? String(body.error) : '';
        } catch {
          /* corps illisible */
        }
        throw new Error(detail || (error as Error | null)?.message || 'Impossible de créer le paiement MonCash.');
      }

      const id = String(data.referenceId ?? 'TCH-' + Date.now());
      setOrderId(id);
      setLien(data.paymentUrl);
      setEtat('waiting');
      onLock(true);
      if (autoTel && tel === 'ready') void ouvrirSurTelephone(data.paymentUrl);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur réseau.');
      setEtat('failed');
    }
  }

  function annuler() {
    onLock(false);
    setLien('');
    setOrderId('');
    setEtat('idle');
  }

  // Vérifie le statut toutes les 3 s tant que le client n'a pas payé.
  useEffect(() => {
    if (etat !== 'waiting' || !orderId) return;
    let stop = false;
    const tick = async () => {
      try {
        const sb = getSb();
        if (!sb) return;
        const { data: d, error: e } = await sb.functions.invoke('moncash-status', { body: { referenceId: orderId } });
        if (stop || e || !d) return;
        if (d.status === 'paid') {
          stop = true;
          onLock(false);
          onPaidRef.current(String(d.transactionId ?? ''));
        } else if (d.status === 'expired' || d.status === 'failed') {
          stop = true;
          onLock(false);
          setErreur(d.status === 'expired' ? 'Le lien a expiré.' : 'Le paiement a échoué.');
          setEtat(d.status);
        }
      } catch {
        /* réseau instable : on réessaie au prochain cycle */
      }
    };
    const t = window.setInterval(tick, 3000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [etat, orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const message = `Paiement MonCash de ${fmtHTG(montant)} — Tchiley Construction : ${lien}`;

  return (
    <div className="px-5 pb-4">
      {(etat === 'idle' || etat === 'failed' || etat === 'expired') && (
        <>
          <div className="mb-2 text-[12px] text-[#4B5560]">
            Un lien de paiement MonCash sera généré. Le client le règle sur son téléphone ou sur ce terminal.
          </div>
          <div className="mb-2 flex items-center justify-between gap-2 border-2 border-[#16181A] bg-white px-3 py-2 text-[12px]">
            <span className={tel === 'ready' ? 'text-[#16181A]' : 'text-[#4B5560]'}>
              {tel === 'ready' && 'Téléphone connecté'}
              {tel === 'nodevice' && 'Téléphone absent (ouvrez /terminal dessus)'}
              {tel === 'offline' && (PHONE_ENABLED ? 'Liaison téléphone injoignable' : 'Supabase non configuré')}
              {tel === 'nopair' && 'Aucun téléphone jumelé'}
              {tel === 'unknown' && 'Recherche du téléphone…'}
            </span>
            {PHONE_ENABLED && (
              <button type="button" onClick={() => setShowPair((v) => !v)} className="underline hover:text-[#C1440E]">
                Jumeler
              </button>
            )}
          </div>
          {PHONE_ENABLED && (showPair || !code) && (
            <div className="mb-2 border-2 border-[#16181A] bg-white p-3 text-[12px] text-[#4B5560]">
              {code ? (
                <div className="flex items-start gap-3">
                  <div className="shrink-0 border-2 border-[#16181A] bg-white p-1.5">
                    <QRCodeSVG value={`${window.location.origin}/terminal?code=${code}`} size={96} />
                  </div>
                  <div className="min-w-0 flex-1">
                    Sur le téléphone, scannez ce code : il ouvre la page terminal et se jumelle tout seul.
                    <div className="mt-1 font-mono text-[13px] font-medium text-[#16181A]">{code}</div>
                    <button type="button" onClick={genererCode} className="mt-1 underline hover:text-[#C1440E]">
                      Nouveau code
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={genererCode}
                  className="w-full border-2 border-[#16181A] bg-white py-2 text-[12px] text-[#16181A] hover:bg-[#ECE7DC]"
                >
                  Générer un code de jumelage
                </button>
              )}
            </div>
          )}
          <label className="mb-2 flex items-center gap-2 text-[12px] text-[#4B5560]">
            <input type="checkbox" checked={autoTel} onChange={(e) => basculerAutoTel(e.target.checked)} />
            Ouvrir automatiquement sur le téléphone
          </label>
          {erreur && <div className="mb-2 border-2 border-[#C1440E] px-3 py-2 text-[12px] text-[#C1440E]">{erreur}</div>}
          <button
            type="button"
            onClick={creer}
            className="flex w-full items-center justify-center gap-2 border-2 border-[#16181A] bg-[#16181A] py-2.5 text-[13px] font-medium text-white hover:bg-[#2b2f33]"
          >
            <Smartphone size={15} />
            {etat === 'idle' ? 'Générer le lien MonCash' : 'Générer un nouveau lien'}
          </button>
        </>
      )}

      {etat === 'creating' && (
        <div className="flex items-center justify-center gap-2 py-4 text-[13px] text-[#4B5560]">
          <Loader2 size={15} className="animate-spin" /> Création du paiement…
        </div>
      )}

      {etat === 'waiting' && (
        <div className="border-2 border-[#16181A] bg-white p-3">
          <div className="flex items-start gap-3">
            <div className="shrink-0 border-2 border-[#16181A] bg-white p-1.5">
              <QRCodeSVG value={lien} size={112} />
            </div>
            <div className="min-w-0 flex-1 text-[12px] text-[#4B5560]">
              Le client scanne le code avec son téléphone, ou ouvrez le lien sur ce terminal.
              <div className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-[#16181A]">
                <Loader2 size={13} className="animate-spin" /> En attente du paiement…
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => window.open(lien, '_blank', 'noopener')}
              className="flex items-center justify-center gap-1 border-2 border-[#16181A] bg-white py-2 text-[11px] hover:bg-[#ECE7DC]"
            >
              <ExternalLink size={13} /> Ce terminal
            </button>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(lien).then(() => {
                  setCopie(true);
                  window.setTimeout(() => setCopie(false), 1500);
                });
              }}
              className="flex items-center justify-center gap-1 border-2 border-[#16181A] bg-white py-2 text-[11px] hover:bg-[#ECE7DC]"
            >
              {copie ? <Check size={13} /> : <Copy size={13} />} {copie ? 'Copié' : 'Copier'}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 border-2 border-[#16181A] bg-white py-2 text-[11px] hover:bg-[#ECE7DC]"
            >
              WhatsApp
            </a>
          </div>
          <button
            type="button"
            onClick={() => ouvrirSurTelephone(lien)}
            className="mt-2 flex w-full items-center justify-center gap-1 border-2 border-[#16181A] bg-white py-2 text-[11px] hover:bg-[#ECE7DC]"
          >
            <Smartphone size={13} /> Ouvrir sur le téléphone
          </button>
          {telMsg && <div className="mt-1 text-[11px] text-[#4B5560]">{telMsg}</div>}
          <button
            type="button"
            onClick={annuler}
            className="mt-2 w-full py-1 text-[11px] text-[#4B5560] underline hover:text-[#C1440E]"
          >
            Annuler ce paiement
          </button>
        </div>
      )}
    </div>
  );
}

function CheckoutModal({ lignesPanier, totalPanier, fermer, finaliserVente, clientsConnus = [] }: CheckoutModalProps) {
  const [paiement, setPaiement] = useState<PaymentMethodId>('especes');
  const [montantRecu, setMontantRecu] = useState<string>('');
  const [client, setClient] = useState<string>('');
  const [remiseInput, setRemiseInput] = useState<string>('');
  const [remiseMode, setRemiseMode] = useState<'htg' | 'pct'>('htg');
  const [mcLocked, setMcLocked] = useState(false);

  const remiseSaisie = parseFloat(remiseInput) || 0;
  const remiseBrute = remiseMode === 'pct' ? (totalPanier * Math.min(remiseSaisie, 100)) / 100 : remiseSaisie;
  const remise = Math.round(Math.min(Math.max(remiseBrute, 0), totalPanier));
  const totalAPayer = totalPanier - remise;

  const recu = montantRecu === '' ? totalAPayer : parseFloat(montantRecu) || 0;
  const monnaie = paiement === 'especes' ? Math.max(recu - totalAPayer, 0) : 0;
  const insuffisant = paiement === 'especes' && recu < totalAPayer;
  const clientManquant = paiement === 'credit' && client.trim() === '';
  // Avec la passerelle configurée, la vente se confirme toute seule dès que MonCash valide le paiement.
  const mcAuto = paiement === 'moncash' && PHONE_ENABLED;
  const bloque = insuffisant || clientManquant || mcAuto;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-md flex-col border-2 border-[#16181A] bg-[#FBFAF6]">
        <div className="flex items-center justify-between border-b-2 border-[#16181A] px-5 py-4">
          <span className="text-[15px] font-medium">Encaissement</span>
          <button onClick={fermer} className="text-[#4B5560] hover:text-[#C1440E]">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-48 overflow-y-auto border-b-2 border-[#16181A] px-5 py-3">
          {lignesPanier.map((l) => (
            <div key={l.id} className="flex justify-between py-1 text-[13px]">
              <span>{l.qte} × {l.produit.nom}</span>
              <span>{fmtHTG(l.sousTotal)}</span>
            </div>
          ))}
        </div>

        <div className="border-b-2 border-[#16181A] px-5 py-3">
          <div className="mb-1 flex items-center justify-between">
            <label className="text-[12px] text-[#4B5560]">Remise (optionnel)</label>
            <div className="flex">
              {(['htg', 'pct'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setRemiseMode(mode)}
                  disabled={mcLocked}
                  className={
                    'border-2 border-[#16181A] px-2.5 py-0.5 text-[11px] font-medium disabled:opacity-50 ' +
                    (mode === 'pct' ? '-ml-0.5 ' : '') +
                    (remiseMode === mode ? 'bg-[#16181A] text-white' : 'bg-white hover:bg-[#ECE7DC]')
                  }
                >
                  {mode === 'htg' ? 'HTG' : '%'}
                </button>
              ))}
            </div>
          </div>
          <input
            type="number"
            min="0"
            value={remiseInput}
            onChange={(e) => setRemiseInput(e.target.value)}
            disabled={mcLocked}
            placeholder={remiseMode === 'pct' ? '0 %' : '0 HTG'}
            className="w-full border-2 border-[#16181A] bg-white px-3 py-2 text-sm outline-none focus:border-[#C1440E]"
          />
          {remise > 0 && (
            <div className="mt-2 space-y-0.5 text-[13px]">
              <div className="flex justify-between">
                <span className="text-[#4B5560]">Sous-total</span>
                <span>{fmtHTG(totalPanier)}</span>
              </div>
              <div className="flex justify-between text-[#C1440E]">
                <span>Remise</span>
                <span>- {fmtHTG(remise)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-baseline justify-between px-5 py-4">
          <span className="text-[13px] text-[#4B5560]">Total à payer</span>
          <span className="font-serif text-2xl">{fmtHTG(totalAPayer)}</span>
        </div>

        <div className="px-5 pb-4">
          <div className="mb-2 text-[12px] text-[#4B5560]">Mode de paiement</div>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_METHODS.map((m) => {
              const Icon = m.icon;
              const actif = paiement === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setPaiement(m.id)}
                  disabled={mcLocked}
                  className={
                    'flex items-center gap-2 border-2 px-3 py-2 text-[13px] disabled:opacity-50 ' +
                    (actif
                      ? 'border-[#16181A] bg-[#16181A] text-white'
                      : 'border-[#16181A] bg-white hover:bg-[#ECE7DC]')
                  }
                >
                  <Icon size={15} />
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {paiement === 'especes' && (
          <div className="px-5 pb-4">
            <label className="mb-1 block text-[12px] text-[#4B5560]">Montant reçu (HTG)</label>
            <input
              type="number"
              value={montantRecu}
              onChange={(e) => setMontantRecu(e.target.value)}
              placeholder={String(Math.round(totalAPayer))}
              className="w-full border-2 border-[#16181A] bg-white px-3 py-2 text-sm outline-none focus:border-[#C1440E]"
            />
            <div className="mt-2 flex justify-between text-[13px]">
              <span className="text-[#4B5560]">Monnaie à remettre</span>
              <span className={insuffisant ? 'text-[#C1440E]' : 'text-[#2F6B4F]'}>
                {insuffisant ? 'Montant insuffisant' : fmtHTG(monnaie)}
              </span>
            </div>
          </div>
        )}

        {mcAuto && (
          <MonCashPanel
            key={totalAPayer}
            montant={totalAPayer}
            onLock={setMcLocked}
            onPaid={(transactionId) => finaliserVente('moncash', totalAPayer, remise, client, transactionId)}
          />
        )}

        {paiement === 'credit' && (
          <div className="px-5 pb-4">
            <label className="mb-1 block text-[12px] text-[#4B5560]">Nom du client (obligatoire)</label>
            <input
              type="text"
              list="clients-credit"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="Ex: Jean Baptiste"
              className="w-full border-2 border-[#16181A] bg-white px-3 py-2 text-sm outline-none focus:border-[#C1440E]"
            />
            <datalist id="clients-credit">
              {clientsConnus.map((nom) => (
                <option key={nom} value={nom} />
              ))}
            </datalist>
            <div className="mt-2 text-[12px] text-[#4B5560]">
              Le client devra {fmtHTG(totalAPayer)}. Le paiement sera enregistré plus tard dans l'onglet Crédits.
            </div>
          </div>
        )}

        <div className="flex gap-2 border-t-2 border-[#16181A] px-5 py-4">
          <button
            onClick={fermer}
            className="flex-1 border-2 border-[#16181A] bg-white py-2.5 text-[14px] hover:bg-[#ECE7DC]"
          >
            Annuler
          </button>
          <button
            disabled={bloque}
            onClick={() =>
              finaliserVente(
                paiement,
                paiement === 'especes' ? recu : paiement === 'credit' ? 0 : totalAPayer,
                remise,
                client
              )
            }
            className={
              'flex flex-1 items-center justify-center gap-2 border-2 border-[#16181A] py-2.5 text-[14px] font-medium ' +
              (bloque
                ? 'cursor-not-allowed bg-[#d8d3c6] text-[#8b8f87]'
                : 'bg-[#2F6B4F] text-white hover:bg-[#255a40]')
            }
          >
            <Printer size={15} />
            {mcAuto ? 'Confirmation automatique' : 'Confirmer & Imprimer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DashboardView({
  totalAujourdhui,
  nbVentesAujourdhui,
  produitsStockBas,
  meilleuresVentes,
}: {
  totalAujourdhui: number;
  nbVentesAujourdhui: number;
  produitsStockBas: Product[];
  meilleuresVentes: [string, number][];
}) {
  return (
    <FeatureDashboardView
      totalAujourdhui={totalAujourdhui}
      nbVentesAujourdhui={nbVentesAujourdhui}
      produitsStockBas={produitsStockBas}
      meilleuresVentes={meilleuresVentes}
      themeVars={M3_VARS}
      lowStockTone={M3_STATUS.low}
      outOfStockTone={M3_STATUS.out}
      formatCurrency={fmtHTG}
    />
  );
}

/* =========================================================================
   /terminal — page à laisser ouverte sur le téléphone du comptoir.
   Reçoit le lien MonCash du POS (Supabase Realtime) et y redirige le navigateur.
   ========================================================================= */
function TerminalPage() {
  const [code, setCode] = useState<string>(() => {
    try {
      const p = (new URLSearchParams(window.location.search).get('code') ?? '').trim().toUpperCase();
      if (codeValide(p)) {
        ecrireCode(p);
        window.history.replaceState({}, '', '/terminal');
        return p;
      }
    } catch {
      /* URL illisible */
    }
    return lireCode();
  });
  const [saisie, setSaisie] = useState('');
  const [conn, setConn] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [caisse, setCaisse] = useState(false);
  const [recu, setRecu] = useState<{ host: string; href: string } | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const connRef = useRef(conn);
  connRef.current = conn;

  // Manifest PWA + titre.
  useEffect(() => {
    const l = document.createElement('link');
    l.rel = 'manifest';
    l.href = '/terminal.webmanifest';
    document.head.appendChild(l);
    const t = document.title;
    document.title = 'Terminal MonCash';
    return () => {
      l.remove();
      document.title = t;
    };
  }, []);

  // Garde l'écran allumé (sinon le navigateur suspend la connexion).
  useEffect(() => {
    let lock: any = null;
    const prendre = async () => {
      try {
        lock = await (navigator as any).wakeLock?.request('screen');
      } catch {
        /* non supporté ou refusé */
      }
    };
    void prendre();
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      void prendre();
      if (connRef.current === 'offline') window.location.reload();
    };
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload(); // retour depuis MonCash (cache avant/arrière)
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', onShow);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pageshow', onShow);
      void lock?.release?.();
    };
  }, []);

  // Canal du code de jumelage.
  useEffect(() => {
    const sb = getSb();
    if (!sb || !code) return;
    let dead = false;
    setConn('connecting');
    const ch = sb.channel(canalPour(code), { config: { broadcast: { self: false } } });
    ch.on('presence', { event: 'sync' }, () => {
      const tous = Object.values(ch.presenceState() as Record<string, any[]>).flat();
      setCaisse(tous.some((p) => p?.role === 'pos'));
    })
      .on('broadcast', { event: 'open' }, ({ payload }) => {
        let u: URL;
        try {
          u = new URL(String(payload?.url));
        } catch {
          return;
        }
        if (u.protocol !== 'https:' || u.username || u.password || !hoteAutorise(u.hostname.toLowerCase())) return;
        void ch.send({ type: 'broadcast', event: 'ack', payload: { id: payload?.id } });
        setRecu({ host: u.hostname, href: u.href });
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => window.location.assign(u.href), 1500);
      })
      .subscribe(async (status) => {
        if (dead) return;
        if (status === 'SUBSCRIBED') {
          setConn('online');
          await ch.track({ role: 'phone' });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConn('offline');
        }
      });
    return () => {
      dead = true;
      window.clearTimeout(timerRef.current);
      void sb.removeChannel(ch);
    };
  }, [code]);

  function annulerOuverture() {
    window.clearTimeout(timerRef.current);
    setRecu(null);
  }

  function saisirCode() {
    const c = saisie.trim().toUpperCase();
    if (!codeValide(c)) return;
    ecrireCode(c);
    setSaisie('');
    setCode(c);
  }

  function oublierCode() {
    ecrireCode('');
    setCode('');
    setCaisse(false);
  }

  const bouton = 'border-2 border-[#FBFAF6] px-4 py-2 text-[13px] hover:bg-[#FBFAF6] hover:text-[#16181A]';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#16181A] p-6 text-center text-[#FBFAF6]">
      <Smartphone size={40} />
      <div className="text-[18px] font-medium">Terminal MonCash</div>

      {!PHONE_ENABLED && (
        <div className="max-w-xs text-[13px] text-[#F2B705]">
          Supabase n'est pas configuré (VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY).
        </div>
      )}

      {PHONE_ENABLED && !code && (
        <div className="w-full max-w-xs space-y-3">
          <div className="text-[13px] text-[#ECE7DC]">
            Scannez le code affiché sur le POS (Paiement MonCash → Jumeler), ou saisissez-le ici.
          </div>
          <input
            value={saisie}
            onChange={(e) => setSaisie(e.target.value.toUpperCase())}
            maxLength={10}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="CODE À 10 CARACTÈRES"
            className="w-full border-2 border-[#FBFAF6] bg-transparent px-3 py-2 text-center font-mono text-[14px] tracking-widest outline-none"
          />
          <button type="button" onClick={saisirCode} disabled={!codeValide(saisie.trim())} className={bouton + ' w-full disabled:opacity-40'}>
            Jumeler
          </button>
        </div>
      )}

      {PHONE_ENABLED && code && !recu && (
        <div className="space-y-1 text-[13px]">
          <div className={conn === 'online' ? 'text-[#7FC8A0]' : 'text-[#F2B705]'}>
            {conn === 'online' && 'Prêt — gardez cette page ouverte'}
            {conn === 'connecting' && 'Connexion…'}
            {conn === 'offline' && 'Connexion perdue — nouvelle tentative…'}
          </div>
          <div className="text-[#ECE7DC]">{caisse ? 'Caisse connectée' : 'Caisse non connectée'}</div>
        </div>
      )}

      {recu && (
        <div className="space-y-3">
          <div className="text-[15px]">Ouverture de MonCash…</div>
          <div className="font-mono text-[12px] text-[#ECE7DC]">{recu.host}</div>
          <button type="button" onClick={annulerOuverture} className={bouton}>
            Annuler
          </button>
        </div>
      )}

      {PHONE_ENABLED && code && !recu && (
        <button type="button" onClick={oublierCode} className="text-[11px] text-[#ECE7DC] underline">
          Changer de jumelage
        </button>
      )}
    </div>
  );
}

export default function App() {
  if (window.location.pathname.toLowerCase().replace(/\/+$/, '') === '/terminal') return <TerminalPage />;
  return (
    <>
      <style>{M3_CSS}</style>
      <GestionMateriaux />
    </>
  );
}
