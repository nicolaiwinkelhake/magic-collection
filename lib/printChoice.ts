// Druck einer erkannten Karte bestimmen (rein, getestet). Statt nur das
// Artwork zu vergleichen, wird alles genutzt, was von der Karte gelesen
// werden konnte:
// - Sammlernummer und/oder Set-Kürzel aus der Infozeile – auch wenn nur eins
//   davon lesbar war, grenzt es die Drucke ein (oft schon auf genau einen)
// - Bild-Fingerabdruck (Kopf mit Rahmen, Artwork, unterer Teil) unter den
//   übrigen Drucken; bei wenigen Kandidaten genügt ein kleinerer Vorsprung
import { hamming, type CardHash } from "@/lib/imageHash";

export type PrintCand = { id: string; set?: string; collectorNumber?: string; hash?: CardHash | null };
export type PartialInfo = { set?: string | null; number?: string | null };
export type PrintChoice<T> = { best: T; by: "nummer+set" | "nummer" | "set" | "bild" } | null;

/** Sammlernummer vergleichbar machen: führende Nullen weg, nur die Ziffern ("007a" → "7"). */
export const normNumber = (n: string | null | undefined) => (n ?? "").replace(/^0+/, "").replace(/\D+$/, "").toLowerCase();

export function narrowPrints<T extends PrintCand>(prints: T[], info: PartialInfo | null | undefined): { list: T[]; by: Array<"nummer" | "set"> } {
  let list = prints;
  const by: Array<"nummer" | "set"> = [];
  const num = normNumber(info?.number);
  if (num) {
    const hit = list.filter((p) => normNumber(p.collectorNumber) === num);
    if (hit.length) {
      list = hit;
      by.push("nummer");
    }
  }
  const set = info?.set?.toLowerCase();
  if (set) {
    const hit = list.filter((p) => p.set?.toLowerCase() === set);
    if (hit.length) {
      list = hit;
      by.push("set");
    }
  }
  return { list, by };
}

/**
 * Bester Druck aus Infozeile + Bild. Liefert nur ein Ergebnis, wenn es
 * eindeutig ist; sonst null (dann bleibt der vermutete Druck stehen).
 */
export function choosePrint<T extends PrintCand>(prints: T[], camHash: CardHash | null, info?: PartialInfo | null): PrintChoice<T> {
  if (!prints.length) return null;
  const { list, by } = narrowPrints(prints, info);
  if (list.length === 1 && by.length) return { best: list[0], by: by.length === 2 ? "nummer+set" : by[0] };
  if (!camHash) return null;
  const scored = list
    .filter((p): p is T & { hash: CardHash } => !!p.hash)
    .map((p) => ({ p, d: hamming(camHash, p.hash) }))
    .sort((a, b) => a.d - b.d);
  if (!scored.length) return null;
  // eingegrenzt (Set oder Nummer passt schon) → kleinerer Vorsprung reicht
  const narrowed = by.length > 0 && list.length < prints.length;
  const maxDist = narrowed ? 72 : 60;
  const margin = narrowed ? 5 : 8;
  if (scored[0].d > maxDist) return null;
  if (scored.length > 1 && scored[1].d - scored[0].d < margin) return null;
  return { best: scored[0].p, by: "bild" };
}
