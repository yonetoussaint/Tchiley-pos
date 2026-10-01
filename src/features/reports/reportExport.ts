import type { Branch } from '../../shared/types';
import { MONTHS_FR, fmtTime12, isSameDay } from '../../shared/dates';
import { fmtHTG } from '../../shared/currency';
import type { Product, ProductMovement } from '../products/types';
import { PAYMENT_METHODS } from '../sales/paymentMethods';
import type { SaleRecord } from '../sales/types';
import { CASH_ENTRY_META, summarizeCash, type CashEntry, type CashSummary, type ReportPeriod } from './cash';
import { summarizeInventory } from './inventoryAdjustments';

/* =========================================================================
   Export of a report (daily / monthly / annual) as image, PDF or paper.
   The report is rendered from the DATA into a dedicated A4 document, so the
   result is identical on phone and desktop and never depends on what is
   visible on screen (collapsed rows, scroll areas, buttons...).
   ========================================================================= */

export type ReportInput = {
  branch: Branch;
  period: ReportPeriod;
  selectedDate: Date;
  ventes: SaleRecord[];
  entries: CashEntry[];
  products: Product[];
  movements: ProductMovement[];
};

export type ExportKind = 'image' | 'pdf';

const DOC_WIDTH = 794; /* A4 width in CSS px at 96 dpi */
const DOC_PADDING = 36;

const esc = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const num = (n: number) => new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 0 }).format(Math.round(n));
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;
const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const pad2 = (n: number) => String(n).padStart(2, '0');

function periodTest(period: ReportPeriod, date: Date): (d: Date) => boolean {
  const year = date.getFullYear();
  const month = date.getMonth();
  if (period === 'daily') return (d) => isSameDay(d, date);
  if (period === 'monthly') return (d) => d.getFullYear() === year && d.getMonth() === month;
  return (d) => d.getFullYear() === year;
}

const PERIOD_TITLE: Record<ReportPeriod, string> = {
  daily: 'Rapport journalier',
  monthly: 'Rapport mensuel',
  annual: 'Rapport annuel',
};

