import { useEffect, useState } from 'react';
import { Check, ChevronRight, Minus, Plus, Search, ShoppingCart, Trash2, X } from 'lucide-react';
import { M3_FOCUS } from '../../components/ui/focus';
import { M3StateLayer, M3_STATUS, M3_VARS } from '../../components/ui/theme';
import { fmtHTG } from '../../shared/currency';
import type { Product } from '../products/types';

export type VenteCartLine = {
  id: string;
  qte: number;
  sousTotal: number;
  produit: Product;
};

export type VenteViewProps = {
  isReadOnly?: boolean;
  categorie: string;
  setCategorie: (categorie: string) => void;
  categories: string[];
  recherche: string;
  setRecherche: (value: string) => void;
  produits: Product[];
  basculerProduit: (produit: Product) => void;
  lignesPanier: VenteCartLine[];
  changerQte: (id: string, delta: number) => void;
  retirerDuPanier: (id: string) => void;
  viderPanier: () => void;
  totalPanier: number;
  ouvrirCheckout: () => void;
};

const SHADOW_FLOAT = 'shadow-[0_3px_8px_3px_rgba(0,0,0,0.15),0_1px_3px_rgba(0,0,0,0.3)]';

/* Monogramme tonal pour les articles sans photo (ex. « Ciment Gris 50kg » → « CG »). */
function monogram(nom: string) {
  const letters = nom
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return letters || '•';
}

/* ---------- Pièces du panier (partagées entre le panneau fixe et la feuille) ---------- */

function QtyStepper({
  ligne,
  disabled,
  changerQte,
}: {
  ligne: VenteCartLine;
  disabled?: boolean;
  changerQte: (id: string, delta: number) => void;
}) {
  const btn = `group relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full disabled:cursor-not-allowed disabled:opacity-40 ${M3_FOCUS}`;
  return (
    <div className="flex h-10 items-center rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]">
      <button type="button" disabled={disabled} onClick={() => changerQte(ligne.id, -1)} aria-label={`Diminuer ${ligne.produit.nom}`} className={btn}>
        <M3StateLayer />
        <Minus size={18} />
      </button>
      <span aria-live="polite" className="min-w-8 text-center text-sm font-semibold tabular-nums">
        {ligne.qte}
      </span>
      <button type="button" disabled={disabled} onClick={() => changerQte(ligne.id, 1)} aria-label={`Augmenter ${ligne.produit.nom}`} className={btn}>
        <M3StateLayer />
        <Plus size={18} />
      </button>
    </div>
  );
}

