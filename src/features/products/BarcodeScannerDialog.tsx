import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Flashlight, FlashlightOff, X } from 'lucide-react';
import { M3_FOCUS } from '../../components/ui/focus';
import { M3Loading, M3StateLayer, M3_VARS } from '../../components/ui/theme';

type DetectorLike = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type NativeDetectorCtor = {
  new (options: { formats: string[] }): DetectorLike;
  getSupportedFormats: () => Promise<string[]>;
};

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];

/* Native BarcodeDetector where it exists (Chrome/Android), otherwise the `barcode-detector` ponyfill (iOS Safari, Firefox). */
async function createDetector(): Promise<DetectorLike> {
  const Native = (window as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector;
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats();
      const formats = FORMATS.filter((format) => supported.includes(format));
      if (formats.length) return new Native({ formats });
    } catch {
      /* fall through to the ponyfill */
    }
  }
  const { BarcodeDetector } = await import('barcode-detector/ponyfill');
  return new BarcodeDetector({ formats: [...FORMATS] as never }) as unknown as DetectorLike;
}

type CameraError = 'unsupported' | 'denied' | 'unavailable';

const ERROR_TEXT: Record<CameraError, string> = {
  unsupported: "La caméra n'est pas disponible ici (un accès sécurisé https est requis). Saisissez le code ci-dessous.",
  denied: "L'accès à la caméra est refusé. Autorisez-le dans les réglages du navigateur, ou saisissez le code ci-dessous.",
  unavailable: "Impossible de démarrer la caméra. Saisissez le code ci-dessous.",
};

export function BarcodeScannerDialog({
  title = 'Scanner un code',
  onDetected,
  onClose,
}: {
  title?: string;
  onDetected: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const doneRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const [starting, setStarting] = useState(true);
  const [cameraError, setCameraError] = useState<CameraError | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [manual, setManual] = useState('');

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;

    const finish = (value: string) => {
      if (doneRef.current) return;
      doneRef.current = true;
      navigator.vibrate?.(60);
      onDetectedRef.current(value);
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('unsupported');
        setStarting(false);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (error) {
        if (cancelled) return;
        const name = (error as DOMException)?.name;
        setCameraError(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
        setStarting(false);
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      const track = stream.getVideoTracks()[0] ?? null;
      trackRef.current = track;
      const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
      setTorchAvailable(Boolean(capabilities && 'torch' in capabilities));
      try {
        await video.play();
      } catch {
        /* autoplay can be interrupted when the dialog closes quickly */
      }

      let detector: DetectorLike;
      try {
        detector = await createDetector();
      } catch {
        if (!cancelled) {
          setCameraError('unavailable');
          setStarting(false);
        }
        return;
      }
      if (cancelled) return;
      setStarting(false);

      const loop = async () => {
        if (cancelled || doneRef.current) return;
        try {
          if (video.readyState >= 2) {
            const results = await detector.detect(video);
            const value = results[0]?.rawValue?.trim();
            if (value && !cancelled) {
              finish(value);
              return;
            }
          }
        } catch {
          /* a failed frame is not fatal, try the next one */
        }
        timer = window.setTimeout(loop, 120);
      };
      void loop();
    };

    void start();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      trackRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  };

  const submitManual = () => {
    const code = manual.trim();
    if (!code || doneRef.current) return;
    doneRef.current = true;
    onDetectedRef.current(code);
  };

  const roundBtn = `group relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-black/40 text-white ${M3_FOCUS}`;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={M3_VARS}
      className="fixed inset-0 z-[100] flex flex-col bg-black text-white"
    >
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />

        <div className="absolute inset-x-0 top-0 flex items-center gap-2 px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <button type="button" onClick={onClose} aria-label="Fermer le scanner" className={roundBtn}>
            <M3StateLayer />
            <X size={22} aria-hidden="true" />
          </button>
          <h3 className="min-w-0 flex-1 truncate text-lg font-medium drop-shadow">{title}</h3>
          {torchAvailable && (
            <button
              type="button"
              onClick={toggleTorch}
              aria-pressed={torchOn}
              aria-label={torchOn ? 'Éteindre la lampe' : 'Allumer la lampe'}
              className={roundBtn}
            >
              <M3StateLayer />
              {torchOn ? <Flashlight size={22} aria-hidden="true" /> : <FlashlightOff size={22} aria-hidden="true" />}
            </button>
          )}
        </div>

        {!cameraError && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative aspect-[3/2] w-[78vw] max-w-[360px] rounded-[28px] border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
              {!starting && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-4 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-[var(--m3-primary-container)] opacity-90 motion-safe:animate-pulse"
                />
              )}
            </div>
          </div>
        )}

        {starting && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center" role="status" aria-label="Démarrage de la caméra">
            <M3Loading size={32} />
          </div>
        )}

        {cameraError && (
          <div role="alert" className="absolute inset-0 flex items-center justify-center px-8 text-center">
            <p className="max-w-sm text-base leading-6">{ERROR_TEXT[cameraError]}</p>
          </div>
        )}
      </div>

      <div className="shrink-0 rounded-t-[28px] bg-[var(--m3-surface-container-low)] px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5 text-[var(--m3-on-surface)]">
        <p className="mb-3 text-sm text-[var(--m3-on-surface-variant)]" aria-live="polite">
          {cameraError ? 'Saisie manuelle' : 'Placez le code-barres ou le QR dans le cadre.'}
        </p>
        <div className="flex items-center gap-2">
          <label className="block min-w-0 flex-1 rounded-xl bg-[var(--m3-surface)] px-4 pb-1.5 pt-2 ring-1 ring-[var(--m3-outline)] focus-within:ring-2 focus-within:ring-[var(--m3-primary)]">
            <span className="block text-xs leading-4 text-[var(--m3-on-surface-variant)]">Saisir le code</span>
            <input
              value={manual}
              onChange={(event) => setManual(event.target.value.trim())}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitManual();
              }}
              inputMode="text"
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="h-8 w-full min-w-0 bg-transparent p-0 text-base tabular-nums text-[var(--m3-on-surface)] outline-none"
            />
          </label>
          <button
            type="button"
            onClick={submitManual}
            disabled={!manual}
            className={`group relative h-12 shrink-0 overflow-hidden rounded-full bg-[var(--m3-primary)] px-6 text-sm font-medium text-[var(--m3-on-primary)] disabled:opacity-40 ${M3_FOCUS}`}
          >
            <M3StateLayer />
            Valider
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
