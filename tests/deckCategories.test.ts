import { describe, it, expect } from "vitest";
import {
  categorizeCard,
  categorizeDeck,
  type CategorizableCard,
} from "@/lib/deckCategories";

function c(p: Partial<CategorizableCard>): CategorizableCard {
  return {
    name: p.name ?? "Test",
    type_line: p.type_line ?? "Creature",
    oracle_text: p.oracle_text ?? "",
    cmc: p.cmc ?? 2,
    is_commander: p.is_commander ?? false,
  };
}

describe("categorizeCard", () => {
  it("erkennt den Commander", () => {
    expect(categorizeCard(c({ is_commander: true }))).toBe("Commander");
  });
  it("erkennt Länder", () => {
    expect(categorizeCard(c({ type_line: "Basic Land — Island" }))).toBe("Länder");
  });
  it("erkennt Board Wipe vor Removal (Priorität)", () => {
    expect(categorizeCard(c({ oracle_text: "Destroy all creatures." }))).toBe(
      "Board Wipe"
    );
  });
  it("erkennt Removal", () => {
    expect(categorizeCard(c({ oracle_text: "Destroy target creature." }))).toBe(
      "Removal"
    );
  });
  it("erkennt Ramp", () => {
    expect(categorizeCard(c({ oracle_text: "Add {G}{G}." }))).toBe("Ramp");
  });
  it("fällt auf Kreaturen und Sonstiges zurück", () => {
    expect(categorizeCard(c({ type_line: "Creature — Elf" }))).toBe("Kreaturen");
    expect(categorizeCard(c({ type_line: "Artifact" }))).toBe("Sonstiges");
  });
});

describe("categorizeDeck", () => {
  it("teilt alle Karten genau einer Kategorie zu (Summe = Deckgröße)", () => {
    const cards = [
      c({ is_commander: true }),
      c({ type_line: "Land" }),
      c({ oracle_text: "Destroy all creatures." }),
      c({ oracle_text: "Destroy target creature." }),
      c({ oracle_text: "Add {G}." }),
      c({ oracle_text: "Draw a card." }),
      c({ type_line: "Creature — Elf" }),
      c({ type_line: "Enchantment" }),
    ];
    const groups = categorizeDeck(cards);
    const total = groups.reduce((s, g) => s + g.cards.length, 0);
    expect(total).toBe(cards.length);
  });

  it("hält die vorgegebene Kategorie-Reihenfolge ein", () => {
    const groups = categorizeDeck([
      c({ type_line: "Creature — Elf" }),
      c({ is_commander: true }),
      c({ type_line: "Land" }),
    ]);
    expect(groups.map((g) => g.category)).toEqual([
      "Commander",
      "Länder",
      "Kreaturen",
    ]);
  });
});
