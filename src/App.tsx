import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import './App.css';
import {
  ShoppingCart, Boxes, History, Gauge, AlertTriangle,
  Plus, Minus, Trash2, X, Search, Printer, ChevronRight, Banknote,
  Smartphone, FileClock, PackagePlus, Pencil, Check
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
  stock: number;
  seuil: number;
  unite: string;
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
  nom: string;
  qte: number;
  prix: number;
  sousTotal: number;
};

type PaymentMethodId = 'especes' | 'moncash' | 'natcash' | 'credit';

type SaleRecord = {
  id: string;
  date: Date;
  lignes: SaleLine[];
  total: number;
  paiement: PaymentMethodId | string;
  recu: number;
  monnaie: number;
};

type View = 'vente' | 'inventaire' | 'historique' | 'dashboard';

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
  recherche: string;
  setRecherche: Dispatch<SetStateAction<string>>;
  produits: Product[];
  ajouterAuPanier: (produit: Product) => void;
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
  finaliserVente: (paiement: string, montantRecu: number) => void;
};

type InventaireViewProps = {
  isReadOnly?: boolean;
  produits: Product[];
  recherche: string;
  setRecherche: Dispatch<SetStateAction<string>>;
  editStockId: string | null;
  editStockVal: string;
  setEditStockVal: Dispatch<SetStateAction<string>>;
  commencerEditStock: (produit: Product) => void;
  validerEditStock: (id: string) => void;
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
] as const;

const INITIAL_PRODUCTS: Product[] = [
  { id: 'p01', nom: 'Ciment Gris 50kg', categorie: 'Ciment & Béton', prix: 650, stock: 240, seuil: 50, unite: 'sac' },
  { id: 'p02', nom: 'Ciment Blanc 50kg', categorie: 'Ciment & Béton', prix: 950, stock: 38, seuil: 40, unite: 'sac' },
  { id: 'p03', nom: 'Sable de Rivière', categorie: 'Ciment & Béton', prix: 1200, stock: 60, seuil: 15, unite: 'brouette' },
  { id: 'p04', nom: 'Gravier 3/4', categorie: 'Ciment & Béton', prix: 1400, stock: 45, seuil: 15, unite: 'brouette' },
  { id: 'p05', nom: 'Fer 3/8" x 20p', categorie: 'Fer & Acier', prix: 425, stock: 310, seuil: 60, unite: 'barre' },
  { id: 'p06', nom: 'Fer 1/2" x 20p', categorie: 'Fer & Acier', prix: 610, stock: 22, seuil: 30, unite: 'barre' },
  { id: 'p07', nom: 'Fil de Ligature', categorie: 'Fer & Acier', prix: 185, stock: 90, seuil: 20, unite: 'rouleau' },
  { id: 'p08', nom: 'Bloc 4"', categorie: 'Blocs & Briques', prix: 68, stock: 1400, seuil: 200, unite: 'unité' },
  { id: 'p09', nom: 'Bloc 6"', categorie: 'Blocs & Briques', prix: 95, stock: 860, seuil: 200, unite: 'unité' },
  { id: 'p10', nom: 'Bloc 8"', categorie: 'Blocs & Briques', prix: 120, stock: 15, seuil: 100, unite: 'unité' },
  { id: 'p11', nom: 'Tuyau PVC 4" x 10p', categorie: 'Plomberie', prix: 780, stock: 54, seuil: 15, unite: 'tuyau' },
  { id: 'p12', nom: 'Tuyau PVC 1/2" x 10p', categorie: 'Plomberie', prix: 210, stock: 120, seuil: 25, unite: 'tuyau' },
  { id: 'p13', nom: 'Robinet Standard', categorie: 'Plomberie', prix: 540, stock: 33, seuil: 10, unite: 'unité' },
  { id: 'p14', nom: 'Peinture Latex Blanc 1gal', categorie: 'Peinture', prix: 1650, stock: 28, seuil: 10, unite: 'gallon' },
  { id: 'p15', nom: 'Peinture à Huile 1gal', categorie: 'Peinture', prix: 1950, stock: 8, seuil: 10, unite: 'gallon' },
  { id: 'p16', nom: 'Planche Sapin 1x12', categorie: 'Bois', prix: 495, stock: 76, seuil: 20, unite: 'planche' },
  { id: 'p17', nom: 'Chevron 2x4x12', categorie: 'Bois', prix: 610, stock: 40, seuil: 20, unite: 'pièce' },
  { id: 'p18', nom: 'Fil Électrique #12 (100p)', categorie: 'Électricité', prix: 3200, stock: 12, seuil: 5, unite: 'rouleau' },
  { id: 'p19', nom: 'Disjoncteur 20A', categorie: 'Électricité', prix: 385, stock: 47, seuil: 15, unite: 'unité' },
  { id: 'p20', nom: 'Truelle de Maçon', categorie: 'Outils', prix: 320, stock: 25, seuil: 8, unite: 'unité' },
  { id: 'p21', nom: 'Pelle Carrée', categorie: 'Outils', prix: 610, stock: 19, seuil: 8, unite: 'unité' },
];

