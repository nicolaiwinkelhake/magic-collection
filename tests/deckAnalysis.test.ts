import { describe, it, expect } from "vitest";
import { analyzeDeck, weakCategories, type DeckCardLike } from "@/lib/deckAnalysis";

function makeCard(partial: Partial<DeckCardLike>): DeckCardLike {
  return {
    name: partial.name ?? "Test",
    type_line: partial.type_line ?? "Creature",
    oracle_text: partial.oracle_text ?? "",
    cmc: partial.cmc ?? 2,
    colors: partial.colors ?? [],
    is_commander: partial.is_commander ?? false,
  };
}

describe("analyzeDeck", () => {
  it("zählt Länder korrekt", () => {
    const cards = [
      makeCard({ type_line: "Basic Land — Island" }),
      makeCard({ type_line: "Land" }),
      makeCard({ type_line: "Creature" }),
    ];
    const { stats } = analyzeDeck(cards, []);
    expect(stats.lands).toBe(2);
  });

  it("erkennt Removal und Ramp über den Oracle-Text", () => {
    const cards = [
      makeCard({ oracle_text: "Destroy target creature." }),
      makeCard({ oracle_text: "Exile target permanent." }),
      makeCard({ oracle_text: "Add {G}{G}." }),
    ];
    const { stats } = analyzeDeck(cards, []);
    expect(stats.removal).toBeGreaterThanOrEqual(2);
    expect(stats.ramp).toBeGreaterThanOrEqual(1);
  });

  it("meldet Farbidentitäts-Verstöße", () => {
    const cards = [
      makeCard({ name: "Illegal", colors: ["R"], type_line: "Creature" }),
    ];
    const { suggestions } = analyzeDeck(cards, ["W", "U"]);
    expect(suggestions.some((s) => s.message.includes("Farbidentität"))).toBe(true);
  });

  it("ignoriert den Commander bei der Kartenzählung der Nichtländer", () => {
    const cards = [
      makeCard({ is_commander: true, oracle_text: "Destroy target creature." }),
    ];
    const { stats } = analyzeDeck(cards, []);
    // Commander zählt nicht als Removal
    expect(stats.removal).toBe(0);
  });
});

describe("weakCategories", () => {
  it("meldet leere Kategorien als schwach", () => {
    const weak = weakCategories([makeCard({ type_line: "Creature" })]);
    expect(weak).toContain("removal");
    expect(weak).toContain("ramp");
    expect(weak).toContain("draw");
    expect(weak).toContain("wipe");
  });
});
