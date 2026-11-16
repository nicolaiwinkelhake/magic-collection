import { describe, expect, it } from "vitest";
import { copiesInDecks, deckUsage } from "@/lib/deckUsage";

describe("deckUsage", () => {
  it("zählt Karten je Deck nach Name", () => {
    const uses = deckUsage(
      [
        { deck_id: "a", name: "Sol Ring" },
        { deck_id: "b", name: "Sol Ring" },
        { deck_id: "b", name: "Island" },
        { deck_id: "b", name: "Island" },
        { deck_id: "x", name: "Sol Ring" }, // unbekanntes Deck
      ],
      [
        { id: "b", name: "Bant" },
        { id: "a", name: "Atraxa" },
      ],
    );
    expect(uses["Sol Ring"]).toEqual([
      { deckId: "a", deckName: "Atraxa", count: 1 },
      { deckId: "b", deckName: "Bant", count: 1 },
    ]);
    expect(copiesInDecks(uses["Island"])).toBe(2);
    expect(copiesInDecks(uses["Fehlt"])).toBe(0);
  });
});