const PAYMENT_METHODS: Array<{ id: PaymentMethodId; label: string; icon: typeof Banknote }> = [
  { id: 'especes', label: 'Espèces', icon: Banknote },
  { id: 'moncash', label: 'MonCash', icon: Smartphone },
  { id: 'natcash', label: 'NatCash', icon: Smartphone },
  { id: 'credit', label: 'Crédit Client', icon: FileClock },
];

const fmtHTG = (n: number) =>
  new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' HTG';

const NAV_ITEMS: Array<{ id: View; label: string; icon: typeof ShoppingCart }> = [
  { id: 'vente', label: 'Vente', icon: ShoppingCart },
  { id: 'inventaire', label: 'Inventaire', icon: Boxes },
  { id: 'historique', label: 'Historique', icon: History },
  { id: 'dashboard', label: 'Tableau de Bord', icon: Gauge },
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
    motDePasse: 'grosmorne2026',
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
    motDePasse: 'saintmarc2026',
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
    motDePasse: 'majuin2026',
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
    motDePasse: 'oreste2026',
  },
];

const OWNER_PASSWORD = 'tchileyowner2026';

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
    password: 'grosmorne2026',
    profilePic: 'https://ui-avatars.com/api/?name=Jean+A&background=16181A&color=fff&size=128',
    role: 'seller',
    branchId: 'gros-morne',
  },
  {
    id: 'seller-saint-marc',
    name: 'Michel R.',
    password: 'saintmarc2026',
    profilePic: 'https://ui-avatars.com/api/?name=Michel+R&background=4B5560&color=fff&size=128',
    role: 'seller',
    branchId: 'saint-marc',
  },
];

