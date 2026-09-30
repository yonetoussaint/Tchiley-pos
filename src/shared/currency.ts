export const fmtHTG = (amount: number) =>
  new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 0 }).format(Math.round(amount)) + ' HTG';
