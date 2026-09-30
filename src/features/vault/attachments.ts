import { fmtHTG } from '../../shared/currency';
import { fmtTime12 } from '../../shared/dates';
import { COFFRE_KIND_META, coffreAccountLabel } from './model';
import type { CoffreEntry, CoffrePiece } from './types';

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export function readPieceFile(file: File): Promise<CoffrePiece> {
  return new Promise((resolve, reject) => {
    const supported = file.type.startsWith('image/') || file.type === 'application/pdf';
    if (!supported) return reject(new Error('Format non supporté : image ou PDF uniquement.'));
    if (file.size > MAX_ATTACHMENT_BYTES) return reject(new Error('Fichier trop lourd (5 Mo maximum).'));
    const reader = new FileReader();
    reader.onload = () => resolve({ ref: `PJ-${Date.now().toString(36).toUpperCase()}`, nom: file.name, type: file.type, dataUrl: String(reader.result) });
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.readAsDataURL(file);
  });
}

const escapeXml = (text: string) =>
  text.replace(/[<>&"']/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[character] as string);

export function coffrePieceUrl(entry: CoffreEntry): string {
  if (entry.piece?.dataUrl) return entry.piece.dataUrl;
  const sign = entry.kind === 'entree' ? '+' : entry.kind === 'sortie' ? '-' : '';
  const amountColor = entry.kind === 'entree' ? '#2F6B4F' : entry.kind === 'sortie' ? '#C1440E' : '#16181A';
  const account = coffreAccountLabel(entry.compte) + (entry.compteDest ? ' > ' + coffreAccountLabel(entry.compteDest) : '');
  const lines: Array<[string, string]> = [
    ['Date', entry.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) + ' ' + fmtTime12(entry.date)],
    ['Type', COFFRE_KIND_META[entry.kind].label],
    ['Catégorie', entry.categorie],
    ['Compte', account],
    ['Note', entry.note ?? '—'],
  ];
  const rows = lines.map(([key, value], index) =>
    `<text x="40" y="${170 + index * 34}" font-size="12" fill="#4B5560" letter-spacing="1.5">${escapeXml(key.toUpperCase())}</text>` +
    `<text x="190" y="${170 + index * 34}" font-size="15" fill="#16181A">${escapeXml(value)}</text>`
  ).join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="440" viewBox="0 0 560 440" font-family="Courier New, monospace">` +
    `<rect width="560" height="440" fill="#FBFAF6"/><rect x="8" y="8" width="544" height="424" fill="none" stroke="#16181A" stroke-width="3"/>` +
    `<rect x="8" y="8" width="544" height="64" fill="#16181A"/>` +
    `<text x="40" y="47" font-size="20" fill="#FBFAF6" letter-spacing="3">PIÈCE JUSTIFICATIVE</text>` +
    `<text x="40" y="106" font-size="12" fill="#4B5560" letter-spacing="1.5">RÉF.</text>` +
    `<text x="190" y="106" font-size="18" font-weight="bold" fill="#C1440E">${escapeXml(entry.piece?.ref ?? '—')}</text>` + rows +
    `<line x1="40" y1="350" x2="520" y2="350" stroke="#16181A" stroke-width="2" stroke-dasharray="6 4"/>` +
    `<text x="40" y="396" font-size="12" fill="#4B5560" letter-spacing="1.5">MONTANT</text>` +
    `<text x="520" y="398" font-size="26" font-weight="bold" text-anchor="end" fill="${amountColor}">${sign} ${escapeXml(fmtHTG(entry.montant))}</text>` +
    `<text x="40" y="424" font-size="10" fill="#9CA3AF">Document généré (données de test)</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export function downloadPiece(entry: CoffreEntry) {
  if (!entry.piece) return;
  const anchor = document.createElement('a');
  anchor.href = coffrePieceUrl(entry);
  anchor.download = entry.piece.nom;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
