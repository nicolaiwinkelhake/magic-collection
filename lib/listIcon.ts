// „The List“ erkennen: Diese Nachdrucke tragen unten links Set-Code und Nummer
// des Originals (z. B. „MKM 94“) – und ganz links ein kleines Planeswalker-
// Symbol (bei alten Rahmen in einer schwarzen Ausbuchtung). Der Scanner liest
// „MKM 94“ und hielte die Karte sonst für das Original.
//
// Erkennung per Bildvergleich: Die linke untere Ecke beider Drucke (Scryfall-
// Bilder) dient als Vorlage; im Kamerabild wird ein etwas größerer Bereich
// durchsucht, weil die erkannten Kartenkanten um einige Prozent danebenliegen
// können – mehr als das Symbol breit ist. Die besser passende Vorlage gewinnt.
import type { Quad } from "@/lib/cardQuad";
import type { Rect } from "@/lib/scanGeometry";
import { warpToCanvas } from "@/lib/scanRead";

/** Ausschnitt um das Symbol (Anteile der Karte) – so wird die Vorlage aus dem Kartenbild genommen */
export const LIST_STRIP_AREA: Rect = { x: 0.018, y: 0.91, w: 0.07, h: 0.065 };
/** Zusätzlicher Rand des Suchbereichs im Kamerabild (Anteile der Karte) */
export const SEARCH_MARGIN = { x: 0.03, y: 0.025 };
export const STRIP_W = 20;
export const STRIP_H = 40;
/** Mindestabstand der Übereinstimmungen für eine sichere Entscheidung (Messbank) */
export const LIST_MARGIN = 0.15;

const lumOf = (rgba: ArrayLike<number>, i: number) => 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];

/** Vorlage: Graustufen STRIP_W×STRIP_H (RGBA) → mittelwertfrei, auf Länge 1 normiert (rein). */
export function stripDescriptor(rgba: ArrayLike<number>): Float32Array {
  const n = STRIP_W * STRIP_H;
  const out = new Float32Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) {
    out[i] = lumOf(rgba, i);
    mean += out[i];
  }
  mean /= n;
  let norm = 0;
  for (let i = 0; i < n; i++) {
    out[i] -= mean;
    norm += out[i] * out[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < n; i++) out[i] /= norm;
  return out;
}

/** Größe des Suchbereichs in Pixeln (gleicher Maßstab wie die Vorlage) */
export function regionSize(area: Rect = LIST_STRIP_AREA): { w: number; h: number } {
  return {
    w: Math.round((STRIP_W * (area.w + 2 * SEARCH_MARGIN.x)) / area.w),
    h: Math.round((STRIP_H * (area.h + 2 * SEARCH_MARGIN.y)) / area.h),
  };
}

export type SearchRegion = { gray: Float32Array; w: number; h: number };

/** RGBA des Suchbereichs → Graustufen (rein) */
export function regionFrom(rgba: ArrayLike<number>, w: number, h: number): SearchRegion {
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = lumOf(rgba, i);
  return { gray, w, h };
}

/** Beste Übereinstimmung der Vorlage irgendwo im Suchbereich (normierte Korrelation, −1…1; rein). */
export function matchTemplate(region: SearchRegion, tmpl: Float32Array): number {
  const { gray, w, h } = region;
  const n = STRIP_W * STRIP_H;
  let best = -1;
  for (let oy = 0; oy + STRIP_H <= h; oy++) {
    for (let ox = 0; ox + STRIP_W <= w; ox++) {
      let sum = 0;
      let sq = 0;
      let dot = 0;
      for (let y = 0; y < STRIP_H; y++) {
        const row = (oy + y) * w + ox;
        for (let x = 0; x < STRIP_W; x++) {
          const v = gray[row + x];
          sum += v;
          sq += v * v;
          dot += v * tmpl[y * STRIP_W + x];
        }
      }
      // Vorlage ist mittelwertfrei: dot ist die Kovarianz; durch die Streuung des Fensters teilen
      const varSum = sq - (sum * sum) / n;
      const c = varSum > 1e-6 ? dot / Math.sqrt(varSum) : -1;
      if (c > best) best = c;
    }
  }
  return best;
}

export type ListVerdict = "list" | "orig" | "unclear";

/** Welchem Druck ähnelt die Ecke im Kamerabild mehr? (rein) */
export function listVerdict(region: SearchRegion, list: Float32Array, orig: Float32Array, margin = LIST_MARGIN): { verdict: ListVerdict; diff: number } {
  const diff = matchTemplate(region, list) - matchTemplate(region, orig);
  return { verdict: diff >= margin ? "list" : diff <= -margin ? "orig" : "unclear", diff };
}

/** Vorlage aus einem Kartenbild (Browser). */
export function readStrip(source: CanvasImageSource, w: number, h: number, quad: Quad, area: Rect = LIST_STRIP_AREA): Float32Array {
  const warped = warpToCanvas(source, w, h, quad, area, STRIP_H * 2, () => {});
  const small = document.createElement("canvas");
  small.width = STRIP_W;
  small.height = STRIP_H;
  const ctx = small.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(warped, 0, 0, STRIP_W, STRIP_H);
  return stripDescriptor(ctx.getImageData(0, 0, STRIP_W, STRIP_H).data);
}

/** Suchbereich im Kamerabild (Browser). */
export function readRegion(source: CanvasImageSource, w: number, h: number, quad: Quad, area: Rect = LIST_STRIP_AREA): SearchRegion {
  const size = regionSize(area);
  const big: Rect = { x: area.x - SEARCH_MARGIN.x, y: area.y - SEARCH_MARGIN.y, w: area.w + 2 * SEARCH_MARGIN.x, h: area.h + 2 * SEARCH_MARGIN.y };
  const warped = warpToCanvas(source, w, h, quad, big, size.h * 2, () => {});
  const small = document.createElement("canvas");
  small.width = size.w;
  small.height = size.h;
  const ctx = small.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(warped, 0, 0, size.w, size.h);
  return regionFrom(ctx.getImageData(0, 0, size.w, size.h).data, size.w, size.h);
}

export const WHOLE_CARD: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

const refs = new Map<string, Promise<Float32Array | null>>();

/** Vorlage eines Drucks aus seinem Scryfall-Bild (je Sitzung gemerkt, über den eigenen Bild-Proxy). */
export function referenceStrip(id: string, imageUrl: string | null): Promise<Float32Array | null> {
  if (!imageUrl) return Promise.resolve(null);
  if (!refs.has(id)) {
    refs.set(
      id,
      new Promise((resolve) => {
        const img = new window.Image();
        img.onload = () => {
          try {
            resolve(readStrip(img, img.naturalWidth, img.naturalHeight, WHOLE_CARD));
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = `/api/card-image?url=${encodeURIComponent(imageUrl)}`;
      }),
    );
  }
  return refs.get(id)!;
}
