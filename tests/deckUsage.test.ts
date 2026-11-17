import { describe, expect, it } from "vitest";
import { copiesInDecks, deckUsage } from "@/lib/deckUsage";

const decks = [
  { id: "b", name: "Bant" },
  { id: "a", name: "Atraxa" },
];

describe("deckUsage", () => {
  it("ordnet jede Deckkarte genau einem Sammlungseintrag zu – bevorzugt denselben Druck", () => {
    const cards = [
      { id: "c21", name: "Sol Ring", scryfall_id: "s-c21", foil: false, quantity: 1 },
      { id: "cmr", name: "Sol Ring", scryfall_id: "s-cmr", foil: false, quantity: 1 },
      { id: "ltr", name: "Sol Ring", scryfall_id: "s-ltr", foil: true, quantity: 1 },
    ];
    const uses = deckUsage(
      [
        { deck_id: "a", name: "Sol Ring", scryfall_id: "s-cmr", foil: false },
        { deck_id: "b", name: "Sol Ring", scryfall_id: null },
      ],
      decks,
      cards,
    );
    expect(uses["cmr"]).toEqual([{ deckId: "a", deckName: "Atraxa", count: 1 }]);
    // ohne Druck: irgendein freier Eintrag – aber nur einer
    const others = ["c21", "ltr"].filter((id) => uses[id]);
    expect(others).toHaveLength(1);
    expect(uses[others[0]]).toEqual([{ deckId: "b", deckName: "Bant", count: 1 }]);
  });

  it("Standardländer bekommen kein Deck-Abzeichen", () => {
    const uses = deckUsage(
      [
        { deck_id: "a", name: "Forest" },
        { deck_id: "a", name: "Snow-Covered Island" },
      ],
      decks,
      [
        { id: "f", name: "Forest", quantity: 20 },
        { id: "i", name: "Snow-Covered Island", quantity: 4 },
      ],
    );
    expect(uses).toEqual({});
  });

  it("verteilt auf mehrere Einträge und zeigt Überbelegung", () => {
    const cards = [{ id: "x", name: "Arcane Signet", scryfall_id: "s1", quantity: 1 }];
    const uses = deckUsage(
      [
        { deck_id: "a", name: "Arcane Signet", scryfall_id: "s1" },
        { deck_id: "b", name: "Arcane Signet", scryfall_id: "s2" },
        { deck_id: "b", name: "Nicht da" },
      ],
      decks,
      cards,
    );
    expect(copiesInDecks(uses["x"])).toBe(2); // 1 Exemplar, 2 Decks → Hinweis in der App
    expect(Object.keys(uses)).toEqual(["x"]);
  });
});
