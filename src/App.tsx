import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction, type TouchEvent as ReactTouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import './App.css';
import {
  ShoppingCart, Boxes, History, Gauge, AlertTriangle,
  Plus, Minus, Trash2, X, Search, Printer, ChevronRight, Banknote,
  Smartphone, FileClock, PackagePlus, Pencil, Check, Menu, BarChart3,
  Users, Loader2, CalendarDays, Eye, EyeOff, Undo2, ChevronDown,
  Vault, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Coins, Download, Paperclip, FileText, Package, Receipt, ExternalLink, Copy, Wrench, CupSoda, Wheat,
  MapPin, UserRound, Tag, TrendingUp, MoreHorizontal, LogOut, RotateCcw, KeyRound, Lock, Store, Truck, type LucideIcon
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

type Product = {
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

type ProductMovementKind = 'sale' | 'purchase' | 'restock' | 'manual';

type ProductHistoryEntry = {
  id: string;
  branchId: string;
  productId: string;
  date: Date;
  kind: ProductMovementKind;
  qty: number;
  note: string;
  amount: number;
};

type ProductMovement = ProductHistoryEntry;

type CartItem = {
  id: string;
  qte: number;
};

type CartLine = CartItem & {
  produit: Product;
  sousTotal: number;
};

type SaleLine = {
  produitId?: string;
  nom: string;
  qte: number;
  prix: number;
  sousTotal: number;
  cout?: number; // prix d'achat unitaire au moment de la vente (sert au calcul de la marge)
};

type PaymentMethodId = 'especes' | 'moncash' | 'natcash' | 'credit';

type PurchaseLine = {
  produitId: string;
  nom: string;
  unite: string;
  qte: number;
  coutUnitaire: number;
  sousTotal: number;
};

type PurchaseRecord = {
  id: string;
  branchId: string;
  date: Date;
  fournisseur: string;
  reference?: string; // N° de facture du fournisseur
  lignes: PurchaseLine[];
  total: number;
  paiement: PaymentMethodId;
  note?: string;
  statut?: 'valide' | 'annulee';
};

type CreditPayment = {
  id: string;
  date: Date;
  montant: number;
  mode: PaymentMethodId;
};

type SaleRecord = {
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
  reference?: string; // ID de transaction MonCash
};

/* Onglets de gestion (mêmes sections que le panneau propriétaire, limitées à la succursale du vendeur). */
type ManagementView = 'rapports' | 'produits' | 'ventes' | 'achats' | 'credits' | 'coffre' | 'petitecaisse';

type View = 'vente' | 'dashboard' | ManagementView;

const MANAGEMENT_VIEWS: ManagementView[] = ['rapports', 'produits', 'ventes', 'achats', 'credits', 'coffre', 'petitecaisse'];
const isManagementView = (v: View): v is ManagementView => (MANAGEMENT_VIEWS as string[]).includes(v);

type Branch = {
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

const CATEGORIES = [
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

/* Generic bottle/can silhouettes (no brand logos) used as lightweight product thumbnails. */
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

  /* Succursale Majuin — quincaillerie générale, boissons gazeuses, produits alimentaires */
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

/* Set to false to start with an empty sales history. */
const USE_MOCK_SALES = true;

const MOCK_CLIENTS: Record<string, string[]> = {
  'gros-morne': ['Jean Baptiste', 'Marie-Claire Joseph', 'Entreprise Dorival', 'Pierre Louis', 'Wilner Étienne'],
  'saint-marc': ['Fritz Desrosiers', 'Rose-Marie Charles', 'Construction Saint-Marc SA', 'Kensley Auguste', 'Mme Lucienne Paul'],
  'majuin': ['Jocelyn Pierre', 'Nadège Michel', 'Ti Jak Peinture', 'Ronald Célestin', 'Guerline Jean'],
  'oreste': ['Evens Toussaint', 'Carline Noël', 'Électricité Oreste', 'Mackenson Thomas', 'Ludy Fils-Aimé'],
};

/* Generates ~2 weeks of realistic sales for every branch, relative to today. */
const MOCK_HISTORY_DAYS = 120;

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
      // A few quiet days without any sale (never today)
      if (daysAgo > 0 && rand() < 0.12) continue;

      const salesCount = randInt(3, 7);
      for (let i = 0; i < salesCount; i++) {
        let minutesOfDay = 7 * 60 + randInt(0, 599); // between 07:00 and 16:59
        if (daysAgo === 0 && minutesOfDay > nowMinutes) minutesOfDay = randInt(0, Math.max(nowMinutes, 1));

        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 0, minutesOfDay);

        const chosen = [...branchProducts].sort(() => rand() - 0.5).slice(0, randInt(1, 3));
        const lignes: SaleLine[] = chosen.map((produit) => {
          const qte = produit.prix < 150 ? randInt(10, 60) : randInt(1, 5);
          return { produitId: produit.id, nom: produit.nom, qte, prix: produit.prix, sousTotal: qte * produit.prix, cout: produit.prixAchat };
        });
        const subtotal = lignes.reduce((sum, l) => sum + l.sousTotal, 0);
        // About 1 sale in 4 gets a 5 / 10 / 15 % discount, rounded to 5 HTG
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
            // ~30% fully paid later, ~30% partially paid, ~40% still unpaid
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
        });
      }
    }
  });

  return sales.sort((a, b) => b.date.getTime() - a.date.getTime());
}

const PAYMENT_METHODS: Array<{ id: PaymentMethodId; label: string; icon: typeof Banknote }> = [
  { id: 'especes', label: 'Espèces', icon: Banknote },
  { id: 'moncash', label: 'MonCash', icon: Smartphone },
  { id: 'natcash', label: 'NatCash', icon: Smartphone },
  { id: 'credit', label: 'Crédit Client', icon: FileClock },
];

const creditPaid = (sale: SaleRecord) => (sale.paiementsCredit ?? []).reduce((sum, p) => sum + p.montant, 0);
const creditBalance = (sale: SaleRecord) => Math.max(sale.total - creditPaid(sale), 0);

/* ---------- Cash ledger (rapports) ---------- */
type CashEntryType = 'consommation' | 'achat' | 'renflouement' | 'remboursement';

type CashEntry = {
  id: string;
  branchId: string;
  date: Date;
  type: CashEntryType;
  montant: number;
  note?: string;
};

const CASH_ENTRY_META: Record<CashEntryType, { label: string; sign: -1 | 1 }> = {
  consommation: { label: 'Consommation interne', sign: -1 },
  achat: { label: 'Achat', sign: -1 },
  renflouement: { label: 'Renflouement', sign: 1 },
  remboursement: { label: 'Remboursement', sign: 1 },
};

type ReportPeriod = 'daily' | 'monthly' | 'annual';

const REPORT_TABS: Array<{ id: ReportPeriod; label: string; short: string }> = [
  { id: 'daily', label: 'Rapport Journalier', short: 'J' },
  { id: 'monthly', label: 'Rapport Mensuel', short: 'M' },
  { id: 'annual', label: 'Rapport Annuel', short: 'A' },
];

type CashSummary = {
  brut: number;
  credits: number;
  consommations: number;
  achats: number;
  renflouements: number;
  remboursements: number; // manual entries + credit repayments received
  cashNet: number;
  mobile: number; // MonCash / NatCash received (not physical cash)
  cashEnMain: number;
  nbVentes: number;
};

/** Build the cash summary for the sales / entries that fall inside `inPeriod`. */
function summarizeCash(
  ventes: SaleRecord[],
  entries: CashEntry[],
  inPeriod: (d: Date) => boolean
): CashSummary {
  const sales = ventes.filter((v) => v.statut !== 'annulee' && inPeriod(v.date));
  const brut = sales.reduce((sum, v) => sum + v.total, 0);
  const credits = sales.filter((v) => v.paiement === 'credit').reduce((sum, v) => sum + v.total, 0);
  const mobileSales = sales
    .filter((v) => v.paiement === 'moncash' || v.paiement === 'natcash')
    .reduce((sum, v) => sum + v.total, 0);

  // Credit repayments received during the period (any credit sale, cancelled ones excluded)
  const repayments = ventes
    .filter((v) => v.statut !== 'annulee')
    .flatMap((v) => v.paiementsCredit ?? [])
    .filter((pay) => inPeriod(pay.date));
  const repaymentsTotal = repayments.reduce((sum, pay) => sum + pay.montant, 0);
  const repaymentsMobile = repayments
    .filter((pay) => pay.mode === 'moncash' || pay.mode === 'natcash')
    .reduce((sum, pay) => sum + pay.montant, 0);

  const inRange = entries.filter((e) => inPeriod(e.date));
  const sumOf = (type: CashEntryType) => inRange.filter((e) => e.type === type).reduce((sum, e) => sum + e.montant, 0);
  const consommations = sumOf('consommation');
  const achats = sumOf('achat');
  const renflouements = sumOf('renflouement');
  const remboursements = sumOf('remboursement') + repaymentsTotal;

  const cashNet = brut - credits - consommations - achats + renflouements + remboursements;
  const mobile = mobileSales + repaymentsMobile;
  return {
    brut,
    credits,
    consommations,
    achats,
    renflouements,
    remboursements,
    cashNet,
    mobile,
    cashEnMain: cashNet - mobile,
    nbVentes: sales.length,
  };
}

/* ---------- Coffre (all money in / out of the business) ---------- */
type CoffreAccountId = 'especes' | 'moncash' | 'natcash';
type CoffreKind = 'entree' | 'sortie' | 'transfert';

/** Supporting document. `dataUrl` is absent for generated (mock / automatic) pieces, which are rendered on demand. */
type CoffrePiece = {
  ref: string;
  nom: string;
  type: string; // MIME type
  dataUrl?: string;
};

type CoffreEntry = {
  id: string;
  branchId: string;
  date: Date;
  kind: CoffreKind;
  categorie: string;
  compte: CoffreAccountId; // credited (entree) or debited (sortie / transfert)
  compteDest?: CoffreAccountId; // transfert only
  montant: number;
  note?: string;
  piece?: CoffrePiece; // pièce justificative (facture, reçu, bordereau…)
};

const COFFRE_ACCOUNTS: Array<{ id: CoffreAccountId; label: string; icon: typeof Banknote }> = [
  { id: 'especes', label: 'Espèces', icon: Banknote },
  { id: 'moncash', label: 'MonCash', icon: Smartphone },
  { id: 'natcash', label: 'NatCash', icon: Smartphone },
];

const COFFRE_CATEGORIES: Record<'entree' | 'sortie', string[]> = {
  entree: ['Versement caisse', 'Renflouement', 'Remboursement client', 'Apport propriétaire', 'Solde initial', 'Autre entrée'],
  sortie: ['Achat marchandises', 'Dépense courante', 'Salaire', 'Retrait propriétaire', 'Réappro. petite caisse', 'Autre sortie'],
};

const COFFRE_KIND_META: Record<CoffreKind, { label: string; plural: string; icon: typeof Plus }> = {
  entree: { label: 'Entrée', plural: 'Entrées', icon: ArrowDownLeft },
  sortie: { label: 'Sortie', plural: 'Sorties', icon: ArrowUpRight },
  transfert: { label: 'Transfert', plural: 'Transferts', icon: ArrowLeftRight },
};

type CoffrePeriod = 'jour' | 'mois' | 'annee' | 'tout';
const COFFRE_PERIODS: Array<{ id: CoffrePeriod; label: string }> = [
  { id: 'jour', label: 'Jour' },
  { id: 'mois', label: 'Mois' },
  { id: 'annee', label: 'Année' },
  { id: 'tout', label: 'Tout' },
];

const coffreAccountLabel = (id: CoffreAccountId) => COFFRE_ACCOUNTS.find((a) => a.id === id)?.label ?? id;

function coffreBalances(entries: CoffreEntry[]): Record<CoffreAccountId, number> {
  const b: Record<CoffreAccountId, number> = { especes: 0, moncash: 0, natcash: 0 };
  for (const e of entries) {
    if (e.kind === 'entree') b[e.compte] += e.montant;
    else if (e.kind === 'sortie') b[e.compte] -= e.montant;
    else if (e.compteDest) {
      b[e.compte] -= e.montant;
      b[e.compteDest] += e.montant;
    }
  }
  return b;
}

/* ---------- Coffre: pièces justificatives ---------- */
const COFFRE_PIECE_MAX_BYTES = 5 * 1024 * 1024;

function readPieceFile(file: File): Promise<CoffrePiece> {
  return new Promise((resolve, reject) => {
    const okType = file.type.startsWith('image/') || file.type === 'application/pdf';
    if (!okType) return reject(new Error('Format non supporté : image ou PDF uniquement.'));
    if (file.size > COFFRE_PIECE_MAX_BYTES) return reject(new Error('Fichier trop lourd (5 Mo maximum).'));
    const reader = new FileReader();
    reader.onload = () =>
      resolve({ ref: `PJ-${Date.now().toString(36).toUpperCase()}`, nom: file.name, type: file.type, dataUrl: String(reader.result) });
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.readAsDataURL(file);
  });
}

const escapeXml = (text: string) =>
  text.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** Returns a displayable / downloadable URL for the entry's piece (renders a receipt for generated pieces). */
function coffrePieceUrl(entry: CoffreEntry): string {
  if (entry.piece?.dataUrl) return entry.piece.dataUrl;
  const sign = entry.kind === 'entree' ? '+' : entry.kind === 'sortie' ? '-' : '';
  const amountColor = entry.kind === 'entree' ? '#2F6B4F' : entry.kind === 'sortie' ? '#C1440E' : '#16181A';
  const compte = coffreAccountLabel(entry.compte) + (entry.compteDest ? ' > ' + coffreAccountLabel(entry.compteDest) : '');
  const lines: Array<[string, string]> = [
    ['Date', entry.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) + ' ' + fmtTime12(entry.date)],
    ['Type', COFFRE_KIND_META[entry.kind].label],
    ['Catégorie', entry.categorie],
    ['Compte', compte],
    ['Note', entry.note ?? '—'],
  ];
  const rows = lines
    .map(
      ([k, v], i) =>
        `<text x="40" y="${170 + i * 34}" font-size="12" fill="#4B5560" letter-spacing="1.5">${escapeXml(k.toUpperCase())}</text>` +
        `<text x="190" y="${170 + i * 34}" font-size="15" fill="#16181A">${escapeXml(v)}</text>`
    )
    .join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="440" viewBox="0 0 560 440" font-family="Courier New, monospace">` +
    `<rect width="560" height="440" fill="#FBFAF6"/><rect x="8" y="8" width="544" height="424" fill="none" stroke="#16181A" stroke-width="3"/>` +
    `<rect x="8" y="8" width="544" height="64" fill="#16181A"/>` +
    `<text x="40" y="47" font-size="20" fill="#FBFAF6" letter-spacing="3">PIÈCE JUSTIFICATIVE</text>` +
    `<text x="40" y="106" font-size="12" fill="#4B5560" letter-spacing="1.5">RÉF.</text>` +
    `<text x="190" y="106" font-size="18" font-weight="bold" fill="#C1440E">${escapeXml(entry.piece?.ref ?? '—')}</text>` +
    rows +
    `<line x1="40" y1="350" x2="520" y2="350" stroke="#16181A" stroke-width="2" stroke-dasharray="6 4"/>` +
    `<text x="40" y="396" font-size="12" fill="#4B5560" letter-spacing="1.5">MONTANT</text>` +
    `<text x="520" y="398" font-size="26" font-weight="bold" text-anchor="end" fill="${amountColor}">${sign} ${escapeXml(fmtHTG(entry.montant))}</text>` +
    `<text x="40" y="424" font-size="10" fill="#9CA3AF">Document généré (données de test)</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function downloadPiece(entry: CoffreEntry) {
  if (!entry.piece) return;
  const a = document.createElement('a');
  a.href = coffrePieceUrl(entry);
  a.download = entry.piece.nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ---------- Mock data for Rapports (cash entries) and Coffre ---------- */
function makeMockRand(seedStart: number) {
  let seed = seedStart;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const roundTo = (n: number, step: number) => Math.round(n / step) * step;
  return { rand, randInt, roundTo };
}

/** Date `daysAgo` days back at a given hour, never later than "now" for today. */
function mockDateAt(daysAgo: number, hour: number, minute: number): Date {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour, minute);
  return d.getTime() > now.getTime() ? new Date(now.getTime() - 60000) : d;
}

function buildMockCashEntries(): CashEntry[] {
  if (!USE_MOCK_SALES) return [];
  const { rand, randInt, roundTo } = makeMockRand(20260928);
  const out: CashEntry[] = [];
  const push = (branchId: string, daysAgo: number, type: CashEntryType, montant: number, note: string) =>
    out.push({
      id: `CM${out.length}`,
      branchId,
      date: mockDateAt(daysAgo, randInt(8, 17), randInt(0, 59)),
      type,
      montant,
      note,
    });

  Object.keys(BRANCH_INVENTORY_SEED).forEach((branchId) => {
    for (let daysAgo = 0; daysAgo < MOCK_HISTORY_DAYS; daysAgo++) {
      const today = daysAgo === 0;
      if (today || rand() < 0.55) {
        const label = ['Déjeuner équipe', 'Eau et café', 'Carburant génératrice', 'Petit matériel'][randInt(0, 3)];
        push(branchId, daysAgo, 'consommation', roundTo(randInt(150, 700), 50), label);
      }
      if (today || rand() < 0.4) {
        const label = ['Transport marchandises', 'Sacs et emballages', 'Réparation outil', 'Fournitures bureau'][randInt(0, 3)];
        push(branchId, daysAgo, 'achat', roundTo(randInt(500, 3500), 50), label);
      }
      if (rand() < 0.12) push(branchId, daysAgo, 'renflouement', roundTo(randInt(1000, 5000), 500), 'Fonds de caisse ajouté');
      if (rand() < 0.15) push(branchId, daysAgo, 'remboursement', roundTo(randInt(200, 1500), 50), 'Retour marchandise client');
    }
  });
  return out;
}

function buildMockCoffreEntries(): CoffreEntry[] {
  if (!USE_MOCK_SALES) return [];
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
    add(branchId, first - 0, 'entree', 'Apport propriétaire', 'especes', 100000, 'Capital de démarrage');

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
type PettyKind = 'depense' | 'reappro';

type PettyEntry = {
  id: string;
  branchId: string;
  date: Date;
  kind: PettyKind;
  categorie: string;
  montant: number;
  note?: string;
  recu?: string; // receipt / voucher number (pièce justificative)
  coffreId?: string; // linked Coffre withdrawal, for replenishments taken from the safe
};

type PettyCount = {
  id: string;
  branchId: string;
  date: Date;
  theorique: number;
  compte: number;
  ecart: number; // compte − theorique
  note?: string;
};

const DEFAULT_PETTY_FLOAT = 10000;
const PETTY_REAPPRO_CATEGORY = 'Réappro. petite caisse';

const PETTY_CATEGORIES = [
  'Transport',
  'Eau et café',
  'Carburant',
  'Fournitures bureau',
  'Nettoyage',
  'Petites réparations',
  'Recharge / communication',
  'Autre dépense',
];

const pettyBalance = (entries: PettyEntry[]) =>
  entries.reduce((sum, e) => sum + (e.kind === 'reappro' ? e.montant : -e.montant), 0);

function buildMockPetty(): { petty: PettyEntry[]; coffre: CoffreEntry[]; counts: PettyCount[] } {
  const result = { petty: [] as PettyEntry[], coffre: [] as CoffreEntry[], counts: [] as PettyCount[] };
  if (!USE_MOCK_SALES) return result;
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

  Object.keys(BRANCH_INVENTORY_SEED).forEach((branchId) => {
    let balance = 0;
    const addPetty = (daysAgo: number, hour: number, entry: Omit<PettyEntry, 'id' | 'branchId' | 'date'>) => {
      result.petty.push({ id: `PM${result.petty.length}`, branchId, date: mockDateAt(daysAgo, hour, randInt(0, 59)), ...entry });
    };
    const replenish = (daysAgo: number, note: string) => {
      const montant = roundTo(DEFAULT_PETTY_FLOAT - balance, 50);
      if (montant <= 0) return;
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
        montant,
        note: 'Réapprovisionnement petite caisse',
      });
      result.petty.push({
        id: `PM${result.petty.length}`,
        branchId,
        date,
        kind: 'reappro',
        categorie: PETTY_REAPPRO_CATEGORY,
        montant,
        note,
        coffreId,
      });
      balance += montant;
    };

    const first = MOCK_HISTORY_DAYS - 1;
    replenish(first, 'Fonds initial');

    for (let daysAgo = first; daysAgo >= 0; daysAgo--) {
      const dow = new Date(Date.now() - daysAgo * 86400000).getDay();
      if (dow !== 0 && rand() < 0.75) {
        const n = randInt(1, 2);
        for (let i = 0; i < n; i++) {
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
      if (balance < 2000 && dow !== 0) replenish(daysAgo, 'Réapprovisionnement');

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

const fmtTime12 = (d: Date) =>
  d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

const fmtHTG = (n: number) =>
  new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' HTG';

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
  const [achats, setAchats] = useState<PurchaseRecord[]>(() => buildMockPurchases());
  const [cashEntries, setCashEntries] = useState<CashEntry[]>(() => buildMockCashEntries());
  const [pettySeed] = useState(() => buildMockPetty());
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

      {lastReceipt && <ReceiptModal sale={lastReceipt} onClose={() => setLastReceipt(null)} />}
    </div>
  );
}

function ReceiptModal({ sale, onClose }: { sale: SaleRecord; onClose: () => void }) {
  const cancelled = sale.statut === 'annulee';
  return createPortal(
    <div className="receipt-print fixed inset-0 z-[95] flex items-center justify-center bg-black/55 p-4">
      <div className="max-h-full w-full max-w-md overflow-y-auto border-2 border-[#16181A] bg-white p-4 shadow-[8px_8px_0_#16181A]">
        <div className="flex items-start justify-between border-b-2 border-[#16181A] pb-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#4B5560]">Ticket de vente</div>
            <div className="mt-1 font-serif text-[26px] leading-none text-[#16181A]">Tchiley</div>
          </div>
          <button onClick={onClose} className="print-close mt-1 text-[#4B5560] hover:text-[#C1440E]" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        {cancelled && (
          <div className="mt-3 border-2 border-[#C1440E] bg-[#FDF1EC] px-3 py-1.5 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-[#C1440E]">
            Vente annulée
          </div>
        )}

        <div className="mt-4 space-y-1 text-[12px] text-[#4B5560]">
          <div className="flex justify-between">
            <span>Réf.</span>
            <span className="font-semibold text-[#16181A]">{sale.id}</span>
          </div>
          <div className="flex justify-between">
            <span>Date</span>
            <span>{sale.date.toLocaleString('fr-HT')}</span>
          </div>
          <div className="flex justify-between">
            <span>Paiement</span>
            <span>{PAYMENT_METHODS.find((m) => m.id === sale.paiement)?.label || sale.paiement}</span>
          </div>
          {sale.client && (
            <div className="flex justify-between">
              <span>Client</span>
              <span className="font-semibold text-[#16181A]">{sale.client}</span>
            </div>
          )}
        </div>

        <div className="mt-5 border-t-2 border-b-2 border-[#16181A] py-3">
          <div className="mb-2 flex justify-between text-[11px] uppercase tracking-[0.18em] text-[#4B5560]">
            <span>Article</span>
            <span>Montant</span>
          </div>

          {sale.lignes.map((ligne, index) => (
            <div key={`${sale.id}-${index}`} className="mb-2 space-y-1 text-[13px]">
              <div className="flex justify-between gap-3">
                <span className="pr-2">{ligne.qte} × {ligne.nom}</span>
                <span>{fmtHTG(ligne.sousTotal)}</span>
              </div>
              <div className="text-right text-[11px] text-[#4B5560]">{fmtHTG(ligne.prix)} / unité</div>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2 text-[13px]">
          <div className="flex justify-between">
            <span className="text-[#4B5560]">Sous-total</span>
            <span>{fmtHTG(sale.total + (sale.remise ?? 0))}</span>
          </div>
          {(sale.remise ?? 0) > 0 && (
            <div className="flex justify-between text-[#C1440E]">
              <span>Remise</span>
              <span>- {fmtHTG(sale.remise ?? 0)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-[#c7c2b4] pt-2">
            <span className="text-[#4B5560]">Reçu</span>
            <span>{fmtHTG(sale.recu)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#4B5560]">Monnaie</span>
            <span className="font-medium text-[#2F6B4F]">{fmtHTG(sale.monnaie)}</span>
          </div>
          <div className="flex justify-between border-t-2 border-[#16181A] pt-3 font-serif text-[22px]">
            <span>Total</span>
            <span className={cancelled ? 'line-through' : ''}>{fmtHTG(sale.total)}</span>
          </div>
          {sale.paiement === 'credit' && !cancelled && (
            <div className="flex justify-between border-t border-[#c7c2b4] pt-2 text-[#C1440E]">
              <span>Solde dû</span>
              <span className="font-medium">{fmtHTG(creditBalance(sale))}</span>
            </div>
          )}
        </div>

        <div className="print-actions mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 border-2 border-[#16181A] bg-white py-2.5 text-[14px] hover:bg-[#ECE7DC]">
            Fermer
          </button>
          <button
            onClick={() => window.print()}
            className="flex-1 border-2 border-[#16181A] bg-[#2F6B4F] py-2.5 text-[14px] font-medium text-white hover:bg-[#255a40]"
          >
            Imprimer
          </button>
        </div>
      </div>
    </div>,
    document.body
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

function isSameDay(a: Date, b: Date) {
  return (
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear()
  );
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const WEEKDAY_INITIALS_FR = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function DatePicker({
  selectedDate,
  onSelect,
  salesDays,
  block = false,
  renderTrigger,
}: {
  selectedDate: Date;
  onSelect: (date: Date) => void;
  salesDays: Set<string>;
  block?: boolean;
  /** Custom trigger (mobile app bar). The calendar itself stays the same. */
  renderTrigger?: (p: { open: boolean; toggle: () => void }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);
  const sheetTouchStart = (e: ReactTouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const sheetTouchEnd = (e: ReactTouchEvent) => {
    if (touchStartY.current !== null && e.changedTouches[0].clientY - touchStartY.current > 60) setOpen(false);
    touchStartY.current = null;
  };

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const leadingBlanks = (new Date(year, month, 1).getDay() + 6) % 7; // week starts on Monday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  const canGoNextMonth = new Date(year, month + 1, 1) <= today;

  const toggleOpen = () => {
    if (!open) setViewMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    setOpen((prev) => !prev);
  };

  const pickDate = (date: Date) => {
    onSelect(date);
    setOpen(false);
  };

  /* Mobile (< md): Material 3 modal bottom sheet — scrim, drag handle (swipe down to close), headline,
     circular day cells, text buttons. Desktop (≥ md): unchanged house-style popover. */
  const m3Nav =
    'flex h-10 w-10 items-center justify-center rounded-full text-[var(--m3-on-surface-variant)] transition-colors hover:bg-[var(--m3-surface-container-highest)] active:bg-[var(--m3-surface-container-highest)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ' +
    M3_FOCUS;

  return (
    <div ref={containerRef} className={renderTrigger ? 'relative shrink-0' : block ? 'relative min-w-0 flex-1 md:flex-none' : 'relative'}>
      {renderTrigger ? renderTrigger({ open, toggle: toggleOpen }) : (
      <button
        type="button"
        onClick={toggleOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={selectedDate.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        className={
          'flex items-center gap-2 whitespace-nowrap rounded-full border-0 px-4 text-sm font-medium text-[var(--m3-on-surface)] transition-colors md:h-10 ' +
          (block ? 'h-10 w-full justify-center md:w-auto ' : 'h-8 ') +
          (open
            ? 'bg-[var(--m3-secondary-container)] '
            : 'bg-[var(--m3-surface-container-high)] hover:bg-[var(--m3-surface-container-highest)] ') +
          M3_FOCUS
        }
      >
        <CalendarDays size={16} className="text-[var(--m3-primary)]" />
        <span className="capitalize">
          {selectedDate.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}
        </span>
      </button>
      )}

      {open && (
        <>
          {/* M3 Expressive scrim (mobile only) */}
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="m3-scrim fixed inset-0 z-[80] bg-black/40 md:hidden"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Choisir une date"
            style={M3_VARS}
            className={
              'm3-sheet fixed inset-x-0 bottom-0 z-[81] max-h-[90vh] w-full overflow-y-auto rounded-t-[28px] bg-[var(--m3-surface-container-low)] pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 text-[var(--m3-on-surface)] shadow-[0_-8px_24px_rgba(0,0,0,0.16)] ' +
              'md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-full md:z-50 md:mt-2 md:max-h-none md:w-[328px] md:overflow-visible md:rounded-[28px] md:p-3 md:shadow-[0_8px_10px_-6px_rgba(0,0,0,0.2),0_16px_24px_2px_rgba(0,0,0,0.14)]'
            }
          >
            {/* M3 sheet: drag handle + supporting text + headline (mobile only) */}
            <div className="md:hidden" onTouchStart={sheetTouchStart} onTouchEnd={sheetTouchEnd}>
            <div className="mx-auto mb-3 mt-1 h-1 w-8 rounded-full bg-[var(--m3-outline-variant)]" />
            <div className="px-6 pb-3">
              <div className="text-xs font-medium text-[var(--m3-on-surface-variant)]">Sélectionner une date</div>
              <div className="mt-2 text-[28px] font-normal capitalize leading-9">
                {selectedDate.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
              </div>
            </div>
            </div>
            <div className="mb-1 h-px bg-[var(--m3-outline-variant)] md:hidden" />

            <div className="px-3 md:px-0">
              <div className="mb-2 flex items-center justify-between md:mb-2">
                {/* mobile: month label left, chevrons right */}
                <div className="pl-3 text-sm font-medium capitalize">
                  {viewMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                </div>
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setViewMonth(new Date(year, month - 1, 1))}
                    className={m3Nav}
                    aria-label="Mois précédent"
                  >
                    <ChevronRight size={20} className="rotate-180" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMonth(new Date(year, month + 1, 1))}
                    disabled={!canGoNextMonth}
                    className={m3Nav}
                    aria-label="Mois suivant"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>

              </div>

              <div className="mb-1 grid grid-cols-7 text-center text-xs font-medium text-[var(--m3-on-surface)]">
                {WEEKDAY_INITIALS_FR.map((label, index) => (
                  <div key={index} className="flex h-10 items-center justify-center">{label}</div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {cells.map((date, index) => {
                  if (!date) return <div key={`blank-${index}`} />;
                  const isFuture = date > today;
                  const isSelected = isSameDay(date, selectedDate);
                  const isToday = isSameDay(date, today);
                  const hasSales = salesDays.has(dayKey(date));
                  return (
                    <div key={dayKey(date)} className="flex items-center justify-center">
                      <button
                        type="button"
                        disabled={isFuture}
                        onClick={() => pickDate(date)}
                        aria-label={date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        aria-pressed={isSelected}
                        className={
                          'relative flex h-10 w-10 items-center justify-center rounded-full border text-sm tabular-nums transition-colors ' +
                          M3_FOCUS + ' ' +
                          (isFuture
                            ? 'cursor-not-allowed border-transparent text-[var(--m3-on-surface)] opacity-40'
                            : isSelected
                            ? 'border-[var(--m3-primary)] bg-[var(--m3-primary)] font-medium text-[var(--m3-on-primary)]'
                            : isToday
                            ? 'border-[var(--m3-outline)] font-medium text-[var(--m3-primary)] hover:bg-[var(--m3-surface-container-highest)]'
                            : 'border-transparent hover:bg-[var(--m3-surface-container-highest)]')
                        }
                      >
                        {date.getDate()}
                        {hasSales && (
                          <span
                            className={
                              'absolute bottom-1 h-1 w-1 rounded-full ' +
                              (isSelected
                                ? 'bg-[var(--m3-on-primary)]'
                                : isFuture
                                ? 'bg-[var(--m3-outline)]'
                                : 'bg-[var(--m3-primary)]')
                            }
                          />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* M3 actions: text buttons (mobile only) */}
            <div className="mt-2 flex items-center justify-between gap-2 px-3 pb-1">
              <span className="flex items-center gap-1.5 pl-3 text-xs text-[var(--m3-on-surface-variant)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--m3-primary)]" />
                Jour avec ventes
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => pickDate(new Date())}
                  className={`h-10 rounded-full px-3 text-sm font-medium text-[var(--m3-primary)] hover:bg-[var(--m3-surface-container-highest)] active:bg-[var(--m3-surface-container-highest)] ${M3_FOCUS}`}
                >
                  Aujourd'hui
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className={`h-10 rounded-full px-3 text-sm font-medium text-[var(--m3-primary)] hover:bg-[var(--m3-surface-container-highest)] active:bg-[var(--m3-surface-container-highest)] ${M3_FOCUS}`}
                >
                  Fermer
                </button>
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
}

/* =========================================================================
   MOBILE APP CHROME (< md)
   · one sticky app bar: menu · titre de la section · succursale
   · a day strip (+ calendar bottom sheet) replaces the old "Journée" card
   · a bottom navigation bar holds the four main destinations
   · a modal drawer holds everything else, grouped, with identity + actions
   Desktop (≥ md) uses DesktopSidebar / DesktopTopBar (defined below).
   ========================================================================= */
type HeaderStat = {
  id: string;
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: 'default' | 'warn';
  onClick?: () => void;
};

function relativeDayLabel(d: Date) {
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, now)) return "Aujourd'hui";
  if (isSameDay(d, yesterday)) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long' });
}

function shortBranchName(b: Branch) {
  return b.nom.replace('Tchiley Construction', '').trim() || b.nom;
}

/* Last 14 days as one-tap chips. Older dates are reached through the calendar sheet. */
function DayStrip({
  selectedDate,
  onSelect,
  salesDays,
}: {
  selectedDate: Date;
  onSelect: (d: Date) => void;
  salesDays: Set<string>;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const selKey = dayKey(selectedDate);
  const todayKey = dayKey(new Date());

  const days = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const list: Date[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(t);
      d.setDate(t.getDate() - i);
      list.push(d);
    }
    // A date picked from the calendar sheet that is older than the strip is pinned at the start.
    if (selectedDate < list[0]) list.unshift(new Date(selectedDate));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey, todayKey]);

  useEffect(() => {
    const box = scrollerRef.current;
    if (!box) return;
    const el = box.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!el) return;
    box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' });
  }, [selKey]);

  return (
    <div ref={scrollerRef} className="relative flex min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {days.map((d) => {
        const selected = isSameDay(d, selectedDate);
        const isToday = isSameDay(d, new Date());
        const hasSales = salesDays.has(dayKey(d));
        return (
          <button
            key={dayKey(d)}
            type="button"
            onClick={() => onSelect(d)}
            aria-pressed={selected}
            aria-label={d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            className={
              'relative flex h-12 w-[46px] shrink-0 flex-col items-center justify-center rounded-[16px] m3-press motion-reduce:transition-none ' +
              (selected
                ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]'
                : isToday
                ? 'border border-[var(--m3-outline)] text-[var(--m3-on-surface)]'
                : 'bg-[var(--m3-surface-container)] text-[var(--m3-on-surface)]') +
              ' ' + M3_FOCUS
            }
          >
            <span className="text-[11px] leading-none opacity-80">
              {d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')}
            </span>
            <span className="mt-1 text-base font-medium leading-none tabular-nums">{d.getDate()}</span>
            {hasSales && (
              <span
                className={'absolute bottom-[3px] h-1 w-1 rounded-full ' + (selected ? 'bg-[var(--m3-on-primary)]' : 'bg-[var(--m3-primary)]')}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

type BranchSwitcher = { branches: Branch[]; activeId: string; onChange: (id: string) => void };

function BranchHeaderCards({
  branch,
  title,
  onMenu,
  date,
  stats,
  branchSwitcher,
  compact = false,
}: {
  branch: Branch;
  /** Section name shown in the app bar. */
  title: string;
  onMenu: () => void;
  /** Dashboard only shows the key figures; other tabs get the app bar + day strip alone. */
  compact?: boolean;
  date: {
    selectedDate: Date;
    onSelect: (d: Date) => void;
    salesDays: Set<string>;
    isToday: boolean;
  } | null;
  stats: HeaderStat[];
  /** Owner board: the branch line under the title becomes a switcher. */
  branchSwitcher?: BranchSwitcher;
}) {
  const isOpen = branch.statut === 'Ouvert';
  const dot = (
    <span className={'h-2 w-2 shrink-0 rounded-full ' + (isOpen ? 'bg-[var(--m3-primary)]' : 'bg-[var(--m3-outline)]')} />
  );

  return (
    <>
      <header className="sticky top-0 z-[60] -mx-4 -mt-5 mb-3 shrink-0 border-b border-[var(--m3-outline-variant)] bg-[var(--m3-surface)] pt-[env(safe-area-inset-top)] md:hidden">
        <div className="flex h-14 items-center gap-1 px-2">
          <button
            type="button"
            onClick={onMenu}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--m3-on-surface)] active:bg-[var(--m3-surface-container-highest)] m3-press motion-reduce:transition-none ${M3_FOCUS}`}
            aria-label="Ouvrir le menu"
          >
            <Menu size={24} />
          </button>

          <div className="min-w-0 flex-1 px-1">
            <h1 className="truncate text-[22px] font-medium leading-7">{title}</h1>
            {branchSwitcher ? (
              <label className="relative -my-1 flex w-fit max-w-full items-center gap-1.5 py-1 text-xs text-[var(--m3-on-surface-variant)]">
                {dot}
                <span className="truncate">{shortBranchName(branch)}</span>
                <span className="sr-only">{branch.statut}</span>
                <ChevronDown size={14} className="shrink-0" />
                <select
                  aria-label="Changer de succursale"
                  value={branchSwitcher.activeId}
                  onChange={(event) => branchSwitcher.onChange(event.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                >
                  {branchSwitcher.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {shortBranchName(b)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-[var(--m3-on-surface-variant)]">
                {dot}
                <span className="truncate">{shortBranchName(branch)}</span>
                <span className="sr-only">{branch.statut}</span>
              </div>
            )}
          </div>

          {date && !date.isToday && (
            <button
              type="button"
              onClick={() => date.onSelect(new Date())}
              className={`mr-1 flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[var(--m3-tertiary-container)] px-3 text-sm font-medium text-[var(--m3-on-tertiary-container)] m3-press motion-reduce:transition-none ${M3_FOCUS}`}
            >
              <RotateCcw size={16} />
              Aujourd'hui
            </button>
          )}
        </div>

        {date && (
          <div className="flex items-center gap-2 px-4 pb-2">
            <DatePicker
              selectedDate={date.selectedDate}
              onSelect={date.onSelect}
              salesDays={date.salesDays}
              renderTrigger={({ open, toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  aria-haspopup="dialog"
                  aria-expanded={open}
                  aria-label="Ouvrir le calendrier"
                  className={
                    'flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[16px] text-[var(--m3-on-secondary-container)] m3-press motion-reduce:transition-none ' +
                    (open ? 'bg-[var(--m3-primary-container)]' : 'bg-[var(--m3-secondary-container)]') +
                    ' ' + M3_FOCUS
                  }
                >
                  <CalendarDays size={18} />
                  <span className="text-[11px] font-medium leading-none">
                    {date.selectedDate.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}
                  </span>
                </button>
              )}
            />
            <DayStrip selectedDate={date.selectedDate} onSelect={date.onSelect} salesDays={date.salesDays} />
          </div>
        )}
      </header>

      {!compact && stats.length > 0 && (
        <section aria-label="Chiffres clés" className="mb-4 grid shrink-0 grid-cols-2 gap-2 md:hidden">
          {stats.map((s) => {
            const Icon = s.icon;
            const warn = s.tone === 'warn';
            const cls =
              'flex min-w-0 flex-col gap-1 rounded-[20px] p-3 text-left ' +
              (warn ? 'bg-[#FFE08B] text-[#251A00]' : 'bg-[var(--m3-surface-container)]') +
              (s.onClick ? ' m3-press-card motion-reduce:transition-none ' + M3_FOCUS : '');
            const body = (
              <>
                <span className="flex items-center gap-1.5 text-xs opacity-80">
                  <Icon size={14} /> {s.label}
                </span>
                <span className="truncate text-lg font-medium leading-tight">{s.value}</span>
                {s.hint && <span className="truncate text-[11px] opacity-70">{s.hint}</span>}
              </>
            );
            return s.onClick ? (
              <button key={s.id} type="button" onClick={s.onClick} className={cls}>
                {body}
              </button>
            ) : (
              <div key={s.id} className={cls}>
                {body}
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}

type MobileTab = {
  id: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  badge?: number;
  badgeTone?: 'default' | 'warn';
  onClick: () => void;
};

/* Four main destinations + "Plus" (opens the drawer). "Plus" lights up when the
   current section isn't one of the four. */
function MobileBottomNav({ tabs, moreActive, onMore }: { tabs: MobileTab[]; moreActive: boolean; onMore: () => void }) {
  const all: MobileTab[] = [
    ...tabs,
    { id: 'plus', label: 'Plus', icon: MoreHorizontal, active: moreActive, onClick: onMore },
  ];
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-50 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-start gap-1 border-t border-[var(--m3-outline-variant)] bg-[var(--m3-surface-container)] px-2 pt-2 md:hidden"
    >
      {all.map((t) => {
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            onClick={t.onClick}
            aria-current={t.active ? 'page' : undefined}
            className={`flex h-14 min-w-0 flex-1 flex-col items-center gap-1 text-xs font-medium ${
              t.active ? 'text-[var(--m3-on-surface)]' : 'text-[var(--m3-on-surface-variant)]'
            } ${M3_FOCUS}`}
          >
            <span
              className={
                'relative flex h-8 w-16 items-center justify-center rounded-full m3-morph ' +
                (t.active ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]' : '')
              }
            >
              <Icon size={22} />
              {!!t.badge && (
                <span
                  className={
                    'absolute right-2 top-0 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium ' +
                    (t.badgeTone === 'warn' ? 'bg-[#BA1A1A] text-white' : 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]')
                  }
                >
                  {t.badge}
                </span>
              )}
            </span>
            <span className="max-w-full truncate">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

type DrawerChild = { id: string; label: string; short?: string; active: boolean; onClick: () => void };
type DrawerItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  badge?: number;
  expanded?: boolean;
  children?: DrawerChild[];
  onClick: () => void;
};
type DrawerGroup = { label: string; items: DrawerItem[] };
type DrawerAction = { label: string; icon: LucideIcon; onClick: () => void };

/* Modal drawer: identity header · stock alert · grouped destinations · footer actions. */
function MobileNavDrawer({
  open,
  onClose,
  branch,
  groups,
  stockAlerts,
  onStockAlerts,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  branch: Branch;
  groups: DrawerGroup[];
  stockAlerts: number;
  onStockAlerts: () => void;
  actions: DrawerAction[];
}) {
  const name = shortBranchName(branch);
  const isOpen = branch.statut === 'Ouvert';
  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={
          'fixed inset-0 z-[65] bg-black/40 transition-opacity duration-200 motion-reduce:transition-none md:hidden ' +
          (open ? 'opacity-100' : 'pointer-events-none opacity-0')
        }
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu de la succursale"
        aria-hidden={!open}
        className={
          'fixed inset-y-0 left-0 z-[70] flex w-80 max-w-[88vw] flex-col rounded-r-[28px] bg-[var(--m3-surface-container-low)] text-[var(--m3-on-surface)] shadow-[0_8px_10px_-6px_rgba(0,0,0,0.2),0_16px_24px_2px_rgba(0,0,0,0.14)] transition-[transform,visibility] duration-200 motion-reduce:transition-none md:hidden ' +
          (open ? 'visible translate-x-0' : 'invisible -translate-x-full')
        }
      >
        <div className="flex items-start gap-3 px-5 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--m3-primary-container)] text-lg font-medium text-[var(--m3-on-primary-container)]">
            {name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-medium leading-6">{name}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--m3-on-surface-variant)]">
              <span className={'h-2 w-2 rounded-full ' + (isOpen ? 'bg-[var(--m3-primary)]' : 'bg-[var(--m3-outline)]')} />
              {branch.statut}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--m3-on-surface-variant)] active:bg-[var(--m3-surface-container-highest)] ${M3_FOCUS}`}
            aria-label="Fermer le menu"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mx-5 mb-3 space-y-1 text-xs text-[var(--m3-on-surface-variant)]">
          <div className="flex items-center gap-1.5">
            <MapPin size={14} className="shrink-0" />
            <span className="truncate">{branch.ville}, {branch.adresse}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <UserRound size={14} className="shrink-0" />
            <span className="truncate">Responsable : {branch.gestionnaire}</span>
          </div>
        </div>

        {stockAlerts > 0 && (
          <button
            type="button"
            onClick={onStockAlerts}
            className={`mx-3 mb-1 flex shrink-0 items-center gap-3 rounded-2xl bg-[#FFE08B] px-4 py-3 text-left text-sm text-[#251A00] m3-press-card motion-reduce:transition-none ${M3_FOCUS}`}
          >
            <AlertTriangle size={18} className="shrink-0" />
            <span className="flex-1 font-medium">
              {stockAlerts} article{stockAlerts > 1 ? 's' : ''} en stock bas
            </span>
            <ChevronRight size={16} className="shrink-0" />
          </button>
        )}

        <nav aria-label="Sections" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="px-4 pb-1 pt-4 text-xs font-medium text-[var(--m3-on-surface-variant)]">{group.label}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.id} className="mb-0.5">
                    <button
                      type="button"
                      onClick={item.onClick}
                      aria-current={item.active ? 'page' : undefined}
                      aria-expanded={item.children ? !!item.expanded : undefined}
                      className={
                        'flex h-14 w-full items-center gap-3 rounded-full px-4 text-left text-sm font-medium m3-press motion-reduce:transition-none ' +
                        (item.active
                          ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
                          : 'text-[var(--m3-on-surface-variant)] active:bg-[var(--m3-surface-container-highest)]') +
                        ' ' + M3_FOCUS
                      }
                    >
                      <Icon size={22} className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {!!item.badge && (
                        <span className="rounded-full bg-[var(--m3-primary)] px-2 py-0.5 text-xs text-[var(--m3-on-primary)]">
                          {item.badge}
                        </span>
                      )}
                      {item.children && (
                        <ChevronDown size={18} className={'shrink-0 transition-transform ' + (item.expanded ? 'rotate-180' : '')} />
                      )}
                    </button>
                    {item.children && item.expanded && (
                      <div className="ml-9 mt-1 border-l-2 border-[var(--m3-outline-variant)] pl-2">
                        {item.children.map((child) => (
                          <button
                            key={child.id}
                            type="button"
                            onClick={child.onClick}
                            className={
                              'mb-0.5 flex h-12 w-full items-center rounded-full px-4 text-left text-sm ' +
                              (child.active
                                ? 'bg-[var(--m3-secondary-container)] font-medium text-[var(--m3-on-secondary-container)]'
                                : 'text-[var(--m3-on-surface-variant)] active:bg-[var(--m3-surface-container-highest)]') +
                              ' ' + M3_FOCUS
                            }
                          >
                            {child.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        {actions.length > 0 && (
          <div className="shrink-0 border-t border-[var(--m3-outline-variant)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {actions.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.label}
                  type="button"
                  onClick={a.onClick}
                  className={`flex h-12 w-full items-center gap-3 rounded-full px-4 text-left text-sm font-medium text-[var(--m3-on-surface-variant)] active:bg-[var(--m3-surface-container-highest)] ${M3_FOCUS}`}
                >
                  <Icon size={20} className="shrink-0" />
                  {a.label}
                </button>
              );
            })}
          </div>
        )}
      </aside>
    </>
  );
}

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
const M3_VARS = {
    '--m3-primary': '#00693F', '--m3-on-primary': '#FFFFFF',
    '--m3-primary-container': '#8BF4B7', '--m3-on-primary-container': '#00210F',
    '--m3-secondary-container': '#C7EBD2', '--m3-on-secondary-container': '#082013',
    '--m3-tertiary': '#7B5800', '--m3-on-tertiary': '#FFFFFF',
    '--m3-tertiary-container': '#FFDF9A', '--m3-on-tertiary-container': '#261A00',
    '--m3-surface': '#F4FBF4', '--m3-surface-container-lowest': '#FFFFFF',
    '--m3-surface-container-low': '#EEF6EE', '--m3-surface-container': '#E8F0E8',
    '--m3-surface-container-high': '#E2EAE2', '--m3-surface-container-highest': '#DCE4DC',
    '--m3-on-surface': '#171D18', '--m3-on-surface-variant': '#3E4941',
    '--m3-outline': '#6E7A70', '--m3-outline-variant': '#BDC9BF',
    /* Expressive shape scale */
    '--m3-shape-lg-inc': '20px', '--m3-shape-xl-inc': '32px', '--m3-shape-xxl': '48px',
  } as CSSProperties;

/* Stock status roles — fixed across palettes so meaning never changes with the tint. */
const M3_STATUS = {
  ok: { bg: 'bg-[var(--m3-primary-container)]', fg: 'text-[var(--m3-on-primary-container)]' },
  low: { bg: 'bg-[#FFE08B]', fg: 'text-[#251A00]' },
  out: { bg: 'bg-[#FFDAD6]', fg: 'text-[#410002]' },
};

const M3_FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--m3-primary)]';

const M3_CSS = `
:root {
  /* M3 Expressive motion: spatial springs overshoot, effects springs don't. */
  --m3-spring-spatial: cubic-bezier(.34,1.56,.64,1);
  --m3-spring-effects: cubic-bezier(.2,0,0,1);
}
@supports (transition-timing-function: linear(0, 1)) {
  :root {
    --m3-spring-spatial: linear(0, .18 5%, .55 12%, .9 20%, 1.06 28%, 1.09 34%, 1.04 44%, .99 58%, 1.005 74%, 1);
    --m3-spring-effects: linear(0, .35 7%, .72 16%, .92 28%, .99 42%, 1);
  }
}
@keyframes m3-in { from { opacity: 0; transform: translateY(-12px) scale(.98); } to { opacity: 1; transform: none; } }
.m3-in { animation: m3-in .5s var(--m3-spring-spatial); }
@keyframes m3e-scrim-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes m3e-pop-in { from { opacity: 0; transform: scale(.86) translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes m3-sheet-in { from { transform: translateY(100%); } to { transform: none; } }
@keyframes m3e-dialog-in { from { opacity: 0; transform: translate(-50%, -46%) scale(.86); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }

/* Phone only: pressed controls squish and morph their shape (pill -> rounded square). */
@media (max-width: 639px) {
  .m3-press { transition: transform .45s var(--m3-spring-spatial), border-radius .45s var(--m3-spring-spatial), background-color .2s var(--m3-spring-effects); }
  .m3-press:active { transform: scale(.94); border-radius: 16px; }
  .m3-press-card { transition: transform .4s var(--m3-spring-spatial); }
  .m3-press-card:active { transform: scale(.97); }
  .m3-scrim { animation: m3e-scrim-in .25s var(--m3-spring-effects); }
  .m3-dialog { animation: m3e-dialog-in .5s var(--m3-spring-spatial); }
  .m3-sheet { animation: m3-sheet-in .4s var(--m3-spring-effects); }
  .m3-pop { animation: m3e-pop-in .5s var(--m3-spring-spatial); }
}
.m3-morph { transition: border-radius .5s var(--m3-spring-spatial), background-color .25s var(--m3-spring-effects), color .25s var(--m3-spring-effects); }
@keyframes m3-side-in { from { transform: translateX(100%); } to { transform: none; } }
.m3-side { animation: m3-side-in .4s var(--m3-spring-effects); }

/* Expressive loading indicator: a single shape that morphs and rotates. */
@keyframes m3-morph {
  0%   { border-radius: 50%;             transform: rotate(0deg); }
  20%  { border-radius: 24%;             transform: rotate(72deg); }
  40%  { border-radius: 50% 12% 50% 12%; transform: rotate(144deg); }
  60%  { border-radius: 14%;             transform: rotate(216deg); }
  80%  { border-radius: 40% 60% 40% 60%; transform: rotate(288deg); }
  100% { border-radius: 50%;             transform: rotate(360deg); }
}
.m3-loading { display: inline-block; background: currentColor; animation: m3-morph 2s var(--m3-spring-effects) infinite; }
@media (prefers-reduced-motion: reduce) {
  .m3-in, .m3-scrim, .m3-dialog, .m3-sheet, .m3-pop, .m3-side { animation: none; }
  .m3-press, .m3-press-card, .m3-morph { transition: none; }
  .m3-loading { animation: none; border-radius: 30%; }
}
`;

function M3Loading({ size = 18 }: { size?: number }) {
  return <span role="progressbar" aria-label="Chargement" className="m3-loading shrink-0" style={{ width: size * 0.8, height: size * 0.8 }} />;
}

/* State layer: a translucent overlay in the content colour (hover 8 %, focus/press 12 %). */
function M3StateLayer({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 bg-current opacity-0 transition-opacity duration-150 group-hover:opacity-[0.08] group-focus-visible:opacity-[0.12] group-active:opacity-[0.12] motion-reduce:transition-none ${className}`}
    />
  );
}

function categoryIcon(categorie: string) {
  if (categorie === 'Quincaillerie') return Wrench;
  if (categorie === 'Boissons Gazeuse') return CupSoda;
  if (categorie === 'Produits alimentaires') return Wheat;
  return Package;
}

/* Filled text field with a persistent small label; 16px text avoids the iOS zoom-on-focus. */
function M3TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block min-w-0 rounded-xl bg-[var(--m3-surface)] px-4 pb-1.5 pt-2 ring-1 ring-[var(--m3-outline)] transition-shadow focus-within:ring-2 focus-within:ring-[var(--m3-primary)] motion-reduce:transition-none">
      <span className="block text-xs leading-4 text-[var(--m3-on-surface-variant)]">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full min-w-0 bg-transparent p-0 text-base text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)]"
      />
    </label>
  );
}

type ProductFieldTone = 'green' | 'ink' | 'steel' | 'yellow';

type ProductDraft = {
  nom: string;
  categorie: string;
  prix: number;
  prixAchat: number;
  stockFermeture: number;
  seuil: number;
  unite: string;
};

const PRODUCT_FIELD_TONES: Record<ProductFieldTone, { text: string }> = {
  green: { text: 'text-[var(--m3-primary)]' },
  steel: { text: 'text-[var(--m3-on-surface-variant)]' },
  ink: { text: 'text-[var(--m3-on-surface)]' },
  yellow: { text: 'text-[#7A5900]' },
};

/* Numeric field for the phone card: read-only tile until the card is in edit mode,
   then an outlined field that highlights with the primary colour on focus. */
function ProductNumberField({
  label,
  value,
  onChange,
  editing,
  tone = 'ink',
  placeholder,
  decimal = false,
  autoFocus = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  editing: boolean;
  tone?: ProductFieldTone;
  placeholder?: string;
  decimal?: boolean;
  autoFocus?: boolean;
}) {
  const t = PRODUCT_FIELD_TONES[tone];
  return (
    <label
      className={`block min-w-0 rounded-xl bg-[var(--m3-surface)] px-3 pb-1 pt-2 transition-shadow motion-reduce:transition-none ${
        editing ? 'ring-1 ring-[var(--m3-outline)] focus-within:ring-2 focus-within:ring-[var(--m3-primary)]' : ''
      }`}
    >
      <span className="block truncate text-xs leading-4 text-[var(--m3-on-surface-variant)]">{label}</span>
      <input
        type="number"
        min="0"
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={value}
        placeholder={placeholder}
        readOnly={!editing}
        autoFocus={autoFocus}
        tabIndex={editing ? 0 : -1}
        onFocus={(event) => event.target.select()}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className={`h-8 w-full min-w-0 bg-transparent p-0 text-base font-medium tabular-nums outline-none ${t.text}`}
      />
    </label>
  );
}

type ProductSortKey = 'nom' | 'vendu' | 'prix' | 'prixAchat' | 'stock' | 'seuil' | 'marge' | 'valeur';

function BranchProductsSection({
  branchId,
  branchProducts,
  inventorySearch,
  setInventorySearch,
  inventoryCategoryFilter,
  setInventoryCategoryFilter,
  inventoryStatusFilter,
  setInventoryStatusFilter,
  soldByProductToday,
  restockByProduct,
  setRestockByProduct,
  selectedHistoryProduct,
  productHistoryById,
  productMetricsById,
  onAddProduct,
  onUpdateProduct,
  onRestockProduct,
  onDeleteProduct,
  onRecordMovement,
  onViewHistory,
}: {
  branchId: string;
  branchProducts: Product[];
  inventorySearch: string;
  setInventorySearch: Dispatch<SetStateAction<string>>;
  inventoryCategoryFilter: string;
  setInventoryCategoryFilter: Dispatch<SetStateAction<string>>;
  inventoryStatusFilter: 'all' | 'low' | 'normal';
  setInventoryStatusFilter: Dispatch<SetStateAction<'all' | 'low' | 'normal'>>;
  soldByProductToday: Record<string, number>;
  restockByProduct: Record<string, number>;
  setRestockByProduct: Dispatch<SetStateAction<Record<string, number>>>;
  selectedHistoryProduct: Product | null;
  productHistoryById: Record<string, ProductHistoryEntry[]>;
  productMetricsById: Record<string, { velocity: number; daysLeft: number | null; sales30: number }>;
  onAddProduct: (draft?: Partial<Product>) => void;
  onUpdateProduct: (productId: string, patch: Partial<Product>) => void;
  onRestockProduct: (product: Product) => void;
  onDeleteProduct: (product: Product) => void;
  onRecordMovement: (entry: ProductMovement) => void;
  onViewHistory: (product: Product) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [inventoryFocusFilter, setInventoryFocusFilter] = useState<'all' | 'reorder' | 'dead' | 'top'>('all');
  const [stockAdjustment, setStockAdjustment] = useState({ delta: 0, reason: 'Inventaire' });
  const [addProductOpen, setAddProductOpen] = useState(false);

  const productSummaries = useMemo(() => {
    const map: Record<string, { unitMargin: number; stockCost: number; stockSale: number; sales7: number; sales30: number; velocity: number; daysLeft: number | null }> = {};
    branchProducts.forEach((product) => {
      const history = productHistoryById[product.id] ?? [];
      const sales7 = history.filter((entry) => entry.kind === 'sale' && entry.date.getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000).reduce((sum, entry) => sum + entry.qty, 0);
      const sales30 = history.filter((entry) => entry.kind === 'sale' && entry.date.getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000).reduce((sum, entry) => sum + entry.qty, 0);
      const velocity = sales30 / 30;
      const daysLeft = velocity > 0 ? product.stockFermeture / velocity : null;
      map[product.id] = {
        unitMargin: product.prix - product.prixAchat,
        stockCost: product.prixAchat * product.stockFermeture,
        stockSale: product.prix * product.stockFermeture,
        sales7,
        sales30,
        velocity,
        daysLeft,
      };
    });
    return map;
  }, [branchProducts, productHistoryById]);

  const filteredProducts = branchProducts.filter((product) => {
    const matchesCategory = inventoryCategoryFilter === 'Tout' || product.categorie === inventoryCategoryFilter;
    const matchesStatus =
      inventoryStatusFilter === 'all' ||
      (inventoryStatusFilter === 'low' && product.stockFermeture <= product.seuil) ||
      (inventoryStatusFilter === 'normal' && product.stockFermeture > product.seuil);
    const matchesFocus =
      inventoryFocusFilter === 'all' ||
      (inventoryFocusFilter === 'reorder' && product.stockFermeture <= product.seuil) ||
      (inventoryFocusFilter === 'dead' && productSummaries[product.id]?.sales30 === 0) ||
      (inventoryFocusFilter === 'top' && (productSummaries[product.id]?.sales30 ?? 0) >= 3);
    const matchesSearch =
      product.nom.toLowerCase().includes(inventorySearch.toLowerCase()) ||
      product.categorie.toLowerCase().includes(inventorySearch.toLowerCase());
    return matchesCategory && matchesStatus && matchesFocus && matchesSearch;
  });

  const totalStockValueCost = branchProducts.reduce((sum, product) => sum + product.prixAchat * product.stockFermeture, 0);
  const totalStockValueSale = branchProducts.reduce((sum, product) => sum + product.prix * product.stockFermeture, 0);
  const potentialProfit = totalStockValueSale - totalStockValueCost;
  const reorderList = branchProducts.filter((product) => product.stockFermeture <= product.seuil).sort((a, b) => {
    const aPriority = (a.seuil - a.stockFermeture) + (productSummaries[a.id]?.sales30 ?? 0) * 0.1;
    const bPriority = (b.seuil - b.stockFermeture) + (productSummaries[b.id]?.sales30 ?? 0) * 0.1;
    return bPriority - aPriority;
  });
  const deadStockList = branchProducts.filter((product) => (productSummaries[product.id]?.sales30 ?? 0) === 0).slice(0, 6);
  const topSellers = [...branchProducts].sort((a, b) => (productSummaries[b.id]?.sales30 ?? 0) - (productSummaries[a.id]?.sales30 ?? 0)).slice(0, 5);

  const lowStockCount = branchProducts.filter((product) => product.stockFermeture <= product.seuil).length;
  const outOfStockCount = branchProducts.filter((product) => product.stockFermeture <= 0).length;
  const lowOnlyCount = lowStockCount - outOfStockCount;
  const presentCategories = Array.from(new Set(branchProducts.map((product) => product.categorie))).sort(
    (a, b) => {
      const ia = (CATEGORIES as readonly string[]).indexOf(a);
      const ib = (CATEGORIES as readonly string[]).indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    }
  );
  const [addProductDraft, setAddProductDraft] = useState<ProductDraft>({
    nom: '',
    categorie: presentCategories[0] && presentCategories[0] !== 'Tout' ? presentCategories[0] : 'Autre',
    prix: 0,
    prixAchat: 0,
    stockFermeture: 0,
    seuil: 5,
    unite: 'unité',
  });
  const [addProductError, setAddProductError] = useState<string | null>(null);

  /* Desktop: sortable table + side sheet for editing. */
  const [sort, setSort] = useState<{ key: ProductSortKey; dir: 'asc' | 'desc' } | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [drawerFocus, setDrawerFocus] = useState<'restock' | null>(null);

  useEffect(() => {
    if (!drawerId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerId]);

  const isEditing = (id: string) => editingId === id;
  const isSaving = (id: string) => savingId === id;

  const handleEditClick = (id: string) => setEditingId(id);
  const handleCancelClick = () => setEditingId(null);
  const handleSaveClick = async (id: string) => {
    setSavingId(id);
    const savedProduct = branchProducts.find((item) => item.id === id);
    if (savedProduct) onRestockProduct(savedProduct);
    await new Promise((resolve) => setTimeout(resolve, 300));
    setSavingId(null);
    setEditingId(null);
  };


  const openDrawer = (id: string, focus: 'restock' | null = null) => {
    setDrawerFocus(focus);
    setDrawerId(id);
  };
  const drawerProduct = drawerId ? (branchProducts.find((item) => item.id === drawerId) ?? null) : null;

  const toggleSort = (key: ProductSortKey) =>
    setSort((prev) => {
      const first = key === 'nom' ? 'asc' : 'desc';
      const second = first === 'asc' ? 'desc' : 'asc';
      if (!prev || prev.key !== key) return { key, dir: first };
      return prev.dir === first ? { key, dir: second } : null;
    });

  const sortedProducts = (() => {
    if (!sort) return filteredProducts;
    const value = (p: Product): string | number => {
      switch (sort.key) {
        case 'nom': return p.nom.toLowerCase();
        case 'vendu': return soldByProductToday[p.id] ?? 0;
        case 'prix': return p.prix;
        case 'prixAchat': return p.prixAchat;
        case 'stock': return p.stockFermeture;
        case 'marge': return p.prix - p.prixAchat;
        case 'valeur': return p.prixAchat * p.stockFermeture;
        default: return p.seuil;
      }
    };
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filteredProducts].sort((x, y) => {
      const vx = value(x);
      const vy = value(y);
      return (typeof vx === 'string' ? vx.localeCompare(String(vy), 'fr') : Number(vx) - Number(vy)) * dir;
    });
  })();

  const handleManualAdjustment = (product: Product, delta: number, reason: string) => {
    if (!delta) return;
    const nextStock = Math.max(0, product.stockFermeture + delta);
    onUpdateProduct(product.id, { stockFermeture: nextStock });
    onRecordMovement({
      id: `manual-${Date.now()}-${product.id}`,
      branchId,
      productId: product.id,
      date: new Date(),
      kind: 'manual',
      qty: Math.abs(delta),
      note: reason,
      amount: 0,
    });
  };

  const submitNewProduct = () => {
    const name = addProductDraft.nom.trim();
    if (!name) {
      setAddProductError('Le nom du produit est obligatoire.');
      return;
    }

    const salePrice = Number(addProductDraft.prix) || 0;
    const purchasePrice = Number(addProductDraft.prixAchat) || 0;
    if (salePrice <= 0) {
      setAddProductError('Le prix de vente doit être supérieur à 0.');
      return;
    }
    if (purchasePrice > 0 && salePrice < purchasePrice) {
      setAddProductError('Le prix de vente ne peut pas être inférieur au prix d\'achat.');
      return;
    }

    onAddProduct({
      nom: name,
      categorie: addProductDraft.categorie || 'Autre',
      prix: salePrice,
      prixAchat: purchasePrice,
      stockFermeture: Math.max(0, Number(addProductDraft.stockFermeture) || 0),
      seuil: Math.max(0, Number(addProductDraft.seuil) || 0),
      unite: addProductDraft.unite.trim() || 'unité',
    });
    setAddProductError(null);
    setAddProductOpen(false);
    setAddProductDraft({
      nom: '',
      categorie: presentCategories[0] && presentCategories[0] !== 'Tout' ? presentCategories[0] : 'Autre',
      prix: 0,
      prixAchat: 0,
      stockFermeture: 0,
      seuil: 5,
      unite: 'unité',
    });
  };

  const sortHead = (key: ProductSortKey, label: string, align: 'left' | 'right' = 'right') => {
    const active = sort?.key === key;
    return (
      <th
        scope="col"
        aria-sort={active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`px-4 py-3 font-medium ${align === 'left' ? 'text-left' : 'text-right'}`}
      >
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className={`group relative -mx-2 inline-flex items-center gap-1 overflow-hidden rounded-full px-2 py-1 ${active ? 'text-[var(--m3-on-surface)]' : ''} ${M3_FOCUS}`}
        >
          <M3StateLayer />
          {label}
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={`transition-transform motion-reduce:transition-none ${active ? (sort?.dir === 'asc' ? 'rotate-180' : '') : 'opacity-0 group-hover:opacity-50'}`}
          />
        </button>
      </th>
    );
  };

  return (
    <>
    <div
      style={M3_VARS}
      className="-mx-4 -mb-5 min-h-[calc(100dvh-8rem)] bg-[var(--m3-surface)] px-4 pb-28 pt-4 font-sans text-[var(--m3-on-surface)] sm:hidden      "
    >
      <div className="mb-4 flex items-center gap-2  ">
        <div className="min-w-0 flex-1">
          <h2 className="text-[32px] font-bold leading-10 tracking-tight">Produits</h2>
          <p className="truncate text-sm leading-5 text-[var(--m3-on-surface-variant)]">
            {branchProducts.length} article{branchProducts.length !== 1 ? 's' : ''}
            {lowStockCount > 0 ? ` · ${lowStockCount} en stock bas` : ''}
          </p>
        </div>
        <button
            onClick={() => setAddProductOpen(true)}
            className={`group fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 shrink-0 items-center justify-center gap-3 overflow-hidden rounded-[20px] bg-[var(--m3-primary-container)] px-6 text-base font-semibold tracking-[0.01em] text-[var(--m3-on-primary-container)] shadow-[0_3px_8px_3px_rgba(0,0,0,0.15),0_1px_3px_rgba(0,0,0,0.3)] m3-press motion-reduce:transition-none ${M3_FOCUS}       `}
          >
            <M3StateLayer />
            <Plus className="h-6 w-6" />
            Nouveau
          </button>
      </div>

      {/* Toolbar: search + stock status on one row (desktop), category chips underneath */}
      <div className="     ">
        <div className="mb-3 flex h-14 w-full min-w-0 items-center gap-3 rounded-full bg-[var(--m3-surface-container-high)] px-4 transition-shadow focus-within:ring-2 focus-within:ring-[var(--m3-primary)] motion-reduce:transition-none   ">
          <Search className="h-6 w-6 shrink-0 text-[var(--m3-on-surface-variant)]" />
          <input
            type="text"
            value={inventorySearch}
            onChange={(event) => setInventorySearch(event.target.value)}
            placeholder="Rechercher un produit..."
            className="w-full min-w-0 border-none bg-transparent text-base text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)]"
          />
          {inventorySearch && (
            <button
              type="button"
              onClick={() => setInventorySearch('')}
              aria-label="Effacer la recherche"
              className={`group relative -mr-2 flex h-12 w-12 shrink-0   items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}
            >
              <M3StateLayer />
              <X size={20} />
            </button>
          )}
        </div>

      {/* Category filter chips — only categories present in this branch */}
      <div
        role="group"
        aria-label="Filtrer par catégorie"
        className="-mx-3 mb-2 flex gap-2 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden       "
      >
        {['Tout', ...presentCategories].map((category) => {
          const selected = inventoryCategoryFilter === category;
          return (
            <button
              key={category}
              type="button"
              aria-pressed={selected}
              onClick={() => setInventoryCategoryFilter(category)}
              className={`group relative shrink-0 before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']  ${M3_FOCUS}`}
            >
              <span
                className={`relative flex h-9 items-center gap-2 overflow-hidden px-3.5 text-sm font-medium m3-morph ${
                  selected ? 'rounded-full' : 'rounded-xl'
                } ${
                  selected
                    ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
                    : 'border border-[var(--m3-outline)] text-[var(--m3-on-surface-variant)]'
                }`}
              >
                <M3StateLayer />
                {selected && <Check size={16} />}
                {category}
              </span>
            </button>
          );
        })}
      </div>

      {/* Stock status — connected segmented button */}
      <div className="mb-4 grid h-14 grid-cols-3 gap-0.5    ">
        {[
          { id: 'all', label: 'Tous' },
          { id: 'low', label: 'En stock bas' },
          { id: 'normal', label: 'Normal' },
        ].map((status, idx, arr) => {
          const selected = inventoryStatusFilter === status.id;
          /* Connected button group: selected = full pill, others = small inner corners. */
          const shape = selected
            ? 'rounded-full'
            : idx === 0
              ? 'rounded-l-full rounded-r-lg'
              : idx === arr.length - 1
                ? 'rounded-r-full rounded-l-lg'
                : 'rounded-lg';
          return (
            <button
              key={status.id}
              onClick={() => setInventoryStatusFilter(status.id as 'all' | 'low' | 'normal')}
              aria-pressed={selected}
              className={
                `group relative flex items-center justify-center gap-1.5 overflow-hidden px-1 text-sm font-semibold m3-morph ${shape} ${M3_FOCUS} ` +
                (selected
                  ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]'
                  : 'bg-[var(--m3-surface-container-high)] text-[var(--m3-on-surface)]')
              }
            >
              <M3StateLayer />
              {selected && <Check size={16} />}
              {status.label}
            </button>
          );
        })}
      </div>

      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        {[
          ['Valeur stock', fmtHTG(totalStockValueCost)],
          ['Valeur vente', fmtHTG(totalStockValueSale)],
          ['Profit potentiel', fmtHTG(potentialProfit)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-[var(--m3-surface-container)] p-3">
            <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--m3-on-surface-variant)]">{label}</div>
            <div className="mt-1 text-sm font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      <div className="mb-4 grid h-12 grid-cols-4 gap-1.5">
        {[
          { id: 'all', label: 'Tout' },
          { id: 'reorder', label: 'À commander' },
          { id: 'dead', label: 'Inactif' },
          { id: 'top', label: 'Top ventes' },
        ].map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setInventoryFocusFilter(filter.id as 'all' | 'reorder' | 'dead' | 'top')}
            className={`group relative overflow-hidden rounded-full px-2 text-xs font-semibold ${M3_FOCUS} ${inventoryFocusFilter === filter.id ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]' : 'bg-[var(--m3-surface-container-high)] text-[var(--m3-on-surface)]'}`}
          >
            <M3StateLayer />
            {filter.label}
          </button>
        ))}
      </div>

      {(reorderList.length > 0 || deadStockList.length > 0 || topSellers.length > 0) && (
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          {reorderList.length > 0 && (
            <div className="rounded-[22px] bg-[var(--m3-surface-container)] p-3">
              <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--m3-on-surface-variant)]">À commander</div>
              <div className="mt-2 text-sm font-medium">{reorderList.slice(0, 2).map((product) => product.nom).join(' • ')}</div>
            </div>
          )}
          {deadStockList.length > 0 && (
            <div className="rounded-[22px] bg-[var(--m3-surface-container)] p-3">
              <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--m3-on-surface-variant)]">Inactif 30j</div>
              <div className="mt-2 text-sm font-medium">{deadStockList.slice(0, 2).map((product) => product.nom).join(' • ')}</div>
            </div>
          )}
          {topSellers.length > 0 && (
            <div className="rounded-[22px] bg-[var(--m3-surface-container)] p-3">
              <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--m3-on-surface-variant)]">Top ventes</div>
              <div className="mt-2 text-sm font-medium">{topSellers.slice(0, 2).map((product) => `${product.nom} (${productSummaries[product.id]?.sales30 ?? 0})`).join(' • ')}</div>
            </div>
          )}
        </div>
      )}

      {/* Product cards — tonal surfaces, state layers, tap to expand (1 column on phone, grid on desktop) */}
      <div className="grid grid-cols-1 items-start gap-2 pb-24    ">
          {filteredProducts.map((product) => {
            const soldToday = soldByProductToday[product.id] ?? 0;
            const restockValue = restockByProduct[product.id] ?? 0;
            const isLowStock = product.stockFermeture <= product.seuil;
            const isOutOfStock = product.stockFermeture <= 0;
            const editing = isEditing(product.id);
            const saving = isSaving(product.id);
            const open = editing || expandedId === product.id;
            const showHistory = selectedHistoryProduct?.id === product.id;
            const tone = isOutOfStock ? M3_STATUS.out : isLowStock ? M3_STATUS.low : M3_STATUS.ok;
            const statusLabel = isOutOfStock ? 'Rupture de stock' : isLowStock ? 'Stock bas' : 'En stock';
            const CategoryIcon = categoryIcon(product.categorie);
            const btn =
              `group relative flex h-12 items-center justify-center gap-2 overflow-hidden rounded-full px-2 text-sm font-medium tracking-[0.01em] ${M3_FOCUS}`;
            return (
              <div
                key={product.id}
                className={
                  'overflow-hidden transition-[background-color,border-radius] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ' +
                  (open
                    ? 'rounded-[32px] bg-[var(--m3-surface-container-high)]'
                    : 'rounded-2xl bg-[var(--m3-surface-container)]') +
                  (editing ? ' ring-2 ring-[var(--m3-primary)]' : '')
                }
              >
                {/* List item */}
                {editing ? (
                  <div className="m3-in space-y-2 p-4 pb-2">
                    <M3TextField
                      label="Nom du produit"
                      value={product.nom}
                      placeholder="Nom du produit"
                      onChange={(value) => onUpdateProduct(product.id, { nom: value })}
                    />
                    <M3TextField
                      label="Catégorie"
                      value={product.categorie}
                      placeholder="Catégorie"
                      onChange={(value) => onUpdateProduct(product.id, { categorie: value })}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setExpandedId((prev) => (prev === product.id ? null : product.id))}
                    aria-expanded={open}
                    className={`group relative flex min-h-[72px] w-full items-center gap-4 px-4 py-3 text-left ${M3_FOCUS}`}
                  >
                    <M3StateLayer />
                    <span
                      aria-hidden="true"
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone.bg} ${tone.fg}`}
                    >
                      <CategoryIcon size={20} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-medium leading-6 text-[var(--m3-on-surface)]">
                        {product.nom}
                      </span>
                      <span className="block truncate text-sm leading-5 text-[var(--m3-on-surface-variant)]">
                        {product.categorie} · Prix {product.prix} · Vendu {soldToday}
                      </span>
                    </span>
                    <span
                      className={`flex h-8 min-w-[2rem] shrink-0 items-center justify-center gap-1 rounded-full px-3 text-sm font-medium tabular-nums ${tone.bg} ${tone.fg}`}
                    >
                      {(isLowStock || isOutOfStock) && <AlertTriangle size={14} aria-hidden="true" />}
                      <span className="sr-only">{statusLabel} : </span>
                      {product.stockFermeture}
                    </span>
                    <ChevronDown
                      size={20}
                      aria-hidden="true"
                      className={
                        'shrink-0 text-[var(--m3-on-surface-variant)] transition-transform duration-300 motion-reduce:transition-none ' +
                        (open ? 'rotate-180' : '')
                      }
                    />
                  </button>
                )}

                {/* Expanded details */}
                {open && (
                  <div className="m3-in px-4 pb-4 pt-1">
                    {showHistory && !editing && (() => {
                      const history = productHistoryById[product.id] ?? [];
                      const metrics = productMetricsById[product.id] ?? { velocity: 0, daysLeft: null, sales30: 0 };
                      const recent = history.slice(0, 3);
                      return (
                        <div className="mb-3 rounded-2xl bg-[var(--m3-surface)] p-3">
                          <div className="grid grid-cols-3 gap-2 text-center">
                            {[
                              ['Vendu 30j', `${metrics.sales30}`],
                              ['Vélocité', metrics.velocity > 0 ? `${metrics.velocity.toFixed(1)}/j` : '0/j'],
                              ['Jours restants', metrics.daysLeft != null ? `${metrics.daysLeft.toFixed(1)} j` : '—'],
                            ].map(([label, value]) => (
                              <div key={label}>
                                <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--m3-on-surface-variant)]">{label}</div>
                                <div className="mt-1 text-sm font-semibold tabular-nums">{value}</div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 space-y-1.5">
                            {recent.length === 0 ? (
                              <div className="text-xs text-[var(--m3-on-surface-variant)]">Aucun mouvement historique pour ce produit.</div>
                            ) : recent.map((entry) => {
                                const signed = entry.kind === 'sale' ? '-' : '+';
                                const tone = entry.kind === 'sale' ? 'text-[#BA1A1A]' : 'text-[#2F6B4F]';
                                return (
                                  <div key={entry.id} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--m3-surface-container)] px-2.5 py-1.5 text-xs">
                                    <div className="min-w-0">
                                      <div className="truncate font-medium text-[var(--m3-on-surface)]">{entry.note}</div>
                                      <div className="text-[var(--m3-on-surface-variant)]">{entry.kind === 'sale' ? 'Vente' : entry.kind === 'purchase' ? 'Achat' : entry.kind === 'restock' ? 'Réappro.' : 'Ajustement'} · {entry.date.toLocaleDateString('fr-FR')}</div>
                                    </div>
                                    <div className={`tabular-nums font-semibold ${tone}`}>{signed}{entry.qty}</div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      );
                    })()}

                    <div className="grid grid-cols-3 gap-2">
                      <ProductNumberField
                        label="Prix vente"
                        tone="green"
                        decimal
                        editing={editing}
                        value={product.prix}
                        onChange={(value) => onUpdateProduct(product.id, { prix: value })}
                      />
                      <ProductNumberField
                        label="Prix achat"
                        tone="steel"
                        decimal
                        editing={editing}
                        value={product.prixAchat}
                        onChange={(value) => onUpdateProduct(product.id, { prixAchat: value })}
                      />
                      <ProductNumberField
                        label="Seuil"
                        tone="yellow"
                        editing={editing}
                        value={product.seuil}
                        onChange={(value) => onUpdateProduct(product.id, { seuil: value })}
                      />
                      <ProductNumberField
                        label="Ouverture"
                        editing={editing}
                        value={product.stockOuverture}
                        onChange={(value) => onUpdateProduct(product.id, { stockOuverture: value })}
                      />
                      <ProductNumberField
                        label="Fermeture"
                        editing={editing}
                        value={product.stockFermeture}
                        onChange={(value) => onUpdateProduct(product.id, { stockFermeture: value })}
                      />
                      <ProductNumberField
                        label="Ajout stock"
                        tone="green"
                        placeholder="Qté"
                        editing={editing}
                        value={restockValue}
                        onChange={(value) => setRestockByProduct((prev) => ({ ...prev, [product.id]: value }))}
                      />
                    </div>

                    <div className={'mt-4 grid gap-2 ' + (editing ? 'grid-cols-2' : 'grid-cols-3')}>
                      {editing ? (
                        <>
                          <button
                            onClick={() => handleSaveClick(product.id)}
                            disabled={saving}
                            className={
                              `${btn} bg-[var(--m3-primary)] text-[var(--m3-on-primary)] ` +
                              (saving ? 'cursor-wait opacity-80' : '')
                            }
                            aria-label={saving ? 'Enregistrement...' : 'Enregistrer'}
                          >
                            <M3StateLayer />
                            {saving ? <M3Loading size={18} /> : <Check size={18} />}
                            {saving ? 'Envoi…' : 'Enregistrer'}
                          </button>
                          <button
                            onClick={handleCancelClick}
                            className={`${btn} border border-[var(--m3-outline)] text-[var(--m3-primary)]`}
                            aria-label="Annuler"
                          >
                            <M3StateLayer />
                            <X size={18} />
                            Annuler
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => onViewHistory(product)}
                            className={
                              `${btn} ` +
                              (showHistory
                                ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]'
                                : 'border border-[var(--m3-outline)] text-[var(--m3-primary)]')
                            }
                            aria-label="Historique"
                            aria-pressed={showHistory}
                          >
                            <M3StateLayer />
                            <History size={18} />
                            Histo.
                          </button>
                          <button
                            onClick={() => {
                              setExpandedId(product.id);
                              handleEditClick(product.id);
                            }}
                            className={`${btn} bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]`}
                            aria-label="Modifier"
                          >
                            <M3StateLayer />
                            <Pencil size={18} />
                            Modifier
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`Supprimer « ${product.nom} » ?`)) onDeleteProduct(product);
                            }}
                            className={`${btn} text-[#BA1A1A]`}
                            aria-label="Supprimer"
                          >
                            <M3StateLayer />
                            <Trash2 size={18} />
                            Suppr.
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filteredProducts.length === 0 && (
            <div className="rounded-[32px] bg-[var(--m3-surface-container)] px-6 py-10 text-center ">
              <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]">
                <PackagePlus size={28} />
              </span>
              <p className="text-base font-medium">Aucun produit ne correspond aux filtres.</p>
              <p className="mt-1 text-sm text-[var(--m3-on-surface-variant)]">
                Essayez de modifier vos critères de recherche.
              </p>
            </div>
          )}
      </div>
    </div>

      {/* ===================== Desktop (sm and up): table + side sheet ===================== */}
      <div style={M3_VARS} className="hidden font-sans text-[var(--m3-on-surface)] sm:block">
        <div className="mb-5 flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[32px] font-bold leading-10 tracking-tight">Produits</h2>
            <p className="text-sm text-[var(--m3-on-surface-variant)]">
              {branchProducts.length} article{branchProducts.length !== 1 ? 's' : ''}
              {lowOnlyCount > 0 ? ` · ${lowOnlyCount} en stock bas` : ''}
              {outOfStockCount > 0 ? ` · ${outOfStockCount} en rupture` : ''}
            </p>
          </div>
          <button
            onClick={() => setAddProductOpen(true)}
            className={`group relative flex h-12 shrink-0 items-center gap-2 overflow-hidden rounded-[20px] bg-[var(--m3-primary)] px-6 text-sm font-semibold text-[var(--m3-on-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.3),0_1px_2px_rgba(0,0,0,0.15)] transition-[box-shadow,transform] hover:shadow-[0_2px_6px_2px_rgba(0,0,0,0.15),0_1px_2px_rgba(0,0,0,0.3)] active:scale-[0.96] motion-reduce:transition-none ${M3_FOCUS}`}
          >
            <M3StateLayer />
            <Plus size={20} />
            Nouveau produit
          </button>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="flex h-12 min-w-[240px] max-w-md flex-1 items-center gap-3 rounded-full bg-[var(--m3-surface-container-high)] px-4 transition-shadow focus-within:ring-2 focus-within:ring-[var(--m3-primary)] motion-reduce:transition-none">
            <Search className="h-5 w-5 shrink-0 text-[var(--m3-on-surface-variant)]" />
            <input
              type="text"
              value={inventorySearch}
              onChange={(event) => setInventorySearch(event.target.value)}
              placeholder="Rechercher un produit..."
              className="w-full min-w-0 border-none bg-transparent text-sm text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)]"
            />
            {inventorySearch && (
              <button
                type="button"
                onClick={() => setInventorySearch('')}
                aria-label="Effacer la recherche"
                className={`group relative -mr-2 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}
              >
                <M3StateLayer />
                <X size={18} />
              </button>
            )}
          </div>

          <div role="group" aria-label="Filtrer par stock" className="grid h-12 w-[420px] max-w-full grid-cols-3 gap-0.5">
            {[
              { id: 'all', label: 'Tous', count: branchProducts.length },
              { id: 'low', label: 'En stock bas', count: lowStockCount },
              { id: 'normal', label: 'Normal', count: branchProducts.length - lowStockCount },
            ].map((status, idx, arr) => {
              const selected = inventoryStatusFilter === status.id;
              const shape = selected
                ? 'rounded-full'
                : idx === 0
                  ? 'rounded-l-full rounded-r-lg'
                  : idx === arr.length - 1
                    ? 'rounded-r-full rounded-l-lg'
                    : 'rounded-lg';
              return (
                <button
                  key={status.id}
                  onClick={() => setInventoryStatusFilter(status.id as 'all' | 'low' | 'normal')}
                  aria-pressed={selected}
                  className={
                    `group relative flex items-center justify-center gap-1.5 overflow-hidden px-2 text-sm font-semibold m3-morph ${shape} ${M3_FOCUS} ` +
                    (selected
                      ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]'
                      : 'bg-[var(--m3-surface-container-high)] text-[var(--m3-on-surface)]')
                  }
                >
                  <M3StateLayer />
                  {selected && <Check size={16} />}
                  {status.label}
                  <span className="text-xs font-medium tabular-nums opacity-70">{status.count}</span>
                </button>
              );
            })}
          </div>

          <div className="ml-auto text-sm tabular-nums text-[var(--m3-on-surface-variant)]" aria-live="polite">
            {filteredProducts.length} sur {branchProducts.length}
          </div>
        </div>

        <div className="mb-4 grid grid-cols-4 gap-2">
          {[
            { id: 'all', label: 'Tout' },
            { id: 'reorder', label: 'À commander' },
            { id: 'dead', label: 'Inactif' },
            { id: 'top', label: 'Top ventes' },
          ].map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setInventoryFocusFilter(filter.id as 'all' | 'reorder' | 'dead' | 'top')}
              className={`group relative h-10 overflow-hidden rounded-full px-3 text-sm font-medium ${M3_FOCUS} ${inventoryFocusFilter === filter.id ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]' : 'bg-[var(--m3-surface-container-high)] text-[var(--m3-on-surface)]'}`}
            >
              <M3StateLayer />
              {filter.label}
            </button>
          ))}
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          {[
            ['Valeur stock', fmtHTG(totalStockValueCost)],
            ['Valeur vente', fmtHTG(totalStockValueSale)],
            ['Profit potentiel', fmtHTG(potentialProfit)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[22px] bg-[var(--m3-surface-container)] p-3">
              <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--m3-on-surface-variant)]">{label}</div>
              <div className="mt-1 text-sm font-semibold tabular-nums">{value}</div>
            </div>
          ))}
        </div>

        <div role="group" aria-label="Filtrer par catégorie" className="mb-5 flex flex-wrap gap-2">
          {['Tout', ...presentCategories].map((category) => {
            const selected = inventoryCategoryFilter === category;
            return (
              <button
                key={category}
                type="button"
                aria-pressed={selected}
                onClick={() => setInventoryCategoryFilter(category)}
                className={`group relative shrink-0 ${M3_FOCUS}`}
              >
                <span
                  className={`relative flex h-8 items-center gap-1.5 overflow-hidden px-3 text-sm font-medium m3-morph ${
                    selected ? 'rounded-full' : 'rounded-lg'
                  } ${
                    selected
                      ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
                      : 'border border-[var(--m3-outline)] text-[var(--m3-on-surface-variant)]'
                  }`}
                >
                  <M3StateLayer />
                  {selected && <Check size={14} />}
                  {category}
                </span>
              </button>
            );
          })}
        </div>

        <div className="overflow-hidden rounded-[28px] bg-[var(--m3-surface-container)]">
          <div className="max-h-[62vh] overflow-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--m3-surface-container-high)] text-xs text-[var(--m3-on-surface-variant)] shadow-[0_1px_0_var(--m3-outline-variant)]">
                <tr>
                  {sortHead('nom', 'Produit', 'left')}
                  {sortHead('vendu', 'Vendu auj.')}
                  {sortHead('prix', 'Prix vente')}
                  {sortHead('prixAchat', 'Prix achat')}
                  {sortHead('marge', 'Marge')}
                  {sortHead('stock', 'Stock')}
                  {sortHead('valeur', 'Valeur')}
                  {sortHead('seuil', 'Seuil')}
                  <th scope="col" className="w-40 px-3 py-3 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedProducts.map((product) => {
                  const soldToday = soldByProductToday[product.id] ?? 0;
                  const isLowStock = product.stockFermeture <= product.seuil;
                  const isOutOfStock = product.stockFermeture <= 0;
                  const tone = isOutOfStock ? M3_STATUS.out : isLowStock ? M3_STATUS.low : M3_STATUS.ok;
                  const statusLabel = isOutOfStock ? 'Rupture de stock' : isLowStock ? 'Stock bas' : 'En stock';
                  const CategoryIcon = categoryIcon(product.categorie);
                  const active = drawerId === product.id;
                  const iconBtn = `group relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`;
                  return (
                    <tr
                      key={product.id}
                      tabIndex={0}
                      onClick={() => openDrawer(product.id)}
                      onKeyDown={(event) => {
                        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                          event.preventDefault();
                          openDrawer(product.id);
                        }
                      }}
                      className={
                        'cursor-pointer border-b border-[var(--m3-outline-variant)]/60 transition-colors last:border-b-0 focus-visible:bg-[var(--m3-surface-container-high)] focus-visible:outline-none motion-reduce:transition-none ' +
                        (active
                          ? 'bg-[var(--m3-secondary-container)]'
                          : isOutOfStock
                            ? 'bg-[#FFDAD6]/40 hover:bg-[#FFDAD6]/60'
                            : 'hover:bg-[var(--m3-surface-container-high)]')
                      }
                    >
                      <td className="max-w-[320px] px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone.bg} ${tone.fg}`}>
                            <CategoryIcon size={18} />
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-medium">{product.nom}</div>
                            <div className="truncate text-xs text-[var(--m3-on-surface-variant)]">{product.categorie}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[var(--m3-on-surface-variant)]">{soldToday}</td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums text-[var(--m3-primary)]">{fmtHTG(product.prix)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[var(--m3-on-surface-variant)]">{fmtHTG(product.prixAchat)}</td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums text-[var(--m3-on-surface)]">{fmtHTG(product.prix - product.prixAchat)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 font-medium tabular-nums ${tone.bg} ${tone.fg}`}>
                          {(isLowStock || isOutOfStock) && <AlertTriangle size={14} aria-hidden="true" />}
                          <span className="sr-only">{statusLabel} : </span>
                          {product.stockFermeture}
                          <span className="text-xs font-normal opacity-70">{product.unite}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[var(--m3-on-surface-variant)]">{fmtHTG(product.prixAchat * product.stockFermeture)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[var(--m3-on-surface-variant)]">{product.seuil}</td>
                      <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openDrawer(product.id, 'restock')} className={iconBtn} aria-label="Ajouter du stock" title="Ajouter du stock">
                            <M3StateLayer />
                            <PackagePlus size={18} />
                          </button>
                          <button onClick={() => openDrawer(product.id)} className={iconBtn} aria-label="Modifier" title="Modifier">
                            <M3StateLayer />
                            <Pencil size={18} />
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`Supprimer « ${product.nom} » ?`)) onDeleteProduct(product);
                            }}
                            className={`${iconBtn} !text-[#BA1A1A]`}
                            aria-label="Supprimer"
                            title="Supprimer"
                          >
                            <M3StateLayer />
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {sortedProducts.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]">
                          <PackagePlus size={28} />
                        </span>
                        <span className="text-base font-medium">Aucun produit ne correspond aux filtres.</span>
                        <span className="text-sm text-[var(--m3-on-surface-variant)]">Essayez de modifier vos critères de recherche.</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {drawerProduct &&
        (() => {
          const p = drawerProduct;
          const isOut = p.stockFermeture <= 0;
          const isLow = p.stockFermeture <= p.seuil;
          const tone = isOut ? M3_STATUS.out : isLow ? M3_STATUS.low : M3_STATUS.ok;
          const statusLabel = isOut ? 'Rupture de stock' : isLow ? 'Stock bas' : 'En stock';
          const CategoryIcon = categoryIcon(p.categorie);
          const marge = p.prix - p.prixAchat;
          const margePct = p.prix > 0 ? Math.round((marge / p.prix) * 100) : 0;
          const saving = isSaving(p.id);
          const footBtn = `group relative flex h-11 items-center justify-center gap-2 overflow-hidden rounded-full px-5 text-sm font-medium ${M3_FOCUS}`;
          const sectionTitle = 'mb-2 text-xs font-medium tracking-[0.03em] text-[var(--m3-on-surface-variant)]';
          return createPortal(
            <>
              <div aria-hidden="true" onClick={() => setDrawerId(null)} className="fixed inset-0 z-[80] hidden bg-black/30 sm:block" />
              <aside
                key={p.id}
                role="dialog"
                aria-modal="true"
                aria-label={`Modifier ${p.nom}`}
                style={M3_VARS}
                className="m3-side fixed inset-y-0 right-0 z-[81] hidden w-[440px] max-w-full flex-col rounded-l-[28px] bg-[var(--m3-surface-container-low)] text-[var(--m3-on-surface)] shadow-[-8px_0_24px_rgba(0,0,0,0.16)] sm:flex"
              >
                <div className="flex shrink-0 items-start gap-4 px-6 pb-4 pt-6">
                  <span aria-hidden="true" className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${tone.bg} ${tone.fg}`}>
                    <CategoryIcon size={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xl font-medium leading-7">{p.nom || 'Sans nom'}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--m3-on-surface-variant)]">
                      <span className="truncate">{p.categorie}</span>
                      <span className={`inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium ${tone.bg} ${tone.fg}`}>
                        {(isLow || isOut) && <AlertTriangle size={12} aria-hidden="true" />}
                        {statusLabel}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDrawerId(null)}
                    aria-label="Fermer"
                    className={`group relative -mr-2 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}
                  >
                    <M3StateLayer />
                    <X size={20} />
                  </button>
                </div>

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-4">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ['Vendu auj.', String(soldByProductToday[p.id] ?? 0)],
                      ['Marge unitaire', `${fmtHTG(marge)} · ${margePct}%`],
                      ['Valeur du stock', fmtHTG(p.prixAchat * p.stockFermeture)],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl bg-[var(--m3-surface-container)] px-3 py-2.5">
                        <div className="text-xs text-[var(--m3-on-surface-variant)]">{label}</div>
                        <div className="mt-0.5 text-sm font-medium tabular-nums">{value}</div>
                      </div>
                    ))}
                  </div>

                  <section>
                    <h3 className={sectionTitle}>Informations</h3>
                    <div className="space-y-2">
                      <M3TextField label="Nom du produit" value={p.nom} placeholder="Nom du produit" onChange={(value) => onUpdateProduct(p.id, { nom: value })} />
                      <M3TextField label="Catégorie" value={p.categorie} placeholder="Catégorie" onChange={(value) => onUpdateProduct(p.id, { categorie: value })} />
                    </div>
                  </section>

                  <section>
                    <h3 className={sectionTitle}>Prix (HTG)</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <ProductNumberField label="Prix vente" tone="green" decimal editing value={p.prix} onChange={(value) => onUpdateProduct(p.id, { prix: value })} />
                      <ProductNumberField label="Prix achat" tone="steel" decimal editing value={p.prixAchat} onChange={(value) => onUpdateProduct(p.id, { prixAchat: value })} />
                    </div>
                  </section>

                  <section>
                    <h3 className={sectionTitle}>Correction de stock</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block min-w-0 rounded-xl bg-[var(--m3-surface)] px-3 pb-1 pt-2 ring-1 ring-[var(--m3-outline)] focus-within:ring-2 focus-within:ring-[var(--m3-primary)]">
                        <span className="block text-xs leading-4 text-[var(--m3-on-surface-variant)]">Raison</span>
                        <select value={stockAdjustment.reason} onChange={(event) => setStockAdjustment((prev) => ({ ...prev, reason: event.target.value }))} className="h-8 w-full bg-transparent text-base text-[var(--m3-on-surface)] outline-none">
                          {['Inventaire', 'Casse', 'Perte', 'Vol', 'Autre'].map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </label>
                      <ProductNumberField
                        label="Quantité"
                        editing
                        value={stockAdjustment.delta}
                        onChange={(value) => setStockAdjustment((prev) => ({ ...prev, delta: value }))}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleManualAdjustment(p, stockAdjustment.delta, stockAdjustment.reason);
                        setStockAdjustment({ delta: 0, reason: 'Inventaire' });
                      }}
                      className={`${footBtn} mt-3 w-full bg-[var(--m3-primary)] text-[var(--m3-on-primary)]`}
                    >
                      <M3StateLayer />
                      <PackagePlus size={18} />
                      Enregistrer la correction
                    </button>
                  </section>

                  <section>
                    <h3 className={sectionTitle}>Tendance</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {(() => {
                        const daysLeft = productSummaries[p.id]?.daysLeft;
                        return [
                          ['7 jours', `${productSummaries[p.id]?.sales7 ?? 0}`],
                          ['30 jours', `${productSummaries[p.id]?.sales30 ?? 0}`],
                          ['≈ jours stock', daysLeft != null ? `${daysLeft.toFixed(1)} j` : '—'],
                        ];
                      })().map(([label, value]) => (
                        <div key={label} className="rounded-2xl bg-[var(--m3-surface-container)] px-3 py-2.5 text-center">
                          <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--m3-on-surface-variant)]">{label}</div>
                          <div className="mt-1 text-sm font-semibold tabular-nums">{value}</div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3 className={sectionTitle}>Historique produit</h3>
                    <div className="space-y-2 rounded-[20px] bg-[var(--m3-surface-container)] p-3">
                      {(productHistoryById[p.id] ?? []).slice(0, 5).map((entry) => (
                        <div key={entry.id} className="flex items-center justify-between gap-2 rounded-2xl bg-[var(--m3-surface)] px-2.5 py-2 text-xs">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-[var(--m3-on-surface)]">{entry.note}</div>
                            <div className="text-[var(--m3-on-surface-variant)]">{entry.kind === 'sale' ? 'Vente' : entry.kind === 'purchase' ? 'Achat' : entry.kind === 'restock' ? 'Réappro.' : entry.kind === 'manual' ? 'Correction' : 'Mouvement'} · {entry.date.toLocaleDateString('fr-FR')}</div>
                          </div>
                          <div className={`tabular-nums font-semibold ${entry.kind === 'sale' ? 'text-[#BA1A1A]' : 'text-[#2F6B4F]'}`}>
                            {entry.kind === 'sale' ? '-' : '+'}{entry.qty}
                          </div>
                        </div>
                      ))}
                      {!(productHistoryById[p.id] ?? []).length && (
                        <div className="text-xs text-[var(--m3-on-surface-variant)]">Aucun mouvement historique pour ce produit.</div>
                      )}
                    </div>
                  </section>

                  <section>
                    <h3 className={sectionTitle}>Stock ({p.unite})</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <ProductNumberField label="Ouverture" editing value={p.stockOuverture} onChange={(value) => onUpdateProduct(p.id, { stockOuverture: value })} />
                      <ProductNumberField label="Fermeture" editing value={p.stockFermeture} onChange={(value) => onUpdateProduct(p.id, { stockFermeture: value })} />
                      <ProductNumberField label="Seuil d'alerte" tone="yellow" editing value={p.seuil} onChange={(value) => onUpdateProduct(p.id, { seuil: value })} />
                      <ProductNumberField
                        label="Ajout stock"
                        tone="green"
                        placeholder="Qté"
                        editing
                        autoFocus={drawerFocus === 'restock'}
                        value={restockByProduct[p.id] ?? 0}
                        onChange={(value) => setRestockByProduct((prev) => ({ ...prev, [p.id]: value }))}
                      />
                    </div>
                    <p className="mt-2 text-xs text-[var(--m3-on-surface-variant)]">
                      Les champs s'appliquent immédiatement. « Ajout stock » est ajouté au stock actuel quand vous cliquez sur Enregistrer.
                    </p>
                  </section>
                </div>

                <div className="flex shrink-0 items-center gap-2 border-t border-[var(--m3-outline-variant)] px-6 py-4">
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Supprimer « ${p.nom} » ?`)) {
                        setDrawerId(null);
                        onDeleteProduct(p);
                      }
                    }}
                    className={`${footBtn} -ml-2 text-[#BA1A1A]`}
                  >
                    <M3StateLayer />
                    <Trash2 size={18} />
                    Supprimer
                  </button>
                  <div className="flex-1" />
                  <button type="button" onClick={() => setDrawerId(null)} className={`${footBtn} border border-[var(--m3-outline)] text-[var(--m3-primary)]`}>
                    <M3StateLayer />
                    Fermer
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={async () => {
                      await handleSaveClick(p.id);
                      setDrawerId(null);
                    }}
                    className={`${footBtn} bg-[var(--m3-primary)] text-[var(--m3-on-primary)] ${saving ? 'cursor-wait opacity-80' : ''}`}
                  >
                    <M3StateLayer />
                    {saving ? <M3Loading size={18} /> : <Check size={18} />}
                    {saving ? 'Envoi…' : 'Enregistrer'}
                  </button>
                </div>
              </aside>
            </>,
            document.body
          );
        })()}

      {addProductOpen && createPortal(
        <>
          <div aria-hidden="true" onClick={() => setAddProductOpen(false)} className="fixed inset-0 z-[80] bg-black/40" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ajouter un produit"
            style={M3_VARS}
            className="m3-dialog fixed left-1/2 top-1/2 z-[81] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-[28px] bg-[var(--m3-surface-container-low)] p-5 text-[var(--m3-on-surface)] shadow-[0_24px_50px_rgba(0,0,0,0.2)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--m3-on-surface-variant)]">Inventaire</div>
                <h3 className="mt-1 text-[24px] leading-8">Ajouter un produit</h3>
              </div>
              <button type="button" onClick={() => setAddProductOpen(false)} className={`group relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}>
                <M3StateLayer />
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <M3TextField label="Nom du produit" value={addProductDraft.nom} placeholder="Ex: Ciment gris 50kg" onChange={(value) => setAddProductDraft((prev) => ({ ...prev, nom: value }))} />
              <div className="grid grid-cols-2 gap-2">
                <label className="block min-w-0 rounded-xl bg-[var(--m3-surface)] px-4 pb-1.5 pt-2 ring-1 ring-[var(--m3-outline)] focus-within:ring-2 focus-within:ring-[var(--m3-primary)]">
                  <span className="block text-xs leading-4 text-[var(--m3-on-surface-variant)]">Catégorie</span>
                  <select value={addProductDraft.categorie} onChange={(event) => setAddProductDraft((prev) => ({ ...prev, categorie: event.target.value }))} className="h-8 w-full min-w-0 bg-transparent p-0 text-base text-[var(--m3-on-surface)] outline-none">
                    {['Autre', ...presentCategories.filter((c) => c !== 'Tout')].map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </label>
                <M3TextField label="Unité" value={addProductDraft.unite} placeholder="Ex: sac" onChange={(value) => setAddProductDraft((prev) => ({ ...prev, unite: value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ProductNumberField label="Prix vente" tone="green" decimal editing value={addProductDraft.prix} onChange={(value) => setAddProductDraft((prev) => ({ ...prev, prix: value }))} />
                <ProductNumberField label="Prix achat" tone="steel" decimal editing value={addProductDraft.prixAchat} onChange={(value) => setAddProductDraft((prev) => ({ ...prev, prixAchat: value }))} />
                <ProductNumberField label="Stock initial" editing value={addProductDraft.stockFermeture} onChange={(value) => setAddProductDraft((prev) => ({ ...prev, stockFermeture: value }))} />
                <ProductNumberField label="Seuil" tone="yellow" editing value={addProductDraft.seuil} onChange={(value) => setAddProductDraft((prev) => ({ ...prev, seuil: value }))} />
              </div>
            </div>

            {addProductError && <div className="mt-3 rounded-2xl bg-[#FFDAD6] px-3 py-2 text-sm text-[#410002]">{addProductError}</div>}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
              <button type="button" onClick={() => setAddProductOpen(false)} className={`group relative h-12 flex-1 overflow-hidden rounded-full bg-[var(--m3-secondary-container)] text-sm font-semibold text-[var(--m3-on-secondary-container)] ${M3_FOCUS}`}>
                <M3StateLayer />
                Annuler
              </button>
              <button type="button" onClick={submitNewProduct} className={`group relative h-12 flex-1 overflow-hidden rounded-full bg-[var(--m3-primary)] text-sm font-semibold text-[var(--m3-on-primary)] ${M3_FOCUS}`}>
                <M3StateLayer />
                Créer le produit
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
type SalesRangeId = 'day' | '7d' | 'month' | 'custom';

const salesStartOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const salesAddDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const toDateInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromDateInput = (value: string) => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/* `sales` = toutes les ventes de la succursale ; la période affichée est calculée ici,
   ancrée sur la date choisie dans le sélecteur de date de l'en-tête. */
function BranchSalesSection({
  sales: allSales,
  products,
  showMargin = true,
  selectedDate,
  onCancelSale,
}: {
  sales: SaleRecord[];
  products: Product[];
  /** Affiche la marge brute (prix de vente net − prix d'achat). */
  showMargin?: boolean;
  selectedDate: Date;
  onCancelSale: (sale: SaleRecord) => void;
}) {
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [rangeId, setRangeId] = useState<SalesRangeId>('day');
  const [customFrom, setCustomFrom] = useState(() => toDateInput(salesAddDays(selectedDate, -6)));
  const [customTo, setCustomTo] = useState(() => toDateInput(selectedDate));

  const { rangeStart, rangeEnd } = useMemo(() => {
    const day = salesStartOfDay(selectedDate);
    if (rangeId === 'day') return { rangeStart: day, rangeEnd: day };
    if (rangeId === '7d') return { rangeStart: salesAddDays(day, -6), rangeEnd: day };
    if (rangeId === 'month') {
      return {
        rangeStart: new Date(day.getFullYear(), day.getMonth(), 1),
        rangeEnd: new Date(day.getFullYear(), day.getMonth() + 1, 0),
      };
    }
    let a = customFrom ? fromDateInput(customFrom) : day;
    let b = customTo ? fromDateInput(customTo) : a;
    if (a.getTime() > b.getTime()) [a, b] = [b, a];
    return { rangeStart: a, rangeEnd: b };
  }, [rangeId, selectedDate, customFrom, customTo]);

  const multiDay = !isSameDay(rangeStart, rangeEnd);
  const sales = useMemo(() => {
    const from = rangeStart.getTime();
    const to = salesAddDays(rangeEnd, 1).getTime();
    return allSales.filter((v) => v.date.getTime() >= from && v.date.getTime() < to);
  }, [allSales, rangeStart, rangeEnd]);

  const isSelectedToday = isSameDay(selectedDate, new Date());
  const rangeOptions: Array<{ id: SalesRangeId; label: string }> = [
    { id: 'day', label: isSelectedToday ? "Aujourd'hui" : 'Ce jour' },
    { id: '7d', label: '7 jours' },
    { id: 'month', label: 'Ce mois' },
    { id: 'custom', label: 'Personnalisé' },
  ];
  const shortDate = (d: Date, withYear = false) =>
    d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
  const rangeLabel = multiDay
    ? `${shortDate(rangeStart, rangeStart.getFullYear() !== rangeEnd.getFullYear())} – ${shortDate(rangeEnd, true)}`
    : selectedDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const [receiptSale, setReceiptSale] = useState<SaleRecord | null>(null);
  const [saleToCancel, setSaleToCancel] = useState<{ sale: SaleRecord; number: number } | null>(null);

  const paymentLabel = (id: string) => PAYMENT_METHODS.find((m) => m.id === id)?.label || id;
  const qtyOf = (sale: SaleRecord) => sale.lignes.reduce((n, l) => n + l.qte, 0);

  /* Marge brute d'une vente = total net (remise déduite) − Σ prix d'achat × quantité.
     Le coût figé sur la ligne (cout) est prioritaire ; sinon on retombe sur le prix d'achat actuel du produit.
     Un prix d'achat absent ou à 0 rend la marge inconnue plutôt que de la gonfler. */
  const unitCost = (l: SaleLine): number | null => {
    const unit = l.cout ?? products.find((p) => (l.produitId ? p.id === l.produitId : p.nom === l.nom))?.prixAchat;
    return unit != null && unit > 0 ? unit : null;
  };
  const marginOf = (sale: SaleRecord): { margin: number; pct: number | null } | null => {
    let cost = 0;
    for (const l of sale.lignes) {
      const unit = unitCost(l);
      if (unit == null) return null;
      cost += unit * l.qte;
    }
    const margin = sale.total - cost;
    return { margin, pct: sale.total > 0 ? (margin / sale.total) * 100 : null };
  };
  const fmtPct = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString('fr-FR')} %`;
  const fmtSigned = (n: number) => `${n < 0 ? '− ' : ''}${fmtHTG(Math.abs(n))}`;
  const marginTone = (n: number) => (n < 0 ? 'text-[#BA1A1A]' : 'text-[#2F6B4F]');

  // Number sales chronologically within each day (1 = first sale of that day), then show newest first.
  const numbered = useMemo(() => {
    const counters = new Map<string, number>();
    return [...sales]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((sale) => {
        const key = dayKey(sale.date);
        const number = (counters.get(key) ?? 0) + 1;
        counters.set(key, number);
        return { sale, number };
      })
      .reverse();
  }, [sales]);

  const query = search.trim().toLowerCase();
  const rows = numbered.filter(({ sale, number }) => {
    if (paymentFilter !== 'all' && sale.paiement !== paymentFilter) return false;
    if (!query) return true;
    const haystack = [
      String(number),
      fmtTime12(sale.date),
      paymentLabel(sale.paiement),
      sale.client ?? '',
      sale.statut === 'annulee' ? 'annulée annulee' : 'validée validee',
      String(sale.total),
      (sale.remise ?? 0) > 0 ? `remise ${sale.remise}` : '',
      ...sale.lignes.map((l) => l.nom),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });

  const countedRows = rows.filter(({ sale }) => sale.statut !== 'annulee');
  const totalQty = countedRows.reduce((sum, { sale }) => sum + qtyOf(sale), 0);
  const totalAmount = countedRows.reduce((sum, { sale }) => sum + sale.total, 0);
  const totalDiscount = countedRows.reduce((sum, { sale }) => sum + (sale.remise ?? 0), 0);
  const isFiltering = query !== '' || paymentFilter !== 'all';

  let totalMargin = 0;
  let marginBase = 0;
  let marginUnknown = 0;
  const dayStats = new Map<string, { count: number; total: number; margin: number; hasMargin: boolean }>();
  countedRows.forEach(({ sale }) => {
    const key = dayKey(sale.date);
    const cur = dayStats.get(key) ?? { count: 0, total: 0, margin: 0, hasMargin: false };
    const m = marginOf(sale);
    if (m) {
      totalMargin += m.margin;
      marginBase += sale.total;
    } else {
      marginUnknown += 1;
    }
    dayStats.set(key, {
      count: cur.count + 1,
      total: cur.total + sale.total,
      margin: cur.margin + (m?.margin ?? 0),
      hasMargin: cur.hasMargin || m != null,
    });
  });
  const marginPct = marginBase > 0 ? (totalMargin / marginBase) * 100 : null;
  const colCount = showMargin ? 11 : 10;
  const isFirstOfDay = (index: number) =>
    multiDay && (index === 0 || dayKey(rows[index - 1].sale.date) !== dayKey(rows[index].sale.date));
  const dayTitle = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const emptyText = multiDay ? 'Aucune vente pour cette période.' : 'Aucune vente pour cette date.';
  const totalLabel = isFiltering ? 'Total (résultats)' : multiDay ? 'Total de la période' : 'Total du jour';

  const printSale = (sale: SaleRecord) => {
    setReceiptSale(sale);
    window.setTimeout(() => window.print(), 150);
  };

  const paymentIcon = (id: string) => PAYMENT_METHODS.find((m) => m.id === id)?.icon ?? Banknote;
  const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? 's' : ''}`;

  const deskIconBtn = `group relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] disabled:cursor-not-allowed ${M3_FOCUS}`;

  return (
    <div
      style={M3_VARS}
      className="-mx-4 -mb-5 min-h-[calc(100dvh-8rem)] bg-[var(--m3-surface)] px-4 pb-8 pt-4 font-sans text-[var(--m3-on-surface)] sm:mx-0 sm:mb-0 sm:min-h-0 sm:bg-transparent sm:p-0"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-5">
        <div className="min-w-0">
          <h2 className="text-[32px] font-bold leading-10 tracking-tight">Ventes</h2>
          <div className="text-sm capitalize text-[var(--m3-on-surface-variant)]">{rangeLabel}</div>
        </div>
        <span className="hidden h-8 items-center rounded-full bg-[var(--m3-secondary-container)] px-3.5 text-sm font-medium tabular-nums text-[var(--m3-on-secondary-container)] sm:inline-flex" aria-live="polite">
          {plural(rows.length, 'vente')}
        </span>
      </div>

      {/* ── Période : Aujourd'hui / 7 jours / Ce mois / Personnalisé ── */}
      <div className="mb-4 space-y-3 sm:mb-5">
        <div
          role="group"
          aria-label="Choisir la période"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {rangeOptions.map((option) => {
            const selected = rangeId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setRangeId(option.id)}
                className={`group relative shrink-0 before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] ${M3_FOCUS}`}
              >
                <span
                  className={`relative flex h-10 items-center gap-2 overflow-hidden px-4 text-sm font-medium m3-morph ${
                    selected ? 'rounded-full' : 'rounded-xl'
                  } ${
                    selected
                      ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
                      : 'border border-[var(--m3-outline)] text-[var(--m3-on-surface-variant)]'
                  }`}
                >
                  <M3StateLayer />
                  {selected ? <Check size={16} /> : option.id === 'custom' ? <CalendarDays size={16} /> : null}
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>

        {rangeId === 'custom' && (
          <div className="m3-in flex flex-wrap items-center gap-3">
            {[
              { id: 'sales-from', label: 'Du', value: customFrom, set: setCustomFrom, max: customTo || undefined, min: undefined as string | undefined },
              { id: 'sales-to', label: 'Au', value: customTo, set: setCustomTo, min: customFrom || undefined, max: undefined as string | undefined },
            ].map((field) => (
              <label
                key={field.id}
                htmlFor={field.id}
                className="flex h-12 min-w-[160px] flex-1 items-center gap-3 rounded-full bg-[var(--m3-surface-container-high)] px-4 text-sm text-[var(--m3-on-surface-variant)] focus-within:ring-2 focus-within:ring-[var(--m3-primary)] sm:max-w-[240px]"
              >
                <span className="shrink-0 font-medium">{field.label}</span>
                <input
                  id={field.id}
                  type="date"
                  value={field.value}
                  min={field.min}
                  max={field.max}
                  onChange={(event) => field.set(event.target.value)}
                  className="w-full min-w-0 border-none bg-transparent text-base text-[var(--m3-on-surface)] outline-none sm:text-sm"
                />
              </label>
            ))}
          </div>
        )}
      </div>

      {/* ── Phone (M3 Expressive): summary hero, search, payment chips, sale cards ── */}
      <section
        aria-label="Résumé des ventes"
        className="m3-in mb-4 overflow-hidden rounded-[32px] bg-[var(--m3-primary-container)] p-5 text-[var(--m3-on-primary-container)] sm:hidden"
      >
        <div className="text-sm font-medium opacity-80">{totalLabel}</div>
        <div className="mt-1 text-[40px] font-bold leading-[48px] tracking-tight tabular-nums">{fmtHTG(totalAmount)}</div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-[var(--m3-primary)] px-3.5 py-1.5 text-xs font-semibold text-[var(--m3-on-primary)]">
            {plural(countedRows.length, 'vente')}
          </span>
          <span className="rounded-full bg-[var(--m3-surface-container-lowest)] px-3.5 py-1.5 text-xs font-semibold text-[var(--m3-on-surface)]">
            {plural(totalQty, 'article')}
          </span>
          {showMargin && marginBase > 0 && (
            <span className="rounded-full bg-[#D7EBDD] px-3.5 py-1.5 text-xs font-semibold text-[#0F2E1C]">
              Marge {fmtSigned(totalMargin)}
              {marginPct != null ? ` · ${fmtPct(marginPct)}` : ''}
            </span>
          )}
          {totalDiscount > 0 && (
            <span className="rounded-full bg-[var(--m3-tertiary-container)] px-3.5 py-1.5 text-xs font-semibold text-[var(--m3-on-tertiary-container)]">
              Remises − {fmtHTG(totalDiscount)}
            </span>
          )}
          {rows.length > countedRows.length && (
            <span className="rounded-full bg-[#FFDAD6] px-3.5 py-1.5 text-xs font-semibold text-[#410002]">
              {rows.length - countedRows.length} annulée{rows.length - countedRows.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </section>

      <div className="mb-3 flex h-14 items-center gap-3 rounded-full bg-[var(--m3-surface-container-high)] px-4 focus-within:ring-2 focus-within:ring-[var(--m3-primary)] sm:hidden">
        <Search className="h-6 w-6 shrink-0 text-[var(--m3-on-surface-variant)]" />
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher une vente..."
          aria-label="Rechercher une vente"
          className="w-full min-w-0 border-none bg-transparent text-base text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)]"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="Effacer la recherche"
            className={`group relative -mr-2 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}
          >
            <M3StateLayer />
            <X size={20} />
          </button>
        )}
      </div>

      <div
        role="group"
        aria-label="Filtrer par mode de paiement"
        className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden"
      >
        {[{ id: 'all', label: 'Tous', icon: null as LucideIcon | null }, ...PAYMENT_METHODS].map((method) => {
          const selected = paymentFilter === method.id;
          const Icon = method.icon;
          return (
            <button
              key={method.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setPaymentFilter(method.id)}
              className={`group relative shrink-0 before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] ${M3_FOCUS}`}
            >
              <span
                className={`relative flex h-10 items-center gap-2 overflow-hidden px-4 text-sm font-medium m3-morph ${
                  selected ? 'rounded-full' : 'rounded-xl'
                } ${
                  selected
                    ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
                    : 'border border-[var(--m3-outline)] text-[var(--m3-on-surface-variant)]'
                }`}
              >
                <M3StateLayer />
                {selected ? <Check size={16} /> : Icon ? <Icon size={16} /> : null}
                {method.label}
              </span>
            </button>
          );
        })}
      </div>

      <ul className="space-y-3 sm:hidden" aria-label="Liste des ventes">
        {rows.map(({ sale, number }, rowIndex) => {
          const cancelled = sale.statut === 'annulee';
          const PayIcon = paymentIcon(sale.paiement);
          const discount = sale.remise ?? 0;
          const pct = discount > 0 ? Math.round((discount / (sale.total + discount)) * 1000) / 10 : 0;
          const dayHeader = isFirstOfDay(rowIndex) ? dayStats.get(dayKey(sale.date)) ?? { count: 0, total: 0, margin: 0, hasMargin: false } : null;
          const saleMargin = showMargin ? marginOf(sale) : null;
          return (
            <Fragment key={sale.id}>
              {dayHeader && (
                <li className="flex items-baseline justify-between gap-3 px-2 pt-2" aria-label={`Ventes du ${dayTitle(sale.date)}`}>
                  <span className="text-sm font-semibold capitalize text-[var(--m3-on-surface)]">{dayTitle(sale.date)}</span>
                  <span className="text-xs tabular-nums text-[var(--m3-on-surface-variant)]">
                    {plural(dayHeader.count, 'vente')} · {fmtHTG(dayHeader.total)}
                    {showMargin && dayHeader.hasMargin && ` · marge ${fmtSigned(dayHeader.margin)}`}
                  </span>
                </li>
              )}
            <li
              className={
                'm3-in overflow-hidden rounded-[28px] p-4 ' +
                (cancelled ? 'bg-[var(--m3-surface-container-low)]' : 'bg-[var(--m3-surface-container)]')
              }
            >
              <div className="flex items-start gap-3">
                <div
                  className={
                    'flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] text-base font-bold tabular-nums ' +
                    (cancelled
                      ? 'bg-[#FFDAD6] text-[#410002]'
                      : 'bg-[var(--m3-tertiary-container)] text-[var(--m3-on-tertiary-container)]')
                  }
                  aria-label={`Vente numéro ${number}`}
                >
                  {number}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold tabular-nums">{fmtTime12(sale.date)}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--m3-secondary-container)] px-2.5 py-1 text-xs font-medium text-[var(--m3-on-secondary-container)]">
                      <PayIcon size={12} />
                      {paymentLabel(sale.paiement)}
                    </span>
                    <span
                      className={
                        'rounded-full px-2.5 py-1 text-xs font-medium ' +
                        (cancelled ? 'bg-[#FFDAD6] text-[#410002]' : 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]')
                      }
                    >
                      {cancelled ? 'Annulée' : 'Validée'}
                    </span>
                  </div>
                  {sale.client && (
                    <div className="mt-1.5 flex items-center gap-1 text-xs text-[var(--m3-on-surface-variant)]">
                      <UserRound size={12} className="shrink-0" />
                      <span className="truncate">{sale.client}</span>
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className={
                      'text-xl font-bold tabular-nums ' +
                      (cancelled ? 'text-[var(--m3-on-surface-variant)] line-through' : 'text-[var(--m3-primary)]')
                    }
                  >
                    {fmtHTG(sale.total)}
                  </div>
                  {discount > 0 && (
                    <div className={'mt-0.5 text-xs font-medium tabular-nums ' + (cancelled ? 'line-through' : 'text-[var(--m3-tertiary)]')}>
                      − {fmtHTG(discount)} · {pct} %
                    </div>
                  )}
                  {saleMargin && (
                    <div
                      className={
                        'mt-0.5 text-xs font-medium tabular-nums ' +
                        (cancelled ? 'text-[var(--m3-on-surface-variant)] line-through' : marginTone(saleMargin.margin))
                      }
                    >
                      Marge {fmtSigned(saleMargin.margin)}
                      {saleMargin.pct != null ? ` · ${fmtPct(saleMargin.pct)}` : ''}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 space-y-1.5 rounded-[20px] bg-[var(--m3-surface)] p-3 text-sm">
                {sale.lignes.map((ligne, lineIndex) => (
                  <div key={lineIndex} className="flex justify-between gap-3">
                    <span className={'min-w-0 ' + (cancelled ? 'line-through' : '')}>
                      <span className="font-semibold tabular-nums text-[var(--m3-on-surface-variant)]">{ligne.qte} ×</span> {ligne.nom}
                    </span>
                    <span className="shrink-0 tabular-nums text-[var(--m3-on-surface-variant)]">{fmtHTG(ligne.sousTotal)}</span>
                  </div>
                ))}
                {sale.paiement !== 'credit' && (
                  <div className="flex justify-between gap-3 border-t border-[var(--m3-outline-variant)] pt-1.5 text-xs text-[var(--m3-on-surface-variant)]">
                    <span>Reçu {fmtHTG(sale.recu)}</span>
                    <span>Monnaie {fmtHTG(sale.monnaie)}</span>
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReceiptSale(sale)}
                  className={`group relative flex h-12 flex-1 items-center justify-center gap-2 overflow-hidden rounded-full bg-[var(--m3-secondary-container)] text-sm font-semibold text-[var(--m3-on-secondary-container)] m3-press motion-reduce:transition-none ${M3_FOCUS}`}
                >
                  <M3StateLayer />
                  <Eye size={18} />
                  Voir le reçu
                </button>
                <button
                  type="button"
                  onClick={() => printSale(sale)}
                  aria-label="Imprimer le reçu"
                  className={`group relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)] m3-press motion-reduce:transition-none ${M3_FOCUS}`}
                >
                  <M3StateLayer />
                  <Printer size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setSaleToCancel({ sale, number })}
                  disabled={cancelled}
                  aria-label="Annuler la vente"
                  className={`group relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#FFDAD6] text-[#410002] m3-press motion-reduce:transition-none disabled:opacity-40 ${M3_FOCUS}`}
                >
                  <M3StateLayer />
                  <Undo2 size={18} />
                </button>
              </div>
            </li>
            </Fragment>
          );
        })}
      </ul>

      {rows.length === 0 && (
        <div className="m3-in flex flex-col items-center rounded-[32px] bg-[var(--m3-surface-container-low)] px-6 py-12 text-center sm:hidden">
          <span className="mb-4 flex h-20 w-20 -rotate-6 items-center justify-center rounded-[32px] bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]">
            <ShoppingCart size={36} />
          </span>
          <div className="text-lg font-semibold">{isFiltering ? 'Aucun résultat' : 'Aucune vente'}</div>
          <div className="mt-1 text-sm text-[var(--m3-on-surface-variant)]">
            {isFiltering ? 'Aucune vente ne correspond à votre recherche.' : emptyText}
          </div>
        </div>
      )}

      {/* ── Desktop (≥ sm): M3 summary cards, search, payment segmented filter, tonal table ── */}
      <div className="hidden space-y-5 sm:block">
        <div className={`grid grid-cols-2 gap-3 ${showMargin ? 'lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]' : 'lg:grid-cols-[1.5fr_1fr_1fr_1fr]'}`}>
          <div className="col-span-2 flex items-center gap-4 rounded-[28px] bg-[var(--m3-primary-container)] px-6 py-5 text-[var(--m3-on-primary-container)] lg:col-span-1">
            <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/40">
              <TrendingUp size={26} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium opacity-80">{totalLabel}</div>
              <div className="break-words text-[32px] font-bold leading-9 tracking-tight tabular-nums">{fmtHTG(totalAmount)}</div>
            </div>
          </div>
          {[
            { label: 'Ventes', value: String(countedRows.length), Icon: Receipt, tone: 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]' },
            { label: 'Articles vendus', value: String(totalQty), Icon: ShoppingCart, tone: 'bg-[var(--m3-surface-container)] text-[var(--m3-on-surface)]', hint: undefined as string | undefined },
            ...(showMargin
              ? [
                  {
                    label: 'Marge brute',
                    value: marginBase > 0 ? fmtSigned(totalMargin) : '—',
                    Icon: Coins,
                    tone: 'bg-[#D7EBDD] text-[#0F2E1C]',
                    hint:
                      marginBase > 0
                        ? `${marginPct != null ? fmtPct(marginPct) + ' du total' : ''}${marginUnknown > 0 ? `${marginPct != null ? ' · ' : ''}${marginUnknown} sans prix d'achat` : ''}`
                        : marginUnknown > 0
                          ? `${marginUnknown} sans prix d'achat`
                          : undefined,
                  },
                ]
              : []),
            {
              label: 'Remises',
              value: totalDiscount > 0 ? `− ${fmtHTG(totalDiscount)}` : '—',
              Icon: Tag,
              tone: 'bg-[var(--m3-tertiary-container)] text-[var(--m3-on-tertiary-container)]',
              hint: undefined as string | undefined,
            },
          ].map(({ label, value, Icon, tone, hint }) => (
            <div key={label} className={`flex items-center gap-4 rounded-[28px] px-5 py-5 ${tone}`}>
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--m3-surface)]/60">
                <Icon size={22} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm opacity-80">{label}</div>
                <div className="truncate text-2xl font-semibold leading-8 tabular-nums">{value}</div>
                {hint && <div className="truncate text-xs opacity-80">{hint}</div>}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-12 min-w-[240px] max-w-md flex-1 items-center gap-3 rounded-full bg-[var(--m3-surface-container-high)] px-4 transition-shadow focus-within:ring-2 focus-within:ring-[var(--m3-primary)] motion-reduce:transition-none">
            <Search className="h-5 w-5 shrink-0 text-[var(--m3-on-surface-variant)]" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher une vente, un article..."
              aria-label="Rechercher une vente"
              className="w-full min-w-0 border-none bg-transparent text-sm text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Effacer la recherche"
                className={`group relative -mr-2 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}
              >
                <M3StateLayer />
                <X size={18} />
              </button>
            )}
          </div>

          <div role="group" aria-label="Filtrer par mode de paiement" className="flex flex-wrap gap-2">
            {[{ id: 'all', label: 'Tous', icon: null as LucideIcon | null }, ...PAYMENT_METHODS].map((method) => {
              const selected = paymentFilter === method.id;
              const Icon = method.icon;
              return (
                <button
                  key={method.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setPaymentFilter(method.id)}
                  className={`group relative ${M3_FOCUS}`}
                >
                  <span
                    className={`relative flex h-10 items-center gap-2 overflow-hidden px-4 text-sm font-medium m3-morph ${
                      selected ? 'rounded-full' : 'rounded-xl'
                    } ${
                      selected
                        ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
                        : 'border border-[var(--m3-outline)] text-[var(--m3-on-surface-variant)]'
                    }`}
                  >
                    <M3StateLayer />
                    {selected ? <Check size={16} /> : Icon ? <Icon size={16} /> : null}
                    {method.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] bg-[var(--m3-surface-container)]">
          <div className="max-h-[62vh] overflow-auto">
            <table className={`w-full border-collapse text-left text-sm ${showMargin ? 'min-w-[1080px]' : 'min-w-[980px]'}`}>
              <thead className="sticky top-0 z-10 bg-[var(--m3-surface-container-high)] text-xs text-[var(--m3-on-surface-variant)] shadow-[0_1px_0_var(--m3-outline-variant)]">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-medium">N°</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Heure</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Articles</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Qté</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Paiement</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Remise</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
                  {showMargin && <th scope="col" className="px-4 py-3 text-right font-medium">Marge</th>}
                  <th scope="col" className="px-4 py-3 text-right font-medium">Reçu / Monnaie</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Statut</th>
                  <th scope="col" className="w-36 px-3 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ sale, number }, rowIndex) => {
                  const cancelled = sale.statut === 'annulee';
                  const PayIcon = paymentIcon(sale.paiement);
                  const discount = sale.remise ?? 0;
                  const pct = discount > 0 ? Math.round((discount / (sale.total + discount)) * 1000) / 10 : 0;
                  const dayHeader = isFirstOfDay(rowIndex) ? dayStats.get(dayKey(sale.date)) ?? { count: 0, total: 0, margin: 0, hasMargin: false } : null;
          const saleMargin = showMargin ? marginOf(sale) : null;
                  return (
                    <Fragment key={sale.id}>
                    {dayHeader && (
                      <tr className="bg-[var(--m3-surface-container-high)]">
                        <td colSpan={colCount} className="px-4 py-2.5">
                          <div className="flex items-baseline justify-between gap-4">
                            <span className="text-sm font-semibold capitalize text-[var(--m3-on-surface)]">{dayTitle(sale.date)}</span>
                            <span className="text-xs tabular-nums text-[var(--m3-on-surface-variant)]">
                              {plural(dayHeader.count, 'vente')} · <span className="font-semibold text-[var(--m3-primary)]">{fmtHTG(dayHeader.total)}</span>
                              {showMargin && dayHeader.hasMargin && (
                                <>
                                  {' · marge '}
                                  <span className={'font-semibold ' + marginTone(dayHeader.margin)}>{fmtSigned(dayHeader.margin)}</span>
                                </>
                              )}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                    <tr
                      className={
                        'border-b border-[var(--m3-outline-variant)]/60 align-top transition-colors last:border-b-0 motion-reduce:transition-none ' +
                        (cancelled ? 'bg-[var(--m3-surface-container-low)] text-[var(--m3-on-surface-variant)]' : 'hover:bg-[var(--m3-surface-container-high)]')
                      }
                    >
                      <td className="px-4 py-3">
                        <span
                          className={
                            'flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold tabular-nums ' +
                            (cancelled ? 'bg-[#FFDAD6] text-[#410002]' : 'bg-[var(--m3-tertiary-container)] text-[var(--m3-on-tertiary-container)]')
                          }
                        >
                          {number}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">{fmtTime12(sale.date)}</td>
                      <td className="min-w-[240px] px-4 py-3">
                        <div className="space-y-0.5">
                          {sale.lignes.map((ligne, lineIndex) => (
                            <div key={lineIndex} className="flex justify-between gap-4">
                              <span className={cancelled ? 'line-through' : ''}>
                                <span className="tabular-nums text-[var(--m3-on-surface-variant)]">{ligne.qte} ×</span> {ligne.nom}
                              </span>
                              <span className="tabular-nums text-[var(--m3-on-surface-variant)]">{fmtHTG(ligne.sousTotal)}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{qtyOf(sale)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[var(--m3-secondary-container)] px-3 text-xs font-medium text-[var(--m3-on-secondary-container)]">
                          <PayIcon size={14} />
                          {paymentLabel(sale.paiement)}
                        </span>
                        {sale.client && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-[var(--m3-on-surface-variant)]">
                            <UserRound size={12} className="shrink-0" />
                            <span className="max-w-[140px] truncate">{sale.client}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {discount > 0 ? (
                          <div className={cancelled ? 'line-through' : 'text-[var(--m3-tertiary)]'}>
                            <div className="font-medium">− {fmtHTG(discount)}</div>
                            <div className="text-xs">{pct} %</div>
                          </div>
                        ) : (
                          <span className="text-[var(--m3-on-surface-variant)]">—</span>
                        )}
                      </td>
                      <td
                        className={
                          'whitespace-nowrap px-4 py-3 text-right text-base font-semibold tabular-nums ' +
                          (cancelled ? 'line-through' : 'text-[var(--m3-primary)]')
                        }
                      >
                        {fmtHTG(sale.total)}
                      </td>
                      {showMargin && (
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                          {saleMargin ? (
                            <div className={cancelled ? 'line-through' : marginTone(saleMargin.margin)}>
                              <div className="font-medium">{fmtSigned(saleMargin.margin)}</div>
                              {saleMargin.pct != null && <div className="text-xs">{fmtPct(saleMargin.pct)}</div>}
                            </div>
                          ) : (
                            <span title="Prix d'achat inconnu" className="text-[var(--m3-on-surface-variant)]">
                              —
                            </span>
                          )}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-4 py-3 text-right text-xs tabular-nums text-[var(--m3-on-surface-variant)]">
                        {sale.paiement === 'credit' ? (
                          '—'
                        ) : (
                          <>
                            <div>{fmtHTG(sale.recu)}</div>
                            <div>{fmtHTG(sale.monnaie)}</div>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            'inline-flex h-7 items-center rounded-full px-3 text-xs font-medium ' +
                            (cancelled ? 'bg-[#FFDAD6] text-[#410002]' : 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]')
                          }
                        >
                          {cancelled ? 'Annulée' : 'Validée'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" onClick={() => setReceiptSale(sale)} className={deskIconBtn} aria-label="Voir le reçu" title="Voir le reçu">
                            <M3StateLayer />
                            <Eye size={18} />
                          </button>
                          <button type="button" onClick={() => printSale(sale)} className={deskIconBtn} aria-label="Imprimer le reçu" title="Imprimer le reçu">
                            <M3StateLayer />
                            <Printer size={18} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setSaleToCancel({ sale, number })}
                            disabled={cancelled}
                            className={`${deskIconBtn} ${cancelled ? 'opacity-40' : 'text-[#BA1A1A]'}`}
                            aria-label="Annuler la vente"
                            title={cancelled ? 'Vente déjà annulée' : 'Annuler / rembourser la vente'}
                          >
                            <M3StateLayer />
                            <Undo2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    </Fragment>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={colCount} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]">
                          <ShoppingCart size={28} />
                        </span>
                        <span className="text-base font-medium">
                          {isFiltering ? 'Aucune vente ne correspond à votre recherche.' : emptyText}
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {receiptSale && <ReceiptModal sale={receiptSale} onClose={() => setReceiptSale(null)} />}

      {saleToCancel && (
        <div className="m3-scrim fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={`Annuler la vente n° ${saleToCancel.number}`}
            style={M3_VARS}
            className="m3-pop w-full max-w-sm rounded-[32px] bg-[var(--m3-surface-container-high)] p-6 text-[var(--m3-on-surface)] shadow-[0_8px_10px_-6px_rgba(0,0,0,0.2),0_16px_24px_2px_rgba(0,0,0,0.14)]"
          >
            <span className="mb-4 flex h-14 w-14 -rotate-6 items-center justify-center rounded-[20px] bg-[#FFDAD6] text-[#410002]">
              <Undo2 size={26} />
            </span>
            <div className="text-2xl font-bold leading-8">Annuler la vente n° {saleToCancel.number} ?</div>
            <p className="mt-3 text-sm leading-5 text-[var(--m3-on-surface-variant)]">
              {fmtHTG(saleToCancel.sale.total)} • {qtyOf(saleToCancel.sale)} article{qtyOf(saleToCancel.sale) !== 1 ? 's' : ''}.
              Le stock sera remis en inventaire et la vente ne comptera plus dans les totaux.
            </p>
            {saleToCancel.sale.paiement === 'credit' && creditPaid(saleToCancel.sale) > 0 && (
              <p className="mt-3 rounded-2xl bg-[var(--m3-tertiary-container)] px-4 py-3 text-sm text-[var(--m3-on-tertiary-container)]">
                {fmtHTG(creditPaid(saleToCancel.sale))} ont déjà été payés sur ce crédit : pensez à les rembourser au client.
              </p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
              <button
                onClick={() => setSaleToCancel(null)}
                className={`group relative h-12 flex-1 overflow-hidden rounded-full bg-[var(--m3-secondary-container)] text-sm font-semibold text-[var(--m3-on-secondary-container)] m3-press motion-reduce:transition-none ${M3_FOCUS}`}
              >
                <M3StateLayer />
                Retour
              </button>
              <button
                onClick={() => {
                  onCancelSale(saleToCancel.sale);
                  setSaleToCancel(null);
                }}
                className={`group relative h-12 flex-1 overflow-hidden rounded-full bg-[#BA1A1A] text-sm font-semibold text-white m3-press motion-reduce:transition-none ${M3_FOCUS}`}
              >
                <M3StateLayer />
                Annuler la vente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   ACHATS — everything the company buys in order to sell.
   Recording a purchase adds the quantities to stock and updates the product's cost price;
   cancelling one takes the quantities back out.
   ========================================================================= */
const PURCHASE_PAYMENTS: Array<{ id: PaymentMethodId; label: string; icon: typeof Banknote }> = [
  { id: 'especes', label: 'Espèces', icon: Banknote },
  { id: 'moncash', label: 'MonCash', icon: Smartphone },
  { id: 'natcash', label: 'NatCash', icon: Smartphone },
  { id: 'credit', label: 'Crédit fournisseur', icon: FileClock },
];

const MOCK_SUPPLIERS: Record<string, string[]> = {
  'gros-morne': ['Quincaillerie Nationale', 'Ciment Maya', 'Acier Haïti SA'],
  'saint-marc': ['Ciment Maya', 'Distribution Artibonite', 'Plomberie Express'],
  'majuin': ['Brasserie Nationale', 'Import Caraïbes', 'Grossiste Delmas'],
  'oreste': ['Électro Plus', 'Acier Haïti SA', 'Plomberie Express'],
};

function buildMockPurchases(): PurchaseRecord[] {
  let seed = 20260930;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const now = new Date();
  const out: PurchaseRecord[] = [];

  Object.entries(BRANCH_INVENTORY_SEED).forEach(([branchId, productIds]) => {
    const branchProducts = INITIAL_PRODUCTS.filter((p) => productIds.includes(p.id));
    const suppliers = MOCK_SUPPLIERS[branchId] ?? ['Fournisseur'];
    let daysAgo = randInt(0, 3);
    while (daysAgo < MOCK_HISTORY_DAYS) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 7 + randInt(0, 6), randInt(0, 59));
      if (date.getTime() <= now.getTime()) {
        const chosen = [...branchProducts].sort(() => rand() - 0.5).slice(0, randInt(1, 3));
        const lignes: PurchaseLine[] = chosen.map((p) => {
          const qte = p.prixAchat < 150 ? randInt(60, 300) : randInt(10, 60);
          return { produitId: p.id, nom: p.nom, unite: p.unite, qte, coutUnitaire: p.prixAchat, sousTotal: qte * p.prixAchat };
        });
        const pool: PaymentMethodId[] = ['especes', 'especes', 'moncash', 'natcash', 'credit'];
        out.push({
          id: `A${date.getTime()}-${out.length}`,
          branchId,
          date,
          fournisseur: suppliers[randInt(0, suppliers.length - 1)],
          reference: rand() < 0.6 ? `FAC-${randInt(1000, 9999)}` : undefined,
          lignes,
          total: lignes.reduce((s, l) => s + l.sousTotal, 0),
          paiement: pool[randInt(0, pool.length - 1)],
        });
      }
      daysAgo += randInt(3, 9);
    }
  });
  return out.sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** Adds (sign = 1) or removes (sign = -1) the purchased quantities from stock. */
function applyPurchaseToProducts(products: Product[], lignes: PurchaseLine[], sign: 1 | -1, updateCost: boolean): Product[] {
  return products.map((product) => {
    const mine = lignes.filter((l) => l.produitId === product.id);
    if (mine.length === 0) return product;
    const qty = mine.reduce((n, l) => n + l.qte, 0);
    return {
      ...product,
      stockFermeture: Math.max(product.stockFermeture + sign * qty, 0),
      prixAchat: updateCost && sign === 1 ? mine[mine.length - 1].coutUnitaire : product.prixAchat,
    };
  });
}

function PurchaseSheet({
  products,
  suppliers,
  defaultDate,
  onAdd,
  onClose,
}: {
  products: Product[];
  suppliers: string[];
  defaultDate: Date;
  onAdd: (purchase: Omit<PurchaseRecord, 'id' | 'branchId'>) => void;
  onClose: () => void;
}) {
  type DraftLine = { key: number; produitId: string; qte: string; cout: string };
  const [fournisseur, setFournisseur] = useState('');
  const [reference, setReference] = useState('');
  const [paiement, setPaiement] = useState<PaymentMethodId>('especes');
  const [note, setNote] = useState('');
  const [dateStr, setDateStr] = useState(() => {
    const d = defaultDate;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [lines, setLines] = useState<DraftLine[]>([{ key: 1, produitId: '', qte: '', cout: '' }]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const patchLine = (key: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pickProduct = (key: number, produitId: string) => {
    const product = products.find((p) => p.id === produitId);
    patchLine(key, { produitId, cout: product ? String(product.prixAchat) : '' });
  };

  const parsed = lines.map((l) => ({ ...l, q: Number(l.qte), c: Number(l.cout) }));
  const lineValid = (l: (typeof parsed)[number]) => l.produitId !== '' && l.q > 0 && Number.isFinite(l.c) && l.c >= 0 && l.cout !== '';
  const total = parsed.filter(lineValid).reduce((s, l) => s + l.q * l.c, 0);
  const valid = fournisseur.trim() !== '' && parsed.length > 0 && parsed.every(lineValid);

  const submit = () => {
    if (!valid) return;
    const [y, m, d] = dateStr.split('-').map(Number);
    const when = new Date();
    if (y && m && d) when.setFullYear(y, m - 1, d);
    const lignes: PurchaseLine[] = parsed.map((l) => {
      const product = products.find((p) => p.id === l.produitId)!;
      return { produitId: product.id, nom: product.nom, unite: product.unite, qte: l.q, coutUnitaire: l.c, sousTotal: l.q * l.c };
    });
    onAdd({
      date: when,
      fournisseur: fournisseur.trim(),
      reference: reference.trim() || undefined,
      note: note.trim() || undefined,
      paiement,
      lignes,
      total: lignes.reduce((s, l) => s + l.sousTotal, 0),
    });
    onClose();
  };

  const field =
    'block min-w-0 rounded-xl bg-[var(--m3-surface)] px-4 pb-1.5 pt-2 ring-1 ring-[var(--m3-outline)] transition-shadow focus-within:ring-2 focus-within:ring-[var(--m3-primary)] motion-reduce:transition-none';
  const input = 'h-8 w-full min-w-0 bg-transparent p-0 text-base text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)]';
  const label = 'block text-xs leading-4 text-[var(--m3-on-surface-variant)]';

  return createPortal(
    <>
      <div aria-hidden="true" onClick={onClose} className="m3-scrim fixed inset-0 z-[80] bg-black/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nouvel achat"
        style={M3_VARS}
        className="m3-sheet fixed inset-x-0 bottom-0 z-[81] max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-[var(--m3-surface-container-low)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 text-[var(--m3-on-surface)] shadow-[0_-8px_24px_rgba(0,0,0,0.16)] sm:inset-x-auto sm:inset-y-0 sm:bottom-auto sm:right-0 sm:h-full sm:max-h-none sm:w-[520px] sm:max-w-full sm:rounded-l-[28px] sm:rounded-tr-none sm:px-6 sm:pt-6 sm:shadow-[-8px_0_24px_rgba(0,0,0,0.16)] sm:[animation:m3-side-in_.4s_var(--m3-spring-effects)]"
      >
        <div className="mx-auto mb-3 mt-1 h-1 w-8 rounded-full bg-[var(--m3-outline-variant)] sm:hidden" />
        <div className="px-2 pb-3">
          <div className="text-xs font-medium text-[var(--m3-on-surface-variant)]">Achats</div>
          <div className="mt-1 text-[24px] font-normal leading-8">Nouvel achat</div>
        </div>

        <div className="space-y-2">
          <label className={field}>
            <span className={label}>Fournisseur</span>
            <input
              type="text"
              list="achats-fournisseurs"
              value={fournisseur}
              onChange={(e) => setFournisseur(e.target.value)}
              className={input}
              autoComplete="off"
            />
            <datalist id="achats-fournisseurs">
              {suppliers.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={field}>
              <span className={label}>Date</span>
              <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} className={input} />
            </label>
            <label className={field}>
              <span className={label}>N° facture (optionnel)</span>
              <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} className={input} />
            </label>
          </div>
        </div>

        <div className="mt-4 px-2 text-sm font-medium">Articles achetés</div>
        <div className="mt-2 space-y-2">
          {parsed.map((l, index) => {
            const product = products.find((p) => p.id === l.produitId);
            return (
              <div key={l.key} className="space-y-2 rounded-[20px] bg-[var(--m3-surface-container)] p-3">
                <div className="flex items-start gap-2">
                  <label className={field + ' flex-1'}>
                    <span className={label}>Produit</span>
                    <select value={l.produitId} onChange={(e) => pickProduct(l.key, e.target.value)} className={input}>
                      <option value="">Choisir…</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nom}
                        </option>
                      ))}
                    </select>
                  </label>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                      aria-label={`Retirer la ligne ${index + 1}`}
                      className={`group relative mt-1 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}
                    >
                      <M3StateLayer />
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className={field}>
                    <span className={label}>Quantité{product ? ` (${product.unite})` : ''}</span>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={l.qte}
                      onChange={(e) => patchLine(l.key, { qte: e.target.value })}
                      className={input + ' tabular-nums'}
                    />
                  </label>
                  <label className={field}>
                    <span className={label}>Coût unitaire (HTG)</span>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={l.cout}
                      onChange={(e) => patchLine(l.key, { cout: e.target.value })}
                      className={input + ' tabular-nums'}
                    />
                  </label>
                </div>
                {lineValid(l) && (
                  <div className="px-1 text-right text-sm tabular-nums text-[var(--m3-on-surface-variant)]">
                    Sous-total <span className="font-semibold text-[var(--m3-on-surface)]">{fmtHTG(l.q * l.c)}</span>
                  </div>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setLines((prev) => [...prev, { key: Math.max(...prev.map((x) => x.key)) + 1, produitId: '', qte: '', cout: '' }])}
            className={`group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-full border border-[var(--m3-outline)] text-sm font-medium text-[var(--m3-primary)] m3-press motion-reduce:transition-none ${M3_FOCUS}`}
          >
            <M3StateLayer />
            <Plus size={18} /> Ajouter un article
          </button>
        </div>

        <div className="mt-4 px-2 text-sm font-medium">Paiement</div>
        <div role="group" aria-label="Mode de paiement" className="mt-2 grid grid-cols-2 gap-2">
          {PURCHASE_PAYMENTS.map((m) => {
            const selected = paiement === m.id;
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setPaiement(m.id)}
                className={
                  'flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-medium m3-press motion-reduce:transition-none ' +
                  M3_FOCUS +
                  ' ' +
                  (selected
                    ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
                    : 'border border-[var(--m3-outline)] text-[var(--m3-on-surface-variant)]')
                }
              >
                {selected ? <Check size={16} className="shrink-0" /> : <Icon size={16} className="shrink-0" />}
                <span className="truncate">{m.label}</span>
              </button>
            );
          })}
        </div>

        <label className={field + ' mt-3'}>
          <span className={label}>Note (optionnel)</span>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={input} />
        </label>

        <div className="mt-4 flex items-baseline justify-between rounded-[20px] bg-[var(--m3-primary-container)] px-5 py-3 text-[var(--m3-on-primary-container)]">
          <span className="text-sm font-medium">Total de l'achat</span>
          <span className="text-2xl font-bold tabular-nums">{fmtHTG(total)}</span>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className={`h-12 shrink-0 rounded-full px-6 text-sm font-medium text-[var(--m3-primary)] active:bg-[var(--m3-surface-container-highest)] ${M3_FOCUS}`}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid}
            className={
              `group relative flex h-12 flex-1 items-center justify-center gap-2 overflow-hidden rounded-full text-sm font-medium m3-press motion-reduce:transition-none ${M3_FOCUS} ` +
              (valid
                ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]'
                : 'cursor-not-allowed bg-[var(--m3-surface-container-highest)] text-[var(--m3-outline)]')
            }
          >
            {valid && <M3StateLayer />}
            <Check size={18} /> Enregistrer l'achat
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

function BranchPurchasesSection({
  branchProducts,
  purchases,
  selectedDate,
  onAdd,
  onCancel,
}: {
  branchProducts: Product[];
  purchases: PurchaseRecord[];
  selectedDate: Date;
  onAdd: (purchase: Omit<PurchaseRecord, 'id' | 'branchId'>) => void;
  onCancel: (purchase: PurchaseRecord) => void;
}) {
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<'day' | 'month' | 'all'>('month');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toCancel, setToCancel] = useState<PurchaseRecord | null>(null);

  const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? 's' : ''}`;
  const paymentMeta = (id: string) => PURCHASE_PAYMENTS.find((m) => m.id === id);
  const qtyOf = (p: PurchaseRecord) => p.lignes.reduce((n, l) => n + l.qte, 0);
  const fmtDate = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

  const periodLabel =
    period === 'day'
      ? selectedDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : period === 'month'
        ? selectedDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
        : 'Tout l’historique';

  const suppliers = useMemo(() => Array.from(new Set(purchases.map((p) => p.fournisseur))).sort(), [purchases]);

  const query = search.trim().toLowerCase();
  const rows = purchases.filter((p) => {
    if (period === 'day' && !isSameDay(p.date, selectedDate)) return false;
    if (period === 'month' && (p.date.getMonth() !== selectedDate.getMonth() || p.date.getFullYear() !== selectedDate.getFullYear())) return false;
    if (paymentFilter !== 'all' && p.paiement !== paymentFilter) return false;
    if (!query) return true;
    return [p.fournisseur, p.reference ?? '', p.note ?? '', paymentMeta(p.paiement)?.label ?? '', ...p.lignes.map((l) => l.nom)]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });

  const counted = rows.filter((p) => p.statut !== 'annulee');
  const totalSpent = counted.reduce((s, p) => s + p.total, 0);
  const totalQty = counted.reduce((s, p) => s + qtyOf(p), 0);
  const onCredit = counted.filter((p) => p.paiement === 'credit').reduce((s, p) => s + p.total, 0);
  const isFiltering = query !== '' || paymentFilter !== 'all';

  const chips = [{ id: 'all', label: 'Tous', icon: null as LucideIcon | null }, ...PURCHASE_PAYMENTS];
  const periods: Array<['day' | 'month' | 'all', string]> = [['day', 'Jour'], ['month', 'Mois'], ['all', 'Tout']];

  const searchBox = (
    <div className="flex h-14 items-center gap-3 rounded-full bg-[var(--m3-surface-container-high)] px-4 focus-within:ring-2 focus-within:ring-[var(--m3-primary)] sm:h-12">
      <Search className="h-6 w-6 shrink-0 text-[var(--m3-on-surface-variant)] sm:h-5 sm:w-5" />
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher un fournisseur, un article..."
        aria-label="Rechercher un achat"
        className="w-full min-w-0 border-none bg-transparent text-base text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)] sm:text-sm"
      />
      {search && (
        <button
          type="button"
          onClick={() => setSearch('')}
          aria-label="Effacer la recherche"
          className={`group relative -mr-2 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] sm:h-9 sm:w-9 ${M3_FOCUS}`}
        >
          <M3StateLayer />
          <X size={20} />
        </button>
      )}
    </div>
  );

  const periodControl = (
    <div role="group" aria-label="Période" className="grid h-12 w-full max-w-[300px] grid-cols-3 gap-0.5">
      {periods.map(([id, text], idx) => {
        const selected = period === id;
        const shape = selected ? 'rounded-full' : idx === 0 ? 'rounded-l-full rounded-r-lg' : idx === 2 ? 'rounded-r-full rounded-l-lg' : 'rounded-lg';
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            onClick={() => setPeriod(id)}
            className={`group relative flex items-center justify-center gap-1.5 overflow-hidden text-sm font-semibold m3-morph ${shape} ${M3_FOCUS} ${
              selected ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]' : 'bg-[var(--m3-surface-container-high)] text-[var(--m3-on-surface)]'
            }`}
          >
            <M3StateLayer />
            {selected && <Check size={16} />}
            {text}
          </button>
        );
      })}
    </div>
  );

  const chipRow = (
    <div role="group" aria-label="Filtrer par mode de paiement" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
      {chips.map((method) => {
        const selected = paymentFilter === method.id;
        const Icon = method.icon;
        return (
          <button key={method.id} type="button" aria-pressed={selected} onClick={() => setPaymentFilter(method.id)} className={`group relative shrink-0 ${M3_FOCUS}`}>
            <span
              className={`relative flex h-10 items-center gap-2 overflow-hidden px-4 text-sm font-medium m3-morph ${selected ? 'rounded-full' : 'rounded-xl'} ${
                selected
                  ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
                  : 'border border-[var(--m3-outline)] text-[var(--m3-on-surface-variant)]'
              }`}
            >
              <M3StateLayer />
              {selected ? <Check size={16} /> : Icon ? <Icon size={16} /> : null}
              {method.label}
            </span>
          </button>
        );
      })}
    </div>
  );

  const statusChip = (cancelled: boolean) => (
    <span
      className={
        'inline-flex h-7 items-center rounded-full px-3 text-xs font-medium ' +
        (cancelled ? 'bg-[#FFDAD6] text-[#410002]' : 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]')
      }
    >
      {cancelled ? 'Annulé' : 'Enregistré'}
    </span>
  );

  const emptyState = (
    <div className="flex flex-col items-center gap-1 px-6 py-12 text-center">
      <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]">
        <Truck size={28} />
      </span>
      <span className="text-base font-medium">{isFiltering ? 'Aucun achat ne correspond à votre recherche.' : 'Aucun achat pour cette période.'}</span>
      {!isFiltering && <span className="text-sm text-[var(--m3-on-surface-variant)]">Enregistrez vos achats de marchandises pour suivre vos coûts.</span>}
    </div>
  );

  const deskIconBtn = `group relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] disabled:cursor-not-allowed ${M3_FOCUS}`;

  return (
    <div
      style={M3_VARS}
      className="-mx-4 -mb-5 min-h-[calc(100dvh-8rem)] bg-[var(--m3-surface)] px-4 pb-28 pt-4 font-sans text-[var(--m3-on-surface)] sm:mx-0 sm:mb-0 sm:min-h-0 sm:bg-transparent sm:p-0"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-5">
        <div className="min-w-0">
          <h2 className="text-[32px] font-bold leading-10 tracking-tight">Achats</h2>
          <div className="text-sm capitalize text-[var(--m3-on-surface-variant)]">{periodLabel}</div>
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className={`group relative hidden h-12 items-center gap-2 overflow-hidden rounded-full bg-[var(--m3-primary)] px-6 text-sm font-semibold text-[var(--m3-on-primary)] sm:flex ${M3_FOCUS}`}
        >
          <M3StateLayer />
          <Plus size={18} />
          Nouvel achat
        </button>
      </div>

      {/* ── Phone ── */}
      <section
        aria-label="Résumé des achats"
        className="m3-in mb-4 overflow-hidden rounded-[32px] bg-[var(--m3-primary-container)] p-5 text-[var(--m3-on-primary-container)] sm:hidden"
      >
        <div className="text-sm font-medium opacity-80">{isFiltering ? 'Total acheté (résultats)' : 'Total acheté'}</div>
        <div className="mt-1 text-[40px] font-bold leading-[48px] tracking-tight tabular-nums">{fmtHTG(totalSpent)}</div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-[var(--m3-primary)] px-3.5 py-1.5 text-xs font-semibold text-[var(--m3-on-primary)]">{plural(counted.length, 'achat')}</span>
          <span className="rounded-full bg-[var(--m3-surface-container-lowest)] px-3.5 py-1.5 text-xs font-semibold text-[var(--m3-on-surface)]">{plural(totalQty, 'unité')}</span>
          {onCredit > 0 && (
            <span className="rounded-full bg-[var(--m3-tertiary-container)] px-3.5 py-1.5 text-xs font-semibold text-[var(--m3-on-tertiary-container)]">
              À crédit {fmtHTG(onCredit)}
            </span>
          )}
        </div>
      </section>

      <div className="space-y-3 sm:hidden">
        {periodControl}
        {searchBox}
        {chipRow}
      </div>

      <ul className="mt-4 space-y-3 sm:hidden" aria-label="Liste des achats">
        {rows.map((p) => {
          const cancelled = p.statut === 'annulee';
          const meta = paymentMeta(p.paiement);
          const PayIcon = meta?.icon ?? Banknote;
          return (
            <li key={p.id} className={'m3-in overflow-hidden rounded-[28px] p-4 ' + (cancelled ? 'bg-[var(--m3-surface-container-low)]' : 'bg-[var(--m3-surface-container)]')}>
              <div className="flex items-start gap-3">
                <div
                  className={
                    'flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] ' +
                    (cancelled ? 'bg-[#FFDAD6] text-[#410002]' : 'bg-[var(--m3-tertiary-container)] text-[var(--m3-on-tertiary-container)]')
                  }
                >
                  <Truck size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-semibold">{p.fournisseur}</div>
                  <div className="text-xs tabular-nums text-[var(--m3-on-surface-variant)]">
                    {fmtDate(p.date)} · {fmtTime12(p.date)}
                    {p.reference ? ` · ${p.reference}` : ''}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--m3-secondary-container)] px-2.5 py-1 text-xs font-medium text-[var(--m3-on-secondary-container)]">
                      <PayIcon size={12} />
                      {meta?.label ?? p.paiement}
                    </span>
                    {statusChip(cancelled)}
                  </div>
                </div>
                <div className={'shrink-0 text-right text-xl font-bold tabular-nums ' + (cancelled ? 'text-[var(--m3-on-surface-variant)] line-through' : 'text-[var(--m3-primary)]')}>
                  {fmtHTG(p.total)}
                </div>
              </div>
              <div className="mt-3 space-y-1.5 rounded-[20px] bg-[var(--m3-surface)] p-3 text-sm">
                {p.lignes.map((l, i) => (
                  <div key={i} className="flex justify-between gap-3">
                    <span className={'min-w-0 ' + (cancelled ? 'line-through' : '')}>
                      <span className="font-semibold tabular-nums text-[var(--m3-on-surface-variant)]">{l.qte} ×</span> {l.nom}
                      <span className="block text-xs text-[var(--m3-on-surface-variant)]">à {fmtHTG(l.coutUnitaire)} / {l.unite}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-[var(--m3-on-surface-variant)]">{fmtHTG(l.sousTotal)}</span>
                  </div>
                ))}
                {p.note && <div className="border-t border-[var(--m3-outline-variant)] pt-1.5 text-xs text-[var(--m3-on-surface-variant)]">{p.note}</div>}
              </div>
              <div className="mt-3 flex">
                <button
                  type="button"
                  onClick={() => setToCancel(p)}
                  disabled={cancelled}
                  className={`group relative flex h-12 flex-1 items-center justify-center gap-2 overflow-hidden rounded-full bg-[#FFDAD6] text-sm font-semibold text-[#410002] m3-press motion-reduce:transition-none disabled:opacity-40 ${M3_FOCUS}`}
                >
                  <M3StateLayer />
                  <Undo2 size={18} />
                  Annuler l'achat
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {rows.length === 0 && <div className="m3-in mt-4 rounded-[32px] bg-[var(--m3-surface-container-low)] sm:hidden">{emptyState}</div>}

      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className={`group fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 shrink-0 items-center justify-center gap-3 overflow-hidden rounded-[20px] bg-[var(--m3-primary-container)] px-6 text-base font-semibold tracking-[0.01em] text-[var(--m3-on-primary-container)] shadow-[0_3px_8px_3px_rgba(0,0,0,0.15),0_1px_3px_rgba(0,0,0,0.3)] m3-press motion-reduce:transition-none sm:hidden ${M3_FOCUS}`}
      >
        <M3StateLayer />
        <Plus className="h-6 w-6" />
        Achat
      </button>

      {/* ── Desktop (≥ sm) ── */}
      <div className="hidden space-y-5 sm:block">
        <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-3">
          <div className="flex items-center gap-4 rounded-[28px] bg-[var(--m3-primary-container)] px-6 py-5 text-[var(--m3-on-primary-container)]">
            <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/40">
              <Truck size={26} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium opacity-80">{isFiltering ? 'Total acheté (résultats)' : 'Total acheté'}</div>
              <div className="break-words text-[32px] font-bold leading-9 tracking-tight tabular-nums">{fmtHTG(totalSpent)}</div>
            </div>
          </div>
          {[
            { label: 'Achats', value: String(counted.length), Icon: Receipt, tone: 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]' },
            { label: 'Unités achetées', value: String(totalQty), Icon: Package, tone: 'bg-[var(--m3-surface-container)] text-[var(--m3-on-surface)]' },
            { label: 'À crédit', value: onCredit > 0 ? fmtHTG(onCredit) : '—', Icon: FileClock, tone: 'bg-[var(--m3-tertiary-container)] text-[var(--m3-on-tertiary-container)]' },
          ].map(({ label: l, value, Icon, tone }) => (
            <div key={l} className={`flex items-center gap-4 rounded-[28px] px-5 py-5 ${tone}`}>
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--m3-surface)]/60">
                <Icon size={22} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm opacity-80">{l}</div>
                <div className="truncate text-2xl font-semibold leading-8 tabular-nums">{value}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[240px] max-w-md flex-1">{searchBox}</div>
          <div className="w-[260px] max-w-full">{periodControl}</div>
          {chipRow}
          <div className="ml-auto text-sm tabular-nums text-[var(--m3-on-surface-variant)]" aria-live="polite">
            {plural(rows.length, 'achat')}
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] bg-[var(--m3-surface-container)]">
          <div className="max-h-[62vh] overflow-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--m3-surface-container-high)] text-xs text-[var(--m3-on-surface-variant)] shadow-[0_1px_0_var(--m3-outline-variant)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Date</th>
                  <th scope="col" className="px-4 py-3 font-medium">Fournisseur</th>
                  <th scope="col" className="px-4 py-3 font-medium">Articles</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Qté</th>
                  <th scope="col" className="px-4 py-3 font-medium">Paiement</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
                  <th scope="col" className="px-4 py-3 font-medium">Statut</th>
                  <th scope="col" className="w-20 px-3 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const cancelled = p.statut === 'annulee';
                  const meta = paymentMeta(p.paiement);
                  const PayIcon = meta?.icon ?? Banknote;
                  return (
                    <tr
                      key={p.id}
                      className={
                        'border-b border-[var(--m3-outline-variant)]/60 align-top transition-colors last:border-b-0 motion-reduce:transition-none ' +
                        (cancelled ? 'bg-[var(--m3-surface-container-low)] text-[var(--m3-on-surface-variant)]' : 'hover:bg-[var(--m3-surface-container-high)]')
                      }
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="tabular-nums">{fmtDate(p.date)}</div>
                        <div className="text-xs tabular-nums text-[var(--m3-on-surface-variant)]">{fmtTime12(p.date)}</div>
                      </td>
                      <td className="max-w-[220px] px-4 py-3">
                        <div className="truncate font-medium">{p.fournisseur}</div>
                        {p.reference && <div className="text-xs text-[var(--m3-on-surface-variant)]">{p.reference}</div>}
                      </td>
                      <td className="min-w-[260px] px-4 py-3">
                        <div className="space-y-0.5">
                          {p.lignes.map((l, i) => (
                            <div key={i} className="flex justify-between gap-4">
                              <span className={cancelled ? 'line-through' : ''}>
                                <span className="tabular-nums text-[var(--m3-on-surface-variant)]">{l.qte} ×</span> {l.nom}
                                <span className="ml-1 text-xs text-[var(--m3-on-surface-variant)]">@ {fmtHTG(l.coutUnitaire)}</span>
                              </span>
                              <span className="tabular-nums text-[var(--m3-on-surface-variant)]">{fmtHTG(l.sousTotal)}</span>
                            </div>
                          ))}
                        </div>
                        {p.note && <div className="mt-1 text-xs text-[var(--m3-on-surface-variant)]">{p.note}</div>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{qtyOf(p)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[var(--m3-secondary-container)] px-3 text-xs font-medium text-[var(--m3-on-secondary-container)]">
                          <PayIcon size={14} />
                          {meta?.label ?? p.paiement}
                        </span>
                      </td>
                      <td className={'whitespace-nowrap px-4 py-3 text-right text-base font-semibold tabular-nums ' + (cancelled ? 'line-through' : 'text-[var(--m3-primary)]')}>
                        {fmtHTG(p.total)}
                      </td>
                      <td className="px-4 py-3">{statusChip(cancelled)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => setToCancel(p)}
                            disabled={cancelled}
                            className={`${deskIconBtn} ${cancelled ? 'opacity-40' : 'text-[#BA1A1A]'}`}
                            aria-label="Annuler l'achat"
                            title={cancelled ? 'Achat déjà annulé' : "Annuler l'achat"}
                          >
                            <M3StateLayer />
                            <Undo2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8}>{emptyState}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {sheetOpen && <PurchaseSheet products={branchProducts} suppliers={suppliers} defaultDate={selectedDate} onAdd={onAdd} onClose={() => setSheetOpen(false)} />}

      {toCancel && (
        <div className="m3-scrim fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Annuler l'achat"
            style={M3_VARS}
            className="m3-pop w-full max-w-sm rounded-[32px] bg-[var(--m3-surface-container-high)] p-6 text-[var(--m3-on-surface)] shadow-[0_8px_10px_-6px_rgba(0,0,0,0.2),0_16px_24px_2px_rgba(0,0,0,0.14)]"
          >
            <span className="mb-4 flex h-14 w-14 -rotate-6 items-center justify-center rounded-[20px] bg-[#FFDAD6] text-[#410002]">
              <Undo2 size={26} />
            </span>
            <div className="text-2xl font-bold leading-8">Annuler cet achat ?</div>
            <p className="mt-3 text-sm leading-5 text-[var(--m3-on-surface-variant)]">
              {toCancel.fournisseur} • {fmtHTG(toCancel.total)} • {plural(qtyOf(toCancel), 'unité')}. Les quantités seront retirées du stock et l'achat ne comptera plus dans les totaux.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
              <button
                onClick={() => setToCancel(null)}
                className={`group relative h-12 flex-1 overflow-hidden rounded-full bg-[var(--m3-secondary-container)] text-sm font-semibold text-[var(--m3-on-secondary-container)] m3-press motion-reduce:transition-none ${M3_FOCUS}`}
              >
                <M3StateLayer />
                Retour
              </button>
              <button
                onClick={() => {
                  onCancel(toCancel);
                  setToCancel(null);
                }}
                className={`group relative h-12 flex-1 overflow-hidden rounded-full bg-[#BA1A1A] text-sm font-semibold text-white m3-press motion-reduce:transition-none ${M3_FOCUS}`}
              >
                <M3StateLayer />
                Annuler l'achat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreditPaymentModal({
  title,
  sales,
  onClose,
  onConfirm,
}: {
  title: string;
  sales: SaleRecord[];
  onClose: () => void;
  onConfirm: (montant: number, mode: PaymentMethodId) => void;
}) {
  const balance = sales.reduce((sum, sale) => sum + creditBalance(sale), 0);
  const [montant, setMontant] = useState<string>(String(balance));
  const [mode, setMode] = useState<PaymentMethodId>('especes');
  const value = parseFloat(montant) || 0;
  const valid = value > 0 && value <= balance;
  const history = sales.length === 1 ? sales[0].paiementsCredit ?? [] : [];

  return (
    <div className="m3-scrim fixed inset-0 z-[95] flex items-center justify-center bg-black/40 p-4 ">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Encaisser un paiement"
        style={M3_VARS}
        className="m3-pop max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-[32px] bg-[var(--m3-surface-container-high)] text-[var(--m3-on-surface)] shadow-[0_8px_10px_-6px_rgba(0,0,0,0.2),0_16px_24px_2px_rgba(0,0,0,0.14)]      "
      >
        <div className="flex items-start justify-between gap-3 px-6 pb-2 pt-6    ">
          <div className="min-w-0">
            <div className="text-sm font-medium text-[var(--m3-on-surface-variant)]     ">Encaisser un paiement</div>
            <div className="mt-1 truncate text-2xl font-bold leading-8    ">{title}</div>
          </div>
          <button
            onClick={onClose}
            className={`group relative -mr-2 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)]         ${M3_FOCUS}`}
            aria-label="Fermer"
          >
            <M3StateLayer className="" />
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-4 ">
          <div className="flex items-baseline justify-between rounded-[24px] bg-[var(--m3-tertiary-container)] px-4 py-3 text-[var(--m3-on-tertiary-container)]    ">
            <span className="text-sm font-medium   ">Solde dû</span>
            <span className="text-3xl font-bold tabular-nums    ">{fmtHTG(balance)}</span>
          </div>

          <div>
            <label className="mb-1.5 block px-1 text-xs font-medium text-[var(--m3-on-surface-variant)]     ">Montant reçu (HTG)</label>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max={balance}
              value={montant}
              onChange={(event) => setMontant(event.target.value)}
              className="h-14 w-full rounded-2xl bg-[var(--m3-surface-container-highest)] px-4 text-lg font-semibold tabular-nums outline-none focus:ring-2 focus:ring-[var(--m3-primary)]           "
            />
            <div className="mt-2 flex gap-2  ">
              <button
                type="button"
                onClick={() => setMontant(String(balance))}
                className={`group relative h-9 overflow-hidden rounded-full bg-[var(--m3-secondary-container)] px-4 text-sm font-medium text-[var(--m3-on-secondary-container)] m3-press motion-reduce:transition-none            ${M3_FOCUS}`}
              >
                <M3StateLayer className="" />
                Tout payer
              </button>
              <button
                type="button"
                onClick={() => setMontant(String(Math.round(balance / 2)))}
                className={`group relative h-9 overflow-hidden rounded-full bg-[var(--m3-secondary-container)] px-4 text-sm font-medium text-[var(--m3-on-secondary-container)] m3-press motion-reduce:transition-none            ${M3_FOCUS}`}
              >
                <M3StateLayer className="" />
                Moitié
              </button>
            </div>
            {value > balance && <div className="mt-1.5 px-1 text-xs font-medium text-[#BA1A1A]     ">Le montant dépasse le solde dû.</div>}
          </div>

          <div>
            <div className="mb-1.5 px-1 text-xs font-medium text-[var(--m3-on-surface-variant)]     ">Mode de paiement</div>
            <div className="grid grid-cols-3 gap-0.5 ">
              {PAYMENT_METHODS.filter((m) => m.id !== 'credit').map((m, idx, arr) => {
                const selected = mode === m.id;
                /* Connected button group: selected = full pill, others = small inner corners. */
                const shape = selected
                  ? 'rounded-full'
                  : idx === 0
                    ? 'rounded-l-full rounded-r-lg'
                    : idx === arr.length - 1
                      ? 'rounded-r-full rounded-l-lg'
                      : 'rounded-lg';
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setMode(m.id)}
                    className={
                      `group relative h-12 overflow-hidden px-1 text-sm font-semibold m3-morph ${shape} ${M3_FOCUS} ` +
                      '        ' +
                      (selected
                        ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]  '
                        : 'bg-[var(--m3-surface-container-highest)] text-[var(--m3-on-surface)]   ')
                    }
                  >
                    <M3StateLayer className="" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {sales.length > 1 && (
            <div className="text-xs text-[var(--m3-on-surface-variant)]  ">
              Le paiement est appliqué d'abord aux ventes les plus anciennes ({sales.length} ventes impayées).
            </div>
          )}

          {history.length > 0 && (
            <div className="border-t border-[var(--m3-outline-variant)] pt-3  ">
              <div className="mb-1 text-xs font-medium text-[var(--m3-on-surface-variant)]     ">Paiements déjà reçus</div>
              {history.map((payment) => (
                <div key={payment.id} className="flex justify-between text-sm ">
                  <span>
                    {payment.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} •{' '}
                    {PAYMENT_METHODS.find((m) => m.id === payment.mode)?.label}
                  </span>
                  <span className="tabular-nums text-[var(--m3-primary)] ">{fmtHTG(payment.montant)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 px-6 pb-6 pt-2    ">
          <button
            onClick={onClose}
            className={`group relative h-12 flex-1 overflow-hidden rounded-full bg-[var(--m3-secondary-container)] text-sm font-semibold text-[var(--m3-on-secondary-container)] m3-press motion-reduce:transition-none           ${M3_FOCUS}`}
          >
            <M3StateLayer className="" />
            Annuler
          </button>
          <button
            disabled={!valid}
            onClick={() => onConfirm(value, mode)}
            className={
              `group relative h-12 flex-1 overflow-hidden rounded-full text-sm font-semibold m3-press motion-reduce:transition-none        ${M3_FOCUS} ` +
              (valid
                ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]   '
                : 'cursor-not-allowed bg-[var(--m3-surface-container-highest)] text-[var(--m3-on-surface-variant)] opacity-60   ')
            }
          >
            <M3StateLayer className="" />
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

function BranchCreditsSection({
  sales,
  onPay,
}: {
  sales: SaleRecord[];
  onPay: (targets: SaleRecord[], montant: number, mode: PaymentMethodId) => void;
}) {
  const [view, setView] = useState<'clients' | 'sales'>('clients');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'open' | 'all'>('open');
  const [receiptSale, setReceiptSale] = useState<SaleRecord | null>(null);
  const [payTarget, setPayTarget] = useState<{ title: string; sales: SaleRecord[] } | null>(null);
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [sheetKey, setSheetKey] = useState<string | null>(null);

  useEffect(() => {
    if (!sheetKey) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSheetKey(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetKey]);

  // Credit sales, oldest first (oldest debts are the ones to chase first)
  const creditSales = useMemo(
    () =>
      sales
        .filter((sale) => sale.paiement === 'credit' && sale.statut !== 'annulee')
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [sales]
  );

  const clientName = (sale: SaleRecord) => sale.client?.trim() || 'Client inconnu';

  const clients = useMemo(() => {
    const map = new Map<string, { nom: string; sales: SaleRecord[]; total: number; paid: number; last: Date }>();
    creditSales.forEach((sale) => {
      const nom = clientName(sale);
      const key = nom.toLowerCase();
      const entry = map.get(key) ?? { nom, sales: [], total: 0, paid: 0, last: sale.date };
      entry.sales.push(sale);
      entry.total += sale.total;
      entry.paid += creditPaid(sale);
      if (sale.date > entry.last) entry.last = sale.date;
      map.set(key, entry);
    });
    return [...map.values()]
      .map((entry) => ({ ...entry, balance: Math.max(entry.total - entry.paid, 0) }))
      .sort((a, b) => b.balance - a.balance);
  }, [creditSales]);

  const totalDue = creditSales.reduce((sum, sale) => sum + creditBalance(sale), 0);
  const debtorCount = clients.filter((c) => c.balance > 0).length;
  const openSalesCount = creditSales.filter((sale) => creditBalance(sale) > 0).length;

  const query = search.trim().toLowerCase();
  const matchesQuery = (sale: SaleRecord) =>
    !query ||
    [clientName(sale), ...sale.lignes.map((l) => l.nom)].join(' ').toLowerCase().includes(query);

  const clientRows = clients.filter(
    (c) =>
      (statusFilter === 'all' || c.balance > 0) &&
      (!query || c.nom.toLowerCase().includes(query) || c.sales.some(matchesQuery))
  );
  const saleRows = creditSales.filter(
    (sale) => (statusFilter === 'all' || creditBalance(sale) > 0) && matchesQuery(sale)
  );

  const daysAgo = (date: Date) => Math.floor((Date.now() - date.getTime()) / 86400000);
  const ageLabel = (date: Date) => {
    const days = daysAgo(date);
    return days <= 0 ? "Aujourd'hui" : `il y a ${days} j`;
  };
  const fmtDate = (date: Date) => date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

  const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? 's' : ''}`;
  const saleStatus = (sale: SaleRecord) => {
    const paid = creditPaid(sale);
    return creditBalance(sale) <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  };
  const statusChip = {
    paid: { label: 'Payé', cls: 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]' },
    partial: { label: 'Partiel', cls: 'bg-[var(--m3-tertiary-container)] text-[var(--m3-on-tertiary-container)]' },
    unpaid: { label: 'Impayé', cls: 'bg-[#FFDAD6] text-[#410002]' },
  } as const;
  const mBtn = `group relative flex h-12 items-center justify-center gap-2 overflow-hidden rounded-full text-sm font-semibold m3-press motion-reduce:transition-none ${M3_FOCUS}`;

  const openPayment = (title: string, targets: SaleRecord[]) => {
    const open = targets.filter((sale) => creditBalance(sale) > 0);
    if (open.length > 0) setPayTarget({ title, sales: open });
  };

  const oldestOpen = creditSales.find((sale) => creditBalance(sale) > 0);

  const payBtn = `group relative flex h-9 shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full px-4 text-sm font-medium ${M3_FOCUS}`;
  const payOn = 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]';
  const payOff = 'cursor-not-allowed bg-[var(--m3-surface-container-highest)] text-[var(--m3-on-surface-variant)] opacity-60';
  const iconBtn = `group relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`;

  const toggleSort = (key: string) =>
    setSort((prev) => {
      const first = key === 'nom' || key === 'client' ? 'asc' : 'desc';
      const second = first === 'asc' ? 'desc' : 'asc';
      if (!prev || prev.key !== key) return { key, dir: first };
      return prev.dir === first ? { key, dir: second } : null;
    });

  const cmp = (x: string | number, y: string | number) =>
    typeof x === 'string' ? x.localeCompare(String(y), 'fr') : Number(x) - Number(y);
  const sortMul = sort?.dir === 'asc' ? 1 : -1;
  const sortedClientRows =
    sort && ['nom', 'balance', 'last'].includes(sort.key)
      ? [...clientRows].sort((x, y) => {
          const v = (c: (typeof clientRows)[number]) =>
            sort.key === 'nom' ? c.nom.toLowerCase() : sort.key === 'balance' ? c.balance : c.last.getTime();
          return cmp(v(x), v(y)) * sortMul;
        })
      : clientRows;
  const sortedSaleRows =
    sort && ['date', 'client', 'total', 'balance'].includes(sort.key)
      ? [...saleRows].sort((x, y) => {
          const v = (sale: SaleRecord) =>
            sort.key === 'date' ? sale.date.getTime() : sort.key === 'client' ? clientName(sale).toLowerCase() : sort.key === 'total' ? sale.total : creditBalance(sale);
          return cmp(v(x), v(y)) * sortMul;
        })
      : saleRows;

  const creditHead = (key: string, label: string, align: 'left' | 'right' = 'right') => {
    const active = sort?.key === key;
    return (
      <th
        scope="col"
        aria-sort={active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`px-4 py-3 font-medium ${align === 'left' ? 'text-left' : 'text-right'}`}
      >
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className={`group relative -mx-2 inline-flex items-center gap-1 overflow-hidden rounded-full px-2 py-1 ${active ? 'text-[var(--m3-on-surface)]' : ''} ${M3_FOCUS}`}
        >
          <M3StateLayer />
          {label}
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={`transition-transform motion-reduce:transition-none ${active ? (sort?.dir === 'asc' ? 'rotate-180' : '') : 'opacity-0 group-hover:opacity-50'}`}
          />
        </button>
      </th>
    );
  };

  const sheetClient = sheetKey ? (clients.find((c) => c.nom.toLowerCase() === sheetKey) ?? null) : null;
  const sheetSales = sheetClient
    ? [...sheetClient.sales].sort((x, y) => {
        const ox = creditBalance(x) > 0 ? 1 : 0;
        const oy = creditBalance(y) > 0 ? 1 : 0;
        if (ox !== oy) return oy - ox;
        return ox ? x.date.getTime() - y.date.getTime() : y.date.getTime() - x.date.getTime();
      })
    : [];

  return (
    <>
    <div
      style={M3_VARS}
      className="-mx-4 -mb-5 min-h-[calc(100dvh-8rem)] space-y-4 bg-[var(--m3-surface)] px-4 pb-8 pt-4 font-sans text-[var(--m3-on-surface)] sm:hidden       "
    >
      {/* Phone (M3 Expressive): amount-due hero + two tonal stat cards */}
      <section aria-label="Résumé des crédits" className="space-y-2 ">
        <div className="m3-in overflow-hidden rounded-[32px] bg-[var(--m3-tertiary-container)] p-5 text-[var(--m3-on-tertiary-container)]">
          <div className="text-sm font-medium opacity-80">Total dû</div>
          <div className="mt-1 break-words text-[40px] font-bold leading-[48px] tracking-tight tabular-nums">{fmtHTG(totalDue)}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-[28px] bg-[var(--m3-surface-container)] p-4">
            <div className="text-xs font-medium text-[var(--m3-on-surface-variant)]">Clients débiteurs</div>
            <div className="mt-1 text-3xl font-bold tabular-nums">{debtorCount}</div>
          </div>
          <div className="rounded-[28px] bg-[var(--m3-secondary-container)] p-4 text-[var(--m3-on-secondary-container)]">
            <div className="text-xs font-medium opacity-80">Ventes impayées</div>
            <div className="mt-1 text-3xl font-bold tabular-nums">{openSalesCount}</div>
          </div>
        </div>
      </section>

      <div className="    ">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 ">
          <div>
            <h2 className="text-[28px] font-bold leading-9 tracking-tight     ">Ventes à crédit</h2>
            <div className="text-sm text-[var(--m3-on-surface-variant)]  ">Toutes les dates • ceux qui doivent de l'argent</div>
          </div>        </div>

        {/* Phone: view toggle (connected button group), search, status chips */}
        <div className="mb-3 grid h-14 grid-cols-2 gap-0.5 " role="group" aria-label="Affichage">
          {(
            [
              ['clients', 'Par client'],
              ['sales', 'Par vente'],
            ] as const
          ).map(([id, label], idx) => {
            const selected = view === id;
            const shape = selected ? 'rounded-full' : idx === 0 ? 'rounded-l-full rounded-r-lg' : 'rounded-r-full rounded-l-lg';
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                onClick={() => setView(id)}
                className={`group relative flex items-center justify-center gap-1.5 overflow-hidden text-sm font-semibold m3-morph ${shape} ${M3_FOCUS} ${
                  selected
                    ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]'
                    : 'bg-[var(--m3-surface-container-high)] text-[var(--m3-on-surface)]'
                }`}
              >
                <M3StateLayer />
                {selected && <Check size={16} />}
                {label}
              </button>
            );
          })}
        </div>

        <div className="mb-3 flex h-14 items-center gap-3 rounded-full bg-[var(--m3-surface-container-high)] px-4 focus-within:ring-2 focus-within:ring-[var(--m3-primary)] ">
          <Search className="h-6 w-6 shrink-0 text-[var(--m3-on-surface-variant)]" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher un client, un article..."
            aria-label="Rechercher un client ou un article"
            className="w-full min-w-0 border-none bg-transparent text-base text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Effacer la recherche"
              className={`group relative -mr-2 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}
            >
              <M3StateLayer />
              <X size={20} />
            </button>
          )}
        </div>

        <div role="group" aria-label="Filtrer par statut" className="mb-4 flex gap-2 ">
          {(
            [
              ['open', 'Impayés'],
              ['all', 'Tous'],
            ] as const
          ).map(([id, label]) => {
            const selected = statusFilter === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                onClick={() => setStatusFilter(id)}
                className={`group relative flex h-10 items-center gap-2 overflow-hidden px-4 text-sm font-medium m3-morph ${selected ? 'rounded-full' : 'rounded-xl'} ${M3_FOCUS} ${
                  selected
                    ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
                    : 'border border-[var(--m3-outline)] text-[var(--m3-on-surface-variant)]'
                }`}
              >
                <M3StateLayer />
                {selected && <Check size={16} />}
                {label}
              </button>
            );
          })}
        </div>

        {/* Phone: cards */}
        <ul className="space-y-3 " aria-label={view === 'clients' ? 'Liste des clients' : 'Liste des ventes à crédit'}>
          {view === 'clients'
            ? clientRows.map((client) => {
                const pct = client.total > 0 ? Math.min(100, Math.round((client.paid / client.total) * 100)) : 0;
                const owes = client.balance > 0;
                return (
                  <li key={client.nom.toLowerCase()} className="m3-in overflow-hidden rounded-[28px] bg-[var(--m3-surface-container)] p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[var(--m3-tertiary-container)] text-lg font-bold text-[var(--m3-on-tertiary-container)]"
                        aria-hidden="true"
                      >
                        {client.nom.trim().charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-semibold">{client.nom}</div>
                        <div className="mt-0.5 text-xs text-[var(--m3-on-surface-variant)]">
                          {plural(client.sales.length, 'vente')} · {ageLabel(client.last)}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={'text-xl font-bold tabular-nums ' + (owes ? 'text-[#BA1A1A]' : 'text-[var(--m3-primary)]')}>
                          {owes ? fmtHTG(client.balance) : 'Soldé'}
                        </div>
                        {owes && <div className="text-xs text-[var(--m3-on-surface-variant)]">Solde dû</div>}
                      </div>
                    </div>

                    <div className="mt-3">
                      <div
                        role="progressbar"
                        aria-label="Part déjà payée"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={pct}
                        className="h-2 overflow-hidden rounded-full bg-[var(--m3-surface-container-highest)]"
                      >
                        <div className="h-full rounded-full bg-[var(--m3-primary)]" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-1.5 flex justify-between text-xs tabular-nums text-[var(--m3-on-surface-variant)]">
                        <span>Payé {fmtHTG(client.paid)}</span>
                        <span>Total {fmtHTG(client.total)}</span>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openPayment(client.nom, client.sales)}
                        disabled={!owes}
                        className={`${mBtn} flex-1 ${
                          owes
                            ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]'
                            : 'cursor-not-allowed bg-[var(--m3-surface-container-highest)] text-[var(--m3-on-surface-variant)] opacity-60'
                        }`}
                      >
                        <M3StateLayer />
                        <Banknote size={18} />
                        Encaisser
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSearch(client.nom);
                          setView('sales');
                        }}
                        aria-label="Voir les ventes du client"
                        className={`${mBtn} w-12 shrink-0 bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]`}
                      >
                        <M3StateLayer />
                        <Eye size={18} />
                      </button>
                    </div>
                  </li>
                );
              })
            : saleRows.map((sale) => {
                const paid = creditPaid(sale);
                const balance = creditBalance(sale);
                const chip = statusChip[saleStatus(sale)];
                return (
                  <li key={sale.id} className="m3-in overflow-hidden rounded-[28px] bg-[var(--m3-surface-container)] p-4">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-semibold">{clientName(sale)}</div>
                        <div className="mt-0.5 text-xs tabular-nums text-[var(--m3-on-surface-variant)]">
                          {fmtDate(sale.date)} · {fmtTime12(sale.date)} · {ageLabel(sale.date)}
                        </div>
                      </div>
                      <span className={'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ' + chip.cls}>{chip.label}</span>
                    </div>

                    <div className="mt-3 space-y-1.5 rounded-[20px] bg-[var(--m3-surface)] p-3 text-sm">
                      {sale.lignes.map((ligne, index) => (
                        <div key={index}>
                          <span className="font-semibold tabular-nums text-[var(--m3-on-surface-variant)]">{ligne.qte} ×</span> {ligne.nom}
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-2xl bg-[var(--m3-surface-container-high)] px-2 py-2">
                        <div className="text-[11px] text-[var(--m3-on-surface-variant)]">Total</div>
                        <div className="text-sm font-semibold tabular-nums">{fmtHTG(sale.total)}</div>
                      </div>
                      <div className="rounded-2xl bg-[var(--m3-surface-container-high)] px-2 py-2">
                        <div className="text-[11px] text-[var(--m3-on-surface-variant)]">Payé</div>
                        <div className="text-sm font-semibold tabular-nums text-[var(--m3-primary)]">{paid > 0 ? fmtHTG(paid) : '—'}</div>
                      </div>
                      <div className="rounded-2xl bg-[var(--m3-surface-container-high)] px-2 py-2">
                        <div className="text-[11px] text-[var(--m3-on-surface-variant)]">Solde dû</div>
                        <div className={'text-sm font-bold tabular-nums ' + (balance > 0 ? 'text-[#BA1A1A]' : 'text-[var(--m3-primary)]')}>
                          {balance > 0 ? fmtHTG(balance) : '—'}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openPayment(clientName(sale), [sale])}
                        disabled={balance <= 0}
                        className={`${mBtn} flex-1 ${
                          balance > 0
                            ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]'
                            : 'cursor-not-allowed bg-[var(--m3-surface-container-highest)] text-[var(--m3-on-surface-variant)] opacity-60'
                        }`}
                      >
                        <M3StateLayer />
                        <Banknote size={18} />
                        Encaisser
                      </button>
                      <button
                        type="button"
                        onClick={() => setReceiptSale(sale)}
                        aria-label="Voir le reçu"
                        className={`${mBtn} w-12 shrink-0 bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]`}
                      >
                        <M3StateLayer />
                        <Eye size={18} />
                      </button>
                    </div>
                  </li>
                );
              })}
        </ul>

        {(view === 'clients' ? clientRows.length : saleRows.length) === 0 && (
          <div className="m3-in flex flex-col items-center rounded-[32px] bg-[var(--m3-surface-container-low)] px-6 py-12 text-center ">
            <span className="mb-4 flex h-20 w-20 -rotate-6 items-center justify-center rounded-[32px] bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]">
              <FileClock size={36} />
            </span>
            <div className="text-lg font-semibold">
              {view === 'clients'
                ? query || statusFilter === 'all'
                  ? 'Aucun client trouvé'
                  : "Personne ne doit d'argent 🎉"
                : query || statusFilter === 'all'
                  ? 'Aucune vente trouvée'
                  : 'Aucune vente impayée'}
            </div>
          </div>
        )}

      </div>
    </div>

      {/* ===================== Desktop (sm and up) ===================== */}
      <div style={M3_VARS} className="hidden space-y-5 font-sans text-[var(--m3-on-surface)] sm:block">
        <div>
          <h2 className="text-[32px] font-bold leading-10 tracking-tight">Crédits</h2>
          <p className="text-sm text-[var(--m3-on-surface-variant)]">Ventes à crédit · ceux qui doivent de l'argent</p>
        </div>

        <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-3">
          <div className="flex items-center gap-4 rounded-[28px] bg-[var(--m3-tertiary-container)] px-6 py-5 text-[var(--m3-on-tertiary-container)]">
            <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/40">
              <Banknote size={26} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium opacity-80">Total dû</div>
              <div className="break-words text-[32px] font-bold leading-9 tracking-tight tabular-nums">{fmtHTG(totalDue)}</div>
            </div>
          </div>
          {[
            { label: 'Clients débiteurs', value: String(debtorCount), Icon: Users, tone: 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]' },
            { label: 'Ventes impayées', value: String(openSalesCount), Icon: Receipt, tone: 'bg-[var(--m3-surface-container)] text-[var(--m3-on-surface)]' },
            { label: 'Plus ancien impayé', value: oldestOpen ? ageLabel(oldestOpen.date) : '—', Icon: CalendarDays, tone: 'bg-[var(--m3-surface-container)] text-[var(--m3-on-surface)]' },
          ].map(({ label, value, Icon, tone }) => (
            <div key={label} className={`flex items-center gap-4 rounded-[28px] px-5 py-5 ${tone}`}>
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--m3-surface)]/60">
                <Icon size={22} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm opacity-80">{label}</div>
                <div className="truncate text-2xl font-semibold leading-8 tabular-nums">{value}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-12 min-w-[240px] max-w-md flex-1 items-center gap-3 rounded-full bg-[var(--m3-surface-container-high)] px-4 transition-shadow focus-within:ring-2 focus-within:ring-[var(--m3-primary)] motion-reduce:transition-none">
            <Search className="h-5 w-5 shrink-0 text-[var(--m3-on-surface-variant)]" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un client, un article..."
              aria-label="Rechercher un client ou un article"
              className="w-full min-w-0 border-none bg-transparent text-sm text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Effacer la recherche"
                className={`group relative -mr-2 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}
              >
                <M3StateLayer />
                <X size={18} />
              </button>
            )}
          </div>

          {[
            {
              label: 'Affichage',
              width: 'w-[260px]',
              value: view as string,
              set: (id: string) => {
                setView(id as 'clients' | 'sales');
                setSort(null);
              },
              options: [['clients', 'Par client'], ['sales', 'Par vente']] as Array<[string, string]>,
            },
            {
              label: 'Filtrer par statut',
              width: 'w-[220px]',
              value: statusFilter as string,
              set: (id: string) => setStatusFilter(id as 'open' | 'all'),
              options: [['open', 'Impayés'], ['all', 'Tous']] as Array<[string, string]>,
            },
          ].map((group) => (
            <div key={group.label} role="group" aria-label={group.label} className={`grid h-12 ${group.width} max-w-full grid-cols-2 gap-0.5`}>
              {group.options.map(([id, label], idx) => {
                const selected = group.value === id;
                const shape = selected ? 'rounded-full' : idx === 0 ? 'rounded-l-full rounded-r-lg' : 'rounded-r-full rounded-l-lg';
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => group.set(id)}
                    className={`group relative flex items-center justify-center gap-1.5 overflow-hidden text-sm font-semibold m3-morph ${shape} ${M3_FOCUS} ${
                      selected
                        ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]'
                        : 'bg-[var(--m3-surface-container-high)] text-[var(--m3-on-surface)]'
                    }`}
                  >
                    <M3StateLayer />
                    {selected && <Check size={16} />}
                    {label}
                  </button>
                );
              })}
            </div>
          ))}

          <div className="ml-auto text-sm tabular-nums text-[var(--m3-on-surface-variant)]" aria-live="polite">
            {view === 'clients' ? plural(clientRows.length, 'client') : plural(saleRows.length, 'vente')}
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] bg-[var(--m3-surface-container)]">
          <div className="max-h-[62vh] overflow-auto">
            {view === 'clients' ? (
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 bg-[var(--m3-surface-container-high)] text-xs text-[var(--m3-on-surface-variant)] shadow-[0_1px_0_var(--m3-outline-variant)]">
                  <tr>
                    {creditHead('nom', 'Client', 'left')}
                    <th scope="col" className="px-4 py-3 text-left font-medium">Remboursement</th>
                    {creditHead('balance', 'Solde dû')}
                    {creditHead('last', 'Dernier achat')}
                    <th scope="col" className="w-44 px-3 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedClientRows.map((client) => {
                    const key = client.nom.toLowerCase();
                    const pct = client.total > 0 ? Math.min(100, Math.round((client.paid / client.total) * 100)) : 0;
                    const owes = client.balance > 0;
                    const active = sheetKey === key;
                    return (
                      <tr
                        key={key}
                        tabIndex={0}
                        onClick={() => setSheetKey(key)}
                        onKeyDown={(event) => {
                          if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                            event.preventDefault();
                            setSheetKey(key);
                          }
                        }}
                        className={
                          'cursor-pointer border-b border-[var(--m3-outline-variant)]/60 transition-colors last:border-b-0 focus-visible:bg-[var(--m3-surface-container-high)] focus-visible:outline-none motion-reduce:transition-none ' +
                          (active ? 'bg-[var(--m3-secondary-container)]' : 'hover:bg-[var(--m3-surface-container-high)]')
                        }
                      >
                        <td className="max-w-[300px] px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--m3-tertiary-container)] text-base font-semibold text-[var(--m3-on-tertiary-container)]">
                              {client.nom.trim().charAt(0).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <div className="truncate font-medium">{client.nom}</div>
                              <div className="text-xs text-[var(--m3-on-surface-variant)]">{plural(client.sales.length, 'vente')}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div
                            role="progressbar"
                            aria-label="Part déjà payée"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={pct}
                            className="h-2 w-44 overflow-hidden rounded-full bg-[var(--m3-surface-container-highest)]"
                          >
                            <div className="h-full rounded-full bg-[var(--m3-primary)]" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="mt-1 text-xs tabular-nums text-[var(--m3-on-surface-variant)]">
                            Payé {fmtHTG(client.paid)} / {fmtHTG(client.total)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {owes ? (
                            <span className="text-base font-semibold tabular-nums text-[#BA1A1A]">{fmtHTG(client.balance)}</span>
                          ) : (
                            <span className="inline-flex h-7 items-center rounded-full bg-[var(--m3-primary-container)] px-3 text-xs font-medium text-[var(--m3-on-primary-container)]">Soldé</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="whitespace-nowrap tabular-nums">{fmtDate(client.last)}</div>
                          <div className="text-xs text-[var(--m3-on-surface-variant)]">{ageLabel(client.last)}</div>
                        </td>
                        <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openPayment(client.nom, client.sales)}
                              disabled={!owes}
                              className={`${payBtn} ${owes ? payOn : payOff}`}
                            >
                              <M3StateLayer />
                              <Banknote size={16} />
                              Encaisser
                            </button>
                            <button type="button" onClick={() => setSheetKey(key)} className={iconBtn} aria-label="Voir le détail du client" title="Voir le détail">
                              <M3StateLayer />
                              <ChevronRight size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {sortedClientRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]">
                            <FileClock size={28} />
                          </span>
                          <span className="text-base font-medium">
                            {query || statusFilter === 'all' ? 'Aucun client trouvé' : "Personne ne doit d'argent 🎉"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[940px] border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 bg-[var(--m3-surface-container-high)] text-xs text-[var(--m3-on-surface-variant)] shadow-[0_1px_0_var(--m3-outline-variant)]">
                  <tr>
                    {creditHead('date', 'Date', 'left')}
                    {creditHead('client', 'Client', 'left')}
                    <th scope="col" className="px-4 py-3 text-left font-medium">Articles</th>
                    {creditHead('total', 'Total')}
                    <th scope="col" className="px-4 py-3 text-right font-medium">Payé</th>
                    {creditHead('balance', 'Solde dû')}
                    <th scope="col" className="px-4 py-3 text-left font-medium">Statut</th>
                    <th scope="col" className="w-44 px-3 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSaleRows.map((sale) => {
                    const paid = creditPaid(sale);
                    const balance = creditBalance(sale);
                    const chip = statusChip[saleStatus(sale)];
                    return (
                      <tr key={sale.id} className="border-b border-[var(--m3-outline-variant)]/60 align-top transition-colors last:border-b-0 hover:bg-[var(--m3-surface-container-high)] motion-reduce:transition-none">
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="tabular-nums">{fmtDate(sale.date)}</div>
                          <div className="text-xs tabular-nums text-[var(--m3-on-surface-variant)]">
                            {fmtTime12(sale.date)} · {ageLabel(sale.date)}
                          </div>
                        </td>
                        <td className="max-w-[200px] truncate px-4 py-3 font-medium">{clientName(sale)}</td>
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            {sale.lignes.map((ligne, index) => (
                              <div key={index}>
                                <span className="tabular-nums text-[var(--m3-on-surface-variant)]">{ligne.qte} ×</span> {ligne.nom}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--m3-on-surface-variant)]">{fmtHTG(sale.total)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--m3-primary)]">{paid > 0 ? fmtHTG(paid) : '—'}</td>
                        <td className={'px-4 py-3 text-right font-semibold tabular-nums ' + (balance > 0 ? 'text-[#BA1A1A]' : 'text-[var(--m3-primary)]')}>
                          {balance > 0 ? fmtHTG(balance) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={'inline-flex h-7 items-center rounded-full px-3 text-xs font-medium ' + chip.cls}>{chip.label}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openPayment(clientName(sale), [sale])}
                              disabled={balance <= 0}
                              className={`${payBtn} ${balance > 0 ? payOn : payOff}`}
                            >
                              <M3StateLayer />
                              <Banknote size={16} />
                              Encaisser
                            </button>
                            <button type="button" onClick={() => setReceiptSale(sale)} className={iconBtn} aria-label="Voir le reçu" title="Voir le reçu">
                              <M3StateLayer />
                              <Eye size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {sortedSaleRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]">
                            <FileClock size={28} />
                          </span>
                          <span className="text-base font-medium">
                            {query || statusFilter === 'all' ? 'Aucune vente trouvée' : 'Aucune vente impayée'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {sheetClient &&
        createPortal(
          <>
            <div aria-hidden="true" onClick={() => setSheetKey(null)} className="fixed inset-0 z-[80] hidden bg-black/30 sm:block" />
            <aside
              key={sheetClient.nom.toLowerCase()}
              role="dialog"
              aria-modal="true"
              aria-label={`Crédits de ${sheetClient.nom}`}
              style={M3_VARS}
              className="m3-side fixed inset-y-0 right-0 z-[81] hidden w-[480px] max-w-full flex-col rounded-l-[28px] bg-[var(--m3-surface-container-low)] text-[var(--m3-on-surface)] shadow-[-8px_0_24px_rgba(0,0,0,0.16)] sm:flex"
            >
              <div className="flex shrink-0 items-start gap-4 px-6 pb-4 pt-6">
                <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--m3-tertiary-container)] text-lg font-semibold text-[var(--m3-on-tertiary-container)]">
                  {sheetClient.nom.trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xl font-medium leading-7">{sheetClient.nom}</div>
                  <div className="text-sm text-[var(--m3-on-surface-variant)]">
                    {plural(sheetClient.sales.length, 'vente')} à crédit · dernier achat {ageLabel(sheetClient.last)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSheetKey(null)}
                  aria-label="Fermer"
                  className={`group relative -mr-2 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}
                >
                  <M3StateLayer />
                  <X size={20} />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4">
                {(() => {
                  const pct = sheetClient.total > 0 ? Math.min(100, Math.round((sheetClient.paid / sheetClient.total) * 100)) : 0;
                  const owes = sheetClient.balance > 0;
                  return (
                    <div className="rounded-[28px] bg-[var(--m3-tertiary-container)] p-5 text-[var(--m3-on-tertiary-container)]">
                      <div className="text-sm font-medium opacity-80">{owes ? 'Solde dû' : 'Compte soldé'}</div>
                      <div className="mt-1 text-[36px] font-bold leading-10 tracking-tight tabular-nums">{fmtHTG(sheetClient.balance)}</div>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/40" role="progressbar" aria-label="Part déjà payée" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                        <div className="h-full rounded-full bg-[var(--m3-primary)]" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-1.5 flex justify-between text-xs tabular-nums opacity-80">
                        <span>Payé {fmtHTG(sheetClient.paid)}</span>
                        <span>Total {fmtHTG(sheetClient.total)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openPayment(sheetClient.nom, sheetClient.sales)}
                        disabled={!owes}
                        className={`group relative mt-4 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-full text-sm font-semibold ${M3_FOCUS} ${
                          owes
                            ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]'
                            : 'cursor-not-allowed bg-white/40 opacity-60'
                        }`}
                      >
                        <M3StateLayer />
                        <Banknote size={18} />
                        Encaisser tout le solde
                      </button>
                    </div>
                  );
                })()}

                <section>
                  <h3 className="mb-2 text-xs font-medium tracking-[0.03em] text-[var(--m3-on-surface-variant)]">Ventes à crédit</h3>
                  <ul className="space-y-2">
                    {sheetSales.map((sale) => {
                      const paid = creditPaid(sale);
                      const balance = creditBalance(sale);
                      const chip = statusChip[saleStatus(sale)];
                      return (
                        <li key={sale.id} className="rounded-[24px] bg-[var(--m3-surface-container)] p-4">
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium tabular-nums">{fmtDate(sale.date)} · {fmtTime12(sale.date)}</div>
                              <div className="text-xs text-[var(--m3-on-surface-variant)]">{ageLabel(sale.date)}</div>
                            </div>
                            <span className={'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ' + chip.cls}>{chip.label}</span>
                          </div>
                          <div className="mt-2 space-y-0.5 text-sm">
                            {sale.lignes.map((ligne, index) => (
                              <div key={index}>
                                <span className="font-medium tabular-nums text-[var(--m3-on-surface-variant)]">{ligne.qte} ×</span> {ligne.nom}
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-2xl bg-[var(--m3-surface-container-high)] px-2 py-1.5">
                              <div className="text-[11px] text-[var(--m3-on-surface-variant)]">Total</div>
                              <div className="text-sm font-semibold tabular-nums">{fmtHTG(sale.total)}</div>
                            </div>
                            <div className="rounded-2xl bg-[var(--m3-surface-container-high)] px-2 py-1.5">
                              <div className="text-[11px] text-[var(--m3-on-surface-variant)]">Payé</div>
                              <div className="text-sm font-semibold tabular-nums text-[var(--m3-primary)]">{paid > 0 ? fmtHTG(paid) : '—'}</div>
                            </div>
                            <div className="rounded-2xl bg-[var(--m3-surface-container-high)] px-2 py-1.5">
                              <div className="text-[11px] text-[var(--m3-on-surface-variant)]">Solde dû</div>
                              <div className={'text-sm font-bold tabular-nums ' + (balance > 0 ? 'text-[#BA1A1A]' : 'text-[var(--m3-primary)]')}>
                                {balance > 0 ? fmtHTG(balance) : '—'}
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openPayment(clientName(sale), [sale])}
                              disabled={balance <= 0}
                              className={`${payBtn} flex-1 ${balance > 0 ? payOn : payOff}`}
                            >
                              <M3StateLayer />
                              <Banknote size={16} />
                              Encaisser
                            </button>
                            <button type="button" onClick={() => setReceiptSale(sale)} className={`${iconBtn} bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]`} aria-label="Voir le reçu" title="Voir le reçu">
                              <M3StateLayer />
                              <Eye size={18} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </div>
            </aside>
          </>,
          document.body
        )}

      {receiptSale && <ReceiptModal sale={receiptSale} onClose={() => setReceiptSale(null)} />}

      {payTarget && (
        <CreditPaymentModal
          title={payTarget.title}
          sales={payTarget.sales}
          onClose={() => setPayTarget(null)}
          onConfirm={(montant, mode) => {
            onPay(payTarget.sales, montant, mode);
            setPayTarget(null);
          }}
        />
      )}
    </>
  );
}

function BranchAnalyticsSection({
  branch,
  ventes,
  products,
}: {
  branch: Branch;
  ventes: SaleRecord[];
  products: Product[];
}) {
  const totalRevenue = ventes.reduce((s, v) => s + v.total, 0);

  const totalProfit = ventes.reduce((s, v) => {
    const saleProfit = v.lignes.reduce((acc, l) => {
      const p = products.find((prod) => prod.nom === l.nom);
      const cost = p ? p.prixAchat * l.qte : 0;
      return acc + (l.sousTotal - cost);
    }, 0);
    return s + saleProfit - (v.remise ?? 0);
  }, 0);

  const productPerformance = products.map((p) => {
    const qteVendue = ventes
      .flatMap((v) => v.lignes)
      .filter((l) => l.nom === p.nom)
      .reduce((s, l) => s + l.qte, 0);
    return { nom: p.nom, qte: qteVendue, stock: p.stockFermeture };
  });

  const topSellers = [...productPerformance].sort((a, b) => b.qte - a.qte).slice(0, 5);
  const slowestMovers = [...productPerformance].sort((a, b) => a.qte - b.qte).slice(0, 5);

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d;
  });
  const revenueByDay = last7Days.map((day) => ({
    label: day.toLocaleDateString('fr-HT', { weekday: 'short' }),
    total: ventes.filter((v) => v.date.toDateString() === day.toDateString()).reduce((s, v) => s + v.total, 0),
  }));
  const maxDayRevenue = Math.max(...revenueByDay.map((d) => d.total), 1);

  return (
    <>
      {/* Phone: Material 3 */}
      <div className="space-y-3 sm:hidden">
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2 rounded-[28px] bg-[var(--m3-primary-container)] p-5 text-[var(--m3-on-primary-container)]">
            <div className="flex items-center gap-1.5 text-xs font-medium opacity-80">
              <TrendingUp size={14} /> Profit net estimé
            </div>
            <div className="mt-1 break-words text-[28px] font-bold leading-9 tracking-tight tabular-nums">{fmtHTG(totalProfit)}</div>
          </div>
          <div className="min-w-0 rounded-[20px] bg-[var(--m3-surface-container)] p-4">
            <div className="text-xs text-[var(--m3-on-surface-variant)]">Revenu total</div>
            <div className="mt-1 truncate text-lg font-medium tabular-nums">{fmtHTG(totalRevenue)}</div>
          </div>
          <div className="min-w-0 rounded-[20px] bg-[var(--m3-surface-container)] p-4">
            <div className="text-xs text-[var(--m3-on-surface-variant)]">Nombre de ventes</div>
            <div className="mt-1 truncate text-lg font-medium tabular-nums">{ventes.length}</div>
          </div>
        </div>

        <section className="rounded-[28px] bg-[var(--m3-surface-container-low)] p-4">
          <h3 className="text-base font-medium">Revenus — 7 derniers jours</h3>
          <div className="mt-4 flex h-40 items-stretch gap-2">
            {revenueByDay.map((d, i) => (
              <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className={'w-full rounded-t-[10px] rounded-b-[4px] ' + (d.total > 0 && d.total === maxDayRevenue ? 'bg-[var(--m3-primary)]' : 'bg-[var(--m3-outline-variant)]')}
                    style={{ height: `${Math.max((d.total / maxDayRevenue) * 100, d.total > 0 ? 4 : 2)}%` }}
                  />
                </div>
                <div className="text-[11px] capitalize text-[var(--m3-on-surface-variant)]">{d.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] bg-[var(--m3-surface-container-low)] p-4">
          <h3 className="text-base font-medium">Performance — {branch.nom.split(' ').pop()}</h3>
          {[
            { title: 'Meilleures ventes', tone: 'text-[var(--m3-primary)]', list: topSellers },
            { title: 'Ventes faibles', tone: 'text-[#BA1A1A]', list: slowestMovers },
          ].map((g) => (
            <div key={g.title} className="mt-4">
              <div className={'mb-1 text-xs font-medium ' + g.tone}>{g.title}</div>
              <div className="divide-y divide-[var(--m3-outline-variant)]">
                {g.list.map((p) => (
                  <div key={p.nom} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0 truncate">{p.nom}</span>
                    <span className="shrink-0 rounded-full bg-[var(--m3-surface-container-high)] px-2.5 py-0.5 text-xs font-medium tabular-nums">{p.qte} u.</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>

    <div style={M3_VARS} className="hidden space-y-5 font-sans text-[var(--m3-on-surface)] sm:block">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="flex items-center gap-4 rounded-[28px] bg-[var(--m3-primary-container)] px-6 py-5 text-[var(--m3-on-primary-container)] md:order-2">
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/40">
            <TrendingUp size={24} />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium opacity-80">Profit net estimé</div>
            <div className="break-words text-[28px] font-bold leading-9 tracking-tight tabular-nums">{fmtHTG(totalProfit)}</div>
          </div>
        </div>
        <div className="rounded-[28px] bg-[var(--m3-surface-container)] px-6 py-5 md:order-1">
          <div className="text-sm text-[var(--m3-on-surface-variant)]">Revenu total</div>
          <div className="mt-1 break-words text-[28px] font-bold leading-9 tracking-tight tabular-nums">{fmtHTG(totalRevenue)}</div>
        </div>
        <div className="rounded-[28px] bg-[var(--m3-surface-container)] px-6 py-5 md:order-3">
          <div className="text-sm text-[var(--m3-on-surface-variant)]">Nombre de ventes</div>
          <div className="mt-1 break-words text-[28px] font-bold leading-9 tracking-tight tabular-nums">{ventes.length}</div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-[28px] bg-[var(--m3-surface-container)] p-5">
          <h3 className="text-base font-medium">Revenus — 7 derniers jours</h3>
          <div className="mt-5 flex h-48 items-stretch gap-3">
            {revenueByDay.map((d, i) => (
              <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-2" title={fmtHTG(d.total)}>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className={'w-full rounded-t-[12px] rounded-b-[4px] transition-[height] duration-500 motion-reduce:transition-none ' + (d.total > 0 && d.total === maxDayRevenue ? 'bg-[var(--m3-primary)]' : 'bg-[var(--m3-outline-variant)]')}
                    style={{ height: `${Math.max((d.total / maxDayRevenue) * 100, d.total > 0 ? 4 : 2)}%` }}
                  />
                </div>
                <div className="text-xs capitalize text-[var(--m3-on-surface-variant)]">{d.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] bg-[var(--m3-surface-container)] p-5">
          <h3 className="text-base font-medium">Performance — {branch.nom.split(' ').pop()}</h3>
          <div className="mt-4 grid grid-cols-2 gap-5">
            {[
              { title: 'Meilleures ventes', tone: 'text-[var(--m3-primary)]', list: topSellers },
              { title: 'Ventes faibles', tone: 'text-[#BA1A1A]', list: slowestMovers },
            ].map((g) => (
              <div key={g.title} className="min-w-0">
                <div className={'mb-1 text-xs font-medium ' + g.tone}>{g.title}</div>
                <div className="divide-y divide-[var(--m3-outline-variant)]">
                  {g.list.map((p) => (
                    <div key={p.nom} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0 truncate">{p.nom}</span>
                      <span className="shrink-0 rounded-full bg-[var(--m3-surface-container-high)] px-2.5 py-0.5 text-xs font-medium tabular-nums">{p.qte} u.</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
    </>
  );
}

/* =========================================================================
   RAPPORTS — Journalier / Mensuel / Annuel
   Cash net = Brut − Crédits − Consommations internes − Achats + Renflouements + Remboursements
   Cash en main = Cash net − paiements mobiles (MonCash / NatCash)
   ========================================================================= */

const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function DailyReportDesktop({
  ventes,
  entries,
  selectedDate,
  onAddEntry,
  onDeleteEntry,
}: {
  ventes: SaleRecord[];
  entries: CashEntry[];
  selectedDate: Date;
  onAddEntry: (entry: Omit<CashEntry, 'id' | 'branchId'>) => void;
  onDeleteEntry: (id: string) => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const inDay = (d: Date) => isSameDay(d, selectedDate);
  const sum = useMemo(() => summarizeCash(ventes, entries, inDay), [ventes, entries, selectedDate]); // eslint-disable-line
  const dayEntries = entries.filter((e) => inDay(e.date)).sort((a, b) => b.date.getTime() - a.date.getTime());
  const dateLabel = selectedDate.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const totalDeductions = sum.credits + sum.consommations + sum.achats;
  const totalAdditions = sum.renflouements + sum.remboursements;

  // Sales split by payment mode for the day
  const byMode = PAYMENT_METHODS.map((m) => {
    const list = ventes.filter((v) => v.statut !== 'annulee' && inDay(v.date) && v.paiement === m.id);
    return { ...m, total: list.reduce((acc, v) => acc + v.total, 0), count: list.length };
  });
  const maxMode = Math.max(...byMode.map((m) => m.total), 1);

  const rowBtn = `group relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`;

  const ledgerRow = (label: string, value: number, sign: '-' | '+', hint?: string) => (
    <div key={label} className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs leading-4 text-[var(--m3-on-surface-variant)]">{hint}</div>}
      </div>
      <div className={'shrink-0 text-sm font-medium tabular-nums ' + (sign === '-' ? 'text-[#BA1A1A]' : 'text-[var(--m3-primary)]')}>
        {sign === '-' ? '−' : '+'} {fmtHTG(value)}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Title bar */}
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[32px] font-bold leading-10 tracking-tight">Rapport journalier</h2>
          <p className="truncate text-sm capitalize text-[var(--m3-on-surface-variant)]">
            {dateLabel} · {sum.nbVentes} vente{sum.nbVentes !== 1 ? 's' : ''} validée{sum.nbVentes !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className={`group relative flex h-12 shrink-0 items-center gap-2 overflow-hidden rounded-[20px] bg-[var(--m3-primary)] px-6 text-sm font-semibold text-[var(--m3-on-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.3),0_1px_2px_rgba(0,0,0,0.15)] transition-[box-shadow,transform] hover:shadow-[0_2px_6px_2px_rgba(0,0,0,0.15),0_1px_2px_rgba(0,0,0,0.3)] active:scale-[0.96] motion-reduce:transition-none ${M3_FOCUS}`}
        >
          <M3StateLayer />
          <Plus size={20} />
          Nouveau mouvement
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="col-span-2 flex items-center gap-4 rounded-[28px] bg-[var(--m3-primary-container)] px-6 py-5 text-[var(--m3-on-primary-container)] lg:col-span-1">
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/40">
            <Banknote size={24} />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium opacity-80">Cash en main</div>
            <div className="break-words text-[28px] font-bold leading-9 tracking-tight tabular-nums">{fmtHTG(sum.cashEnMain)}</div>
          </div>
        </div>
        <div className="rounded-[28px] bg-[var(--m3-surface-container)] px-5 py-5">
          <div className="text-sm text-[var(--m3-on-surface-variant)]">Total brut</div>
          <div className="mt-1 truncate text-xl font-semibold leading-7 tabular-nums">{fmtHTG(sum.brut)}</div>
        </div>
        <div className={`rounded-[28px] px-5 py-5 ${M3_STATUS.out.bg} ${M3_STATUS.out.fg}`}>
          <div className="flex items-center gap-1.5 text-sm opacity-80">
            <ArrowUpRight size={14} /> Déductions
          </div>
          <div className="mt-1 truncate text-xl font-semibold leading-7 tabular-nums">− {fmtHTG(totalDeductions)}</div>
        </div>
        <div className="rounded-[28px] bg-[var(--m3-secondary-container)] px-5 py-5 text-[var(--m3-on-secondary-container)]">
          <div className="flex items-center gap-1.5 text-sm opacity-80">
            <ArrowDownLeft size={14} /> Additions
          </div>
          <div className="mt-1 truncate text-xl font-semibold leading-7 tabular-nums">+ {fmtHTG(totalAdditions)}</div>
        </div>
        <div className="col-span-2 rounded-[28px] bg-[var(--m3-surface-container)] px-5 py-5 lg:col-span-1">
          <div className="text-sm text-[var(--m3-on-surface-variant)]">Cash net</div>
          <div className="mt-1 truncate text-xl font-semibold leading-7 tabular-nums">{fmtHTG(sum.cashNet)}</div>
        </div>
      </div>

      {/* Ledger (left) + payment modes (right) */}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-[28px] bg-[var(--m3-surface-container)] p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-medium">Détail de la caisse</h3>
            <span className="rounded-full bg-[var(--m3-surface-container-high)] px-3 py-1 text-xs font-medium tabular-nums">Brut {fmtHTG(sum.brut)}</span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-[20px] bg-[var(--m3-surface-container-low)] p-4">
              <div className="text-xs font-medium text-[#BA1A1A]">Déductions</div>
              <div className="divide-y divide-[var(--m3-outline-variant)]">
                {ledgerRow('Crédits', sum.credits, '-', 'Ventes à crédit non encaissées')}
                {ledgerRow('Consommations internes', sum.consommations, '-')}
                {ledgerRow('Achats', sum.achats, '-')}
              </div>
              <div className="flex items-center justify-between border-t border-[var(--m3-outline)] pt-3 text-sm font-medium">
                <span>Total déductions</span>
                <span className="tabular-nums text-[#BA1A1A]">− {fmtHTG(totalDeductions)}</span>
              </div>
            </div>
            <div className="rounded-[20px] bg-[var(--m3-surface-container-low)] p-4">
              <div className="text-xs font-medium text-[var(--m3-primary)]">Additions</div>
              <div className="divide-y divide-[var(--m3-outline-variant)]">
                {ledgerRow('Renflouement', sum.renflouements, '+')}
                {ledgerRow('Remboursement', sum.remboursements, '+', 'Crédits reçus + saisies manuelles')}
              </div>
              <div className="flex items-center justify-between border-t border-[var(--m3-outline)] pt-3 text-sm font-medium">
                <span>Total additions</span>
                <span className="tabular-nums text-[var(--m3-primary)]">+ {fmtHTG(totalAdditions)}</span>
              </div>
            </div>
          </div>

          {/* Equation strip */}
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="min-w-0 rounded-[20px] bg-[var(--m3-surface-container-high)] p-4">
              <div className="text-xs text-[var(--m3-on-surface-variant)]">Cash net</div>
              <div className="mt-1 truncate text-lg font-semibold tabular-nums">{fmtHTG(sum.cashNet)}</div>
            </div>
            <div className={`min-w-0 rounded-[20px] p-4 ${M3_STATUS.out.bg} ${M3_STATUS.out.fg}`}>
              <div className="text-xs opacity-80">− Paiements mobiles</div>
              <div className="mt-1 truncate text-lg font-semibold tabular-nums">{fmtHTG(sum.mobile)}</div>
              <div className="text-[11px] opacity-80">MonCash / NatCash</div>
            </div>
            <div className="min-w-0 rounded-[20px] bg-[var(--m3-primary-container)] p-4 text-[var(--m3-on-primary-container)]">
              <div className="text-xs opacity-80">= Cash en main</div>
              <div className="mt-1 truncate text-lg font-bold tabular-nums">{fmtHTG(sum.cashEnMain)}</div>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] bg-[var(--m3-surface-container)] p-5">
          <h3 className="text-base font-medium">Ventes par mode de paiement</h3>
          <div className="mt-4 space-y-4">
            {byMode.map((m) => {
              const Icon = m.icon;
              const bar = m.id === 'credit' ? 'bg-[var(--m3-tertiary)]' : m.id === 'especes' ? 'bg-[var(--m3-primary)]' : 'bg-[var(--m3-outline)]';
              return (
                <div key={m.id}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]">
                      <Icon size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{m.label}</div>
                      <div className="text-xs text-[var(--m3-on-surface-variant)]">
                        {m.count} vente{m.count !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="shrink-0 text-sm font-medium tabular-nums">{fmtHTG(m.total)}</div>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--m3-surface-container-highest)]">
                    <div className={'h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ' + bar} style={{ width: `${(m.total / maxMode) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Movements table */}
      <div className="overflow-hidden rounded-[28px] bg-[var(--m3-surface-container)]">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h3 className="text-base font-medium">Mouvements du jour</h3>
          <span className="rounded-full bg-[var(--m3-surface-container-high)] px-2.5 py-0.5 text-xs font-medium tabular-nums">{dayEntries.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead className="bg-[var(--m3-surface-container-high)] text-xs text-[var(--m3-on-surface-variant)]">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Heure</th>
                <th scope="col" className="px-4 py-3 font-medium">Type</th>
                <th scope="col" className="px-4 py-3 font-medium">Note</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Montant</th>
                <th scope="col" className="w-16 px-3 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {dayEntries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-14 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]">
                        <Banknote size={28} />
                      </span>
                      <span className="text-base font-medium">Aucun mouvement pour cette date.</span>
                      <span className="text-sm text-[var(--m3-on-surface-variant)]">Ajoutez une consommation, un achat ou un renflouement.</span>
                    </div>
                  </td>
                </tr>
              )}
              {dayEntries.map((e) => {
                const meta = CASH_ENTRY_META[e.type];
                const out = meta.sign === -1;
                return (
                  <tr key={e.id} className="border-b border-[var(--m3-outline-variant)]/60 transition-colors last:border-b-0 hover:bg-[var(--m3-surface-container-high)] motion-reduce:transition-none">
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-[var(--m3-on-surface-variant)]">{fmtTime12(e.date)}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          className={
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full ' +
                            (out ? `${M3_STATUS.out.bg} ${M3_STATUS.out.fg}` : 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]')
                          }
                        >
                          {out ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                        </span>
                        <span className="font-medium">{meta.label}</span>
                      </span>
                    </td>
                    <td className="max-w-[260px] truncate px-4 py-3 text-[var(--m3-on-surface-variant)]">{e.note ?? '—'}</td>
                    <td className={'whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums ' + (out ? 'text-[#BA1A1A]' : 'text-[var(--m3-primary)]')}>
                      {out ? '−' : '+'} {fmtHTG(e.montant)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button type="button" onClick={() => onDeleteEntry(e.id)} aria-label="Supprimer" className={rowBtn}>
                        <M3StateLayer />
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {sheetOpen && <CashEntrySheet date={selectedDate} onAdd={onAddEntry} onClose={() => setSheetOpen(false)} />}
    </div>
  );
}

function PeriodReportDesktop({
  mode,
  ventes,
  entries,
  selectedDate,
}: {
  mode: 'monthly' | 'annual';
  ventes: SaleRecord[];
  entries: CashEntry[];
  selectedDate: Date;
}) {
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();

  const rows = useMemo(() => {
    if (mode === 'monthly') {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      return Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const inPeriod = (d: Date) => d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
        return { label: String(day).padStart(2, '0') + ' ' + MONTHS_FR[month].slice(0, 3), sum: summarizeCash(ventes, entries, inPeriod) };
      });
    }
    return MONTHS_FR.map((name, m) => {
      const inPeriod = (d: Date) => d.getFullYear() === year && d.getMonth() === m;
      return { label: name, sum: summarizeCash(ventes, entries, inPeriod) };
    });
  }, [mode, ventes, entries, year, month]);

  const total = useMemo(() => {
    const inPeriod =
      mode === 'monthly'
        ? (d: Date) => d.getFullYear() === year && d.getMonth() === month
        : (d: Date) => d.getFullYear() === year;
    return summarizeCash(ventes, entries, inPeriod);
  }, [mode, ventes, entries, year, month]);

  const title = mode === 'monthly' ? `${MONTHS_FR[month]} ${year}` : String(year);
  const visibleRows = rows.filter((r) => r.sum.nbVentes > 0 || r.sum.achats + r.sum.consommations + r.sum.renflouements + r.sum.remboursements > 0);

  const err = 'text-[#BA1A1A]';
  const pos = 'text-[var(--m3-primary)]';
  const cols: Array<{ key: string; label: string; get: (s: CashSummary) => number; tone?: string }> = [
    { key: 'brut', label: 'Total brut', get: (s) => s.brut },
    { key: 'credits', label: 'Crédits', get: (s) => s.credits, tone: err },
    { key: 'conso', label: 'Conso. internes', get: (s) => s.consommations, tone: err },
    { key: 'achats', label: 'Achats', get: (s) => s.achats, tone: err },
    { key: 'renf', label: 'Renflouement', get: (s) => s.renflouements, tone: pos },
    { key: 'remb', label: 'Remboursement', get: (s) => s.remboursements, tone: pos },
    { key: 'net', label: 'Cash net', get: (s) => s.cashNet },
    { key: 'main', label: 'Cash en main', get: (s) => s.cashEnMain, tone: 'font-semibold ' + pos },
  ];

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <h2 className="text-[32px] font-bold leading-10 tracking-tight">{mode === 'monthly' ? 'Rapport mensuel' : 'Rapport annuel'}</h2>
        <p className="truncate text-sm text-[var(--m3-on-surface-variant)]">
          {title} · {mode === 'monthly' ? 'Change le mois avec le sélecteur de date en haut.' : "Change l'année avec le sélecteur de date en haut."}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="flex items-center gap-4 rounded-[28px] bg-[var(--m3-primary-container)] px-6 py-5 text-[var(--m3-on-primary-container)] md:order-last">
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/40">
            <Banknote size={24} />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium opacity-80">Cash en main — {title}</div>
            <div className="break-words text-[28px] font-bold leading-9 tracking-tight tabular-nums">{fmtHTG(total.cashEnMain)}</div>
          </div>
        </div>
        <div className="rounded-[28px] bg-[var(--m3-surface-container)] px-6 py-5">
          <div className="text-sm text-[var(--m3-on-surface-variant)]">Total brut — {title}</div>
          <div className="mt-1 break-words text-[28px] font-bold leading-9 tracking-tight tabular-nums">{fmtHTG(total.brut)}</div>
        </div>
        <div className="rounded-[28px] bg-[var(--m3-surface-container)] px-6 py-5">
          <div className="text-sm text-[var(--m3-on-surface-variant)]">Cash net</div>
          <div className="mt-1 break-words text-[28px] font-bold leading-9 tracking-tight tabular-nums">{fmtHTG(total.cashNet)}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[28px] bg-[var(--m3-surface-container)]">
        <div className="flex items-baseline justify-between px-5 pb-2 pt-4">
          <h3 className="text-base font-medium">{mode === 'monthly' ? 'Par jour' : 'Par mois'}</h3>
          <span className="text-sm tabular-nums text-[var(--m3-on-surface-variant)]">
            {visibleRows.length} {mode === 'monthly' ? 'jour' : 'mois'}{visibleRows.length !== 1 && mode === 'monthly' ? 's' : ''} actif{visibleRows.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="max-h-[62vh] overflow-auto">
          <table className="w-full min-w-[860px] border-collapse text-right text-sm tabular-nums">
            <thead className="sticky top-0 z-10 bg-[var(--m3-surface-container-high)] text-xs text-[var(--m3-on-surface-variant)] shadow-[0_1px_0_var(--m3-outline-variant)]">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">{mode === 'monthly' ? 'Jour' : 'Mois'}</th>
                {cols.map((c) => (
                  <th key={c.key} scope="col" className="px-4 py-3 font-medium">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={cols.length + 1} className="px-4 py-12 text-center text-sm text-[var(--m3-on-surface-variant)]">
                    Aucune activité sur cette période.
                  </td>
                </tr>
              )}
              {visibleRows.map((r) => (
                <tr key={r.label} className="border-b border-[var(--m3-outline-variant)]/60 transition-colors last:border-b-0 hover:bg-[var(--m3-surface-container-high)] motion-reduce:transition-none">
                  <td className="px-4 py-3 text-left font-medium">{r.label}</td>
                  {cols.map((c) => (
                    <td key={c.key} className={'px-4 py-3 ' + (c.tone ?? '')}>
                      {c.get(r.sum) === 0 ? <span className="text-[var(--m3-outline)]">—</span> : fmtHTG(c.get(r.sum))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]">
                <td className="px-4 py-3.5 text-left text-sm font-semibold">Total</td>
                {cols.map((c) => (
                  <td key={c.key} className="px-4 py-3.5 font-semibold">{fmtHTG(c.get(total))}</td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------- Phone versions of the Rapports tab ----------
   Both phone and desktop are Material 3 Expressive: DailyReportDesktop / PeriodReportDesktop above
   are the roomy tables/cards; below the `sm` breakpoint these thumb-friendly layouts are shown instead. */

/* Bottom sheet to record a cash movement (replaces the inline form on the phone). */
function CashEntrySheet({
  date,
  onAdd,
  onClose,
}: {
  date: Date;
  onAdd: (entry: Omit<CashEntry, 'id' | 'branchId'>) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<CashEntryType>('consommation');
  const [montant, setMontant] = useState('');
  const [note, setNote] = useState('');
  const value = Number(montant);
  const valid = Number.isFinite(value) && value > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = () => {
    if (!valid) return;
    const when = new Date(date);
    const now = new Date();
    when.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
    onAdd({ date: when, type, montant: value, note: note.trim() || undefined });
    onClose();
  };

  const field =
    'block min-w-0 rounded-xl bg-[var(--m3-surface)] px-4 pb-1.5 pt-2 ring-1 ring-[var(--m3-outline)] transition-shadow focus-within:ring-2 focus-within:ring-[var(--m3-primary)] motion-reduce:transition-none';
  const input = 'h-8 w-full min-w-0 bg-transparent p-0 text-base text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)]';

  return createPortal(
    <>
      <div aria-hidden="true" onClick={onClose} className="m3-scrim fixed inset-0 z-[80] bg-black/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nouveau mouvement de caisse"
        style={M3_VARS}
        className="m3-sheet fixed inset-x-0 bottom-0 z-[81] max-h-[90vh] w-full overflow-y-auto rounded-t-[28px] bg-[var(--m3-surface-container-low)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 text-[var(--m3-on-surface)] shadow-[0_-8px_24px_rgba(0,0,0,0.16)] sm:inset-x-auto sm:inset-y-0 sm:bottom-auto sm:right-0 sm:h-full sm:max-h-none sm:w-[480px] sm:max-w-full sm:rounded-l-[28px] sm:rounded-tr-none sm:px-6 sm:pt-6 sm:shadow-[-8px_0_24px_rgba(0,0,0,0.16)] sm:[animation:m3-side-in_.4s_var(--m3-spring-effects)]"
      >
        <div className="mx-auto mb-3 mt-1 h-1 w-8 rounded-full bg-[var(--m3-outline-variant)] sm:hidden" />
        <div className="px-2 pb-3">
          <div className="text-xs font-medium text-[var(--m3-on-surface-variant)]">Caisse</div>
          <div className="mt-1 text-[24px] font-normal leading-8">Nouveau mouvement</div>
        </div>

        <div role="group" aria-label="Type de mouvement" className="grid grid-cols-2 gap-2">
          {(Object.keys(CASH_ENTRY_META) as CashEntryType[]).map((t) => {
            const selected = type === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                aria-pressed={selected}
                className={
                  'flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-medium m3-press motion-reduce:transition-none ' +
                  M3_FOCUS +
                  ' ' +
                  (selected
                    ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
                    : 'border border-[var(--m3-outline)] text-[var(--m3-on-surface-variant)]')
                }
              >
                {selected && <Check size={16} className="shrink-0" />}
                <span className="truncate">
                  {CASH_ENTRY_META[t].sign === -1 ? '− ' : '+ '}
                  {CASH_ENTRY_META[t].label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 space-y-2">
          <label className={field}>
            <span className="block text-xs leading-4 text-[var(--m3-on-surface-variant)]">Montant (HTG)</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="0"
              className={input + ' tabular-nums'}
            />
          </label>
          <label className={field}>
            <span className="block text-xs leading-4 text-[var(--m3-on-surface-variant)]">Note (optionnel)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              className={input}
            />
          </label>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className={`h-12 shrink-0 rounded-full px-6 text-sm font-medium text-[var(--m3-primary)] active:bg-[var(--m3-surface-container-highest)] ${M3_FOCUS}`}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid}
            className={
              `group relative flex h-12 flex-1 items-center justify-center gap-2 overflow-hidden rounded-full text-sm font-medium m3-press motion-reduce:transition-none ${M3_FOCUS} ` +
              (valid
                ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]'
                : 'cursor-not-allowed bg-[var(--m3-surface-container-highest)] text-[var(--m3-outline)]')
            }
          >
            {valid && <M3StateLayer />}
            <Plus size={18} /> Ajouter
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

function DailyReportMobile({
  ventes,
  entries,
  selectedDate,
  onAddEntry,
  onDeleteEntry,
}: {
  ventes: SaleRecord[];
  entries: CashEntry[];
  selectedDate: Date;
  onAddEntry: (entry: Omit<CashEntry, 'id' | 'branchId'>) => void;
  onDeleteEntry: (id: string) => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const inDay = (d: Date) => isSameDay(d, selectedDate);
  const sum = useMemo(() => summarizeCash(ventes, entries, inDay), [ventes, entries, selectedDate]); // eslint-disable-line
  const dayEntries = entries.filter((e) => inDay(e.date)).sort((a, b) => b.date.getTime() - a.date.getTime());

  const totalDeductions = sum.credits + sum.consommations + sum.achats;
  const totalAdditions = sum.renflouements + sum.remboursements;

  const byMode = PAYMENT_METHODS.map((m) => {
    const list = ventes.filter((v) => v.statut !== 'annulee' && inDay(v.date) && v.paiement === m.id);
    return { ...m, total: list.reduce((acc, v) => acc + v.total, 0), count: list.length };
  });
  const maxMode = Math.max(...byMode.map((m) => m.total), 1);

  const line = (label: string, value: number, sign: '-' | '+', hint?: string) => (
    <div key={label} className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs leading-4 text-[var(--m3-on-surface-variant)]">{hint}</div>}
      </div>
      <div className={'shrink-0 text-sm font-medium tabular-nums ' + (sign === '-' ? 'text-[#BA1A1A]' : 'text-[var(--m3-primary)]')}>
        {sign === '-' ? '−' : '+'} {fmtHTG(value)}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Hero: cash en main */}
      <section className="rounded-[28px] bg-[var(--m3-primary-container)] p-5 text-[var(--m3-on-primary-container)]">
        <div className="text-xs font-medium opacity-80">Cash en main</div>
        <div className="mt-1 break-words text-[32px] font-bold leading-10 tracking-tight tabular-nums">{fmtHTG(sum.cashEnMain)}</div>
        <div className="mt-1 text-xs opacity-80">
          {sum.nbVentes} vente{sum.nbVentes !== 1 ? 's' : ''} validée{sum.nbVentes !== 1 ? 's' : ''}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="min-w-0 rounded-[20px] bg-white/45 p-3">
            <div className="text-xs opacity-80">Cash net</div>
            <div className="truncate text-base font-medium tabular-nums">{fmtHTG(sum.cashNet)}</div>
          </div>
          <div className="min-w-0 rounded-[20px] bg-white/45 p-3">
            <div className="truncate text-xs opacity-80">− Paiements mobiles</div>
            <div className="truncate text-base font-medium tabular-nums">{fmtHTG(sum.mobile)}</div>
          </div>
        </div>
      </section>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 flex items-center justify-between gap-3 rounded-[20px] bg-[var(--m3-surface-container)] p-4">
          <span className="text-sm text-[var(--m3-on-surface-variant)]">Total brut</span>
          <span className="text-lg font-medium tabular-nums">{fmtHTG(sum.brut)}</span>
        </div>
        <div className={`min-w-0 rounded-[20px] p-4 ${M3_STATUS.out.bg} ${M3_STATUS.out.fg}`}>
          <div className="flex items-center gap-1.5 text-xs opacity-80">
            <ArrowUpRight size={14} /> Déductions
          </div>
          <div className="mt-1 truncate text-lg font-medium tabular-nums">− {fmtHTG(totalDeductions)}</div>
        </div>
        <div className="min-w-0 rounded-[20px] bg-[var(--m3-secondary-container)] p-4 text-[var(--m3-on-secondary-container)]">
          <div className="flex items-center gap-1.5 text-xs opacity-80">
            <ArrowDownLeft size={14} /> Additions
          </div>
          <div className="mt-1 truncate text-lg font-medium tabular-nums">+ {fmtHTG(totalAdditions)}</div>
        </div>
      </div>

      {/* Ledger */}
      <section className="rounded-[28px] bg-[var(--m3-surface-container-low)] p-4">
        <h3 className="text-base font-medium">Détail de la caisse</h3>

        <div className="mt-3 text-xs font-medium text-[#BA1A1A]">Déductions</div>
        <div className="divide-y divide-[var(--m3-outline-variant)]">
          {line('Crédits', sum.credits, '-', 'Ventes à crédit non encaissées')}
          {line('Consommations internes', sum.consommations, '-')}
          {line('Achats', sum.achats, '-')}
        </div>
        <div className="flex items-center justify-between border-t border-[var(--m3-outline)] pt-3 text-sm font-medium">
          <span>Total déductions</span>
          <span className="tabular-nums text-[#BA1A1A]">− {fmtHTG(totalDeductions)}</span>
        </div>

        <div className="mt-5 text-xs font-medium text-[var(--m3-primary)]">Additions</div>
        <div className="divide-y divide-[var(--m3-outline-variant)]">
          {line('Renflouement', sum.renflouements, '+')}
          {line('Remboursement', sum.remboursements, '+', 'Crédits reçus + saisies manuelles')}
        </div>
        <div className="flex items-center justify-between border-t border-[var(--m3-outline)] pt-3 text-sm font-medium">
          <span>Total additions</span>
          <span className="tabular-nums text-[var(--m3-primary)]">+ {fmtHTG(totalAdditions)}</span>
        </div>
      </section>

      {/* Payment modes */}
      <section className="rounded-[28px] bg-[var(--m3-surface-container-low)] p-4">
        <h3 className="text-base font-medium">Ventes par mode de paiement</h3>
        <div className="mt-3 space-y-4">
          {byMode.map((m) => {
            const Icon = m.icon;
            const bar = m.id === 'credit' ? 'bg-[var(--m3-tertiary)]' : m.id === 'especes' ? 'bg-[var(--m3-primary)]' : 'bg-[var(--m3-outline)]';
            return (
              <div key={m.id}>
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]">
                    <Icon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{m.label}</div>
                    <div className="text-xs text-[var(--m3-on-surface-variant)]">
                      {m.count} vente{m.count !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="shrink-0 text-sm font-medium tabular-nums">{fmtHTG(m.total)}</div>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--m3-surface-container-highest)]">
                  <div className={'h-full rounded-full ' + bar} style={{ width: `${(m.total / maxMode) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Movements */}
      <section>
        <div className="flex items-center justify-between px-1 pb-2 pt-1">
          <h3 className="text-base font-medium">Mouvements du jour</h3>
          <span className="rounded-full bg-[var(--m3-surface-container-high)] px-2.5 py-0.5 text-xs font-medium tabular-nums">{dayEntries.length}</span>
        </div>
        {dayEntries.length === 0 ? (
          <div className="rounded-[28px] bg-[var(--m3-surface-container-low)] px-4 py-8 text-center text-sm text-[var(--m3-on-surface-variant)]">
            Aucun mouvement pour cette date.
          </div>
        ) : (
          <ul className="space-y-2">
            {dayEntries.map((e) => {
              const meta = CASH_ENTRY_META[e.type];
              const out = meta.sign === -1;
              return (
                <li key={e.id} className="flex items-center gap-3 rounded-[20px] bg-[var(--m3-surface-container)] py-2 pl-3 pr-1">
                  <span
                    className={
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full ' +
                      (out ? `${M3_STATUS.out.bg} ${M3_STATUS.out.fg}` : 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]')
                    }
                  >
                    {out ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{meta.label}</div>
                    <div className="truncate text-xs text-[var(--m3-on-surface-variant)]">
                      {fmtTime12(e.date)}
                      {e.note ? ` · ${e.note}` : ''}
                    </div>
                  </div>
                  <div className={'shrink-0 text-sm font-medium tabular-nums ' + (out ? 'text-[#BA1A1A]' : 'text-[var(--m3-primary)]')}>
                    {out ? '−' : '+'} {fmtHTG(e.montant)}
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteEntry(e.id)}
                    aria-label="Supprimer"
                    className={`group relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}
                  >
                    <M3StateLayer />
                    <Trash2 size={20} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* FAB */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className={`group fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 shrink-0 items-center justify-center gap-3 overflow-hidden rounded-[20px] bg-[var(--m3-primary-container)] px-6 text-base font-semibold tracking-[0.01em] text-[var(--m3-on-primary-container)] shadow-[0_3px_8px_3px_rgba(0,0,0,0.15),0_1px_3px_rgba(0,0,0,0.3)] m3-press motion-reduce:transition-none ${M3_FOCUS}`}
      >
        <M3StateLayer />
        <Plus className="h-6 w-6" />
        Mouvement
      </button>
      {sheetOpen && <CashEntrySheet date={selectedDate} onAdd={onAddEntry} onClose={() => setSheetOpen(false)} />}
    </div>
  );
}

function PeriodReportMobile({
  mode,
  ventes,
  entries,
  selectedDate,
}: {
  mode: 'monthly' | 'annual';
  ventes: SaleRecord[];
  entries: CashEntry[];
  selectedDate: Date;
}) {
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const [openRow, setOpenRow] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (mode === 'monthly') {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      return Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const inPeriod = (d: Date) => d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
        return { label: String(day).padStart(2, '0') + ' ' + MONTHS_FR[month].slice(0, 3), sum: summarizeCash(ventes, entries, inPeriod) };
      });
    }
    return MONTHS_FR.map((name, m) => {
      const inPeriod = (d: Date) => d.getFullYear() === year && d.getMonth() === m;
      return { label: name, sum: summarizeCash(ventes, entries, inPeriod) };
    });
  }, [mode, ventes, entries, year, month]);

  const total = useMemo(() => {
    const inPeriod =
      mode === 'monthly'
        ? (d: Date) => d.getFullYear() === year && d.getMonth() === month
        : (d: Date) => d.getFullYear() === year;
    return summarizeCash(ventes, entries, inPeriod);
  }, [mode, ventes, entries, year, month]);

  const title = mode === 'monthly' ? `${MONTHS_FR[month]} ${year}` : String(year);
  const visibleRows = rows.filter((r) => r.sum.nbVentes > 0 || r.sum.achats + r.sum.consommations + r.sum.renflouements + r.sum.remboursements > 0);

  const err = 'text-[#BA1A1A]';
  const pos = 'text-[var(--m3-primary)]';
  const cols: Array<{ key: string; label: string; get: (s: CashSummary) => number; tone?: string }> = [
    { key: 'brut', label: 'Total brut', get: (s) => s.brut },
    { key: 'credits', label: 'Crédits', get: (s) => s.credits, tone: err },
    { key: 'conso', label: 'Conso. internes', get: (s) => s.consommations, tone: err },
    { key: 'achats', label: 'Achats', get: (s) => s.achats, tone: err },
    { key: 'renf', label: 'Renflouement', get: (s) => s.renflouements, tone: pos },
    { key: 'remb', label: 'Remboursement', get: (s) => s.remboursements, tone: pos },
    { key: 'net', label: 'Cash net', get: (s) => s.cashNet },
    { key: 'main', label: 'Cash en main', get: (s) => s.cashEnMain, tone: 'font-medium ' + pos },
  ];

  const detail = (s: CashSummary, showZero: boolean) => (
    <div className="divide-y divide-[var(--m3-outline-variant)]">
      {cols.map((c) => {
        const v = c.get(s);
        return (
          <div key={c.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="text-[var(--m3-on-surface-variant)]">{c.label}</span>
            <span className={'tabular-nums ' + (c.tone ?? '')}>{v === 0 && !showZero ? '—' : fmtHTG(v)}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-3">
      <section className="rounded-[28px] bg-[var(--m3-primary-container)] p-5 text-[var(--m3-on-primary-container)]">
        <div className="text-xs font-medium opacity-80">Cash en main — {title}</div>
        <div className="mt-1 break-words text-[32px] font-bold leading-10 tracking-tight tabular-nums">{fmtHTG(total.cashEnMain)}</div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="min-w-0 rounded-[20px] bg-white/45 p-3">
            <div className="text-xs opacity-80">Total brut</div>
            <div className="truncate text-base font-medium tabular-nums">{fmtHTG(total.brut)}</div>
          </div>
          <div className="min-w-0 rounded-[20px] bg-white/45 p-3">
            <div className="text-xs opacity-80">Cash net</div>
            <div className="truncate text-base font-medium tabular-nums">{fmtHTG(total.cashNet)}</div>
          </div>
        </div>
      </section>

      <section>
        <div className="px-1 pb-2 pt-1">
          <h3 className="text-base font-medium">{mode === 'monthly' ? 'Par jour' : 'Par mois'}</h3>
          <p className="text-xs text-[var(--m3-on-surface-variant)]">
            {mode === 'monthly' ? 'Change le mois avec le sélecteur de date en haut.' : "Change l'année avec le sélecteur de date en haut."}
          </p>
        </div>
        {visibleRows.length === 0 ? (
          <div className="rounded-[28px] bg-[var(--m3-surface-container-low)] px-4 py-8 text-center text-sm text-[var(--m3-on-surface-variant)]">
            Aucune activité sur cette période.
          </div>
        ) : (
          <ul className="space-y-2">
            {visibleRows.map((r) => {
              const open = openRow === r.label;
              return (
                <li key={r.label} className="overflow-hidden rounded-[20px] bg-[var(--m3-surface-container)]">
                  <button
                    type="button"
                    onClick={() => setOpenRow(open ? null : r.label)}
                    aria-expanded={open}
                    className={`group relative flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left ${M3_FOCUS}`}
                  >
                    <M3StateLayer />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{r.label}</div>
                      <div className="text-xs text-[var(--m3-on-surface-variant)]">
                        {r.sum.nbVentes} vente{r.sum.nbVentes !== 1 ? 's' : ''} · brut {fmtHTG(r.sum.brut)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[11px] text-[var(--m3-on-surface-variant)]">En main</div>
                      <div className="text-sm font-medium tabular-nums text-[var(--m3-primary)]">{fmtHTG(r.sum.cashEnMain)}</div>
                    </div>
                    <ChevronDown size={18} className={'shrink-0 text-[var(--m3-on-surface-variant)] transition-transform motion-reduce:transition-none ' + (open ? 'rotate-180' : '')} />
                  </button>
                  {open && <div className="border-t border-[var(--m3-outline-variant)] px-4 pb-2">{detail(r.sum, false)}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-[28px] bg-[var(--m3-surface-container-low)] p-4">
        <h3 className="text-base font-medium">Total {title}</h3>
        {detail(total, true)}
      </section>
    </div>
  );
}

function BranchReportsSection({
  branch,
  period,
  setPeriod,
  selectedDate,
  ventes,
  entries,
  products,
  onAddEntry,
  onDeleteEntry,
}: {
  branch: Branch;
  period: ReportPeriod;
  setPeriod: Dispatch<SetStateAction<ReportPeriod>>;
  selectedDate: Date;
  ventes: SaleRecord[];
  entries: CashEntry[];
  products: Product[];
  onAddEntry: (entry: Omit<CashEntry, 'id' | 'branchId'>) => void;
  onDeleteEntry: (id: string) => void;
}) {
  const validSales = useMemo(() => ventes.filter((v) => v.statut !== 'annulee'), [ventes]);
  const PERIOD_SHORT: Record<ReportPeriod, string> = { daily: 'Journalier', monthly: 'Mensuel', annual: 'Annuel' };
  const subtitle =
    period === 'daily'
      ? selectedDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : period === 'monthly'
      ? `${MONTHS_FR[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`
      : String(selectedDate.getFullYear());

  return (
    <>
      {/* Phone: Material 3, full-screen like the Produits tab */}
      <div
        style={M3_VARS}
        className="-mx-4 -mb-5 min-h-[calc(100dvh-8rem)] bg-[var(--m3-surface)] px-4 pb-28 pt-4 font-sans text-[var(--m3-on-surface)] sm:hidden"
      >
        <div className="mb-4">
          <h2 className="text-[32px] font-bold leading-10 tracking-tight">Rapports</h2>
          <p className="truncate text-sm capitalize leading-5 text-[var(--m3-on-surface-variant)]">{subtitle}</p>
        </div>

        {/* Segmented button */}
        <div role="group" aria-label="Période du rapport" className="mb-4 flex h-10 overflow-hidden rounded-full border border-[var(--m3-outline)]">
          {REPORT_TABS.map((tab, i) => {
            const selected = period === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPeriod(tab.id)}
                aria-pressed={selected}
                className={
                  'flex min-w-0 flex-1 items-center justify-center gap-1.5 text-sm font-medium m3-morph motion-reduce:transition-none ' +
                  M3_FOCUS +
                  (i > 0 ? ' border-l border-[var(--m3-outline)]' : '') +
                  (selected
                    ? ' bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
                    : ' text-[var(--m3-on-surface)] active:bg-[var(--m3-surface-container-highest)]')
                }
              >
                {selected && <Check size={16} className="shrink-0" />}
                <span className="truncate">{PERIOD_SHORT[tab.id]}</span>
              </button>
            );
          })}
        </div>

        {period === 'daily' && (
          <DailyReportMobile
            ventes={ventes}
            entries={entries}
            selectedDate={selectedDate}
            onAddEntry={onAddEntry}
            onDeleteEntry={onDeleteEntry}
          />
        )}
        {period === 'monthly' && (
          <div className="space-y-3">
            <PeriodReportMobile mode="monthly" ventes={ventes} entries={entries} selectedDate={selectedDate} />
            <BranchAnalyticsSection branch={branch} ventes={validSales} products={products} />
          </div>
        )}
        {period === 'annual' && <PeriodReportMobile mode="annual" ventes={ventes} entries={entries} selectedDate={selectedDate} />}
      </div>

      {/* Desktop: Material 3 Expressive */}
      <div style={M3_VARS} className="hidden space-y-5 font-sans text-[var(--m3-on-surface)] sm:block">
        <div
          role="group"
          aria-label="Période du rapport"
          className="grid h-12 w-[380px] max-w-full gap-0.5"
          style={{ gridTemplateColumns: `repeat(${REPORT_TABS.length}, minmax(0, 1fr))` }}
        >
          {REPORT_TABS.map((tab, idx) => {
            const selected = period === tab.id;
            const shape = selected
              ? 'rounded-full'
              : idx === 0
                ? 'rounded-l-full rounded-r-lg'
                : idx === REPORT_TABS.length - 1
                  ? 'rounded-r-full rounded-l-lg'
                  : 'rounded-lg';
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setPeriod(tab.id)}
                className={`group relative flex items-center justify-center gap-1.5 overflow-hidden px-2 text-sm font-semibold m3-morph ${shape} ${M3_FOCUS} ${
                  selected ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]' : 'bg-[var(--m3-surface-container-high)] text-[var(--m3-on-surface)]'
                }`}
              >
                <M3StateLayer />
                {selected && <Check size={16} />}
                {PERIOD_SHORT[tab.id]}
              </button>
            );
          })}
        </div>

        {period === 'daily' && (
          <DailyReportDesktop
            ventes={ventes}
            entries={entries}
            selectedDate={selectedDate}
            onAddEntry={onAddEntry}
            onDeleteEntry={onDeleteEntry}
          />
        )}
        {period === 'monthly' && (
          <>
            <PeriodReportDesktop mode="monthly" ventes={ventes} entries={entries} selectedDate={selectedDate} />
            <BranchAnalyticsSection branch={branch} ventes={validSales} products={products} />
          </>
        )}
        {period === 'annual' && (
          <PeriodReportDesktop mode="annual" ventes={ventes} entries={entries} selectedDate={selectedDate} />
        )}
      </div>
    </>
  );
}

/* =========================================================================
   COFFRE — every entry / exit of money, per account (Espèces, MonCash, NatCash)
   ========================================================================= */

/* True below the `sm` breakpoint (phone). Used where mounting both layouts would be wasteful (iframes, images). */
function useIsPhone() {
  const query = '(max-width: 639px)';
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

function CoffreForm({
  balances,
  date,
  cashEnMainDuJour,
  onAdd,
  onClose,
}: {
  balances: Record<CoffreAccountId, number>;
  date: Date;
  cashEnMainDuJour: number;
  onAdd: (entry: Omit<CoffreEntry, 'id' | 'branchId'>) => void;
  /** Rendered as a Material 3 sheet: bottom sheet on phone, side sheet on PC. */
  onClose?: () => void;
}) {
  const [kind, setKind] = useState<CoffreKind>('entree');
  const [categorie, setCategorie] = useState<string>(COFFRE_CATEGORIES.entree[0]);
  const [compte, setCompte] = useState<CoffreAccountId>('especes');
  const [compteDest, setCompteDest] = useState<CoffreAccountId>('moncash');
  const [montant, setMontant] = useState('');
  const [note, setNote] = useState('');
  const [piece, setPiece] = useState<CoffrePiece | null>(null);
  const [pieceError, setPieceError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!onClose) return;
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const value = Number(montant);
  const amountOk = Number.isFinite(value) && value > 0 && (kind !== 'transfert' || compte !== compteDest);
  const valid = amountOk && piece !== null;
  const debits = kind === 'sortie' || kind === 'transfert';
  const insufficient = debits && amountOk && balances[compte] - value < 0;

  const onPickFile = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    try {
      setPiece(await readPieceFile(file));
      setPieceError('');
    } catch (err) {
      setPieceError(err instanceof Error ? err.message : 'Fichier invalide.');
    }
  };

  const pickKind = (k: CoffreKind) => {
    setKind(k);
    if (k !== 'transfert') setCategorie(COFFRE_CATEGORIES[k][0]);
  };

  const pickSource = (id: CoffreAccountId) => {
    setCompte(id);
    if (id === compteDest) setCompteDest(COFFRE_ACCOUNTS.find((a) => a.id !== id)!.id);
  };

  const submit = () => {
    if (!valid) return;
    const when = new Date(date);
    const now = new Date();
    when.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
    onAdd({
      date: when,
      kind,
      categorie: kind === 'transfert' ? 'Transfert entre comptes' : categorie,
      compte,
      compteDest: kind === 'transfert' ? compteDest : undefined,
      montant: value,
      note: note.trim() || undefined,
      piece: piece ?? undefined,
    });
    setMontant('');
    setNote('');
    setPiece(null);
    setPieceError('');
    onClose?.();
  };

  const fillDailyDeposit = () => {
    setKind('entree');
    setCategorie('Versement caisse');
    setCompte('especes');
    setMontant(String(Math.round(cashEnMainDuJour)));
  };

    const m3Field =
      'block min-w-0 rounded-xl bg-[var(--m3-surface)] px-4 pb-1.5 pt-2 ring-1 ring-[var(--m3-outline)] transition-shadow focus-within:ring-2 focus-within:ring-[var(--m3-primary)] motion-reduce:transition-none';
    const m3Input = 'h-8 w-full min-w-0 bg-transparent p-0 text-base text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)]';
    const m3Label = 'block text-xs leading-4 text-[var(--m3-on-surface-variant)]';
    const kindTone: Record<CoffreKind, string> = {
      entree: 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]',
      sortie: `${M3_STATUS.out.bg} ${M3_STATUS.out.fg}`,
      transfert: 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]',
    };
    const accountChips = (current: CoffreAccountId, onPick: (id: CoffreAccountId) => void, exclude?: CoffreAccountId) => (
      <div className="flex flex-wrap gap-2">
        {COFFRE_ACCOUNTS.filter((a) => a.id !== exclude).map((a) => {
          const selected = current === a.id;
          return (
            <button
              key={a.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onPick(a.id)}
              className={`relative flex h-10 items-center gap-2 overflow-hidden px-4 text-sm font-medium m3-morph ${M3_FOCUS} ${
                selected ? 'rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]' : 'rounded-xl border border-[var(--m3-outline)] text-[var(--m3-on-surface-variant)]'
              }`}
            >
              {selected && <Check size={16} />}
              {a.label}
            </button>
          );
        })}
      </div>
    );

    return createPortal(
      <>
        <div aria-hidden="true" onClick={onClose} className="m3-scrim fixed inset-0 z-[80] bg-black/40" />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Nouveau mouvement"
          style={M3_VARS}
          className="m3-sheet fixed inset-x-0 bottom-0 z-[81] flex max-h-[92dvh] w-full flex-col rounded-t-[28px] bg-[var(--m3-surface-container-low)] pt-2 text-[var(--m3-on-surface)] shadow-[0_-8px_24px_rgba(0,0,0,0.16)] sm:inset-x-auto sm:inset-y-0 sm:bottom-auto sm:right-0 sm:h-full sm:max-h-none sm:w-[480px] sm:max-w-full sm:rounded-l-[28px] sm:rounded-tr-none sm:pt-4 sm:shadow-[-8px_0_24px_rgba(0,0,0,0.16)] sm:[animation:m3-side-in_.4s_var(--m3-spring-effects)]"
        >
          <div className="mx-auto mb-3 mt-1 h-1 w-8 shrink-0 rounded-full bg-[var(--m3-outline-variant)] sm:hidden" />
          <div className="shrink-0 px-6 pb-3">
            <div className="text-xs font-medium text-[var(--m3-on-surface-variant)]">Coffre</div>
            <div className="mt-1 text-[24px] font-normal leading-8">Nouveau mouvement</div>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
            {/* Type: segmented button */}
            <div role="group" aria-label="Type de mouvement" className="flex h-10 overflow-hidden rounded-full border border-[var(--m3-outline)]">
              {(Object.keys(COFFRE_KIND_META) as CoffreKind[]).map((k, i) => {
                const Icon = COFFRE_KIND_META[k].icon;
                const selected = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => pickKind(k)}
                    className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 text-sm font-medium m3-morph motion-reduce:transition-none ${M3_FOCUS} ${
                      i > 0 ? 'border-l border-[var(--m3-outline)]' : ''
                    } ${selected ? kindTone[k] : 'text-[var(--m3-on-surface)] active:bg-[var(--m3-surface-container-highest)]'}`}
                  >
                    {selected ? <Check size={16} className="shrink-0" /> : <Icon size={16} className="shrink-0" />}
                    <span className="truncate">{COFFRE_KIND_META[k].label}</span>
                  </button>
                );
              })}
            </div>

            {kind === 'entree' && cashEnMainDuJour > 0 && (
              <button
                type="button"
                onClick={fillDailyDeposit}
                className={`group relative flex min-h-12 w-full items-center gap-3 overflow-hidden rounded-2xl bg-[var(--m3-tertiary-container)] px-4 py-2 text-left text-sm text-[var(--m3-on-tertiary-container)] m3-press-card motion-reduce:transition-none ${M3_FOCUS}`}
              >
                <M3StateLayer />
                <Banknote size={18} className="shrink-0" />
                <span className="min-w-0">
                  Verser le cash en main du jour
                  <span className="block font-medium tabular-nums">{fmtHTG(cashEnMainDuJour)}</span>
                </span>
              </button>
            )}

            {kind !== 'transfert' && (
              <label className={m3Field}>
                <span className={m3Label}>Catégorie</span>
                <select value={categorie} onChange={(e) => setCategorie(e.target.value)} className={m3Input}>
                  {COFFRE_CATEGORIES[kind].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div>
              <div className="mb-2 px-1 text-xs font-medium text-[var(--m3-on-surface-variant)]">{kind === 'transfert' ? 'De' : 'Compte'}</div>
              {accountChips(compte, pickSource)}
            </div>
            {kind === 'transfert' && (
              <div>
                <div className="mb-2 px-1 text-xs font-medium text-[var(--m3-on-surface-variant)]">Vers</div>
                {accountChips(compteDest, setCompteDest, compte)}
              </div>
            )}

            <div>
              <label className={m3Field}>
                <span className={m3Label}>Montant (HTG)</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  placeholder="0"
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  className={m3Input + ' tabular-nums'}
                />
              </label>
              {insufficient && (
                <div className={`mt-2 rounded-2xl px-4 py-2.5 text-sm ${M3_STATUS.low.bg} ${M3_STATUS.low.fg}`}>
                  Solde {coffreAccountLabel(compte)} insuffisant : {fmtHTG(balances[compte])} disponible
                </div>
              )}
            </div>

            <label className={m3Field}>
              <span className={m3Label}>Note (optionnel)</span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex : facture fournisseur, transport…"
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                className={m3Input}
              />
            </label>

            <div>
              <div className="mb-2 px-1 text-xs font-medium text-[var(--m3-on-surface-variant)]">
                Pièce justificative <span className="text-[#BA1A1A]">(obligatoire)</span>
              </div>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onPickFile} />
              {piece ? (
                <div className="flex items-center gap-3 rounded-[20px] bg-[var(--m3-primary-container)] p-2 pr-1 text-[var(--m3-on-primary-container)]">
                  {piece.type.startsWith('image/') ? (
                    <img src={piece.dataUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl bg-white object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/60">
                      <FileText size={22} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{piece.nom}</div>
                    <div className="font-mono text-xs opacity-80">{piece.ref}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPiece(null)}
                    aria-label="Retirer la pièce"
                    className={`group relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full ${M3_FOCUS}`}
                  >
                    <M3StateLayer />
                    <X size={20} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className={`group relative flex h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed border-[var(--m3-outline)] text-sm font-medium text-[var(--m3-primary)] m3-press-card motion-reduce:transition-none ${M3_FOCUS}`}
                >
                  <M3StateLayer />
                  <Paperclip size={18} /> Joindre facture, reçu ou bordereau
                </button>
              )}
              {pieceError && <div className={`mt-2 rounded-2xl px-4 py-2.5 text-sm ${M3_STATUS.out.bg} ${M3_STATUS.out.fg}`}>{pieceError}</div>}
              {amountOk && !piece && !pieceError && (
                <div className={`mt-2 rounded-2xl px-4 py-2.5 text-sm ${M3_STATUS.low.bg} ${M3_STATUS.low.fg}`}>
                  Ajoute la pièce justificative pour enregistrer
                </div>
              )}
            </div>

            <div className="px-1 text-xs text-[var(--m3-on-surface-variant)]">
              Date : {date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t border-[var(--m3-outline-variant)] bg-[var(--m3-surface-container-low)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <button
              type="button"
              onClick={onClose}
              className={`h-12 shrink-0 rounded-full px-6 text-sm font-medium text-[var(--m3-primary)] active:bg-[var(--m3-surface-container-highest)] ${M3_FOCUS}`}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!valid}
              className={`group relative flex h-12 flex-1 items-center justify-center gap-2 overflow-hidden rounded-full text-sm font-medium m3-press motion-reduce:transition-none ${M3_FOCUS} ${
                valid ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]' : 'cursor-not-allowed bg-[var(--m3-surface-container-highest)] text-[var(--m3-outline)]'
              }`}
            >
              {valid && <M3StateLayer />}
              <Plus size={18} /> Enregistrer
            </button>
          </div>
        </div>
      </>,
      document.body
    );
}

function PieceViewer({
  entry,
  onClose,
  onReplace,
}: {
  entry: CoffreEntry;
  onClose: () => void;
  onReplace: (piece: CoffrePiece) => void;
}) {
  const piece = entry.piece as CoffrePiece;
  const isPdf = piece.type === 'application/pdf';
  const replaceRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const phone = useIsPhone();

  const imgSrc = useMemo(() => (isPdf ? '' : coffrePieceUrl(entry)), [entry, isPdf]);
  const pdfUrl = useMemo(() => {
    if (!isPdf || !piece.dataUrl) return null;
    const bin = atob(piece.dataUrl.split(',')[1] ?? '');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  }, [isPdf, piece.dataUrl]);

  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    },
    [pdfUrl]
  );

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onPick = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    try {
      onReplace(await readPieceFile(file));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fichier invalide.');
    }
  };

  const sign = entry.kind === 'entree' ? '+' : entry.kind === 'sortie' ? '−' : '⇄';

  if (phone) {
    const heroTone =
      entry.kind === 'entree'
        ? 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]'
        : entry.kind === 'sortie'
          ? `${M3_STATUS.out.bg} ${M3_STATUS.out.fg}`
          : 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]';
    const rows: Array<[string, string]> = [
      ['Catégorie', entry.categorie],
      ['Compte', coffreAccountLabel(entry.compte) + (entry.compteDest ? ' → ' + coffreAccountLabel(entry.compteDest) : '')],
      ['Date', entry.date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) + ' · ' + fmtTime12(entry.date)],
      ...(entry.note ? ([['Note', entry.note]] as Array<[string, string]>) : []),
      ['Fichier', piece.nom],
    ];
    return createPortal(
      <>
        <div aria-hidden="true" onClick={onClose} className="m3-scrim fixed inset-0 z-[80] bg-black/40" />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pièce justificative"
          style={M3_VARS}
          className="m3-sheet fixed inset-x-0 bottom-0 z-[81] flex max-h-[92dvh] w-full flex-col rounded-t-[28px] bg-[var(--m3-surface-container-low)] pt-2 text-[var(--m3-on-surface)] shadow-[0_-8px_24px_rgba(0,0,0,0.16)]"
        >
          <div className="mx-auto mb-1 mt-1 h-1 w-8 shrink-0 rounded-full bg-[var(--m3-outline-variant)]" />
          <div className="flex shrink-0 items-center gap-2 pb-1 pl-6 pr-2">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-[var(--m3-on-surface-variant)]">Pièce justificative</div>
              <div className="truncate font-mono text-[20px] leading-7">{piece.ref}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className={`group relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}
            >
              <M3StateLayer />
              <X size={22} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
            <div className="overflow-hidden rounded-[20px] bg-[var(--m3-surface-container)] p-2">
              {isPdf ? (
                pdfUrl ? (
                  <iframe title={piece.nom} src={pdfUrl} className="h-[52vh] w-full rounded-xl bg-white" />
                ) : (
                  <div className="p-6 text-center text-sm text-[var(--m3-on-surface-variant)]">Aperçu PDF indisponible. Utilise Télécharger.</div>
                )
              ) : (
                <img src={imgSrc} alt={piece.nom} className="mx-auto max-h-[52vh] max-w-full rounded-xl bg-white object-contain" />
              )}
            </div>

            <div className={`rounded-[28px] p-5 ${heroTone}`}>
              <div className="text-xs font-medium opacity-80">{COFFRE_KIND_META[entry.kind].label}</div>
              <div className="mt-1 break-words text-[28px] font-bold leading-9 tracking-tight tabular-nums">
                {sign} {fmtHTG(entry.montant)}
              </div>
            </div>

            <div className="divide-y divide-[var(--m3-outline-variant)] rounded-[28px] bg-[var(--m3-surface-container)] px-4">
              {rows.map(([k, v]) => (
                <div key={k} className="py-3">
                  <div className="text-xs text-[var(--m3-on-surface-variant)]">{k}</div>
                  <div className="mt-0.5 break-words text-sm">{v}</div>
                </div>
              ))}
            </div>

            {error && <div className={`rounded-2xl px-4 py-2.5 text-sm ${M3_STATUS.out.bg} ${M3_STATUS.out.fg}`}>{error}</div>}
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t border-[var(--m3-outline-variant)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <input ref={replaceRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onPick} />
            <button
              type="button"
              onClick={() => replaceRef.current?.click()}
              className={`flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full border border-[var(--m3-outline)] text-sm font-medium text-[var(--m3-primary)] m3-press motion-reduce:transition-none ${M3_FOCUS}`}
            >
              <Paperclip size={18} /> <span className="truncate">Remplacer</span>
            </button>
            <button
              type="button"
              onClick={() => downloadPiece(entry)}
              className={`group relative flex h-12 min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden rounded-full bg-[var(--m3-primary)] text-sm font-medium text-[var(--m3-on-primary)] m3-press motion-reduce:transition-none ${M3_FOCUS}`}
            >
              <M3StateLayer />
              <Download size={18} /> <span className="truncate">Télécharger</span>
            </button>
          </div>
        </div>
      </>,
      document.body
    );
  }

  const dHero =
    entry.kind === 'entree'
      ? 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]'
      : entry.kind === 'sortie'
        ? `${M3_STATUS.out.bg} ${M3_STATUS.out.fg}`
        : 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]';
  const dRows: Array<[string, string]> = [
    ['Catégorie', entry.categorie],
    ['Compte', coffreAccountLabel(entry.compte) + (entry.compteDest ? ' → ' + coffreAccountLabel(entry.compteDest) : '')],
    ['Date', entry.date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) + ' · ' + fmtTime12(entry.date)],
    ...(entry.note ? ([['Note', entry.note]] as Array<[string, string]>) : []),
    ['Fichier', piece.nom],
  ];
  return createPortal(
    <>
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-[90] bg-black/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pièce justificative"
        style={M3_VARS}
        className="fixed left-1/2 top-1/2 z-[91] flex max-h-[92vh] w-[min(1080px,calc(100vw-3rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[28px] bg-[var(--m3-surface-container-low)] text-[var(--m3-on-surface)] shadow-[0_8px_10px_-6px_rgba(0,0,0,0.2),0_16px_24px_2px_rgba(0,0,0,0.14)]"
      >
        <div className="flex shrink-0 items-center gap-3 px-6 py-4">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]">
            <Paperclip size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-[var(--m3-on-surface-variant)]">Pièce justificative</div>
            <div className="truncate font-mono text-lg leading-6">{piece.ref}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className={`group relative -mr-2 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}
          >
            <M3StateLayer />
            <X size={20} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 pb-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:overflow-hidden">
          <div className="flex min-h-[280px] items-start justify-center overflow-auto rounded-[24px] bg-[var(--m3-surface-container)] p-3 lg:max-h-[74vh]">
            {isPdf ? (
              pdfUrl ? (
                <iframe title={piece.nom} src={pdfUrl} className="h-[70vh] w-full rounded-2xl bg-white" />
              ) : (
                <div className="p-8 text-sm text-[var(--m3-on-surface-variant)]">Aperçu PDF indisponible. Utilise Télécharger.</div>
              )
            ) : (
              <img src={imgSrc} alt={piece.nom} className="max-w-full rounded-2xl bg-white" />
            )}
          </div>

          <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto">
            <div className={`rounded-[24px] p-5 ${dHero}`}>
              <div className="text-xs font-medium opacity-80">{COFFRE_KIND_META[entry.kind].label}</div>
              <div className="mt-1 break-words text-[28px] font-bold leading-9 tracking-tight tabular-nums">
                {sign} {fmtHTG(entry.montant)}
              </div>
            </div>

            <div className="divide-y divide-[var(--m3-outline-variant)] rounded-[24px] bg-[var(--m3-surface-container)] px-4">
              {dRows.map(([k, v]) => (
                <div key={k} className="py-3">
                  <div className="text-xs text-[var(--m3-on-surface-variant)]">{k}</div>
                  <div className={'mt-0.5 break-words text-sm ' + (k === 'Fichier' ? 'font-mono text-xs' : '')}>{v}</div>
                </div>
              ))}
            </div>

            {error && <div className={`rounded-2xl px-4 py-2.5 text-sm ${M3_STATUS.out.bg} ${M3_STATUS.out.fg}`}>{error}</div>}

            <div className="mt-auto flex gap-2">
              <input ref={replaceRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onPick} />
              <button
                type="button"
                onClick={() => replaceRef.current?.click()}
                className={`group relative flex h-12 min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden rounded-full border border-[var(--m3-outline)] text-sm font-medium text-[var(--m3-primary)] ${M3_FOCUS}`}
              >
                <M3StateLayer />
                <Paperclip size={18} /> <span className="truncate">Remplacer</span>
              </button>
              <button
                type="button"
                onClick={() => downloadPiece(entry)}
                className={`group relative flex h-12 min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden rounded-full bg-[var(--m3-primary)] text-sm font-medium text-[var(--m3-on-primary)] ${M3_FOCUS}`}
              >
                <M3StateLayer />
                <Download size={18} /> <span className="truncate">Télécharger</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

function BranchCoffreSection({
  branch,
  selectedDate,
  ventes,
  cashEntries,
  entries,
  onAdd,
  onDelete,
  onSetPiece,
}: {
  branch: Branch;
  selectedDate: Date;
  ventes: SaleRecord[];
  cashEntries: CashEntry[];
  entries: CoffreEntry[];
  onAdd: (entry: Omit<CoffreEntry, 'id' | 'branchId'>) => void;
  onDelete: (id: string) => void;
  onSetPiece: (id: string, piece: CoffrePiece) => void;
}) {
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [attachError, setAttachError] = useState('');
  const attachInputRef = useRef<HTMLInputElement>(null);
  const attachTargetRef = useRef<string | null>(null);
  const [period, setPeriod] = useState<CoffrePeriod>('mois');
  const [kindFilter, setKindFilter] = useState<'all' | CoffreKind>('all');
  const [accountFilter, setAccountFilter] = useState<'all' | CoffreAccountId>('all');
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [sort, setSort] = useState<{ key: 'date' | 'categorie' | 'montant'; dir: 'asc' | 'desc' } | null>(null);

  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();

  const balances = useMemo(() => coffreBalances(entries), [entries]);
  const totalBalance = balances.especes + balances.moncash + balances.natcash;

  const cashEnMainDuJour = useMemo(
    () => summarizeCash(ventes, cashEntries, (d) => isSameDay(d, selectedDate)).cashEnMain,
    [ventes, cashEntries, selectedDate]
  );

  const inPeriod = (d: Date) =>
    period === 'tout'
      ? true
      : period === 'jour'
        ? isSameDay(d, selectedDate)
        : period === 'mois'
          ? d.getFullYear() === year && d.getMonth() === month
          : d.getFullYear() === year;

  const periodEntries = useMemo(
    () => entries.filter((e) => inPeriod(e.date)), // eslint-disable-line react-hooks/exhaustive-deps
    [entries, period, year, month, selectedDate] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return periodEntries
      .filter((e) => kindFilter === 'all' || e.kind === kindFilter)
      .filter((e) => accountFilter === 'all' || e.compte === accountFilter || e.compteDest === accountFilter)
      .filter(
        (e) =>
          !q ||
          e.categorie.toLowerCase().includes(q) ||
          (e.note ?? '').toLowerCase().includes(q) ||
          (e.piece?.ref ?? '').toLowerCase().includes(q)
      )
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [periodEntries, kindFilter, accountFilter, query]);

  const totalIn = rows.filter((e) => e.kind === 'entree').reduce((sum, e) => sum + e.montant, 0);
  const totalOut = rows.filter((e) => e.kind === 'sortie').reduce((sum, e) => sum + e.montant, 0);

  const periodLabel =
    period === 'jour'
      ? selectedDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
      : period === 'mois'
        ? `${MONTHS_FR[month]} ${year}`
        : period === 'annee'
          ? String(year)
          : 'Depuis le début';

  const breakdown = (kind: 'entree' | 'sortie') => {
    const map = new Map<string, number>();
    periodEntries
      .filter((e) => e.kind === kind)
      .forEach((e) => map.set(e.categorie, (map.get(e.categorie) ?? 0) + e.montant));
    return Array.from(map.entries())
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => b.total - a.total);
  };
  const inBreakdown = breakdown('entree');
  const outBreakdown = breakdown('sortie');

  const startAttach = (id: string) => {
    attachTargetRef.current = id;
    attachInputRef.current?.click();
  };

  const onAttachFile = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    const id = attachTargetRef.current;
    if (!file || !id) return;
    try {
      onSetPiece(id, await readPieceFile(file));
      setAttachError('');
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : 'Fichier invalide.');
    }
  };

  const viewingEntry = viewingId ? entries.find((e) => e.id === viewingId) ?? null : null;

  const num = (n: number) => fmtHTG(n).replace(' HTG', '');
  const net = totalIn - totalOut;

  const m3Chip = (selected: boolean, label: string, onClick: () => void) => (
    <button
      key={label}
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`group relative shrink-0 before:absolute before:inset-x-0 before:-inset-y-2 before:content-[''] ${M3_FOCUS}`}
    >
      <span
        className={`relative flex h-9 items-center gap-2 overflow-hidden px-3.5 text-sm font-medium m3-morph ${selected ? 'rounded-full' : 'rounded-xl'} ${
          selected
            ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
            : 'border border-[var(--m3-outline)] text-[var(--m3-on-surface-variant)]'
        }`}
      >
        <M3StateLayer />
        {selected && <Check size={16} />}
        {label}
      </span>
    </button>
  );

  const m3Breakdown = (title: string, list: Array<{ label: string; total: number }>, tone: string, bar: string) => {
    const max = Math.max(...list.map((l) => l.total), 1);
    return (
      <div>
        <div className={'mb-2 text-xs font-medium ' + tone}>{title}</div>
        {list.length === 0 ? (
          <div className="text-sm text-[var(--m3-on-surface-variant)]">Aucun mouvement.</div>
        ) : (
          <div className="space-y-3">
            {list.map((l) => (
              <div key={l.label}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{l.label}</span>
                  <span className="shrink-0 font-medium tabular-nums">{fmtHTG(l.total)}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--m3-surface-container-highest)]">
                  <div className={'h-full rounded-full ' + bar} style={{ width: `${(l.total / max) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const iconBtn =
    'group relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ' + M3_FOCUS;

  const toggleSort = (key: 'date' | 'categorie' | 'montant') =>
    setSort((prev) => {
      const first = key === 'categorie' ? 'asc' : 'desc';
      const second = first === 'asc' ? 'desc' : 'asc';
      if (!prev || prev.key !== key) return { key, dir: first };
      return prev.dir === first ? { key, dir: second } : null;
    });
  const sortedRows = sort
    ? [...rows].sort((x, y) => {
        const v = (e: CoffreEntry) => (sort.key === 'date' ? e.date.getTime() : sort.key === 'montant' ? e.montant : e.categorie.toLowerCase());
        const vx = v(x);
        const vy = v(y);
        const r = typeof vx === 'string' ? vx.localeCompare(String(vy), 'fr') : Number(vx) - Number(vy);
        return r * (sort.dir === 'asc' ? 1 : -1);
      })
    : rows;

  const coffreHead = (key: 'date' | 'categorie' | 'montant', label: string, align: 'left' | 'right' = 'left') => {
    const active = sort?.key === key;
    return (
      <th
        scope="col"
        aria-sort={active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`px-4 py-3 font-medium ${align === 'left' ? 'text-left' : 'text-right'}`}
      >
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className={`group relative -mx-2 inline-flex items-center gap-1 overflow-hidden rounded-full px-2 py-1 ${active ? 'text-[var(--m3-on-surface)]' : ''} ${M3_FOCUS}`}
        >
          <M3StateLayer />
          {label}
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={`transition-transform motion-reduce:transition-none ${active ? (sort?.dir === 'asc' ? 'rotate-180' : '') : 'opacity-0 group-hover:opacity-50'}`}
          />
        </button>
      </th>
    );
  };

  const segmented = (label: string, options: Array<[string, string]>, value: string, onPick: (id: string) => void, width: string) => (
    <div
      role="group"
      aria-label={label}
      className={`grid h-12 ${width} max-w-full gap-0.5`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map(([id, text], idx) => {
        const selected = value === id;
        const shape = selected ? 'rounded-full' : idx === 0 ? 'rounded-l-full rounded-r-lg' : idx === options.length - 1 ? 'rounded-r-full rounded-l-lg' : 'rounded-lg';
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            onClick={() => onPick(id)}
            className={`group relative flex items-center justify-center gap-1.5 overflow-hidden px-2 text-sm font-semibold m3-morph ${shape} ${M3_FOCUS} ${
              selected ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]' : 'bg-[var(--m3-surface-container-high)] text-[var(--m3-on-surface)]'
            }`}
          >
            <M3StateLayer />
            {selected && <Check size={16} />}
            {text}
          </button>
        );
      })}
    </div>
  );

  const chipDesk = (selected: boolean, label: string, onClick: () => void) => (
    <button key={label} type="button" aria-pressed={selected} onClick={onClick} className={`group relative shrink-0 ${M3_FOCUS}`}>
      <span
        className={`relative flex h-8 items-center gap-1.5 overflow-hidden px-3 text-sm font-medium m3-morph ${selected ? 'rounded-full' : 'rounded-lg'} ${
          selected
            ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
            : 'border border-[var(--m3-outline)] text-[var(--m3-on-surface-variant)]'
        }`}
      >
        <M3StateLayer />
        {selected && <Check size={14} />}
        {label}
      </span>
    </button>
  );

  const kindIconTone = (k: CoffreKind) =>
    k === 'entree'
      ? 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]'
      : k === 'sortie'
        ? `${M3_STATUS.out.bg} ${M3_STATUS.out.fg}`
        : 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]';
  const rowBtn = `group relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`;

  return (
    <>
      <input ref={attachInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onAttachFile} />
      {viewingEntry && viewingEntry.piece && (
        <PieceViewer
          entry={viewingEntry}
          onClose={() => setViewingId(null)}
          onReplace={(piece) => onSetPiece(viewingEntry.id, piece)}
        />
      )}

      {/* Phone: Material 3, full-screen like the Produits and Rapports tabs */}
      <div
        style={M3_VARS}
        className="-mx-4 -mb-5 min-h-[calc(100dvh-8rem)] bg-[var(--m3-surface)] px-4 pb-28 pt-4 font-sans text-[var(--m3-on-surface)] sm:hidden"
      >
        <div className="mb-4">
          <h2 className="text-[32px] font-bold leading-10 tracking-tight">Coffre</h2>
          <p className="truncate text-sm leading-5 text-[var(--m3-on-surface-variant)]">
            {branch.nom} · {entries.length} mouvement{entries.length !== 1 ? 's' : ''}
          </p>
        </div>

        {attachError && <div className={`mb-3 rounded-2xl px-4 py-3 text-sm ${M3_STATUS.out.bg} ${M3_STATUS.out.fg}`}>{attachError}</div>}

        <div className="space-y-3">
          {/* Balance hero */}
          <section
            className={
              'rounded-[28px] p-5 ' +
              (totalBalance < 0 ? `${M3_STATUS.out.bg} ${M3_STATUS.out.fg}` : 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]')
            }
          >
            <div className="flex items-center gap-1.5 text-xs font-medium opacity-80">
              <Vault size={14} /> Solde du coffre
            </div>
            <div className="mt-1 break-words text-[32px] font-bold leading-10 tracking-tight tabular-nums">{fmtHTG(totalBalance)}</div>
          </section>

          {/* Accounts */}
          <section className="divide-y divide-[var(--m3-outline-variant)] rounded-[28px] bg-[var(--m3-surface-container-low)] px-4">
            {COFFRE_ACCOUNTS.map((a) => {
              const Icon = a.icon;
              return (
                <div key={a.id} className="flex items-center gap-3 py-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]">
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.label}</span>
                  <span className={'shrink-0 text-sm font-medium tabular-nums ' + (balances[a.id] < 0 ? 'text-[#BA1A1A]' : '')}>{fmtHTG(balances[a.id])}</span>
                </div>
              );
            })}
          </section>

          {/* Period: segmented button */}
          <div role="group" aria-label="Période" className="flex h-10 overflow-hidden rounded-full border border-[var(--m3-outline)]">
            {COFFRE_PERIODS.map((p, i) => {
              const selected = period === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setPeriod(p.id)}
                  className={
                    'flex min-w-0 flex-1 items-center justify-center gap-1 text-sm font-medium m3-morph motion-reduce:transition-none ' +
                    M3_FOCUS +
                    (i > 0 ? ' border-l border-[var(--m3-outline)]' : '') +
                    (selected
                      ? ' bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
                      : ' text-[var(--m3-on-surface)] active:bg-[var(--m3-surface-container-highest)]')
                  }
                >
                  {selected && <Check size={14} className="shrink-0" />}
                  <span className="truncate">{p.label}</span>
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="flex h-14 w-full min-w-0 items-center gap-3 rounded-full bg-[var(--m3-surface-container-high)] px-4 transition-shadow focus-within:ring-2 focus-within:ring-[var(--m3-primary)] motion-reduce:transition-none">
            <Search className="h-6 w-6 shrink-0 text-[var(--m3-on-surface-variant)]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Catégorie, note ou réf. pièce…"
              className="w-full min-w-0 border-none bg-transparent text-base text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)]"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Effacer la recherche" className={`${iconBtn} -mr-2`}>
                <M3StateLayer />
                <X size={20} />
              </button>
            )}
          </div>

          {/* Filter chips: type, then account */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filtrer par type">
            {m3Chip(kindFilter === 'all', 'Tous', () => setKindFilter('all'))}
            {(Object.keys(COFFRE_KIND_META) as CoffreKind[]).map((k) => m3Chip(kindFilter === k, COFFRE_KIND_META[k].plural, () => setKindFilter(k)))}
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filtrer par compte">
            {m3Chip(accountFilter === 'all', 'Tous les comptes', () => setAccountFilter('all'))}
            {COFFRE_ACCOUNTS.map((a) => m3Chip(accountFilter === a.id, a.label, () => setAccountFilter(a.id)))}
          </div>

          {/* Period totals */}
          <section>
            <div className="flex items-baseline justify-between px-1 pb-2 pt-1">
              <h3 className="text-base font-medium">Journal · {periodLabel}</h3>
              <span className="text-xs text-[var(--m3-on-surface-variant)]">HTG</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="min-w-0 rounded-[20px] bg-[var(--m3-secondary-container)] p-3 text-[var(--m3-on-secondary-container)]">
                <div className="flex items-center gap-1 text-xs opacity-80">
                  <ArrowDownLeft size={12} /> Entrées
                </div>
                <div className="mt-1 truncate text-sm font-medium tabular-nums">+ {num(totalIn)}</div>
              </div>
              <div className={`min-w-0 rounded-[20px] p-3 ${M3_STATUS.out.bg} ${M3_STATUS.out.fg}`}>
                <div className="flex items-center gap-1 text-xs opacity-80">
                  <ArrowUpRight size={12} /> Sorties
                </div>
                <div className="mt-1 truncate text-sm font-medium tabular-nums">− {num(totalOut)}</div>
              </div>
              <div className="min-w-0 rounded-[20px] bg-[var(--m3-surface-container)] p-3">
                <div className="text-xs text-[var(--m3-on-surface-variant)]">Net</div>
                <div className={'mt-1 truncate text-sm font-medium tabular-nums ' + (net < 0 ? 'text-[#BA1A1A]' : '')}>{num(net)}</div>
              </div>
            </div>
          </section>

          {/* Ledger */}
          {rows.length === 0 ? (
            <div className="rounded-[28px] bg-[var(--m3-surface-container-low)] px-4 py-10 text-center text-sm text-[var(--m3-on-surface-variant)]">
              Aucun mouvement sur cette période.
            </div>
          ) : (
            <ul className="space-y-2">
              {rows.map((e) => {
                const Icon = COFFRE_KIND_META[e.kind].icon;
                const tone = e.kind === 'entree' ? 'text-[var(--m3-primary)]' : e.kind === 'sortie' ? 'text-[#BA1A1A]' : '';
                const sign = e.kind === 'entree' ? '+' : e.kind === 'sortie' ? '−' : '⇄';
                const iconTone =
                  e.kind === 'entree'
                    ? 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]'
                    : e.kind === 'sortie'
                      ? `${M3_STATUS.out.bg} ${M3_STATUS.out.fg}`
                      : 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]';
                return (
                  <li key={e.id} className="rounded-[20px] bg-[var(--m3-surface-container)] p-3">
                    <div className="flex items-center gap-3">
                      <span className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-full ' + iconTone}>
                        <Icon size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{e.categorie}</div>
                        <div className="truncate text-xs text-[var(--m3-on-surface-variant)]">
                          {e.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} · {fmtTime12(e.date)} · {coffreAccountLabel(e.compte)}
                          {e.compteDest ? ` → ${coffreAccountLabel(e.compteDest)}` : ''}
                        </div>
                      </div>
                      <div className={'shrink-0 text-sm font-medium tabular-nums ' + tone}>
                        {sign} {fmtHTG(e.montant)}
                      </div>
                    </div>
                    {e.note && <div className="mt-1.5 pl-[52px] text-xs text-[var(--m3-on-surface-variant)]">{e.note}</div>}
                    <div className="mt-1 flex items-center justify-between gap-2 pl-[52px]">
                      {e.piece ? (
                        <button
                          type="button"
                          onClick={() => setViewingId(e.id)}
                          className={`group relative flex h-8 min-w-0 items-center gap-1.5 overflow-hidden rounded-lg border border-[var(--m3-outline)] px-3 text-xs font-medium ${M3_FOCUS}`}
                        >
                          <M3StateLayer />
                          <Paperclip size={12} className="shrink-0" />
                          <span className="truncate font-mono">{e.piece.ref}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startAttach(e.id)}
                          className={`flex h-8 min-w-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium ${M3_STATUS.low.bg} ${M3_STATUS.low.fg} ${M3_FOCUS}`}
                        >
                          <Paperclip size={12} className="shrink-0" />
                          <span className="truncate">Joindre une pièce</span>
                        </button>
                      )}
                      <div className="-mr-1 flex items-center">
                        {e.piece && (
                          <button type="button" onClick={() => downloadPiece(e)} aria-label="Télécharger la pièce" className={iconBtn}>
                            <M3StateLayer />
                            <Download size={20} />
                          </button>
                        )}
                        <button type="button" onClick={() => onDelete(e.id)} aria-label="Supprimer" className={iconBtn}>
                          <M3StateLayer />
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Breakdown */}
          <section className="space-y-5 rounded-[28px] bg-[var(--m3-surface-container-low)] p-4">
            <h3 className="text-base font-medium">Par catégorie · {periodLabel}</h3>
            {m3Breakdown('Entrées', inBreakdown, 'text-[var(--m3-primary)]', 'bg-[var(--m3-primary)]')}
            {m3Breakdown('Sorties', outBreakdown, 'text-[#BA1A1A]', 'bg-[#BA1A1A]')}
          </section>
        </div>

        {/* FAB */}
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className={`group fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 shrink-0 items-center justify-center gap-3 overflow-hidden rounded-[20px] bg-[var(--m3-primary-container)] px-6 text-base font-semibold tracking-[0.01em] text-[var(--m3-on-primary-container)] shadow-[0_3px_8px_3px_rgba(0,0,0,0.15),0_1px_3px_rgba(0,0,0,0.3)] m3-press motion-reduce:transition-none ${M3_FOCUS}`}
        >
          <M3StateLayer />
          <Plus className="h-6 w-6" />
          Mouvement
        </button>
      </div>

      {/* ===================== Desktop (sm and up) ===================== */}
      <div style={M3_VARS} className="hidden space-y-5 font-sans text-[var(--m3-on-surface)] sm:block">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[32px] font-bold leading-10 tracking-tight">Coffre</h2>
            <p className="truncate text-sm text-[var(--m3-on-surface-variant)]">
              {branch.nom} · {entries.length} mouvement{entries.length !== 1 ? 's' : ''} au total
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className={`group relative flex h-12 shrink-0 items-center gap-2 overflow-hidden rounded-[20px] bg-[var(--m3-primary)] px-6 text-sm font-semibold text-[var(--m3-on-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.3),0_1px_2px_rgba(0,0,0,0.15)] transition-[box-shadow,transform] hover:shadow-[0_2px_6px_2px_rgba(0,0,0,0.15),0_1px_2px_rgba(0,0,0,0.3)] active:scale-[0.96] motion-reduce:transition-none ${M3_FOCUS}`}
          >
            <M3StateLayer />
            <Plus size={20} />
            Nouveau mouvement
          </button>
        </div>

        {attachError && <div className={`rounded-2xl px-4 py-3 text-sm ${M3_STATUS.out.bg} ${M3_STATUS.out.fg}`}>{attachError}</div>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div
            className={
              'col-span-2 flex items-center gap-4 rounded-[28px] px-6 py-5 lg:col-span-1 ' +
              (totalBalance < 0 ? `${M3_STATUS.out.bg} ${M3_STATUS.out.fg}` : 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]')
            }
          >
            <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/40">
              <Vault size={24} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium opacity-80">Solde du coffre</div>
              <div className="break-words text-[28px] font-bold leading-9 tracking-tight tabular-nums">{fmtHTG(totalBalance)}</div>
            </div>
          </div>
          {COFFRE_ACCOUNTS.map((a) => {
            const Icon = a.icon;
            return (
              <div key={a.id} className="flex items-center gap-4 rounded-[28px] bg-[var(--m3-surface-container)] px-5 py-5">
                <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]">
                  <Icon size={22} />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm text-[var(--m3-on-surface-variant)]">{a.label}</div>
                  <div className={'truncate text-xl font-semibold leading-7 tabular-nums ' + (balances[a.id] < 0 ? 'text-[#BA1A1A]' : '')}>{fmtHTG(balances[a.id])}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-12 min-w-[240px] max-w-md flex-1 items-center gap-3 rounded-full bg-[var(--m3-surface-container-high)] px-4 transition-shadow focus-within:ring-2 focus-within:ring-[var(--m3-primary)] motion-reduce:transition-none">
            <Search className="h-5 w-5 shrink-0 text-[var(--m3-on-surface-variant)]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Catégorie, note ou réf. pièce…"
              aria-label="Rechercher un mouvement"
              className="w-full min-w-0 border-none bg-transparent text-sm text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Effacer la recherche"
                className={`group relative -mr-2 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}
              >
                <M3StateLayer />
                <X size={18} />
              </button>
            )}
          </div>
          {segmented('Période', COFFRE_PERIODS.map((p): [string, string] => [p.id, p.label]), period, (id) => setPeriod(id as CoffrePeriod), 'w-[340px]')}
          <div className="ml-auto text-sm tabular-nums text-[var(--m3-on-surface-variant)]" aria-live="polite">
            {rows.length} mouvement{rows.length !== 1 ? 's' : ''} · {periodLabel}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Filtrer par type" className="flex flex-wrap gap-2">
            {chipDesk(kindFilter === 'all', 'Tous', () => setKindFilter('all'))}
            {(Object.keys(COFFRE_KIND_META) as CoffreKind[]).map((k) => chipDesk(kindFilter === k, COFFRE_KIND_META[k].plural, () => setKindFilter(k)))}
          </div>
          <span aria-hidden="true" className="mx-2 h-6 w-px bg-[var(--m3-outline-variant)]" />
          <div role="group" aria-label="Filtrer par compte" className="flex flex-wrap gap-2">
            {chipDesk(accountFilter === 'all', 'Tous les comptes', () => setAccountFilter('all'))}
            {COFFRE_ACCOUNTS.map((a) => chipDesk(accountFilter === a.id, a.label, () => setAccountFilter(a.id)))}
          </div>
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="overflow-hidden rounded-[28px] bg-[var(--m3-surface-container)]">
            <div className="max-h-[62vh] overflow-auto">
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 bg-[var(--m3-surface-container-high)] text-xs text-[var(--m3-on-surface-variant)] shadow-[0_1px_0_var(--m3-outline-variant)]">
                  <tr>
                    {coffreHead('date', 'Date')}
                    <th scope="col" className="px-4 py-3 text-left font-medium">Type</th>
                    {coffreHead('categorie', 'Catégorie / note')}
                    <th scope="col" className="px-4 py-3 text-left font-medium">Compte</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">Pièce</th>
                    {coffreHead('montant', 'Montant', 'right')}
                    <th scope="col" className="w-24 px-3 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((e) => {
                    const Icon = COFFRE_KIND_META[e.kind].icon;
                    const tone = e.kind === 'entree' ? 'text-[var(--m3-primary)]' : e.kind === 'sortie' ? 'text-[#BA1A1A]' : '';
                    const sign = e.kind === 'entree' ? '+' : e.kind === 'sortie' ? '−' : '⇄';
                    return (
                      <tr key={e.id} className="border-b border-[var(--m3-outline-variant)]/60 transition-colors last:border-b-0 hover:bg-[var(--m3-surface-container-high)] motion-reduce:transition-none">
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="tabular-nums">{e.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</div>
                          <div className="text-xs tabular-nums text-[var(--m3-on-surface-variant)]">{fmtTime12(e.date)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-2.5">
                            <span aria-hidden="true" className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-full ' + kindIconTone(e.kind)}>
                              <Icon size={16} />
                            </span>
                            <span className="font-medium">{COFFRE_KIND_META[e.kind].label}</span>
                          </span>
                        </td>
                        <td className="max-w-[240px] px-4 py-3">
                          <div className="truncate font-medium">{e.categorie}</div>
                          {e.note && <div className="truncate text-xs text-[var(--m3-on-surface-variant)]">{e.note}</div>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {coffreAccountLabel(e.compte)}
                          {e.compteDest && <span className="text-[var(--m3-on-surface-variant)]"> → {coffreAccountLabel(e.compteDest)}</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {e.piece ? (
                            <button
                              type="button"
                              onClick={() => setViewingId(e.id)}
                              className={`group relative flex h-8 items-center gap-1.5 overflow-hidden rounded-lg border border-[var(--m3-outline)] px-3 text-xs font-medium ${M3_FOCUS}`}
                              title="Voir la pièce"
                            >
                              <M3StateLayer />
                              <Paperclip size={12} className="shrink-0" />
                              <span className="font-mono">{e.piece.ref}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startAttach(e.id)}
                              className={`group relative flex h-8 items-center gap-1.5 overflow-hidden rounded-lg px-3 text-xs font-medium ${M3_STATUS.low.bg} ${M3_STATUS.low.fg} ${M3_FOCUS}`}
                              title="Joindre une pièce"
                            >
                              <M3StateLayer />
                              <Paperclip size={12} className="shrink-0" />
                              Joindre une pièce
                            </button>
                          )}
                        </td>
                        <td className={'whitespace-nowrap px-4 py-3 text-right text-base font-semibold tabular-nums ' + tone}>
                          {sign} {fmtHTG(e.montant)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-0.5">
                            {e.piece && (
                              <button type="button" onClick={() => downloadPiece(e)} className={rowBtn} aria-label="Télécharger la pièce" title="Télécharger la pièce">
                                <M3StateLayer />
                                <Download size={18} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm('Supprimer ce mouvement ?')) onDelete(e.id);
                              }}
                              className={rowBtn}
                              aria-label="Supprimer"
                              title="Supprimer"
                            >
                              <M3StateLayer />
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {sortedRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]">
                            <Vault size={28} />
                          </span>
                          <span className="text-base font-medium">Aucun mouvement sur cette période.</span>
                          <span className="text-sm text-[var(--m3-on-surface-variant)]">Changez la période ou les filtres, ou ajoutez un mouvement.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <section className="rounded-[28px] bg-[var(--m3-surface-container)] p-5">
              <h3 className="mb-3 text-base font-medium">Résumé · {periodLabel}</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0 rounded-[20px] bg-[var(--m3-primary-container)] p-3 text-[var(--m3-on-primary-container)]">
                  <div className="flex items-center gap-1 text-xs opacity-80"><ArrowDownLeft size={12} /> Entrées</div>
                  <div className="mt-1 truncate text-lg font-semibold tabular-nums">+ {num(totalIn)}</div>
                </div>
                <div className={`min-w-0 rounded-[20px] p-3 ${M3_STATUS.out.bg} ${M3_STATUS.out.fg}`}>
                  <div className="flex items-center gap-1 text-xs opacity-80"><ArrowUpRight size={12} /> Sorties</div>
                  <div className="mt-1 truncate text-lg font-semibold tabular-nums">− {num(totalOut)}</div>
                </div>
              </div>
              <div className="mt-2 flex items-baseline justify-between rounded-[20px] bg-[var(--m3-surface-container-high)] px-4 py-3">
                <span className="text-sm text-[var(--m3-on-surface-variant)]">Net de la période</span>
                <span className={'text-xl font-semibold tabular-nums ' + (net < 0 ? 'text-[#BA1A1A]' : '')}>{fmtHTG(net)}</span>
              </div>
            </section>

            <section className="space-y-5 rounded-[28px] bg-[var(--m3-surface-container)] p-5">
              <h3 className="text-base font-medium">Par catégorie · {periodLabel}</h3>
              {m3Breakdown('Entrées', inBreakdown, 'text-[var(--m3-primary)]', 'bg-[var(--m3-primary)]')}
              {m3Breakdown('Sorties', outBreakdown, 'text-[#BA1A1A]', 'bg-[#BA1A1A]')}
            </section>
          </div>
        </div>
      </div>

      {formOpen && (
        <CoffreForm onClose={() => setFormOpen(false)} balances={balances} date={selectedDate} cashEnMainDuJour={cashEnMainDuJour} onAdd={onAdd} />
      )}
    </>
  );
}

function PettyForm({
  balance,
  fixedFloat,
  coffreEspeces,
  date,
  onAdd,
  onClose,
}: {
  balance: number;
  fixedFloat: number;
  coffreEspeces: number;
  date: Date;
  onAdd: (entry: Omit<PettyEntry, 'id' | 'branchId' | 'coffreId'>, fromCoffre: boolean) => void;
  /** Rendered as a Material 3 sheet: bottom sheet on phone, side sheet on PC. */
  onClose: () => void;
}) {
  const [kind, setKind] = useState<PettyKind>('depense');
  const [categorie, setCategorie] = useState<string>(PETTY_CATEGORIES[0]);
  const [montant, setMontant] = useState('');
  const [recu, setRecu] = useState('');
  const [note, setNote] = useState('');
  const [fromCoffre, setFromCoffre] = useState(true);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const value = Number(montant);
  const valid = Number.isFinite(value) && value > 0;
  const missing = Math.max(fixedFloat - balance, 0);
  const overBalance = kind === 'depense' && valid && value > balance;
  const overCoffre = kind === 'reappro' && fromCoffre && valid && value > coffreEspeces;

  const submit = () => {
    if (!valid) return;
    const when = new Date(date);
    const now = new Date();
    when.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
    onAdd(
      {
        date: when,
        kind,
        categorie: kind === 'reappro' ? PETTY_REAPPRO_CATEGORY : categorie,
        montant: value,
        note: note.trim() || undefined,
        recu: kind === 'depense' ? recu.trim() || undefined : undefined,
      },
      fromCoffre
    );
    setMontant('');
    setNote('');
    setRecu('');
    onClose();
  };

  const m3Field =
    'block min-w-0 rounded-xl bg-[var(--m3-surface)] px-4 pb-1.5 pt-2 ring-1 ring-[var(--m3-outline)] transition-shadow focus-within:ring-2 focus-within:ring-[var(--m3-primary)] motion-reduce:transition-none';
  const m3Input = 'h-8 w-full min-w-0 bg-transparent p-0 text-base text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)]';
  const m3Label = 'block text-xs leading-4 text-[var(--m3-on-surface-variant)]';
  const kindTone: Record<PettyKind, string> = {
    depense: `${M3_STATUS.out.bg} ${M3_STATUS.out.fg}`,
    reappro: 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]',
  };
  const kinds: Array<{ id: PettyKind; label: string; icon: LucideIcon }> = [
    { id: 'depense', label: 'Dépense', icon: ArrowUpRight },
    { id: 'reappro', label: 'Réappro', icon: ArrowDownLeft },
  ];

  return createPortal(
    <>
      <div aria-hidden="true" onClick={onClose} className="m3-scrim fixed inset-0 z-[80] bg-black/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nouveau mouvement de petite caisse"
        style={M3_VARS}
        className="m3-sheet fixed inset-x-0 bottom-0 z-[81] flex max-h-[92dvh] w-full flex-col rounded-t-[28px] bg-[var(--m3-surface-container-low)] pt-2 text-[var(--m3-on-surface)] shadow-[0_-8px_24px_rgba(0,0,0,0.16)] sm:inset-x-auto sm:inset-y-0 sm:bottom-auto sm:right-0 sm:h-full sm:max-h-none sm:w-[480px] sm:max-w-full sm:rounded-l-[28px] sm:rounded-tr-none sm:pt-4 sm:shadow-[-8px_0_24px_rgba(0,0,0,0.16)] sm:[animation:m3-side-in_.4s_var(--m3-spring-effects)]"
      >
        <div className="mx-auto mb-3 mt-1 h-1 w-8 shrink-0 rounded-full bg-[var(--m3-outline-variant)] sm:hidden" />
        <div className="shrink-0 px-6 pb-3">
          <div className="text-xs font-medium text-[var(--m3-on-surface-variant)]">Petite caisse</div>
          <div className="mt-1 text-[24px] font-normal leading-8">Nouveau mouvement</div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
          {/* Type: segmented button */}
          <div role="group" aria-label="Type de mouvement" className="flex h-10 overflow-hidden rounded-full border border-[var(--m3-outline)]">
            {kinds.map((k, i) => {
              const Icon = k.icon;
              const selected = kind === k.id;
              return (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setKind(k.id)}
                  className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 text-sm font-medium m3-morph motion-reduce:transition-none ${M3_FOCUS} ${
                    i > 0 ? 'border-l border-[var(--m3-outline)]' : ''
                  } ${selected ? kindTone[k.id] : 'text-[var(--m3-on-surface)] active:bg-[var(--m3-surface-container-highest)]'}`}
                >
                  {selected ? <Check size={16} className="shrink-0" /> : <Icon size={16} className="shrink-0" />}
                  <span className="truncate">{k.label}</span>
                </button>
              );
            })}
          </div>

          {kind === 'depense' ? (
            <label className={m3Field}>
              <span className={m3Label}>Catégorie</span>
              <select value={categorie} onChange={(e) => setCategorie(e.target.value)} className={m3Input}>
                {PETTY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            missing > 0 && (
              <button
                type="button"
                onClick={() => setMontant(String(Math.round(missing)))}
                className={`group relative flex min-h-12 w-full items-center gap-3 overflow-hidden rounded-2xl bg-[var(--m3-tertiary-container)] px-4 py-2 text-left text-sm text-[var(--m3-on-tertiary-container)] m3-press-card motion-reduce:transition-none ${M3_FOCUS}`}
              >
                <M3StateLayer />
                <Coins size={18} className="shrink-0" />
                <span className="min-w-0">
                  Compléter jusqu&apos;au fonds fixe
                  <span className="block font-medium tabular-nums">{fmtHTG(missing)}</span>
                </span>
              </button>
            )
          )}

          <div>
            <label className={m3Field}>
              <span className={m3Label}>Montant (HTG)</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="0"
                className={m3Input + ' tabular-nums'}
              />
            </label>
            {overBalance && (
              <div className={`mt-2 rounded-2xl px-4 py-2.5 text-sm ${M3_STATUS.low.bg} ${M3_STATUS.low.fg}`}>
                Dépasse le solde de la petite caisse : {fmtHTG(balance)} disponible
              </div>
            )}
          </div>

          {kind === 'depense' && (
            <label className={m3Field}>
              <span className={m3Label}>N° de reçu (optionnel)</span>
              <input
                type="text"
                value={recu}
                onChange={(e) => setRecu(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="Ex : R-1042"
                className={m3Input}
              />
            </label>
          )}

          <label className={m3Field}>
            <span className={m3Label}>{kind === 'depense' ? 'Motif / bénéficiaire' : 'Note'} (optionnel)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder={kind === 'depense' ? 'Ex : moto-taxi livraison' : 'Ex : complément de fin de semaine'}
              className={m3Input}
            />
          </label>

          {kind === 'reappro' && (
            <>
              {/* Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={fromCoffre}
                onClick={() => setFromCoffre((v) => !v)}
                className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-[20px] bg-[var(--m3-surface-container)] px-4 py-3 text-left m3-press-card motion-reduce:transition-none ${M3_FOCUS}`}
              >
                <M3StateLayer />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Prélever sur le Coffre (Espèces)</span>
                  <span className="block text-xs text-[var(--m3-on-surface-variant)]">
                    Crée une sortie dans le Coffre · {fmtHTG(coffreEspeces)} disponible
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={`relative h-8 w-[52px] shrink-0 rounded-full border-2 transition-colors motion-reduce:transition-none ${
                    fromCoffre ? 'border-[var(--m3-primary)] bg-[var(--m3-primary)]' : 'border-[var(--m3-outline)] bg-[var(--m3-surface-container-highest)]'
                  }`}
                >
                  <span
                    className={`absolute top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full transition-all duration-300 motion-reduce:transition-none ${
                      fromCoffre ? 'left-[22px] h-6 w-6 bg-[var(--m3-on-primary)] text-[var(--m3-primary)]' : 'left-1 h-4 w-4 bg-[var(--m3-outline)]'
                    }`}
                  >
                    {fromCoffre && <Check size={14} />}
                  </span>
                </span>
              </button>
              {overCoffre && (
                <div className={`rounded-2xl px-4 py-2.5 text-sm ${M3_STATUS.low.bg} ${M3_STATUS.low.fg}`}>
                  Espèces du Coffre insuffisantes pour ce montant
                </div>
              )}
            </>
          )}

          <div className="px-1 text-xs text-[var(--m3-on-surface-variant)]">
            Date : {date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-[var(--m3-outline-variant)] bg-[var(--m3-surface-container-low)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={onClose}
            className={`h-12 shrink-0 rounded-full px-6 text-sm font-medium text-[var(--m3-primary)] active:bg-[var(--m3-surface-container-highest)] ${M3_FOCUS}`}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid}
            className={`group relative flex h-12 flex-1 items-center justify-center gap-2 overflow-hidden rounded-full text-sm font-medium m3-press motion-reduce:transition-none ${M3_FOCUS} ${
              valid ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]' : 'cursor-not-allowed bg-[var(--m3-surface-container-highest)] text-[var(--m3-outline)]'
            }`}
          >
            {valid && <M3StateLayer />}
            <Plus size={18} /> Enregistrer
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

function PettyCountPanel({
  theorique,
  onSave,
}: {
  theorique: number;
  onSave: (compte: number, note?: string) => void;
}) {
  const [compte, setCompte] = useState('');
  const [note, setNote] = useState('');
  const value = Number(compte);
  const valid = compte.trim() !== '' && Number.isFinite(value) && value >= 0;
  const ecart = valid ? value - theorique : 0;

  const save = () => {
    if (!valid) return;
    onSave(value, note.trim() || undefined);
    setCompte('');
    setNote('');
  };

  const m3Field =
    'block min-w-0 rounded-xl bg-[var(--m3-surface)] px-4 pb-1.5 pt-2 ring-1 ring-[var(--m3-outline)] transition-shadow focus-within:ring-2 focus-within:ring-[var(--m3-primary)] motion-reduce:transition-none';
  const m3Input = 'h-8 w-full min-w-0 bg-transparent p-0 text-base text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)]';
  const m3Label = 'block text-xs leading-4 text-[var(--m3-on-surface-variant)]';

  return (
    <section className="space-y-3 rounded-[28px] bg-[var(--m3-surface-container)] p-5">
      <h3 className="text-base font-medium">Comptage de la caisse</h3>
      <div className="flex items-baseline justify-between rounded-[20px] bg-[var(--m3-surface-container-high)] px-4 py-3">
        <span className="text-sm text-[var(--m3-on-surface-variant)]">Solde théorique</span>
        <span className="text-lg font-semibold tabular-nums">{fmtHTG(theorique)}</span>
      </div>
      <label className={m3Field}>
        <span className={m3Label}>Montant compté (HTG)</span>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={compte}
          onChange={(e) => setCompte(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="Argent réellement en caisse"
          className={m3Input + ' tabular-nums'}
        />
      </label>
      {valid && (
        <div
          role="status"
          className={
            'm3-in flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium ' +
            (ecart === 0
              ? 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]'
              : ecart < 0
                ? `${M3_STATUS.out.bg} ${M3_STATUS.out.fg}`
                : `${M3_STATUS.low.bg} ${M3_STATUS.low.fg}`)
          }
        >
          {ecart === 0 ? <Check size={16} /> : <AlertTriangle size={16} />}
          {ecart === 0 ? 'Caisse juste' : ecart < 0 ? `Manque ${fmtHTG(Math.abs(ecart))}` : `Excédent ${fmtHTG(ecart)}`}
        </div>
      )}
      <label className={m3Field}>
        <span className={m3Label}>Note sur l&apos;écart (optionnel)</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          className={m3Input}
        />
      </label>
      <button
        type="button"
        onClick={save}
        disabled={!valid}
        className={`group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-full text-sm font-medium m3-press motion-reduce:transition-none ${M3_FOCUS} ${
          valid ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]' : 'cursor-not-allowed bg-[var(--m3-surface-container-highest)] text-[var(--m3-outline)]'
        }`}
      >
        {valid && <M3StateLayer />}
        <Check size={18} /> Enregistrer le comptage
      </button>
    </section>
  );
}

function BranchPetiteCaisseSection({
  branch,
  selectedDate,
  entries,
  counts,
  fixedFloat,
  setFixedFloat,
  coffreEspeces,
  onAdd,
  onDelete,
  onAddCount,
  onDeleteCount,
}: {
  branch: Branch;
  selectedDate: Date;
  entries: PettyEntry[];
  counts: PettyCount[];
  fixedFloat: number;
  setFixedFloat: (value: number) => void;
  coffreEspeces: number;
  onAdd: (entry: Omit<PettyEntry, 'id' | 'branchId' | 'coffreId'>, fromCoffre: boolean) => void;
  onDelete: (id: string) => void;
  onAddCount: (count: Omit<PettyCount, 'id' | 'branchId'>) => void;
  onDeleteCount: (id: string) => void;
}) {
  const [period, setPeriod] = useState<CoffrePeriod>('mois');
  const [kindFilter, setKindFilter] = useState<'all' | PettyKind>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();

  const balance = useMemo(() => pettyBalance(entries), [entries]);
  const missing = Math.max(fixedFloat - balance, 0);
  const ratio = fixedFloat > 0 ? Math.min(Math.max(balance / fixedFloat, 0), 1) : 0;

  const lastCount = useMemo(
    () => [...counts].sort((a, b) => b.date.getTime() - a.date.getTime())[0] ?? null,
    [counts]
  );

  const spentThisMonth = useMemo(
    () =>
      entries
        .filter((e) => e.kind === 'depense' && e.date.getFullYear() === year && e.date.getMonth() === month)
        .reduce((sum, e) => sum + e.montant, 0),
    [entries, year, month]
  );

  const inPeriod = (d: Date) =>
    period === 'tout'
      ? true
      : period === 'jour'
        ? isSameDay(d, selectedDate)
        : period === 'mois'
          ? d.getFullYear() === year && d.getMonth() === month
          : d.getFullYear() === year;

  const periodEntries = useMemo(
    () => entries.filter((e) => inPeriod(e.date)), // eslint-disable-line react-hooks/exhaustive-deps
    [entries, period, year, month, selectedDate] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return periodEntries
      .filter((e) => kindFilter === 'all' || e.kind === kindFilter)
      .filter((e) => categoryFilter === 'all' || e.categorie === categoryFilter)
      .filter(
        (e) =>
          !q ||
          e.categorie.toLowerCase().includes(q) ||
          (e.note ?? '').toLowerCase().includes(q) ||
          (e.recu ?? '').toLowerCase().includes(q)
      )
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [periodEntries, kindFilter, categoryFilter, query]);

  const totalReappro = rows.filter((e) => e.kind === 'reappro').reduce((sum, e) => sum + e.montant, 0);
  const totalDepenses = rows.filter((e) => e.kind === 'depense').reduce((sum, e) => sum + e.montant, 0);
  const sansRecu = rows.filter((e) => e.kind === 'depense' && !e.recu).length;

  const periodLabel =
    period === 'jour'
      ? selectedDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
      : period === 'mois'
        ? `${MONTHS_FR[month]} ${year}`
        : period === 'annee'
          ? String(year)
          : 'Depuis le début';

  const breakdown = useMemo(() => {
    const map = new Map<string, number>();
    periodEntries
      .filter((e) => e.kind === 'depense')
      .forEach((e) => map.set(e.categorie, (map.get(e.categorie) ?? 0) + e.montant));
    return Array.from(map.entries())
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => b.total - a.total);
  }, [periodEntries]);
  const maxBreak = Math.max(...breakdown.map((b) => b.total), 1);

  const sortedCounts = useMemo(() => [...counts].sort((a, b) => b.date.getTime() - a.date.getTime()), [counts]);

  const num = (n: number) => fmtHTG(n).replace(' HTG', '');
  const gaugeColor = ratio < 0.2 ? '#BA1A1A' : ratio < 0.5 ? 'var(--m3-tertiary)' : 'var(--m3-primary)';
  const heroTone = balance < 0 ? `${M3_STATUS.out.bg} ${M3_STATUS.out.fg}` : 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]';
  const ecartLabel = (ecart: number) => (ecart === 0 ? 'Aucun' : (ecart > 0 ? '+ ' : '− ') + fmtHTG(Math.abs(ecart)));
  const ecartTone = (ecart: number) =>
    ecart === 0
      ? 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]'
      : ecart < 0
        ? `${M3_STATUS.out.bg} ${M3_STATUS.out.fg}`
        : `${M3_STATUS.low.bg} ${M3_STATUS.low.fg}`;

  const iconBtn =
    'group relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ' + M3_FOCUS;
  const rowBtn = `group relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`;
  const kindIconTone = (k: PettyKind) =>
    k === 'reappro' ? 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]' : `${M3_STATUS.out.bg} ${M3_STATUS.out.fg}`;
  const m3Field =
    'block min-w-0 rounded-xl bg-[var(--m3-surface)] px-4 pb-1.5 pt-2 ring-1 ring-[var(--m3-outline)] transition-shadow focus-within:ring-2 focus-within:ring-[var(--m3-primary)] motion-reduce:transition-none';

  const m3Chip = (selected: boolean, label: string, onClick: () => void) => (
    <button
      key={label}
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`group relative shrink-0 before:absolute before:inset-x-0 before:-inset-y-2 before:content-[''] ${M3_FOCUS}`}
    >
      <span
        className={`relative flex h-9 items-center gap-2 overflow-hidden px-3.5 text-sm font-medium m3-morph ${selected ? 'rounded-full' : 'rounded-xl'} ${
          selected
            ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
            : 'border border-[var(--m3-outline)] text-[var(--m3-on-surface-variant)]'
        }`}
      >
        <M3StateLayer />
        {selected && <Check size={16} />}
        {label}
      </span>
    </button>
  );

  const chipDesk = (selected: boolean, label: string, onClick: () => void) => (
    <button key={label} type="button" aria-pressed={selected} onClick={onClick} className={`group relative shrink-0 ${M3_FOCUS}`}>
      <span
        className={`relative flex h-8 items-center gap-1.5 overflow-hidden px-3 text-sm font-medium m3-morph ${selected ? 'rounded-full' : 'rounded-lg'} ${
          selected
            ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
            : 'border border-[var(--m3-outline)] text-[var(--m3-on-surface-variant)]'
        }`}
      >
        <M3StateLayer />
        {selected && <Check size={14} />}
        {label}
      </span>
    </button>
  );

  const segmented = (label: string, options: Array<[string, string]>, value: string, onPick: (id: string) => void, width: string) => (
    <div
      role="group"
      aria-label={label}
      className={`grid h-12 ${width} max-w-full gap-0.5`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map(([id, text], idx) => {
        const selected = value === id;
        const shape = selected ? 'rounded-full' : idx === 0 ? 'rounded-l-full rounded-r-lg' : idx === options.length - 1 ? 'rounded-r-full rounded-l-lg' : 'rounded-lg';
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            onClick={() => onPick(id)}
            className={`group relative flex items-center justify-center gap-1.5 overflow-hidden px-2 text-sm font-semibold m3-morph ${shape} ${M3_FOCUS} ${
              selected ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]' : 'bg-[var(--m3-surface-container-high)] text-[var(--m3-on-surface)]'
            }`}
          >
            <M3StateLayer />
            {selected && <Check size={16} />}
            {text}
          </button>
        );
      })}
    </div>
  );

  const gauge = (
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)} aria-label="Niveau du fonds fixe">
      <div className="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${ratio * 100}%`, background: gaugeColor }} />
    </div>
  );

  const m3Breakdown = () => (
    <div>
      {breakdown.length === 0 ? (
        <div className="text-sm text-[var(--m3-on-surface-variant)]">Aucune dépense.</div>
      ) : (
        <div className="space-y-3">
          {breakdown.map((b) => (
            <div key={b.label}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{b.label}</span>
                <span className="shrink-0 font-medium tabular-nums">{fmtHTG(b.total)}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--m3-surface-container-highest)]">
                <div className="h-full rounded-full bg-[#BA1A1A]" style={{ width: `${(b.total / maxBreak) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const floatInput = (
    <input
      type="number"
      min={0}
      inputMode="numeric"
      value={fixedFloat}
      onChange={(e) => setFixedFloat(Math.max(Number(e.target.value) || 0, 0))}
      aria-label="Fonds fixe"
      className="h-8 w-full min-w-0 bg-transparent p-0 text-base tabular-nums text-[var(--m3-on-surface)] outline-none"
    />
  );

  const receiptPill = (e: PettyEntry) =>
    e.kind !== 'depense' ? null : e.recu ? (
      <span className="truncate rounded-lg border border-[var(--m3-outline)] px-2 py-0.5 font-mono text-xs">{e.recu}</span>
    ) : (
      <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${M3_STATUS.low.bg} ${M3_STATUS.low.fg}`}>Sans reçu</span>
    );

  return (
    <>
      {formOpen && (
        <PettyForm
          balance={balance}
          fixedFloat={fixedFloat}
          coffreEspeces={coffreEspeces}
          date={selectedDate}
          onAdd={onAdd}
          onClose={() => setFormOpen(false)}
        />
      )}

      {/* ===================== Phone: Material 3 ===================== */}
      <div
        style={M3_VARS}
        className="-mx-4 -mb-5 min-h-[calc(100dvh-8rem)] bg-[var(--m3-surface)] px-4 pb-28 pt-4 font-sans text-[var(--m3-on-surface)] sm:hidden"
      >
        <div className="mb-4">
          <h2 className="text-[32px] font-bold leading-10 tracking-tight">Petite caisse</h2>
          <p className="truncate text-sm leading-5 text-[var(--m3-on-surface-variant)]">
            {branch.nom} · {entries.length} mouvement{entries.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="space-y-3">
          {/* Balance hero */}
          <section className={'rounded-[28px] p-5 ' + heroTone}>
            <div className="flex items-center gap-1.5 text-xs font-medium opacity-80">
              <Coins size={14} /> Solde théorique
            </div>
            <div className="mt-1 break-words text-[32px] font-bold leading-10 tracking-tight tabular-nums">{fmtHTG(balance)}</div>
            {gauge}
            <div className="mt-2 text-xs opacity-80">
              {fixedFloat > 0 ? `${Math.round(ratio * 100)} % du fonds fixe de ${fmtHTG(fixedFloat)}` : 'Aucun fonds fixe défini'}
            </div>
          </section>

          {/* Float + refill */}
          <div className="grid grid-cols-2 gap-2">
            <label className={m3Field}>
              <span className="block text-xs leading-4 text-[var(--m3-on-surface-variant)]">Fonds fixe (HTG)</span>
              {floatInput}
            </label>
            <div className={'min-w-0 rounded-[20px] p-3 ' + (missing > 0 ? `${M3_STATUS.low.bg} ${M3_STATUS.low.fg}` : 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]')}>
              <div className="text-xs opacity-80">À réapprovisionner</div>
              <div className="mt-1 truncate text-sm font-semibold tabular-nums">{missing > 0 ? fmtHTG(missing) : 'Fonds complet'}</div>
            </div>
            <div className="min-w-0 rounded-[20px] bg-[var(--m3-surface-container)] p-3">
              <div className="text-xs text-[var(--m3-on-surface-variant)]">Dépenses · {MONTHS_FR[month]}</div>
              <div className="mt-1 truncate text-sm font-semibold tabular-nums">{fmtHTG(spentThisMonth)}</div>
            </div>
            <div className={'min-w-0 rounded-[20px] p-3 ' + (lastCount ? ecartTone(lastCount.ecart) : 'bg-[var(--m3-surface-container)]')}>
              <div className="text-xs opacity-80">Dernier écart</div>
              <div className="mt-1 truncate text-sm font-semibold tabular-nums">{lastCount ? ecartLabel(lastCount.ecart) : '—'}</div>
              {lastCount && (
                <div className="truncate text-[11px] opacity-80">
                  {lastCount.date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </div>
              )}
            </div>
          </div>

          {/* Period: segmented button */}
          <div role="group" aria-label="Période" className="flex h-10 overflow-hidden rounded-full border border-[var(--m3-outline)]">
            {COFFRE_PERIODS.map((p, i) => {
              const selected = period === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setPeriod(p.id)}
                  className={
                    'flex min-w-0 flex-1 items-center justify-center gap-1 text-sm font-medium m3-morph motion-reduce:transition-none ' +
                    M3_FOCUS +
                    (i > 0 ? ' border-l border-[var(--m3-outline)]' : '') +
                    (selected
                      ? ' bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
                      : ' text-[var(--m3-on-surface)] active:bg-[var(--m3-surface-container-highest)]')
                  }
                >
                  {selected && <Check size={14} className="shrink-0" />}
                  <span className="truncate">{p.label}</span>
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="flex h-14 w-full min-w-0 items-center gap-3 rounded-full bg-[var(--m3-surface-container-high)] px-4 transition-shadow focus-within:ring-2 focus-within:ring-[var(--m3-primary)] motion-reduce:transition-none">
            <Search className="h-6 w-6 shrink-0 text-[var(--m3-on-surface-variant)]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Catégorie, motif ou n° de reçu…"
              className="w-full min-w-0 border-none bg-transparent text-base text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)]"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Effacer la recherche" className={`${iconBtn} -mr-2`}>
                <M3StateLayer />
                <X size={20} />
              </button>
            )}
          </div>

          {/* Filter chips: type, then category */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filtrer par type">
            {m3Chip(kindFilter === 'all', 'Tous', () => setKindFilter('all'))}
            {m3Chip(kindFilter === 'depense', 'Dépenses', () => setKindFilter('depense'))}
            {m3Chip(kindFilter === 'reappro', 'Réappros', () => setKindFilter('reappro'))}
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filtrer par catégorie">
            {m3Chip(categoryFilter === 'all', 'Toutes catégories', () => setCategoryFilter('all'))}
            {PETTY_CATEGORIES.map((c) => m3Chip(categoryFilter === c, c, () => setCategoryFilter(c)))}
          </div>

          {/* Period totals */}
          <section>
            <div className="flex items-baseline justify-between px-1 pb-2 pt-1">
              <h3 className="text-base font-medium">Journal · {periodLabel}</h3>
              <span className="text-xs text-[var(--m3-on-surface-variant)]">HTG</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="min-w-0 rounded-[20px] bg-[var(--m3-secondary-container)] p-3 text-[var(--m3-on-secondary-container)]">
                <div className="flex items-center gap-1 text-xs opacity-80">
                  <ArrowDownLeft size={12} /> Réappros
                </div>
                <div className="mt-1 truncate text-sm font-medium tabular-nums">+ {num(totalReappro)}</div>
              </div>
              <div className={`min-w-0 rounded-[20px] p-3 ${M3_STATUS.out.bg} ${M3_STATUS.out.fg}`}>
                <div className="flex items-center gap-1 text-xs opacity-80">
                  <ArrowUpRight size={12} /> Dépenses
                </div>
                <div className="mt-1 truncate text-sm font-medium tabular-nums">− {num(totalDepenses)}</div>
              </div>
              <div className={'min-w-0 rounded-[20px] p-3 ' + (sansRecu > 0 ? `${M3_STATUS.low.bg} ${M3_STATUS.low.fg}` : 'bg-[var(--m3-surface-container)]')}>
                <div className="text-xs opacity-80">Sans reçu</div>
                <div className="mt-1 truncate text-sm font-medium tabular-nums">{sansRecu}</div>
              </div>
            </div>
          </section>

          {/* Ledger */}
          {rows.length === 0 ? (
            <div className="rounded-[28px] bg-[var(--m3-surface-container-low)] px-4 py-10 text-center text-sm text-[var(--m3-on-surface-variant)]">
              Aucun mouvement sur cette période.
            </div>
          ) : (
            <ul className="space-y-2">
              {rows.map((e) => {
                const isIn = e.kind === 'reappro';
                const Icon = isIn ? ArrowDownLeft : ArrowUpRight;
                const tone = isIn ? 'text-[var(--m3-primary)]' : 'text-[#BA1A1A]';
                return (
                  <li key={e.id} className="rounded-[20px] bg-[var(--m3-surface-container)] p-3">
                    <div className="flex items-center gap-3">
                      <span className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-full ' + kindIconTone(e.kind)}>
                        <Icon size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium">{e.categorie}</span>
                          {e.coffreId && (
                            <span className="shrink-0 rounded-md bg-[var(--m3-secondary-container)] px-1.5 py-px text-[10px] font-medium text-[var(--m3-on-secondary-container)]">Coffre</span>
                          )}
                        </div>
                        <div className="truncate text-xs text-[var(--m3-on-surface-variant)]">
                          {e.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} · {fmtTime12(e.date)}
                        </div>
                      </div>
                      <div className={'shrink-0 text-sm font-medium tabular-nums ' + tone}>
                        {isIn ? '+' : '−'} {fmtHTG(e.montant)}
                      </div>
                    </div>
                    {e.note && <div className="mt-1.5 pl-[52px] text-xs text-[var(--m3-on-surface-variant)]">{e.note}</div>}
                    <div className="mt-1 flex items-center justify-between gap-2 pl-[52px]">
                      <div className="flex min-w-0 items-center">{receiptPill(e)}</div>
                      <button type="button" onClick={() => onDelete(e.id)} aria-label="Supprimer" className={`${iconBtn} -mr-1`}>
                        <M3StateLayer />
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Count */}
          <PettyCountPanel
            theorique={balance}
            onSave={(compte, note) => onAddCount({ date: new Date(), theorique: balance, compte, ecart: compte - balance, note })}
          />

          {/* Count history */}
          <section className="rounded-[28px] bg-[var(--m3-surface-container-low)] p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-base font-medium">Historique des comptages</h3>
              <span className="text-xs text-[var(--m3-on-surface-variant)]">{sortedCounts.length}</span>
            </div>
            {sortedCounts.length === 0 ? (
              <div className="py-4 text-center text-sm text-[var(--m3-on-surface-variant)]">Aucun comptage enregistré.</div>
            ) : (
              <ul className="divide-y divide-[var(--m3-outline-variant)]">
                {sortedCounts.slice(0, 12).map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium tabular-nums">
                        {fmtHTG(c.compte)}
                        <span className="ml-1.5 text-xs font-normal text-[var(--m3-on-surface-variant)]">/ {fmtHTG(c.theorique)}</span>
                      </div>
                      <div className="truncate text-xs text-[var(--m3-on-surface-variant)]">
                        {c.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} · {fmtTime12(c.date)}
                        {c.note ? ` · ${c.note}` : ''}
                      </div>
                    </div>
                    <span className={'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ' + ecartTone(c.ecart)}>
                      {c.ecart === 0 ? '0' : (c.ecart > 0 ? '+ ' : '− ') + num(Math.abs(c.ecart))}
                    </span>
                    <button type="button" onClick={() => onDeleteCount(c.id)} aria-label="Supprimer" className={`${rowBtn} -mr-1`}>
                      <M3StateLayer />
                      <Trash2 size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Breakdown */}
          <section className="space-y-3 rounded-[28px] bg-[var(--m3-surface-container-low)] p-4">
            <h3 className="text-base font-medium">Dépenses par catégorie · {periodLabel}</h3>
            {m3Breakdown()}
          </section>
        </div>

        {/* FAB */}
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className={`group fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 shrink-0 items-center justify-center gap-3 overflow-hidden rounded-[20px] bg-[var(--m3-primary-container)] px-6 text-base font-semibold tracking-[0.01em] text-[var(--m3-on-primary-container)] shadow-[0_3px_8px_3px_rgba(0,0,0,0.15),0_1px_3px_rgba(0,0,0,0.3)] m3-press motion-reduce:transition-none ${M3_FOCUS}`}
        >
          <M3StateLayer />
          <Plus className="h-6 w-6" />
          Mouvement
        </button>
      </div>

      {/* ===================== Desktop (sm and up) ===================== */}
      <div style={M3_VARS} className="hidden space-y-5 font-sans text-[var(--m3-on-surface)] sm:block">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[32px] font-bold leading-10 tracking-tight">Petite caisse</h2>
            <p className="truncate text-sm text-[var(--m3-on-surface-variant)]">
              {branch.nom} · Petites dépenses du quotidien · {entries.length} mouvement{entries.length !== 1 ? 's' : ''} au total
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className={`group relative flex h-12 shrink-0 items-center gap-2 overflow-hidden rounded-[20px] bg-[var(--m3-primary)] px-6 text-sm font-semibold text-[var(--m3-on-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.3),0_1px_2px_rgba(0,0,0,0.15)] transition-[box-shadow,transform] hover:shadow-[0_2px_6px_2px_rgba(0,0,0,0.15),0_1px_2px_rgba(0,0,0,0.3)] active:scale-[0.96] motion-reduce:transition-none ${M3_FOCUS}`}
          >
            <M3StateLayer />
            <Plus size={20} />
            Nouveau mouvement
          </button>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className={'col-span-2 rounded-[28px] px-6 py-5 lg:col-span-1 ' + heroTone}>
            <div className="flex items-center gap-1.5 text-sm font-medium opacity-80">
              <Coins size={16} /> Solde théorique
            </div>
            <div className="mt-1 break-words text-[28px] font-bold leading-9 tracking-tight tabular-nums">{fmtHTG(balance)}</div>
            {gauge}
          </div>

          <div className="rounded-[28px] bg-[var(--m3-surface-container)] px-5 py-5">
            <div className="text-sm text-[var(--m3-on-surface-variant)]">Fonds fixe</div>
            <div className="mt-1 flex items-baseline gap-2 rounded-xl border-b-2 border-[var(--m3-outline)] focus-within:border-[var(--m3-primary)]">
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={fixedFloat}
                onChange={(e) => setFixedFloat(Math.max(Number(e.target.value) || 0, 0))}
                aria-label="Fonds fixe"
                className="w-full min-w-0 bg-transparent text-xl font-semibold tabular-nums leading-7 outline-none"
              />
              <span className="text-xs text-[var(--m3-on-surface-variant)]">HTG</span>
            </div>
          </div>

          <div className={'rounded-[28px] px-5 py-5 ' + (missing > 0 ? `${M3_STATUS.low.bg} ${M3_STATUS.low.fg}` : 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]')}>
            <div className="text-sm opacity-80">À réapprovisionner</div>
            <div className="mt-1 truncate text-xl font-semibold leading-7 tabular-nums">{missing > 0 ? fmtHTG(missing) : 'Fonds complet'}</div>
          </div>

          <div className="rounded-[28px] bg-[var(--m3-surface-container)] px-5 py-5">
            <div className="text-sm text-[var(--m3-on-surface-variant)]">Dépenses · {MONTHS_FR[month]}</div>
            <div className="mt-1 truncate text-xl font-semibold leading-7 tabular-nums">{fmtHTG(spentThisMonth)}</div>
          </div>

          <div className={'rounded-[28px] px-5 py-5 ' + (lastCount ? ecartTone(lastCount.ecart) : 'bg-[var(--m3-surface-container)]')}>
            <div className="text-sm opacity-80">Dernier écart</div>
            <div className="mt-1 truncate text-xl font-semibold leading-7 tabular-nums">{lastCount ? ecartLabel(lastCount.ecart) : '—'}</div>
            {lastCount && (
              <div className="text-xs opacity-80">
                Comptage du {lastCount.date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
              </div>
            )}
          </div>
        </div>

        {/* Search + period */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-12 min-w-[240px] max-w-md flex-1 items-center gap-3 rounded-full bg-[var(--m3-surface-container-high)] px-4 transition-shadow focus-within:ring-2 focus-within:ring-[var(--m3-primary)] motion-reduce:transition-none">
            <Search className="h-5 w-5 shrink-0 text-[var(--m3-on-surface-variant)]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Catégorie, motif ou n° de reçu…"
              aria-label="Rechercher un mouvement"
              className="w-full min-w-0 border-none bg-transparent text-sm text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Effacer la recherche"
                className={`group relative -mr-2 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}
              >
                <M3StateLayer />
                <X size={18} />
              </button>
            )}
          </div>
          {segmented('Période', COFFRE_PERIODS.map((p): [string, string] => [p.id, p.label]), period, (id) => setPeriod(id as CoffrePeriod), 'w-[340px]')}
          <div className="ml-auto text-sm tabular-nums text-[var(--m3-on-surface-variant)]" aria-live="polite">
            {rows.length} mouvement{rows.length !== 1 ? 's' : ''} · {periodLabel}
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Filtrer par type" className="flex flex-wrap gap-2">
            {chipDesk(kindFilter === 'all', 'Tous', () => setKindFilter('all'))}
            {chipDesk(kindFilter === 'depense', 'Dépenses', () => setKindFilter('depense'))}
            {chipDesk(kindFilter === 'reappro', 'Réappros', () => setKindFilter('reappro'))}
          </div>
          <span aria-hidden="true" className="mx-2 h-6 w-px bg-[var(--m3-outline-variant)]" />
          <div role="group" aria-label="Filtrer par catégorie" className="flex flex-wrap gap-2">
            {chipDesk(categoryFilter === 'all', 'Toutes catégories', () => setCategoryFilter('all'))}
            {PETTY_CATEGORIES.map((c) => chipDesk(categoryFilter === c, c, () => setCategoryFilter(c)))}
          </div>
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          {/* Left: journal + counts history */}
          <div className="space-y-5">
            <div className="overflow-hidden rounded-[28px] bg-[var(--m3-surface-container)]">
              <div className="grid grid-cols-3 gap-2 p-3">
                <div className="min-w-0 rounded-[20px] bg-[var(--m3-secondary-container)] px-4 py-3 text-[var(--m3-on-secondary-container)]">
                  <div className="flex items-center gap-1 text-xs opacity-80"><ArrowDownLeft size={12} /> Réapprovisionnements</div>
                  <div className="mt-1 truncate text-lg font-semibold tabular-nums">+ {fmtHTG(totalReappro)}</div>
                </div>
                <div className={`min-w-0 rounded-[20px] px-4 py-3 ${M3_STATUS.out.bg} ${M3_STATUS.out.fg}`}>
                  <div className="flex items-center gap-1 text-xs opacity-80"><ArrowUpRight size={12} /> Dépenses</div>
                  <div className="mt-1 truncate text-lg font-semibold tabular-nums">− {fmtHTG(totalDepenses)}</div>
                </div>
                <div className={'min-w-0 rounded-[20px] px-4 py-3 ' + (sansRecu > 0 ? `${M3_STATUS.low.bg} ${M3_STATUS.low.fg}` : 'bg-[var(--m3-surface-container-high)]')}>
                  <div className="text-xs opacity-80">Sans reçu</div>
                  <div className="mt-1 truncate text-lg font-semibold tabular-nums">{sansRecu} dépense{sansRecu !== 1 ? 's' : ''}</div>
                </div>
              </div>

              <div className="max-h-[62vh] overflow-auto">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-[var(--m3-surface-container-high)] text-xs text-[var(--m3-on-surface-variant)] shadow-[0_1px_0_var(--m3-outline-variant)]">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">Date</th>
                      <th scope="col" className="px-4 py-3 font-medium">Type</th>
                      <th scope="col" className="px-4 py-3 font-medium">Catégorie / motif</th>
                      <th scope="col" className="px-4 py-3 font-medium">Reçu</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Montant</th>
                      <th scope="col" className="w-16 px-3 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-16 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]">
                              <Coins size={28} />
                            </span>
                            <span className="text-base font-medium">Aucun mouvement sur cette période.</span>
                            <span className="text-sm text-[var(--m3-on-surface-variant)]">Changez la période ou les filtres, ou ajoutez un mouvement.</span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {rows.map((e) => {
                      const isIn = e.kind === 'reappro';
                      const Icon = isIn ? ArrowDownLeft : ArrowUpRight;
                      const tone = isIn ? 'text-[var(--m3-primary)]' : 'text-[#BA1A1A]';
                      return (
                        <tr key={e.id} className="border-b border-[var(--m3-outline-variant)]/60 transition-colors last:border-b-0 hover:bg-[var(--m3-surface-container-high)] motion-reduce:transition-none">
                          <td className="whitespace-nowrap px-4 py-3">
                            <div className="tabular-nums">{e.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</div>
                            <div className="text-xs tabular-nums text-[var(--m3-on-surface-variant)]">{fmtTime12(e.date)}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-2.5">
                              <span aria-hidden="true" className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-full ' + kindIconTone(e.kind)}>
                                <Icon size={16} />
                              </span>
                              <span className="font-medium">{isIn ? 'Réappro' : 'Dépense'}</span>
                            </span>
                          </td>
                          <td className="max-w-[260px] px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-medium">{e.categorie}</span>
                              {e.coffreId && (
                                <span className="shrink-0 rounded-md bg-[var(--m3-secondary-container)] px-1.5 py-px text-[10px] font-medium text-[var(--m3-on-secondary-container)]">Coffre</span>
                              )}
                            </div>
                            {e.note && <div className="truncate text-xs text-[var(--m3-on-surface-variant)]">{e.note}</div>}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">{receiptPill(e) ?? <span className="text-[var(--m3-on-surface-variant)]">—</span>}</td>
                          <td className={'whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums ' + tone}>
                            {isIn ? '+' : '−'} {fmtHTG(e.montant)}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <button type="button" onClick={() => onDelete(e.id)} aria-label="Supprimer" className={rowBtn}>
                              <M3StateLayer />
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="overflow-hidden rounded-[28px] bg-[var(--m3-surface-container)]">
              <div className="flex items-baseline justify-between px-5 pb-2 pt-4">
                <h3 className="text-base font-medium">Historique des comptages</h3>
                <span className="text-sm text-[var(--m3-on-surface-variant)]">{sortedCounts.length}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                  <thead className="bg-[var(--m3-surface-container-high)] text-xs text-[var(--m3-on-surface-variant)]">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">Date</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Théorique</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Compté</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Écart</th>
                      <th scope="col" className="px-4 py-3 font-medium">Note</th>
                      <th scope="col" className="w-16 px-3 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCounts.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--m3-on-surface-variant)]">Aucun comptage enregistré.</td>
                      </tr>
                    )}
                    {sortedCounts.slice(0, 12).map((c) => (
                      <tr key={c.id} className="border-b border-[var(--m3-outline-variant)]/60 transition-colors last:border-b-0 hover:bg-[var(--m3-surface-container-high)] motion-reduce:transition-none">
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                          {c.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} · {fmtTime12(c.date)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtHTG(c.theorique)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtHTG(c.compte)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={'inline-block rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ' + ecartTone(c.ecart)}>
                            {c.ecart === 0 ? '0' : (c.ecart > 0 ? '+ ' : '− ') + fmtHTG(Math.abs(c.ecart))}
                          </span>
                        </td>
                        <td className="max-w-[160px] truncate px-4 py-3 text-[var(--m3-on-surface-variant)]">{c.note ?? '—'}</td>
                        <td className="px-3 py-3 text-right">
                          <button type="button" onClick={() => onDeleteCount(c.id)} aria-label="Supprimer" className={rowBtn}>
                            <M3StateLayer />
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right: count + breakdown */}
          <div className="space-y-4">
            <PettyCountPanel
              theorique={balance}
              onSave={(compte, note) => onAddCount({ date: new Date(), theorique: balance, compte, ecart: compte - balance, note })}
            />
            <section className="space-y-3 rounded-[28px] bg-[var(--m3-surface-container)] p-5">
              <h3 className="text-base font-medium">Dépenses par catégorie · {periodLabel}</h3>
              {m3Breakdown()}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

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
  const maxQte = Math.max(...meilleuresVentes.map(([, q]) => q), 1);
  const alertTone = produitsStockBas.length > 0 ? `${M3_STATUS.low.bg} ${M3_STATUS.low.fg}` : 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]';

  return (
    <div style={M3_VARS} className="min-h-0 flex-1 space-y-4 overflow-y-auto font-sans text-[var(--m3-on-surface)]">
      <div className="hidden md:block">
        <h2 className="text-[32px] font-bold leading-10 tracking-tight">Tableau de bord</h2>
        <p className="text-sm text-[var(--m3-on-surface-variant)]">Vue d&apos;ensemble de la journée</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <section className="col-span-2 flex items-center gap-4 rounded-[28px] bg-[var(--m3-primary-container)] p-5 text-[var(--m3-on-primary-container)] md:col-span-1">
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/40">
            <TrendingUp size={24} />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium opacity-80">Ventes du jour</div>
            <div className="break-words text-[28px] font-bold leading-9 tracking-tight tabular-nums">{fmtHTG(totalAujourdhui)}</div>
          </div>
        </section>
        <div className="min-w-0 rounded-[28px] bg-[var(--m3-surface-container)] p-5">
          <div className="flex items-center gap-1.5 text-sm text-[var(--m3-on-surface-variant)]">
            <Receipt size={14} /> Transactions
          </div>
          <div className="mt-1 truncate text-[28px] font-bold leading-9 tracking-tight tabular-nums">{nbVentesAujourdhui}</div>
        </div>
        <div className={'min-w-0 rounded-[28px] p-5 ' + alertTone}>
          <div className="flex items-center gap-1.5 text-sm opacity-80">
            <AlertTriangle size={14} /> Stock bas
          </div>
          <div className="mt-1 truncate text-[28px] font-bold leading-9 tracking-tight tabular-nums">{produitsStockBas.length}</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Low stock */}
        <section className="rounded-[28px] bg-[var(--m3-surface-container-low)] p-4 md:p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-medium">Alerte stock bas</h3>
            {produitsStockBas.length > 0 && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums ${M3_STATUS.low.bg} ${M3_STATUS.low.fg}`}>{produitsStockBas.length}</span>
            )}
          </div>
          {produitsStockBas.length === 0 ? (
            <div className="mt-3 flex items-center gap-3 rounded-[20px] bg-[var(--m3-primary-container)] px-4 py-3 text-sm text-[var(--m3-on-primary-container)]">
              <Check size={18} className="shrink-0" /> Tous les stocks sont à un niveau sain.
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-[var(--m3-outline-variant)]">
              {produitsStockBas.map((p) => {
                const out = p.stockFermeture <= 0;
                const tone = out ? M3_STATUS.out : M3_STATUS.low;
                return (
                  <li key={p.id} className="flex items-center gap-3 py-2.5">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone.bg} ${tone.fg}`}>
                      <AlertTriangle size={18} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.nom}</span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${tone.bg} ${tone.fg}`}>
                      {out ? 'Rupture' : `${p.stockFermeture} ${p.unite}${p.stockFermeture !== 1 ? 's' : ''}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Best sellers */}
        <section className="rounded-[28px] bg-[var(--m3-surface-container-low)] p-4 md:p-5">
          <h3 className="text-base font-medium">Articles les plus vendus</h3>
          {meilleuresVentes.length === 0 ? (
            <div className="mt-3 rounded-[20px] bg-[var(--m3-surface-container)] px-4 py-6 text-center text-sm text-[var(--m3-on-surface-variant)]">
              Aucune vente enregistrée pour l&apos;instant.
            </div>
          ) : (
            <ol className="mt-3 space-y-3.5">
              {meilleuresVentes.map(([nom, qte], i) => (
                <li key={nom}>
                  <div className="flex items-center gap-3">
                    <span
                      className={
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums ' +
                        (i === 0 ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]' : 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]')
                      }
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{nom}</span>
                    <span className="shrink-0 text-sm tabular-nums text-[var(--m3-on-surface-variant)]">
                      {qte} vendu{qte !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="ml-11 mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--m3-surface-container-highest)]">
                    <div
                      className={'h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ' + (i === 0 ? 'bg-[var(--m3-primary)]' : 'bg-[var(--m3-outline)]')}
                      style={{ width: `${(qte / maxQte) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
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
