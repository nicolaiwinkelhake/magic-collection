// Scanner verbessern (freiwillig, im Scanner einschaltbar): Fehlschläge mit
// einem kleinen Ausschnitt der Karte speichern – was gelesen wurde und was
// richtig gewesen wäre. Damit lässt sich die Erkennung an echten Fällen prüfen
// statt an nachgebauten. Gespeichert wird nur die entzerrte Karte, kein Foto
// der Umgebung.
import type { Quad } from "@/lib/cardQuad";
import type { CardInfo } from "@/lib/ocr";
import type { ScanMatch } from "@/lib/scanStack";
import { warpToCanvas } from "@/lib/scanRead";
import { createClient } from "@/lib/supabase/client";

export type ReportKind = "miss" | "print_fix" | "list_swap";
export type ReadData = { names: string[]; info: CardInfo | null };
export type Attempt = { image: string | null; read: ReadData };

/** Druck kurz beschreiben (rein) */
export function printInfo(m: Pick<ScanMatch, "id" | "name" | "set" | "collectorNumber"> | null | undefined) {
  return m ? { id: m.id, name: m.name, set: m.set ?? null, number: m.collectorNumber ?? null } : null;
}

/** Zuletzt gemerkte Versuche je Stapel-Eintrag, begrenzt (älteste fallen raus; rein) */
export function rememberAttempt(store: Map<string, Attempt>, key: string, attempt: Attempt, max = 30): void {
  store.delete(key);
  store.set(key, attempt);
  while (store.size > max) store.delete(store.keys().next().value as string);
}

/** Karte entzerrt als kleines JPEG (Browser). Ohne erkanntes Viereck: der Rahmen-Ausschnitt. */
export function cardCrop(source: CanvasImageSource, w: number, h: number, quad: Quad): string | null {
  try {
    const c = warpToCanvas(source, w, h, quad, { x: 0, y: 0, w: 1, h: 1 }, 420, () => {});
    return c.toDataURL("image/jpeg", 0.72);
  } catch {
    return null;
  }
}

/** Meldung speichern – stillschweigend; ein Fehler hier darf das Scannen nie stören. */
export async function reportScan(kind: ReportKind, data: { read?: ReadData | null; scanned?: unknown; corrected?: unknown; image?: string | null }) {
  try {
    await createClient()
      .from("scan_reports")
      .insert({ kind, read: data.read ?? null, scanned: data.scanned ?? null, corrected: data.corrected ?? null, image: data.image ?? null });
  } catch {
    // ignorieren
  }
}
