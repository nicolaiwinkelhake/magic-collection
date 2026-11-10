// Bild-Fingerabdrücke im Browser (Kamerabild und Druck-Bilder), gemeinsam
// genutzt von Scanner und Druck-Auswahl. Druck-Bilder kommen über den
// eigenen Durchreicher /api/card-image (gleiche Herkunft → Pixel lesbar).
import { cardHash, hamming, type CardHash } from "@/lib/imageHash";
import { toGray } from "@/lib/frameWatch";

export const HASH_W = 63; // Kartenformat 63×88
export const HASH_H = 88;

const cache = new Map<string, CardHash | null>();

export function grayOf(source: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
  return toGray(ctx.getImageData(0, 0, w, h).data);
}

/** Fingerabdruck eines Ausschnitts (z. B. der erkannten Karte im Video). */
export function hashOf(source: CanvasImageSource, sx: number, sy: number, sw: number, sh: number): CardHash {
  return cardHash(grayOf(source, sx, sy, sw, sh, HASH_W, HASH_H), HASH_W, HASH_H);
}

/** Fingerabdruck eines Drucks (je Sitzung gemerkt). */
export async function printHash(id: string, imageUrl: string | null): Promise<CardHash | null> {
  if (cache.has(id)) return cache.get(id)!;
  if (!imageUrl) return null;
  const hash = await new Promise<CardHash | null>((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      try {
        resolve(hashOf(img, 0, 0, img.naturalWidth, img.naturalHeight));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = `/api/card-image?url=${encodeURIComponent(imageUrl)}`;
  });
  cache.set(id, hash);
  return hash;
}

/** Abstände zu einem Referenzbild für viele Drucke, mit begrenzter Parallelität. */
export async function distancesTo(
  reference: CardHash,
  prints: Array<{ id: string; imageUrl: string | null }>,
  onResult: (id: string, dist: number | null) => void,
  { concurrency = 6, signal }: { concurrency?: number; signal?: { cancelled: boolean } } = {},
) {
  let next = 0;
  async function worker() {
    while (next < prints.length && !signal?.cancelled) {
      const p = prints[next++];
      const h = await printHash(p.id, p.imageUrl);
      if (!signal?.cancelled) onResult(p.id, h ? hamming(reference, h) : null);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, prints.length) }, worker));
}
