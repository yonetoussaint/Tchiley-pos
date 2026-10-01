import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, FileText, Image as ImageIcon, Loader2, Printer, Share2 } from 'lucide-react';
import { M3_FOCUS } from '../../components/ui/focus';
import { M3StateLayer } from '../../components/ui/theme';
import { canShareFiles, exportReport, printReport, type ExportKind, type ReportInput } from './reportExport';

type Busy = 'print' | 'image' | 'pdf' | null;

/**
 * Print / share / save the report currently shown (daily, monthly or annual).
 * The exported document is built from the data (see reportExport.ts), not from the screen.
 */
export function ReportActions({ input }: { input: ReportInput }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const shareable = useMemo(() => canShareFiles(), []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(t);
  }, [error]);

  const run = async (kind: Busy, job: () => Promise<void> | void) => {
    if (busy) return;
    setOpen(false);
    setError(null);
    setBusy(kind);
    try {
      await job();
    } catch {
      setError("Export impossible. Réessayez.");
    } finally {
      setBusy(null);
    }
  };

  const doExport = (kind: ExportKind, action: 'share' | 'download') => run(kind, () => exportReport(input, kind, action));

  const items: Array<{ key: string; label: string; icon: typeof ImageIcon; onClick: () => void }> = shareable
    ? [
        { key: 'share-image', label: "Partager en image", icon: ImageIcon, onClick: () => doExport('image', 'share') },
        { key: 'share-pdf', label: 'Partager en PDF', icon: FileText, onClick: () => doExport('pdf', 'share') },
        { key: 'dl-image', label: "Télécharger l'image", icon: Download, onClick: () => doExport('image', 'download') },
        { key: 'dl-pdf', label: 'Télécharger le PDF', icon: Download, onClick: () => doExport('pdf', 'download') },
      ]
    : [
        { key: 'dl-image', label: 'Image (PNG)', icon: ImageIcon, onClick: () => doExport('image', 'download') },
        { key: 'dl-pdf', label: 'PDF', icon: FileText, onClick: () => doExport('pdf', 'download') },
      ];

  const exporting = busy === 'image' || busy === 'pdf';
  const btn = `group relative flex h-12 shrink-0 items-center justify-center gap-2 overflow-hidden rounded-full text-sm font-medium disabled:cursor-wait disabled:opacity-70 m3-press motion-reduce:transition-none ${M3_FOCUS}`;

  return (
    <div ref={rootRef} className="relative flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={() => run('print', () => printReport(input))}
        disabled={busy !== null}
        aria-label="Imprimer le rapport"
        className={`${btn} w-12 border border-[var(--m3-outline)] text-[var(--m3-on-surface)] sm:w-auto sm:px-5`}
      >
        <M3StateLayer />
        {busy === 'print' ? <Loader2 size={20} className="animate-spin" /> : <Printer size={20} />}
        <span className="hidden sm:inline">Imprimer</span>
      </button>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy !== null}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={shareable ? 'Partager ou exporter le rapport' : 'Exporter le rapport'}
        className={`${btn} bg-[var(--m3-primary)] px-4 text-[var(--m3-on-primary)] sm:px-5`}
      >
        <M3StateLayer />
        {exporting ? <Loader2 size={20} className="animate-spin" /> : <Share2 size={20} />}
        <span className="hidden sm:inline">{exporting ? 'Préparation…' : shareable ? 'Partager' : 'Exporter'}</span>
        <ChevronDown size={18} className={`transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Exporter le rapport"
          className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-[20px] bg-[var(--m3-surface-container-high)] p-2 text-[var(--m3-on-surface)] shadow-[0_4px_16px_rgba(0,0,0,0.18)]"
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                onClick={item.onClick}
                className={`group relative flex h-12 w-full items-center gap-3 overflow-hidden rounded-full px-4 text-left text-sm font-medium ${M3_FOCUS}`}
              >
                <M3StateLayer />
                <Icon size={20} className="shrink-0 text-[var(--m3-on-surface-variant)]" />
                {item.label}
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div role="status" className="absolute right-0 top-full z-40 mt-2 whitespace-nowrap rounded-xl bg-[#FFDAD6] px-3 py-2 text-xs font-medium text-[#410002] shadow">
          {error}
        </div>
      )}
    </div>
  );
}
