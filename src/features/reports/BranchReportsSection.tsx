import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { ArrowDownLeft, ArrowUpRight, Banknote, Check, ChevronDown, Plus, Trash2, TrendingUp } from 'lucide-react';
import { M3_FOCUS } from '../../components/ui/focus';
import { M3StateLayer, M3_STATUS, M3_VARS } from '../../components/ui/theme';
import type { Branch } from '../../shared/types';
import type { Product } from '../products/types';
import { PAYMENT_METHODS } from '../sales/paymentMethods';
import type { SaleRecord } from '../sales/types';
import { CASH_ENTRY_META, REPORT_TABS, summarizeCash, type CashEntry, type CashEntryType, type CashSummary, type ReportPeriod } from './cash';
import { fmtHTG } from '../../shared/currency';
import { fmtTime12, isSameDay, MONTHS_FR } from '../../shared/dates';

export function BranchAnalyticsSection({
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

export function DailyReportDesktop({
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

export function PeriodReportDesktop({
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
export function CashEntrySheet({
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

export function DailyReportMobile({
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

export function PeriodReportMobile({
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

export function BranchReportsSection({
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

