import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import './App.css';
import {
  ShoppingCart, Boxes, History, Gauge, AlertTriangle,
  Plus, Minus, Trash2, X, Search, Printer, ChevronRight, Banknote,
  Smartphone, FileClock, PackagePlus, Pencil, Check, Menu, BarChart3,
  Users, Loader2, CalendarDays, Eye, Undo2, ChevronDown,
  Vault, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Coins, Download, Paperclip, FileText, Package, Receipt, ExternalLink, Copy
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
};

type PaymentMethodId = 'especes' | 'moncash' | 'natcash' | 'credit';

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
type ManagementView = 'rapports' | 'produits' | 'ventes' | 'credits' | 'coffre' | 'petitecaisse';

type View = 'vente' | 'dashboard' | ManagementView;

const MANAGEMENT_VIEWS: ManagementView[] = ['rapports', 'produits', 'ventes', 'credits', 'coffre', 'petitecaisse'];
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
          return { produitId: produit.id, nom: produit.nom, qte, prix: produit.prix, sousTotal: qte * produit.prix };
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
  const [menuOpen, setMenuOpen] = useState<boolean>(true);
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
  const [cart, setCart] = useState<CartItem[]>([]);
  const [categorie, setCategorie] = useState<string>('Tout');
  const [recherche, setRecherche] = useState<string>('');
  const [ventes, setVentes] = useState<SaleRecord[]>(() => buildMockSales());
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

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#ECE7DC] font-sans text-[#16181A]">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b-2 border-[#16181A] bg-[#FBFAF6] px-4 py-4 md:px-6">
        <div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-[#4B5560]">Espace vendeur</div>
          <h1 className="mt-1 font-serif text-2xl md:text-3xl">Gestion de Magasin</h1>
        </div>
        <button
          onClick={() => setSelectedBranchId(null)}
          className="border-2 border-[#16181A] bg-white px-3 py-2 text-[11px] uppercase tracking-[0.18em] hover:bg-[#ECE7DC]"
        >
          Changer de succursale
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 py-5 md:px-6">
        {/* Branch header + hamburger menu (same as admin board) */}
        <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3 border-2 border-[#16181A] bg-[#FBFAF6] p-3 shadow-[6px_6px_0_#16181A]">
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-[#16181A] bg-[#16181A] text-[#FBFAF6] hover:bg-[#2b2e31]"
            aria-label="Menu de la succursale"
          >
            <Menu size={18} />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-serif text-xl leading-tight">{brancheActuelle.nom}</span>
              <span
                className={
                  'border-2 px-2 py-0.5 text-[9px] uppercase tracking-wide ' +
                  (brancheActuelle.statut === 'Ouvert'
                    ? 'border-[#2F6B4F] bg-[#E9F5EF] text-[#2F6B4F]'
                    : 'border-[#4B5560] bg-[#F3F4F6] text-[#4B5560]')
                }
              >
                {brancheActuelle.statut}
              </span>
            </div>
            <div className="text-[12px] text-[#4B5560]">
              {brancheActuelle.ville} • {brancheActuelle.adresse} • Responsable: {brancheActuelle.gestionnaire}
            </div>
          </div>

          {isManagementView(view) ? (
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <button
                onClick={() => shiftSelectedDate(-1)}
                className="flex h-8 w-8 items-center justify-center border-2 border-[#16181A] bg-white text-sm hover:bg-[#ECE7DC]"
                aria-label="Jour précédent"
              >
                ‹
              </button>
              <DatePicker selectedDate={selectedDate} onSelect={setSelectedDate} salesDays={salesDays} />
              <button
                onClick={() => shiftSelectedDate(1)}
                disabled={isCurrentDateSelected}
                className={
                  'flex h-8 w-8 items-center justify-center border-2 border-[#16181A] text-sm ' +
                  (isCurrentDateSelected ? 'cursor-not-allowed bg-[#E5E7EB] text-[#6B7280]' : 'bg-white hover:bg-[#ECE7DC]')
                }
                aria-label="Jour suivant"
              >
                ›
              </button>
            </div>
          ) : (
            <div className="ml-auto flex shrink-0 items-center gap-2 border-2 border-[#16181A] bg-white px-3 py-1.5 text-[12px]">
              <CalendarDays size={14} />
              {new Date().toLocaleDateString('fr-HT', { day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 items-start gap-4">
          <nav
            className={
              'shrink-0 self-start border-2 border-[#16181A] bg-[#FBFAF6] p-2 transition-[width] duration-150 ' +
              (menuOpen ? 'w-56' : 'w-14')
            }
          >
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
              const actif = view === id;
              const isReports = id === 'rapports';
              return (
                <div
                  key={id}
                  className={'mb-1 last:mb-0 ' + (id === 'rapports' ? 'mt-2 border-t-2 border-[#16181A] pt-2' : '')}
                >
                  <button
                    onClick={() => {
                      if (isReports) setReportsOpen(actif ? !reportsOpen : true);
                      else setReportsOpen(false);
                      setView(id);
                    }}
                    title={menuOpen ? undefined : label}
                    aria-label={label}
                    aria-expanded={isReports ? reportsOpen && actif : undefined}
                    className={
                      'relative flex w-full items-center border-2 py-2.5 text-left text-[11px] uppercase tracking-[0.18em] ' +
                      (menuOpen ? 'gap-3 px-3' : 'justify-center px-0') +
                      ' ' +
                      (actif
                        ? 'border-[#C1440E] bg-[#C1440E] text-white'
                        : 'border-transparent text-[#16181A] hover:border-[#16181A] hover:bg-[#ECE7DC]')
                    }
                  >
                    <Icon size={15} className="shrink-0" />
                    {menuOpen && <span>{label}</span>}
                    {menuOpen && isReports && (
                      <ChevronDown
                        size={14}
                        className={'ml-auto shrink-0 transition-transform ' + (reportsOpen && actif ? 'rotate-180' : '')}
                      />
                    )}
                    {id === 'vente' && nbArticlesPanier > 0 && (
                      menuOpen ? (
                        <span className="ml-auto border-2 border-current px-1.5 text-[10px]">{nbArticlesPanier}</span>
                      ) : (
                        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center bg-[#16181A] px-1 text-[9px] text-white">
                          {nbArticlesPanier}
                        </span>
                      )
                    )}
                  </button>

                  {isReports && actif && reportsOpen && (
                    <div className={'mt-1 border-l-2 border-[#C1440E] ' + (menuOpen ? 'ml-4 pl-1' : 'ml-0 pl-0')}>
                      {REPORT_TABS.map((tab) => {
                        const subActive = reportPeriod === tab.id;
                        return (
                          <button
                            key={tab.id}
                            onClick={() => setReportPeriod(tab.id)}
                            title={menuOpen ? undefined : tab.label}
                            aria-label={tab.label}
                            className={
                              'mb-0.5 flex w-full items-center border-2 py-2 text-left text-[10px] uppercase tracking-[0.14em] last:mb-0 ' +
                              (menuOpen ? 'px-3' : 'justify-center px-0') +
                              ' ' +
                              (subActive
                                ? 'border-[#16181A] bg-[#16181A] text-white'
                                : 'border-transparent text-[#16181A] hover:border-[#16181A] hover:bg-[#ECE7DC]')
                            }
                          >
                            {menuOpen ? tab.label : tab.short}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {produitsStockBas.length > 0 && (
              <div
                title={menuOpen ? undefined : `${produitsStockBas.length} article(s) en stock bas`}
                className={
                  'mt-2 flex items-center border-t-2 border-[#16181A] pt-2 text-[#C1440E] ' +
                  (menuOpen ? 'gap-2 px-2' : 'justify-center')
                }
              >
                <AlertTriangle size={15} className="shrink-0" />
                <span className="text-[11px]">
                  {menuOpen
                    ? `${produitsStockBas.length} article${produitsStockBas.length > 1 ? 's' : ''} en stock bas`
                    : produitsStockBas.length}
                </span>
              </div>
            )}
          </nav>

          {isManagementView(view) ? (
            <main className="min-h-0 min-w-0 flex-1 self-stretch overflow-y-auto pb-2 pr-2">
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
          <main className="flex min-h-0 min-w-0 flex-1 flex-col self-stretch overflow-hidden border-2 border-[#16181A] bg-[#FBFAF6] shadow-[6px_6px_0_#16181A]">
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
    <div className="receipt-print fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4">
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

type OwnerSection = 'dashboard' | 'products' | 'sales' | 'credits' | 'coffre' | 'petitecaisse' | 'reports' | 'users';

const OWNER_SECTIONS: Array<{ id: OwnerSection; label: string; icon: typeof Gauge }> = [
  { id: 'dashboard', label: 'Tableau de Bord', icon: Gauge },
  { id: 'products', label: 'Produits', icon: Boxes },
  { id: 'sales', label: 'Ventes', icon: ShoppingCart },
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
}: {
  selectedDate: Date;
  onSelect: (date: Date) => void;
  salesDays: Set<string>;
  block?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  );
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={containerRef} className={block ? 'relative min-w-0 flex-1 md:flex-none' : 'relative'}>
      <button
        type="button"
        onClick={toggleOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={selectedDate.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        className={
          'flex items-center gap-1.5 border-2 border-[#16181A] px-2 text-[11px] uppercase tracking-wide whitespace-nowrap transition-colors ' +
          (block ? 'h-10 w-full justify-center md:h-8 md:w-auto md:justify-start ' : 'h-8 ') +
          (open ? 'bg-[#E3DCCC]' : 'bg-[#ECE7DC] hover:bg-[#E3DCCC]')
        }
      >
        <CalendarDays size={13} />
        {selectedDate.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choisir une date"
          className={
            'absolute top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] border-2 border-[#16181A] bg-[#FBFAF6] p-3 shadow-[6px_6px_0_#2F6B4F] ' +
            (block ? 'left-1/2 -translate-x-1/2 md:left-auto md:right-0 md:translate-x-0' : 'right-0')
          }
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth(new Date(year, month - 1, 1))}
              className="flex h-8 w-8 items-center justify-center border-2 border-[#16181A] bg-white text-sm hover:bg-[#ECE7DC]"
              aria-label="Mois précédent"
            >
              ‹
            </button>
            <div className="font-serif text-base capitalize">
              {viewMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
            </div>
            <button
              type="button"
              onClick={() => setViewMonth(new Date(year, month + 1, 1))}
              disabled={!canGoNextMonth}
              className={
                'flex h-8 w-8 items-center justify-center border-2 border-[#16181A] text-sm ' +
                (canGoNextMonth ? 'bg-white hover:bg-[#ECE7DC]' : 'cursor-not-allowed bg-[#E5E7EB] text-[#6B7280]')
              }
              aria-label="Mois suivant"
            >
              ›
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-medium uppercase tracking-wide text-[#4B5560]">
            {WEEKDAY_INITIALS_FR.map((label, index) => (
              <div key={index} className="py-1">{label}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((date, index) => {
              if (!date) return <div key={`blank-${index}`} />;
              const isFuture = date > today;
              const isSelected = isSameDay(date, selectedDate);
              const isToday = isSameDay(date, today);
              const hasSales = salesDays.has(dayKey(date));
              return (
                <button
                  key={dayKey(date)}
                  type="button"
                  disabled={isFuture}
                  onClick={() => pickDate(date)}
                  aria-label={date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  aria-pressed={isSelected}
                  className={
                    'relative flex h-9 items-center justify-center border-2 text-[12px] tabular-nums transition-colors ' +
                    (isFuture
                      ? 'cursor-not-allowed border-transparent text-[#B8BDC3]'
                      : isSelected
                      ? 'border-[#C1440E] bg-[#C1440E] font-medium text-white'
                      : isToday
                      ? 'border-[#16181A] bg-white font-medium hover:bg-[#ECE7DC]'
                      : 'border-transparent hover:border-[#16181A] hover:bg-[#ECE7DC]')
                  }
                >
                  {date.getDate()}
                  {hasSales && (
                    <span
                      className={
                        'absolute bottom-1 h-1.5 w-1.5 rounded-full ' +
                        (isSelected ? 'bg-white' : isFuture ? 'bg-[#B8BDC3]' : 'bg-[#2F6B4F]')
                      }
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t-2 border-[#e4ded0] pt-2 text-[10px] uppercase tracking-wide text-[#4B5560]">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2F6B4F]" />
              Jour avec ventes
            </span>
            <button
              type="button"
              onClick={() => pickDate(new Date())}
              className="border-2 border-[#16181A] bg-white px-2 py-1 text-[#16181A] hover:bg-[#ECE7DC]"
            >
              Aujourd'hui
            </button>
          </div>
        </div>
      )}
    </div>
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
  products: Product[];
  selectedBranchId: string | null;
  branchInventoryIds: Record<string, string[]>;
  setBranchInventoryIds: Dispatch<SetStateAction<Record<string, string[]>>>;
}) {
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('daily');
  const [reportsOpen, setReportsOpen] = useState<boolean>(false);
  const [activeBranchId, setActiveBranchId] = useState<string>(selectedBranchId ?? branches[0]?.id ?? '');
  const [menuOpen, setMenuOpen] = useState<boolean>(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 768px)').matches
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
  const salesOfSelectedDate = branchVentesAll.filter((v) => isSameDay(v.date, selectedDate));
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

  const handleAddProduct = () => {
    const branchName = activeBranch?.nom ?? 'Succursale';
    const createdId = `p${Date.now()}`;
    const newProduct: Product = {
      id: createdId,
      nom: `${branchName} - Nouveau produit`,
      categorie: 'Autre',
      prix: 0,
      prixAchat: 0,
      stockOuverture: 0,
      stockFermeture: 0,
      seuil: 5,
      unite: 'unité',
    };

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

  return (
    <div className="min-h-screen w-full bg-[#ECE7DC] text-[#16181A]">
      <div className="hidden flex-wrap items-center justify-between gap-3 border-b-2 border-[#16181A] bg-[#FBFAF6] px-4 py-4 md:flex md:px-6">
        <div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-[#4B5560]">Panneau propriétaire</div>
          <h1 className="mt-1 font-serif text-2xl md:text-3xl">Administration centrale</h1>
        </div>
        <button
          onClick={onBackToBranches}
          className="border-2 border-[#16181A] bg-white px-3 py-2 text-[11px] uppercase tracking-[0.18em] hover:bg-[#ECE7DC]"
        >
          Retour
        </button>
      </div>

      {/* Sucursales — dropdown on phones */}
      <div className="border-b-2 border-[#16181A] bg-[#16181A] px-3 py-3 md:hidden">
        <label className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-[#c7ccd1]" htmlFor="owner-branch-select">
          Succursale
        </label>
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="flex w-11 shrink-0 items-center justify-center border-2 border-[#ECE7DC] text-[#ECE7DC] hover:bg-[#1f2225]"
            aria-label="Menu de la succursale"
            aria-expanded={menuOpen}
          >
            <Menu size={18} />
          </button>
          <div className="relative min-w-0 flex-1">
          <select
            id="owner-branch-select"
            value={activeBranchId}
            onChange={(event) => selectBranchTab(event.target.value)}
            className="w-full appearance-none border-2 border-[#ECE7DC] bg-[#ECE7DC] py-2.5 pl-3 pr-10 text-[13px] font-medium uppercase tracking-wide text-[#16181A] outline-none focus:border-[#C1440E]"
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.nom.replace('Tchiley Construction', '').trim() || branch.nom}
              </option>
            ))}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#16181A]" />
          </div>
        </div>
      </div>

      {/* Sucursales — top-level tab bar (desktop) */}
      <div className="hidden gap-1 overflow-x-auto border-b-2 border-[#16181A] bg-[#16181A] px-3 pt-2 md:flex">
        {branches.map((branch) => {
          const actif = branch.id === activeBranchId;
          return (
            <button
              key={branch.id}
              onClick={() => selectBranchTab(branch.id)}
              className={
                '-mb-[2px] shrink-0 whitespace-nowrap border-2 border-b-0 px-4 py-2.5 text-[12px] uppercase tracking-wide ' +
                (actif
                  ? 'border-[#16181A] bg-[#ECE7DC] text-[#16181A]'
                  : 'border-transparent text-[#c7ccd1] hover:bg-[#1f2225]')
              }
            >
              {branch.nom.replace('Tchiley Construction', '').trim() || branch.nom}
            </button>
          );
        })}
      </div>

      <div className="px-4 py-5 md:px-6">
        {/* Active branch panel header + hamburger menu */}
        <div className="mb-4 flex flex-wrap items-center gap-3 border-2 border-[#16181A] bg-[#FBFAF6] p-3 shadow-[3px_3px_0_#16181A] md:shadow-[6px_6px_0_#16181A]">
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            className="hidden h-10 w-10 shrink-0 items-center justify-center border-2 border-[#16181A] bg-[#16181A] text-[#FBFAF6] hover:bg-[#2b2e31] md:flex"
            aria-label="Menu de la succursale"
          >
            <Menu size={18} />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-serif text-lg leading-tight sm:text-xl">{activeBranch.nom}</span>
              <span
                className={
                  'border-2 px-2 py-0.5 text-[9px] uppercase tracking-wide ' +
                  (activeBranch.statut === 'Ouvert'
                    ? 'border-[#2F6B4F] bg-[#E9F5EF] text-[#2F6B4F]'
                    : 'border-[#4B5560] bg-[#F3F4F6] text-[#4B5560]')
                }
              >
                {activeBranch.statut}
              </span>
            </div>
            <div className="mt-0.5 break-words text-[12px] leading-snug text-[#4B5560]">
              <span>{activeBranch.ville} • {activeBranch.adresse}</span>
              <span className="block md:inline">
                <span className="hidden md:inline"> • </span>Responsable: {activeBranch.gestionnaire}
              </span>
            </div>
          </div>

          <div className="flex w-full items-center gap-1 border-t-2 border-dashed border-[#d3cbb6] pt-3 md:ml-auto md:w-auto md:shrink-0 md:border-t-0 md:pt-0">
            <button
              onClick={() => shiftSelectedDate(-1)}
              className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-[#16181A] bg-white text-lg hover:bg-[#ECE7DC] md:h-8 md:w-8 md:text-sm"
              aria-label="Jour précédent"
            >
              ‹
            </button>
            <DatePicker selectedDate={selectedDate} onSelect={setSelectedDate} salesDays={salesDays} block />
            <button
              onClick={() => shiftSelectedDate(1)}
              disabled={isCurrentDateSelected}
              className={
                'flex h-10 w-10 shrink-0 items-center justify-center border-2 border-[#16181A] text-lg md:h-8 md:w-8 md:text-sm ' +
                (isCurrentDateSelected ? 'cursor-not-allowed bg-[#E5E7EB] text-[#6B7280]' : 'bg-white hover:bg-[#ECE7DC]')
              }
              aria-label="Jour suivant"
            >
              ›
            </button>
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-start md:gap-4">
          {menuOpen && (
            <div
              className="fixed inset-0 z-[65] bg-black/55 md:hidden"
              onClick={() => setMenuOpen(false)}
              aria-hidden="true"
            />
          )}
          <nav
            aria-label="Sections de la succursale"
            className={
              'border-2 border-[#16181A] bg-[#FBFAF6] p-2 ' +
              'fixed inset-y-0 left-0 z-[70] w-72 max-w-[85vw] overflow-y-auto shadow-[6px_0_0_#16181A] transition-transform duration-200 ' +
              (menuOpen ? 'translate-x-0 ' : '-translate-x-full ') +
              'md:static md:z-auto md:max-w-none md:translate-x-0 md:overflow-visible md:shadow-none md:shrink-0 md:transition-[width] md:duration-150 ' +
              (menuOpen ? 'md:w-56' : 'md:w-14')
            }
          >
            <div className="mb-2 flex items-center justify-between border-b-2 border-[#16181A] pb-2 md:hidden">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.24em] text-[#4B5560]">Menu</div>
                <div className="truncate font-serif text-base leading-tight">{activeBranch.nom}</div>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-[#16181A] bg-white hover:bg-[#ECE7DC]"
                aria-label="Fermer le menu"
              >
                <X size={16} />
              </button>
            </div>
            {OWNER_SECTIONS.map(({ id, label, icon: Icon }) => {
              const active = activeSection === id;
              const isReports = id === 'reports';
              return (
                <div key={id} className="mb-1 last:mb-0">
                  <button
                    onClick={() => {
                      if (isReports) {
                        if (active) setReportsOpen((prev) => !prev);
                        else setReportsOpen(true);
                      } else {
                        setReportsOpen(false);
                        closeMenuOnMobile();
                      }
                      selectSection(id);
                    }}
                    title={menuOpen ? undefined : label}
                    aria-label={label}
                    aria-expanded={isReports ? reportsOpen && active : undefined}
                    className={
                      'flex w-full items-center text-left text-[11px] uppercase tracking-[0.18em] border-2 py-2.5 ' +
                      (menuOpen ? 'gap-3 px-3' : 'gap-3 px-3 md:justify-center md:gap-0 md:px-0') +
                      ' ' +
                      (active
                        ? 'border-[#C1440E] bg-[#C1440E] text-white'
                        : 'border-transparent text-[#16181A] hover:border-[#16181A] hover:bg-[#ECE7DC]')
                    }
                  >
                    <Icon size={15} className="shrink-0" />
                    <span className={menuOpen ? '' : 'md:hidden'}>{label}</span>
                    {isReports && (
                      <ChevronDown
                        size={14}
                        className={'ml-auto shrink-0 transition-transform ' + (menuOpen ? '' : 'md:hidden ') + (reportsOpen && active ? 'rotate-180' : '')}
                      />
                    )}
                  </button>

                  {isReports && active && reportsOpen && (
                    <div className={'mt-1 border-l-2 border-[#C1440E] ' + 'ml-4 pl-1 ' + (menuOpen ? '' : 'md:ml-0 md:pl-0')}>
                      {REPORT_TABS.map((tab) => {
                        const subActive = reportPeriod === tab.id;
                        return (
                          <button
                            key={tab.id}
                            onClick={() => {
                              setReportPeriod(tab.id);
                              closeMenuOnMobile();
                            }}
                            title={menuOpen ? undefined : tab.label}
                            aria-label={tab.label}
                            className={
                              'mb-0.5 flex w-full items-center border-2 py-2 text-left text-[10px] uppercase tracking-[0.14em] last:mb-0 ' +
                              (menuOpen ? 'px-3' : 'px-3 md:justify-center md:px-0') +
                              ' ' +
                              (subActive
                                ? 'border-[#16181A] bg-[#16181A] text-white'
                                : 'border-transparent text-[#16181A] hover:border-[#16181A] hover:bg-[#ECE7DC]')
                            }
                          >
                            <span className={menuOpen ? '' : 'md:hidden'}>{tab.label}</span>
                            {!menuOpen && <span className="hidden md:inline">{tab.short}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

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
                onAddProduct={handleAddProduct}
                onUpdateProduct={updateProduct}
                onRestockProduct={handleRestockProduct}
                onDeleteProduct={handleDeleteProduct}
                onViewHistory={handleViewHistory}
              />
            )}

            {activeSection === 'sales' && (
              <BranchSalesSection sales={salesOfSelectedDate} selectedDate={selectedDate} onCancelSale={handleCancelSale} />
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
  const salesOfSelectedDate = branchVentesAll.filter((v) => isSameDay(v.date, selectedDate));
  const selectedHistoryProduct = branchProducts.find((p) => p.id === historyProductId) ?? null;

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

  const handleAddProduct = () => {
    const createdId = `p${Date.now()}`;
    const newProduct: Product = {
      id: createdId,
      nom: `${branch.nom} - Nouveau produit`,
      categorie: 'Autre',
      prix: 0,
      prixAchat: 0,
      stockOuverture: 0,
      stockFermeture: 0,
      seuil: 5,
      unite: 'unité',
    };
    setProducts((prev) => [newProduct, ...prev]);
    setBranchInventoryIds((prev) => ({ ...prev, [branchId]: [createdId, ...(prev[branchId] ?? [])] }));
  };

  const handleRestockProduct = (product: Product) => {
    const qty = restockByProduct[product.id] ?? 0;
    if (qty <= 0) return;
    updateProduct(product.id, { stockFermeture: product.stockFermeture + qty });
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
          onAddProduct={handleAddProduct}
          onUpdateProduct={updateProduct}
          onRestockProduct={handleRestockProduct}
          onDeleteProduct={handleDeleteProduct}
          onViewHistory={(product) => setHistoryProductId((prev) => (prev === product.id ? null : product.id))}
        />
      )}

      {view === 'ventes' && (
        <BranchSalesSection sales={salesOfSelectedDate} selectedDate={selectedDate} onCancelSale={handleCancelSale} />
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
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="border-2 border-[#16181A] bg-white p-3 shadow-[3px_3px_0_#16181A] sm:p-4 sm:shadow-[6px_6px_0_#16181A]">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#4B5560]">Ventes du jour</div>
          <div className="mt-2 break-words font-serif text-2xl sm:text-3xl">{salesToday.length}</div>
        </div>
        <div className="border-2 border-[#16181A] bg-white p-3 shadow-[3px_3px_0_#C1440E] sm:p-4 sm:shadow-[6px_6px_0_#C1440E]">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#4B5560]">Revenu total</div>
          <div className="mt-2 break-words font-serif text-2xl sm:text-3xl">{fmtHTG(totalRevenue)}</div>
        </div>
        <div className="border-2 border-[#16181A] bg-white p-3 shadow-[3px_3px_0_#2F6B4F] sm:p-4 sm:shadow-[6px_6px_0_#2F6B4F]">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#4B5560]">Articles en stock bas</div>
          <div className="mt-2 break-words font-serif text-2xl sm:text-3xl text-[#C1440E]">{stockAlertCount}</div>
        </div>
      </div>

      <div className="border-2 border-[#16181A] bg-[#FBFAF6] p-4">
        <div className="text-[11px] uppercase tracking-[0.2em] text-[#4B5560]">Détails</div>
        <div className="mt-1 text-[13px] text-[#4B5560]">
          {branch.ville} • {branch.adresse} • {branchProducts.length} article{branchProducts.length !== 1 ? 's' : ''} en inventaire
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="border-2 border-[#16181A] bg-[#FBFAF6] p-3 shadow-[4px_4px_0_#C1440E] sm:p-5 sm:shadow-[8px_8px_0_#C1440E]">
          <h3 className="mb-3 font-serif text-2xl">Alertes Stock Bas</h3>
          {lowStockProducts.length === 0 ? (
            <div className="text-[13px] text-[#4B5560]">Tous les stocks sont à un niveau sain.</div>
          ) : (
            <div className="space-y-2">
              {lowStockProducts.map((product) => (
                <div key={product.id} className="flex items-center justify-between border-b border-[#d9d2c5] pb-2 text-[12px]">
                  <span>{product.nom}</span>
                  <span className="font-bold text-[#C1440E]">{product.stockFermeture} en stock</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-2 border-[#16181A] bg-[#FBFAF6] p-3 shadow-[4px_4px_0_#2F6B4F] sm:p-5 sm:shadow-[8px_8px_0_#2F6B4F]">
          <h3 className="mb-3 font-serif text-2xl">Ventes récentes</h3>
          {recentSales.length === 0 ? (
            <div className="text-[13px] text-[#4B5560]">Aucune vente enregistrée pour l'instant.</div>
          ) : (
            <div className="space-y-2">
              {recentSales.map((sale) => (
                <div key={sale.id} className="border-b border-[#d9d2c5] pb-2 text-[12px]">
                  <div className="flex justify-between gap-3">
                    <span className="font-medium">{sale.id}</span>
                    <span>{fmtHTG(sale.total)}</span>
                  </div>
                  <div className="mt-1 text-[#4B5560]">{sale.date.toLocaleDateString('fr-HT')}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type ProductFieldTone = 'green' | 'ink' | 'steel' | 'yellow';

const PRODUCT_FIELD_TONES: Record<ProductFieldTone, { text: string; edit: string }> = {
  green: { text: 'text-[#2F6B4F]', edit: 'border-[#2F6B4F] bg-[#E9F5EF]' },
  steel: { text: 'text-[#4B5560]', edit: 'border-[#4B5560] bg-[#F3F4F6]' },
  ink: { text: 'text-[#16181A]', edit: 'border-[#16181A] bg-[#F3F4F6]' },
  yellow: { text: 'text-[#8a6d00]', edit: 'border-[#F2B705] bg-[#FDF6DC]' },
};

/* Large, thumb-friendly numeric field used by the phone card layout of the Products tab.
   16px text avoids the iOS zoom-on-focus; read-only until the card is in edit mode. */
function ProductNumberField({
  label,
  value,
  onChange,
  editing,
  tone = 'ink',
  placeholder,
  decimal = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  editing: boolean;
  tone?: ProductFieldTone;
  placeholder?: string;
  decimal?: boolean;
}) {
  const t = PRODUCT_FIELD_TONES[tone];
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-[#4B5560]">{label}</span>
      <input
        type="number"
        min="0"
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={value}
        placeholder={placeholder}
        readOnly={!editing}
        tabIndex={editing ? 0 : -1}
        onFocus={(event) => event.target.select()}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className={`h-11 w-full border-2 px-3 text-right text-base font-medium tabular-nums outline-none transition-colors ${t.text} ${
          editing ? t.edit : 'border-transparent bg-[#F3EFE3]'
        }`}
      />
    </label>
  );
}

function BranchProductsSection({
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
  onAddProduct,
  onUpdateProduct,
  onRestockProduct,
  onDeleteProduct,
  onViewHistory,
}: {
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
  onAddProduct: () => void;
  onUpdateProduct: (productId: string, patch: Partial<Product>) => void;
  onRestockProduct: (product: Product) => void;
  onDeleteProduct: (product: Product) => void;
  onViewHistory: (product: Product) => void;
}) {
  const filteredProducts = branchProducts.filter((product) => {
    const matchesCategory = inventoryCategoryFilter === 'Tout' || product.categorie === inventoryCategoryFilter;
    const matchesStatus =
      inventoryStatusFilter === 'all' ||
      (inventoryStatusFilter === 'low' && product.stockFermeture <= product.seuil) ||
      (inventoryStatusFilter === 'normal' && product.stockFermeture > product.seuil);
    const matchesSearch =
      product.nom.toLowerCase().includes(inventorySearch.toLowerCase()) ||
      product.categorie.toLowerCase().includes(inventorySearch.toLowerCase());
    return matchesCategory && matchesStatus && matchesSearch;
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

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

  return (
    <div className="border-2 border-[#16181A] bg-[#FBFAF6] p-3 shadow-[4px_4px_0_#2F6B4F] sm:p-5 sm:shadow-[8px_8px_0_#2F6B4F]">
      <div className="mb-3 flex items-center justify-between sm:mb-5">
        <h2 className="font-serif text-xl sm:text-2xl">Produits</h2>
        <span className="border-2 border-[#16181A] bg-[#ECE7DC] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.2em]">
          {branchProducts.length} produits
        </span>
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:mb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <div className="flex w-full min-w-0 items-center gap-2 border-2 border-[#16181A] bg-white px-3 py-2.5 transition-shadow sm:min-w-[220px] sm:flex-1 sm:py-2 focus-within:shadow-[4px_4px_0_#C1440E]">
          <Search className="h-4 w-4 shrink-0 text-[#4B5560]" />
          <input
            type="text"
            value={inventorySearch}
            onChange={(event) => setInventorySearch(event.target.value)}
            placeholder="Rechercher un produit..."
            className="w-full min-w-0 border-none bg-transparent text-base text-[#16181A] outline-none placeholder:text-[#4B5560] sm:text-sm"
          />
          <select
            value={inventoryCategoryFilter}
            onChange={(event) => setInventoryCategoryFilter(event.target.value)}
            className="hidden shrink-0 border-2 sm:block border-[#16181A] bg-[#F3F4F6] px-2 py-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-[#16181A] outline-none"
            aria-label="Filtrer par catégorie"
          >
            {['Tout', ...CATEGORIES.filter((category) => category !== 'Tout')].map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 sm:contents">
            <select
              value={inventoryCategoryFilter}
              onChange={(event) => setInventoryCategoryFilter(event.target.value)}
              className="h-11 min-w-0 flex-1 border-2 border-[#16181A] bg-white px-3 text-base uppercase tracking-wide text-[#16181A] outline-none sm:hidden"
              aria-label="Filtrer par catégorie"
            >
              {['Tout', ...CATEGORIES.filter((category) => category !== 'Tout')].map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
        <button
          onClick={onAddProduct}
          className="flex h-11 shrink-0 items-center justify-center gap-2 border-2 border-[#16181A] bg-[#16181A] px-4 sm:h-auto sm:px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-white transition-colors hover:bg-[#2b2e31]"
        >
          <Plus size={14} />
          Nouveau
        </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2 sm:mb-5 sm:flex sm:flex-wrap">
        {[
          { id: 'all', label: 'Tous' },
          { id: 'low', label: 'En stock bas' },
          { id: 'normal', label: 'Normal' },
        ].map((status) => (
          <button
            key={status.id}
            onClick={() => setInventoryStatusFilter(status.id as 'all' | 'low' | 'normal')}
            className={
              'border-2 px-1 py-2.5 text-center text-[10px] font-medium uppercase tracking-[0.1em] transition-colors sm:px-2.5 sm:py-1.5 sm:tracking-[0.16em] ' +
              (inventoryStatusFilter === status.id
                ? 'border-[#C1440E] bg-[#C1440E] text-white'
                : 'border-[#16181A] bg-white text-[#16181A] hover:bg-[#ECE7DC]')
            }
          >
            {status.label}
          </button>
        ))}
      </div>

      {selectedHistoryProduct && (
        <div className="mb-4 hidden border-2 border-[#16181A] bg-[#F0F8FF] p-3 sm:block">
          <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[#4B5560]">Historique produit</div>
          <div className="flex flex-wrap items-center gap-3 text-[12px] text-[#16181A]">
            <span className="font-serif text-lg">{selectedHistoryProduct.nom}</span>
            <span className="border-2 border-[#16181A] bg-white px-2 py-1">Vendu: {soldByProductToday[selectedHistoryProduct.id] ?? 0}</span>
            <span className="border-2 border-[#16181A] bg-white px-2 py-1">Stock Ouverture: {selectedHistoryProduct.stockOuverture}</span>
            <span className="border-2 border-[#16181A] bg-white px-2 py-1">Stock Fermeture: {selectedHistoryProduct.stockFermeture}</span>
            <span className="border-2 border-[#16181A] bg-white px-2 py-1" title="Niveau de stock en dessous duquel une alerte apparaît">Seuil Alerte: {selectedHistoryProduct.seuil}</span>
          </div>
        </div>
      )}

      <div className="sm:overflow-hidden sm:border-2 sm:border-[#16181A] sm:bg-white">
        <div className="hidden max-h-[65vh] overflow-auto sm:block">
          <table className="w-full min-w-[900px] border-collapse text-left" role="grid">
            <thead className="sticky top-0 z-10 bg-gradient-to-b from-[#ECE7DC] to-[#E3DCCC] text-[10.5px] font-medium uppercase tracking-[0.16em] text-[#4B5560] shadow-[0_2px_0_#16181A]">
              <tr className="divide-x divide-[#d3cbb6]">
                <th className="px-3 py-3 text-center" title="Produit et catégorie">Produit</th>
                <th className="px-3 py-3 text-center" title="Catégorie du produit">Catégorie</th>
                <th className="px-3 py-3 text-center" title="Unités vendues à la date sélectionnée uniquement">Vendu Auj.</th>
                <th className="px-3 py-3 text-center" title="Prix de vente au client">Prix Vente</th>
                <th className="px-3 py-3 text-center" title="Prix d'achat / coût pour la succursale">Prix Achat</th>
                <th className="px-3 py-3 text-center" title="Stock d'ouverture">Stock Ouverture</th>
                <th className="px-3 py-3 text-center" title="Stock de fermeture">Stock Fermeture</th>
                <th className="px-3 py-3 text-center" title="Niveau de stock en dessous duquel une alerte apparaît">Seuil Alerte</th>
                <th className="px-3 py-3 text-center" title="Quantité à ajouter au stock existant">Ajout Stock</th>
                <th className="px-3 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const soldToday = soldByProductToday[product.id] ?? 0;
                const restockValue = restockByProduct[product.id] ?? 0;
                const isLowStock = product.stockFermeture <= product.seuil;
                const isOutOfStock = product.stockFermeture <= 0;
                return (
                  <tr
                    key={product.id}
                    className={
                      'divide-x divide-[#e4ded0] border-b border-[#e4ded0] align-middle text-[13px] transition-all duration-150 ' +
                      (isOutOfStock ? 'bg-[#FDF1EC] opacity-75' : 'odd:bg-white even:bg-[#FBFAF6] hover:bg-[#F3EFE3]')
                    }
                    style={{ opacity: isOutOfStock ? 0.7 : 1 }}
                  >
                    <td className="px-3 py-2.5 font-medium">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{
                            backgroundColor: isOutOfStock ? '#C1440E' : isLowStock ? '#F2B705' : '#2F6B4F'
                          }}
                          title={isOutOfStock ? 'Rupture de stock' : isLowStock ? 'Stock bas' : 'En stock'}
                        />
                        <input
                          value={product.nom}
                          onChange={(event) => onUpdateProduct(product.id, { nom: event.target.value })}
                          disabled={!isEditing(product.id)}
                          className={`h-9 w-full px-2 outline-none transition-all duration-150 ${
                            isEditing(product.id)
                              ? 'border-2 border-[#C1440E] bg-white focus:border-[#C1440E] focus:bg-white focus:shadow-[0_0_0_2px_rgba(193,68,14,0.15)]'
                              : 'border-2 border-transparent bg-transparent'
                          }`}
                          placeholder="Nom du produit"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        value={product.categorie}
                        onChange={(event) => onUpdateProduct(product.id, { categorie: event.target.value })}
                        disabled={!isEditing(product.id)}
                        className={`h-9 w-full px-2 outline-none transition-all duration-150 ${
                          isEditing(product.id)
                            ? 'border-2 border-[#C1440E] bg-white text-[#16181A] focus:border-[#C1440E] focus:bg-white focus:shadow-[0_0_0_2px_rgba(193,68,14,0.15)]'
                            : 'border-2 border-transparent bg-transparent text-[#4B5560]'
                        }`}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="inline-flex h-9 min-w-[3rem] items-center justify-center border-2 border-transparent bg-transparent px-2 tabular-nums text-[#4B5560] font-medium">{soldToday}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="number"
                        min="0"
                        value={product.prix}
                        onChange={(event) => onUpdateProduct(product.id, { prix: Number(event.target.value) || 0 })}
                        disabled={!isEditing(product.id)}
                        className={`h-9 w-24 px-2 text-center font-medium tabular-nums text-[#2F6B4F] outline-none transition-all duration-150 ${
                          isEditing(product.id)
                            ? 'border-2 border-[#2F6B4F] bg-[#E9F5EF] focus:border-[#2F6B4F] focus:bg-[#E9F5EF] focus:shadow-[0_0_0_2px_rgba(47,107,79,0.15)]'
                            : 'border-2 border-transparent bg-transparent'
                        }`}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="number"
                        min="0"
                        value={product.prixAchat}
                        onChange={(event) => onUpdateProduct(product.id, { prixAchat: Number(event.target.value) || 0 })}
                        disabled={!isEditing(product.id)}
                        className={`h-9 w-24 px-2 text-center font-medium tabular-nums text-[#4B5560] outline-none transition-all duration-150 ${
                          isEditing(product.id)
                            ? 'border-2 border-[#4B5560] bg-[#F3F4F6] focus:border-[#4B5560] focus:bg-[#F3F4F6] focus:shadow-[0_0_0_2px_rgba(75,85,96,0.15)]'
                            : 'border-2 border-transparent bg-transparent'
                        }`}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="number"
                        min="0"
                        value={product.stockOuverture}
                        onChange={(event) => onUpdateProduct(product.id, { stockOuverture: Number(event.target.value) || 0 })}
                        disabled={!isEditing(product.id)}
                        className={`mx-auto h-9 w-20 px-2 text-center font-medium tabular-nums text-[#16181A] outline-none transition-all duration-150 ${
                          isEditing(product.id)
                            ? 'border-2 border-[#16181A] bg-[#F3F4F6] focus:border-[#16181A] focus:bg-[#F3F4F6] focus:shadow-[0_0_0_2px_rgba(22,24,26,0.15)]'
                            : 'border-2 border-transparent bg-transparent'
                        }`}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="number"
                        min="0"
                        value={product.stockFermeture}
                        onChange={(event) => onUpdateProduct(product.id, { stockFermeture: Number(event.target.value) || 0 })}
                        disabled={!isEditing(product.id)}
                        className={`mx-auto h-9 w-20 px-2 text-center font-medium tabular-nums text-[#16181A] outline-none transition-all duration-150 ${
                          isEditing(product.id)
                            ? 'border-2 border-[#16181A] bg-[#F3F4F6] focus:border-[#16181A] focus:bg-[#F3F4F6] focus:shadow-[0_0_0_2px_rgba(22,24,26,0.15)]'
                            : 'border-2 border-transparent bg-transparent'
                        }`}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="number"
                        min="0"
                        value={product.seuil}
                        onChange={(event) => onUpdateProduct(product.id, { seuil: Number(event.target.value) || 0 })}
                        disabled={!isEditing(product.id)}
                        className={`h-9 w-20 px-2 text-center font-medium tabular-nums text-[#8a6d00] outline-none transition-all duration-150 ${
                          isEditing(product.id)
                            ? 'border-2 border-[#F2B705] bg-[#FDF6DC] focus:border-[#F2B705] focus:bg-[#FDF6DC] focus:shadow-[0_0_0_2px_rgba(242,183,5,0.15)]'
                            : 'border-2 border-transparent bg-transparent'
                        }`}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="number"
                        min="0"
                        value={restockValue}
                        title="Quantité à ajouter au stock actuel (appliquée à l'enregistrement)"
                        onChange={(event) =>
                          setRestockByProduct((prev) => ({ ...prev, [product.id]: Number(event.target.value) || 0 }))
                        }
                        disabled={!isEditing(product.id)}
                        className={`mx-auto h-9 w-20 px-2 text-center font-medium tabular-nums text-[#2F6B4F] outline-none transition-all duration-150 ${
                          isEditing(product.id)
                            ? 'border-2 border-[#2F6B4F] bg-[#E9F5EF] focus:border-[#2F6B4F] focus:bg-[#E9F5EF] focus:shadow-[0_0_0_2px_rgba(47,107,79,0.15)]'
                            : 'border-2 border-transparent bg-transparent'
                        }`}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onViewHistory(product)}
                          disabled={isEditing(product.id)}
                          className={`flex h-9 w-9 items-center justify-center transition-all duration-150 ${
                            isEditing(product.id)
                              ? 'border-2 border-transparent bg-transparent text-[#8b929a] cursor-not-allowed'
                              : 'border-2 border-transparent bg-transparent text-[#4B5560] hover:bg-[#ECE7DC] hover:border-[#16181A] hover:text-[#16181A]'
                          }`}
                          aria-label="Historique"
                          title="Historique"
                        >
                          <History size={14} />
                        </button>
                        {!isEditing(product.id) ? (
                          <button
                            onClick={() => handleEditClick(product.id)}
                            className="flex h-9 w-9 items-center justify-center border-2 border-transparent bg-transparent text-[#16181A] transition-all duration-150 hover:bg-[#ECE7DC] hover:border-[#16181A]"
                            aria-label="Modifier"
                            title="Modifier"
                          >
                            <Pencil size={14} />
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => handleSaveClick(product.id)}
                              disabled={isSaving(product.id)}
                              className={`flex h-9 w-9 items-center justify-center border-2 transition-all duration-150 ${
                                isSaving(product.id)
                                  ? 'border-[#2F6B4F] bg-[#2F6B4F] text-white cursor-wait'
                                  : 'border-[#2F6B4F] bg-transparent text-[#2F6B4F] hover:bg-[#E9F5EF] hover:border-[#2F6B4F]'
                              }`}
                              aria-label={isSaving(product.id) ? 'Enregistrement...' : 'Enregistrer'}
                              title={isSaving(product.id) ? 'Enregistrement...' : 'Enregistrer'}
                            >
                              {isSaving(product.id) ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            </button>
                            <button
                              onClick={handleCancelClick}
                              className="flex h-9 w-9 items-center justify-center border-2 border-transparent bg-transparent text-[#C1440E] transition-all duration-150 hover:bg-[#FDF1EC] hover:border-[#C1440E]"
                              aria-label="Annuler"
                              title="Annuler"
                            >
                              <X size={14} />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => onDeleteProduct(product)}
                          disabled={isEditing(product.id)}
                          className={`flex h-9 w-9 items-center justify-center transition-all duration-150 ${
                            isEditing(product.id)
                              ? 'border-2 border-transparent bg-transparent text-[#8b929a] cursor-not-allowed'
                              : 'border-2 border-transparent bg-transparent text-[#C1440E] hover:bg-[#FDF1EC] hover:border-[#C1440E]'
                          }`}
                          aria-label="Supprimer"
                          title="Supprimer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-[#4B5560]">
                      <PackagePlus size={32} className="opacity-40" />
                      <span className="text-[13px]">Aucun produit ne correspond aux filtres.</span>
                      <span className="text-[11px] uppercase tracking-[0.16em]">Essayez de modifier vos critères de recherche</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="space-y-3 sm:hidden">
          {filteredProducts.map((product) => {
            const soldToday = soldByProductToday[product.id] ?? 0;
            const restockValue = restockByProduct[product.id] ?? 0;
            const isLowStock = product.stockFermeture <= product.seuil;
            const isOutOfStock = product.stockFermeture <= 0;
            const editing = isEditing(product.id);
            const saving = isSaving(product.id);
            const showHistory = selectedHistoryProduct?.id === product.id;
            const statusLabel = isOutOfStock ? 'Rupture' : isLowStock ? 'Stock bas' : 'En stock';
            const statusColor = isOutOfStock ? '#C1440E' : isLowStock ? '#F2B705' : '#2F6B4F';
            return (
              <div
                key={product.id}
                className={
                  'border-2 p-3 transition-colors duration-150 ' +
                  (editing
                    ? 'border-[#C1440E] bg-white shadow-[3px_3px_0_#C1440E]'
                    : isOutOfStock
                    ? 'border-[#C1440E] bg-[#FDF1EC]'
                    : isLowStock
                    ? 'border-[#F2B705] bg-[#FDF6DC]'
                    : 'border-[#16181A] bg-white')
                }
              >
                {/* Identity + stock */}
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <input
                      value={product.nom}
                      onChange={(event) => onUpdateProduct(product.id, { nom: event.target.value })}
                      readOnly={!editing}
                      tabIndex={editing ? 0 : -1}
                      placeholder="Nom du produit"
                      className={`w-full px-1 font-serif font-semibold leading-tight outline-none transition-colors ${
                        editing
                          ? 'h-11 border-2 border-[#C1440E] bg-white text-base'
                          : 'h-auto border-2 border-transparent bg-transparent text-[17px]'
                      }`}
                    />
                    <input
                      value={product.categorie}
                      onChange={(event) => onUpdateProduct(product.id, { categorie: event.target.value })}
                      readOnly={!editing}
                      tabIndex={editing ? 0 : -1}
                      placeholder="Catégorie"
                      className={`mt-0.5 w-full px-1 uppercase tracking-[0.14em] text-[#4B5560] outline-none transition-colors ${
                        editing
                          ? 'h-11 border-2 border-[#C1440E] bg-white text-base'
                          : 'h-auto border-2 border-transparent bg-transparent text-[11px]'
                      }`}
                    />
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[9px] uppercase tracking-[0.18em] text-[#4B5560]">Stock</div>
                    <div
                      className="font-serif text-3xl leading-none tabular-nums"
                      style={{ color: isOutOfStock ? '#C1440E' : isLowStock ? '#8a6d00' : '#16181A' }}
                    >
                      {product.stockFermeture}
                    </div>
                  </div>
                </div>

                {/* Status chips */}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1.5 border-2 border-[#16181A] bg-white px-2 py-1 uppercase tracking-[0.08em]">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor }} />
                    {statusLabel}
                  </span>
                  <span className="border-2 border-[#16181A] bg-white px-2 py-1 uppercase tracking-[0.08em]">
                    Vendu auj.: <span className="font-bold tabular-nums">{soldToday}</span>
                  </span>
                </div>

                {/* Inline history (phones) */}
                {showHistory && (
                  <div className="mt-3 border-2 border-[#16181A] bg-[#F0F8FF] p-2.5">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[#4B5560]">Historique produit</div>
                    <div className="grid grid-cols-2 gap-2 text-[12px]">
                      <div className="border-2 border-[#16181A] bg-white px-2 py-1.5">
                        <div className="text-[9px] uppercase tracking-[0.14em] text-[#4B5560]">Vendu</div>
                        <div className="font-bold tabular-nums">{soldToday}</div>
                      </div>
                      <div className="border-2 border-[#16181A] bg-white px-2 py-1.5">
                        <div className="text-[9px] uppercase tracking-[0.14em] text-[#4B5560]">Seuil alerte</div>
                        <div className="font-bold tabular-nums">{product.seuil}</div>
                      </div>
                      <div className="border-2 border-[#16181A] bg-white px-2 py-1.5">
                        <div className="text-[9px] uppercase tracking-[0.14em] text-[#4B5560]">Stock ouverture</div>
                        <div className="font-bold tabular-nums">{product.stockOuverture}</div>
                      </div>
                      <div className="border-2 border-[#16181A] bg-white px-2 py-1.5">
                        <div className="text-[9px] uppercase tracking-[0.14em] text-[#4B5560]">Stock fermeture</div>
                        <div className="font-bold tabular-nums">{product.stockFermeture}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Fields */}
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
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
                    label="Stock ouverture"
                    editing={editing}
                    value={product.stockOuverture}
                    onChange={(value) => onUpdateProduct(product.id, { stockOuverture: value })}
                  />
                  <ProductNumberField
                    label="Stock fermeture"
                    editing={editing}
                    value={product.stockFermeture}
                    onChange={(value) => onUpdateProduct(product.id, { stockFermeture: value })}
                  />
                  <ProductNumberField
                    label="Seuil alerte"
                    tone="yellow"
                    editing={editing}
                    value={product.seuil}
                    onChange={(value) => onUpdateProduct(product.id, { seuil: value })}
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

                {/* Actions — full-width touch targets */}
                <div className={'mt-3 grid gap-2 ' + (editing ? 'grid-cols-2' : 'grid-cols-3')}>
                  {editing ? (
                    <>
                      <button
                        onClick={() => handleSaveClick(product.id)}
                        disabled={saving}
                        className={
                          'flex h-11 items-center justify-center gap-1.5 border-2 border-[#2F6B4F] bg-[#2F6B4F] text-[11px] font-medium uppercase tracking-[0.12em] text-white ' +
                          (saving ? 'cursor-wait opacity-80' : 'active:bg-[#255640]')
                        }
                        aria-label={saving ? 'Enregistrement...' : 'Enregistrer'}
                      >
                        {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                        {saving ? 'Envoi…' : 'Enregistrer'}
                      </button>
                      <button
                        onClick={handleCancelClick}
                        className="flex h-11 items-center justify-center gap-1.5 border-2 border-[#C1440E] bg-white text-[11px] font-medium uppercase tracking-[0.12em] text-[#C1440E] active:bg-[#FDF1EC]"
                        aria-label="Annuler"
                      >
                        <X size={15} />
                        Annuler
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => onViewHistory(product)}
                        className={
                          'flex h-11 items-center justify-center gap-1.5 border-2 border-[#16181A] text-[11px] font-medium uppercase tracking-[0.1em] active:bg-[#ECE7DC] ' +
                          (showHistory ? 'bg-[#16181A] text-white active:bg-[#2b2e31]' : 'bg-white text-[#16181A]')
                        }
                        aria-label="Historique"
                        aria-pressed={showHistory}
                      >
                        <History size={15} />
                        Histo.
                      </button>
                      <button
                        onClick={() => handleEditClick(product.id)}
                        className="flex h-11 items-center justify-center gap-1.5 border-2 border-[#16181A] bg-white text-[11px] font-medium uppercase tracking-[0.1em] text-[#16181A] active:bg-[#ECE7DC]"
                        aria-label="Modifier"
                      >
                        <Pencil size={15} />
                        Modifier
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Supprimer « ${product.nom} » ?`)) onDeleteProduct(product);
                        }}
                        className="flex h-11 items-center justify-center gap-1.5 border-2 border-[#C1440E] bg-white text-[11px] font-medium uppercase tracking-[0.1em] text-[#C1440E] active:bg-[#FDF1EC]"
                        aria-label="Supprimer"
                      >
                        <Trash2 size={15} />
                        Suppr.
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {filteredProducts.length === 0 && (
            <div className="border-2 border-dashed border-[#16181A] bg-white py-12 text-center text-[#4B5560]">
              <PackagePlus size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-[13px]">Aucun produit ne correspond aux filtres.</p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.16em]">Essayez de modifier vos critères de recherche</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BranchSalesSection({
  sales,
  selectedDate,
  onCancelSale,
}: {
  sales: SaleRecord[];
  selectedDate: Date;
  onCancelSale: (sale: SaleRecord) => void;
}) {
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [receiptSale, setReceiptSale] = useState<SaleRecord | null>(null);
  const [saleToCancel, setSaleToCancel] = useState<{ sale: SaleRecord; number: number } | null>(null);

  const paymentLabel = (id: string) => PAYMENT_METHODS.find((m) => m.id === id)?.label || id;
  const qtyOf = (sale: SaleRecord) => sale.lignes.reduce((n, l) => n + l.qte, 0);

  // Number sales chronologically (1 = first sale of the day), then show newest first.
  const numbered = useMemo(
    () =>
      [...sales]
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .map((sale, index) => ({ sale, number: index + 1 }))
        .reverse(),
    [sales]
  );

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

  const printSale = (sale: SaleRecord) => {
    setReceiptSale(sale);
    window.setTimeout(() => window.print(), 150);
  };

  const cellBase = 'px-3 py-2.5 text-center';
  const iconButton =
    'flex h-9 w-9 items-center justify-center border-2 border-transparent bg-transparent text-[#4B5560] transition-all duration-150 hover:border-[#16181A] hover:bg-[#ECE7DC] hover:text-[#16181A]';

  return (
    <div className="border-2 border-[#16181A] bg-[#FBFAF6] p-3 shadow-[4px_4px_0_#C1440E] sm:p-5 sm:shadow-[8px_8px_0_#C1440E]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl">Ventes</h2>
          <div className="text-[12px] capitalize text-[#4B5560]">
            {selectedDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <span className="border-2 border-[#16181A] bg-[#ECE7DC] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.2em]">
          {rows.length} vente{rows.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 border-2 border-[#16181A] bg-white px-3 py-2 transition-shadow focus-within:shadow-[4px_4px_0_#C1440E]">
          <Search className="h-4 w-4 shrink-0 text-[#4B5560]" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher une vente, un article..."
            className="w-full border-none bg-transparent text-sm text-[#16181A] outline-none placeholder:text-[#4B5560]"
          />
          <select
            value={paymentFilter}
            onChange={(event) => setPaymentFilter(event.target.value)}
            className="shrink-0 border-2 border-[#16181A] bg-[#F3F4F6] px-2 py-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-[#16181A] outline-none"
            aria-label="Filtrer par mode de paiement"
          >
            <option value="all">Tous paiements</option>
            {PAYMENT_METHODS.map((method) => (
              <option key={method.id} value={method.id}>
                {method.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden border-2 border-[#16181A] bg-white">
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full min-w-[1080px] border-collapse text-left" role="grid">
            <thead className="sticky top-0 z-10 bg-gradient-to-b from-[#ECE7DC] to-[#E3DCCC] text-[10.5px] font-medium uppercase tracking-[0.16em] text-[#4B5560] shadow-[0_2px_0_#16181A]">
              <tr className="divide-x divide-[#d3cbb6]">
                <th className="px-3 py-3 text-center" title="Numéro de la vente dans la journée">N°</th>
                <th className="px-3 py-3 text-center" title="Heure de la vente">Heure</th>
                <th className="px-3 py-3 text-center" title="Articles vendus">Articles</th>
                <th className="px-3 py-3 text-center" title="Nombre total d'unités vendues">Qté</th>
                <th className="px-3 py-3 text-center" title="Mode de paiement">Paiement</th>
                <th className="px-3 py-3 text-center" title="Remise accordée au client">Remise</th>
                <th className="px-3 py-3 text-center" title="Montant total de la vente, après remise">Total</th>
                <th className="px-3 py-3 text-center" title="Montant reçu du client">Reçu</th>
                <th className="px-3 py-3 text-center" title="Monnaie rendue au client">Monnaie</th>
                <th className="px-3 py-3 text-center" title="Statut de la vente">Statut</th>
                <th className="px-3 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ sale, number }) => {
                const cancelled = sale.statut === 'annulee';
                return (
                  <tr
                    key={sale.id}
                    className={
                      'divide-x divide-[#e4ded0] border-b border-[#e4ded0] align-middle text-[13px] transition-all duration-150 ' +
                      (cancelled ? 'bg-[#FDF1EC] text-[#8b929a]' : 'odd:bg-white even:bg-[#FBFAF6] hover:bg-[#F3EFE3]')
                    }
                  >
                    <td className={cellBase + ' font-medium tabular-nums text-[#4B5560]'}>{number}</td>
                    <td className={cellBase + ' whitespace-nowrap tabular-nums'}>{fmtTime12(sale.date)}</td>
                    <td className="px-3 py-2.5 text-left">
                      <div className="space-y-0.5">
                        {sale.lignes.map((ligne, lineIndex) => (
                          <div key={lineIndex} className="flex justify-between gap-4">
                            <span className={cancelled ? 'line-through' : ''}>
                              <span className="tabular-nums text-[#4B5560]">{ligne.qte} ×</span> {ligne.nom}
                            </span>
                            <span className="tabular-nums text-[#4B5560]">{fmtHTG(ligne.sousTotal)}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className={cellBase + ' font-medium tabular-nums'}>{qtyOf(sale)}</td>
                    <td className={cellBase}>
                      <span className="inline-block border-2 border-[#16181A] px-2 py-0.5 text-[10px] uppercase tracking-wide">
                        {paymentLabel(sale.paiement)}
                      </span>
                      {sale.client && <div className="mt-1 text-[11px] text-[#4B5560]">{sale.client}</div>}
                    </td>
                    <td className={cellBase + ' tabular-nums'}>
                      {(sale.remise ?? 0) > 0 ? (
                        <div className={cancelled ? 'line-through' : 'text-[#C1440E]'}>
                          <div className="font-medium">- {fmtHTG(sale.remise ?? 0)}</div>
                          <div className="text-[11px]">
                            {Math.round(((sale.remise ?? 0) / (sale.total + (sale.remise ?? 0))) * 1000) / 10} %
                          </div>
                        </div>
                      ) : (
                        <span className="text-[#b5b9be]">—</span>
                      )}
                    </td>
                    <td
                      className={
                        cellBase +
                        ' font-serif text-[15px] tabular-nums ' +
                        (cancelled ? 'text-[#8b929a] line-through' : 'text-[#2F6B4F]')
                      }
                    >
                      {fmtHTG(sale.total)}
                    </td>
                    <td className={cellBase + ' tabular-nums text-[#4B5560]'}>{fmtHTG(sale.recu)}</td>
                    <td className={cellBase + ' tabular-nums text-[#4B5560]'}>{fmtHTG(sale.monnaie)}</td>
                    <td className={cellBase}>
                      <span
                        className={
                          'inline-block border-2 px-2 py-0.5 text-[10px] uppercase tracking-wide ' +
                          (cancelled
                            ? 'border-[#C1440E] bg-[#FDF1EC] text-[#C1440E]'
                            : 'border-[#2F6B4F] bg-[#E9F5EF] text-[#2F6B4F]')
                        }
                      >
                        {cancelled ? 'Annulée' : 'Validée'}
                      </span>
                    </td>
                    <td className={cellBase}>
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => setReceiptSale(sale)} className={iconButton} aria-label="Voir le reçu" title="Voir le reçu">
                          <Eye size={14} />
                        </button>
                        <button onClick={() => printSale(sale)} className={iconButton} aria-label="Imprimer le reçu" title="Imprimer le reçu">
                          <Printer size={14} />
                        </button>
                        <button
                          onClick={() => setSaleToCancel({ sale, number })}
                          disabled={cancelled}
                          className={
                            'flex h-9 w-9 items-center justify-center border-2 border-transparent bg-transparent transition-all duration-150 ' +
                            (cancelled
                              ? 'cursor-not-allowed text-[#c4c8cd]'
                              : 'text-[#C1440E] hover:border-[#C1440E] hover:bg-[#FDF1EC]')
                          }
                          aria-label="Annuler la vente"
                          title={cancelled ? 'Vente déjà annulée' : 'Annuler / rembourser la vente'}
                        >
                          <Undo2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-14 text-center text-[#4B5560]">
                    <ShoppingCart size={32} className="mx-auto mb-3 opacity-40" />
                    <div className="text-sm">
                      {isFiltering ? 'Aucune vente ne correspond à votre recherche.' : 'Aucune vente pour cette date.'}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
            {countedRows.length > 0 && (
              <tfoot className="sticky bottom-0 bg-gradient-to-b from-[#ECE7DC] to-[#E3DCCC] text-[13px] font-medium shadow-[0_-2px_0_#16181A]">
                <tr className="divide-x divide-[#d3cbb6]">
                  <td colSpan={3} className="px-3 py-3 text-right text-[10.5px] uppercase tracking-[0.16em] text-[#4B5560]">
                    {isFiltering ? 'Total (résultats)' : 'Total du jour'}
                  </td>
                  <td className="px-3 py-3 text-center tabular-nums">{totalQty}</td>
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3 text-center tabular-nums text-[#C1440E]">
                    {totalDiscount > 0 ? `- ${fmtHTG(totalDiscount)}` : '—'}
                  </td>
                  <td className="px-3 py-3 text-center font-serif text-[15px] tabular-nums text-[#2F6B4F]">{fmtHTG(totalAmount)}</td>
                  <td colSpan={4} className="px-3 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {receiptSale && <ReceiptModal sale={receiptSale} onClose={() => setReceiptSale(null)} />}

      {saleToCancel && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-sm border-2 border-[#16181A] bg-white p-3 shadow-[4px_4px_0_#C1440E] sm:p-5 sm:shadow-[8px_8px_0_#C1440E]">
            <div className="font-serif text-xl">Annuler la vente n° {saleToCancel.number} ?</div>
            <p className="mt-2 text-[13px] text-[#4B5560]">
              {fmtHTG(saleToCancel.sale.total)} • {qtyOf(saleToCancel.sale)} article{qtyOf(saleToCancel.sale) !== 1 ? 's' : ''}.
              Le stock sera remis en inventaire et la vente ne comptera plus dans les totaux.
            </p>
            {saleToCancel.sale.paiement === 'credit' && creditPaid(saleToCancel.sale) > 0 && (
              <p className="mt-2 border-2 border-[#F2B705] bg-[#FDF6DC] px-3 py-2 text-[12px] text-[#8a6d00]">
                {fmtHTG(creditPaid(saleToCancel.sale))} ont déjà été payés sur ce crédit : pensez à les rembourser au client.
              </p>
            )}
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setSaleToCancel(null)}
                className="flex-1 border-2 border-[#16181A] bg-white py-2.5 text-[14px] hover:bg-[#ECE7DC]"
              >
                Retour
              </button>
              <button
                onClick={() => {
                  onCancelSale(saleToCancel.sale);
                  setSaleToCancel(null);
                }}
                className="flex-1 border-2 border-[#16181A] bg-[#C1440E] py-2.5 text-[14px] font-medium text-white hover:bg-[#a53a0b]"
              >
                Annuler la vente
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4">
      <div className="max-h-[92vh] w-full max-w-sm overflow-y-auto border-2 border-[#16181A] bg-white shadow-[8px_8px_0_#2F6B4F]">
        <div className="flex items-start justify-between border-b-2 border-[#16181A] px-5 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-[#4B5560]">Encaisser un paiement</div>
            <div className="mt-1 font-serif text-xl leading-tight">{title}</div>
          </div>
          <button onClick={onClose} className="mt-1 text-[#4B5560] hover:text-[#C1440E]" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] text-[#4B5560]">Solde dû</span>
            <span className="font-serif text-2xl text-[#C1440E]">{fmtHTG(balance)}</span>
          </div>

          <div>
            <label className="mb-1 block text-[12px] text-[#4B5560]">Montant reçu (HTG)</label>
            <input
              type="number"
              min="0"
              max={balance}
              value={montant}
              onChange={(event) => setMontant(event.target.value)}
              className="w-full border-2 border-[#16181A] bg-white px-3 py-2 text-sm outline-none focus:border-[#C1440E]"
            />
            <div className="mt-1.5 flex gap-1.5">
              <button
                type="button"
                onClick={() => setMontant(String(balance))}
                className="border-2 border-[#16181A] bg-white px-2 py-0.5 text-[11px] hover:bg-[#ECE7DC]"
              >
                Tout payer
              </button>
              <button
                type="button"
                onClick={() => setMontant(String(Math.round(balance / 2)))}
                className="border-2 border-[#16181A] bg-white px-2 py-0.5 text-[11px] hover:bg-[#ECE7DC]"
              >
                Moitié
              </button>
            </div>
            {value > balance && <div className="mt-1 text-[12px] text-[#C1440E]">Le montant dépasse le solde dû.</div>}
          </div>

          <div>
            <div className="mb-1 text-[12px] text-[#4B5560]">Mode de paiement</div>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.filter((m) => m.id !== 'credit').map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={
                    'border-2 border-[#16181A] px-2 py-2 text-[12px] ' +
                    (mode === m.id ? 'bg-[#16181A] text-white' : 'bg-white hover:bg-[#ECE7DC]')
                  }
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {sales.length > 1 && (
            <div className="text-[12px] text-[#4B5560]">
              Le paiement est appliqué d'abord aux ventes les plus anciennes ({sales.length} ventes impayées).
            </div>
          )}

          {history.length > 0 && (
            <div className="border-t-2 border-[#e4ded0] pt-3">
              <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-[#4B5560]">Paiements déjà reçus</div>
              {history.map((payment) => (
                <div key={payment.id} className="flex justify-between text-[12px]">
                  <span>
                    {payment.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} •{' '}
                    {PAYMENT_METHODS.find((m) => m.id === payment.mode)?.label}
                  </span>
                  <span className="tabular-nums text-[#2F6B4F]">{fmtHTG(payment.montant)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t-2 border-[#16181A] px-5 py-4">
          <button onClick={onClose} className="flex-1 border-2 border-[#16181A] bg-white py-2.5 text-[14px] hover:bg-[#ECE7DC]">
            Annuler
          </button>
          <button
            disabled={!valid}
            onClick={() => onConfirm(value, mode)}
            className={
              'flex-1 border-2 border-[#16181A] py-2.5 text-[14px] font-medium ' +
              (valid ? 'bg-[#2F6B4F] text-white hover:bg-[#255a40]' : 'cursor-not-allowed bg-[#d8d3c6] text-[#8b8f87]')
            }
          >
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

  const cellBase = 'px-3 py-2.5 text-center';
  const iconButton =
    'flex h-9 w-9 items-center justify-center border-2 border-transparent bg-transparent text-[#4B5560] transition-all duration-150 hover:border-[#16181A] hover:bg-[#ECE7DC] hover:text-[#16181A]';
  const headClass =
    'sticky top-0 z-10 bg-gradient-to-b from-[#ECE7DC] to-[#E3DCCC] text-[10.5px] font-medium uppercase tracking-[0.16em] text-[#4B5560] shadow-[0_2px_0_#16181A]';

  const openPayment = (title: string, targets: SaleRecord[]) => {
    const open = targets.filter((sale) => creditBalance(sale) > 0);
    if (open.length > 0) setPayTarget({ title, sales: open });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="border-2 border-[#16181A] bg-white p-3 shadow-[3px_3px_0_#C1440E] sm:p-4 sm:shadow-[6px_6px_0_#C1440E]">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#4B5560]">Total dû</div>
          <div className="mt-2 break-words font-serif text-2xl sm:text-3xl text-[#C1440E]">{fmtHTG(totalDue)}</div>
        </div>
        <div className="border-2 border-[#16181A] bg-white p-3 shadow-[3px_3px_0_#16181A] sm:p-4 sm:shadow-[6px_6px_0_#16181A]">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#4B5560]">Clients débiteurs</div>
          <div className="mt-2 break-words font-serif text-2xl sm:text-3xl">{debtorCount}</div>
        </div>
        <div className="border-2 border-[#16181A] bg-white p-3 shadow-[3px_3px_0_#F2B705] sm:p-4 sm:shadow-[6px_6px_0_#F2B705]">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#4B5560]">Ventes impayées</div>
          <div className="mt-2 break-words font-serif text-2xl sm:text-3xl">{openSalesCount}</div>
        </div>
      </div>

      <div className="border-2 border-[#16181A] bg-[#FBFAF6] p-3 shadow-[4px_4px_0_#F2B705] sm:p-5 sm:shadow-[8px_8px_0_#F2B705]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl">Ventes à crédit</h2>
            <div className="text-[12px] text-[#4B5560]">Toutes les dates • ceux qui doivent de l'argent</div>
          </div>
          <div className="flex">
            {(
              [
                ['clients', 'Par client'],
                ['sales', 'Par vente'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={
                  'border-2 border-[#16181A] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.16em] ' +
                  (id === 'sales' ? '-ml-0.5 ' : '') +
                  (view === id ? 'bg-[#16181A] text-white' : 'bg-white hover:bg-[#ECE7DC]')
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 border-2 border-[#16181A] bg-white px-3 py-2 transition-shadow focus-within:shadow-[4px_4px_0_#C1440E]">
            <Search className="h-4 w-4 shrink-0 text-[#4B5560]" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un client, un article..."
              className="w-full border-none bg-transparent text-sm text-[#16181A] outline-none placeholder:text-[#4B5560]"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'open' | 'all')}
              className="shrink-0 border-2 border-[#16181A] bg-[#F3F4F6] px-2 py-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-[#16181A] outline-none"
              aria-label="Filtrer par statut"
            >
              <option value="open">Impayés</option>
              <option value="all">Tous</option>
            </select>
          </div>
        </div>

        <div className="overflow-hidden border-2 border-[#16181A] bg-white">
          <div className="max-h-[65vh] overflow-auto">
            {view === 'clients' ? (
              <table className="w-full min-w-[820px] border-collapse text-left" role="grid">
                <thead className={headClass}>
                  <tr className="divide-x divide-[#d3cbb6]">
                    <th className="px-3 py-3 text-center">Client</th>
                    <th className="px-3 py-3 text-center" title="Nombre de ventes à crédit">Ventes</th>
                    <th className="px-3 py-3 text-center" title="Total pris à crédit">Total crédit</th>
                    <th className="px-3 py-3 text-center" title="Total déjà payé">Payé</th>
                    <th className="px-3 py-3 text-center" title="Montant restant à payer">Solde dû</th>
                    <th className="px-3 py-3 text-center" title="Date du dernier achat à crédit">Dernier achat</th>
                    <th className="px-3 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {clientRows.map((client) => (
                    <tr
                      key={client.nom.toLowerCase()}
                      className="divide-x divide-[#e4ded0] border-b border-[#e4ded0] align-middle text-[13px] transition-all duration-150 odd:bg-white even:bg-[#FBFAF6] hover:bg-[#F3EFE3]"
                    >
                      <td className="px-3 py-2.5 text-left font-medium">{client.nom}</td>
                      <td className={cellBase + ' tabular-nums'}>{client.sales.length}</td>
                      <td className={cellBase + ' tabular-nums text-[#4B5560]'}>{fmtHTG(client.total)}</td>
                      <td className={cellBase + ' tabular-nums text-[#2F6B4F]'}>{fmtHTG(client.paid)}</td>
                      <td
                        className={
                          cellBase +
                          ' font-serif text-[15px] tabular-nums ' +
                          (client.balance > 0 ? 'text-[#C1440E]' : 'text-[#2F6B4F]')
                        }
                      >
                        {client.balance > 0 ? fmtHTG(client.balance) : 'Soldé'}
                      </td>
                      <td className={cellBase}>
                        <div className="whitespace-nowrap">{fmtDate(client.last)}</div>
                        <div className="text-[11px] text-[#4B5560]">{ageLabel(client.last)}</div>
                      </td>
                      <td className={cellBase}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openPayment(client.nom, client.sales)}
                            disabled={client.balance <= 0}
                            className={
                              'border-2 border-[#16181A] px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] ' +
                              (client.balance > 0
                                ? 'bg-[#2F6B4F] text-white hover:bg-[#255a40]'
                                : 'cursor-not-allowed border-[#d8d3c6] bg-[#f1efe8] text-[#a4a89f]')
                            }
                          >
                            Encaisser
                          </button>
                          <button
                            onClick={() => {
                              setSearch(client.nom);
                              setView('sales');
                            }}
                            className={iconButton}
                            aria-label="Voir les ventes du client"
                            title="Voir les ventes du client"
                          >
                            <Eye size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {clientRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-14 text-center text-[#4B5560]">
                        <FileClock size={32} className="mx-auto mb-3 opacity-40" />
                        <div className="text-sm">
                          {query || statusFilter === 'all' ? 'Aucun client trouvé.' : 'Personne ne doit d\'argent 🎉'}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[980px] border-collapse text-left" role="grid">
                <thead className={headClass}>
                  <tr className="divide-x divide-[#d3cbb6]">
                    <th className="px-3 py-3 text-center">Date</th>
                    <th className="px-3 py-3 text-center">Client</th>
                    <th className="px-3 py-3 text-center">Articles</th>
                    <th className="px-3 py-3 text-center" title="Montant total de la vente">Total</th>
                    <th className="px-3 py-3 text-center" title="Montant déjà payé">Payé</th>
                    <th className="px-3 py-3 text-center" title="Montant restant à payer">Solde dû</th>
                    <th className="px-3 py-3 text-center">Statut</th>
                    <th className="px-3 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {saleRows.map((sale) => {
                    const paid = creditPaid(sale);
                    const balance = creditBalance(sale);
                    const status = balance <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
                    return (
                      <tr
                        key={sale.id}
                        className="divide-x divide-[#e4ded0] border-b border-[#e4ded0] align-middle text-[13px] transition-all duration-150 odd:bg-white even:bg-[#FBFAF6] hover:bg-[#F3EFE3]"
                      >
                        <td className={cellBase}>
                          <div className="whitespace-nowrap">{fmtDate(sale.date)}</div>
                          <div className="text-[11px] tabular-nums text-[#4B5560]">
                            {fmtTime12(sale.date)} • {ageLabel(sale.date)}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-left font-medium">{clientName(sale)}</td>
                        <td className="px-3 py-2.5 text-left">
                          <div className="space-y-0.5">
                            {sale.lignes.map((ligne, index) => (
                              <div key={index}>
                                <span className="tabular-nums text-[#4B5560]">{ligne.qte} ×</span> {ligne.nom}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className={cellBase + ' tabular-nums text-[#4B5560]'}>{fmtHTG(sale.total)}</td>
                        <td className={cellBase + ' tabular-nums text-[#2F6B4F]'}>{paid > 0 ? fmtHTG(paid) : '—'}</td>
                        <td
                          className={
                            cellBase +
                            ' font-serif text-[15px] tabular-nums ' +
                            (balance > 0 ? 'text-[#C1440E]' : 'text-[#2F6B4F]')
                          }
                        >
                          {balance > 0 ? fmtHTG(balance) : '—'}
                        </td>
                        <td className={cellBase}>
                          <span
                            className={
                              'inline-block border-2 px-2 py-0.5 text-[10px] uppercase tracking-wide ' +
                              (status === 'paid'
                                ? 'border-[#2F6B4F] bg-[#E9F5EF] text-[#2F6B4F]'
                                : status === 'partial'
                                ? 'border-[#F2B705] bg-[#FDF6DC] text-[#8a6d00]'
                                : 'border-[#C1440E] bg-[#FDF1EC] text-[#C1440E]')
                            }
                          >
                            {status === 'paid' ? 'Payé' : status === 'partial' ? 'Partiel' : 'Impayé'}
                          </span>
                        </td>
                        <td className={cellBase}>
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => openPayment(clientName(sale), [sale])}
                              disabled={balance <= 0}
                              className={
                                'border-2 border-[#16181A] px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] ' +
                                (balance > 0
                                  ? 'bg-[#2F6B4F] text-white hover:bg-[#255a40]'
                                  : 'cursor-not-allowed border-[#d8d3c6] bg-[#f1efe8] text-[#a4a89f]')
                              }
                            >
                              Encaisser
                            </button>
                            <button
                              onClick={() => setReceiptSale(sale)}
                              className={iconButton}
                              aria-label="Voir le reçu"
                              title="Voir le reçu"
                            >
                              <Eye size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {saleRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-14 text-center text-[#4B5560]">
                        <FileClock size={32} className="mx-auto mb-3 opacity-40" />
                        <div className="text-sm">
                          {query || statusFilter === 'all' ? 'Aucune vente trouvée.' : 'Aucune vente impayée.'}
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
    </div>
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
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="border-2 border-[#16181A] bg-white p-5 shadow-[4px_4px_0_#16181A]">
          <div className="text-[11px] uppercase tracking-wide text-[#4B5560]">Revenu Total</div>
          <div className="mt-2 break-words font-serif text-2xl sm:text-3xl">{fmtHTG(totalRevenue)}</div>
        </div>
        <div className="border-2 border-[#16181A] bg-white p-5 shadow-[4px_4px_0_#16181A]">
          <div className="text-[11px] uppercase tracking-wide text-[#4B5560]">Profit Net Estimé</div>
          <div className="mt-2 break-words font-serif text-2xl sm:text-3xl text-[#2F6B4F]">{fmtHTG(totalProfit)}</div>
        </div>
        <div className="border-2 border-[#16181A] bg-white p-5 shadow-[4px_4px_0_#16181A]">
          <div className="text-[11px] uppercase tracking-wide text-[#4B5560]">Nombre de Ventes</div>
          <div className="mt-2 break-words font-serif text-2xl sm:text-3xl">{ventes.length}</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="border-2 border-[#16181A] bg-white p-3 shadow-[4px_4px_0_#C1440E] sm:p-5 sm:shadow-[8px_8px_0_#C1440E]">
          <h2 className="mb-6 font-serif text-2xl">Revenus — 7 derniers jours</h2>
          <div className="flex h-48 items-end gap-3 px-2">
            {revenueByDay.map((d, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full border-2 border-[#16181A] bg-[#C1440E]"
                  style={{ height: `${(d.total / maxDayRevenue) * 100}%` }}
                />
                <div className="text-[9px] uppercase tracking-tight">{d.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-2 border-[#16181A] bg-white p-3 shadow-[4px_4px_0_#C1440E] sm:p-5 sm:shadow-[8px_8px_0_#C1440E]">
          <h2 className="mb-6 font-serif text-2xl">Performance — {branch.nom.split(' ').pop()}</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="mb-3 text-[11px] font-bold uppercase text-[#2F6B4F]">Meilleures Ventes</div>
              <div className="space-y-2">
                {topSellers.map((p) => (
                  <div key={p.nom} className="flex justify-between text-[11px]">
                    <span className="mr-2 truncate">{p.nom}</span>
                    <span className="font-bold">{p.qte} u.</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-3 text-[11px] font-bold uppercase text-[#C1440E]">Ventes Faibles</div>
              <div className="space-y-2">
                {slowestMovers.map((p) => (
                  <div key={p.nom} className="flex justify-between text-[11px]">
                    <span className="mr-2 truncate">{p.nom}</span>
                    <span className="font-bold">{p.qte} u.</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   RAPPORTS — Journalier / Mensuel / Annuel
   Cash net = Brut − Crédits − Consommations internes − Achats + Renflouements + Remboursements
   Cash en main = Cash net − paiements mobiles (MonCash / NatCash)
   ========================================================================= */

const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function CashEntryForm({
  onAdd,
  date,
}: {
  onAdd: (entry: Omit<CashEntry, 'id' | 'branchId'>) => void;
  date: Date;
}) {
  const [type, setType] = useState<CashEntryType>('consommation');
  const [montant, setMontant] = useState('');
  const [note, setNote] = useState('');
  const value = Number(montant);
  const valid = Number.isFinite(value) && value > 0;

  const submit = () => {
    if (!valid) return;
    const when = new Date(date);
    const now = new Date();
    when.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
    onAdd({ date: when, type, montant: value, note: note.trim() || undefined });
    setMontant('');
    setNote('');
  };

  return (
    <div className="border-2 border-[#16181A] bg-white">
      <div className="border-b-2 border-[#16181A] bg-[#ECE7DC] px-4 py-3 text-[11px] uppercase tracking-[0.18em]">
        Nouveau mouvement de caisse
      </div>
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(CASH_ENTRY_META) as CashEntryType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={
                'border-2 px-2 py-2 text-[10px] uppercase tracking-[0.12em] ' +
                (type === t
                  ? 'border-[#16181A] bg-[#16181A] text-white'
                  : 'border-[#16181A] bg-white hover:bg-[#ECE7DC]')
              }
            >
              {CASH_ENTRY_META[t].sign === -1 ? '− ' : '+ '}
              {CASH_ENTRY_META[t].label}
            </button>
          ))}
        </div>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Montant (HTG)"
          className="w-full border-2 border-[#16181A] bg-white px-3 py-2 text-sm outline-none focus:border-[#C1440E]"
        />
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Note (optionnel)"
          className="w-full border-2 border-[#16181A] bg-white px-3 py-2 text-sm outline-none focus:border-[#C1440E]"
        />
        <button
          onClick={submit}
          disabled={!valid}
          className={
            'flex w-full items-center justify-center gap-2 border-2 px-4 py-2.5 text-[11px] uppercase tracking-[0.18em] ' +
            (valid
              ? 'border-[#C1440E] bg-[#C1440E] text-white hover:bg-[#a53a0b]'
              : 'cursor-not-allowed border-[#9CA3AF] bg-[#E5E7EB] text-[#6B7280]')
          }
        >
          <Plus size={14} /> Ajouter
        </button>
      </div>
    </div>
  );
}

function DailyReport({
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

  const kpis: Array<{ label: string; value: number; sign?: string; tone: string; box: string }> = [
    { label: 'Total brut', value: sum.brut, tone: '', box: 'border-[#16181A] bg-white' },
    { label: 'Déductions', value: totalDeductions, sign: '−', tone: 'text-[#C1440E]', box: 'border-[#16181A] bg-white' },
    { label: 'Additions', value: totalAdditions, sign: '+', tone: 'text-[#2F6B4F]', box: 'border-[#16181A] bg-white' },
    { label: 'Cash net', value: sum.cashNet, tone: '', box: 'border-[#16181A] bg-[#ECE7DC]' },
    { label: 'Cash en main', value: sum.cashEnMain, tone: 'text-[#2F6B4F]', box: 'border-[#2F6B4F] bg-[#E9F5EF]' },
  ];

  const ledgerRow = (label: string, value: number, sign: '-' | '+', hint?: string) => (
    <div key={label} className="flex items-baseline justify-between gap-3 border-b border-dashed border-[#4B5560]/40 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-[0.1em]">{label}</div>
        {hint && <div className="text-[10px] leading-tight text-[#4B5560]">{hint}</div>}
      </div>
      <div className={'shrink-0 font-mono text-[13px] tabular-nums ' + (sign === '-' ? 'text-[#C1440E]' : 'text-[#2F6B4F]')}>
        {sign === '-' ? '−' : '+'} {fmtHTG(value)}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Title bar */}
      <div className="flex flex-wrap items-end justify-between gap-2 border-b-2 border-[#16181A] pb-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-[#4B5560]">Rapport journalier</div>
          <h2 className="font-serif text-2xl capitalize">{dateLabel}</h2>
        </div>
        <div className="text-[11px] uppercase tracking-[0.14em] text-[#4B5560]">{sum.nbVentes} vente(s) validée(s)</div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {kpis.map((k, i) => (
          <div
            key={k.label}
            className={
              'border-2 p-4 shadow-[4px_4px_0_#16181A] ' +
              k.box +
              (i === kpis.length - 1 ? ' col-span-2 lg:col-span-1' : '')
            }
          >
            <div className="text-[10px] uppercase tracking-[0.16em] text-[#4B5560]">{k.label}</div>
            <div className={'mt-1.5 font-serif text-xl tabular-nums xl:text-2xl ' + k.tone}>
              {k.sign ? k.sign + ' ' : ''}
              {fmtHTG(k.value)}
            </div>
          </div>
        ))}
      </div>

      {/* Ledger (left) + payment modes (right) */}
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="border-2 border-[#16181A] bg-white shadow-[8px_8px_0_#C1440E] xl:col-span-2">
          <div className="flex items-center justify-between border-b-2 border-[#16181A] bg-[#ECE7DC] px-4 py-3">
            <span className="text-[11px] uppercase tracking-[0.18em]">Détail de la caisse</span>
            <span className="font-mono text-[12px] tabular-nums">Brut {fmtHTG(sum.brut)}</span>
          </div>

          <div className="grid divide-[#16181A] md:grid-cols-2 md:divide-x-2">
            <div className="p-4">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#C1440E]">Déductions</div>
              {ledgerRow('Crédits', sum.credits, '-', 'Ventes à crédit non encaissées')}
              {ledgerRow('Consommations internes', sum.consommations, '-')}
              {ledgerRow('Achats', sum.achats, '-')}
              <div className="mt-2 flex justify-between border-t-2 border-[#16181A] pt-2 text-[11px] font-bold uppercase tracking-[0.1em]">
                <span>Total déductions</span>
                <span className="font-mono tabular-nums text-[#C1440E]">− {fmtHTG(totalDeductions)}</span>
              </div>
            </div>
            <div className="border-t-2 border-[#16181A] p-4 md:border-t-0">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#2F6B4F]">Additions</div>
              {ledgerRow('Renflouement', sum.renflouements, '+')}
              {ledgerRow('Remboursement', sum.remboursements, '+', 'Crédits reçus + saisies manuelles')}
              <div className="mt-2 flex justify-between border-t-2 border-[#16181A] pt-2 text-[11px] font-bold uppercase tracking-[0.1em]">
                <span>Total additions</span>
                <span className="font-mono tabular-nums text-[#2F6B4F]">+ {fmtHTG(totalAdditions)}</span>
              </div>
            </div>
          </div>

          {/* Equation strip */}
          <div className="grid border-t-2 border-[#16181A] sm:grid-cols-3 sm:divide-x-2 sm:divide-[#16181A]">
            <div className="p-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-[#4B5560]">Cash net</div>
              <div className="font-serif text-xl tabular-nums">{fmtHTG(sum.cashNet)}</div>
            </div>
            <div className="border-t-2 border-[#16181A] p-4 sm:border-t-0">
              <div className="text-[10px] uppercase tracking-[0.16em] text-[#4B5560]">− Paiements mobiles</div>
              <div className="font-serif text-xl tabular-nums text-[#C1440E]">{fmtHTG(sum.mobile)}</div>
              <div className="text-[10px] text-[#4B5560]">MonCash / NatCash</div>
            </div>
            <div className="border-t-2 border-[#2F6B4F] bg-[#E9F5EF] p-4 sm:border-t-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#2F6B4F]">= Cash en main</div>
              <div className="font-serif text-2xl tabular-nums text-[#2F6B4F]">{fmtHTG(sum.cashEnMain)}</div>
            </div>
          </div>
        </div>

        <div className="border-2 border-[#16181A] bg-white">
          <div className="border-b-2 border-[#16181A] bg-[#ECE7DC] px-4 py-3 text-[11px] uppercase tracking-[0.18em]">
            Ventes par mode de paiement
          </div>
          <div className="space-y-4 p-4">
            {byMode.map((m) => {
              const Icon = m.icon;
              return (
                <div key={m.id}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.1em]">
                    <span className="flex items-center gap-2">
                      <Icon size={13} /> {m.label}
                      <span className="text-[#4B5560]">({m.count})</span>
                    </span>
                    <span className="font-mono tabular-nums">{fmtHTG(m.total)}</span>
                  </div>
                  <div className="h-3 border-2 border-[#16181A] bg-[#FBFAF6]">
                    <div
                      className={'h-full ' + (m.id === 'credit' ? 'bg-[#F2B705]' : m.id === 'especes' ? 'bg-[#2F6B4F]' : 'bg-[#C1440E]')}
                      style={{ width: `${(m.total / maxMode) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Entry form (left) + movements table (right) */}
      <div className="grid gap-5 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <CashEntryForm onAdd={onAddEntry} date={selectedDate} />
        </div>

        <div className="border-2 border-[#16181A] bg-white xl:col-span-3">
          <div className="flex items-center justify-between border-b-2 border-[#16181A] bg-[#ECE7DC] px-4 py-3 text-[11px] uppercase tracking-[0.18em]">
            <span>Mouvements du jour</span>
            <span className="text-[#4B5560]">{dayEntries.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b-2 border-[#16181A] text-left text-[10px] uppercase tracking-[0.12em] text-[#4B5560]">
                  <th className="px-3 py-2.5">Heure</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Note</th>
                  <th className="px-3 py-2.5 text-right">Montant</th>
                  <th className="w-10 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {dayEntries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-sm text-[#4B5560]">
                      Aucun mouvement pour cette date.
                    </td>
                  </tr>
                )}
                {dayEntries.map((e) => {
                  const meta = CASH_ENTRY_META[e.type];
                  return (
                    <tr key={e.id} className="border-b border-[#16181A]/15 hover:bg-[#FBFAF6]">
                      <td className="px-3 py-2.5 font-mono text-[11px] text-[#4B5560]">{fmtTime12(e.date)}</td>
                      <td className="px-3 py-2.5 uppercase tracking-[0.08em]">{meta.label}</td>
                      <td className="max-w-[180px] truncate px-3 py-2.5 text-[#4B5560]">{e.note ?? '—'}</td>
                      <td
                        className={
                          'px-3 py-2.5 text-right font-mono tabular-nums ' +
                          (meta.sign === -1 ? 'text-[#C1440E]' : 'text-[#2F6B4F]')
                        }
                      >
                        {meta.sign === -1 ? '−' : '+'} {fmtHTG(e.montant)}
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => onDeleteEntry(e.id)}
                          aria-label="Supprimer"
                          className="flex h-7 w-7 items-center justify-center border-2 border-[#16181A] bg-white hover:bg-[#ECE7DC]"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function PeriodReport({
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

  const cols: Array<{ key: string; label: string; get: (s: CashSummary) => number; tone?: string }> = [
    { key: 'brut', label: 'Total brut', get: (s) => s.brut },
    { key: 'credits', label: 'Crédits', get: (s) => s.credits, tone: 'text-[#C1440E]' },
    { key: 'conso', label: 'Conso. internes', get: (s) => s.consommations, tone: 'text-[#C1440E]' },
    { key: 'achats', label: 'Achats', get: (s) => s.achats, tone: 'text-[#C1440E]' },
    { key: 'renf', label: 'Renflouement', get: (s) => s.renflouements, tone: 'text-[#2F6B4F]' },
    { key: 'remb', label: 'Remboursement', get: (s) => s.remboursements, tone: 'text-[#2F6B4F]' },
    { key: 'net', label: 'Cash net', get: (s) => s.cashNet },
    { key: 'main', label: 'Cash en main', get: (s) => s.cashEnMain, tone: 'font-bold text-[#2F6B4F]' },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="border-2 border-[#16181A] bg-white p-5 shadow-[4px_4px_0_#16181A]">
          <div className="text-[11px] uppercase tracking-wide text-[#4B5560]">Total brut — {title}</div>
          <div className="mt-2 break-words font-serif text-2xl sm:text-3xl">{fmtHTG(total.brut)}</div>
        </div>
        <div className="border-2 border-[#16181A] bg-white p-5 shadow-[4px_4px_0_#16181A]">
          <div className="text-[11px] uppercase tracking-wide text-[#4B5560]">Cash net</div>
          <div className="mt-2 break-words font-serif text-2xl sm:text-3xl">{fmtHTG(total.cashNet)}</div>
        </div>
        <div className="border-2 border-[#2F6B4F] bg-[#E9F5EF] p-5 shadow-[4px_4px_0_#2F6B4F]">
          <div className="text-[11px] uppercase tracking-wide text-[#2F6B4F]">Cash en main</div>
          <div className="mt-2 break-words font-serif text-2xl sm:text-3xl text-[#2F6B4F]">{fmtHTG(total.cashEnMain)}</div>
        </div>
      </div>

      <div className="border-2 border-[#16181A] bg-white shadow-[8px_8px_0_#C1440E]">
        <div className="border-b-2 border-[#16181A] px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.22em] text-[#4B5560]">
            {mode === 'monthly' ? 'Rapport mensuel' : 'Rapport annuel'}
          </div>
          <h2 className="font-serif text-2xl">{title}</h2>
          <div className="text-[11px] text-[#4B5560]">
            {mode === 'monthly'
              ? 'Change le mois avec le sélecteur de date en haut.'
              : "Change l'année avec le sélecteur de date en haut."}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-right text-[12px] tabular-nums">
            <thead>
              <tr className="border-b-2 border-[#16181A] bg-[#ECE7DC] text-[10px] uppercase tracking-[0.12em]">
                <th className="px-3 py-3 text-left">{mode === 'monthly' ? 'Jour' : 'Mois'}</th>
                {cols.map((c) => (
                  <th key={c.key} className="px-3 py-3">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={cols.length + 1} className="px-3 py-8 text-center text-sm text-[#4B5560]">
                    Aucune activité sur cette période.
                  </td>
                </tr>
              )}
              {visibleRows.map((r) => (
                <tr key={r.label} className="border-b border-[#16181A]/15 hover:bg-[#FBFAF6]">
                  <td className="px-3 py-2.5 text-left font-medium">{r.label}</td>
                  {cols.map((c) => (
                    <td key={c.key} className={'px-3 py-2.5 ' + (c.tone ?? '')}>
                      {c.get(r.sum) === 0 ? '—' : fmtHTG(c.get(r.sum))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#16181A] bg-[#16181A] text-[#FBFAF6]">
                <td className="px-3 py-3 text-left text-[10px] uppercase tracking-[0.16em]">Total</td>
                {cols.map((c) => (
                  <td key={c.key} className="px-3 py-3 font-bold">{fmtHTG(c.get(total))}</td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
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
  return (
    <div className="space-y-5">
      {/* Mobile-friendly tab switch (mirrors the drop-down in the side menu) */}
      <div className="flex flex-wrap gap-1.5">
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setPeriod(tab.id)}
            className={
              'border-2 px-4 py-2 text-[11px] uppercase tracking-[0.16em] ' +
              (period === tab.id
                ? 'border-[#16181A] bg-[#16181A] text-white'
                : 'border-[#16181A] bg-white hover:bg-[#ECE7DC]')
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {period === 'daily' && (
        <DailyReport
          ventes={ventes}
          entries={entries}
          selectedDate={selectedDate}
          onAddEntry={onAddEntry}
          onDeleteEntry={onDeleteEntry}
        />
      )}
      {period === 'monthly' && (
        <>
          <PeriodReport mode="monthly" ventes={ventes} entries={entries} selectedDate={selectedDate} />
          <BranchAnalyticsSection branch={branch} ventes={validSales} products={products} />
        </>
      )}
      {period === 'annual' && (
        <PeriodReport mode="annual" ventes={ventes} entries={entries} selectedDate={selectedDate} />
      )}
    </div>
  );
}

/* =========================================================================
   COFFRE — every entry / exit of money, per account (Espèces, MonCash, NatCash)
   ========================================================================= */

function CoffreForm({
  balances,
  date,
  cashEnMainDuJour,
  onAdd,
}: {
  balances: Record<CoffreAccountId, number>;
  date: Date;
  cashEnMainDuJour: number;
  onAdd: (entry: Omit<CoffreEntry, 'id' | 'branchId'>) => void;
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
  };

  const fillDailyDeposit = () => {
    setKind('entree');
    setCategorie('Versement caisse');
    setCompte('especes');
    setMontant(String(Math.round(cashEnMainDuJour)));
  };

  const accountButtons = (current: CoffreAccountId, onPick: (id: CoffreAccountId) => void, exclude?: CoffreAccountId) => (
    <div className="grid grid-cols-3 gap-1.5">
      {COFFRE_ACCOUNTS.filter((a) => a.id !== exclude).map((a) => (
        <button
          key={a.id}
          onClick={() => onPick(a.id)}
          className={
            'border-2 px-2 py-2 text-[10px] uppercase tracking-[0.12em] ' +
            (current === a.id
              ? 'border-[#16181A] bg-[#16181A] text-white'
              : 'border-[#16181A] bg-white hover:bg-[#ECE7DC]')
          }
        >
          {a.label}
        </button>
      ))}
    </div>
  );

  const labelCls = 'mb-1.5 text-[10px] uppercase tracking-[0.16em] text-[#4B5560]';
  const fieldCls = 'w-full border-2 border-[#16181A] bg-white px-3 py-2 text-sm outline-none focus:border-[#C1440E]';

  return (
    <div className="border-2 border-[#16181A] bg-white shadow-[8px_8px_0_#C1440E]">
      <div className="border-b-2 border-[#16181A] bg-[#ECE7DC] px-4 py-3 text-[11px] uppercase tracking-[0.18em]">
        Nouveau mouvement
      </div>
      <div className="space-y-3.5 p-4">
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(COFFRE_KIND_META) as CoffreKind[]).map((k) => {
            const Icon = COFFRE_KIND_META[k].icon;
            return (
              <button
                key={k}
                onClick={() => pickKind(k)}
                className={
                  'flex items-center justify-center gap-1.5 border-2 px-2 py-2.5 text-[10px] uppercase tracking-[0.12em] ' +
                  (kind === k
                    ? k === 'entree'
                      ? 'border-[#2F6B4F] bg-[#2F6B4F] text-white'
                      : k === 'sortie'
                        ? 'border-[#C1440E] bg-[#C1440E] text-white'
                        : 'border-[#16181A] bg-[#16181A] text-white'
                    : 'border-[#16181A] bg-white hover:bg-[#ECE7DC]')
                }
              >
                <Icon size={13} /> {COFFRE_KIND_META[k].label}
              </button>
            );
          })}
        </div>

        {kind === 'entree' && cashEnMainDuJour > 0 && (
          <button
            onClick={fillDailyDeposit}
            className="w-full border-2 border-dashed border-[#2F6B4F] bg-[#E9F5EF] px-3 py-2 text-left text-[10px] uppercase tracking-[0.12em] text-[#2F6B4F] hover:bg-[#dcefe5]"
          >
            Verser le cash en main du jour · {fmtHTG(cashEnMainDuJour)}
          </button>
        )}

        {kind !== 'transfert' && (
          <div>
            <div className={labelCls}>Catégorie</div>
            <select value={categorie} onChange={(e) => setCategorie(e.target.value)} className={fieldCls}>
              {COFFRE_CATEGORIES[kind].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <div className={labelCls}>{kind === 'transfert' ? 'De' : 'Compte'}</div>
          {accountButtons(compte, pickSource)}
        </div>

        {kind === 'transfert' && (
          <div>
            <div className={labelCls}>Vers</div>
            {accountButtons(compteDest, setCompteDest, compte)}
          </div>
        )}

        <div>
          <div className={labelCls}>Montant (HTG)</div>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="0"
            className={fieldCls}
          />
          {insufficient && (
            <div className="mt-1.5 border-2 border-[#F2B705] bg-[#FFF6D6] px-2.5 py-1.5 text-[10px] uppercase tracking-[0.08em]">
              Solde {coffreAccountLabel(compte)} insuffisant : {fmtHTG(balances[compte])} disponible
            </div>
          )}
        </div>

        <div>
          <div className={labelCls}>Note (optionnel)</div>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Ex : facture fournisseur, transport…"
            className={fieldCls}
          />
        </div>

        <div>
          <div className={labelCls}>
            Pièce justificative <span className="text-[#C1440E]">(obligatoire)</span>
          </div>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onPickFile} />
          {piece ? (
            <div className="flex items-center gap-2.5 border-2 border-[#2F6B4F] bg-[#E9F5EF] p-2">
              {piece.type.startsWith('image/') ? (
                <img src={piece.dataUrl} alt="" className="h-12 w-12 shrink-0 border-2 border-[#16181A] bg-white object-cover" />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center border-2 border-[#16181A] bg-white">
                  <FileText size={20} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px]">{piece.nom}</div>
                <div className="font-mono text-[10px] text-[#4B5560]">{piece.ref}</div>
              </div>
              <button
                onClick={() => setPiece(null)}
                aria-label="Retirer la pièce"
                className="flex h-7 w-7 shrink-0 items-center justify-center border-2 border-[#16181A] bg-white hover:bg-[#ECE7DC]"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 border-2 border-dashed border-[#16181A] bg-[#FBFAF6] px-3 py-3 text-[10px] uppercase tracking-[0.14em] hover:bg-[#ECE7DC]"
            >
              <Paperclip size={14} /> Joindre facture, reçu ou bordereau
            </button>
          )}
          {pieceError && (
            <div className="mt-1.5 border-2 border-[#C1440E] bg-[#FDECE4] px-2.5 py-1.5 text-[10px] uppercase tracking-[0.08em] text-[#C1440E]">
              {pieceError}
            </div>
          )}
          {amountOk && !piece && !pieceError && (
            <div className="mt-1.5 border-2 border-[#F2B705] bg-[#FFF6D6] px-2.5 py-1.5 text-[10px] uppercase tracking-[0.08em]">
              Ajoute la pièce justificative pour enregistrer
            </div>
          )}
        </div>

        <div className="text-[10px] uppercase tracking-[0.12em] text-[#4B5560]">
          Date : {date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>

        <button
          onClick={submit}
          disabled={!valid}
          className={
            'flex w-full items-center justify-center gap-2 border-2 px-4 py-2.5 text-[11px] uppercase tracking-[0.18em] ' +
            (valid
              ? 'border-[#C1440E] bg-[#C1440E] text-white hover:bg-[#a53a0b]'
              : 'cursor-not-allowed border-[#9CA3AF] bg-[#E5E7EB] text-[#6B7280]')
          }
        >
          <Plus size={14} /> Enregistrer
        </button>
      </div>
    </div>
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

  const tone = entry.kind === 'entree' ? 'text-[#2F6B4F]' : entry.kind === 'sortie' ? 'text-[#C1440E]' : '';
  const sign = entry.kind === 'entree' ? '+' : entry.kind === 'sortie' ? '−' : '⇄';
  const detail = (label: string, value: string, cls = '') => (
    <div className="border-b border-dashed border-[#4B5560]/40 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[#4B5560]">{label}</div>
      <div className={'mt-0.5 break-words text-[13px] ' + cls}>{value}</div>
    </div>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#16181A]/70 p-3 md:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Pièce justificative"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col border-2 border-[#16181A] bg-white shadow-[8px_8px_0_#C1440E]"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b-2 border-[#16181A] bg-[#16181A] px-4 py-3 text-[#FBFAF6]">
          <div className="flex min-w-0 items-center gap-2 text-[11px] uppercase tracking-[0.18em]">
            <Paperclip size={14} />
            <span className="truncate">Pièce justificative · {piece.ref}</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-7 w-7 shrink-0 items-center justify-center border-2 border-[#FBFAF6] hover:bg-[#FBFAF6] hover:text-[#16181A]"
          >
            <X size={14} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[1fr_300px] lg:overflow-hidden">
          <div className="flex min-h-[280px] items-start justify-center overflow-auto bg-[#ECE7DC] p-3 lg:max-h-[78vh]">
            {isPdf ? (
              pdfUrl ? (
                <iframe title={piece.nom} src={pdfUrl} className="h-[70vh] w-full border-2 border-[#16181A] bg-white" />
              ) : (
                <div className="p-8 text-sm text-[#4B5560]">Aperçu PDF indisponible. Utilise Télécharger.</div>
              )
            ) : (
              <img src={imgSrc} alt={piece.nom} className="max-w-full border-2 border-[#16181A] bg-white" />
            )}
          </div>

          <div className="flex flex-col border-t-2 border-[#16181A] p-4 lg:border-l-2 lg:border-t-0 lg:overflow-y-auto">
            {detail('Type', COFFRE_KIND_META[entry.kind].label)}
            {detail('Catégorie', entry.categorie)}
            {detail(
              'Compte',
              coffreAccountLabel(entry.compte) + (entry.compteDest ? ' → ' + coffreAccountLabel(entry.compteDest) : '')
            )}
            {detail('Montant', `${sign} ${fmtHTG(entry.montant)}`, 'font-mono font-bold ' + tone)}
            {detail(
              'Date',
              entry.date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) + ' · ' + fmtTime12(entry.date)
            )}
            {entry.note && detail('Note', entry.note)}
            {detail('Fichier', piece.nom, 'font-mono text-[12px]')}

            <div className="mt-4 grid gap-2">
              <button
                onClick={() => downloadPiece(entry)}
                className="flex items-center justify-center gap-2 border-2 border-[#C1440E] bg-[#C1440E] px-4 py-2.5 text-[11px] uppercase tracking-[0.16em] text-white hover:bg-[#a53a0b]"
              >
                <Download size={14} /> Télécharger
              </button>
              <input ref={replaceRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onPick} />
              <button
                onClick={() => replaceRef.current?.click()}
                className="flex items-center justify-center gap-2 border-2 border-[#16181A] bg-white px-4 py-2.5 text-[11px] uppercase tracking-[0.16em] hover:bg-[#ECE7DC]"
              >
                <Paperclip size={14} /> Remplacer la pièce
              </button>
              {error && (
                <div className="border-2 border-[#C1440E] bg-[#FDECE4] px-2.5 py-1.5 text-[10px] uppercase tracking-[0.08em] text-[#C1440E]">
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
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

  const chip = (active: boolean) =>
    'border-2 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] ' +
    (active ? 'border-[#16181A] bg-[#16181A] text-white' : 'border-[#16181A] bg-white hover:bg-[#ECE7DC]');

  const breakdownBlock = (title: string, list: Array<{ label: string; total: number }>, tone: string, bar: string) => {
    const max = Math.max(...list.map((l) => l.total), 1);
    return (
      <div>
        <div className={'mb-2 text-[10px] font-bold uppercase tracking-[0.2em] ' + tone}>{title}</div>
        {list.length === 0 ? (
          <div className="text-[11px] text-[#4B5560]">Aucun mouvement.</div>
        ) : (
          <div className="space-y-2.5">
            {list.map((l) => (
              <div key={l.label}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px] uppercase tracking-[0.08em]">
                  <span className="truncate">{l.label}</span>
                  <span className="shrink-0 font-mono tabular-nums">{fmtHTG(l.total)}</span>
                </div>
                <div className="h-2.5 border-2 border-[#16181A] bg-[#FBFAF6]">
                  <div className={'h-full ' + bar} style={{ width: `${(l.total / max) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <input ref={attachInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onAttachFile} />
      {attachError && (
        <div className="border-2 border-[#C1440E] bg-[#FDECE4] px-3 py-2 text-[11px] uppercase tracking-[0.08em] text-[#C1440E]">
          {attachError}
        </div>
      )}
      {viewingEntry && viewingEntry.piece && (
        <PieceViewer
          entry={viewingEntry}
          onClose={() => setViewingId(null)}
          onReplace={(piece) => onSetPiece(viewingEntry.id, piece)}
        />
      )}

      {/* Title bar */}
      <div className="flex flex-wrap items-end justify-between gap-2 border-b-2 border-[#16181A] pb-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-[#4B5560]">Coffre · {branch.nom}</div>
          <h2 className="font-serif text-2xl">Entrées et sorties d'argent</h2>
        </div>
        <div className="text-[11px] uppercase tracking-[0.14em] text-[#4B5560]">{entries.length} mouvement(s) au total</div>
      </div>

      {/* Balances */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div
          className={
            'col-span-2 border-2 p-4 shadow-[4px_4px_0_#2F6B4F] lg:col-span-1 ' +
            (totalBalance < 0 ? 'border-[#C1440E] bg-[#FDECE4]' : 'border-[#2F6B4F] bg-[#E9F5EF]')
          }
        >
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-[#2F6B4F]">
            <Vault size={13} /> Solde du coffre
          </div>
          <div className={'mt-1.5 font-serif text-2xl tabular-nums ' + (totalBalance < 0 ? 'text-[#C1440E]' : 'text-[#2F6B4F]')}>
            {fmtHTG(totalBalance)}
          </div>
        </div>
        {COFFRE_ACCOUNTS.map((a) => {
          const Icon = a.icon;
          return (
            <div key={a.id} className="border-2 border-[#16181A] bg-white p-4 shadow-[4px_4px_0_#16181A]">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-[#4B5560]">
                <Icon size={13} /> {a.label}
              </div>
              <div className={'mt-1.5 font-serif text-xl tabular-nums xl:text-2xl ' + (balances[a.id] < 0 ? 'text-[#C1440E]' : '')}>
                {fmtHTG(balances[a.id])}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* Ledger */}
        <div className="border-2 border-[#16181A] bg-white xl:col-span-2">
          <div className="space-y-3 border-b-2 border-[#16181A] bg-[#ECE7DC] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] uppercase tracking-[0.18em]">Journal · {periodLabel}</div>
              <div className="flex flex-wrap gap-1.5">
                {COFFRE_PERIODS.map((p) => (
                  <button key={p.id} onClick={() => setPeriod(p.id)} className={chip(period === p.id)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setKindFilter('all')} className={chip(kindFilter === 'all')}>Tous</button>
                {(Object.keys(COFFRE_KIND_META) as CoffreKind[]).map((k) => (
                  <button key={k} onClick={() => setKindFilter(k)} className={chip(kindFilter === k)}>
                    {COFFRE_KIND_META[k].plural}
                  </button>
                ))}
              </div>
              <select
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value as 'all' | CoffreAccountId)}
                className="border-2 border-[#16181A] bg-white px-2 py-1.5 text-[10px] uppercase tracking-[0.12em] outline-none"
              >
                <option value="all">Tous les comptes</option>
                {COFFRE_ACCOUNTS.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
              <div className="relative min-w-[140px] flex-1">
                <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#4B5560]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Rechercher…"
                  className="w-full border-2 border-[#16181A] bg-white py-1.5 pl-8 pr-2 text-[12px] outline-none focus:border-[#C1440E]"
                />
              </div>
            </div>
          </div>

          {/* Period totals */}
          <div className="grid grid-cols-3 divide-x-2 divide-[#16181A] border-b-2 border-[#16181A]">
            <div className="p-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#4B5560]">Entrées</div>
              <div className="font-mono text-sm tabular-nums text-[#2F6B4F] md:text-base">+ {fmtHTG(totalIn)}</div>
            </div>
            <div className="p-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#4B5560]">Sorties</div>
              <div className="font-mono text-sm tabular-nums text-[#C1440E] md:text-base">− {fmtHTG(totalOut)}</div>
            </div>
            <div className="p-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#4B5560]">Net</div>
              <div className={'font-mono text-sm tabular-nums md:text-base ' + (totalIn - totalOut < 0 ? 'text-[#C1440E]' : '')}>
                {fmtHTG(totalIn - totalOut)}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[12px]">
              <thead>
                <tr className="border-b-2 border-[#16181A] text-left text-[10px] uppercase tracking-[0.12em] text-[#4B5560]">
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Catégorie / note</th>
                  <th className="px-3 py-2.5">Compte</th>
                  <th className="px-3 py-2.5">Pièce</th>
                  <th className="px-3 py-2.5 text-right">Montant</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-12 text-center text-sm text-[#4B5560]">
                      Aucun mouvement sur cette période.
                    </td>
                  </tr>
                )}
                {rows.map((e) => {
                  const Icon = COFFRE_KIND_META[e.kind].icon;
                  const tone =
                    e.kind === 'entree' ? 'text-[#2F6B4F]' : e.kind === 'sortie' ? 'text-[#C1440E]' : 'text-[#16181A]';
                  const sign = e.kind === 'entree' ? '+' : e.kind === 'sortie' ? '−' : '⇄';
                  const iconBtn =
                    'flex h-7 w-7 items-center justify-center border-2 border-[#16181A] bg-white hover:bg-[#ECE7DC]';
                  return (
                    <tr key={e.id} className="border-b border-[#16181A]/15 hover:bg-[#FBFAF6]">
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <div className="font-mono text-[11px]">{e.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</div>
                        <div className="font-mono text-[10px] text-[#4B5560]">{fmtTime12(e.date)}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={'inline-flex items-center gap-1.5 uppercase tracking-[0.08em] ' + tone}>
                          <Icon size={13} /> {COFFRE_KIND_META[e.kind].label}
                        </span>
                      </td>
                      <td className="max-w-[200px] px-3 py-2.5">
                        <div className="truncate">{e.categorie}</div>
                        {e.note && <div className="truncate text-[11px] text-[#4B5560]">{e.note}</div>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 uppercase tracking-[0.06em]">
                        {coffreAccountLabel(e.compte)}
                        {e.compteDest && <span className="text-[#4B5560]"> → {coffreAccountLabel(e.compteDest)}</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {e.piece ? (
                          <button
                            onClick={() => setViewingId(e.id)}
                            className="inline-flex items-center gap-1 font-mono text-[11px] underline decoration-dotted underline-offset-2 hover:text-[#C1440E]"
                          >
                            <Paperclip size={11} /> {e.piece.ref}
                          </button>
                        ) : (
                          <span className="border border-[#F2B705] bg-[#FFF6D6] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em]">
                            Sans pièce
                          </span>
                        )}
                      </td>
                      <td className={'whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums ' + tone}>
                        {sign} {fmtHTG(e.montant)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {e.piece ? (
                            <>
                              <button onClick={() => setViewingId(e.id)} title="Voir la pièce" aria-label="Voir la pièce" className={iconBtn}>
                                <Eye size={13} />
                              </button>
                              <button onClick={() => downloadPiece(e)} title="Télécharger la pièce" aria-label="Télécharger la pièce" className={iconBtn}>
                                <Download size={13} />
                              </button>
                            </>
                          ) : (
                            <button onClick={() => startAttach(e.id)} title="Joindre une pièce" aria-label="Joindre une pièce" className={iconBtn}>
                              <Paperclip size={13} />
                            </button>
                          )}
                          <button onClick={() => onDelete(e.id)} title="Supprimer" aria-label="Supprimer" className={iconBtn}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right column: form + breakdown */}
        <div className="space-y-5">
          <CoffreForm balances={balances} date={selectedDate} cashEnMainDuJour={cashEnMainDuJour} onAdd={onAdd} />

          <div className="border-2 border-[#16181A] bg-white">
            <div className="border-b-2 border-[#16181A] bg-[#ECE7DC] px-4 py-3 text-[11px] uppercase tracking-[0.18em]">
              Par catégorie · {periodLabel}
            </div>
            <div className="space-y-5 p-4">
              {breakdownBlock('Entrées', inBreakdown, 'text-[#2F6B4F]', 'bg-[#2F6B4F]')}
              {breakdownBlock('Sorties', outBreakdown, 'text-[#C1440E]', 'bg-[#C1440E]')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   PETITE CAISSE — fixed float for small daily expenses, replenished from the Coffre
   Solde théorique = réapprovisionnements − dépenses ; écart = comptage physique − théorique
   ========================================================================= */

function PettyForm({
  balance,
  fixedFloat,
  coffreEspeces,
  date,
  onAdd,
}: {
  balance: number;
  fixedFloat: number;
  coffreEspeces: number;
  date: Date;
  onAdd: (entry: Omit<PettyEntry, 'id' | 'branchId' | 'coffreId'>, fromCoffre: boolean) => void;
}) {
  const [kind, setKind] = useState<PettyKind>('depense');
  const [categorie, setCategorie] = useState<string>(PETTY_CATEGORIES[0]);
  const [montant, setMontant] = useState('');
  const [recu, setRecu] = useState('');
  const [note, setNote] = useState('');
  const [fromCoffre, setFromCoffre] = useState(true);

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
  };

  const labelCls = 'mb-1.5 text-[10px] uppercase tracking-[0.16em] text-[#4B5560]';
  const fieldCls = 'w-full border-2 border-[#16181A] bg-white px-3 py-2 text-sm outline-none focus:border-[#C1440E]';
  const warnCls = 'mt-1.5 border-2 border-[#F2B705] bg-[#FFF6D6] px-2.5 py-1.5 text-[10px] uppercase tracking-[0.08em]';

  return (
    <div className="border-2 border-[#16181A] bg-white shadow-[8px_8px_0_#C1440E]">
      <div className="border-b-2 border-[#16181A] bg-[#ECE7DC] px-4 py-3 text-[11px] uppercase tracking-[0.18em]">
        Nouveau mouvement
      </div>
      <div className="space-y-3.5 p-4">
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              { id: 'depense', label: 'Dépense', icon: ArrowUpRight, on: 'border-[#C1440E] bg-[#C1440E] text-white' },
              { id: 'reappro', label: 'Réapprovisionnement', icon: ArrowDownLeft, on: 'border-[#2F6B4F] bg-[#2F6B4F] text-white' },
            ] as const
          ).map((k) => {
            const Icon = k.icon;
            return (
              <button
                key={k.id}
                onClick={() => setKind(k.id)}
                className={
                  'flex items-center justify-center gap-1.5 border-2 px-2 py-2.5 text-[10px] uppercase tracking-[0.1em] ' +
                  (kind === k.id ? k.on : 'border-[#16181A] bg-white hover:bg-[#ECE7DC]')
                }
              >
                <Icon size={13} /> {k.label}
              </button>
            );
          })}
        </div>

        {kind === 'depense' ? (
          <div>
            <div className={labelCls}>Catégorie</div>
            <select value={categorie} onChange={(e) => setCategorie(e.target.value)} className={fieldCls}>
              {PETTY_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        ) : (
          missing > 0 && (
            <button
              onClick={() => setMontant(String(Math.round(missing)))}
              className="w-full border-2 border-dashed border-[#2F6B4F] bg-[#E9F5EF] px-3 py-2 text-left text-[10px] uppercase tracking-[0.12em] text-[#2F6B4F] hover:bg-[#dcefe5]"
            >
              Compléter jusqu'au fonds fixe · {fmtHTG(missing)}
            </button>
          )
        )}

        <div>
          <div className={labelCls}>Montant (HTG)</div>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="0"
            className={fieldCls}
          />
          {overBalance && (
            <div className={warnCls}>Dépasse le solde de la petite caisse ({fmtHTG(balance)} disponible)</div>
          )}
        </div>

        {kind === 'depense' && (
          <div>
            <div className={labelCls}>N° de reçu (optionnel)</div>
            <input
              type="text"
              value={recu}
              onChange={(e) => setRecu(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="Ex : R-1042"
              className={fieldCls}
            />
          </div>
        )}

        <div>
          <div className={labelCls}>{kind === 'depense' ? 'Motif / bénéficiaire' : 'Note'} (optionnel)</div>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={kind === 'depense' ? 'Ex : moto-taxi livraison' : 'Ex : complément de fin de semaine'}
            className={fieldCls}
          />
        </div>

        {kind === 'reappro' && (
          <label className="flex cursor-pointer items-start gap-2 border-2 border-[#16181A] bg-[#FBFAF6] px-3 py-2.5 text-[11px]">
            <input
              type="checkbox"
              checked={fromCoffre}
              onChange={(e) => setFromCoffre(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#C1440E]"
            />
            <span className="uppercase tracking-[0.08em]">
              Prélever sur le Coffre (Espèces)
              <span className="block normal-case tracking-normal text-[#4B5560]">
                Crée une sortie dans le Coffre · {fmtHTG(coffreEspeces)} disponible
              </span>
            </span>
          </label>
        )}
        {overCoffre && <div className={warnCls}>Espèces du Coffre insuffisantes pour ce montant</div>}

        <div className="text-[10px] uppercase tracking-[0.12em] text-[#4B5560]">
          Date : {date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>

        <button
          onClick={submit}
          disabled={!valid}
          className={
            'flex w-full items-center justify-center gap-2 border-2 px-4 py-2.5 text-[11px] uppercase tracking-[0.18em] ' +
            (valid
              ? 'border-[#C1440E] bg-[#C1440E] text-white hover:bg-[#a53a0b]'
              : 'cursor-not-allowed border-[#9CA3AF] bg-[#E5E7EB] text-[#6B7280]')
          }
        >
          <Plus size={14} /> Enregistrer
        </button>
      </div>
    </div>
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

  return (
    <div className="border-2 border-[#16181A] bg-white">
      <div className="border-b-2 border-[#16181A] bg-[#ECE7DC] px-4 py-3 text-[11px] uppercase tracking-[0.18em]">
        Comptage de la caisse
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-baseline justify-between text-[11px] uppercase tracking-[0.1em]">
          <span className="text-[#4B5560]">Solde théorique</span>
          <span className="font-mono text-sm tabular-nums">{fmtHTG(theorique)}</span>
        </div>
        <div>
          <div className="mb-1.5 text-[10px] uppercase tracking-[0.16em] text-[#4B5560]">Montant compté (HTG)</div>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={compte}
            onChange={(e) => setCompte(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="Argent réellement en caisse"
            className="w-full border-2 border-[#16181A] bg-white px-3 py-2 text-sm outline-none focus:border-[#C1440E]"
          />
        </div>
        {valid && (
          <div
            className={
              'border-2 px-3 py-2 text-[11px] uppercase tracking-[0.1em] ' +
              (ecart === 0
                ? 'border-[#2F6B4F] bg-[#E9F5EF] text-[#2F6B4F]'
                : ecart < 0
                  ? 'border-[#C1440E] bg-[#FDECE4] text-[#C1440E]'
                  : 'border-[#F2B705] bg-[#FFF6D6]')
            }
          >
            {ecart === 0
              ? 'Caisse juste'
              : ecart < 0
                ? `Manque ${fmtHTG(Math.abs(ecart))}`
                : `Excédent ${fmtHTG(ecart)}`}
          </div>
        )}
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="Note sur l'écart (optionnel)"
          className="w-full border-2 border-[#16181A] bg-white px-3 py-2 text-sm outline-none focus:border-[#C1440E]"
        />
        <button
          onClick={save}
          disabled={!valid}
          className={
            'flex w-full items-center justify-center gap-2 border-2 px-4 py-2.5 text-[11px] uppercase tracking-[0.18em] ' +
            (valid
              ? 'border-[#16181A] bg-[#16181A] text-white hover:bg-[#2a2e31]'
              : 'cursor-not-allowed border-[#9CA3AF] bg-[#E5E7EB] text-[#6B7280]')
          }
        >
          <Check size={14} /> Enregistrer le comptage
        </button>
      </div>
    </div>
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

  const chip = (active: boolean) =>
    'border-2 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] ' +
    (active ? 'border-[#16181A] bg-[#16181A] text-white' : 'border-[#16181A] bg-white hover:bg-[#ECE7DC]');

  const sortedCounts = useMemo(() => [...counts].sort((a, b) => b.date.getTime() - a.date.getTime()), [counts]);

  return (
    <div className="space-y-5">
      {/* Title bar */}
      <div className="flex flex-wrap items-end justify-between gap-2 border-b-2 border-[#16181A] pb-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-[#4B5560]">Petite caisse · {branch.nom}</div>
          <h2 className="font-serif text-2xl">Petites dépenses du quotidien</h2>
        </div>
        <div className="text-[11px] uppercase tracking-[0.14em] text-[#4B5560]">{entries.length} mouvement(s) au total</div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div
          className={
            'col-span-2 border-2 p-4 shadow-[4px_4px_0_#2F6B4F] lg:col-span-1 ' +
            (balance < 0 ? 'border-[#C1440E] bg-[#FDECE4]' : 'border-[#2F6B4F] bg-[#E9F5EF]')
          }
        >
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-[#2F6B4F]">
            <Coins size={13} /> Solde théorique
          </div>
          <div className={'mt-1.5 font-serif text-2xl tabular-nums ' + (balance < 0 ? 'text-[#C1440E]' : 'text-[#2F6B4F]')}>
            {fmtHTG(balance)}
          </div>
          <div className="mt-2 h-2 border-2 border-[#16181A] bg-white">
            <div
              className={'h-full ' + (ratio < 0.2 ? 'bg-[#C1440E]' : ratio < 0.5 ? 'bg-[#F2B705]' : 'bg-[#2F6B4F]')}
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
        </div>

        <div className="border-2 border-[#16181A] bg-white p-4 shadow-[4px_4px_0_#16181A]">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[#4B5560]">Fonds fixe</div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={fixedFloat}
              onChange={(e) => setFixedFloat(Math.max(Number(e.target.value) || 0, 0))}
              aria-label="Fonds fixe"
              className="w-full min-w-0 border-b-2 border-[#16181A] bg-transparent font-serif text-xl tabular-nums outline-none focus:border-[#C1440E] xl:text-2xl"
            />
            <span className="text-[10px] uppercase text-[#4B5560]">HTG</span>
          </div>
        </div>

        <div
          className={
            'border-2 p-4 shadow-[4px_4px_0_#16181A] ' +
            (missing > 0 ? 'border-[#C1440E] bg-white' : 'border-[#16181A] bg-white')
          }
        >
          <div className="text-[10px] uppercase tracking-[0.16em] text-[#4B5560]">À réapprovisionner</div>
          <div className={'mt-1.5 font-serif text-xl tabular-nums xl:text-2xl ' + (missing > 0 ? 'text-[#C1440E]' : 'text-[#2F6B4F]')}>
            {missing > 0 ? fmtHTG(missing) : 'Fonds complet'}
          </div>
        </div>

        <div className="border-2 border-[#16181A] bg-white p-4 shadow-[4px_4px_0_#16181A]">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[#4B5560]">Dépenses · {MONTHS_FR[month]}</div>
          <div className="mt-1.5 font-serif text-xl tabular-nums xl:text-2xl">{fmtHTG(spentThisMonth)}</div>
        </div>

        <div className="border-2 border-[#16181A] bg-white p-4 shadow-[4px_4px_0_#16181A]">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[#4B5560]">Dernier écart</div>
          {lastCount ? (
            <>
              <div
                className={
                  'mt-1.5 font-serif text-xl tabular-nums xl:text-2xl ' +
                  (lastCount.ecart === 0 ? 'text-[#2F6B4F]' : lastCount.ecart < 0 ? 'text-[#C1440E]' : '')
                }
              >
                {lastCount.ecart === 0 ? 'Aucun' : (lastCount.ecart > 0 ? '+ ' : '− ') + fmtHTG(Math.abs(lastCount.ecart))}
              </div>
              <div className="text-[10px] text-[#4B5560]">
                Comptage du {lastCount.date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
              </div>
            </>
          ) : (
            <div className="mt-1.5 font-serif text-xl text-[#4B5560]">—</div>
          )}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* Left: journal + counts history */}
        <div className="space-y-5 xl:col-span-2">
          <div className="border-2 border-[#16181A] bg-white">
            <div className="space-y-3 border-b-2 border-[#16181A] bg-[#ECE7DC] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] uppercase tracking-[0.18em]">Journal · {periodLabel}</div>
                <div className="flex flex-wrap gap-1.5">
                  {COFFRE_PERIODS.map((p) => (
                    <button key={p.id} onClick={() => setPeriod(p.id)} className={chip(period === p.id)}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => setKindFilter('all')} className={chip(kindFilter === 'all')}>Tous</button>
                  <button onClick={() => setKindFilter('depense')} className={chip(kindFilter === 'depense')}>Dépenses</button>
                  <button onClick={() => setKindFilter('reappro')} className={chip(kindFilter === 'reappro')}>Réappros</button>
                </div>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="border-2 border-[#16181A] bg-white px-2 py-1.5 text-[10px] uppercase tracking-[0.12em] outline-none"
                >
                  <option value="all">Toutes catégories</option>
                  {PETTY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <div className="relative min-w-[140px] flex-1">
                  <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#4B5560]" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Rechercher (motif, reçu)…"
                    className="w-full border-2 border-[#16181A] bg-white py-1.5 pl-8 pr-2 text-[12px] outline-none focus:border-[#C1440E]"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 divide-x-2 divide-[#16181A] border-b-2 border-[#16181A]">
              <div className="p-3">
                <div className="text-[10px] uppercase tracking-[0.14em] text-[#4B5560]">Réapprovisionnements</div>
                <div className="font-mono text-sm tabular-nums text-[#2F6B4F] md:text-base">+ {fmtHTG(totalReappro)}</div>
              </div>
              <div className="p-3">
                <div className="text-[10px] uppercase tracking-[0.14em] text-[#4B5560]">Dépenses</div>
                <div className="font-mono text-sm tabular-nums text-[#C1440E] md:text-base">− {fmtHTG(totalDepenses)}</div>
              </div>
              <div className="p-3">
                <div className="text-[10px] uppercase tracking-[0.14em] text-[#4B5560]">Sans reçu</div>
                <div className={'font-mono text-sm tabular-nums md:text-base ' + (sansRecu > 0 ? 'text-[#C1440E]' : '')}>
                  {sansRecu} dépense(s)
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-[12px]">
                <thead>
                  <tr className="border-b-2 border-[#16181A] text-left text-[10px] uppercase tracking-[0.12em] text-[#4B5560]">
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5">Catégorie</th>
                    <th className="px-3 py-2.5">Motif</th>
                    <th className="px-3 py-2.5">Reçu</th>
                    <th className="px-3 py-2.5 text-right">Montant</th>
                    <th className="w-10 px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-12 text-center text-sm text-[#4B5560]">
                        Aucun mouvement sur cette période.
                      </td>
                    </tr>
                  )}
                  {rows.map((e) => {
                    const isIn = e.kind === 'reappro';
                    const Icon = isIn ? ArrowDownLeft : ArrowUpRight;
                    const tone = isIn ? 'text-[#2F6B4F]' : 'text-[#C1440E]';
                    return (
                      <tr key={e.id} className="border-b border-[#16181A]/15 hover:bg-[#FBFAF6]">
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <div className="font-mono text-[11px]">{e.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</div>
                          <div className="font-mono text-[10px] text-[#4B5560]">{fmtTime12(e.date)}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={'inline-flex items-center gap-1.5 uppercase tracking-[0.08em] ' + tone}>
                            <Icon size={13} /> {isIn ? 'Réappro' : 'Dépense'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {e.categorie}
                          {e.coffreId && (
                            <span className="ml-1.5 border border-[#16181A] px-1 py-px text-[9px] uppercase tracking-[0.08em]">Coffre</span>
                          )}
                        </td>
                        <td className="max-w-[170px] truncate px-3 py-2.5 text-[#4B5560]">{e.note ?? '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px]">
                          {e.kind === 'depense' ? (
                            e.recu ?? (
                              <span className="border border-[#F2B705] bg-[#FFF6D6] px-1.5 py-0.5 font-sans text-[9px] uppercase tracking-[0.08em]">
                                Sans reçu
                              </span>
                            )
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className={'whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums ' + tone}>
                          {isIn ? '+' : '−'} {fmtHTG(e.montant)}
                        </td>
                        <td className="px-3 py-2.5">
                          <button
                            onClick={() => onDelete(e.id)}
                            aria-label="Supprimer"
                            className="flex h-7 w-7 items-center justify-center border-2 border-[#16181A] bg-white hover:bg-[#ECE7DC]"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-2 border-[#16181A] bg-white">
            <div className="flex items-center justify-between border-b-2 border-[#16181A] bg-[#ECE7DC] px-4 py-3 text-[11px] uppercase tracking-[0.18em]">
              <span>Historique des comptages</span>
              <span className="text-[#4B5560]">{sortedCounts.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[12px]">
                <thead>
                  <tr className="border-b-2 border-[#16181A] text-left text-[10px] uppercase tracking-[0.12em] text-[#4B5560]">
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5 text-right">Théorique</th>
                    <th className="px-3 py-2.5 text-right">Compté</th>
                    <th className="px-3 py-2.5 text-right">Écart</th>
                    <th className="px-3 py-2.5">Note</th>
                    <th className="w-10 px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {sortedCounts.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-sm text-[#4B5560]">
                        Aucun comptage enregistré.
                      </td>
                    </tr>
                  )}
                  {sortedCounts.slice(0, 12).map((c) => (
                    <tr key={c.id} className="border-b border-[#16181A]/15 hover:bg-[#FBFAF6]">
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px]">
                        {c.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} · {fmtTime12(c.date)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtHTG(c.theorique)}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtHTG(c.compte)}</td>
                      <td
                        className={
                          'px-3 py-2.5 text-right font-mono tabular-nums ' +
                          (c.ecart === 0 ? 'text-[#2F6B4F]' : c.ecart < 0 ? 'text-[#C1440E]' : '')
                        }
                      >
                        {c.ecart === 0 ? '0' : (c.ecart > 0 ? '+ ' : '− ') + fmtHTG(Math.abs(c.ecart))}
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2.5 text-[#4B5560]">{c.note ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => onDeleteCount(c.id)}
                          aria-label="Supprimer"
                          className="flex h-7 w-7 items-center justify-center border-2 border-[#16181A] bg-white hover:bg-[#ECE7DC]"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: form + count + breakdown */}
        <div className="space-y-5">
          <PettyForm balance={balance} fixedFloat={fixedFloat} coffreEspeces={coffreEspeces} date={selectedDate} onAdd={onAdd} />

          <PettyCountPanel
            theorique={balance}
            onSave={(compte, note) =>
              onAddCount({ date: new Date(), theorique: balance, compte, ecart: compte - balance, note })
            }
          />

          <div className="border-2 border-[#16181A] bg-white">
            <div className="border-b-2 border-[#16181A] bg-[#ECE7DC] px-4 py-3 text-[11px] uppercase tracking-[0.18em]">
              Dépenses par catégorie · {periodLabel}
            </div>
            <div className="p-4">
              {breakdown.length === 0 ? (
                <div className="text-[11px] text-[#4B5560]">Aucune dépense.</div>
              ) : (
                <div className="space-y-2.5">
                  {breakdown.map((b) => (
                    <div key={b.label}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px] uppercase tracking-[0.08em]">
                        <span className="truncate">{b.label}</span>
                        <span className="shrink-0 font-mono tabular-nums">{fmtHTG(b.total)}</span>
                      </div>
                      <div className="h-2.5 border-2 border-[#16181A] bg-[#FBFAF6]">
                        <div className="h-full bg-[#C1440E]" style={{ width: `${(b.total / maxBreak) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
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
    <div className="border-2 border-[#16181A] bg-[#FBFAF6] p-3 shadow-[4px_4px_0_#2F6B4F] sm:p-5 sm:shadow-[8px_8px_0_#2F6B4F]">
      <h2 className="mb-4 font-serif text-2xl">Utilisateurs de la succursale</h2>
      {branchUsers.length === 0 ? (
        <div className="text-[13px] text-[#4B5560]">Aucun vendeur assigné à cette succursale.</div>
      ) : (
        <div className="space-y-3">
          {branchUsers.map((user) => (
            <div key={user.id} className="border-2 border-[#16181A] bg-white p-3">
              <div className="mb-3 flex items-center gap-3">
                <img src={user.profilePic} alt={user.name} className="h-10 w-10 border-2 border-[#16181A] object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{user.name}</div>
                  <div className="text-[11px] uppercase tracking-wide text-[#4B5560]">Vendeur</div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] uppercase tracking-wide text-[#4B5560]">Nom</label>
                <input
                  value={user.name}
                  onChange={(event) => onUpdateUser(user.id, { name: event.target.value })}
                  className="w-full border-2 border-[#16181A] bg-[#FBFAF6] px-2 py-2 text-sm outline-none focus:border-[#C1440E]"
                />

                <label className="block text-[11px] uppercase tracking-wide text-[#4B5560]">Mot de passe</label>
                <input
                  type="password"
                  value={user.password}
                  onChange={(event) => onUpdateUser(user.id, { password: event.target.value })}
                  className="w-full border-2 border-[#16181A] bg-[#FBFAF6] px-2 py-2 text-sm outline-none focus:border-[#C1440E]"
                />
              </div>
            </div>
          ))}
        </div>
      )}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md border-2 border-[#16181A] bg-[#FBFAF6]">
        <div className="flex items-center justify-between border-b-2 border-[#16181A] px-5 py-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-[#4B5560]">Accès propriétaire</div>
            <div className="mt-1 font-serif text-2xl">Panneau principal</div>
          </div>
          <button onClick={onClose} className="text-[#4B5560] hover:text-[#C1440E]" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-5">
          <div className="mb-3 text-[13px] text-[#4B5560]">
            Entrez le mot de passe du propriétaire pour accéder à l’ensemble du système.
          </div>
          <label className="mb-1 block text-[12px] uppercase tracking-wide text-[#4B5560]">
            Mot de passe propriétaire
          </label>
          <input
            type="password"
            value={passwordValue}
            onChange={(e) => setPasswordValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onConfirm()}
            placeholder="••••••••"
            autoFocus
            className="w-full border-2 border-[#16181A] bg-white px-3 py-2 text-sm outline-none focus:border-[#C1440E]"
          />

          {errorMessage && (
            <div className="mt-3 border-2 border-[#C1440E] bg-[#FDF1EC] px-3 py-2 text-[12px] text-[#C1440E]">
              {errorMessage}
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 border-2 border-[#16181A] bg-white py-2.5 text-[14px] hover:bg-[#ECE7DC]"
            >
              Annuler
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 border-2 border-[#16181A] bg-[#16181A] py-2.5 text-[14px] font-medium text-white hover:bg-[#2b2e31]"
            >
              Ouvrir
            </button>
          </div>
        </div>
      </div>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md border-2 border-[#16181A] bg-[#FBFAF6]">
        <div className="flex items-center justify-between border-b-2 border-[#16181A] px-5 py-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-[#4B5560]">Accès sécurisé</div>
            <div className="mt-1 font-serif text-2xl">{branch.nom}</div>
          </div>
          <button onClick={onClose} className="text-[#4B5560] hover:text-[#C1440E]" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-5">
          <div className="mb-3 text-[13px] text-[#4B5560]">
            Entrez le mot de passe pour accéder à cette succursale.
          </div>
          <label className="mb-1 block text-[12px] uppercase tracking-wide text-[#4B5560]">
            Mot de passe
          </label>
          <input
            type="password"
            value={passwordValue}
            onChange={(e) => setPasswordValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onConfirm()}
            placeholder="••••••••"
            autoFocus
            className="w-full border-2 border-[#16181A] bg-white px-3 py-2 text-sm outline-none focus:border-[#C1440E]"
          />

          {errorMessage && (
            <div className="mt-3 border-2 border-[#C1440E] bg-[#FDF1EC] px-3 py-2 text-[12px] text-[#C1440E]">
              {errorMessage}
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 border-2 border-[#16181A] bg-white py-2.5 text-[14px] hover:bg-[#ECE7DC]"
            >
              Annuler
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 border-2 border-[#16181A] bg-[#C1440E] py-2.5 text-[14px] font-medium text-white hover:bg-[#a83a0c]"
            >
              Ouvrir
            </button>
          </div>
        </div>
      </div>
    </div>
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
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <h2 className="mb-4 font-serif text-xl">Tableau de Bord</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="border-2 border-[#16181A] bg-[#FBFAF6] p-4">
          <div className="text-[12px] text-[#4B5560]">Ventes du jour</div>
          <div className="mt-1 font-serif text-2xl">{fmtHTG(totalAujourdhui)}</div>
        </div>
        <div className="border-2 border-[#16181A] bg-[#FBFAF6] p-4">
          <div className="text-[12px] text-[#4B5560]">Transactions aujourd'hui</div>
          <div className="mt-1 font-serif text-2xl">{nbVentesAujourdhui}</div>
        </div>
        <div className="border-2 border-[#C1440E] bg-[#FBFAF6] p-4">
          <div className="text-[12px] text-[#4B5560]">Articles en stock bas</div>
          <div className="mt-1 font-serif text-2xl text-[#C1440E]">{produitsStockBas.length}</div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="border-2 border-[#16181A] bg-[#FBFAF6] p-4">
          <div className="mb-3 flex items-center gap-2 text-[14px] font-medium">
            <AlertTriangle size={15} className="text-[#C1440E]" />
            Alerte Stock Bas
          </div>
          {produitsStockBas.length === 0 ? (
            <div className="text-[13px] text-[#4B5560]">Tous les stocks sont à un niveau sain.</div>
          ) : (
            <div className="space-y-1.5">
              {produitsStockBas.map((p) => (
                <div key={p.id} className="flex justify-between text-[13px]">
                  <span>{p.nom}</span>
                  <span className="text-[#C1440E]">{p.stockFermeture} {p.unite}{p.stockFermeture !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-2 border-[#16181A] bg-[#FBFAF6] p-4">
          <div className="mb-3 text-[14px] font-medium">Articles les Plus Vendus</div>
          {meilleuresVentes.length === 0 ? (
            <div className="text-[13px] text-[#4B5560]">Aucune vente enregistrée pour l'instant.</div>
          ) : (
            <div className="space-y-1.5">
              {meilleuresVentes.map(([nom, qte]) => (
                <div key={nom} className="flex justify-between text-[13px]">
                  <span>{nom}</span>
                  <span className="text-[#4B5560]">{qte} vendu{qte !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
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
  return <GestionMateriaux />;
}