export default function GestionMateriaux() {
  const [view, setView] = useState<View>('vente');
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
  const [ventes, setVentes] = useState<SaleRecord[]>([]);
  const [checkoutOuvert, setCheckoutOuvert] = useState<boolean>(false);
  const [lastReceipt, setLastReceipt] = useState<SaleRecord | null>(null);
  const [invRecherche, setInvRecherche] = useState<string>('');
  const [editStockId, setEditStockId] = useState<string | null>(null);
  const [editStockVal, setEditStockVal] = useState<string>('');

  const produitsFiltres = useMemo(() => {
    return products.filter((p) => {
      const okCat = categorie === 'Tout' || p.categorie === categorie;
      const okRech = p.nom.toLowerCase().includes(recherche.toLowerCase());
      return okCat && okRech;
    });
  }, [products, categorie, recherche]);

  const lignesPanier = useMemo<CartLine[]>(() => {
    return cart.flatMap((item) => {
      const produit = products.find((p) => p.id === item.id);
      if (!produit) return [];
      return [{ ...item, produit, sousTotal: produit.prix * item.qte }];
    });
  }, [cart, products]);

  const totalPanier = lignesPanier.reduce((s, l) => s + l.sousTotal, 0);
  const nbArticlesPanier = cart.reduce((s, i) => s + i.qte, 0);

  const produitsStockBas = useMemo(
    () => products.filter((p) => p.stock <= p.seuil),
    [products]
  );

  const brancheActuelle = SUCURSALES.find((s) => s.id === selectedBranchId) ?? SUCURSALES[0];

  function ajouterAuPanier(produit: Product) {
    if (produit.stock <= 0) return;
    setCart((prev) => {
      const existe = prev.find((i) => i.id === produit.id);
      if (existe) {
        if (existe.qte >= produit.stock) return prev;
        return prev.map((i) => (i.id === produit.id ? { ...i, qte: i.qte + 1 } : i));
      }
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
          const max = produit ? produit.stock : nouvelleQte;
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

  function finaliserVente(paiement: string, montantRecu: number) {
    if (lignesPanier.length === 0) return;
    const recu = montantRecu != null ? montantRecu : totalPanier;
    const vente: SaleRecord = {
      id: 'V' + Date.now(),
      date: new Date(),
      lignes: lignesPanier.map((l) => ({
        nom: l.produit.nom,
        qte: l.qte,
        prix: l.produit.prix,
        sousTotal: l.sousTotal,
      })),
      total: totalPanier,
      paiement,
      recu,
      monnaie: paiement === 'especes' ? Math.max(recu - totalPanier, 0) : 0,
    };
    setVentes((prev) => [vente, ...prev]);
    setProducts((prev) =>
      prev.map((p) => {
        const ligne = cart.find((i) => i.id === p.id);
        return ligne ? { ...p, stock: p.stock - ligne.qte } : p;
      })
    );
    setLastReceipt(vente);
    setCart([]);
    setCheckoutOuvert(false);
    window.setTimeout(() => window.print(), 120);
  }

  function commencerEditStock(produit: Product) {
    setEditStockId(produit.id);
    setEditStockVal(String(produit.stock));
  }

  function validerEditStock(id: string) {
    const val = parseInt(editStockVal, 10);
    if (!Number.isNaN(val) && val >= 0) {
      setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, stock: val } : p)));
    }
    setEditStockId(null);
  }

  const inventaireFiltre = products.filter((p) =>
    p.nom.toLowerCase().includes(invRecherche.toLowerCase())
  );

  const venteAujourdhui = ventes.filter((v) => {
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
    ventes.forEach((v) =>
      v.lignes.forEach((l) => {
        compte[l.nom] = (compte[l.nom] || 0) + l.qte;
      })
    );
    return Object.entries(compte)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [ventes]);

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
      setAppRoute('sellerBoard');
      setIsReadOnly(true);
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
        onBackToBranches={() => {
          setOwnerAccess(false);
          setSelectedBranchId(null);
          goToRoute('user');
        }}
        onOpenBranch={(branchId) => {
          setSelectedBranchId(branchId);
          setAppRoute('sellerBoard');
          setOwnerAccess(false);
          setOwnerPasswordInput('');
          setOwnerPasswordError('');
          setIsReadOnly(true);
        }}
        branches={SUCURSALES}
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
    <div className="flex h-screen w-full bg-[#ECE7DC] text-[#16181A] font-sans overflow-hidden">
      <aside className="flex w-[220px] shrink-0 flex-col border-r-2 border-[#16181A] bg-[#16181A] text-[#ECE7DC]">
        <div className="border-b-2 border-[#3a3d40] px-5 py-5">
          <div className="text-[11px] tracking-wide text-[#8b929a]">Gestion de Magasin</div>
          <div className="mt-1 font-serif text-lg leading-tight text-[#ECE7DC]">
            Matériaux<br />de Construction
          </div>
          <button
            onClick={() => setSelectedBranchId(null)}
            className="mt-3 w-full border-2 border-[#3a3d40] bg-[#1f2225] px-2 py-1.5 text-left text-[11px] uppercase tracking-wide text-[#ECE7DC] hover:border-[#C1440E]"
          >
            ← Changer de succursale
          </button>
        </div>

        <nav className="flex-1 px-2 py-4">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const actif = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={
                  'mb-1 flex w-full items-center gap-3 border-2 px-3 py-2.5 text-left text-sm transition-colors ' +
                  (actif
                    ? 'border-[#C1440E] bg-[#C1440E] text-white'
                    : 'border-transparent text-[#c7ccd1] hover:border-[#3a3d40] hover:bg-[#1f2225]')
                }
              >
                <Icon size={17} strokeWidth={2} />
                <span>{item.label}</span>
                {item.id === 'vente' && nbArticlesPanier > 0 && (
                  <span className="ml-auto border-2 border-current px-1.5 text-[11px]">
                    {nbArticlesPanier}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {produitsStockBas.length > 0 && (
          <div className="border-t-2 border-[#3a3d40] px-4 py-4">
            <div className="flex items-center gap-2 text-[#F2B705]">
              <AlertTriangle size={15} />
              <span className="text-[12px]">
                {produitsStockBas.length} article{produitsStockBas.length > 1 ? 's' : ''} en stock bas
              </span>
            </div>
          </div>
        )}
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b-2 border-[#16181A] bg-[#FBFAF6] px-6 py-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[#4B5560]">Succursale active</div>
            <div className="font-serif text-xl">{brancheActuelle.nom}</div>
          </div>
          <div className="rounded-none border-2 border-[#16181A] bg-[#ECE7DC] px-3 py-1.5 text-sm">
            {brancheActuelle.ville}
          </div>
        </header>

        {view === 'vente' && (
          <VenteView
            isReadOnly={isReadOnly}
            categorie={categorie}
            setCategorie={setCategorie}
            recherche={recherche}
            setRecherche={setRecherche}
            produits={produitsFiltres}
            ajouterAuPanier={ajouterAuPanier}
            lignesPanier={lignesPanier}
            changerQte={changerQte}
            retirerDuPanier={retirerDuPanier}
            viderPanier={viderPanier}
            totalPanier={totalPanier}
            ouvrirCheckout={() => setCheckoutOuvert(true)}
          />
        )}

        {view === 'inventaire' && (
          <InventaireView
            isReadOnly={isReadOnly}
            produits={inventaireFiltre}
            recherche={invRecherche}
            setRecherche={setInvRecherche}
            editStockId={editStockId}
            editStockVal={editStockVal}
            setEditStockVal={setEditStockVal}
            commencerEditStock={commencerEditStock}
            validerEditStock={validerEditStock}
          />
        )}

        {view === 'historique' && <HistoriqueView ventes={ventes} />}

        {view === 'dashboard' && (
          <DashboardView
            totalAujourdhui={totalAujourdhui}
            nbVentesAujourdhui={venteAujourdhui.length}
            produitsStockBas={produitsStockBas}
            meilleuresVentes={meilleuresVentes}
          />
        )}
      </main>

      {checkoutOuvert && (
        <CheckoutModal
          lignesPanier={lignesPanier}
          totalPanier={totalPanier}
          fermer={() => setCheckoutOuvert(false)}
          finaliserVente={finaliserVente}
        />
      )}

      {lastReceipt && (
        <div className="receipt-print fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-md border-2 border-[#16181A] bg-white p-4 shadow-[8px_8px_0_#16181A]">
            <div className="flex items-start justify-between border-b-2 border-[#16181A] pb-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#4B5560]">Ticket de vente</div>
                <div className="mt-1 font-serif text-[26px] leading-none text-[#16181A]">Tchiley</div>
              </div>
              <button
                onClick={() => setLastReceipt(null)}
                className="print-close mt-1 text-[#4B5560] hover:text-[#C1440E]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-1 text-[12px] text-[#4B5560]">
              <div className="flex justify-between">
                <span>Réf.</span>
                <span className="font-semibold text-[#16181A]">{lastReceipt.id}</span>
              </div>
              <div className="flex justify-between">
                <span>Date</span>
                <span>{lastReceipt.date.toLocaleString('fr-HT')}</span>
              </div>
              <div className="flex justify-between">
                <span>Paiement</span>
                <span>{PAYMENT_METHODS.find((m) => m.id === lastReceipt.paiement)?.label || lastReceipt.paiement}</span>
              </div>
            </div>

            <div className="mt-5 border-t-2 border-b-2 border-[#16181A] py-3">
              <div className="mb-2 flex justify-between text-[11px] uppercase tracking-[0.18em] text-[#4B5560]">
                <span>Article</span>
                <span>Montant</span>
              </div>

              {lastReceipt.lignes.map((ligne, index) => (
                <div key={`${lastReceipt.id}-${index}`} className="mb-2 space-y-1 text-[13px]">
                  <div className="flex justify-between gap-3">
                    <span className="pr-2">{ligne.qte} × {ligne.nom}</span>
                    <span>{fmtHTG(ligne.sousTotal)}</span>
                  </div>
                  <div className="text-right text-[11px] text-[#4B5560]">
                    {fmtHTG(ligne.prix)} / unité
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-[#4B5560]">Sous-total</span>
                <span>{fmtHTG(lastReceipt.total)}</span>
              </div>
              <div className="flex justify-between border-t border-[#c7c2b4] pt-2">
                <span className="text-[#4B5560]">Reçu</span>
                <span>{fmtHTG(lastReceipt.recu)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#4B5560]">Monnaie</span>
                <span className="font-medium text-[#2F6B4F]">{fmtHTG(lastReceipt.monnaie)}</span>
              </div>
              <div className="flex justify-between border-t-2 border-[#16181A] pt-3 font-serif text-[22px]">
                <span>Total</span>
                <span>{fmtHTG(lastReceipt.total)}</span>
              </div>
            </div>

            <div className="print-actions mt-5 flex gap-2">
              <button
                onClick={() => setLastReceipt(null)}
                className="flex-1 border-2 border-[#16181A] bg-white py-2.5 text-[14px] hover:bg-[#ECE7DC]"
              >
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
        </div>
      )}
    </div>
  );
}

function OwnerBoard({
  users,
  setUsers,
  onBackToBranches,
  onOpenBranch,
  branches,
}: {
  users: User[];
  setUsers: Dispatch<SetStateAction<User[]>>;
  onBackToBranches: () => void;
  onOpenBranch: (branchId: string) => void;
  branches: Branch[];
}) {
  const emptyForm = {
    id: '',
    name: '',
    password: '',
    profilePic: '',
    role: 'seller' as UserRole,
    branchId: branches[0]?.id ?? '',
  };

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  const resetForm = (nextMessage = '') => {
    setForm(emptyForm);
    setEditingId(null);
    setStatusMessage(nextMessage);
  };

  const resetFormAction = () => {
    resetForm();
  };

  const handleChange = (field: keyof typeof emptyForm, value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: field === 'role' ? (value as UserRole) : value,
    }));
  };

  const handleSubmit = () => {
    const trimmedName = form.name.trim();
    const trimmedPassword = form.password.trim();

    if (!trimmedName || !trimmedPassword) {
      setStatusMessage('Le nom et le mot de passe sont obligatoires.');
      return;
    }

    if (form.role === 'seller' && !form.branchId) {
      setStatusMessage('Une succursale est requise pour un vendeur.');
      return;
    }

    const nextUser: User = {
      id: editingId ?? `user-${Date.now()}`,
      name: trimmedName,
      password: trimmedPassword,
      profilePic: form.profilePic.trim() || `https://ui-avatars.com/api/?name=${encodeURIComponent(trimmedName)}&background=C1440E&color=fff&size=128`,
      role: form.role,
      branchId: form.role === 'owner' ? null : form.branchId,
    };

    setUsers((prev) => {
      if (editingId) {
        return prev.map((u) => (u.id === editingId ? nextUser : u));
      }
      return [nextUser, ...prev];
    });

    resetForm(editingId ? 'Utilisateur modifié avec succès.' : 'Utilisateur créé avec succès.');
  };

  const handleEdit = (user: User) => {
    setEditingId(user.id);
    setForm({
      id: user.id,
      name: user.name,
      password: user.password,
      profilePic: user.profilePic,
      role: user.role,
      branchId: user.branchId ?? branches[0]?.id ?? '',
    });
    setStatusMessage('');
  };

  const handleDelete = (userId: string) => {
    setUsers((prev) => prev.filter((user) => user.id !== userId));
    if (editingId === userId) {
      resetForm();
    }
  };

  return (
    <div className="min-h-screen bg-[#ECE7DC] px-4 py-6 text-[#16181A]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-3 border-2 border-[#16181A] bg-[#FBFAF6] p-5 shadow-[8px_8px_0_#16181A] md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-[#4B5560]">Panneau administrateur</div>
            <h1 className="mt-2 font-serif text-4xl">Gestion des utilisateurs</h1>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onBackToBranches}
              className="border-2 border-[#16181A] bg-white px-4 py-2 text-[12px] uppercase tracking-[0.18em] hover:bg-[#ECE7DC]"
            >
              Retour à l’espace vendeur
            </button>
          </div>
        </div>

        <div className="mb-6 border-2 border-[#16181A] bg-[#FBFAF6] p-5 shadow-[8px_8px_0_#C1440E]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-3xl">Vue globale des succursales</h2>
            <span className="border-2 border-[#16181A] bg-[#ECE7DC] px-2 py-1 text-[11px] uppercase tracking-wide">
              {branches.length} succursales
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {branches.map((branch) => (
              <div key={branch.id} className="border-2 border-[#16181A] bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-[#4B5560]">{branch.ville}</div>
                    <div className="mt-1 font-serif text-[22px] leading-tight">{branch.nom}</div>
                  </div>
                  <span
                    className={
                      'border-2 px-2 py-0.5 text-[9px] uppercase tracking-wide ' +
                      (branch.statut === 'Ouvert'
                        ? 'border-[#2F6B4F] bg-[#E9F5EF] text-[#2F6B4F]'
                        : 'border-[#4B5560] bg-[#F3F4F6] text-[#4B5560]')
                    }
                  >
                    {branch.statut}
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-[12px] text-[#4B5560]">
                  <div className="flex justify-between">
                    <span>Gestionnaire</span>
                    <span className="font-medium text-[#16181A]">{branch.gestionnaire}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ventes du jour</span>
                    <span className="font-medium text-[#16181A]">{branch.ventesDuJour}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Alertes</span>
                    <span className="font-medium text-[#C1440E]">{branch.alertesStock}</span>
                  </div>
                </div>

                <button
                  onClick={() => onOpenBranch(branch.id)}
                  className="mt-4 w-full border-2 border-[#16181A] bg-[#16181A] px-3 py-2 text-[12px] uppercase tracking-[0.18em] text-white hover:bg-[#2b2e31]"
                >
                  Ouvrir la succursale
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <div className="border-2 border-[#16181A] bg-[#FBFAF6] p-5 shadow-[8px_8px_0_#C1440E]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-serif text-2xl">{editingId ? 'Modifier l’utilisateur' : 'Créer un utilisateur'}</h2>
              {editingId && (
                <button onClick={resetFormAction} className="text-[12px] uppercase tracking-wide text-[#4B5560] hover:text-[#C1440E]">
                  Annuler
                </button>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-[12px] uppercase tracking-wide text-[#4B5560]">Nom complet</label>
                <input
                  value={form.name}
                  onChange={(event) => handleChange('name', event.target.value)}
                  className="w-full border-2 border-[#16181A] bg-white px-3 py-2 text-sm outline-none focus:border-[#C1440E]"
                  placeholder="Ex: Jean Dupont"
                />
              </div>

              <div>
                <label className="mb-1 block text-[12px] uppercase tracking-wide text-[#4B5560]">Mot de passe</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => handleChange('password', event.target.value)}
                  className="w-full border-2 border-[#16181A] bg-white px-3 py-2 text-sm outline-none focus:border-[#C1440E]"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="mb-1 block text-[12px] uppercase tracking-wide text-[#4B5560]">URL photo de profil</label>
                <input
                  value={form.profilePic}
                  onChange={(event) => handleChange('profilePic', event.target.value)}
                  className="w-full border-2 border-[#16181A] bg-white px-3 py-2 text-sm outline-none focus:border-[#C1440E]"
                  placeholder="https://..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[12px] uppercase tracking-wide text-[#4B5560]">Rôle</label>
                  <select
                    value={form.role}
                    onChange={(event) => handleChange('role', event.target.value)}
                    className="w-full border-2 border-[#16181A] bg-white px-3 py-2 text-sm outline-none focus:border-[#C1440E]"
                  >
                    <option value="seller">Vendeur</option>
                    <option value="owner">Propriétaire</option>
                  </select>
                </div>

                {form.role === 'seller' && (
                  <div>
                    <label className="mb-1 block text-[12px] uppercase tracking-wide text-[#4B5560]">Succursale</label>
                    <select
                      value={form.branchId}
                      onChange={(event) => handleChange('branchId', event.target.value)}
                      className="w-full border-2 border-[#16181A] bg-white px-3 py-2 text-sm outline-none focus:border-[#C1440E]"
                    >
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>{branch.nom}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {statusMessage && (
                <div className="border-2 border-[#2F6B4F] bg-[#E9F5EF] px-3 py-2 text-[12px] text-[#2F6B4F]">
                  {statusMessage}
                </div>
              )}

              <button
                onClick={handleSubmit}
                className="w-full border-2 border-[#16181A] bg-[#16181A] px-4 py-3 text-[14px] font-medium text-white hover:bg-[#2b2e31]"
              >
                {editingId ? 'Enregistrer les modifications' : 'Créer l’utilisateur'}
              </button>
            </div>
          </div>

          <div className="border-2 border-[#16181A] bg-[#FBFAF6] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-serif text-2xl">Utilisateurs</h2>
              <span className="border-2 border-[#16181A] bg-[#ECE7DC] px-2 py-1 text-[11px] uppercase tracking-wide">
                {users.length} comptes
              </span>
            </div>

            <div className="space-y-3">
              {users.map((user) => (
                <div key={user.id} className="flex items-center gap-3 border-2 border-[#16181A] bg-white p-3">
                  <img
                    src={user.profilePic || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=C1440E&color=fff&size=128`}
                    alt={user.name}
                    className="h-12 w-12 rounded-none border-2 border-[#16181A] object-cover"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{user.name}</span>
                      <span className="border-2 border-[#16181A] bg-[#ECE7DC] px-1.5 text-[9px] uppercase tracking-wide">
                        {user.role}
                      </span>
                    </div>
                    <div className="mt-1 text-[12px] text-[#4B5560]">
                      {user.role === 'seller' ? `Succursale: ${SUCURSALES.find((branch) => branch.id === user.branchId)?.nom ?? 'Non assignée'}` : 'Accès complet propriétaire'}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(user)}
                      className="border-2 border-[#16181A] bg-white px-2 py-1.5 text-[11px] uppercase tracking-wide hover:bg-[#ECE7DC]"
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => handleDelete(user.id)}
                      className="border-2 border-[#C1440E] bg-[#FDF1EC] px-2 py-1.5 text-[11px] uppercase tracking-wide text-[#C1440E] hover:bg-[#f9d8cc]"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
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
    <div className="branch-page min-h-screen px-6 py-8 text-[#16181A]">
      <div className="mx-auto max-w-7xl">
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
  recherche,
  setRecherche,
  produits,
  ajouterAuPanier,
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
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4B5560]" />
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
          {CATEGORIES.map((c) => (
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

        <div className="grid flex-1 auto-rows-max grid-cols-2 gap-3 overflow-y-auto p-6 sm:grid-cols-3 xl:grid-cols-4">
          {produits.map((p) => {
            const stockBas = p.stock <= p.seuil;
            const epuise = p.stock <= 0;
            return (
              <button
                key={p.id}
                disabled={epuise || isReadOnly}
                onClick={() => ajouterAuPanier(p)}
                className={
                  'flex flex-col items-start border-2 border-[#16181A] bg-[#FBFAF6] p-3 text-left transition-colors ' +
                  (epuise || isReadOnly
                    ? 'cursor-not-allowed opacity-40'
                    : 'hover:border-[#C1440E] hover:bg-white active:bg-[#ECE7DC]')
                }
              >
                <div className="text-[10px] uppercase tracking-wide text-[#4B5560]">{p.categorie}</div>
                <div className="mt-1 text-[14px] font-medium leading-snug">{p.nom}</div>
                <div className="mt-2 font-serif text-[17px]">{fmtHTG(p.prix)}</div>
                <div className="mt-1 flex items-center gap-1 text-[11px]">
                  <span className={stockBas ? 'text-[#C1440E]' : 'text-[#4B5560]'}>
                    {p.stock} {p.unite}{p.stock !== 1 ? 's' : ''} en stock
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
              Le panier est vide.<br />Touchez un article pour l'ajouter.
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

function CheckoutModal({ lignesPanier, totalPanier, fermer, finaliserVente }: CheckoutModalProps) {
  const [paiement, setPaiement] = useState<PaymentMethodId>('especes');
  const [montantRecu, setMontantRecu] = useState<string>('');

  const recu = montantRecu === '' ? totalPanier : parseFloat(montantRecu) || 0;
  const monnaie = paiement === 'especes' ? Math.max(recu - totalPanier, 0) : 0;
  const insuffisant = paiement === 'especes' && recu < totalPanier;

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

        <div className="flex items-baseline justify-between px-5 py-4">
          <span className="text-[13px] text-[#4B5560]">Total à payer</span>
          <span className="font-serif text-2xl">{fmtHTG(totalPanier)}</span>
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
                  className={
                    'flex items-center gap-2 border-2 px-3 py-2 text-[13px] ' +
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
              placeholder={String(Math.round(totalPanier))}
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

        <div className="flex gap-2 border-t-2 border-[#16181A] px-5 py-4">
          <button
            onClick={fermer}
            className="flex-1 border-2 border-[#16181A] bg-white py-2.5 text-[14px] hover:bg-[#ECE7DC]"
          >
            Annuler
          </button>
          <button
            disabled={insuffisant}
            onClick={() => finaliserVente(paiement, paiement === 'especes' ? recu : totalPanier)}
            className={
              'flex flex-1 items-center justify-center gap-2 border-2 border-[#16181A] py-2.5 text-[14px] font-medium ' +
              (insuffisant
                ? 'cursor-not-allowed bg-[#d8d3c6] text-[#8b8f87]'
                : 'bg-[#2F6B4F] text-white hover:bg-[#255a40]')
            }
          >
            <Printer size={15} />
            Confirmer &amp; Imprimer
          </button>
        </div>
      </div>
    </div>
  );
}

function InventaireView({
  isReadOnly,
  produits,
  recherche,
  setRecherche,
  editStockId,
  editStockVal,
  setEditStockVal,
  commencerEditStock,
  validerEditStock,
}: InventaireViewProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b-2 border-[#16181A] bg-[#FBFAF6] px-6 py-4">
        <div className="relative max-w-sm flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4B5560]" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher dans l'inventaire…"
            className="w-full border-2 border-[#16181A] bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#C1440E]"
          />
        </div>
        <button className="ml-auto flex items-center gap-2 border-2 border-[#16181A] bg-[#16181A] px-3 py-2 text-[13px] text-white hover:bg-[#2b2e31]">
          <PackagePlus size={15} />
          Nouvel Article
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b-2 border-[#16181A] text-left text-[11px] uppercase tracking-wide text-[#4B5560]">
              <th className="py-2 pr-3 font-normal">Article</th>
              <th className="py-2 pr-3 font-normal">Catégorie</th>
              <th className="py-2 pr-3 font-normal">Prix</th>
              <th className="py-2 pr-3 font-normal">Stock</th>
              <th className="py-2 pr-3 font-normal">Seuil</th>
              <th className="py-2 pr-3 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {produits.map((p) => {
              const stockBas = p.stock <= p.seuil;
              const enEdition = editStockId === p.id;
              return (
                <tr key={p.id} className="border-b border-[#c7c2b4]">
                  <td className="py-2.5 pr-3 font-medium">{p.nom}</td>
                  <td className="py-2.5 pr-3 text-[#4B5560]">{p.categorie}</td>
                  <td className="py-2.5 pr-3">{fmtHTG(p.prix)}</td>
                  <td className="py-2.5 pr-3">
                    {enEdition ? (
                      <input
                        autoFocus
                        type="number"
                        value={editStockVal}
                        onChange={(e) => setEditStockVal(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && validerEditStock(p.id)}
                        className="w-20 border-2 border-[#C1440E] bg-white px-1.5 py-0.5 outline-none"
                      />
                    ) : (
                      <span className={stockBas ? 'flex items-center gap-1 text-[#C1440E]' : ''}>
                        {stockBas && <AlertTriangle size={12} />}
                        {p.stock} {p.unite}{p.stock !== 1 ? 's' : ''}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-[#4B5560]">{p.seuil}</td>
                  <td className="py-2.5 pr-3 text-right">
                    {enEdition ? (
                      <button onClick={() => validerEditStock(p.id)} className="text-[#2F6B4F] hover:text-[#16181A]">
                        <Check size={16} />
                      </button>
                    ) : (
                      <button onClick={() => isReadOnly ? null : commencerEditStock(p)} className="text-[#4B5560] hover:text-[#C1440E] disabled:opacity-50" disabled={isReadOnly}>
                        <Pencil size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HistoriqueView({ ventes }: { ventes: SaleRecord[] }) {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <h2 className="mb-4 font-serif text-xl">Historique des Ventes</h2>
      {ventes.length === 0 ? (
        <div className="border-2 border-dashed border-[#4B5560] px-6 py-12 text-center text-sm text-[#4B5560]">
          Aucune vente enregistrée pour l'instant.
        </div>
      ) : (
        <div className="space-y-3">
          {ventes.map((v) => (
            <div key={v.id} className="border-2 border-[#16181A] bg-[#FBFAF6] p-4">
              <div className="flex items-center justify-between">
                <div className="text-[13px] text-[#4B5560]">
                  {v.date.toLocaleDateString('fr-HT')} — {v.date.toLocaleTimeString('fr-HT', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="border-2 border-[#16181A] px-2 py-0.5 text-[11px] uppercase tracking-wide">
                  {PAYMENT_METHODS.find((m) => m.id === v.paiement)?.label || v.paiement}
                </div>
              </div>
              <div className="mt-2 space-y-0.5">
                {v.lignes.map((l, idx) => (
                  <div key={idx} className="flex justify-between text-[13px]">
                    <span>{l.qte} × {l.nom}</span>
                    <span>{fmtHTG(l.sousTotal)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between border-t border-[#c7c2b4] pt-2 font-serif text-[16px]">
                <span>Total</span>
                <span>{fmtHTG(v.total)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
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
                  <span className="text-[#C1440E]">{p.stock} {p.unite}{p.stock !== 1 ? 's' : ''}</span>
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
