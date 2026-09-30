import { barcodeSvg } from './barcodeGen';
import { fmtHTG } from '../../shared/currency';

export type LabelFormat = 'sheet' | 'roll';

export type LabelItem = {
  nom: string;
  categorie: string;
  prix: number;
  unite: string;
  code: string;
  copies: number;
};

export type LabelOptions = {
  format: LabelFormat;
  showPrice: boolean;
};

export const LABEL_FORMATS: { id: LabelFormat; label: string; hint: string }[] = [
  { id: 'sheet', label: 'Planche A4', hint: '3 × 8 par page, à découper' },
  { id: 'roll', label: 'Rouleau 50×30', hint: 'Imprimante d\'étiquettes' },
];

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/* Label CSS, shared by the print document and the on-screen preview. Everything is scoped under .tl-*. */
export function labelCss(format: LabelFormat): string {
  const sheet = format === 'sheet';
  return `
.tl-sheet { display: flex; flex-wrap: wrap; align-content: flex-start; }
.tl-label {
  box-sizing: border-box; overflow: hidden; background: #fff; color: #000;
  font-family: Arial, Helvetica, sans-serif; break-inside: avoid; page-break-inside: avoid;
  display: flex; flex-direction: column; justify-content: space-between;
  ${sheet ? 'width: 63.5mm; height: 33.9mm; padding: 2mm 3mm; outline: 0.2mm dashed #b5b5b5; outline-offset: -0.2mm;' : 'width: 50mm; height: 30mm; padding: 1.6mm 2.4mm; page-break-after: always; break-after: page;'}
}
.tl-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 2mm; min-height: 0; }
.tl-name {
  font-weight: 700; line-height: 1.12; font-size: ${sheet ? '3.7mm' : '3.4mm'};
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;
}
.tl-price { font-weight: 800; white-space: nowrap; text-align: right; line-height: 1; font-size: ${sheet ? '4.4mm' : '4mm'}; }
.tl-unit { display: block; font-weight: 500; font-size: 2.4mm; margin-top: 0.6mm; color: #333; }
.tl-bars { flex: 1 1 auto; min-height: 0; display: flex; align-items: flex-end; justify-content: center; }
.tl-bars svg { display: block; width: 100%; height: auto; max-height: ${sheet ? '19mm' : '15.5mm'}; }
`;
}

function labelHtml(item: LabelItem, options: LabelOptions): string {
  const price = options.showPrice && item.prix > 0
    ? `<div class="tl-price">${escapeHtml(fmtHTG(item.prix))}<span class="tl-unit">/ ${escapeHtml(item.unite || 'unité')}</span></div>`
    : '';
  return (
    `<div class="tl-label"><div class="tl-head"><div class="tl-name">${escapeHtml(item.nom || 'Sans nom')}</div>${price}</div>` +
    `<div class="tl-bars">${barcodeSvg(item.code, { barHeight: 50, showText: true })}</div></div>`
  );
}

/** Flat list of labels markup, one per copy. */
export function labelsMarkup(items: LabelItem[], options: LabelOptions): string {
  return items
    .flatMap((item) => Array.from({ length: Math.max(1, item.copies) }, () => labelHtml(item, options)))
    .join('');
}

export function labelCount(items: LabelItem[]): number {
  return items.reduce((sum, item) => sum + Math.max(1, item.copies), 0);
}

function printDocument(items: LabelItem[], options: LabelOptions): string {
  const page = options.format === 'sheet' ? '@page { size: A4; margin: 10.7mm 6.75mm; }' : '@page { size: 50mm 30mm; margin: 0; }';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Étiquettes</title>
<style>${page}
html, body { margin: 0; padding: 0; background: #fff; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
${labelCss(options.format)}
</style></head><body><div class="tl-sheet">${labelsMarkup(items, options)}</div></body></html>`;
}

/**
 * Print labels through a hidden iframe (no popup, so it is not blocked on phones).
 * The print dialog also offers "Enregistrer en PDF".
 */
export function printLabels(items: LabelItem[], options: LabelOptions): void {
  if (!items.length) return;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(frame);

  const cleanup = () => window.setTimeout(() => frame.remove(), 500);
  const win = frame.contentWindow;
  const doc = frame.contentDocument ?? win?.document;
  if (!win || !doc) {
    frame.remove();
    return;
  }

  doc.open();
  doc.write(printDocument(items, options));
  doc.close();

  win.addEventListener('afterprint', cleanup, { once: true });
  window.setTimeout(() => {
    win.focus();
    win.print();
    /* Safety net if afterprint never fires (some mobile browsers). */
    window.setTimeout(() => frame.remove(), 120000);
  }, 250);
}
