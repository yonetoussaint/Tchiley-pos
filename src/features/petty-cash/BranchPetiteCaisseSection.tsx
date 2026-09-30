import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Coins,
  Plus,
  Search,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { M3_FOCUS } from '../../components/ui/focus';
import { M3StateLayer, M3_STATUS, M3_VARS } from '../../components/ui/theme';
import type { Branch } from '../../shared/types';
import { fmtHTG } from '../../shared/currency';
import { fmtTime12, MONTHS_FR, isSameDay } from '../../shared/dates';
import { COFFRE_PERIODS } from '../vault/model';
import type { PettyCount, PettyEntry, PettyKind } from './types';
import { PETTY_CATEGORIES, PETTY_REAPPRO_CATEGORY, pettyBalance } from './model';

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

export function BranchPetiteCaisseSection({
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
  const [period, setPeriod] = useState<'jour' | 'mois' | 'annee' | 'tout'>('mois');
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
    () => entries.filter((e) => inPeriod(e.date)),
    [entries, period, year, month, selectedDate]
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

          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filtrer par type">
            {m3Chip(kindFilter === 'all', 'Tous', () => setKindFilter('all'))}
            {m3Chip(kindFilter === 'depense', 'Dépenses', () => setKindFilter('depense'))}
            {m3Chip(kindFilter === 'reappro', 'Réappros', () => setKindFilter('reappro'))}
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filtrer par catégorie">
            {m3Chip(categoryFilter === 'all', 'Toutes catégories', () => setCategoryFilter('all'))}
            {PETTY_CATEGORIES.map((c) => m3Chip(categoryFilter === c, c, () => setCategoryFilter(c)))}
          </div>

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

          <PettyCountPanel
            theorique={balance}
            onSave={(compte, note) => onAddCount({ date: new Date(), theorique: balance, compte, ecart: compte - balance, note })}
          />

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

          <section className="space-y-3 rounded-[28px] bg-[var(--m3-surface-container-low)] p-4">
            <h3 className="text-base font-medium">Dépenses par catégorie · {periodLabel}</h3>
            {m3Breakdown()}
          </section>
        </div>

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
          {segmented('Période', COFFRE_PERIODS.map((p): [string, string] => [p.id, p.label]), period, (id) => setPeriod(id as 'jour' | 'mois' | 'annee' | 'tout'), 'w-[340px]')}
          <div className="ml-auto text-sm tabular-nums text-[var(--m3-on-surface-variant)]" aria-live="polite">
            {rows.length} mouvement{rows.length !== 1 ? 's' : ''} · {periodLabel}
          </div>
        </div>

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
