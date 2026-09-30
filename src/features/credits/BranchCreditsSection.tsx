import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
import { Banknote, CalendarDays, Check, ChevronDown, ChevronRight, Eye, FileClock, Receipt, Search, Users, X } from 'lucide-react';
import { M3_FOCUS } from '../../components/ui/focus';
import { M3StateLayer, M3_VARS } from '../../components/ui/theme';
import { CreditPaymentModal } from './CreditPaymentModal';
import { creditBalance, creditPaid } from '../sales/creditUtils';
import { PAYMENT_METHODS, type PaymentMethodId } from '../sales/paymentMethods';
import { ReceiptModal as SalesReceiptModal } from '../sales/ReceiptModal';
import type { SaleRecord } from '../sales/types';
import { fmtHTG } from '../../shared/currency';
import { fmtTime12 } from '../../shared/dates';

export function BranchCreditsSection({
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

      {receiptSale && <SalesReceiptModal sale={receiptSale} onClose={() => setReceiptSale(null)} paymentLabel={PAYMENT_METHODS.find((method) => method.id === receiptSale.paiement)?.label || receiptSale.paiement} formatCurrency={fmtHTG} creditBalance={creditBalance(receiptSale)} />}

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
