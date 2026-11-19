// Welche Karten aus der Sammlung eines Freundes besitze ich selbst?
// (rein, getestet) Gezählt wird je Kartenname (jede Version) und je
// genauem Druck (scryfall_id).

export type OwnRow = { name: string; scryfall_id: string | null; quantity: number | null };
export type OwnIndex = { byName: Map<string, number>; byPrint: Map<string, number> };
export type Owned = { any: number; print: number };

const key = (name: string) => name.trim().toLowerCase();

export function buildOwnIndex(rows: OwnRow[]): OwnIndex {
  const byName = new Map<string, number>();
  const byPrint = new Map<string, number>();
  for (const r of rows) {
    const q = Math.max(0, r.quantity ?? 1);
    byName.set(key(r.name), (byName.get(key(r.name)) ?? 0) + q);
    if (r.scryfall_id) byPrint.set(r.scryfall_id, (byPrint.get(r.scryfall_id) ?? 0) + q);
  }
  return { byName, byPrint };
}

export function ownedFor(index: OwnIndex, card: { name: string; scryfall_id?: string | null }): Owned {
  return {
    any: index.byName.get(key(card.name)) ?? 0,
    print: card.scryfall_id ? index.byPrint.get(card.scryfall_id) ?? 0 : 0,
  };
}

/** Kurztext für die Detailansicht. */
export function ownedText(o: Owned): string {
  if (!o.any) return "Hast du noch nicht";
  if (o.print === o.any) return `Hast du schon: ${o.any}× (genau dieser Druck)`;
  if (o.print) return `Hast du schon: ${o.any}×, davon ${o.print}× genau dieser Druck`;
  return `Hast du schon: ${o.any}× in einer anderen Version`;
}
