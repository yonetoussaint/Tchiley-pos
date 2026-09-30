/**
 * Internal barcode generation and rendering for products that have no factory code
 * (sable, blocs, fer, etc.). Generated codes are valid EAN-13 in the "20x" in-store range,
 * which no manufacturer uses, so they can never clash with a real product and every
 * scanner (and the scanner dialog of this app) reads them.
 *
 * Rendering is pure SVG: EAN-13 for EAN-13 / UPC-A codes, Code 128 for anything else.
 */

const INTERNAL_PREFIX = '200';

export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

export function isValidUpcA(code: string): boolean {
  return /^\d{12}$/.test(code) && isValidEan13(`0${code}`);
}

/** True for codes made by this app (so the "sans code" / "généré" badges can tell them apart). */
export function isInternalCode(code: string): boolean {
  return code.startsWith(INTERNAL_PREFIX) && isValidEan13(code);
}

function internalSequence(code: string): number {
  return isInternalCode(code) ? Number(code.slice(INTERNAL_PREFIX.length, 12)) : 0;
}

/** Next free internal code, given every code already in use (existing or just generated). */
export function generateInternalCode(inUse: Iterable<string>): string {
  const used = new Set<string>();
  let max = 0;
  for (const raw of inUse) {
    const code = raw.trim();
    if (!code) continue;
    used.add(code);
    max = Math.max(max, internalSequence(code));
  }
  let seq = max + 1;
  for (;;) {
    const body = `${INTERNAL_PREFIX}${String(seq).padStart(9, '0')}`;
    const code = `${body}${ean13CheckDigit(body)}`;
    if (!used.has(code)) return code;
    seq += 1;
  }
}

/* ----------------------------------------------------------------------------- EAN-13 */

const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_R = EAN_L.map((bits) => bits.replace(/[01]/g, (b) => (b === '1' ? '0' : '1')));
const EAN_G = EAN_R.map((bits) => bits.split('').reverse().join(''));
const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

function ean13Modules(code: string): string {
  const parity = EAN_PARITY[Number(code[0])];
  let bits = '101';
  for (let i = 0; i < 6; i += 1) {
    const digit = Number(code[i + 1]);
    bits += parity[i] === 'L' ? EAN_L[digit] : EAN_G[digit];
  }
  bits += '01010';
  for (let i = 7; i < 13; i += 1) bits += EAN_R[Number(code[i])];
  return `${bits}101`;
}

/* -------------------------------------------------------------------------- Code 128 */

/* Bar/space widths for symbols 0..106 (106 = stop, 7 elements). */
const C128 = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

function code128Modules(text: string): string {
  const allDigits = /^\d+$/.test(text) && text.length >= 4 && text.length % 2 === 0;
  const values: number[] = [];
  let start: number;
  if (allDigits) {
    start = 105;
    for (let i = 0; i < text.length; i += 2) values.push(Number(text.slice(i, i + 2)));
  } else {
    start = 104;
    for (const ch of text) {
      const v = ch.charCodeAt(0) - 32;
      values.push(v >= 0 && v <= 94 ? v : 0);
    }
  }
  let sum = start;
  values.forEach((v, i) => {
    sum += v * (i + 1);
  });
  const symbols = [start, ...values, sum % 103, 106];
  let bits = '';
  symbols.forEach((symbol) => {
    const widths = C128[symbol];
    for (let i = 0; i < widths.length; i += 1) bits += (i % 2 === 0 ? '1' : '0').repeat(Number(widths[i]));
  });
  return bits;
}

/* -------------------------------------------------------------------------- Rendering */

export type BarcodeSymbology = 'ean13' | 'code128';

/** Pick how a stored code should be printed. UPC-A is printed as EAN-13 with a leading 0 (same bars). */
export function resolveSymbology(code: string): { kind: BarcodeSymbology; payload: string } {
  if (isValidEan13(code)) return { kind: 'ean13', payload: code };
  if (isValidUpcA(code)) return { kind: 'ean13', payload: `0${code}` };
  return { kind: 'code128', payload: code };
}

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] as string);
}

/**
 * Self-contained SVG for a code. The SVG scales to the width of its container
 * (width:100%), so the label CSS decides the printed size. Bars are merged into
 * runs, black on white, with a quiet zone on each side.
 */
export function barcodeSvg(code: string, options: { barHeight?: number; showText?: boolean } = {}): string {
  const { barHeight = 50, showText = true } = options;
  const { kind, payload } = resolveSymbology(code);
  const bits = kind === 'ean13' ? ean13Modules(payload) : code128Modules(payload);
  const quiet = 10;
  const width = bits.length + quiet * 2;
  const textHeight = showText ? 14 : 0;
  const height = barHeight + textHeight;

  let rects = '';
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === '1') {
      let j = i;
      while (j < bits.length && bits[j] === '1') j += 1;
      rects += `<rect x="${quiet + i}" y="0" width="${j - i}" height="${barHeight}"/>`;
      i = j;
    } else {
      i += 1;
    }
  }

  const label = kind === 'ean13' ? code : payload;
  const text = showText
    ? `<text x="${width / 2}" y="${barHeight + 11}" text-anchor="middle" font-family="'Courier New',monospace" font-size="10.5" letter-spacing="${kind === 'ean13' ? 2.4 : 1}" fill="#000">${escapeXml(label)}</text>`
    : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges" role="img" aria-label="Code-barres ${escapeXml(label)}">` +
    `<rect width="${width}" height="${height}" fill="#fff"/><g fill="#000">${rects}</g>${text}</svg>`
  );
}
