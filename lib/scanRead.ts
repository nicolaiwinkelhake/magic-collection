// Lese-Kette des Scanners (Browser): Kartenausschnitte entzerren, aufbereiten
// und per Texterkennung lesen. Eigenes Modul, damit App und Messstand
// (scripts/scan-bench) exakt denselben Code nutzen.
import type { Worker } from "tesseract.js";
import { getInfoWorker, getNameWorker } from "@/lib/ocrEngine";
import { lateStarts, nameCandidates, parseCardInfo, preprocessPixels, type CardInfo, type OcrLine, type SetPrior } from "@/lib/ocr";
import type { Rect } from "@/lib/scanGeometry";
import { quadPoint, warpArea, type Quad } from "@/lib/cardQuad";

// Bereiche relativ zur Karte: Namensbalken oben, Infozeile unten links
// (Sammlernummer, Set-Kürzel – auf Karten ab 2015).
export const NAME_AREA = { x: 0.04, y: 0.02, w: 0.8, h: 0.09 };
export const INFO_AREA = { x: 0.02, y: 0.91, w: 0.53, h: 0.08 };
export const MIN_OCR_HEIGHT = 140; // Foto/obere Bildhälfte (mehrere Zeilen)
export const INFO_OCR_HEIGHT = 72; // Infozeile: zwei kleine Zeilen
export const DETECT_W = 120; // Breite des Suchbilds für die Kartenkanten
// Lesen aus der entzerrten Karte (Messwerte: scripts/scan-bench):
// - Namensbalken großzügig ausgeschnitten (verzeiht einen leicht versetzten
//   Rahmen), unbearbeitet und im Block-Modus gelesen: Die dunklen
//   Rahmenstreifen ober-/unterhalb stören den Einzelzeilen-Modus massiv
//   (sicher gelesen: 55 % → 83 % der Testkarten).
// - Infozeile mit etwas Luft nach oben; die Auswertung nimmt die Nummer aus
//   der Zeile direkt über dem Set-Kürzel.
export const QUAD_W = 180; // Breite des Suchbilds für das Karten-Viereck
export const NAME_QUAD_AREA = { x: 0.04, y: 0, w: 0.8, h: 0.13 };
export const NAME_QUAD_HEIGHT = 60;
export const INFO_QUAD_AREA = INFO_AREA;
export const INFO_QUAD_HEIGHT = INFO_OCR_HEIGHT;

export function subArea(card: Rect, area: Rect, srcW: number, srcH: number) {
  return {
    sx: (card.x + area.x * card.w) * srcW,
    sy: (card.y + area.y * card.h) * srcH,
    sw: area.w * card.w * srcW,
    sh: area.h * card.h * srcH,
  };
}

