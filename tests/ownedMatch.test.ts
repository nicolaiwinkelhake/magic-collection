import { describe, expect, it } from "vitest";
import { buildOwnIndex, myDeckUses, ownedFor, ownedText } from "@/lib/ownedMatch";

const idx = buildOwnIndex([
  { name: "Sol Ring", scryfall_id: "a", quantity: 2 },
  { name: "Sol Ring", scryfall_id: "b", quantity: 1 },
  { name: "Lightning Bolt", scryfall_id: "c", quantity: null },
]);

describe("eigene Karten in geteilter Sammlung", () => {
  it("zählt je Name und je Druck", () => {
    expect(ownedFor(idx, { name: "sol ring ", scryfall_id: "a" })).toEqual({ any: 3, print: 2 });
    expect(ownedFor(idx, { name: "Sol Ring", scryfall_id: "z" })).toEqual({ any: 3, print: 0 });
    expect(ownedFor(idx, { name: "Lightning Bolt", scryfall_id: "c" })).toEqual({ any: 1, print: 1 });
    expect(ownedFor(idx, { name: "Shock" })).toEqual({ any: 0, print: 0 });
  });
  it("Texte", () => {
    expect(ownedText({ any: 0, print: 0 })).toBe("Hast du noch nicht");
    expect(ownedText({ any: 1, print: 1 })).toBe("Hast du schon: 1× (genau dieser Druck)");
    expect(ownedText({ any: 3, print: 2 })).toBe("Hast du schon: 3×, davon 2× genau dieser Druck");
    expect(ownedText({ any: 2, print: 0 })).toBe("Hast du schon: 2× in einer anderen Version");
  });
});

describe("meine Decks in geteilter Sammlung", () => {
  it("findet Decks je Kartenname, ohne Standardländer", () => {
    const uses = myDeckUses(
      [{ id: "f1", name: "Sol Ring" }, { id: "f2", name: "Mountain" }, { id: "f3", name: "Shock" }],
      [
        { deck_id: "d1", name: "Sol Ring" },
        { deck_id: "d2", name: "sol ring" },
        { deck_id: "d2", name: "Mountain" },
      ],
      [{ id: "d1", name: "Burn" }, { id: "d2", name: "Angels" }],
    );
    expect(uses).toEqual({
      f1: [
        { deckId: "d2", deckName: "Angels", count: 1 },
        { deckId: "d1", deckName: "Burn", count: 1 },
      ],
    });
  });
});