function periodLabel(period: ReportPeriod, date: Date): string {
  if (period === 'daily') {
    return capitalize(date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  }
  if (period === 'monthly') return `${MONTHS_FR[date.getMonth()]} ${date.getFullYear()}`;
  return String(date.getFullYear());
}

export function reportFileName(input: Pick<ReportInput, 'branch' | 'period' | 'selectedDate'>, ext: 'png' | 'pdf'): string {
  const d = input.selectedDate;
  const when =
    input.period === 'daily'
      ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
      : input.period === 'monthly'
        ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
        : String(d.getFullYear());
  const branch = input.branch.nom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const kind = input.period === 'daily' ? 'journalier' : input.period === 'monthly' ? 'mensuel' : 'annuel';
  return `rapport-${kind}-${branch || 'tchiley'}-${when}.${ext}`;
}

/* ------------------------------------------------------------------ document */

const COLUMNS: Array<{ label: string; get: (s: CashSummary) => number; tone?: 'neg' | 'pos'; strong?: boolean }> = [
  { label: 'Total brut', get: (s) => s.brut },
  { label: 'Crédits', get: (s) => s.credits, tone: 'neg' },
  { label: 'Conso. internes', get: (s) => s.consommations, tone: 'neg' },
  { label: 'Achats', get: (s) => s.achats, tone: 'neg' },
  { label: 'Renflou.', get: (s) => s.renflouements, tone: 'pos' },
  { label: 'Rembours.', get: (s) => s.remboursements, tone: 'pos' },
  { label: 'Cash net', get: (s) => s.cashNet },
  { label: 'Cash en main', get: (s) => s.cashEnMain, tone: 'pos', strong: true },
];

export function reportCss(): string {
  return `
.rp-doc, .rp-doc * { box-sizing: border-box; }
.rp-doc {
  width: 100%; background: #fff; color: #171D18; padding: var(--rp-pad, 0);
  font-family: Inter, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.4;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.rp-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; padding-bottom: 12px; border-bottom: 3px solid #00693F; }
.rp-brand { font-size: 11px; font-weight: 700; letter-spacing: .28em; color: #00693F; }
.rp-branch { margin-top: 2px; font-size: 13px; color: #3E4941; }
.rp-right { text-align: right; }
.rp-title { font-size: 24px; font-weight: 800; letter-spacing: -.01em; line-height: 1.15; }
.rp-sub { margin-top: 2px; font-size: 12.5px; color: #3E4941; }
.rp-kpis { display: grid; grid-template-columns: 1.3fr 1fr 1fr 1fr; gap: 8px; margin-top: 16px; }
.rp-kpi { border-radius: 14px; background: #E8F0E8; padding: 10px 12px; min-width: 0; }
.rp-kpi.main { background: #8BF4B7; color: #00210F; }
.rp-kpi .l { font-size: 10.5px; color: #3E4941; }
.rp-kpi.main .l { color: #00210F; opacity: .8; }
.rp-kpi .v { margin-top: 2px; font-size: 17px; font-weight: 800; white-space: nowrap; }
.rp-kpi.main .v { font-size: 20px; }
.rp-section { margin-top: 18px; }
.rp-section h3 { margin: 0 0 6px; font-size: 13px; font-weight: 700; }
.rp-section h3 small { font-weight: 500; color: #3E4941; font-size: 11px; margin-left: 6px; }
.rp-two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.rp-box { border: 1px solid #BDC9BF; border-radius: 12px; padding: 8px 12px; }
.rp-box .cap { font-size: 10.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.rp-line { display: flex; justify-content: space-between; gap: 10px; padding: 5px 0; border-bottom: 1px solid #E2EAE2; }
.rp-line.total { border-bottom: 0; border-top: 1px solid #6E7A70; margin-top: 2px; padding-top: 6px; font-weight: 700; }
.rp-line .hint { display: block; font-size: 10px; color: #3E4941; }
.rp-eq { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 8px; }
.rp-eq > div { border-radius: 12px; background: #E8F0E8; padding: 8px 12px; }
.rp-eq > div.out { background: #FFDAD6; color: #410002; }
.rp-eq > div.fin { background: #8BF4B7; color: #00210F; }
.rp-eq .l { font-size: 10.5px; opacity: .85; }
.rp-eq .v { font-size: 15px; font-weight: 800; white-space: nowrap; }
.rp-neg { color: #BA1A1A; }
.rp-pos { color: #00693F; }
.rp-muted { color: #6E7A70; }
table.rp-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.rp-table th { background: #E2EAE2; color: #3E4941; font-size: 10px; font-weight: 600; padding: 6px 6px; text-align: right; }
.rp-table td { padding: 5px 6px; text-align: right; border-bottom: 1px solid #E2EAE2; }
.rp-table th:first-child, .rp-table td:first-child { text-align: left; }
.rp-table.wide { font-size: 10.5px; }
.rp-table .t-left { text-align: left; }
.rp-table tfoot td { background: #8BF4B7; color: #00210F; font-weight: 700; border-bottom: 0; padding-top: 7px; padding-bottom: 7px; }
.rp-table thead { display: table-header-group; }
.rp-bar { height: 6px; border-radius: 3px; background: #DCE4DC; overflow: hidden; margin-top: 3px; }
.rp-bar > span { display: block; height: 100%; background: #00693F; }
.rp-bar.credit > span { background: #7B5800; }
.rp-bar.mobile > span { background: #6E7A70; }
.rp-empty { padding: 14px; text-align: center; color: #6E7A70; border: 1px dashed #BDC9BF; border-radius: 12px; }
.rp-inv-sum { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 8px; }
.rp-inv-sum > div { border-radius: 12px; background: #E8F0E8; padding: 7px 12px; }
.rp-inv-sum .l { font-size: 10.5px; color: #3E4941; }
.rp-inv-sum .v { font-size: 14px; font-weight: 800; white-space: nowrap; }
.rp-session { margin-top: 8px; }
.rp-session .s-head { display: flex; justify-content: space-between; gap: 10px; font-weight: 600; padding: 4px 0; }
.rp-foot { margin-top: 22px; padding-top: 8px; border-top: 1px solid #BDC9BF; display: flex; justify-content: space-between; font-size: 10px; color: #6E7A70; }
@media print {
  .rp-block, .rp-row, .rp-section h3 { break-inside: avoid; page-break-inside: avoid; }
  .rp-section h3 { break-after: avoid; }
  tr.rp-row { break-inside: avoid; }
}
`;
}

export function reportBodyHtml(input: ReportInput): string {
  const { branch, period, selectedDate, ventes, entries, products, movements } = input;
  const inPeriod = periodTest(period, selectedDate);
  const sum = summarizeCash(ventes, entries, inPeriod);
  const deductions = sum.credits + sum.consommations + sum.achats;
  const additions = sum.renflouements + sum.remboursements;

  const byMode = PAYMENT_METHODS.map((m) => {
    const list = ventes.filter((v) => v.statut !== 'annulee' && inPeriod(v.date) && v.paiement === m.id);
    return { ...m, total: list.reduce((acc, v) => acc + v.total, 0), count: list.length };
  });
  const maxMode = Math.max(...byMode.map((m) => m.total), 1);

  const kpis = `
<section class="rp-kpis rp-block">
  <div class="rp-kpi main"><div class="l">Cash en main</div><div class="v">${esc(fmtHTG(sum.cashEnMain))}</div></div>
  <div class="rp-kpi"><div class="l">Total brut</div><div class="v">${esc(fmtHTG(sum.brut))}</div></div>
  <div class="rp-kpi"><div class="l">Cash net</div><div class="v">${esc(fmtHTG(sum.cashNet))}</div></div>
  <div class="rp-kpi"><div class="l">Ventes validées</div><div class="v">${sum.nbVentes}</div></div>
</section>`;

  const line = (label: string, value: number, sign: '-' | '+', hint?: string) =>
    `<div class="rp-line"><span>${esc(label)}${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</span>` +
    `<span class="${sign === '-' ? 'rp-neg' : 'rp-pos'}">${sign === '-' ? '−' : '+'} ${esc(fmtHTG(value))}</span></div>`;

  const ledger = `
<section class="rp-section rp-block">
  <h3>Détail de la caisse</h3>
  <div class="rp-two">
    <div class="rp-box"><div class="cap rp-neg">Déductions</div>
      ${line('Crédits', sum.credits, '-', 'Ventes à crédit non encaissées')}
      ${line('Consommations internes', sum.consommations, '-')}
      ${line('Achats', sum.achats, '-')}
      <div class="rp-line total"><span>Total déductions</span><span class="rp-neg">− ${esc(fmtHTG(deductions))}</span></div>
    </div>
    <div class="rp-box"><div class="cap rp-pos">Additions</div>
      ${line('Renflouement', sum.renflouements, '+')}
      ${line('Remboursement', sum.remboursements, '+', 'Crédits reçus + saisies manuelles')}
      <div class="rp-line total"><span>Total additions</span><span class="rp-pos">+ ${esc(fmtHTG(additions))}</span></div>
    </div>
  </div>
  <div class="rp-eq">
    <div><div class="l">Cash net</div><div class="v">${esc(fmtHTG(sum.cashNet))}</div></div>
    <div class="out"><div class="l">− Paiements mobiles (MonCash / NatCash)</div><div class="v">${esc(fmtHTG(sum.mobile))}</div></div>
    <div class="fin"><div class="l">= Cash en main</div><div class="v">${esc(fmtHTG(sum.cashEnMain))}</div></div>
  </div>
</section>`;

  const modes = `
<section class="rp-section rp-block">
  <h3>Ventes par mode de paiement</h3>
  <table class="rp-table">
    <thead><tr><th>Mode</th><th>Ventes</th><th>Montant (HTG)</th></tr></thead>
    <tbody>
    ${byMode
      .map((m) => {
        const cls = m.id === 'credit' ? 'credit' : m.id === 'especes' ? '' : 'mobile';
        return `<tr class="rp-row"><td>${esc(m.label)}<div class="rp-bar ${cls}"><span style="width:${((m.total / maxMode) * 100).toFixed(1)}%"></span></div></td><td>${m.count}</td><td>${num(m.total)}</td></tr>`;
      })
      .join('')}
    </tbody>
  </table>
</section>`;

  let detail = '';
  if (period === 'daily') {
    const dayEntries = entries.filter((e) => inPeriod(e.date)).sort((a, b) => b.date.getTime() - a.date.getTime());
    detail = `
<section class="rp-section">
  <h3>Mouvements du jour<small>${dayEntries.length}</small></h3>
  ${
    dayEntries.length === 0
      ? '<div class="rp-empty">Aucun mouvement pour cette date.</div>'
      : `<table class="rp-table"><thead><tr><th>Heure</th><th class="t-left">Type</th><th class="t-left">Note</th><th>Montant (HTG)</th></tr></thead><tbody>
${dayEntries
  .map((e) => {
    const meta = CASH_ENTRY_META[e.type];
    const out = meta.sign === -1;
    return `<tr class="rp-row"><td>${esc(fmtTime12(e.date))}</td><td class="t-left">${esc(meta.label)}</td><td class="t-left rp-muted">${esc(e.note ?? '—')}</td><td class="${out ? 'rp-neg' : 'rp-pos'}">${out ? '−' : '+'} ${num(e.montant)}</td></tr>`;
  })
  .join('')}
</tbody></table>`
  }
</section>`;
  } else {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const rows =
      period === 'monthly'
        ? Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => {
            const day = i + 1;
            const test = (d: Date) => d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
            return { label: `${pad2(day)} ${MONTHS_FR[month].slice(0, 3)}`, s: summarizeCash(ventes, entries, test) };
          })
        : MONTHS_FR.map((name, m) => {
            const test = (d: Date) => d.getFullYear() === year && d.getMonth() === m;
            return { label: name, s: summarizeCash(ventes, entries, test) };
          });
    const visible = rows.filter((r) => r.s.nbVentes > 0 || r.s.achats + r.s.consommations + r.s.renflouements + r.s.remboursements > 0);
    const cell = (c: (typeof COLUMNS)[number], s: CashSummary) => {
      const v = c.get(s);
      const tone = c.tone === 'neg' || (c.tone === 'pos' && v < 0) ? 'rp-neg' : c.tone === 'pos' ? 'rp-pos' : '';
      return `<td class="${tone}" ${c.strong ? 'style="font-weight:700"' : ''}>${v === 0 ? '<span class="rp-muted">—</span>' : num(v)}</td>`;
    };
    detail = `
<section class="rp-section">
  <h3>${period === 'monthly' ? 'Par jour' : 'Par mois'}<small>Montants en HTG · ${visible.length} ${period === 'monthly' ? 'jour' : 'mois'}${visible.length !== 1 && period === 'monthly' ? 's' : ''} actif${visible.length !== 1 ? 's' : ''}</small></h3>
  ${
    visible.length === 0
      ? '<div class="rp-empty">Aucune activité sur cette période.</div>'
      : `<table class="rp-table wide"><thead><tr><th>${period === 'monthly' ? 'Jour' : 'Mois'}</th>${COLUMNS.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>
${visible.map((r) => `<tr class="rp-row"><td style="font-weight:600">${esc(r.label)}</td>${COLUMNS.map((c) => cell(c, r.s)).join('')}</tr>`).join('')}
</tbody><tfoot><tr class="rp-row"><td>Total</td>${COLUMNS.map((c) => `<td>${num(c.get(sum))}</td>`).join('')}</tr></tfoot></table>`
  }
</section>`;
  }

  const inv = summarizeInventory(movements, products, branch.id, inPeriod);
  let inventory = '';
  if (inv.sessions.length > 0) {
    const t = inv.totals;
    inventory = `
<section class="rp-section">
  <h3>Écarts d'inventaire<small>Valeurs au prix d'achat, sans effet sur la caisse</small></h3>
  <div class="rp-inv-sum rp-block">
    <div><div class="l">Manque</div><div class="v rp-neg">${esc(fmtHTG(t.loss))}</div></div>
    <div><div class="l">Surplus</div><div class="v rp-pos">${esc(fmtHTG(t.gain))}</div></div>
    <div><div class="l">Impact net</div><div class="v ${t.net < 0 ? 'rp-neg' : ''}">${esc(fmtHTG(t.net))}</div></div>
  </div>
  ${inv.sessions
    .map(
      (s) => `<div class="rp-session rp-block" ${s.cancelled ? 'style="opacity:.6"' : ''}>
    <div class="s-head"><span>${esc(period === 'daily' ? fmtTime12(s.date) : s.date.toLocaleDateString('fr-FR'))}${s.note ? ` · ${esc(s.note)}` : ''}${s.cancelled ? ' · Annulé, stock rétabli' : ''}</span><span class="${s.net < 0 ? 'rp-neg' : ''}">${esc(fmtHTG(s.net))}</span></div>
    <table class="rp-table"><thead><tr><th>Produit</th><th>Écart</th><th>Valeur (HTG)</th></tr></thead><tbody>
    ${s.lines
      .map(
        (l) =>
          `<tr class="rp-row"><td>${esc(l.nom)}</td><td class="${l.delta < 0 ? 'rp-neg' : 'rp-pos'}">${esc(signed(l.delta))} ${esc(l.unite)}</td><td>${num(l.value)}</td></tr>`
      )
      .join('')}
    </tbody></table></div>`
    )
    .join('')}
</section>`;
  }

  const generated = new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
  return `<div class="rp-doc">
<header class="rp-head rp-block">
  <div><div class="rp-brand">TCHILEY</div><div class="rp-branch">${esc(branch.nom)}${branch.ville ? ` · ${esc(branch.ville)}` : ''}</div></div>
  <div class="rp-right"><div class="rp-title">${PERIOD_TITLE[period]}</div><div class="rp-sub">${esc(periodLabel(period, selectedDate))}</div></div>
</header>
${kpis}${ledger}${modes}${detail}${inventory}
<footer class="rp-foot rp-block"><span>Cash net = Brut − Crédits − Consommations − Achats + Renflouements + Remboursements</span><span>Généré le ${esc(generated)}</span></footer>
</div>`;
}

/* --------------------------------------------------------------------- print */

function printDocument(input: ReportInput): string {
  const title = `${PERIOD_TITLE[input.period]} — ${periodLabel(input.period, input.selectedDate)}`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>@page { size: A4; margin: 12mm; }
html, body { margin: 0; padding: 0; background: #fff; }
${reportCss()}
</style></head><body>${reportBodyHtml(input)}</body></html>`;
}

/**
 * Print through a hidden iframe (no popup, so it is never blocked on phones).
 * The print dialog also offers "Enregistrer en PDF" (vector, selectable text).
 */
export function printReport(input: ReportInput): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(frame);

  const win = frame.contentWindow;
  const doc = frame.contentDocument ?? win?.document;
  if (!win || !doc) {
    frame.remove();
    throw new Error('print-unavailable');
  }

  doc.open();
  doc.write(printDocument(input));
  doc.close();

  win.addEventListener('afterprint', () => window.setTimeout(() => frame.remove(), 500), { once: true });
  window.setTimeout(() => {
    win.focus();
    win.print();
    /* Safety net if afterprint never fires (some mobile browsers). */
    window.setTimeout(() => frame.remove(), 120000);
  }, 250);
}

/* --------------------------------------------------------------- image / PDF */

type Rendered = { canvas: HTMLCanvasElement; scale: number; height: number; breaks: number[] };

/** Renders the report off-screen and returns a canvas of it plus safe page-break positions (CSS px). */
async function renderReport(input: ReportInput): Promise<Rendered> {
  const wrapper = document.createElement('div');
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.style.cssText = `position:fixed;left:-10000px;top:0;width:${DOC_WIDTH}px;pointer-events:none;`;
  wrapper.innerHTML = `<style>${reportCss()}</style>${reportBodyHtml(input)}`;
  document.body.appendChild(wrapper);

  try {
    const root = wrapper.querySelector<HTMLElement>('.rp-doc');
    if (!root) throw new Error('render-failed');
    root.style.setProperty('--rp-pad', `${DOC_PADDING}px`);
    root.style.width = `${DOC_WIDTH}px`;
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    const rootTop = root.getBoundingClientRect().top;
    const height = Math.ceil(root.getBoundingClientRect().height);
    const breaks = Array.from(root.querySelectorAll<HTMLElement>('.rp-block, .rp-row'))
      .map((el) => Math.round(el.getBoundingClientRect().bottom - rootTop))
      .filter((y) => y > 0 && y < height)
      .sort((a, b) => a - b);

    /* Keep the canvas under the browser limits (iOS Safari ~16M px) while staying sharp. */
    const scale = Math.max(1, Math.min(2, Math.sqrt(12_000_000 / (DOC_WIDTH * height))));
    const { toCanvas } = await import('html-to-image');
    const canvas = await toCanvas(root, {
      pixelRatio: scale,
      backgroundColor: '#ffffff',
      width: DOC_WIDTH,
      height,
      skipFonts: true,
      cacheBust: false,
    });
    return { canvas, scale, height, breaks };
  } finally {
    wrapper.remove();
  }
}

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('blob-failed'))), type, quality));

export async function reportToImageBlob(input: ReportInput): Promise<Blob> {
  const { canvas } = await renderReport(input);
  return canvasToBlob(canvas, 'image/png');
}

export async function reportToPdfBlob(input: ReportInput): Promise<Blob> {
  const [{ canvas, scale, height, breaks }, { jsPDF }] = await Promise.all([renderReport(input), import('jspdf')]);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const pxPerMm = DOC_WIDTH / 210;
  const BOTTOM_MM = 11; /* room for the page number */
  const NEXT_PAGE_TOP_MM = 8;

  /* Choose the page cuts first (on rows / blocks, never through one), so we know the page count. */
  const cuts: Array<{ from: number; to: number; topMm: number }> = [];
  let start = 0;
  while (start < height - 1) {
    const topMm = cuts.length === 0 ? 0 : NEXT_PAGE_TOP_MM;
    const cap = Math.floor((297 - topMm - BOTTOM_MM) * pxPerMm);
    let end = start + cap;
    if (end >= height) {
      end = height;
    } else {
      const safe = [...breaks].reverse().find((y) => y <= end && y > start + cap * 0.35);
      if (safe) end = safe;
    }
    cuts.push({ from: start, to: end, topMm });
    start = end;
  }

  const totalPages = cuts.length;
  for (let i = 0; i < totalPages; i++) {
    const { from, to, topMm } = cuts[i];
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = Math.max(1, Math.round((to - from) * scale));
    const ctx = slice.getContext('2d');
    if (!ctx) throw new Error('canvas-unavailable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, Math.round(from * scale), canvas.width, slice.height, 0, 0, canvas.width, slice.height);

    if (i > 0) pdf.addPage();
    pdf.addImage(slice.toDataURL('image/jpeg', 0.95), 'JPEG', 0, topMm, 210, (to - from) / pxPerMm, undefined, 'FAST');
    pdf.setFontSize(8);
    pdf.setTextColor(110, 122, 112);
    pdf.text(`${i + 1} / ${totalPages}`, 105, 293, { align: 'center' });
  }
  return pdf.output('blob');
}

/* --------------------------------------------------------------- share / save */

export function canShareFiles(): boolean {
  try {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File(['x'], 'x.png', { type: 'image/png' })] })
    );
  } catch {
    return false;
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Builds the file, then opens the system share sheet ('share') or saves it ('download'). */
export async function exportReport(input: ReportInput, kind: ExportKind, action: 'share' | 'download'): Promise<void> {
  const blob = kind === 'pdf' ? await reportToPdfBlob(input) : await reportToImageBlob(input);
  const filename = reportFileName(input, kind === 'pdf' ? 'pdf' : 'png');

  if (action === 'share' && canShareFiles()) {
    const file = new File([blob], filename, { type: blob.type });
    try {
      await navigator.share({
        files: [file],
        title: `${PERIOD_TITLE[input.period]} — ${periodLabel(input.period, input.selectedDate)}`,
      });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return; /* user closed the sheet */
      /* Any other failure: fall back to a plain download. */
    }
  }
  downloadBlob(blob, filename);
}
