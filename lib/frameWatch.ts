// Bildvergleich für den automatischen Scan (rein, getestet).
// Aus dem Kartenrahmen wird ein kleines Graustufen-Vorschaubild erzeugt.
// Damit lässt sich ohne Texterkennung feststellen:
//  - ob das Bild ruhig ist (Karte liegt, Hand weg) und
//  - ob seit dem letzten Scan eine andere Karte daliegt.

/** RGBA → Graustufen (0–255). */
export function toGray(rgba: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    out[j] = rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;
  }
  return out;
}

/** Mittlere absolute Abweichung zweier gleich großer Graustufenbilder (0–255). */
export function frameDiff(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || !a.length) return 255;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/** Standardabweichung der Helligkeit – leere Fläche ≈ 0, Karte mit Bild/Text deutlich mehr. */
export function contrast(a: Float32Array): number {
  if (!a.length) return 0;
  let mean = 0;
  for (const v of a) mean += v;
  mean /= a.length;
  let varSum = 0;
  for (const v of a) varSum += (v - mean) ** 2;
  return Math.sqrt(varSum / a.length);
}

export const WATCH = {
  /** darunter gilt das Bild als ruhig */
  stillDiff: 6,
  /** so viele ruhige Bilder hintereinander, bevor gelesen wird */
  stillFrames: 2,
  /** mindestens so viel Kontrast, sonst liegt keine Karte im Rahmen */
  minContrast: 22,
  /** so stark muss sich das Bild seit dem letzten Scan verändert haben */
  changedDiff: 18,
};

export type WatchState = {
  prev: Float32Array | null;
  stillCount: number;
  /** Bild beim letzten erfolgreichen Scan */
  lastScan: Float32Array | null;
  /** seit dem letzten Scan wurde die Karte gewechselt (oder weggenommen) */
  armed: boolean;
};

export const initialWatch = (): WatchState => ({ prev: null, stillCount: 0, lastScan: null, armed: true });

/** Ein Bild auswerten: neuer Zustand + ob jetzt gelesen werden soll. */
export function watchFrame(state: WatchState, frame: Float32Array): { state: WatchState; shouldScan: boolean } {
  const still = state.prev ? frameDiff(state.prev, frame) < WATCH.stillDiff : false;
  const stillCount = still ? state.stillCount + 1 : 0;
  // Nach einem Scan erst wieder scharf, wenn sich das Bild deutlich verändert hat.
  const armed = state.armed || (state.lastScan ? frameDiff(state.lastScan, frame) > WATCH.changedDiff : true);
  const shouldScan = armed && stillCount >= WATCH.stillFrames && contrast(frame) >= WATCH.minContrast;
  return { state: { ...state, prev: frame, stillCount, armed }, shouldScan };
}

/** Nach erfolgreichem Scan: dieses Bild merken und bis zum Kartenwechsel pausieren. */
export function markScanned(state: WatchState, frame: Float32Array): WatchState {
  return { ...state, lastScan: frame, armed: false, stillCount: 0 };
}
