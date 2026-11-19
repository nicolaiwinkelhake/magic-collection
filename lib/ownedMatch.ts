import { BASIC_LAND, type DeckUse } from "@/lib/deckUsage";

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

/**
 * In welchen meiner Decks steckt eine Karte mit diesem Namen (jede Version)?
 * Ergebnis je Eintrag der geteilten Sammlung. Standardländer zählen nicht.
 */
export function myDeckUses(
  friendCards: Array<{ id: string; name: string }>,
  deckCards: Array<{ deck_id: string; name: string }>,
  decks: Array<{ id: string; name: string }>,
): Record<string, DeckUse[]> {
  const deckName = new Map(decks.map((d) => [d.id, d.name]));
  const byName = new Map<string, Map<string, number>>();
  for (const d of deckCards) {
    if (!deckName.has(d.deck_id) || BASIC_LAND.test(d.name)) continue;
    const m = byName.get(key(d.name)) ?? new Map<string, number>();
    m.set(d.deck_id, (m.get(d.deck_id) ?? 0) + 1);
    byName.set(key(d.name), m);
  }
  const out: Record<string, DeckUse[]> = {};
  for (const c of friendCards) {
    const m = byName.get(key(c.name));
    if (!m) continue;
    out[c.id] = Array.from(m, ([deckId, count]) => ({ deckId, deckName: deckName.get(deckId)!, count })).sort((a, b) =>
      a.deckName.localeCompare(b.deckName, "de"),
    );
  }
  return out;
}
