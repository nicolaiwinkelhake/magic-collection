// In welchen Decks steckt eine Karte? (rein, getestet) – für die Anzeige in
// der Sammlung. Gezählt wird nach Kartenname, unabhängig vom Druck: eine
// Karte im Deck belegt ein Exemplar dieser Karte in der Sammlung.

export type DeckUse = { deckId: string; deckName: string; count: number };

export function deckUsage(
  deckCards: Array<{ deck_id: string; name: string }>,
  decks: Array<{ id: string; name: string }>,
): Record<string, DeckUse[]> {
  const deckName = new Map(decks.map((d) => [d.id, d.name]));
  const byName = new Map<string, Map<string, number>>();
  for (const c of deckCards) {
    if (!deckName.has(c.deck_id)) continue;
    const perDeck = byName.get(c.name) ?? new Map<string, number>();
    perDeck.set(c.deck_id, (perDeck.get(c.deck_id) ?? 0) + 1);
    byName.set(c.name, perDeck);
  }
  const out: Record<string, DeckUse[]> = {};
  for (const [name, perDeck] of byName) {
    out[name] = Array.from(perDeck, ([deckId, count]) => ({ deckId, deckName: deckName.get(deckId)!, count })).sort((a, b) =>
      a.deckName.localeCompare(b.deckName, "de"),
    );
  }
  return out;
}

/** Wie viele Exemplare sind in Decks verbaut? */
export function copiesInDecks(uses: DeckUse[] | undefined): number {
  return (uses ?? []).reduce((s, u) => s + u.count, 0);
}
