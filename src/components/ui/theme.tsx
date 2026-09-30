import type { CSSProperties } from 'react';

export const M3_VARS = {
  '--m3-primary': '#00693F', '--m3-on-primary': '#FFFFFF',
  '--m3-primary-container': '#8BF4B7', '--m3-on-primary-container': '#00210F',
  '--m3-secondary-container': '#C7EBD2', '--m3-on-secondary-container': '#082013',
  '--m3-tertiary': '#7B5800', '--m3-on-tertiary': '#FFFFFF',
  '--m3-tertiary-container': '#FFDF9A', '--m3-on-tertiary-container': '#261A00',
  '--m3-surface': '#F4FBF4', '--m3-surface-container-lowest': '#FFFFFF',
  '--m3-surface-container-low': '#EEF6EE', '--m3-surface-container': '#E8F0E8',
  '--m3-surface-container-high': '#E2EAE2', '--m3-surface-container-highest': '#DCE4DC',
  '--m3-on-surface': '#171D18', '--m3-on-surface-variant': '#3E4941',
  '--m3-outline': '#6E7A70', '--m3-outline-variant': '#BDC9BF',
  '--m3-shape-lg-inc': '20px', '--m3-shape-xl-inc': '32px', '--m3-shape-xxl': '48px',
} as CSSProperties;

export const M3_STATUS = {
  ok: { bg: 'bg-[var(--m3-primary-container)]', fg: 'text-[var(--m3-on-primary-container)]' },
  low: { bg: 'bg-[#FFE08B]', fg: 'text-[#251A00]' },
  out: { bg: 'bg-[#FFDAD6]', fg: 'text-[#410002]' },
};

export const M3_CSS = `
:root {
  --m3-spring-spatial: cubic-bezier(.34,1.56,.64,1);
  --m3-spring-effects: cubic-bezier(.2,0,0,1);
}
@supports (transition-timing-function: linear(0, 1)) {
  :root {
    --m3-spring-spatial: linear(0, .18 5%, .55 12%, .9 20%, 1.06 28%, 1.09 34%, 1.04 44%, .99 58%, 1.005 74%, 1);
    --m3-spring-effects: linear(0, .35 7%, .72 16%, .92 28%, .99 42%, 1);
  }
}
@keyframes m3-in { from { opacity: 0; transform: translateY(-12px) scale(.98); } to { opacity: 1; transform: none; } }
.m3-in { animation: m3-in .5s var(--m3-spring-spatial); }
@keyframes m3e-scrim-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes m3e-pop-in { from { opacity: 0; transform: scale(.86) translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes m3-sheet-in { from { transform: translateY(100%); } to { transform: none; } }
@keyframes m3e-dialog-in { from { opacity: 0; transform: translate(-50%, -46%) scale(.86); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
@media (max-width: 639px) {
  .m3-press { transition: transform .45s var(--m3-spring-spatial), border-radius .45s var(--m3-spring-spatial), background-color .2s var(--m3-spring-effects); }
  .m3-press:active { transform: scale(.94); border-radius: 16px; }
  .m3-press-card { transition: transform .4s var(--m3-spring-spatial); }
  .m3-press-card:active { transform: scale(.97); }
  .m3-scrim { animation: m3e-scrim-in .25s var(--m3-spring-effects); }
  .m3-dialog { animation: m3e-dialog-in .5s var(--m3-spring-spatial); }
  .m3-sheet { animation: m3-sheet-in .4s var(--m3-spring-effects); }
  .m3-pop { animation: m3e-pop-in .5s var(--m3-spring-spatial); }
}
.m3-morph { transition: border-radius .5s var(--m3-spring-spatial), background-color .25s var(--m3-spring-effects), color .25s var(--m3-spring-effects); }
@keyframes m3-side-in { from { transform: translateX(100%); } to { transform: none; } }
.m3-side { animation: m3-side-in .4s var(--m3-spring-effects); }
@keyframes m3-morph {
  0% { border-radius: 50%; transform: rotate(0deg); }
  20% { border-radius: 24%; transform: rotate(72deg); }
  40% { border-radius: 50% 12% 50% 12%; transform: rotate(144deg); }
  60% { border-radius: 14%; transform: rotate(216deg); }
  80% { border-radius: 40% 60% 40% 60%; transform: rotate(288deg); }
  100% { border-radius: 50%; transform: rotate(360deg); }
}
.m3-loading { display: inline-block; background: currentColor; animation: m3-morph 2s var(--m3-spring-effects) infinite; }
@media (prefers-reduced-motion: reduce) {
  .m3-in, .m3-scrim, .m3-dialog, .m3-sheet, .m3-pop, .m3-side { animation: none; }
  .m3-press, .m3-press-card, .m3-morph { transition: none; }
  .m3-loading { animation: none; border-radius: 30%; }
}
`;

export function M3Loading({ size = 18 }: { size?: number }) {
  return <span role="progressbar" aria-label="Chargement" className="m3-loading shrink-0" style={{ width: size * 0.8, height: size * 0.8 }} />;
}

export function M3StateLayer({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 bg-current opacity-0 transition-opacity duration-150 group-hover:opacity-[0.08] group-focus-visible:opacity-[0.12] group-active:opacity-[0.12] motion-reduce:transition-none ${className}`}
    />
  );
}