// Bildausschnitt auf eine feste Höhe gebracht und kontrastverstärkt für die
// Texterkennung. Nicht größer als nötig: Tesseract liest am besten bei
// ~25–35 px Schrifthöhe, und jedes Pixel mehr kostet Zeit (auf dem Handy viel).
export function regionToCanvas(source: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, targetH = MIN_OCR_HEIGHT) {
  const scale = targetH / sh;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  preprocessPixels(img.data);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export async function ocrLines(canvas: HTMLCanvasElement, worker: Worker): Promise<OcrLine[]> {
  const { data } = await worker.recognize(canvas);
  const lines = (data.lines ?? []).map((l) => {
    // Beginn des ersten echten Worts (Striche/Klammern vom Rahmen davor zählen nicht)
    const word = (l.words ?? []).find((x) => (x.text.match(/[a-zA-ZÀ-ÿ]/g)?.length ?? 0) >= 3);
    const box = word?.bbox ?? l.bbox;
    return { text: l.text, confidence: l.confidence, x0: box ? box.x0 / canvas.width : undefined };
  });
  return lines.length ? lines : [{ text: data.text, confidence: data.confidence }];
}

/**
 * Bereich einer schräg/gekippt liegenden Karte entzerrt und aufbereitet für
 * die Texterkennung. `quad`: Ecken der Karte relativ zum Bild (0–1).
 */
export function warpToCanvas(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  quad: Quad,
  area: Rect,
  outH: number,
  prepare: (data: Uint8ClampedArray) => void = preprocessPixels,
): HTMLCanvasElement {
  const q = quad.map((p) => ({ x: p.x * srcW, y: p.y * srcH })) as Quad;
  const pts = [quadPoint(q, area.x, area.y), quadPoint(q, area.x + area.w, area.y), quadPoint(q, area.x + area.w, area.y + area.h), quadPoint(q, area.x, area.y + area.h)];
  const x0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x)) - 2));
  const y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y)) - 2));
  const x1 = Math.min(srcW, Math.ceil(Math.max(...pts.map((p) => p.x)) + 2));
  const y1 = Math.min(srcH, Math.ceil(Math.max(...pts.map((p) => p.y)) + 2));
  const bw = Math.max(2, x1 - x0);
  const bh = Math.max(2, y1 - y0);
  const tmp = document.createElement("canvas");
  tmp.width = bw;
  tmp.height = bh;
  const tctx = tmp.getContext("2d", { willReadFrequently: true })!;
  tctx.drawImage(source, x0, y0, bw, bh, 0, 0, bw, bh);
  const src = tctx.getImageData(0, 0, bw, bh);
  const local = q.map((p) => ({ x: p.x - x0, y: p.y - y0 })) as Quad;
  const wPx = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  const hPx = Math.hypot(pts[3].x - pts[0].x, pts[3].y - pts[0].y);
  const outW = Math.max(2, Math.round((outH * wPx) / Math.max(1, hPx)));
  const data = warpArea(src, local, area, outW, outH);
  prepare(data);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const image = canvas.getContext("2d")!.createImageData(outW, outH);
  image.data.set(data);
  canvas.getContext("2d")!.putImageData(image, 0, 0);
  return canvas;
}


/** Namensbalken bei dunklem Bild (wenig Licht, schwarze Karte): Kontrast
 *  strecken – ohne Umkehren. Helle Bilder bleiben unverändert. */
export function brightenIfDim(data: Uint8ClampedArray, dimBelow = 75): void {
  const n = data.length / 4;
  const hist = new Uint32Array(256);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    hist[g]++;
    sum += g;
  }
  if (sum / n >= dimBelow) return;
  let lo = -1;
  let hi = 255;
  for (let v = 0, acc = 0; v < 256; v++) {
    acc += hist[v];
    if (lo < 0 && acc > n * 0.01) lo = v;
    if (acc >= n * 0.99) {
      hi = v;
      break;
    }
  }
  lo = Math.max(0, lo);
  const k = 255 / Math.max(8, hi - lo);
  for (let i = 0; i < data.length; i += 4) {
    const g = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] - lo) * k;
    data[i] = data[i + 1] = data[i + 2] = g;
  }
}

export type NameLines = {
  /** Lesarten, beste zuerst */
  names: string[];
  /** Lesarten (klein), die zu weit rechts beginnen – vermutlich fehlt der Anfang */
  late: Set<string>;
};

/** Namensbalken der entzerrten Karte lesen. */
export async function readName(source: CanvasImageSource, w: number, h: number, quad: Quad, worker?: Worker, brighten = false): Promise<NameLines> {
  // normal unbearbeitet (liest am besten); als Zusatzversuch bei dunklem Bild aufgehellt
  const canvas = warpToCanvas(source, w, h, quad, NAME_QUAD_AREA, NAME_QUAD_HEIGHT, brighten ? brightenIfDim : () => {});
  const lines = await ocrLines(canvas, worker ?? (await getNameWorker()));
  return { names: nameCandidates(lines), late: lateStarts(lines) };
}

/** Infozeile (Set, Nummer, Sprache) der entzerrten Karte lesen. */
export async function readInfo(source: CanvasImageSource, w: number, h: number, quad: Quad, sets?: SetPrior): Promise<CardInfo | null> {
  const canvas = warpToCanvas(source, w, h, quad, INFO_QUAD_AREA, INFO_QUAD_HEIGHT);
  const lines = await ocrLines(canvas, await getInfoWorker());
  const info = parseCardInfo(lines.map((l) => l.text).join("\n"), sets);
  return info.set || info.number ? info : null;
}

export function rectToQuad(r: Rect): Quad {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}