function CartRows({
  lignes,
  isReadOnly,
  changerQte,
  retirerDuPanier,
}: {
  lignes: VenteCartLine[];
  isReadOnly?: boolean;
  changerQte: (id: string, delta: number) => void;
  retirerDuPanier: (id: string) => void;
}) {
  return (
    <ul className="space-y-2">
      {lignes.map((l) => (
        <li key={l.id} className="rounded-[20px] bg-[var(--m3-surface-container-lowest)] p-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium leading-5">{l.produit.nom}</div>
              <div className="text-xs text-[var(--m3-on-surface-variant)]">
                {fmtHTG(l.produit.prix)} / {l.produit.unite}
              </div>
            </div>
            <button
              type="button"
              onClick={() => retirerDuPanier(l.id)}
              disabled={isReadOnly}
              aria-label={`Retirer ${l.produit.nom}`}
              title="Retirer"
              className={`group relative -mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] hover:text-[#BA1A1A] disabled:cursor-not-allowed disabled:opacity-40 ${M3_FOCUS}`}
            >
              <M3StateLayer />
              <Trash2 size={18} />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <QtyStepper ligne={l} disabled={isReadOnly} changerQte={changerQte} />
            <div className="text-base font-semibold tabular-nums">{fmtHTG(l.sousTotal)}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function CartEmpty() {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]">
        <ShoppingCart size={28} />
      </span>
      <div className="text-base font-medium">Le panier est vide</div>
      <div className="mt-1 text-sm text-[var(--m3-on-surface-variant)]">Touchez un article pour l&apos;ajouter à la vente.</div>
    </div>
  );
}

function CheckoutButton({ disabled, readOnly, onClick }: { disabled: boolean; readOnly?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        `group relative flex h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-full text-base font-semibold tracking-[0.01em] m3-press motion-reduce:transition-none ${M3_FOCUS} ` +
        (disabled
          ? 'cursor-not-allowed bg-[var(--m3-on-surface)]/[0.12] text-[var(--m3-on-surface)]/[0.38]'
          : `bg-[var(--m3-primary)] text-[var(--m3-on-primary)] ${SHADOW_FLOAT}`)
      }
    >
      {!disabled && <M3StateLayer />}
      {readOnly ? 'Mode lecture seule' : 'Encaisser'}
      {!readOnly && <ChevronRight size={20} />}
    </button>
  );
}

function CartTotal({ total, nbArticles }: { total: number; nbArticles: number }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <div className="text-xs font-medium tracking-wide text-[var(--m3-on-surface-variant)]">Total</div>
        <div className="text-3xl font-semibold leading-9 tabular-nums">{fmtHTG(total)}</div>
      </div>
      <div className="pb-1 text-sm text-[var(--m3-on-surface-variant)]">
        {nbArticles} article{nbArticles !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

/* ---------- Vue principale ---------- */

export function VenteView({
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
  const [feuilleOuverte, setFeuilleOuverte] = useState(false);
  const nbArticles = lignesPanier.reduce((s, l) => s + l.qte, 0);
  const panierVide = lignesPanier.length === 0;
  const encaissementBloque = panierVide || !!isReadOnly;

  // La feuille du panier se ferme toute seule quand le panier se vide (ajustement pendant le rendu), ou avec Échap.
  if (panierVide && feuilleOuverte) setFeuilleOuverte(false);

  useEffect(() => {
    if (!feuilleOuverte) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFeuilleOuverte(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feuilleOuverte]);

  const encaisser = () => {
    setFeuilleOuverte(false);
    ouvrirCheckout();
  };

  const viderBtn = (
    <button
      type="button"
      onClick={viderPanier}
      disabled={isReadOnly}
      className={`group relative h-10 shrink-0 overflow-hidden rounded-full px-4 text-sm font-medium text-[var(--m3-primary)] disabled:opacity-40 ${M3_FOCUS}`}
    >
      <M3StateLayer />
      Vider
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 gap-4 overflow-hidden pt-1">
      {/* ===== Catalogue ===== */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-3 pb-3">
          <div className="flex h-14 min-w-0 flex-1 items-center gap-3 rounded-full bg-[var(--m3-surface-container-high)] px-4 transition-shadow focus-within:ring-2 focus-within:ring-[var(--m3-primary)] motion-reduce:transition-none md:h-12 md:max-w-md">
            <Search className="h-6 w-6 shrink-0 text-[var(--m3-on-surface-variant)] md:h-5 md:w-5" />
            <input
              type="text"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher un article…"
              aria-label="Rechercher un article"
              className="w-full min-w-0 border-none bg-transparent text-base text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)] md:text-sm"
            />
            {recherche && (
              <button
                type="button"
                onClick={() => setRecherche('')}
                aria-label="Effacer la recherche"
                className={`group relative -mr-2 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] md:h-9 md:w-9 ${M3_FOCUS}`}
              >
                <M3StateLayer />
                <X size={20} />
              </button>
            )}
          </div>
          <div className="ml-auto hidden shrink-0 text-sm text-[var(--m3-on-surface-variant)] md:block">
            {produits.length} article{produits.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Filtres : défilement horizontal sur téléphone, retour à la ligne sur grand écran */}
        <div
          role="group"
          aria-label="Filtrer par catégorie"
          className="flex shrink-0 gap-2 overflow-x-auto pb-3 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible [&::-webkit-scrollbar]:hidden"
        >
          {categories.map((c) => {
            const selected = categorie === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategorie(c)}
                aria-pressed={selected}
                className={
                  `group relative flex h-10 shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap px-4 text-sm font-medium m3-morph motion-reduce:transition-none ${M3_FOCUS} ` +
                  (selected
                    ? 'rounded-full bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]'
                    : 'rounded-xl border border-[var(--m3-outline)] text-[var(--m3-on-surface-variant)]')
                }
              >
                <M3StateLayer />
                {selected && <Check size={16} strokeWidth={2.5} />}
                {c}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div
            className={`grid grid-cols-2 content-start gap-3 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] ${
              panierVide ? 'pb-4' : 'pb-24 lg:pb-4'
            }`}
          >
            {produits.map((p) => {
              const epuise = p.stockFermeture <= 0;
              const stockBas = !epuise && p.stockFermeture <= p.seuil;
              const ligne = lignesPanier.find((l) => l.id === p.id);
              const selectionne = !!ligne;
              const desactive = epuise || !!isReadOnly;
              const tone = epuise ? M3_STATUS.out : M3_STATUS.low;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={desactive}
                  onClick={() => basculerProduit(p)}
                  aria-pressed={selectionne}
                  className={
                    `group relative flex min-w-0 flex-col overflow-hidden p-3 text-left m3-morph m3-press-card motion-reduce:transition-none ${M3_FOCUS} ` +
                    (selectionne
                      ? 'rounded-[20px] bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)] '
                      : 'rounded-[28px] bg-[var(--m3-surface-container-low)] text-[var(--m3-on-surface)] ') +
                    (desactive ? 'cursor-not-allowed opacity-50' : '')
                  }
                >
                  {!desactive && <M3StateLayer />}

                  <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-[20px] bg-[var(--m3-surface-container-lowest)]">
                    {p.image ? (
                      <img src={p.image} alt="" className="max-h-full max-w-full object-contain p-2" />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--m3-secondary-container)] text-lg font-semibold text-[var(--m3-on-secondary-container)]"
                      >
                        {monogram(p.nom)}
                      </span>
                    )}
                    {selectionne && (
                      <span className="m3-pop absolute right-2 top-2 flex h-7 min-w-7 items-center justify-center gap-0.5 rounded-full bg-[var(--m3-primary)] px-2 text-xs font-semibold tabular-nums text-[var(--m3-on-primary)]">
                        <Check size={14} strokeWidth={3} />×{ligne!.qte}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 truncate text-[11px] font-medium uppercase tracking-wide text-[var(--m3-on-surface-variant)]">{p.categorie}</div>
                  <div className="line-clamp-2 min-h-10 text-sm font-medium leading-5">{p.nom}</div>
                  <div className="mt-1 text-lg font-semibold leading-6 tabular-nums">{fmtHTG(p.prix)}</div>

                  <div className="mt-1.5 flex min-h-6 items-center">
                    {epuise || stockBas ? (
                      <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium ${tone.bg} ${tone.fg}`}>
                        {epuise ? 'Épuisé' : `${p.stockFermeture} ${p.unite}${p.stockFermeture !== 1 ? 's' : ''} · stock bas`}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--m3-on-surface-variant)]">
                        {p.stockFermeture} {p.unite}
                        {p.stockFermeture !== 1 ? 's' : ''} en stock
                      </span>
                    )}
                  </div>
                </button>
              );
            })}

            {produits.length === 0 && (
              <div className="col-span-full rounded-[32px] bg-[var(--m3-surface-container)] px-6 py-10 text-center">
                <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]">
                  <Search size={28} />
                </span>
                <div className="text-base font-medium">Aucun article trouvé</div>
                <div className="mt-1 text-sm text-[var(--m3-on-surface-variant)]">Aucun article ne correspond à la recherche.</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ===== Panier fixe (grand écran) ===== */}
      <aside
        aria-label="Vente en cours"
        className="hidden w-[360px] shrink-0 flex-col overflow-hidden rounded-[28px] bg-[var(--m3-surface-container)] lg:flex xl:w-[400px]"
      >
        <div className="flex items-center justify-between gap-2 px-5 pb-2 pt-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]">
              <ShoppingCart size={20} />
            </span>
            <h3 className="truncate text-lg font-medium">Vente en cours</h3>
          </div>
          {!panierVide && viderBtn}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {panierVide ? (
            <CartEmpty />
          ) : (
            <CartRows lignes={lignesPanier} isReadOnly={isReadOnly} changerQte={changerQte} retirerDuPanier={retirerDuPanier} />
          )}
        </div>

        <div className="space-y-4 bg-[var(--m3-surface-container-high)] px-5 py-4">
          <CartTotal total={totalPanier} nbArticles={nbArticles} />
          <CheckoutButton disabled={encaissementBloque} readOnly={isReadOnly} onClick={ouvrirCheckout} />
        </div>
      </aside>

      {/* ===== Barre flottante du panier (téléphone / tablette) ===== */}
      {!panierVide && (
        <div
          className={`m3-pop fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-2 rounded-[28px] bg-[var(--m3-surface-container-high)] p-2 md:inset-x-auto md:bottom-6 md:right-8 md:w-[440px] lg:hidden ${SHADOW_FLOAT}`}
        >
          <button
            type="button"
            onClick={() => setFeuilleOuverte(true)}
            aria-label="Voir le panier"
            className={`group relative flex h-14 min-w-0 flex-1 items-center gap-3 overflow-hidden rounded-full pl-2 pr-3 text-left ${M3_FOCUS}`}
          >
            <M3StateLayer />
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)]">
              <ShoppingCart size={20} />
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--m3-primary)] px-1 text-[11px] font-semibold tabular-nums text-[var(--m3-on-primary)]">
                {nbArticles}
              </span>
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-[var(--m3-on-surface-variant)]">Voir le panier</span>
              <span className="block truncate text-lg font-semibold leading-6 tabular-nums">{fmtHTG(totalPanier)}</span>
            </span>
          </button>
          <button
            type="button"
            disabled={!!isReadOnly}
            onClick={encaisser}
            className={`group relative flex h-14 shrink-0 items-center gap-1 overflow-hidden rounded-full bg-[var(--m3-primary)] pl-6 pr-4 text-base font-semibold text-[var(--m3-on-primary)] m3-press motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-40 ${M3_FOCUS}`}
          >
            <M3StateLayer />
            Encaisser
            <ChevronRight size={20} />
          </button>
        </div>
      )}

      {/* ===== Feuille du panier (téléphone / tablette) ===== */}
      {feuilleOuverte && !panierVide && (
        <div
          role="presentation"
          style={M3_VARS}
          onClick={(e) => {
            if (e.target === e.currentTarget) setFeuilleOuverte(false);
          }}
          className="m3-scrim fixed inset-0 z-[80] flex items-end justify-center bg-black/[0.32] md:items-center md:p-4 lg:hidden"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="vente-panier-titre"
            className="m3-sheet flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-[var(--m3-surface-container-low)] text-[var(--m3-on-surface)] shadow-[0_8px_24px_rgba(0,0,0,0.2)] md:max-w-[480px] md:rounded-[28px]"
          >
            <div aria-hidden="true" className="mx-auto mt-3 h-1 w-8 shrink-0 rounded-full bg-[var(--m3-on-surface-variant)] opacity-40 md:hidden" />
            <div className="flex items-center justify-between gap-2 px-6 pb-2 pt-3 md:pt-5">
              <h3 id="vente-panier-titre" className="text-2xl leading-8">
                Vente en cours
              </h3>
              <div className="-mr-2 flex items-center">
                {viderBtn}
                <button
                  type="button"
                  onClick={() => setFeuilleOuverte(false)}
                  aria-label="Fermer"
                  className={`group relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full text-[var(--m3-on-surface-variant)] ${M3_FOCUS}`}
                >
                  <M3StateLayer />
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
              <CartRows lignes={lignesPanier} isReadOnly={isReadOnly} changerQte={changerQte} retirerDuPanier={retirerDuPanier} />
            </div>

            <div className="space-y-4 bg-[var(--m3-surface-container-high)] px-6 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
              <CartTotal total={totalPanier} nbArticles={nbArticles} />
              <CheckoutButton disabled={encaissementBloque} readOnly={isReadOnly} onClick={encaisser} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
