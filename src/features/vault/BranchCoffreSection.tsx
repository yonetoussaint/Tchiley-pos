import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Banknote, Check, ChevronDown, Download, FileText, Paperclip, Plus, Search, Trash2, Vault, X } from 'lucide-react';
import { M3_FOCUS } from '../../components/ui/focus';
import { M3StateLayer, M3_STATUS, M3_VARS } from '../../components/ui/theme';
import type { Branch } from '../../shared/types';
import { fmtHTG } from '../../shared/currency';
import { fmtTime12, isSameDay, MONTHS_FR } from '../../shared/dates';
import { summarizeCash, type CashEntry } from '../reports/cash';
import type { SaleRecord } from '../sales/types';
import { COFFRE_ACCOUNTS, COFFRE_CATEGORIES, COFFRE_KIND_META, COFFRE_PERIODS, coffreAccountLabel, coffreBalances } from './model';
import { coffrePieceUrl, downloadPiece, readPieceFile } from './attachments';
import type { CoffreAccountId, CoffreEntry, CoffreKind, CoffrePeriod, CoffrePiece } from './types';
import { useIsPhone } from '../../shared/useIsPhone';

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

export function BranchCoffreSection({
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


