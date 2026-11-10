// Bild-Fingerabdruck zum Unterscheiden von Drucken (rein, getestet).
// Differenz-Hash (dHash): Bild auf 9×8 Felder verkleinern und je Zeile
// vergleichen, ob das nächste Feld heller ist → 64 Bit. Unempfindlich gegen
// Helligkeit, Kontrast und leichte Unschärfe, aber verschieden bei anderem
// Artwork oder Rahmen. Wir hashen drei Bereiche der Karte (Kopf mit Name
// und Rahmen, Bild, unterer Teil) – so unterscheiden sich auch Drucke mit
// gleichem Artwork, aber anderem Rahmen (Showcase, Borderless, Retro …).

export type CardHash = Uint8Array; // Bits (0/1), 3 × 64

export const HASH_REGIONS = [
  { y0: 0.0, y1: 0.15 }, // Kopf/Namensbalken/Rahmen
  { y0: 0.1, y1: 0.58 }, // Artwork
  { y0: 0.55, y1: 1.0 }, // Textbox/Rahmen unten
] as const;

/** Mittelwert eines Rechtecks (Pixelkoordinaten) im Graustufenbild. */
function boxMean(g: Float32Array, w: number, x0: number, y0: number, x1: number, y1: number): number {
  let sum = 0;
  let n = 0;
  for (let y = Math.floor(y0); y < Math.max(Math.floor(y0) + 1, Math.floor(y1)); y++) {
    for (let x = Math.floor(x0); x < Math.max(Math.floor(x0) + 1, Math.floor(x1)); x++) {
      sum += g[y * w + x];
      n++;
    }
  }
  return n ? sum / n : 0;
}

/** dHash (64 Bit) eines Bereichs (relativ 0–1) eines Graustufenbilds. */
export function dhashRegion(
  g: Float32Array,
  w: number,
  h: number,
  r: { x0?: number; x1?: number; y0: number; y1: number },
): Uint8Array {
  const x0 = (r.x0 ?? 0) * w;
  const x1 = (r.x1 ?? 1) * w;
  const y0 = r.y0 * h;
  const y1 = r.y1 * h;
  const cw = (x1 - x0) / 9;
  const ch = (y1 - y0) / 8;
  const cells: number[] = [];
  for (let j = 0; j < 8; j++)
    for (let i = 0; i < 9; i++)
      cells.push(boxMean(g, w, x0 + i * cw, y0 + j * ch, x0 + (i + 1) * cw, y0 + (j + 1) * ch));
  const bits = new Uint8Array(64);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) bits[j * 8 + i] = cells[j * 9 + i + 1] > cells[j * 9 + i] ? 1 : 0;
  return bits;
}

/** Fingerabdruck einer ganzen Karte (Bild = genau die Karte). */
export function cardHash(g: Float32Array, w: number, h: number): CardHash {
  const out = new Uint8Array(64 * HASH_REGIONS.length);
  HASH_REGIONS.forEach((r, k) => out.set(dhashRegion(g, w, h, { x0: 0.04, x1: 0.96, ...r }), k * 64));
  return out;
}

export function hamming(a: Uint8Array, b: Uint8Array): number {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) d++;
  return d + Math.abs(a.length - b.length);
}

/**
 * Bester Druck: kleinster Abstand, aber nur wenn eindeutig – nah genug
 * (maxDist von 192 Bit) und mit Vorsprung vor dem Zweitbesten (margin).
 */
export function pickBest<T extends { hash: CardHash }>(
  target: CardHash,
  candidates: T[],
  { maxDist = 60, margin = 8 }: { maxDist?: number; margin?: number } = {},
): { best: T; dist: number } | null {
  const scored = candidates.map((c) => ({ c, d: hamming(target, c.hash) })).sort((a, b) => a.d - b.d);
  if (!scored.length || scored[0].d > maxDist) return null;
  if (scored.length > 1 && scored[1].d - scored[0].d < margin) return null;
  return { best: scored[0].c, dist: scored[0].d };
}
