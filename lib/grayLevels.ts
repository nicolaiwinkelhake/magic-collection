// Helligkeit eines Graustufenbilds angleichen (rein, getestet).
// Bei wenig Licht oder dunklen Karten liegen alle Werte eng beieinander –
// Kanten und Schrift sind dann nur schwach ausgeprägt. Gestreckt wird
// zwischen zwei Perzentilen (robust gegen Rauschen und Glanzpunkte), aber
// nur wenn das Bild tatsächlich flau ist; gut belichtete Bilder bleiben
// unverändert.

export type Levels = { lo: number; hi: number; mean: number };

export function levels(g: Float32Array, loPct = 0.02, hiPct = 0.98): Levels {
  const hist = new Uint32Array(256);
  let sum = 0;
  for (let i = 0; i < g.length; i++) {
    const v = Math.max(0, Math.min(255, g[i] | 0));
    hist[v]++;
    sum += g[i];
  }
  const n = g.length || 1;
  let acc = 0;
  let lo = 0;
  let hi = 255;
  let loSet = false;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (!loSet && acc >= n * loPct) {
      lo = v;
      loSet = true;
    }
    if (acc >= n * hiPct) {
      hi = v;
      break;
    }
  }
  return { lo, hi, mean: sum / n };
}

/** Flaues Bild auf den vollen Bereich strecken (neues Array); sonst unverändert zurück. */
export function normalizeGray(g: Float32Array, minRange = 170): Float32Array {
  const { lo, hi } = levels(g);
  const range = hi - lo;
  if (range >= minRange || range < 8) return g;
  const k = 255 / range;
  const out = new Float32Array(g.length);
  for (let i = 0; i < g.length; i++) out[i] = Math.max(0, Math.min(255, (g[i] - lo) * k));
  return out;
}

/** 3×3-Mittelwert (glättet Bildrauschen bei wenig Licht, Ränder bleiben). */
export function boxBlur3(g: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(g);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      out[i] = (g[i - w - 1] + g[i - w] + g[i - w + 1] + g[i - 1] + g[i] + g[i + 1] + g[i + w - 1] + g[i + w] + g[i + w + 1]) / 9;
    }
  return out;
}

/** Für die Kantensuche: flaue (dunkle, verrauschte) Bilder erst glätten, dann strecken. */
export function prepareForEdges(g: Float32Array, w: number, h: number, minRange = 170): Float32Array {
  const { lo, hi } = levels(g);
  if (hi - lo >= minRange || hi - lo < 8) return g;
  return normalizeGray(boxBlur3(g, w, h), minRange);
}
