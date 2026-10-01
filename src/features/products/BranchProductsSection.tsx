import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, ChevronDown, Clock, History, PackagePlus, Pencil, ListChecks, Plus, Printer, ScanLine, Search, ShoppingCart, Trash2, TrendingUp, X } from 'lucide-react';
import { M3_FOCUS } from '../../components/ui/focus';
import { M3Loading, M3StateLayer, M3_STATUS, M3_VARS } from '../../components/ui/theme';
import { CATEGORIES, categoryIcon } from './constants';
import { M3BarcodeField, M3SkuField, M3TextField, ProductNumberField, type ProductDraft } from './ProductFields';
import { BulkDeleteDialog, BulkDock, BulkEditDialog, SelectBox, SelectMark, type Snack } from './BulkActions';
import { generateSkus, plural } from './bulkOps';
import { BarcodeScannerDialog } from './BarcodeScannerDialog';
import { lookupProductByCode, normalizeCode } from './barcodeLookup';
import { generateInternalCode } from './barcodeGen';
import { LabelPrintDialog } from './LabelPrintDialog';
import { ProductHistoryDialog } from './ProductHistoryDialog';
import { KIND_LABEL, fmtPrice, stockDelta } from './history';
import type { Product, ProductHistoryEntry, ProductMovement } from './types';
import { fmtHTG } from '../../shared/currency';

type FocusFilter = 'all' | 'reorder' | 'dead' | 'top';

const FOCUS_OPTIONS: { id: FocusFilter; label: string }[] = [
  { id: 'all', label: 'Tout' },
  { id: 'reorder', label: 'À commander' },
  { id: 'dead', label: 'Inactif' },
  { id: 'top', label: 'Top ventes' },
];

/* Filter chip: selected = full pill + check, unselected = rounded square (shape morph). */
function FilterChip({ label, selected, onClick, size = 'md' }: { label: string; selected: boolean; onClick: () => void; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`group relative shrink-0 before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] ${M3_FOCUS}`}
    >
      <span
        className={`relative flex ${size === 'sm' ? 'h-8' : 'h-9'} items-center gap-2 overflow-hidden px-3.5 text-sm font-medium m3-morph ${
          selected
            ? 'rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
            : 'rounded-xl border border-[var(--m3-outline)] text-[var(--m3-on-surface-variant)]'
        }`}
      >
        <M3StateLayer />
        {selected && <Check size={16} aria-hidden="true" />}
        {label}
      </span>
    </button>
  );
}

/* What the open scanner is for: locate an existing product, or fill a code field. */
type ScanTarget = { kind: 'find' } | { kind: 'fill'; apply: (code: string) => void };

type ProductSortKey = 'nom' | 'vendu' | 'prix' | 'prixAchat' | 'stock' | 'seuil' | 'marge' | 'valeur';

