// In welchen Decks steckt eine Karte? (rein, getestet) – für die Anzeige in
// der Sammlung. Jede Deckkarte wird genau EINEM Sammlungseintrag zugeordnet:
// bevorzugt derselbe Druck (und Foil), sonst ein anderer Druck derselben
// Karte, solange dort noch Exemplare frei sind. So trägt nicht jeder Druck
// einer Karte das Deck-Abzeichen, nur weil irgendein Exemplar verbaut ist.
// Standardländer werden nicht zugeordnet – davon hat man meist beliebig
// viele, und im Deck stehen sie oft, ohne aus der Sammlung zu stammen.

export type DeckUse = { deckId: string; deckName: string; count: number };

type DeckCardRef = { deck_id: string; name: string; scryfall_id?: string | null; foil?: boolean | null };
type CollectionRef = { id: string; name: string; scryfall_id?: string | null; foil?: boolean | null; quantity?: number | null };

export const BASIC_LAND = /^(Snow-Covered )?(Plains|Island|Swamp|Mountain|Forest|Wastes)$/;

/** Ergebnis je Sammlungseintrag (card.id). */
export function deckUsage(deckCards: DeckCardRef[], decks: Array<{ id: string; name: string }>, cards: CollectionRef[]): Record<string, DeckUse[]> {
  const deckName = new Map(decks.map((d) => [d.id, d.name]));
  const byName = new Map<string, CollectionRef[]>();
  for (const c of cards) {
    const list = byName.get(c.name);
    if (list) list.push(c);
    else byName.set(c.name, [c]);
  }
  const used = new Map<string, number>(); // card.id → zugeordnete Exemplare
  const perCard = new Map<string, Map<string, number>>(); // card.id → deck → Anzahl
  const free = (c: CollectionRef) => Math.max(1, c.quantity ?? 1) - (used.get(c.id) ?? 0);

  // Deckkarten mit genauem Druck zuerst – sie haben den klarsten Platz
  const ordered = deckCards
    .filter((d) => deckName.has(d.deck_id) && !BASIC_LAND.test(d.name))
    .sort((a, b) => Number(!!b.scryfall_id) - Number(!!a.scryfall_id));
  for (const d of ordered) {
    const candidates = byName.get(d.name);
    if (!candidates?.length) continue; // nicht in der Sammlung
    const rank = (c: CollectionRef) =>
      (d.scryfall_id && c.scryfall_id === d.scryfall_id ? 2 : 0) + (d.foil != null && !!c.foil === !!d.foil ? 1 : 0);
    const best =
      [...candidates].filter((c) => free(c) > 0).sort((a, b) => rank(b) - rank(a))[0] ??
      // alle Exemplare schon verbaut: dem passendsten Eintrag zuordnen (zeigt den Hinweis "mehr verbaut als vorhanden")
      [...candidates].sort((a, b) => rank(b) - rank(a))[0];
    used.set(best.id, (used.get(best.id) ?? 0) + 1);
    const m = perCard.get(best.id) ?? new Map<string, number>();
    m.set(d.deck_id, (m.get(d.deck_id) ?? 0) + 1);
    perCard.set(best.id, m);
  }

  const out: Record<string, DeckUse[]> = {};
  for (const [cardId, m] of perCard) {
    out[cardId] = Array.from(m, ([deckId, count]) => ({ deckId, deckName: deckName.get(deckId)!, count })).sort((a, b) =>
      a.deckName.localeCompare(b.deckName, "de"),
    );
  }
  return out;
}

/** Wie viele Exemplare sind in Decks verbaut? */
export function copiesInDecks(uses: DeckUse[] | undefined): number {
  return (uses ?? []).reduce((s, u) => s + u.count, 0);
}
