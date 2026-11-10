// Sammlungseintrag auf einen anderen Druck bzw. Foil-Status umstellen
// (rein, getestet). Eine Zeile ist eindeutig je (Nutzer, Scryfall-ID, Foil).
// Gibt es das Ziel schon, werden die Mengen zusammengelegt statt eine
// doppelte Zeile (oder einen Fehler) zu erzeugen.

export type MovePlan =
  | { kind: "noop" }
  | { kind: "update" } // Zeile selbst umschreiben
  | { kind: "merge"; targetId: string; quantity: number }; // in vorhandene Zeile einbuchen, alte löschen

export function planMove(
  row: { id: string; scryfall_id: string; foil: boolean; quantity: number },
  target: { scryfall_id: string; foil: boolean },
  existing: { id: string; quantity: number } | null,
): MovePlan {
  if (row.scryfall_id === target.scryfall_id && row.foil === target.foil) return { kind: "noop" };
  if (existing && existing.id !== row.id) {
    return { kind: "merge", targetId: existing.id, quantity: existing.quantity + row.quantity };
  }
  return { kind: "update" };
}

/** Gehören zwei Scryfall-Drucke zur selben Karte? (oracle_id, sonst Name) */
export function samePrintFamily(
  a: { oracle_id?: string; name: string; card_faces?: { oracle_id?: string }[] },
  b: { oracle_id?: string; name: string; card_faces?: { oracle_id?: string }[] },
): boolean {
  const oa = a.oracle_id ?? a.card_faces?.[0]?.oracle_id;
  const ob = b.oracle_id ?? b.card_faces?.[0]?.oracle_id;
  if (oa && ob) return oa === ob;
  return a.name.toLowerCase() === b.name.toLowerCase();
}
