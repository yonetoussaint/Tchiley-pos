import type { CSSProperties } from 'react';
import { AlertTriangle, Check, Receipt, TrendingUp } from 'lucide-react';

type StatusTone = { bg: string; fg: string };

type DashboardProduct = {
  id: string;
  nom: string;
  stockFermeture: number;
  unite: string;
};

type DashboardViewProps = {
  totalAujourdhui: number;
  nbVentesAujourdhui: number;
  produitsStockBas: DashboardProduct[];
  meilleuresVentes: [string, number][];
  themeVars: CSSProperties;
  lowStockTone: StatusTone;
  outOfStockTone: StatusTone;
  formatCurrency: (amount: number) => string;
};

export function DashboardView({
  totalAujourdhui,
  nbVentesAujourdhui,
  produitsStockBas,
  meilleuresVentes,
  themeVars,
  lowStockTone,
  outOfStockTone,
  formatCurrency,
}: DashboardViewProps) {
  const maxQte = Math.max(...meilleuresVentes.map(([, q]) => q), 1);
  const alertTone = produitsStockBas.length > 0 ? `${lowStockTone.bg} ${lowStockTone.fg}` : 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]';

  return (
    <div style={themeVars} className="min-h-0 flex-1 space-y-4 overflow-y-auto font-sans text-[var(--m3-on-surface)]">
      <div className="hidden md:block">
        <h2 className="text-[32px] font-bold leading-10 tracking-tight">Tableau de bord</h2>
        <p className="text-sm text-[var(--m3-on-surface-variant)]">Vue d&apos;ensemble de la journée</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <section className="col-span-2 flex items-center gap-4 rounded-[28px] bg-[var(--m3-primary-container)] p-5 text-[var(--m3-on-primary-container)] md:col-span-1">
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/40">
            <TrendingUp size={24} />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium opacity-80">Ventes du jour</div>
            <div className="break-words text-[28px] font-bold leading-9 tracking-tight tabular-nums">{formatCurrency(totalAujourdhui)}</div>
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
        <section className="rounded-[28px] bg-[var(--m3-surface-container-low)] p-4 md:p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-medium">Alerte stock bas</h3>
            {produitsStockBas.length > 0 && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums ${lowStockTone.bg} ${lowStockTone.fg}`}>{produitsStockBas.length}</span>
            )}
          </div>
          {produitsStockBas.length === 0 ? (
            <div className="mt-3 flex items-center gap-3 rounded-[20px] bg-[var(--m3-primary-container)] px-4 py-3 text-sm text-[var(--m3-on-primary-container)]">
              <Check size={18} className="shrink-0" /> Tous les stocks sont à un niveau sain.
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-[var(--m3-outline-variant)]">
              {produitsStockBas.map((product) => {
                const out = product.stockFermeture <= 0;
                const tone = out ? outOfStockTone : lowStockTone;
                return (
                  <li key={product.id} className="flex items-center gap-3 py-2.5">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone.bg} ${tone.fg}`}>
                      <AlertTriangle size={18} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{product.nom}</span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${tone.bg} ${tone.fg}`}>
                      {out ? 'Rupture' : `${product.stockFermeture} ${product.unite}${product.stockFermeture !== 1 ? 's' : ''}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-[28px] bg-[var(--m3-surface-container-low)] p-4 md:p-5">
          <h3 className="text-base font-medium">Articles les plus vendus</h3>
          {meilleuresVentes.length === 0 ? (
            <div className="mt-3 rounded-[20px] bg-[var(--m3-surface-container)] px-4 py-6 text-center text-sm text-[var(--m3-on-surface-variant)]">
              Aucune vente enregistrée pour l&apos;instant.
            </div>
          ) : (
            <ol className="mt-3 space-y-3.5">
              {meilleuresVentes.map(([nom, qte], index) => (
                <li key={nom}>
                  <div className="flex items-center gap-3">
                    <span
                      className={
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums ' +
                        (index === 0 ? 'bg-[var(--m3-primary)] text-[var(--m3-on-primary)]' : 'bg-[var(--m3-secondary-container)] text-[var(--m3-on-secondary-container)]')
                      }
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{nom}</span>
                    <span className="shrink-0 text-sm tabular-nums text-[var(--m3-on-surface-variant)]">
                      {qte} vendu{qte !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="ml-11 mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--m3-surface-container-highest)]">
                    <div
                      className={'h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ' + (index === 0 ? 'bg-[var(--m3-primary)]' : 'bg-[var(--m3-outline)]')}
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