export function BranchProductsSection({
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
  const [inventoryFocusFilter, setInventoryFocusFilter] = useState<FocusFilter>('all');
  const [stockAdjustment, setStockAdjustment] = useState({ delta: 0, reason: 'Inventaire' });
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  /* Label printing dialog: null = closed, otherwise the products ticked on open. */
  const [labelIds, setLabelIds] = useState<string[] | null>(null);
  /* Bulk selection: phones enter it from the header, desktop via the table checkboxes. */
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  /* Full history dialog: id of the product whose complete history is open. */
  const [historyDialogId, setHistoryDialogId] = useState<string | null>(null);
  const [snack, setSnack] = useState<Snack | null>(null);

  const productSummaries = useMemo(() => {
    const map: Record<string, { unitMargin: number; stockCost: number; stockSale: number; sales7: number; sales30: number; velocity: number; daysLeft: number | null }> = {};
    branchProducts.forEach((product) => {
      const history = productHistoryById[product.id] ?? [];
      const sales7 = history.filter((entry) => entry.kind === 'sale' && !entry.cancelled && entry.date.getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000).reduce((sum, entry) => sum + entry.qty, 0);
      const sales30 = history.filter((entry) => entry.kind === 'sale' && !entry.cancelled && entry.date.getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000).reduce((sum, entry) => sum + entry.qty, 0);
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
    const query = inventorySearch.trim().toLowerCase();
    const matchesSearch =
      product.nom.toLowerCase().includes(query) ||
      product.categorie.toLowerCase().includes(query) ||
      (product.codeBarres ?? '').toLowerCase().includes(query) ||
      (product.sku ?? '').toLowerCase().includes(query);
    return matchesCategory && matchesStatus && matchesFocus && matchesSearch;
  });

  /* Only visible (filtered) products count as selected, so a bulk action never touches hidden rows. */
  const selectedProducts = filteredProducts.filter((product) => selectedIds.has(product.id));
  const selectedCount = selectedProducts.length;
  const allVisibleSelected = filteredProducts.length > 0 && selectedCount === filteredProducts.length;

  const toggleSelected = (id: string, keepMode: boolean) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
    setSelectMode(keepMode || next.size > 0);
  };
  const toggleAllVisible = () => {
    if (allVisibleSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredProducts.map((product) => product.id)));
    setSelectMode(true);
  };
  const exitSelection = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };
  const enterSelection = () => {
    setExpandedId(null);
    setEditingId(null);
    setSelectMode(true);
  };

  /* Apply patches to several products at once, with a one-tap undo that restores the previous values. */
  const applyBulkPatches = (message: string, patches: { id: string; patch: Partial<Product> }[]) => {
    if (!patches.length) return;
    const byId = new Map(branchProducts.map((product) => [product.id, product]));
    const reverts = patches.map(({ id, patch }) => {
      const current = byId.get(id);
      const back: Record<string, unknown> = {};
      Object.keys(patch).forEach((key) => {
        back[key] = current?.[key as keyof Product];
      });
      return { id, patch: back as Partial<Product> };
    });
    patches.forEach(({ id, patch }) => onUpdateProduct(id, patch));
    setSnack({
      message,
      undo: () => {
        reverts.forEach(({ id, patch }) => onUpdateProduct(id, patch));
        setSnack({ message: 'Modification annulée' });
      },
    });
  };

  const needCodes = selectedProducts.filter((product) => !product.codeBarres?.trim()).length;
  const needSkus = selectedProducts.filter((product) => !product.sku?.trim()).length;

  const handleBulkBarcodes = () => {
    const targets = selectedProducts.filter((product) => !product.codeBarres?.trim());
    if (!targets.length) {
      setSnack({ message: 'Tous les produits sélectionnés ont déjà un code-barres.' });
      return;
    }
    const used = branchProducts.map((product) => product.codeBarres ?? '');
    const patches = targets.map((product) => {
      const code = generateInternalCode(used);
      used.push(code);
      return { id: product.id, patch: { codeBarres: code } };
    });
    applyBulkPatches(`${plural(patches.length, 'code-barres généré', 'codes-barres générés')}`, patches);
  };

  const handleBulkSkus = () => {
    const targets = selectedProducts.filter((product) => !product.sku?.trim());
    if (!targets.length) {
      setSnack({ message: 'Tous les produits sélectionnés ont déjà un SKU.' });
      return;
    }
    const generated = generateSkus(targets, branchProducts.map((product) => product.sku ?? ''));
    applyBulkPatches(`${plural(generated.length, 'SKU généré', 'SKU générés')}`, generated.map(({ id, sku }) => ({ id, patch: { sku } })));
  };

  const confirmBulkDelete = () => {
    const targets = selectedProducts;
    setBulkDeleteOpen(false);
    if (drawerId && targets.some((product) => product.id === drawerId)) setDrawerId(null);
    targets.forEach((product) => onDeleteProduct(product));
    exitSelection();
    setSnack({ message: `${plural(targets.length, 'produit supprimé', 'produits supprimés')}` });
  };

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
  const emptyDraft = (): ProductDraft => ({
    nom: '',
    categorie: presentCategories[0] && presentCategories[0] !== 'Tout' ? presentCategories[0] : 'Autre',
    prix: 0,
    prixAchat: 0,
    stockFermeture: 0,
    seuil: 5,
    unite: 'unité',
    codeBarres: '',
  });
  const [addProductDraft, setAddProductDraft] = useState<ProductDraft>(emptyDraft);
  const [addProductError, setAddProductError] = useState<string | null>(null);

  /* Barcode / QR scanning */
  const [scanTarget, setScanTarget] = useState<ScanTarget | null>(null);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [codeLookup, setCodeLookup] = useState<'idle' | 'loading' | 'found' | 'none'>('idle');
  const [scrollToId, setScrollToId] = useState<string | null>(null);
  const lookupAbort = useRef<AbortController | null>(null);

  const closeAddProduct = useCallback(() => {
    lookupAbort.current?.abort();
    setCodeLookup('idle');
    setAddProductOpen(false);
  }, []);

  useEffect(() => () => lookupAbort.current?.abort(), []);

  /* Desktop: sortable table + side sheet for editing. */
  const [sort, setSort] = useState<{ key: ProductSortKey; dir: 'asc' | 'desc' } | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [drawerFocus, setDrawerFocus] = useState<'restock' | null>(null);

  useEffect(() => {
    if (!drawerId || deleteTarget || scanTarget) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerId, deleteTarget, scanTarget]);

  useEffect(() => {
    if ((!addProductOpen && !deleteTarget && !unknownCode) || scanTarget) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (deleteTarget) setDeleteTarget(null);
      else if (unknownCode) setUnknownCode(null);
      else closeAddProduct();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addProductOpen, deleteTarget, unknownCode, scanTarget, closeAddProduct]);

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

  /* Next free internal (EAN-13, in-store range) code for products that have no factory barcode. */
  const newInternalCode = () => generateInternalCode(branchProducts.map((item) => item.codeBarres ?? ''));
  const applyGeneratedCodes = (assignments: { id: string; code: string }[]) =>
    assignments.forEach((assignment) => onUpdateProduct(assignment.id, { codeBarres: assignment.code }));
  const newSku = (product: Product) => generateSkus([{ id: product.id, categorie: product.categorie }], branchProducts.map((item) => item.sku ?? ''))[0].sku;
  const skuDuplicateMessage = (raw: string, exceptId: string) => {
    const key = raw.trim().toUpperCase();
    if (!key) return undefined;
    const match = branchProducts.find((item) => item.id !== exceptId && item.sku?.trim().toUpperCase() === key);
    return match ? `Déjà utilisé par « ${match.nom} ».` : undefined;
  };
  const productsWithoutCode = branchProducts.filter((item) => !item.codeBarres?.trim()).length;

  const findByCode = (raw: string, exceptId?: string) => {
    const key = normalizeCode(raw);
    if (!key) return undefined;
    return branchProducts.find((item) => item.id !== exceptId && item.codeBarres && normalizeCode(item.codeBarres) === key);
  };
  const duplicateMessage = (raw: string, exceptId?: string) => {
    const match = findByCode(raw, exceptId);
    return match ? `Déjà utilisé par « ${match.nom} ».` : undefined;
  };

  /* Show a scanned product: side sheet on desktop, expanded card (scrolled into view) on phone. */
  const revealProduct = (target: Product) => {
    if (!filteredProducts.some((item) => item.id === target.id)) {
      setInventorySearch('');
      setInventoryCategoryFilter('Tout');
      setInventoryStatusFilter('all');
      setInventoryFocusFilter('all');
    }
    setEditingId(null);
    if (window.matchMedia('(min-width: 640px)').matches) {
      openDrawer(target.id);
    } else {
      setExpandedId(target.id);
      setScrollToId(target.id);
    }
  };

  useEffect(() => {
    if (!scrollToId) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document
      .querySelector(`[data-product-card="${CSS.escape(scrollToId)}"]`)
      ?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    setScrollToId(null);
  }, [scrollToId]);

  /* Prefill name and category for a new product from a public food/drink database (best effort). */
  const prefillFromCode = async (code: string) => {
    lookupAbort.current?.abort();
    const controller = new AbortController();
    lookupAbort.current = controller;
    setCodeLookup('loading');
    const info = await lookupProductByCode(code, controller.signal);
    if (controller.signal.aborted) return;
    if (!info) {
      setCodeLookup('none');
      return;
    }
    setAddProductDraft((prev) => {
      if (prev.codeBarres !== code || prev.nom.trim()) return prev;
      return { ...prev, nom: info.nom, categorie: info.categorie ?? prev.categorie };
    });
    setCodeLookup('found');
  };

  const applyCodeToNewDraft = (code: string) => {
    setAddProductDraft((prev) => ({ ...prev, codeBarres: code }));
    setAddProductError(null);
    if (findByCode(code)) {
      setCodeLookup('idle');
      return;
    }
    void prefillFromCode(code);
  };

  const openAddWithCode = (code: string) => {
    setUnknownCode(null);
    setAddProductDraft({ ...emptyDraft(), codeBarres: code });
    setAddProductError(null);
    setAddProductOpen(true);
    void prefillFromCode(code);
  };

  const handleScanned = (raw: string) => {
    const target = scanTarget;
    setScanTarget(null);
    const code = raw.trim();
    if (!target || !code) return;
    if (target.kind === 'fill') {
      target.apply(code);
      return;
    }
    const match = findByCode(code);
    if (match) revealProduct(match);
    else setUnknownCode(code);
  };

  /* USB / Bluetooth scanners type the code into the search box and press Enter. */
  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    const match = findByCode(inventorySearch);
    if (match) {
      event.preventDefault();
      revealProduct(match);
    }
  };

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
      delta: nextStock - product.stockFermeture,
      note: reason,
      amount: 0,
    });
  };

  /* Stock typed straight into the edit form: logged as a manual correction (merged while typing). */
  const handleStockEdit = (product: Product, value: number) => {
    const nextStock = Math.max(0, value);
    const delta = nextStock - product.stockFermeture;
    if (!delta) return;
    onUpdateProduct(product.id, { stockFermeture: nextStock });
    onRecordMovement({
      id: '',
      branchId,
      productId: product.id,
      date: new Date(),
      kind: 'manual',
      qty: Math.abs(delta),
      delta,
      note: 'Correction du stock',
      amount: 0,
      coalesceKey: `stock-edit-${product.id}`,
    });
  };

  const submitNewProduct = () => {
    const name = addProductDraft.nom.trim();
    if (!name) {
      setAddProductError('Le nom du produit est obligatoire.');
      return;
    }
    const duplicate = addProductDraft.codeBarres.trim() ? findByCode(addProductDraft.codeBarres) : undefined;
    if (duplicate) {
      setAddProductError(`Ce code-barres est déjà utilisé par « ${duplicate.nom} ».`);
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
      codeBarres: addProductDraft.codeBarres.trim() || undefined,
    });
    setAddProductError(null);
    closeAddProduct();
    setAddProductDraft(emptyDraft());
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
          type="button"
          onClick={() => (selectMode ? exitSelection() : enterSelection())}
          aria-label={selectMode ? 'Quitter la sélection' : 'Sélectionner plusieurs produits'}
          aria-pressed={selectMode}
          title="Sélectionner"
          className={`group relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full ${selectMode ? 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]' : 'text-[var(--m3-primary)]'} ${M3_FOCUS}`}
        >
          <M3StateLayer />
          <ListChecks size={22} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setLabelIds([])}
          aria-label="Imprimer des étiquettes code-barres"
          title="Étiquettes"
          className={`group relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-primary)] ${M3_FOCUS}`}
        >
          <M3StateLayer />
          <Printer size={22} aria-hidden="true" />
          {productsWithoutCode > 0 && <span aria-hidden="true" className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#7B5800]" />}
        </button>
        <button
            onClick={() => setAddProductOpen(true)}
            className={`${selectMode ? 'hidden ' : ''}group fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 shrink-0 items-center justify-center gap-3 overflow-hidden rounded-[20px] bg-[var(--m3-primary-container)] px-6 text-base font-semibold tracking-[0.01em] text-[var(--m3-on-primary-container)] shadow-[0_3px_8px_3px_rgba(0,0,0,0.15),0_1px_3px_rgba(0,0,0,0.3)] m3-press motion-reduce:transition-none ${M3_FOCUS}       `}
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
            onKeyDown={handleSearchKeyDown}
            placeholder="Rechercher un produit..."
            className="w-full min-w-0 border-none bg-transparent text-base text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)]"
          />
          {inventorySearch && (
            <button
              type="button"
              onClick={() => setInventorySearch('')}
              aria-label="Effacer la recherche"
              className={`group relative flex h-12 w-12 shrink-0   items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}
            >
              <M3StateLayer />
              <X size={20} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setScanTarget({ kind: 'find' })}
            aria-label="Scanner un code-barres ou QR"
            title="Scanner un produit"
            className={`group relative -mr-2 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-primary)] ${M3_FOCUS}`}
          >
            <M3StateLayer />
            <ScanLine className="h-6 w-6" aria-hidden="true" />
          </button>
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

      <div className="mb-4 grid grid-cols-2 gap-2">
        <div className="col-span-2 rounded-[28px] bg-[var(--m3-primary-container)] px-5 py-4 text-[var(--m3-on-primary-container)]">
          <div className="text-sm font-medium opacity-80">Profit potentiel</div>
          <div className="mt-1 text-3xl font-semibold leading-9 tabular-nums">{fmtHTG(potentialProfit)}</div>
        </div>
        {[
          ['Valeur stock', fmtHTG(totalStockValueCost)],
          ['Valeur vente', fmtHTG(totalStockValueSale)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[20px] bg-[var(--m3-surface-container)] px-4 py-3">
            <div className="text-xs text-[var(--m3-on-surface-variant)]">{label}</div>
            <div className="mt-0.5 text-base font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      <div
        role="group"
        aria-label="Filtrer par activité"
        className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {FOCUS_OPTIONS.map((filter) => (
          <FilterChip key={filter.id} label={filter.label} selected={inventoryFocusFilter === filter.id} onClick={() => setInventoryFocusFilter(filter.id)} />
        ))}
      </div>

      {/* Insight carousel — tap a card to filter the list */}
      {(reorderList.length > 0 || deadStockList.length > 0 || topSellers.length > 0) && (
        <div className="-mx-4 mb-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[
            { id: 'reorder' as const, label: 'À commander', Icon: ShoppingCart, items: reorderList.slice(0, 2).map((product) => product.nom) },
            { id: 'dead' as const, label: 'Inactif 30 j', Icon: Clock, items: deadStockList.slice(0, 2).map((product) => product.nom) },
            { id: 'top' as const, label: 'Top ventes', Icon: TrendingUp, items: topSellers.slice(0, 2).map((product) => `${product.nom} (${productSummaries[product.id]?.sales30 ?? 0})`) },
          ]
            .filter((card) => card.items.length > 0)
            .map(({ id, label, Icon, items }) => {
              const selected = inventoryFocusFilter === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setInventoryFocusFilter((prev) => (prev === id ? 'all' : id))}
                  className={`group relative flex w-[72%] shrink-0 snap-start items-center gap-3 overflow-hidden p-4 text-left m3-morph ${
                    selected
                      ? 'rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
                      : 'rounded-[28px] bg-[var(--m3-surface-container)] text-[var(--m3-on-surface)]'
                  } ${M3_FOCUS}`}
                >
                  <M3StateLayer />
                  <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]">
                    <Icon size={20} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs text-[var(--m3-on-surface-variant)]">{label}</span>
                    <span className="block truncate text-sm font-medium">{items.join(' • ')}</span>
                  </span>
                </button>
              );
            })}
        </div>
      )}

      {/* Product cards — tonal surfaces, state layers, tap to expand (1 column on phone, grid on desktop) */}
      <div className={`grid grid-cols-1 items-start gap-2 ${selectMode ? 'pb-56' : 'pb-24'}`}>
          {filteredProducts.map((product) => {
            const soldToday = soldByProductToday[product.id] ?? 0;
            const restockValue = restockByProduct[product.id] ?? 0;
            const isLowStock = product.stockFermeture <= product.seuil;
            const isOutOfStock = product.stockFermeture <= 0;
            const editing = isEditing(product.id);
            const saving = isSaving(product.id);
            const open = !selectMode && (editing || expandedId === product.id);
            const picked = selectedIds.has(product.id);
            const showHistory = selectedHistoryProduct?.id === product.id;
            const tone = isOutOfStock ? M3_STATUS.out : isLowStock ? M3_STATUS.low : M3_STATUS.ok;
            const statusLabel = isOutOfStock ? 'Rupture de stock' : isLowStock ? 'Stock bas' : 'En stock';
            const CategoryIcon = categoryIcon(product.categorie);
            const iconBtn = `group relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full text-[var(--m3-error,#BA1A1A)] ${M3_FOCUS}`;
            const btn =
              `group relative flex h-12 items-center justify-center gap-2 overflow-hidden rounded-full px-2 text-sm font-medium tracking-[0.01em] ${M3_FOCUS}`;
            return (
              <div
                key={product.id}
                data-product-card={product.id}
                className={
                  'overflow-hidden transition-[background-color,border-radius] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ' +
                  (open
                    ? 'rounded-[32px] bg-[var(--m3-surface-container-high)]'
                    : picked
                      ? 'rounded-2xl bg-[var(--m3-secondary-container)]'
                      : 'rounded-2xl bg-[var(--m3-surface-container)]') +
                  ''
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
                    <M3BarcodeField
                      value={product.codeBarres ?? ''}
                      onChange={(value) => onUpdateProduct(product.id, { codeBarres: value })}
                      onScan={() => setScanTarget({ kind: 'fill', apply: (code) => onUpdateProduct(product.id, { codeBarres: code }) })}
                      onGenerate={() => onUpdateProduct(product.id, { codeBarres: newInternalCode() })}
                      error={duplicateMessage(product.codeBarres ?? '', product.id)}
                    />
                    <M3SkuField
                      value={product.sku ?? ''}
                      onChange={(value) => onUpdateProduct(product.id, { sku: value })}
                      onGenerate={() => onUpdateProduct(product.id, { sku: newSku(product) })}
                      error={skuDuplicateMessage(product.sku ?? '', product.id)}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => (selectMode ? toggleSelected(product.id, true) : setExpandedId((prev) => (prev === product.id ? null : product.id)))}
                    {...(selectMode ? { role: 'checkbox', 'aria-checked': picked } : { 'aria-expanded': open })}
                    className={`group relative flex min-h-[72px] w-full items-center gap-4 px-4 py-3 text-left ${M3_FOCUS}`}
                  >
                    <M3StateLayer />
                    {selectMode ? (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center">
                        <SelectMark checked={picked} />
                      </span>
                    ) : (
                      <span
                        aria-hidden="true"
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone.bg} ${tone.fg}`}
                      >
                        <CategoryIcon size={20} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-medium leading-6 text-[var(--m3-on-surface)]">
                        {product.nom}
                      </span>
                      <span className="block truncate text-sm leading-5 text-[var(--m3-on-surface-variant)]">
                        {product.categorie}{product.sku ? ` · ${product.sku}` : ''} · {fmtHTG(product.prix)} · Vendu {soldToday}
                      </span>
                    </span>
                    <span
                      className={`flex h-8 min-w-[2rem] shrink-0 items-center justify-center gap-1 rounded-full px-3 text-sm font-medium tabular-nums ${tone.bg} ${tone.fg}`}
                    >
                      {(isLowStock || isOutOfStock) && <AlertTriangle size={14} aria-hidden="true" />}
                      <span className="sr-only">{statusLabel} : </span>
                      {product.stockFermeture}
                    </span>
                    {!selectMode && (
                      <ChevronDown
                        size={20}
                        aria-hidden="true"
                        className={
                          'shrink-0 text-[var(--m3-on-surface-variant)] transition-transform duration-300 motion-reduce:transition-none ' +
                          (open ? 'rotate-180' : '')
                        }
                      />
                    )}
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
                                <div className="text-xs text-[var(--m3-on-surface-variant)]">{label}</div>
                                <div className="mt-1 text-sm font-semibold tabular-nums">{value}</div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 space-y-1.5">
                            {recent.length === 0 ? (
                              <div className="text-xs text-[var(--m3-on-surface-variant)]">Aucun mouvement historique pour ce produit.</div>
                            ) : recent.map((entry) => {
                                const delta = stockDelta(entry);
                                const isPrice = entry.kind === 'price';
                                const tone = isPrice || delta >= 0 ? 'text-[var(--m3-primary)]' : 'text-[var(--m3-error,#BA1A1A)]';
                                return (
                                  <div key={entry.id} className={`flex items-center justify-between gap-2 rounded-xl bg-[var(--m3-surface-container)] px-2.5 py-1.5 text-xs ${entry.cancelled ? 'opacity-60' : ''}`}>
                                    <div className="min-w-0">
                                      <div className={`truncate font-medium text-[var(--m3-on-surface)] ${entry.cancelled ? 'line-through' : ''}`}>{entry.note}</div>
                                      <div className="text-[var(--m3-on-surface-variant)]">{KIND_LABEL[entry.kind]} · {entry.date.toLocaleDateString('fr-FR')}{entry.cancelled ? ' · Annulé' : ''}</div>
                                    </div>
                                    <div className={`shrink-0 tabular-nums font-semibold ${tone}`}>
                                      {isPrice ? `${fmtPrice(entry.from ?? 0)} → ${fmtPrice(entry.to ?? 0)}` : `${delta < 0 ? '−' : '+'}${Math.abs(delta || entry.qty)}`}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                          <button
                            type="button"
                            onClick={() => setHistoryDialogId(product.id)}
                            className={`group relative mt-3 flex h-10 w-full items-center justify-center gap-2 overflow-hidden rounded-full border border-[var(--m3-outline)] text-sm font-medium text-[var(--m3-primary)] ${M3_FOCUS}`}
                          >
                            <M3StateLayer />
                            <History size={16} aria-hidden="true" />
                            Tout l'historique ({history.length})
                          </button>
                        </div>
                      );
                    })()}

                    {product.codeBarres && !editing && (
                      <div className="mb-3 flex items-center gap-2 px-1 text-xs text-[var(--m3-on-surface-variant)]">
                        <ScanLine size={14} aria-hidden="true" />
                        <span className="sr-only">Code : </span>
                        <span className="tabular-nums">{product.codeBarres}</span>
                      </div>
                    )}

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
                        onChange={(value) => handleStockEdit(product, value)}
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

                    <div className={'mt-4 grid gap-2 ' + (editing ? 'grid-cols-2' : 'grid-cols-[1fr_1fr_auto_auto]')}>
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
                            Historique
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
                            onClick={() => setLabelIds([product.id])}
                            className={iconBtn}
                            aria-label="Imprimer l'étiquette"
                            title="Imprimer l'étiquette"
                          >
                            <M3StateLayer />
                            <Printer size={20} />
                          </button>
                          <button
                            onClick={() => {
                              setDeleteTarget(product);
                            }}
                            className={iconBtn}
                            aria-label="Supprimer"
                            title="Supprimer"
                          >
                            <M3StateLayer />
                            <Trash2 size={20} />
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
      <div style={M3_VARS} className={`hidden font-sans text-[var(--m3-on-surface)] sm:block ${selectMode ? 'pb-44' : ''}`}>
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
            type="button"
            onClick={() => setLabelIds([])}
            className={`group relative flex h-12 shrink-0 items-center gap-2 overflow-hidden rounded-full border border-[var(--m3-outline)] px-5 text-sm font-semibold text-[var(--m3-primary)] ${M3_FOCUS}`}
          >
            <M3StateLayer />
            <Printer size={20} aria-hidden="true" />
            Étiquettes
            {productsWithoutCode > 0 && (
              <span className="rounded-full bg-[var(--m3-tertiary-container)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--m3-on-tertiary-container)]" title="Produits sans code-barres">
                {productsWithoutCode}
              </span>
            )}
          </button>
          <button
            onClick={() => setAddProductOpen(true)}
            className={`group relative flex h-12 shrink-0 items-center gap-2 overflow-hidden rounded-full bg-[var(--m3-primary)] px-6 text-sm font-semibold text-[var(--m3-on-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.3),0_1px_2px_rgba(0,0,0,0.15)] transition-[box-shadow,transform] hover:shadow-[0_2px_6px_2px_rgba(0,0,0,0.15),0_1px_2px_rgba(0,0,0,0.3)] active:scale-[0.96] motion-reduce:transition-none ${M3_FOCUS}`}
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
              onKeyDown={handleSearchKeyDown}
              placeholder="Rechercher un produit..."
              className="w-full min-w-0 border-none bg-transparent text-sm text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)]"
            />
            {inventorySearch && (
              <button
                type="button"
                onClick={() => setInventorySearch('')}
                aria-label="Effacer la recherche"
                className={`group relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}
              >
                <M3StateLayer />
                <X size={18} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setScanTarget({ kind: 'find' })}
              aria-label="Scanner un code-barres ou QR"
              title="Scanner un produit"
              className={`group relative -mr-2 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-primary)] ${M3_FOCUS}`}
            >
              <M3StateLayer />
              <ScanLine size={20} aria-hidden="true" />
            </button>
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

        <div role="group" aria-label="Filtrer par activité" className="mb-3 flex flex-wrap gap-2">
          {FOCUS_OPTIONS.map((filter) => (
            <FilterChip key={filter.id} size="sm" label={filter.label} selected={inventoryFocusFilter === filter.id} onClick={() => setInventoryFocusFilter(filter.id)} />
          ))}
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          {[
            ['Valeur stock', fmtHTG(totalStockValueCost)],
            ['Valeur vente', fmtHTG(totalStockValueSale)],
            ['Profit potentiel', fmtHTG(potentialProfit)],
          ].map(([label, value], idx) => (
            <div
              key={label}
              className={`rounded-[28px] px-5 py-4 ${
                idx === 2
                  ? 'bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]'
                  : 'bg-[var(--m3-surface-container)]'
              }`}
            >
              <div className={`text-sm ${idx === 2 ? 'font-medium opacity-80' : 'text-[var(--m3-on-surface-variant)]'}`}>{label}</div>
              <div className="mt-1 text-2xl font-semibold leading-8 tabular-nums">{value}</div>
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
            <table className="w-full min-w-[800px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--m3-surface-container-high)] text-xs text-[var(--m3-on-surface-variant)] shadow-[0_1px_0_var(--m3-outline-variant)]">
                <tr>
                  <th scope="col" className="w-12 px-2 py-2">
                    <SelectBox
                      checked={allVisibleSelected}
                      indeterminate={selectedCount > 0 && !allVisibleSelected}
                      onToggle={toggleAllVisible}
                      label="Tout sélectionner"
                    />
                  </th>
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
                  const picked = selectedIds.has(product.id);
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
                        'cursor-pointer border-b border-[var(--m3-outline-variant)]/60 transition-colors last:border-b-0 focus-visible:bg-[var(--m3-surface-container-high)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--m3-primary)] motion-reduce:transition-none ' +
                        (active
                          ? 'bg-[var(--m3-secondary-container)]'
                          : picked
                            ? 'bg-[var(--m3-primary-container)]/40 hover:bg-[var(--m3-primary-container)]/60'
                            : 'hover:bg-[var(--m3-surface-container-high)]')
                      }
                    >
                      <td className="w-12 px-2 py-2.5" onClick={(event) => event.stopPropagation()}>
                        <SelectBox checked={picked} onToggle={() => toggleSelected(product.id, false)} label={`Sélectionner ${product.nom}`} />
                      </td>
                      <td className="max-w-[320px] px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone.bg} ${tone.fg}`}>
                            <CategoryIcon size={18} />
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-medium">{product.nom}</div>
                            <div className="truncate text-xs text-[var(--m3-on-surface-variant)]">
                              {product.categorie}
                              {product.sku && <span className="tabular-nums"> · {product.sku}</span>}
                            </div>
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
                          <button onClick={() => setHistoryDialogId(product.id)} className={iconBtn} aria-label="Historique" title="Historique">
                            <M3StateLayer />
                            <History size={18} />
                          </button>
                          <button onClick={() => openDrawer(product.id)} className={iconBtn} aria-label="Modifier" title="Modifier">
                            <M3StateLayer />
                            <Pencil size={18} />
                          </button>
                          <button
                            onClick={() => {
                              setDeleteTarget(product);
                            }}
                            className={`${iconBtn} !text-[var(--m3-error,#BA1A1A)]`}
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
                    <td colSpan={10} className="px-4 py-16 text-center">
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
                      <M3BarcodeField
                        value={p.codeBarres ?? ''}
                        onChange={(value) => onUpdateProduct(p.id, { codeBarres: value })}
                        onScan={() => setScanTarget({ kind: 'fill', apply: (code) => onUpdateProduct(p.id, { codeBarres: code }) })}
                        onGenerate={() => onUpdateProduct(p.id, { codeBarres: newInternalCode() })}
                        error={duplicateMessage(p.codeBarres ?? '', p.id)}
                      />
                      <M3SkuField
                        value={p.sku ?? ''}
                        onChange={(value) => onUpdateProduct(p.id, { sku: value })}
                        onGenerate={() => onUpdateProduct(p.id, { sku: newSku(p) })}
                        error={skuDuplicateMessage(p.sku ?? '', p.id)}
                      />
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
                          <div className="text-xs text-[var(--m3-on-surface-variant)]">{label}</div>
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
                          <div className={`tabular-nums font-semibold ${entry.kind === 'sale' ? 'text-[var(--m3-error,#BA1A1A)]' : 'text-[var(--m3-primary)]'}`}>
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
                      <ProductNumberField label="Fermeture" editing value={p.stockFermeture} onChange={(value) => handleStockEdit(p, value)} />
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
                      setDeleteTarget(p);
                    }}
                    className={`${footBtn} -ml-2 text-[var(--m3-error,#BA1A1A)]`}
                  >
                    <M3StateLayer />
                    <Trash2 size={18} />
                    Supprimer
                  </button>
                  <button type="button" onClick={() => setHistoryDialogId(p.id)} className={`${footBtn} text-[var(--m3-primary)]`}>
                    <M3StateLayer />
                    <History size={18} />
                    Historique
                  </button>
                  <button type="button" onClick={() => setLabelIds([p.id])} className={`${footBtn} text-[var(--m3-primary)]`}>
                    <M3StateLayer />
                    <Printer size={18} />
                    Étiquette
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
        <div
          role="presentation"
          style={M3_VARS}
          onClick={(event) => { if (event.target === event.currentTarget) closeAddProduct(); }}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/[0.32] sm:items-center sm:p-4"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-product-title"
            className="m3-dialog max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] bg-[var(--m3-surface-container-low)] px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 text-[var(--m3-on-surface)] shadow-[0_8px_24px_rgba(0,0,0,0.2)] sm:max-w-[520px] sm:rounded-[28px] sm:pb-6 sm:pt-6"
          >
            <div aria-hidden="true" className="mx-auto mb-4 h-1 w-8 rounded-full bg-[var(--m3-on-surface-variant)] opacity-40 sm:hidden" />
            <div className="flex items-center justify-between gap-3">
              <h3 id="add-product-title" className="text-2xl leading-8">Ajouter un produit</h3>
              <button type="button" onClick={() => closeAddProduct()} aria-label="Fermer" className={`group relative -mr-2 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}>
                <M3StateLayer />
                <X size={20} />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <M3BarcodeField
                value={addProductDraft.codeBarres}
                onChange={(value) => {
                  lookupAbort.current?.abort();
                  setCodeLookup('idle');
                  setAddProductDraft((prev) => ({ ...prev, codeBarres: value }));
                }}
                onScan={() => setScanTarget({ kind: 'fill', apply: applyCodeToNewDraft })}
                onGenerate={() => {
                  lookupAbort.current?.abort();
                  setCodeLookup('idle');
                  setAddProductError(null);
                  setAddProductDraft((prev) => ({ ...prev, codeBarres: newInternalCode() }));
                }}
                error={duplicateMessage(addProductDraft.codeBarres)}
              />
              {codeLookup !== 'idle' && (
                <p role="status" className="flex items-center gap-2 px-4 text-xs text-[var(--m3-on-surface-variant)]">
                  {codeLookup === 'loading' && (
                    <>
                      <M3Loading size={14} />
                      Recherche du produit…
                    </>
                  )}
                  {codeLookup === 'found' && 'Nom et catégorie préremplis (Open Food Facts). Vérifiez avant de créer.'}
                  {codeLookup === 'none' && 'Aucune fiche trouvée pour ce code. Complétez le produit à la main.'}
                </p>
              )}
              <M3TextField label="Nom du produit" value={addProductDraft.nom} placeholder="Ex: Ciment gris 50kg" onChange={(value) => setAddProductDraft((prev) => ({ ...prev, nom: value }))} />
              <div className="grid grid-cols-2 gap-2">
                <label className="block min-w-0 rounded-xl bg-[var(--m3-surface)] px-4 pb-1.5 pt-2 ring-1 ring-[var(--m3-outline)] focus-within:ring-2 focus-within:ring-[var(--m3-primary)]">
                  <span className="block text-xs leading-4 text-[var(--m3-on-surface-variant)]">Catégorie</span>
                  <select value={addProductDraft.categorie} onChange={(event) => setAddProductDraft((prev) => ({ ...prev, categorie: event.target.value }))} className="h-8 w-full min-w-0 bg-transparent p-0 text-base text-[var(--m3-on-surface)] outline-none">
                    {Array.from(new Set(['Autre', ...presentCategories.filter((c) => c !== 'Tout'), addProductDraft.categorie])).map((cat) => (
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

            {addProductError && (
              <div role="alert" className="mt-3 flex items-start gap-2 rounded-2xl bg-[var(--m3-error-container,#FFDAD6)] px-4 py-3 text-sm text-[var(--m3-on-error-container,#410002)]">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                {addProductError}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => closeAddProduct()} className={`group relative h-10 overflow-hidden rounded-full px-4 text-sm font-medium text-[var(--m3-primary)] ${M3_FOCUS}`}>
                <M3StateLayer />
                Annuler
              </button>
              <button type="button" onClick={submitNewProduct} className={`group relative h-10 overflow-hidden rounded-full bg-[var(--m3-primary)] px-6 text-sm font-medium text-[var(--m3-on-primary)] ${M3_FOCUS}`}>
                <M3StateLayer />
                Créer le produit
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <BulkDock
        active={selectMode}
        count={selectedCount}
        visibleTotal={filteredProducts.length}
        needCodes={needCodes}
        needSkus={needSkus}
        snack={snack}
        onSnackClose={() => setSnack(null)}
        onExit={exitSelection}
        onToggleAll={toggleAllVisible}
        onGenerateCodes={handleBulkBarcodes}
        onGenerateSkus={handleBulkSkus}
        onLabels={() => setLabelIds(selectedProducts.map((product) => product.id))}
        onEdit={() => setBulkEditOpen(true)}
        onDelete={() => setBulkDeleteOpen(true)}
      />

      {bulkEditOpen && (
        <BulkEditDialog
          products={selectedProducts}
          categories={presentCategories}
          onApply={applyBulkPatches}
          onClose={() => setBulkEditOpen(false)}
        />
      )}

      {bulkDeleteOpen && (
        <BulkDeleteDialog products={selectedProducts} onConfirm={confirmBulkDelete} onClose={() => setBulkDeleteOpen(false)} />
      )}

      {historyDialogId && (() => {
        const target = branchProducts.find((item) => item.id === historyDialogId);
        return target ? (
          <ProductHistoryDialog product={target} entries={productHistoryById[target.id] ?? []} onClose={() => setHistoryDialogId(null)} />
        ) : null;
      })()}

      {labelIds && (
        <LabelPrintDialog
          products={branchProducts}
          initialIds={labelIds}
          onApplyCodes={applyGeneratedCodes}
          onClose={() => setLabelIds(null)}
        />
      )}

      {scanTarget && (
        <BarcodeScannerDialog
          title={scanTarget.kind === 'find' ? 'Trouver un produit' : 'Scanner le code du produit'}
          onDetected={handleScanned}
          onClose={() => setScanTarget(null)}
        />
      )}

      {unknownCode && createPortal(
        <div
          role="presentation"
          style={M3_VARS}
          onClick={(event) => { if (event.target === event.currentTarget) setUnknownCode(null); }}
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/[0.32] p-6"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="unknown-code-title"
            aria-describedby="unknown-code-desc"
            className="m3-dialog w-full max-w-[312px] rounded-[28px] bg-[var(--m3-surface-container-high)] p-6 text-[var(--m3-on-surface)] shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
          >
            <span aria-hidden="true" className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]">
              <ScanLine size={24} />
            </span>
            <h3 id="unknown-code-title" className="text-center text-2xl leading-8">Produit introuvable</h3>
            <p id="unknown-code-desc" className="mt-3 text-center text-sm leading-5 text-[var(--m3-on-surface-variant)]">
              Aucun produit n'a le code{' '}
              <span className="break-all font-medium tabular-nums text-[var(--m3-on-surface)]">{unknownCode}</span>.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" autoFocus onClick={() => setUnknownCode(null)} className={`group relative h-10 overflow-hidden rounded-full px-4 text-sm font-medium text-[var(--m3-primary)] ${M3_FOCUS}`}>
                <M3StateLayer />
                Fermer
              </button>
              <button
                type="button"
                onClick={() => {
                  setUnknownCode(null);
                  setScanTarget({ kind: 'find' });
                }}
                className={`group relative h-10 overflow-hidden rounded-full px-4 text-sm font-medium text-[var(--m3-primary)] ${M3_FOCUS}`}
              >
                <M3StateLayer />
                Scanner encore
              </button>
              <button
                type="button"
                onClick={() => openAddWithCode(unknownCode)}
                className={`group relative h-10 overflow-hidden rounded-full bg-[var(--m3-primary)] px-5 text-sm font-medium text-[var(--m3-on-primary)] ${M3_FOCUS}`}
              >
                <M3StateLayer />
                Créer le produit
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {deleteTarget && createPortal(
        <div
          role="presentation"
          style={M3_VARS}
          onClick={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null); }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/[0.32] p-6"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-product-title"
            aria-describedby="delete-product-desc"
            className="m3-dialog w-full max-w-[312px] rounded-[28px] bg-[var(--m3-surface-container-high)] p-6 text-[var(--m3-on-surface)] shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
          >
            <span aria-hidden="true" className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--m3-error-container,#FFDAD6)] text-[var(--m3-error,#BA1A1A)]">
              <Trash2 size={24} />
            </span>
            <h3 id="delete-product-title" className="text-center text-2xl leading-8">Supprimer ce produit ?</h3>
            <p id="delete-product-desc" className="mt-3 text-center text-sm leading-5 text-[var(--m3-on-surface-variant)]">
              « {deleteTarget.nom} » sera retiré de l'inventaire. Cette action est définitive.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" autoFocus onClick={() => setDeleteTarget(null)} className={`group relative h-10 overflow-hidden rounded-full px-4 text-sm font-medium text-[var(--m3-primary)] ${M3_FOCUS}`}>
                <M3StateLayer />
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = deleteTarget;
                  setDeleteTarget(null);
                  if (drawerId === target.id) setDrawerId(null);
                  onDeleteProduct(target);
                }}
                className={`group relative h-10 overflow-hidden rounded-full px-4 text-sm font-medium text-[var(--m3-error,#BA1A1A)] ${M3_FOCUS}`}
              >
                <M3StateLayer />
                Supprimer
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
